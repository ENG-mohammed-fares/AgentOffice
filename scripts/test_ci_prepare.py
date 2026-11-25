"""Regression tests for the immutable source archive and independent release version."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile


SCRIPT = Path(__file__).with_name("ci-prepare.py")
REQUIRED = (
    "electron/main.cjs", "electron/auth.cjs", "electron/identity.cjs",
    "electron/update-policy.cjs", "src/auth-screen.html",
    "scripts/identity.test.cjs", "scripts/auth-smoke.cjs",
    "electron-builder.config.cjs",
)


class PrepareSourceTests(unittest.TestCase):
    def run_prepare(self, release_version, baseline_version="1.6.6"):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            scripts = root / "scripts"
            scripts.mkdir()
            (scripts / SCRIPT.name).write_bytes(SCRIPT.read_bytes())
            (root / "release-version.txt").write_text(release_version + "\n", encoding="utf-8")
            with zipfile.ZipFile(root / "AgentOffice-Source.zip", "w") as archive:
                archive.writestr("package.json", '{"version":"' + baseline_version + '"}')
                for name in REQUIRED:
                    archive.writestr(name, "fixture")
            result = subprocess.run(
                [sys.executable, str(scripts / SCRIPT.name)],
                cwd=root, capture_output=True, text=True, check=False,
            )
            return result.returncode, result.stdout + result.stderr, (root / "app/package.json").exists()

    def test_new_release_version_keeps_verified_source_baseline(self):
        for version in ("1.6.16", "1.7.0"):
            with self.subTest(version=version):
                code, output, extracted = self.run_prepare(version)
                self.assertEqual(code, 0, output)
                self.assertTrue(extracted)
                self.assertIn("1.6.6 baseline for " + version, output)

    def test_changed_source_baseline_and_invalid_release_are_rejected(self):
        for version, baseline in (("1.6.16", "1.6.7"), ("not-a-version", "1.6.6")):
            with self.subTest(version=version, baseline=baseline):
                code, _, extracted = self.run_prepare(version, baseline)
                self.assertNotEqual(code, 0)
                self.assertFalse(extracted)


if __name__ == "__main__":
    unittest.main()
