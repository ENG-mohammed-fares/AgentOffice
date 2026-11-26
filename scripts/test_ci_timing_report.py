"""Regression checks for CI timing measurements."""

import unittest
import io
import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

from ci_timing_report import (REPOSITORY, collect, duration, fetch_json, main,
                              markdown_cell, measure, summarize)


class TimingReportTests(unittest.TestCase):
    """Require real timestamps and explicit incomplete sample accounting."""

    def test_summary_handles_incomplete_runs_and_percentiles(self):
        """Incomplete runs never turn into fabricated fast samples."""
        runs = [
            {"id": 1, "name": "CI", "status": "completed",
             "created_at": "2026-11-26T00:00:00Z", "updated_at": "2026-11-26T00:02:00Z"},
            {"id": 2, "name": "CI", "status": "in_progress"},
            {"id": 3, "name": "CI", "status": "completed", "created_at": None},
        ]
        jobs = {1: [{"name": "Windows", "status": "completed",
                     "created_at": "2026-11-26T00:00:00Z",
                     "started_at": "2026-11-26T00:00:30Z",
                     "completed_at": "2026-11-26T00:02:00Z",
                     "steps": [{"name": "Blender", "status": "completed",
                                "started_at": "2026-11-26T00:00:30Z",
                                "completed_at": "2026-11-26T00:01:30Z"}]}],
                    3: [{"name": "Windows", "status": "completed"}]}
        report = measure(runs, jobs)
        windows = next(row for row in report["metrics"] if row["job"] == "Windows")
        self.assertEqual(report["omitted_incomplete_records"], 3)
        self.assertEqual(windows["queue"], {"samples": 1, "p50_seconds": 30,
                                             "p90_seconds": 30})
        self.assertEqual(windows["execute"]["p50_seconds"], 90)
        blender = next(row for row in report["metrics"] if row["job"] == "Windows / Blender")
        self.assertEqual(blender["execute"]["p50_seconds"], 60)
        self.assertEqual(summarize(range(1, 11))["p90_seconds"], 9)
        self.assertIsNone(duration("bad", "2026-11-26T00:00:00Z"))
        self.assertIsNone(duration("2026-11-26T00:02:00Z", "2026-11-26T00:00:00Z"))

    def test_collect_pagination_and_reject_invalid_ids(self):
        """Only numeric run identifiers enter fixed API paths; pagination is complete."""
        run = {"id": 7, "name": "CI", "status": "completed"}
        with patch("ci_timing_report.fetch_json", side_effect=[
                {"workflow_runs": [run]}, {"jobs": [{"status": "queued"}] * 100},
                {"jobs": []}]) as fetch:
            self.assertEqual(collect(REPOSITORY, "token", 30)["omitted_incomplete_records"], 101)
            self.assertIn("page=2", fetch.call_args.args[0])
        for bad in ("../other", "https://other.example", "", "a/b"):
            with self.assertRaises(ValueError):
                collect(bad, "token", 30)
        with patch("ci_timing_report.fetch_json", return_value={
                "workflow_runs": [{"id": "../escape"}]}):
            with self.assertRaisesRegex(ValueError, "run ID"):
                collect(REPOSITORY, "token", 30)
        for bad in (0, 101, "30", True):
            with self.assertRaises(ValueError):
                collect(REPOSITORY, "token", bad)

    def test_fetch_json_rejects_redirect(self):
        """Authentication stays on the fixed GitHub TLS endpoint."""
        with patch("ci_timing_report.HTTPSConnection") as connection:
            client = connection.return_value
            response = client.getresponse.return_value
            response.status = 302
            with self.assertRaisesRegex(OSError, "302"):
                fetch_json("/repos/example/actions/runs", "token")
            connection.assert_called_once_with("api.github.com", timeout=30)
            client.close.assert_called_once()
            client.getresponse.return_value = io.BytesIO(b'{"workflow_runs":[]}')
            client.getresponse.return_value.status = 200
            self.assertEqual(fetch_json("/repos/example/actions/runs", "token"),
                             {"workflow_runs": []})
            self.assertEqual(client.request.call_args.kwargs["headers"]["Authorization"], "Bearer token")

    def test_cli_fixed_output_and_fail_closed(self):
        """The CLI cannot select an arbitrary output path or silently ignore API errors."""
        args = ["report", "--repository", REPOSITORY, "--output", "ci-timings.json"]
        report = {"omitted_incomplete_records": 0, "metrics": [
            {"workflow": "CI|<bad>", "job": "Total run",
             "total": summarize([2]), "execute": summarize([3])},
            {"workflow": "CI", "job": "Windows",
             "total": summarize([3]), "execute": summarize([2])}]}
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "ci-timings.json"
            summary = Path(folder) / "summary.md"
            with patch("sys.argv", args), patch("ci_timing_report.OUTPUT", output), patch.dict(
                    "ci_timing_report.os.environ", {"GITHUB_TOKEN": "token",
                    "GITHUB_STEP_SUMMARY": str(summary)}, clear=True), patch(
                    "ci_timing_report.collect", return_value=report):
                main()
            self.assertEqual(json.loads(output.read_text()), report)
            self.assertIn("CI  bad ", summary.read_text())
            with patch("sys.argv", args), patch.dict("ci_timing_report.os.environ",
                    {"GITHUB_TOKEN": "token"}, clear=True), patch(
                    "ci_timing_report.collect", side_effect=OSError("offline")):
                with self.assertRaises(SystemExit) as error:
                    main()
                self.assertEqual(error.exception.code, 1)
            for argv in (args + ["--limit", "0"], args[:-1] + ["../escape.json"], args):
                with patch("sys.argv", argv), patch.dict("ci_timing_report.os.environ", {}, clear=True):
                    with self.assertRaises(SystemExit) as error:
                        main()
                    self.assertEqual(error.exception.code, 2)
        self.assertEqual(markdown_cell("a|b\n<c>"), "a b  c ")

    def test_incomplete_job_steps(self):
        """Incomplete steps and invalid dates are never counted as successful samples."""
        result = measure([{"id": 1, "status": "completed"}], {1: [
            {"status": "completed", "steps": [{"status": "queued"},
                                             {"status": "completed"}]}]})
        self.assertEqual(result["omitted_incomplete_records"], 3)
        self.assertIsNone(duration(None, None))
        self.assertEqual(summarize([None])["samples"], 0)


if __name__ == "__main__":
    unittest.main()
