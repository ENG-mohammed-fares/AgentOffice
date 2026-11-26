"""Exercise the real overlay installer against isolated source fixtures."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location("apply_crash_monitor", Path(__file__).with_name("apply-crash-monitor.py"))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
HOOK = "require('./crash-monitor.cjs').installCrashMonitor({app:require('electron').app});"


class CrashInstallationTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.app = self.root / "app"
        self.entry = self.app / "electron" / "main.cjs"
        self.entry.parent.mkdir(parents=True)
        (self.app / "scripts").mkdir()
        (self.app / "package.json").write_text(json.dumps({"main": "electron/main.cjs"}))
        self.assets = self.root / "assets" / "crash-monitor"
        self.assets.mkdir(parents=True)
        for name in ("crash-monitor.cjs", "crash-monitor.test.cjs", "crash-monitor-smoke.cjs"):
            (self.assets / name).write_text("// " + name)

    def test_preserves_shebang_and_strict_mode_and_copies_files(self):
        self.entry.write_text("#!/usr/bin/env node\n'use strict';\nstart();\n")
        installer.install(self.root)
        actual = self.entry.read_text()
        self.assertTrue(actual.startswith("#!/usr/bin/env node\n'use strict';"))
        self.assertEqual(actual.count(HOOK), 1)
        self.assertTrue(actual.endswith("\nstart();\n"))
        for path in (self.app / "electron/crash-monitor.cjs",
                     self.app / "scripts/crash-monitor.test.cjs",
                     self.app / "scripts/crash-monitor-smoke.cjs"):
            self.assertEqual(path.read_bytes(), (self.assets / path.name).read_bytes())
        with self.assertRaisesRegex(RuntimeError, "already installed"):
            installer.install(self.root)
        self.assertEqual(self.entry.read_text(), actual)

    def test_plain_entry(self):
        self.entry.write_text("start();\n")
        installer.install(self.root)
        self.assertTrue(self.entry.read_text().startswith("\n" + HOOK))

    def test_reject_wrong_entry_and_missing_file(self):
        with self.assertRaisesRegex(RuntimeError, "Missing Electron entry"):
            installer.install(self.root)
        self.entry.write_text("start();\n")
        (self.app / "package.json").write_text(json.dumps({"main": "other.cjs"}))
        with self.assertRaisesRegex(RuntimeError, "Unexpected Electron entry"):
            installer.install(self.root)
        self.assertEqual(self.entry.read_text(), "start();\n")


if __name__ == "__main__":
    unittest.main()
