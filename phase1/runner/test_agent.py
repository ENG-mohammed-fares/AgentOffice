import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import agent


class WorkspaceBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temp.name).resolve()
        self.tools = agent.WorkspaceTools(self.workspace)

    def tearDown(self):
        self.temp.cleanup()

    def test_write_read_list_and_finish(self):
        result = self.tools.invoke(
            "write_file",
            {"path": "src/main.py", "content": "print('ok')\n"},
        )
        self.assertEqual(result["bytes"], 12)
        self.assertEqual(
            self.tools.invoke("read_file", {"path": "src/main.py"})["content"],
            "print('ok')\n",
        )
        self.assertEqual(
            self.tools.invoke("list_files", {}),
            {"files": ["src/main.py"]},
        )
        self.assertTrue(
            self.tools.invoke(
                "finish",
                {"summary": "Created but not executed."},
            )["accepted"]
        )

    def test_rejects_escapes_and_windows_separators(self):
        for value in (
            "../outside",
            "/absolute",
            "C:/drive",
            "folder\\file.py",
            "./same",
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                agent.safe_path(self.workspace, value)

    def test_rejects_file_and_workspace_size_limits(self):
        with patch.object(agent, "MAX_FILE_BYTES", 2):
            with self.assertRaises(ValueError):
                self.tools.invoke(
                    "write_file",
                    {"path": "big.txt", "content": "abc"},
                )
        with patch.object(agent, "MAX_WORKSPACE_BYTES", 2):
            with self.assertRaises(ValueError):
                self.tools.invoke(
                    "write_file",
                    {"path": "big.txt", "content": "abc"},
                )


class AgentLoopTests(unittest.TestCase):
    def test_agent_writes_evidence_without_executing_candidate(self):
        replies = iter(
            [
                {
                    "message": {
                        "role": "assistant",
                        "content": json.dumps(
                            {
                                "action": "write_file",
                                "path": "invoice_total.py",
                                "content": "print(0)\n",
                                "summary": "",
                            }
                        ),
                    },
                    "done_reason": "stop",
                    "eval_count": 4,
                },
                {
                    "message": {
                        "role": "assistant",
                        "content": json.dumps(
                            {
                                "action": "finish",
                                "path": "",
                                "content": "",
                                "summary": "Candidate created; tests not run.",
                            }
                        ),
                    },
                    "done_reason": "stop",
                    "eval_count": 3,
                },
            ]
        )
        with tempfile.TemporaryDirectory() as root:
            root_path = Path(root)
            workspace = root_path / "workspace"
            evidence = root_path / "evidence"
            workspace.mkdir()
            evidence.mkdir()
            with (
                patch.object(
                    agent,
                    "post_json",
                    side_effect=lambda *args, **kwargs: next(replies),
                ),
                patch.object(
                    agent,
                    "model_record",
                    return_value={
                        "name": "qwen2.5-coder:7b",
                        "digest": "test",
                    },
                ),
            ):
                manifest = agent.run_agent(
                    workspace,
                    evidence,
                    "Create a project",
                    model="qwen2.5-coder:7b",
                    base_url="http://127.0.0.1:11434",
                    max_turns=3,
                    request_timeout=1,
                )
            self.assertEqual(
                manifest["status"],
                "candidate_ready_unexecuted",
            )
            self.assertEqual(
                (workspace / "invoice_total.py").read_text(),
                "print(0)\n",
            )
            trace = json.loads((evidence / "trace.json").read_text())
            self.assertEqual(
                trace[0]["action"]["content"]["bytes"],
                9,
            )

    def test_action_schema_rejects_extra_or_missing_fields(self):
        invalid = [
            "{}",
            '{"action":"finish","path":"","content":"","summary":"","extra":1}',
            '{"action":"shell","path":"","content":"","summary":""}',
        ]
        for content in invalid:
            with self.subTest(content=content), self.assertRaises(RuntimeError):
                agent.parse_action(content)


if __name__ == "__main__":
    unittest.main()
