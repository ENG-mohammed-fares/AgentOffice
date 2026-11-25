"""Verify quality fixes against the real immutable baseline and approved overlays."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("quality_fixes", ROOT / "scripts/apply-quality-fixes.py")
quality = importlib.util.module_from_spec(spec)
spec.loader.exec_module(quality)


class QualityInstallation(unittest.TestCase):
    def prepare(self, root):
        shutil.copytree(ROOT / "assets", root / "assets")
        shutil.copytree(ROOT / "scripts", root / "scripts",
                        ignore=shutil.ignore_patterns("node_modules", "__pycache__"))
        with zipfile.ZipFile(ROOT / "AgentOffice-Source.zip") as archive:
            archive.extractall(root / "app")
        shutil.copyfile(ROOT / "release-version.txt", root / "release-version.txt")
        package = root / "app/package.json"
        data = json.loads(package.read_text(encoding="utf-8"))
        data["version"] = (ROOT / "release-version.txt").read_text().strip()
        package.write_text(json.dumps(data), encoding="utf-8")
        result = subprocess.run([sys.executable, str(root / "scripts/apply-auth.py")],
                                capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        shutil.copyfile(root / "assets/agile-office/main.js", root / "app/src/main.js")

    def test_real_overlay_fixes_preserve_authentication_and_security(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.prepare(root)
            intro = root / "app/src/loading-intro.html"
            canonical = intro.read_text(encoding="utf-8")
            self.assertIn('<html lang="en">', canonical)
            quality.apply(root)
            self.assertEqual(intro.read_text(encoding="utf-8"), canonical)
            main = (root / "app/electron/main.cjs").read_text(encoding="utf-8")
            self.assertIn("sandbox: true", main)
            self.assertIn("webSecurity: true", main)
            self.assertIn("nodeIntegration: false", main)
            self.assertIn("Window load failed:", main)
            self.assertNotIn("if(result?.downloadPromise)", main)
            startup = (root / "app/electron/startup-update.html").read_text(encoding="utf-8")
            self.assertNotIn("unsafe-inline", startup)
            self.assertIn("style-src 'self'", startup)
            self.assertTrue((root / "app/electron/startup-update.css").is_file())
            self.assertFalse((root / "app/src/studio.js").exists())
            auth = (root / "app/src/auth-screen.html").read_text(encoding="utf-8")
            self.assertIn('for="remember-email"', auth)
            self.assertIn('id="remember-email"', auth)
            self.assertNotIn('id="phonePanel"', auth)
            smoke = (root / "app/scripts/auth-smoke.cjs").read_text(encoding="utf-8")
            self.assertIn("await finishCoverage()", smoke)
            self.assertNotIn("finishCoverage", main)
            with self.assertRaisesRegex(RuntimeError, "anchor mismatch"):
                quality.apply(root)


if __name__ == "__main__":
    unittest.main()
