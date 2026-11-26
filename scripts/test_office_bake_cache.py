"""Regression checks for exact-input Blender cache verification."""

import json
import io
import xml.etree.ElementTree as ET
import tempfile
import unittest
from pathlib import Path

from unittest.mock import patch

from office_bake_cache import (MANIFEST, input_identity, output_files, source_paths,
                               main, tool_identity, validate_outputs, verify_manifest,
                               write_manifest)


class BakeCacheTests(unittest.TestCase):
    """Reject stale inputs and corrupted outputs instead of trusting cache hits."""

    def test_cache_rejects_changed_inputs_and_tampered_outputs(self):
        """Only identical source, tool and output bytes can satisfy verification."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "scene.py"
            source.write_text("original", encoding="utf-8")
            (root / "compressed").mkdir()
            (root / "office-candidates").mkdir()
            (root / "compressed/office-bake-coverage.xml").write_text("<coverage/>", encoding="utf-8")
            report = {"status": "review_only", "mode": "combined", "baked_nodes": ["Wall"],
                      "original": {"triangles": 12}, "candidate": {"triangles": 12}}
            (root / "office-candidates/bake-report.json").write_text(json.dumps(report), encoding="utf-8")
            for index in range(3):
                (root / f"office-candidates/view-{index}.png").write_bytes(
                    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + (1920).to_bytes(4, "big")
                    + (1080).to_bytes(4, "big"))
            identity = input_identity(root, [Path("scene.py")], "blender-version-a")
            write_manifest(root, identity)
            verify_manifest(root, identity)
            self.assertNotEqual(identity, input_identity(root, [Path("scene.py")], "blender-version-b"))
            source.write_text("modified", encoding="utf-8")
            changed = input_identity(root, [Path("scene.py")], "blender-version-a")
            with self.assertRaisesRegex(ValueError, "source or toolchain"):
                verify_manifest(root, changed)
            (root / "office-candidates/view-0.png").write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "output changed"):
                verify_manifest(root, identity)
            self.assertTrue((root / MANIFEST).exists())

    def test_missing_and_unsafe_outputs_are_rejected(self):
        """A cache must contain complete, ordinary files and valid bake evidence."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "office-candidates").mkdir()
            (root / "compressed").mkdir()
            with self.assertRaisesRegex(ValueError, "non-file|Required"):
                output_files(root)
            (root / "office-candidates/linked").symlink_to(root / "compressed")
            with self.assertRaisesRegex(ValueError, "symbolic link"):
                output_files(root)

    def test_report_rejects_movables_and_invalid_coverage(self):
        """Digest checks alone do not establish a usable review artifact."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "office-candidates").mkdir()
            (root / "compressed").mkdir()
            (root / "compressed/office-bake-coverage.xml").write_text("<coverage/>", encoding="utf-8")
            report = {"status": "review_only", "mode": "combined", "baked_nodes": ["Chair_1"],
                      "original": {"triangles": 12}, "candidate": {"triangles": 12}}
            (root / "office-candidates/bake-report.json").write_text(json.dumps(report), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Movable chair"):
                validate_outputs(root)
            report["baked_nodes"] = ["Wall"]
            (root / "office-candidates/bake-report.json").write_text(json.dumps(report), encoding="utf-8")
            (root / "compressed/office-bake-coverage.xml").write_text("broken", encoding="utf-8")
            with self.assertRaises(Exception):
                validate_outputs(root)

    def test_source_and_tool_key_include_canonical_inputs(self):
        """Versioned files and the executable identity affect cache reuse."""
        root = Path(__file__).resolve().parents[1]
        self.assertIn(Path("scripts/office_bake_cache.py"), source_paths(root))
        with tempfile.TemporaryDirectory() as directory:
            binary = Path(directory) / "blender"
            binary.write_bytes(b"fake-blender")
            with patch("office_bake_cache.shutil.which", return_value=str(binary)), patch(
                    "office_bake_cache.subprocess.check_output", return_value="blender=1\n"):
                with patch.dict("office_bake_cache.os.environ", {"ImageVersion": "runner-a"}):
                    first = tool_identity()
                with patch.dict("office_bake_cache.os.environ", {"ImageVersion": "runner-b"}):
                    second = tool_identity()
            self.assertNotEqual(first, second)
            with self.assertRaisesRegex(ValueError, "Missing or unsafe"):
                input_identity(Path(directory), [Path("missing")], first)

    def test_invalid_report_preview_and_inventory(self):
        """Valid XML, geometry, native preview headers and exact inventory are required."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "compressed").mkdir()
            (root / "office-candidates").mkdir()
            (root / "compressed/office-bake-coverage.xml").write_text("<coverage/>")
            report_file = root / "office-candidates/bake-report.json"
            report = {"status": "review_only", "mode": "combined", "baked_nodes": ["Wall"],
                      "original": {"triangles": 1}, "candidate": {"triangles": 1}}
            for index in range(3):
                (root / f"office-candidates/view-{index}.png").write_bytes(
                    bytes.fromhex("89504e470d0a1a0a0000000d49484452") +
                    (1920).to_bytes(4, "big") + (1080).to_bytes(4, "big"))
            for update, message in (({"status": "production"}, "Unexpected"),
                                    ({"baked_nodes": []}, "geometry"),
                                    ({"candidate": {"triangles": 2}}, "geometry")):
                report_file.write_text(json.dumps({**report, **update}))
                with self.assertRaisesRegex(ValueError, message):
                    validate_outputs(root)
            report_file.write_text(json.dumps(report))
            preview = root / "office-candidates/view-0.png"
            original = preview.read_bytes()
            preview.write_bytes(original[:16] + (1280).to_bytes(4, "big") + original[20:])
            with self.assertRaisesRegex(ValueError, "Full HD"):
                validate_outputs(root)
            preview.write_bytes(original)
            write_manifest(root, "exact")
            (root / "office-candidates/extra.txt").write_text("unexpected")
            with self.assertRaisesRegex(ValueError, "inventory"):
                verify_manifest(root, "exact")
            with patch("office_bake_cache.shutil.which", return_value=None):
                with self.assertRaisesRegex(ValueError, "Blender is required"):
                    tool_identity()

    def test_cli_operations_and_failure(self):
        """Cache CLI dispatches actual operations and fails on malformed evidence."""
        with patch("office_bake_cache.source_paths", return_value=[]), patch(
                "office_bake_cache.tool_identity", return_value="tool"), patch(
                "office_bake_cache.input_identity", return_value="exact"), patch(
                "office_bake_cache.write_manifest") as write, patch(
                "office_bake_cache.verify_manifest") as verify, patch("sys.stdout", new_callable=io.StringIO) as output:
            with patch("sys.argv", ["cache", "key"]):
                main()
            self.assertTrue(output.getvalue().startswith("key="))
            self.assertTrue(output.getvalue().strip().endswith("exact"))
            with patch("sys.argv", ["cache", "write"]):
                main()
            write.assert_called_once()
            with patch("sys.argv", ["cache", "verify"]):
                main()
            verify.assert_called_once()
            verify.side_effect = ET.ParseError("broken XML")
            with patch("sys.argv", ["cache", "verify"]):
                with self.assertRaisesRegex(SystemExit, "cache unavailable"):
                    main()


if __name__ == "__main__":
    unittest.main()
