"""Observe long CI subprocesses without interpreting silence as a hang."""
import argparse
import queue
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INTERVAL = 30.0
SILENCE = 120.0

# Only version-controlled workloads may be selected; no arbitrary shell command.
WORKLOADS = {
    "ktx2": (".", [sys.executable, "-m", "coverage", "run", "--append", "--branch",
                   "--source=scripts,assets/agile-office", "assets/agile-office/compress-ktx2.py",
                   "assets/agile-office/office.glb", "compressed/office-ktx2.glb"]),
    "blender": (".", ["blender", "--background", "--factory-startup", "--python-use-system-env",
                      "--python-exit-code", "1", "--python", "scripts/test_office_bake_execution.py"]),
    "python-tests": (".", [sys.executable, "-m", "coverage", "run", "--branch",
                           "--source=scripts", "-m", "unittest", "discover", "-s", "scripts",
                           "-p", "test_*.py", "-v"]),
    "node-tests": (".", ["node", "scripts/run-coverage.cjs"]),
    "seated-review": ("app", ["node", "node_modules/electron/cli.js",
                              "../scripts/office-runtime-benchmark.cjs"]),
    "auth-smoke": ("app", ["node", "node_modules/electron/cli.js", "scripts/auth-smoke.cjs"]),
    "crash-smoke": ("app", ["node", "node_modules/electron/cli.js", "scripts/crash-monitor-smoke.cjs"]),
    "package": ("app", ["node", "node_modules/electron-builder/cli.js", "--config",
                        "electron-builder.config.cjs", "--win", "nsis", "--x64", "--publish", "never"]),
}


def emit(stream, data: bytes) -> None:
    """Forward output to the CI log immediately, without decoding child bytes."""
    stream.write(data)
    stream.flush()


def heartbeat(elapsed: float, idle: float, seen: bool, silence: float) -> bytes:
    """Describe measured liveness and output age, not internal test progress."""
    detail = f"last output {idle:.0f}s ago" if seen else f"no output yet ({idle:.0f}s)"
    warning = " WARNING: output quiet; not proof of a hang;" if idle >= silence else ""
    return f"\n[heartbeat]{warning} process still running; elapsed {elapsed:.0f}s; {detail}\n".encode()


def read_output(pipe, messages: queue.Queue) -> None:
    """Drain a binary pipe in chunks, reporting EOF or reader failure."""
    try:
        while chunk := pipe.read(4096):
            messages.put(chunk)
    except OSError as error:
        messages.put(error)
    finally:
        messages.put(None)


def run_monitored(command: list, cwd: Path, stream, interval=INTERVAL, silence=SILENCE) -> int:
    """Stream actual subprocess output, emit periodic observations and return its exit code.

    The outer CI job retains its hard time limit. Silence never kills the child.
    No secrets, command arguments or environment are added to monitoring messages.
    """
    messages = queue.Queue(maxsize=64)
    start = last = time.monotonic()
    due = start + interval
    seen = ended = False
    with subprocess.Popen(command, cwd=cwd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, bufsize=0) as process:
        reader = threading.Thread(target=read_output, args=(process.stdout, messages), daemon=True)
        reader.start()
        try:
            while not ended or process.poll() is None:
                try:
                    message = messages.get(timeout=max(0.001, min(1.0, due - time.monotonic())))
                    if message is None:
                        ended = True
                    elif isinstance(message, OSError):
                        raise RuntimeError("Unable to read workload output") from message
                    else:
                        emit(stream, message)
                        last, seen = time.monotonic(), True
                except queue.Empty:
                    pass
                now = time.monotonic()
                if now >= due:
                    if process.poll() is None:
                        emit(stream, heartbeat(now - start, now - last, seen, silence))
                    due = now + interval
        except BaseException:
            if process.poll() is None:
                process.terminate()
            raise
        result = process.wait()
        emit(stream, f"\n[heartbeat] process exited; code {result}; elapsed {time.monotonic() - start:.1f}s\n".encode())
        return result


def main() -> int:
    """Run one allowlisted CI workload in its canonical working directory."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workload", choices=WORKLOADS)
    selected = parser.parse_args().workload
    directory, command = WORKLOADS[selected]
    return run_monitored(command, ROOT / directory, sys.stdout.buffer)


if __name__ == "__main__":
    sys.exit(main())
