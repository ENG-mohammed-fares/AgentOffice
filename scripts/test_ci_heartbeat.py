"""Real subprocess regression checks for CI heartbeat and exit propagation."""
import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from ci_heartbeat import WORKLOADS, heartbeat, main, run_monitored


class HeartbeatTests(unittest.TestCase):
    """Verify diagnostics never silently replace workload results."""

    def test_heartbeat_distinguishes_output_and_silence(self):
        self.assertIn(b"last output 5s ago", heartbeat(30, 5, True, 120))
        self.assertNotIn(b"WARNING", heartbeat(30, 5, True, 120))
        self.assertIn(b"no output yet", heartbeat(30, 30, False, 120))
        self.assertIn(b"not proof of a hang", heartbeat(150, 120, True, 120))

    def test_real_silent_child_continues_and_returns_success(self):
        output = io.BytesIO()
        result = run_monitored([sys.executable, "-u", "-c",
                                "import time; time.sleep(0.4); print('completed')"],
                               Path.cwd(), output, interval=0.04, silence=0.08)
        self.assertEqual(result, 0)
        self.assertIn(b"process still running", output.getvalue())
        self.assertIn(b"WARNING", output.getvalue())
        self.assertIn(b"completed", output.getvalue())
        self.assertIn(b"code 0", output.getvalue())

    def test_real_failure_preserves_binary_stdout_stderr_and_exit(self):
        output = io.BytesIO()
        result = run_monitored([sys.executable, "-u", "-c",
                                "import sys; sys.stdout.buffer.write(b'out\\xff'); "
                                "sys.stderr.write('failure'); sys.exit(7)"],
                               Path.cwd(), output, interval=0.04, silence=0.08)
        self.assertEqual(result, 7)
        self.assertIn(b"out\xff", output.getvalue())
        self.assertIn(b"failure", output.getvalue())
        self.assertIn(b"code 7", output.getvalue())

    def test_active_output_reports_recent_progress(self):
        output = io.BytesIO()
        result = run_monitored([sys.executable, "-u", "-c",
                                "import time; print('begin'); time.sleep(0.3); print('end')"],
                               Path.cwd(), output, interval=0.04, silence=1)
        self.assertEqual(result, 0)
        self.assertIn(b"last output", output.getvalue())
        self.assertNotIn(b"WARNING", output.getvalue())

    def test_cli_selects_only_allowlisted_workloads(self):
        with patch("sys.argv", ["ci_heartbeat.py", "node-tests"]), patch(
                "ci_heartbeat.run_monitored", return_value=9) as run:
            self.assertEqual(main(), 9)
            self.assertEqual(run.call_args.args[0], WORKLOADS["node-tests"][1])
        with patch("sys.argv", ["ci_heartbeat.py", "untrusted-command"]), patch("sys.stderr", io.StringIO()):
            with self.assertRaises(SystemExit) as error:
                main()
            self.assertEqual(error.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
