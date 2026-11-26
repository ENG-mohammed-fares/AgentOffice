"""Check actual per-character audit and malformed animation-data rejection."""
import json
import struct
import unittest
from pathlib import Path

from audit_character_rigs import audit, read_accessor, varying


class RigAuditTests(unittest.TestCase):
    """Audit every canonical rig; do not substitute one representative character."""

    def test_all_seven_assets(self):
        root = Path(__file__).resolve().parents[1] / 'assets/agile-office'
        roster = json.loads((root / 'character-roster.json').read_text())
        self.assertEqual(len(roster), 7)
        for character in roster:
            with self.subTest(role=character['role']):
                report = audit((root / 'characters' / character['file']).read_bytes())
                self.assertGreaterEqual(len(report['joints']), 52)
                self.assertEqual(len(report['clips']), 10)
                self.assertEqual(len(report['finger_joints']), 30)
                self.assertTrue(report['skinned_primitives'])
                self.assertEqual(report['unweighted_joint_indices'], [])

    def test_strided_accessor_and_bounds(self):
        model = dict(accessors=[dict(bufferView=0, componentType=5126, type='VEC3', count=2)],
                     bufferViews=[dict(buffer=0, byteOffset=0, byteLength=32, byteStride=16)])
        data = struct.pack('<8f', 1, 2, 3, 99, 4, 5, 6, 99)
        self.assertEqual(read_accessor(model, data, 0), [(1, 2, 3), (4, 5, 6)])
        with self.assertRaises(ValueError):
            read_accessor(model, data[:12], 0)
        model['accessors'][0]['sparse'] = {}
        with self.assertRaises(ValueError):
            read_accessor(model, data, 0)

    def test_quaternion_sign_is_not_motion(self):
        self.assertFalse(varying([], True))
        self.assertFalse(varying([(0, 0, 0, 1), (0, 0, 0, -1)], True))
        self.assertTrue(varying([(0, 0, 0, 1), (0, .1, 0, .995)], True))
        self.assertTrue(varying([(0, 0, 0), (1, 0, 0)], False))
