"""Validate and stage the exact local character assets, without trusting manifest paths."""
import hashlib
import json
import re
import shutil
import struct
from pathlib import Path

CLIPS = frozenset(("Idle", "Walk", "Typing", "Thinking", "Review", "Meeting",
                   "Talk", "Error", "Celebrate", "Sitting"))
FILENAME = re.compile(r"[a-z-]+\.glb")
DIGEST = re.compile(r"[a-f0-9]{64}")


def require(condition, message):
    """Raise ValueError when an asset validation invariant fails."""
    if not condition:
        raise ValueError(message)


def validate_model(data):
    """Validate GLB header, animation roster and embedded resource constraints.

    Args:
        data: Raw GLB bytes from a local character asset.

    Raises:
        ValueError: If the file violates the required GLB or asset contract.
    """
    require(len(data) >= 20, "Truncated character GLB")
    require(struct.unpack_from("<4sII", data) == (b"glTF", 2, len(data)),
            "Invalid character GLB header")
    size, tag = struct.unpack_from("<I4s", data, 12)
    require(tag == b"JSON" and size <= len(data) - 20, "Invalid character JSON chunk")
    model = json.loads(data[20:20 + size])
    animations = model.get("animations", [])
    require(bool(model.get("skins")) and len(animations) == len(CLIPS)
            and {a.get("name") for a in animations} == CLIPS,
            "Invalid character skin or animation clips")
    require(all("uri" not in item for key in ("buffers", "images")
                for item in model.get(key, [])), "External character resource forbidden")


def stage_characters(assets, target):
    """Verify every local character before replacing the prepared asset directory.

    Args:
        assets: Canonical asset directory containing roster and source GLBs.
        target: Prepared character directory owned by the build.

    Returns:
        List of role, file and station records, or an empty list if no source exists.

    Raises:
        ValueError: If the roster, file digest or GLB is invalid.
        OSError: If reading or writing the assets fails.
    """
    source = assets / "characters"
    if not source.exists():
        if target.exists():
            shutil.rmtree(target)
        return []
    expected = json.loads((assets / "character-roster.json").read_text(encoding="utf-8"))
    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))["characters"]
    require(len(expected) == len(manifest) == 7, "Expected seven characters")
    supplied = {item["file"]: item["sha256"] for item in manifest}
    require(len(supplied) == 7, "Duplicate manifest file")
    seen, roles, slots = set(), set(), set()
    verified = []
    for item in expected:
        name, role, station, digest = (item[k] for k in ("file", "role", "station", "sha256"))
        require(isinstance(name, str) and FILENAME.fullmatch(name)
                and name not in seen, "Invalid character filename")
        require(isinstance(role, str) and role and role not in roles
                and type(station) is int and 0 <= station < 7 and station not in slots,
                "Invalid character roster")
        require(isinstance(digest, str) and DIGEST.fullmatch(digest)
                and supplied.get(name) == digest, "Invalid character manifest digest")
        path = source / name
        require(not path.is_symlink() and path.is_file(), "Character must be a local regular file")
        data = path.read_bytes()
        require(hashlib.sha256(data).hexdigest() == digest, "Character hash mismatch")
        validate_model(data)
        seen.add(name)
        roles.add(role)
        slots.add(station)
        verified.append(({"role": role, "file": name, "station": station}, data))
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    for entry, data in verified:
        (target / entry["file"]).write_bytes(data)
    return [entry for entry, _ in verified]
