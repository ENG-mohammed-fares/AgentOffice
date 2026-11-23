"""A bounded Phase 1 file-authoring agent for a local Ollama model.

This runner intentionally has no process-execution, network-browsing, Git, or
host-file tools. The model can only list, read, and write regular UTF-8 files
under a newly created empty workspace, then declare completion.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any


MAX_FILE_BYTES = 256 * 1024
MAX_WORKSPACE_BYTES = 1024 * 1024
DEFAULT_MODEL = "qwen2.5-coder:7b"
DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434"

SYSTEM_PROMPT = """You are the first bounded AgentOFF software employee.
You are in an agent loop and can make multiple tool calls.
Create the requested project from scratch using only the supplied file tools.
The workspace starts empty. Do not merely print code in chat.
You cannot execute commands or tests in this stage. Do not claim that tests ran.
Create all mandatory implementation, test, and README files.
Inspect your final file list, then call finish exactly once with an honest summary.
Do not access or mention files outside the project workspace."""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List every regular project file currently in the workspace.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read one UTF-8 project file from the workspace.",
            "parameters": {
                "type": "object",
                "required": ["path"],
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative POSIX project path",
                    }
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Create or replace one UTF-8 project file in the workspace.",
            "parameters": {
                "type": "object",
                "required": ["path", "content"],
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative POSIX project path",
                    },
                    "content": {
                        "type": "string",
                        "description": "Complete UTF-8 file content",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finish",
            "description": "Declare that all requested project files are ready for independent review.",
            "parameters": {
                "type": "object",
                "required": ["summary"],
                "properties": {
                    "summary": {
                        "type": "string",
                        "description": "Short honest description of delivered files and unverified status",
                    }
                },
            },
        },
    },
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def is_within(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def safe_path(workspace: Path, raw_path: Any, *, must_exist: bool = False) -> Path:
    if not isinstance(raw_path, str) or not raw_path or "\x00" in raw_path:
        raise ValueError("path must be a non-empty string")
    if "\\" in raw_path:
        raise ValueError("use POSIX separators in relative project paths")
    raw_parts = raw_path.split("/")
    if any(part in ("", ".", "..") for part in raw_parts):
        raise ValueError("path must be a normalized relative project path")
    relative = PurePosixPath(raw_path)
    if relative.is_absolute() or any(part in ("", ".", "..") for part in relative.parts):
        raise ValueError("path must be a normalized relative project path")
    if any(
        ":" in part
        or part.endswith((" ", "."))
        or part.split(".", 1)[0].upper()
        in {
            "CON",
            "PRN",
            "AUX",
            "NUL",
            *(f"COM{number}" for number in range(1, 10)),
            *(f"LPT{number}" for number in range(1, 10)),
        }
        for part in relative.parts
    ):
        raise ValueError("path contains a Windows-reserved name or syntax")
    candidate = workspace.joinpath(*relative.parts)
    resolved_parent = candidate.parent.resolve(strict=False)
    if not is_within(resolved_parent, workspace):
        raise ValueError("path escapes the project workspace")
    if candidate.exists() and (candidate.is_symlink() or not candidate.is_file()):
        raise ValueError("path must identify a regular file")
    if must_exist and not candidate.is_file():
        raise FileNotFoundError(raw_path)
    return candidate


def project_files(workspace: Path) -> list[Path]:
    files: list[Path] = []
    for path in workspace.rglob("*"):
        if path.is_symlink():
            raise ValueError(f"links are not allowed: {path.relative_to(workspace).as_posix()}")
        if path.is_file():
            files.append(path)
        elif not path.is_dir():
            raise ValueError(f"unsupported filesystem entry: {path.relative_to(workspace).as_posix()}")
    return sorted(files, key=lambda item: item.relative_to(workspace).as_posix())


def file_manifest(workspace: Path) -> list[dict[str, Any]]:
    result = []
    for path in project_files(workspace):
        data = path.read_bytes()
        result.append(
            {
                "path": path.relative_to(workspace).as_posix(),
                "bytes": len(data),
                "sha256": sha256_bytes(data),
            }
        )
    return result


class WorkspaceTools:
    def __init__(self, workspace: Path):
        self.workspace = workspace
        self.finished = False
        self.summary = ""

    def invoke(self, name: str, arguments: Any) -> dict[str, Any]:
        if self.finished:
            raise ValueError("no tool calls are accepted after finish")
        if not isinstance(arguments, dict):
            raise ValueError("tool arguments must be an object")
        if name == "list_files":
            return {"files": [row["path"] for row in file_manifest(self.workspace)]}
        if name == "read_file":
            path = safe_path(self.workspace, arguments.get("path"), must_exist=True)
            return {
                "path": path.relative_to(self.workspace).as_posix(),
                "content": path.read_text(encoding="utf-8"),
            }
        if name == "write_file":
            path = safe_path(self.workspace, arguments.get("path"))
            content = arguments.get("content")
            if not isinstance(content, str):
                raise ValueError("content must be a string")
            encoded = content.encode("utf-8")
            if len(encoded) > MAX_FILE_BYTES:
                raise ValueError("file exceeds the per-file byte limit")
            existing_size = path.stat().st_size if path.exists() else 0
            total_after = (
                sum(item.stat().st_size for item in project_files(self.workspace))
                - existing_size
                + len(encoded)
            )
            if total_after > MAX_WORKSPACE_BYTES:
                raise ValueError("workspace exceeds the total byte limit")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(encoded)
            return {
                "path": path.relative_to(self.workspace).as_posix(),
                "bytes": len(encoded),
                "sha256": sha256_bytes(encoded),
            }
        if name == "finish":
            summary = arguments.get("summary")
            if not isinstance(summary, str) or not summary.strip():
                raise ValueError("summary must be a non-empty string")
            if not project_files(self.workspace):
                raise ValueError("cannot finish an empty project")
            self.finished = True
            self.summary = summary.strip()
            return {
                "accepted": True,
                "files": [row["path"] for row in file_manifest(self.workspace)],
            }
        raise ValueError(f"unknown tool: {name}")


def post_json(
    base_url: str, endpoint: str, payload: dict[str, Any], timeout: float
) -> dict[str, Any]:
    url = f"{base_url.rstrip('/')}{endpoint}"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Ollama request failed at {endpoint}: {exc}") from exc
    if not isinstance(result, dict):
        raise RuntimeError(f"Ollama returned a non-object response at {endpoint}")
    return result


def get_json(base_url: str, endpoint: str, timeout: float) -> dict[str, Any]:
    url = f"{base_url.rstrip('/')}{endpoint}"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Ollama request failed at {endpoint}: {exc}") from exc
    if not isinstance(result, dict):
        raise RuntimeError(f"Ollama returned a non-object response at {endpoint}")
    return result


def model_record(base_url: str, model: str, timeout: float) -> dict[str, Any]:
    tags = get_json(base_url, "/api/tags", timeout)
    models = tags.get("models", [])
    if not isinstance(models, list):
        raise RuntimeError("Ollama model list is malformed")
    for row in models:
        if isinstance(row, dict) and row.get("name") == model:
            return {
                "name": row.get("name"),
                "model": row.get("model"),
                "digest": row.get("digest"),
                "size": row.get("size"),
                "details": row.get("details"),
            }
    raise RuntimeError(f"required local model is missing: {model}")


def compact_call(call: dict[str, Any]) -> dict[str, Any]:
    function = call.get("function", {})
    arguments = function.get("arguments", {})
    result: dict[str, Any] = {"name": function.get("name")}
    if isinstance(arguments, dict):
        result["arguments"] = {
            key: (
                {
                    "bytes": len(value.encode("utf-8")),
                    "sha256": sha256_bytes(value.encode("utf-8")),
                }
                if key == "content" and isinstance(value, str)
                else value
            )
            for key, value in arguments.items()
        }
    else:
        result["arguments"] = arguments
    return result


def run_agent(
    workspace: Path,
    evidence: Path,
    brief: str,
    *,
    model: str,
    base_url: str,
    max_turns: int,
    request_timeout: float,
) -> dict[str, Any]:
    tools = WorkspaceTools(workspace)
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": brief},
    ]
    trace: list[dict[str, Any]] = []
    started = time.monotonic()

    for turn in range(1, max_turns + 1):
        response = post_json(
            base_url,
            "/api/chat",
            {
                "model": model,
                "messages": messages,
                "tools": TOOLS,
                "stream": False,
                "keep_alive": "10m",
                "options": {
                    "temperature": 0.1,
                    "seed": 42,
                    "num_ctx": 8192,
                },
            },
            request_timeout,
        )
        message = response.get("message")
        if not isinstance(message, dict):
            raise RuntimeError("Ollama response omitted the assistant message")
        messages.append(message)
        calls = message.get("tool_calls") or []
        trace.append(
            {
                "turn": turn,
                "at": utc_now(),
                "content": message.get("content", ""),
                "tool_calls": [
                    compact_call(call) for call in calls if isinstance(call, dict)
                ],
                "metrics": {
                    key: response.get(key)
                    for key in (
                        "done_reason",
                        "total_duration",
                        "load_duration",
                        "prompt_eval_count",
                        "prompt_eval_duration",
                        "eval_count",
                        "eval_duration",
                    )
                },
            }
        )

        if not calls:
            raise RuntimeError("model stopped without calling finish")

        for call in calls:
            if not isinstance(call, dict) or not isinstance(
                call.get("function"), dict
            ):
                raise RuntimeError("model emitted a malformed tool call")
            function = call["function"]
            name = function.get("name")
            try:
                result = tools.invoke(name, function.get("arguments", {}))
                tool_content = json.dumps(
                    {"ok": True, "result": result}, ensure_ascii=False
                )
            except (ValueError, OSError, UnicodeError) as exc:
                tool_content = json.dumps(
                    {"ok": False, "error": str(exc)}, ensure_ascii=False
                )
            messages.append(
                {"role": "tool", "tool_name": name, "content": tool_content}
            )

        if tools.finished:
            break
    else:
        raise RuntimeError("agent exceeded the turn limit")

    manifest = {
        "status": "candidate_ready_unexecuted",
        "started_at": trace[0]["at"],
        "finished_at": utc_now(),
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "model": model_record(base_url, model, request_timeout),
        "inference": {"temperature": 0.1, "seed": 42, "num_ctx": 8192},
        "empty_directory_sha256": sha256_bytes(b""),
        "platform": {
            "python": sys.version,
            "os": platform.platform(),
            "machine": platform.machine(),
        },
        "summary": tools.summary,
        "files": file_manifest(workspace),
    }
    (evidence / "trace.json").write_text(
        json.dumps(trace, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (evidence / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return manifest


def prepare_directory(path: Path, label: str) -> Path:
    resolved = path.resolve(strict=False)
    resolved.mkdir(parents=True, exist_ok=True)
    if any(resolved.iterdir()):
        raise ValueError(f"{label} must be empty: {resolved}")
    return resolved


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--brief", type=Path, required=True)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--ollama-url", default=DEFAULT_OLLAMA_URL)
    parser.add_argument("--max-turns", type=int, default=20)
    parser.add_argument("--request-timeout", type=float, default=600)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        workspace = prepare_directory(args.workspace, "workspace")
        evidence = prepare_directory(args.evidence, "evidence directory")
        if is_within(evidence, workspace) or is_within(workspace, evidence):
            raise ValueError("workspace and evidence directory must be separate")
        brief_path = args.brief.resolve(strict=True)
        if is_within(brief_path, workspace):
            raise ValueError("brief must remain outside the model-writable workspace")
        brief = brief_path.read_text(encoding="utf-8")
        if not 1 <= args.max_turns <= 50:
            raise ValueError("max-turns must be between 1 and 50")
        manifest = run_agent(
            workspace,
            evidence,
            brief,
            model=args.model,
            base_url=args.ollama_url,
            max_turns=args.max_turns,
            request_timeout=args.request_timeout,
        )
    except (ValueError, OSError, UnicodeError, RuntimeError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(manifest, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
