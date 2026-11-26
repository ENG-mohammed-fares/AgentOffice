"""Regression tests for the actual KTX2 artifact verifier."""
import copy
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('office_verify', ROOT / 'assets/agile-office/verify-ktx2.py')
verify = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verify)


def glb(doc, binary):
    raw = json.dumps(doc).encode()
    raw += b' ' * (-len(raw) % 4)
    binary += b'\0' * (-len(binary) % 4)
    return (struct.pack('<4sII', b'glTF', 2, 28 + len(raw) + len(binary)) +
            struct.pack('<I4s', len(raw), b'JSON') + raw +
            struct.pack('<I4s', len(binary), b'BIN\0') + binary)


class AssetVerificationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.directory = self.root / 'app/public/office'
        self.directory.mkdir(parents=True)
        self.original = self.directory / 'office.glb'
        self.compressed = self.directory / 'office-ktx2.glb'
        self.binary = verify.KTX2_MAGIC * 14
        self.doc = {
            'extensionsRequired': ['KHR_texture_basisu'],
            'images': [{'mimeType': 'image/ktx2', 'bufferView': i} for i in range(14)],
            'bufferViews': [{'buffer': 0, 'byteOffset': i * 12, 'byteLength': 12} for i in range(14)],
            'textures': [{'extensions': {'KHR_texture_basisu': {'source': i}}} for i in range(14)],
            'nodes': [{'name': 'Desk'}],
            'accessors': [{'count': 3}],
            'meshes': [{'primitives': [{'material': 0, 'attributes': {'POSITION': 0}}]}]
        }
        self.original.write_bytes(glb(self.doc, self.binary))
        self.compressed.write_bytes(glb(self.doc, self.binary))

    def test_valid_fixture_and_fixed_location(self):
        self.assertEqual(verify.fixed_artifact(self.root, 'office.glb'), self.original)
        verify.verify(self.original, self.compressed)
        with self.assertRaisesRegex(ValueError, 'fixed office location'):
            verify.main(['../../elsewhere'])

    def test_missing_and_symlink_artifact(self):
        self.compressed.unlink()
        with self.assertRaises(FileNotFoundError):
            verify.fixed_artifact(self.root, 'office-ktx2.glb')
        try:
            self.compressed.symlink_to(self.original)
        except OSError:
            self.skipTest('Symbolic links unavailable on this runner')
        with self.assertRaisesRegex(ValueError, 'fixed office location'):
            verify.fixed_artifact(self.root, 'office-ktx2.glb')

    def test_header_and_chunk_rejection(self):
        good = glb(self.doc, self.binary)
        for raw in (b'', b'bad!', b'NOPE' + good[4:],
                    good[:16] + b'BAD!' + good[20:],
                    good[:-4]):
            with self.subTest(raw=raw[:20]):
                self.compressed.write_bytes(raw)
                with self.assertRaises(ValueError):
                    verify.verify(self.original, self.compressed)

    def test_missing_extension_changed_geometry_and_bad_texture(self):
        cases = [
            ('Missing required', lambda d: d.update(extensionsRequired=[])),
            ('Unexpected texture count', lambda d: d['images'].pop()),
            ('Changed node names', lambda d: d['nodes'][0].update(name='Other')),
            ('Changed mesh topology', lambda d: d['accessors'][0].update(count=6)),
            ('Invalid compressed texture buffer range', lambda d: d['bufferViews'][0].update(byteOffset=-1)),
            ('Invalid compressed texture buffer range', lambda d: d['bufferViews'][0].update(byteLength=99999)),
            ('Invalid KTX2 texture', lambda d: d['images'][0].update(mimeType='image/png')),
            ('Missing texture BasisU', lambda d: d['textures'][0].update(extensions={}))
        ]
        for message, change in cases:
            with self.subTest(message=message):
                doc = copy.deepcopy(self.doc)
                change(doc)
                self.compressed.write_bytes(glb(doc, self.binary))
                with self.assertRaisesRegex(ValueError, message):
                    verify.verify(self.original, self.compressed)
        self.compressed.write_bytes(glb(self.doc, b'X' + self.binary[1:]))
        with self.assertRaisesRegex(ValueError, 'Invalid KTX2'):
            verify.verify(self.original, self.compressed)


if __name__ == '__main__':
    unittest.main()
