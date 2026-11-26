"""Regression guard for the literal dependency download commands in our CI."""
from pathlib import Path
import re
import shlex
import unittest


def violations(text):
    results = []
    for line_no, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if line.startswith("run: "):
            line = line[5:]
        if re.match(r"^python(?:3)?\s+-m\s+pip\s+install(?:\s|$)", line):
            args = shlex.split(line, posix=True)
            if "--only-binary" not in args or args.index("--only-binary") + 1 >= len(args) or args[args.index("--only-binary") + 1] != ":all:":
                results.append((line_no, "pip must require binary distributions"))
            if "--no-binary" in args or any(arg.startswith("--no-binary=") for arg in args):
                results.append((line_no, "pip must not override the binary-only rule"))
        elif re.match(r"^curl(?:\s|$)", line):
            args = shlex.split(line, posix=True)
            for option in ("--proto", "--proto-redir"):
                if option not in args or args.index(option) + 1 >= len(args) or args[args.index(option) + 1] != "=https":
                    results.append((line_no, option + " must be restricted to HTTPS"))
            if "-k" in args or "--insecure" in args:
                results.append((line_no, "TLS verification must remain enabled"))
    return results


class WorkflowDownloadPolicy(unittest.TestCase):
    def test_tracked_workflows(self):
        workflows = Path(__file__).resolve().parents[1] / ".github" / "workflows"
        paths = sorted(workflows.glob("*.yml")) + sorted(workflows.glob("*.yaml"))
        self.assertTrue(paths)
        for path in paths:
            with self.subTest(path=path.name):
                self.assertEqual(violations(path.read_text(encoding="utf-8")), [])

    def test_original_insecure_forms_are_rejected(self):
        self.assertTrue(violations("curl --location https://example.com/file"))
        self.assertTrue(violations("run: python -m pip install setuptools==80.9.0"))
        self.assertTrue(violations("curl --proto '=https' --location https://example.com/file"))
        self.assertTrue(violations("curl --proto '=https' --proto-redir '=https' --insecure https://example.com/file"))
        self.assertTrue(violations("python -m pip install --only-binary :all: --no-binary=package package"))

    def test_hardened_forms_pass(self):
        self.assertEqual(violations("curl --proto '=https' --proto-redir '=https' -fL https://example.com/file"), [])
        self.assertEqual(violations("run: python -m pip install --only-binary :all: package==1.0"), [])


if __name__ == "__main__":
    unittest.main()
