"""Verify the actual packaged updater config without printing credentials."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
config = root / "app" / "release" / "win-unpacked" / "resources" / "app-update.yml"
text = config.read_text(encoding="utf-8")
def value(key):
    matches = re.findall(r"^" + re.escape(key) + r":\s*([^\r\n]+)$", text, re.M)
    if len(matches) != 1:
        raise RuntimeError("Missing or ambiguous updater field: " + key)
    return matches[0].strip().strip("'\"")
for key, expected in {"provider": "github", "owner": "ENG-mohammed-fares", "repo": "AgentOffice-Releases"}.items():
    if value(key) != expected:
        raise RuntimeError("Unexpected updater field: " + key)
if re.search(r"^\s*(token|authorization|requestHeaders|private)\s*:", text, re.M | re.I):
    raise RuntimeError("Unexpected private feed or credential setting in packaged update configuration")
print("Packaged application targets the public binary-only GitHub update channel.")
