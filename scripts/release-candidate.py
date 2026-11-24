"""Create and verify immutable Windows QA candidate files. Never publish here."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
VERSION = (ROOT / "release-version.txt").read_text(encoding="utf-8").strip()
DEST = ROOT / "candidate"

def digest(path, algorithm="sha256"):
    h = hashlib.new(algorithm)
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h

def assets(directory, version):
    exe = f"AgentOffice-Setup-{version}-x64.exe"
    names = {exe, exe + ".blockmap", "latest.yml"}
    if not all((directory / name).is_file() and (directory / name).stat().st_size for name in names):
        raise RuntimeError("Missing or empty updater assets")
    metadata = (directory / "latest.yml").read_text(encoding="utf-8")
    def field(key):
        m = re.search(r"^" + re.escape(key) + r":\s*([^\r\n]+)", metadata, re.M)
        if not m:
            raise RuntimeError(f"Missing updater metadata: {key}")
        return m.group(1).strip().strip("'\"")
    if field("version") != version or field("path") != exe:
        raise RuntimeError("Updater version or filename mismatch")
    expected = base64.b64encode(digest(directory / exe, "sha512").digest()).decode("ascii")
    if field("sha512") != expected:
        raise RuntimeError("Updater SHA512 mismatch")
    return sorted(names)

def create():
    source = ROOT / "app" / "release"
    names = assets(source, VERSION)
    DEST.mkdir(exist_ok=False)
    for name in names:
        shutil.copyfile(source / name, DEST / name)
    manifest = {
        "version": VERSION,
        "commit": os.environ["GITHUB_SHA"],
        "run_id": os.environ["GITHUB_RUN_ID"],
        "ref": os.environ["GITHUB_REF"],
        "locked": (ROOT / "ci-lock-present.txt").read_text(encoding="utf-8").strip() == "true",
        "sha256": {name: digest(DEST / name).hexdigest() for name in names}
    }
    (DEST / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("Prepared tested candidate:", VERSION, manifest["commit"])

def verify():
    expected_version = os.environ["EXPECTED_VERSION"]
    manifest = json.loads((DEST / "manifest.json").read_text(encoding="utf-8"))
    if expected_version != VERSION or manifest.get("version") != VERSION:
        raise RuntimeError("Candidate version mismatch")
    if manifest.get("commit") != os.environ["GITHUB_SHA"] or str(manifest.get("run_id")) != os.environ["EXPECTED_RUN_ID"]:
        raise RuntimeError("Candidate is not from the selected development CI run")
    if manifest.get("ref") != "refs/heads/development" or manifest.get("locked") is not True:
        raise RuntimeError("Candidate requires development and committed dependency lock")
    names = assets(DEST, VERSION)
    if set(manifest.get("sha256", {})) != set(names):
        raise RuntimeError("Manifest asset list mismatch")
    if {p.name for p in DEST.iterdir()} != set(names) | {"manifest.json"}:
        raise RuntimeError("Unexpected candidate files")
    for name in names:
        if manifest["sha256"][name] != digest(DEST / name).hexdigest():
            raise RuntimeError(f"Candidate SHA256 mismatch: {name}")
    print("Verified exact tested candidate", VERSION)

if __name__ == "__main__":
    {"create": create, "verify": verify}[sys.argv[1]]()
