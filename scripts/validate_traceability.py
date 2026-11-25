"""Validate requirement references without claiming that referenced tests passed."""
import json
import re
from pathlib import Path, PurePosixPath

STATUSES = {"VERIFIED PASS", "VERIFIED FAIL", "IMPLEMENTED BUT UNVERIFIED",
            "BLOCKED", "NOT APPLICABLE", "DEFERRED"}


def checked_file(root: Path, name: str) -> Path:
    """Resolve a repository-relative file, rejecting traversal and symlink escapes.

    Raises:
        ValueError: If the path is unsafe or does not identify a file in root.
    """
    if not isinstance(name, str) or not name or "\\" in name or ":" in name:
        raise ValueError("Invalid repository path")
    relative = PurePosixPath(name)
    target = (root / name).resolve()
    if relative.is_absolute() or ".." in relative.parts or not target.is_relative_to(root.resolve()) or not target.is_file():
        raise ValueError("Missing or unsafe repository file: " + name)
    return target


def validate(matrix: dict, root: Path) -> int:
    """Check IDs, source/test references and evidence for status claims.

    Args:
        matrix: Parsed traceability JSON; never executable instructions.
        root: Checkout root containing canonical sources and tests.
    Returns:
        Number of structurally valid requirements, not passed product tests.
    Raises:
        ValueError: For malformed records or unsupported verification claims.
    """
    if not isinstance(matrix, dict) or matrix.get("schema_version") != 1:
        raise ValueError("Unsupported traceability schema")
    records = matrix.get("requirements")
    if not isinstance(records, list) or not records:
        raise ValueError("Requirements must be a nonempty list")
    ids = set()
    for record in records:
        if not isinstance(record, dict):
            raise ValueError("Requirement must be an object")
        for field in ("id", "summary", "source", "owner", "acceptance", "component"):
            if not isinstance(record.get(field), str) or not record[field].strip():
                raise ValueError("Missing requirement field: " + field)
        identity = record["id"]
        if not re.fullmatch(r"(?:FR|NFR|DR)-[A-Z]+-\d{3}", identity) or identity in ids:
            raise ValueError("Invalid or duplicate requirement ID: " + identity)
        ids.add(identity)
        if record.get("decision") not in {"accepted", "proposed"} or record.get("priority") not in {"P0", "P1", "P2", "P3"}:
            raise ValueError("Invalid decision or priority: " + identity)
        for field in ("verification", "validation"):
            if record.get(field) not in STATUSES:
                raise ValueError("Invalid status: " + identity)
        for field in ("implementation", "tests", "evidence"):
            if not isinstance(record.get(field), list):
                raise ValueError("Expected list: " + field)
        for name in record["implementation"]:
            checked_file(root, name)
        for case in record["tests"]:
            if not isinstance(case, dict) or not isinstance(case.get("id"), str) or not case["id"]:
                raise ValueError("Invalid test identifier")
            source = checked_file(root, case.get("path")).read_text(encoding="utf-8")
            if case["id"] not in source or case.get("level") not in {"unit", "integration", "system", "static", "benchmark"}:
                raise ValueError("Missing test identifier or invalid level: " + identity)
        if record["verification"] == "VERIFIED PASS" or record["validation"] == "VERIFIED PASS":
            if not record["implementation"] or not record["tests"] or not record["evidence"]:
                raise ValueError("Pass requires implementation, tests and evidence: " + identity)
        for evidence in record["evidence"]:
            if not isinstance(evidence, dict) or not re.fullmatch(r"[0-9a-f]{40}", str(evidence.get("revision", ""))):
                raise ValueError("Evidence needs exact revision")
            checked_file(root, evidence.get("path"))
    return len(records)


def main() -> None:
    """Validate the checkout's canonical RTM; fail closed on invalid JSON or references."""
    root = Path(__file__).resolve().parents[1]
    matrix = json.loads((root / "docs/requirements/traceability.json").read_text(encoding="utf-8"))
    count = validate(matrix, root)
    print(f"Validated {count} requirement records (structure/references only).")


if __name__ == "__main__":
    main()
