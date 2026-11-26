"""Exercise traceability acceptance and false-evidence rejection in isolated fixtures."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

from validate_traceability import checked_file, validate
from validate_traceability import validate_stories, validate_changes


class TraceabilityTests(unittest.TestCase):
    """Verify malformed evidence cannot silently become an accepted requirement."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "source.py").write_text("def render(): pass\n", encoding="utf-8")
        (self.root / "test.py").write_text("def test_idle(): pass\n", encoding="utf-8")
        self.record = dict(id="NFR-IDLE-001", summary="Idle frames", source="owner",
                           owner="maintainer", acceptance="No idle frames", component="renderer",
                           decision="accepted", priority="P1", implementation=["source.py"],
                           tests=[dict(path="test.py", id="test_idle", level="unit")],
                           verification="IMPLEMENTED BUT UNVERIFIED", validation="BLOCKED", evidence=[])

    def matrix(self):
        return dict(schema_version=1, requirements=[copy.deepcopy(self.record)])

    def test_repository_matrix(self):
        root = Path(__file__).resolve().parents[1]
        matrix = json.loads((root / "docs/requirements/traceability.json").read_text(encoding="utf-8"))
        self.assertGreater(validate(matrix, root), 0)
        validate_stories(matrix, root)

    def test_story_change_contract(self):
        root = Path(__file__).resolve().parents[1]
        matrix = json.loads((root / 'docs/requirements/traceability.json').read_text(encoding='utf-8'))
        validate_changes(matrix, ['scripts/validate_traceability.py'])
        validate_changes(matrix, ['docs/README.md'])
        with self.assertRaisesRegex(ValueError, 'story'):
            validate_changes(matrix, ['assets/agile-office/unmapped.js'])
        for mutate in ('missing', 'duplicate', 'criteria', 'requirement', 'done', 'test'):
            broken = copy.deepcopy(matrix)
            story = broken['stories'][0]
            if mutate == 'missing':
                broken['stories'] = []
            elif mutate == 'duplicate':
                broken['stories'].append(copy.deepcopy(story))
            elif mutate == 'criteria':
                story['criteria'][0]['then'] = ''
            elif mutate == 'requirement':
                story['requirements'] = ['DR-MISSING-001']
            elif mutate == 'done':
                story['status'] = 'done'
            else:
                story['tests'][0]['id'] = 'nonexistent-' + 'test-identifier'
            with self.subTest(mutate=mutate), self.assertRaises(ValueError):
                validate_stories(broken, root)

    def test_story_rejects_invalid_metadata_before_completion(self):
        root = Path(__file__).resolve().parents[1]
        matrix = json.loads((root / 'docs/requirements/traceability.json').read_text(encoding='utf-8'))
        cases = [('priority', 'urgent'), ('requirements', [[]]),
                 ('requirements', ['DR-QUALITY-001', 'DR-QUALITY-001']),
                 ('tests', []), ('evidence', [dict(path='absent', revision='bad')])]
        for field, value in cases:
            broken = copy.deepcopy(matrix)
            broken['stories'][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_stories(broken, root)

    def test_changed_paths_require_active_stories(self):
        root = Path(__file__).resolve().parents[1]
        matrix = json.loads((root / 'docs/requirements/traceability.json').read_text(encoding='utf-8'))
        for story in matrix['stories']:
            story['status'] = 'proposed'
        with self.assertRaisesRegex(ValueError, 'story'):
            validate_changes(matrix, ['scripts/validate_traceability.py'])

    def test_valid_and_evidence_backed_record(self):
        matrix = self.matrix()
        self.assertEqual(validate(matrix, self.root), 1)
        record = matrix["requirements"][0]
        record["verification"] = "VERIFIED PASS"
        record["evidence"] = [dict(path="test.py", revision="a" * 40)]
        self.assertEqual(validate(matrix, self.root), 1)

    def test_reject_duplicate_and_bad_schema(self):
        for value in ({}, None, dict(schema_version=1, requirements=[])):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate(value, self.root)
        matrix = self.matrix()
        matrix["requirements"].append(copy.deepcopy(self.record))
        with self.assertRaisesRegex(ValueError, "duplicate"):
            validate(matrix, self.root)

    def test_reject_malformed_records(self):
        cases = [("id", "bad"), ("summary", ""), ("priority", "urgent"),
                 ("decision", "approved-by-ai"), ("verification", "done"),
                 ("validation", "green"), ("implementation", "source.py"),
                 ("tests", None), ("evidence", {})]
        for key, value in cases:
            matrix = self.matrix()
            matrix["requirements"][0][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate(matrix, self.root)
        with self.assertRaises(ValueError):
            validate(dict(schema_version=1, requirements=[None]), self.root)

    def test_reject_unsafe_or_missing_paths(self):
        for name in (None, "", "../source.py", "/tmp/source.py", "C:/source.py", "a\\b", "absent"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                checked_file(self.root, name)

    def test_reject_missing_test_or_level(self):
        for case in (None, {}, dict(path="test.py", id="missing", level="unit"),
                     dict(path="test.py", id="test_idle", level="imaginary")):
            matrix = self.matrix()
            matrix["requirements"][0]["tests"] = [case]
            with self.subTest(case=case), self.assertRaises(ValueError):
                validate(matrix, self.root)

    def test_reject_unsupported_pass_and_bad_evidence(self):
        for field in ("verification", "validation"):
            matrix = self.matrix()
            matrix["requirements"][0][field] = "VERIFIED PASS"
            with self.assertRaisesRegex(ValueError, "Pass requires"):
                validate(matrix, self.root)
        for evidence in (None, {}, dict(path="test.py", revision="HEAD"),
                         dict(path="absent", revision="a" * 40)):
            matrix = self.matrix()
            matrix["requirements"][0]["evidence"] = [evidence]
            with self.subTest(evidence=evidence), self.assertRaises(ValueError):
                validate(matrix, self.root)
