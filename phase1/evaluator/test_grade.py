import json
import unittest
from pathlib import Path
from grade import grade


class GradingContract(unittest.TestCase):
    def setUp(self):
        self.cases = json.loads(Path(__file__).with_name("cases.json").read_text())
        self.rows = {c["id"]: {k: c[k] for k in ("exit", "stderr", "stdout")} for c in self.cases}

    def test_known_transcripts(self):
        self.rows["mixed"]["stdout"] = "280\r\n"
        self.assertEqual(grade(self.cases, self.rows), [])

    def test_wrong_total_stream_and_status(self):
        self.rows["mixed"]["stdout"] = "1154\n"
        self.rows["object"]["stdout"] = "INVALID\n"
        self.rows["empty"]["exit"] = False
        self.assertEqual(grade(self.cases, self.rows), ["mixed", "empty", "object"])

    def test_incomplete_capture(self):
        del self.rows["malformed"]
        with self.assertRaises(ValueError):
            grade(self.cases, self.rows)
