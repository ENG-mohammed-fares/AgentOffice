import hashlib
import json
import struct
import tempfile
import unittest
from pathlib import Path

from character_assets import CLIPS, stage_characters, validate_model


def glb(**changes):
    model = {"skins": [{}], "animations": [{"name": name} for name in sorted(CLIPS)]}
    model.update(changes)
    raw = json.dumps(model).encode()
    raw += b" " * (-len(raw) % 4)
    return struct.pack("<4sIII4s", b"glTF", 2, 20 + len(raw), len(raw), b"JSON") + raw


class CharacterAssetsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.assets = Path(self.temp.name)
        self.source = self.assets / "characters"
        self.target = self.assets / "output"
        self.source.mkdir()
        self.entries = []
        for index, letter in enumerate("abcdefg"):
            name = f"character-{letter}.glb"
            data = glb()
            (self.source / name).write_bytes(data)
            self.entries.append({"file": name, "role": letter, "station": index,
                                 "sha256": hashlib.sha256(data).hexdigest()})
        self.write_manifest()

    def write_manifest(self):
        (self.assets / "character-roster.json").write_text(json.dumps(self.entries))
        (self.source / "manifest.json").write_text(json.dumps({"characters": self.entries}))

    def test_stage_and_replace(self):
        self.target.mkdir()
        (self.target / "stale").touch()
        self.assertEqual(len(stage_characters(self.assets, self.target)), 7)
        self.assertEqual(len(list(self.target.iterdir())), 7)
        self.assertFalse((self.target / "stale").exists())

    def test_no_source_clears_stale(self):
        import shutil
        shutil.rmtree(self.source)
        self.target.mkdir()
        self.assertEqual(stage_characters(self.assets, self.target), [])
        self.assertFalse(self.target.exists())
        self.assertEqual(stage_characters(self.assets, self.target), [])

    def test_invalid_roster_and_path(self):
        for field, value in (("file", "../escape.glb"), ("file", self.entries[1]["file"]),
                             ("role", self.entries[1]["role"]), ("station", 8),
                             ("station", 1), ("sha256", "invalid")):
            with self.subTest(field=field, value=value):
                old = self.entries[0][field]
                self.entries[0][field] = value
                self.write_manifest()
                with self.assertRaises(ValueError):
                    stage_characters(self.assets, self.target)
                self.entries[0][field] = old
        self.write_manifest()

    def test_tampering_preserves_previous_candidate(self):
        self.target.mkdir()
        (self.target / "old").touch()
        (self.source / self.entries[0]["file"]).write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            stage_characters(self.assets, self.target)
        self.assertTrue((self.target / "old").exists())

    def test_missing_file(self):
        (self.source / self.entries[0]["file"]).unlink()
        with self.assertRaisesRegex(ValueError, "regular file"):
            stage_characters(self.assets, self.target)

    def test_invalid_glb(self):
        for data in (b"", b"x" * 40, glb(skins=[]), glb(animations=[]),
                     glb(images=[{"uri": "https://example.invalid/texture"}]),
                     glb(buffers=[{"uri": "file:///secret"}])):
            with self.subTest(data=data[:20]):
                with self.assertRaises(ValueError):
                    validate_model(data)
        validate_model(glb())


if __name__ == "__main__":
    unittest.main()
