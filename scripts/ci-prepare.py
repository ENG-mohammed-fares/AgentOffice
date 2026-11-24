"""Validate canonical tracked application source before the CI build."""
from pathlib import Path
import json
import re
import subprocess

root = Path(__file__).resolve().parents[1]
app = root / "app"
version = (root / "release-version.txt").read_text(encoding="utf-8").strip()
if not re.fullmatch(r"\d+\.\d+\.\d+", version):
    raise RuntimeError("Invalid release version")
required = (
    "package.json", "package-lock.json", "electron/main.cjs",
    "electron/auth.cjs", "electron/identity.cjs", "electron/update-policy.cjs",
    "src/auth-screen.html", "scripts/identity.test.cjs",
    "scripts/auth-smoke.cjs", "electron-builder.config.cjs",
)
for name in required:
    path = app / name
    if not path.is_file() or path.is_symlink():
        raise RuntimeError(f"Missing or invalid source file: {name}")
    subprocess.run(["git", "ls-files", "--error-unmatch", f"app/{name}"], cwd=root, check=True, stdout=subprocess.DEVNULL)
pkg = json.loads((app / "package.json").read_text(encoding="utf-8"))
lock = json.loads((app / "package-lock.json").read_text(encoding="utf-8"))
if pkg.get("version") != version or lock.get("version") != version or lock["packages"][""].get("version") != version:
    raise RuntimeError("Source package or dependency lock version differs from release-version.txt")
print(f"Validated tracked AgentOffice {version} source and committed lock")
