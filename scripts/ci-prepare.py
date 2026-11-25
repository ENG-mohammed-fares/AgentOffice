"""Validate the versioned ZIP baseline before extracting it for CI."""
from pathlib import Path, PurePosixPath
import json
import re
import stat
import zipfile

root = Path(__file__).resolve().parents[1]
source = root / "AgentOffice-Source.zip"
target = root / "app"
version = (root / "release-version.txt").read_text(encoding="utf-8").strip()
if not re.fullmatch(r"\d+\.\d+\.\d+", version):
    raise RuntimeError("Invalid release version")
if target.exists():
    raise RuntimeError("CI extraction target already exists")
with zipfile.ZipFile(source) as archive:
    seen = set()
    for item in archive.infolist():
        name = item.filename
        path = PurePosixPath(name)
        if not name or path.is_absolute() or ".." in path.parts or "\\" in name or ":" in name:
            raise RuntimeError(f"Unsafe archive path: {name}")
        normalized = str(path).casefold()
        if normalized in seen:
            raise RuntimeError(f"Duplicate archive path: {name}")
        seen.add(normalized)
        if stat.S_ISLNK(item.external_attr >> 16):
            raise RuntimeError(f"Unexpected archive symlink: {name}")
    corrupt = archive.testzip()
    if corrupt:
        raise RuntimeError(f"Archive CRC mismatch: {corrupt}")
    required = {
        "package.json", "electron/main.cjs", "electron/auth.cjs",
        "electron/identity.cjs", "electron/update-policy.cjs",
        "src/auth-screen.html", "scripts/identity.test.cjs",
        "scripts/auth-smoke.cjs", "electron-builder.config.cjs"
    }
    missing = required - set(archive.namelist())
    if missing:
        raise RuntimeError(f"Missing source files: {sorted(missing)}")
    pkg = json.loads(archive.read("package.json"))
    if pkg.get("version") != "1.6.6" or version != "1.6.15":
        raise RuntimeError("Unexpected immutable ZIP baseline or target version")
    archive.extractall(target)
print(f"Validated immutable AgentOffice 1.6.6 baseline for {version}; branding sets the target package version")
