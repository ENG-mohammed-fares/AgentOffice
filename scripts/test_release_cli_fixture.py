"""Native local-only gh CLI fixture for the release PowerShell regression tests."""
import json
import shutil
import sys
from pathlib import Path

STATE = Path("fixture-cli-state.json")
MODE = Path("fixture-mode.txt")
REPO = "ENG-mohammed-fares/AgentOffice"
TAG = "v1.6.16"
NAMES = ("AgentOffice-Setup-1.6.16-x64.exe",
         "AgentOffice-Setup-1.6.16-x64.exe.blockmap", "latest.yml")


def state():
    """Load fixture state; no GitHub or network access."""
    return json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {
        "creates": 0, "edits": 0, "downloads": 0, "published": False, "assets": []
    }


def save(value):
    """Persist local fake release state."""
    STATE.write_text(json.dumps(value), encoding="utf-8")


def mode():
    """Select a deliberately corrupted fixture, if requested."""
    return MODE.read_text(encoding="utf-8-sig").strip() if MODE.exists() else ""


def dispatch(args):
    """Return a native exit code, accepting only the fixed regression commands."""
    if args == ["api", f"repos/{REPO}/git/ref/heads/development", "--jq", ".object.sha"]:
        print("fixture-sha")
        return 0
    if args == ["api", f"repos/{REPO}/releases/latest"]:
        print(json.dumps({"tag_name": "v1.6.15"}))
        return 0
    current = state()
    if len(args) < 5 or args[0] != "release" or args[2] != TAG:
        raise ValueError("Unexpected fixture command")
    if "--repo" not in args or args[args.index("--repo") + 1] != REPO:
        raise ValueError("Unexpected fixture repository")
    action = args[1]
    if action == "view":
        if not current["creates"]:
            return 1
        if "--json" not in args:
            return 0
        print(json.dumps({"isDraft": mode() != "bad-draft",
                          "tagName": TAG, "assets": current["assets"]}))
    elif action == "create":
        if current["creates"] or "--draft" not in args:
            raise ValueError("Fixture release must be created once as a draft")
        current["assets"] = [
            {"name": name, "size": (Path("candidate") / name).stat().st_size,
             "browser_download_url": f"https://github.com/{REPO}/releases/download/{TAG}/{name}"}
            for name in NAMES
        ]
        current["creates"] += 1
    elif action == "download":
        if not current["creates"] or current["published"] or "--dir" not in args:
            raise ValueError("Fixture draft must exist before download")
        destination = Path(args[args.index("--dir") + 1]).resolve()
        if not destination.is_dir() or not destination.name.startswith("agentoffice-dist-"):
            raise ValueError("Unexpected fixture download directory")
        for name in NAMES:
            shutil.copyfile(Path("candidate") / name, destination / name)
        if mode() == "bad-bytes":
            target = destination / NAMES[0]
            data = target.read_bytes()
            target.write_bytes(bytes([data[0] ^ 1]) + data[1:])
        current["downloads"] += 1
    elif action == "edit":
        if current["creates"] != 1 or current["downloads"] != 1 or current["edits"]:
            raise ValueError("Fixture release may be published once after download")
        if "--draft=false" not in args or "--latest" not in args:
            raise ValueError("Unexpected fixture publication flags")
        current["edits"] += 1
        current["published"] = True
    else:
        raise ValueError("Unexpected fixture release operation")
    save(current)
    return 0


if __name__ == "__main__":
    sys.exit(dispatch(sys.argv[1:]))
