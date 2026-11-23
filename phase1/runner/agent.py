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
You are in a multi-turn agent loop. Return exactly one JSON action per turn.
Allowed actions are list_files, read_file, write_file, and finish.
For list_files, set path, content, and summary to empty strings.
For read_file, set path and leave content and summary empty.
For write_file, provide a relative POSIX path and the complete UTF-8 file content.
For finish, provide an honest summary and leave path and content empty.
Create the requested project from scratch. The workspace starts empty.
You cannot execute commands or tests. Never claim that tests ran.
Create the implementation, runnable tests, and README requested by the user.
List and inspect the final project before finishing.
Do not access or mention files outside the project workspace."""

ACTION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "action": {
            "type": "string",
            "enum": ["list_files", "read_file", "write_file", "finish"],
        },
        "path": {"type": "string"},
        "content": {"type": "string"},
        "summary": {"type": "string"},
    },
    "required": ["action", "path", "content", "summary"],
}


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
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Ollama request failed at {endpoint}: HTTP {exc.code}: {body}"
        ) from exc
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


def parse_action(content: Any) -> dict[str, str]:
    if not isinstance(content, str):
        raise RuntimeError("model response content is not text")
    try:
        action = json.loads(content)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"model response is not valid JSON: {exc}") from exc
    if not isinstance(action, dict) or set(action) != {
        "action",
        "path",
        "content",
        "summary",
    }:
        raise RuntimeError("model response does not match the action schema")
    if action["action"] not in {
        "list_files",
        "read_file",
        "write_file",
        "finish",
    }:
        raise RuntimeError("model selected an unknown action")
    if not all(isinstance(action[key], str) for key in action):
        raise RuntimeError("every action field must be a string")
    return action


def compact_action(action: dict[str, str]) -> dict[str, Any]:
    result: dict[str, Any] = {
        "action": action["action"],
        "path": action["path"],
        "summary": action["summary"],
    }
    content = action["content"].encode("utf-8")
    result["content"] = {
        "bytes": len(content),
        "sha256": sha256_bytes(content),
    }
    return result


def write_trace(evidence: Path, trace: list[dict[str, Any]]) -> None:
    (evidence / "trace.json").write_text(
        json.dumps(trace, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


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
        print(f"Turn {turn}: waiting for the local model...", flush=True)
        response = post_json(
            base_url,
            "/api/chat",
            {
                "model": model,
                "messages": messages,
                "format": ACTION_SCHEMA,
                "stream": False,
                "keep_alive": "10m",
                "options": {
                    "temperature": 0,
                    "seed": 42,
                    "num_ctx": 8192,
                    "num_predict": 2048,
                },
            },
            request_timeout,
        )
        message = response.get("message")
        if not isinstance(message, dict):
            raise RuntimeError("Ollama response omitted the assistant message")
        messages.append(message)
        action = parse_action(message.get("content"))
        print(
            f"Turn {turn}: {action['action']}"
            + (f" {action['path']}" if action["path"] else ""),
            flush=True,
        )
        try:
            result = tools.invoke(action["action"], action)
            action_result = {"ok": True, "result": result}
        except (ValueError, OSError, UnicodeError) as exc:
            action_result = {"ok": False, "error": str(exc)}

        trace.append(
            {
                "turn": turn,
                "at": utc_now(),
                "action": compact_action(action),
                "result": action_result,
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
        write_trace(evidence, trace)

        if tools.finished:
            break

        messages.append(
            {
                "role": "user",
                "content": (
                    "ACTION RESULT\n"
                    + json.dumps(action_result, ensure_ascii=False)
                    + "\nContinue with exactly one JSON action."
                ),
            }
        )
    else:
        raise RuntimeError("agent exceeded the turn limit")

    manifest = {
        "status": "candidate_ready_unexecuted",
        "started_at": trace[0]["at"],
        "finished_at": utc_now(),
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "model": model_record(base_url, model, request_timeout),
        "protocol": "structured_json_actions_v1",
        "inference": {
            "temperature": 0,
            "seed": 42,
            "num_ctx": 8192,
            "num_predict": 2048,
        },
        "empty_directory_sha256": sha256_bytes(b""),
        "platform": {
            "python": sys.version,
            "os": platform.platform(),
            "machine": platform.machine(),
        },
        "summary": tools.summary,
        "files": file_manifest(workspace),
    }
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
    parser.add_argument("--request-timeout", type=float, default=360)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    evidence: Path | None = None
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
        if evidence is not None:
            try:
                (evidence / "failure.json").write_text(
                    json.dumps(
                        {
                            "failed_at": utc_now(),
                            "error_type": type(exc).__name__,
                            "error": str(exc),
                        },
                        indent=2,
                        ensure_ascii=False,
                    )
                    + "\n",
                    encoding="utf-8",
                )
            except OSError:
                pass
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(manifest, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
