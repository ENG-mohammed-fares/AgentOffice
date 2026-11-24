"""Unpack the reviewed v1.2.0 auth overlay into an extracted desktop source tree.
A future baseline that already contains auth.js is left untouched.
"""
from __future__ import annotations
import base64
import io
import tarfile
from pathlib import Path

repo = Path(__file__).resolve().parents[1]
app = repo / "app"
if (app / "src" / "auth.js").is_file():
    print("Existing auth implementation found in source baseline; skipping overlay.")
else:
    source = repo / "assets" / "auth-overlay-v1.2.0.tgz.b64"
    payload = base64.b64decode(source.read_text(encoding="ascii").strip(), validate=True)
    allow = {
        "src/main.js", "src/style.css", "src/auth.js", "src/auth.css",
        "electron/main.cjs", "electron/preload.cjs", "electron/auth.cjs",
        "package.json", "README.md"
    }
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
        members = archive.getmembers()
        names = {m.name for m in members}
        if names != allow or not all(m.isfile() for m in members):
            raise RuntimeError("Unexpected entries in auth overlay")
        for member in members:
            target = app / member.name
            target.parent.mkdir(parents=True, exist_ok=True)
            stream = archive.extractfile(member)
            if not stream:
                raise RuntimeError(f"Cannot extract {member.name}")
            target.write_bytes(stream.read())
    print("Applied AgentOffice local authentication UI and backend overlay")

version = (repo / "release-version.txt").read_text(encoding="utf-8").strip()
import json
pkg = json.loads((app / "package.json").read_text(encoding="utf-8"))
if pkg["version"] != version:
    raise RuntimeError(f"Source version {pkg['version']} != release version {version}")
if not (app / "src" / "auth.js").exists() or not (app / "electron" / "auth.cjs").exists():
    raise RuntimeError("Authentication source files are missing")
print("Verified AgentOffice", version, "auth source")

# Apply the approved visual intro after production auth has been prepared.
import runpy
runpy.run_path(str(repo / 'scripts' / 'apply-exact-intro.py'), run_name='__main__')
