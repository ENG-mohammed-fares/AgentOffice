"""Regression tests for real release metadata and candidate verification."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


feed = load("update_feed", "verify-update-feed.py")
candidate = load("release_candidate", "release-candidate.py")
GOOD = "provider: github\nowner: ENG-mohammed-fares\nrepo: AgentOffice-Releases\n"


class FeedTests(unittest.TestCase):
    def test_valid_public_feed(self):
        feed.validate(GOOD)
        feed.validate(GOOD.replace("github", "'github'"))

    def test_invalid_fields(self):
        for text in (
            GOOD.replace("repo: AgentOffice-Releases", "repo: AgentOffice"),
            GOOD + "repo: AgentOffice\n",
            GOOD.replace("provider: github", "provider:\ngithub"),
            GOOD.replace("owner: ENG-mohammed-fares\n", ""),
            GOOD + "private: false\n",
            GOOD + "requestHeaders:\n",
            GOOD + "TOKEN: placeholder\n",
            GOOD + "  authorization: placeholder\n",
        ):
            with self.subTest(text=text), self.assertRaises(RuntimeError):
                feed.validate(text)


class CandidateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.dest = self.root / "candidate"
        self.version = "1.6.15"
        self.source = self.root / "app" / "release"
        self.source.mkdir(parents=True)
        self.exe = "AgentOffice-Setup-" + self.version + "-x64.exe"
        self.payload = b"fixture installer bytes"
        (self.source / self.exe).write_bytes(self.payload)
        (self.source / (self.exe + ".blockmap")).write_bytes(b"fixture blockmap")
        sha = base64.b64encode(hashlib.sha512(self.payload).digest()).decode("ascii")
        self.metadata = f"version: {self.version}\npath: {self.exe}\nsha512: {sha}\n"
        (self.source / "latest.yml").write_text(self.metadata, encoding="utf-8")
        (self.root / "ci-lock-present.txt").write_text("true", encoding="utf-8")
        env = {"GITHUB_SHA": "fixture-commit", "GITHUB_RUN_ID": "42",
               "GITHUB_REF": "refs/heads/development", "EXPECTED_VERSION": self.version,
               "EXPECTED_RUN_ID": "42"}
        for p in (patch.multiple(candidate, ROOT=self.root, DEST=self.dest, VERSION=self.version),
                  patch.dict(os.environ, env)):
            p.start()
            self.addCleanup(p.stop)

    def test_valid_candidate(self):
        self.assertEqual(len(candidate.assets(self.source, self.version)), 3)
        candidate.create()
        candidate.verify()

    def test_reject_ambiguous_metadata(self):
        for text in (self.metadata + "path: other.exe\n",
                     self.metadata + "version: 9.9.9\n",
                     self.metadata + "sha512: wrong\n",
                     self.metadata.replace("version: ", "version:\n")):
            with self.subTest(text=text):
                (self.source / "latest.yml").write_text(text, encoding="utf-8")
                with self.assertRaises(RuntimeError):
                    candidate.assets(self.source, self.version)

    def test_reject_wrong_hash_or_missing_asset(self):
        (self.source / self.exe).write_bytes(b"modified")
        with self.assertRaises(RuntimeError):
            candidate.assets(self.source, self.version)
        (self.source / self.exe).unlink()
        with self.assertRaises(RuntimeError):
            candidate.assets(self.source, self.version)

    def test_reject_wrong_provenance_extra_file_and_tampering(self):
        candidate.create()
        manifest_path = self.dest / "manifest.json"
        original = json.loads(manifest_path.read_text(encoding="utf-8"))
        for key, value in (("commit", "wrong"), ("locked", False), ("ref", "other"), ("version", "9.9.9")):
            with self.subTest(key=key):
                manifest_path.write_text(json.dumps(dict(original, **{key: value})), encoding="utf-8")
                with self.assertRaises(RuntimeError):
                    candidate.verify()
        manifest_path.write_text(json.dumps(original), encoding="utf-8")
        extra = self.dest / "unexpected.zip"
        extra.write_bytes(b"fixture")
        with self.assertRaises(RuntimeError):
            candidate.verify()
        extra.unlink()
        (self.dest / (self.exe + ".blockmap")).write_bytes(b"tampered")
        with self.assertRaises(RuntimeError):
            candidate.verify()


if __name__ == "__main__":
    unittest.main()
