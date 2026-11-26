"""Verify review-only Blender bake cache outputs against exact source inputs."""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


MANIFEST = Path("office-candidates/cache-manifest.json")
REQUIRED = (Path("compressed/office-bake-coverage.xml"),
            Path("office-candidates/bake-report.json"),
            *(Path(f"office-candidates/view-{index}.png") for index in range(3)))


def sha256(path):
    """Return a file's SHA-256 digest without loading it into memory."""
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def input_identity(root, paths, tool):
    """Hash sorted canonical input paths, their bytes and the toolchain identity."""
    digest = hashlib.sha256(tool.encode("utf-8"))
    for relative in sorted(set(paths)):
        path = root / relative
        if not path.is_file() or path.is_symlink():
            raise ValueError(f"Missing or unsafe office source: {relative}")
        digest.update(relative.as_posix().encode("utf-8") + b"\0")
        digest.update(bytes.fromhex(sha256(path)))
    return digest.hexdigest()


def source_paths(root):
    """List tracked office inputs plus the office geometry generated in this job."""
    tracked = subprocess.check_output([
        "git", "ls-files", "-z", "--", "assets/agile-office",
        "scripts/test_office_bake_execution.py", "scripts/ci_heartbeat.py",
        "scripts/office_bake_cache.py", ".github/workflows/ci.yml"], cwd=root)
    paths = [Path(value.decode("utf-8")) for value in tracked.split(b"\0") if value]
    paths.extend((Path("assets/agile-office/office.glb"),
                  Path("assets/agile-office/scene.json")))
    return paths


def tool_identity():
    """Include the exact Blender executable, distribution packages and runner image."""
    blender = shutil.which("blender")
    if not blender:
        raise ValueError("Blender is required before computing the cache key")
    packages = subprocess.check_output([
        "dpkg-query", "-W", "-f=${Package}=${Version}\n", "blender",
        "python3-numpy", "python3-coverage"], text=True)
    return json.dumps({"blender_binary": sha256(Path(blender).resolve()),
                       "packages": packages, "runner_image": os.environ.get("ImageVersion", "unknown"),
                       "bake_cache_contract": 1}, sort_keys=True)


def output_files(root):
    """Return the review files and bake coverage, refusing symbolic links."""
    paths = [Path("compressed/office-bake-coverage.xml")]
    paths.extend(path.relative_to(root) for path in (root / "office-candidates").rglob("*"))
    paths = sorted(path for path in paths if path != MANIFEST)
    if any(not (root / path).is_file() or (root / path).is_symlink() for path in paths):
        raise ValueError("Unexpected non-file or symbolic link in bake outputs")
    if not set(REQUIRED).issubset(paths):
        raise ValueError("Required Blender review outputs are missing")
    return paths


def validate_outputs(root):
    """Confirm the cached reports remain structurally valid, including native previews."""
    report = json.loads((root / REQUIRED[1]).read_text(encoding="utf-8"))
    if report.get("status") != "review_only" or report.get("mode") != "combined":
        raise ValueError("Unexpected Blender bake report")
    if not report.get("baked_nodes") or report["original"]["triangles"] != report["candidate"]["triangles"]:
        raise ValueError("Invalid baked geometry report")
    if any(name.lower().startswith("chair_") for name in report["baked_nodes"]):
        raise ValueError("Movable chair appears in static bake")
    ET.parse(root / REQUIRED[0])
    for preview in REQUIRED[2:]:
        with (root / preview).open("rb") as stream:
            header = stream.read(24)
        if header[:16] != b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" or int.from_bytes(header[16:20], "big") < 1920 or int.from_bytes(header[20:24], "big") < 1080:
            raise ValueError(f"Invalid native Full HD preview: {preview}")


def write_manifest(root, identity):
    """Record the source identity and each completed bake output digest."""
    paths = output_files(root)
    validate_outputs(root)
    payload = {"input_identity": identity,
               "outputs": {path.as_posix(): sha256(root / path) for path in paths}}
    (root / MANIFEST).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def verify_manifest(root, identity):
    """Reject stale, missing, modified or unexpected cached bake outputs."""
    payload = json.loads((root / MANIFEST).read_text(encoding="utf-8"))
    if payload.get("input_identity") != identity:
        raise ValueError("Cached Blender source or toolchain differs")
    paths = output_files(root)
    if set(payload.get("outputs", {})) != {path.as_posix() for path in paths}:
        raise ValueError("Cached Blender output inventory differs")
    for path in paths:
        if payload["outputs"][path.as_posix()] != sha256(root / path):
            raise ValueError(f"Cached Blender output changed: {path}")
    validate_outputs(root)


def main():
    """Print a cache key, write an output manifest or validate a restored one."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("key", "write", "verify"))
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    try:
        identity = input_identity(root, source_paths(root), tool_identity())
        if args.operation == "key":
            print(f"key=office-bake-v1-{identity}")
        elif args.operation == "write":
            write_manifest(root, identity)
        else:
            verify_manifest(root, identity)
            print("Verified exact-source Blender bake cache")
    except (OSError, ValueError, KeyError, TypeError, ET.ParseError) as error:
        sys.exit(f"Blender bake cache unavailable: {error}")


if __name__ == "__main__":
    main()
