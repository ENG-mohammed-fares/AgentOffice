"""Install the local crash monitor into the exact prepared Electron entry point."""
from pathlib import Path
import json
import re
import shutil

def install(root):
    app = root / "app"
    assets = root / "assets" / "crash-monitor"
    package = json.loads((app / "package.json").read_text(encoding="utf-8"))
    entry = app / "electron" / "main.cjs"
    if (app / package["main"]).resolve() != entry.resolve():
        raise RuntimeError("Unexpected Electron entry point; review crash monitor integration")
    if not entry.is_file():
        raise RuntimeError("Missing Electron entry point")
    text = entry.read_text(encoding="utf-8")
    hook = "require('./crash-monitor.cjs').installCrashMonitor({app:require('electron').app});"
    if hook in text:
        raise RuntimeError("Crash monitor already installed")
    # Preserve a shebang and an existing strict-mode directive.
    prefix = re.match(r"^(?:#![^\n]*\n)?(?:\s*['\"]use strict['\"]\s*;)?", text)
    offset = prefix.end()
    entry.write_text(text[:offset] + "\n" + hook + "\n" + text[offset:], encoding="utf-8")
    shutil.copyfile(assets / "crash-monitor.cjs", app / "electron" / "crash-monitor.cjs")
    for name in ("crash-monitor.test.cjs", "crash-monitor-smoke.cjs"):
        shutil.copyfile(assets / name, app / "scripts" / name)
    print("Installed privacy-minimized local crash monitoring in Electron main")


if __name__ == '__main__':
    install(Path(__file__).resolve().parents[1])
