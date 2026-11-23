"""Grade captured observations offline. This module never starts candidate processes."""
import json
import sys
from pathlib import Path


def matches(case, row):
    if not isinstance(row, dict) or type(row.get("exit")) is not int:
        return False
    return row["exit"] == case["exit"] and all(
        isinstance(row.get(stream), str)
        and row[stream].replace("\r\n", "\n") == case[stream]
        for stream in ("stdout", "stderr")
    )


def grade(cases, observations):
    if not isinstance(observations, dict):
        raise ValueError("Expected a case ID to observation mapping")
    if set(observations) != {case["id"] for case in cases}:
        raise ValueError("Case IDs differ from the frozen suite")
    return [case["id"] for case in cases if not matches(case, observations[case["id"]])]


if __name__ == "__main__":
    cases = json.loads(Path(__file__).with_name("cases.json").read_text())
    failed = grade(cases, json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")))
    print(json.dumps({"cases": len(cases), "failed": failed}))
    sys.exit(int(bool(failed)))
