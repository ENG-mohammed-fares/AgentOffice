"""Verify the packaged updater configuration without printing credentials."""
from pathlib import Path
import re


def validate(text):
    def value(key):
        matches = re.findall(r"^" + re.escape(key) + r":[ \t]*([^\r\n]*)$", text, re.M)
        if len(matches) != 1:
            raise RuntimeError("Missing or ambiguous updater field: " + key)
        return matches[0].strip().strip("'\"")

    for key, expected in {
        "provider": "github",
        "owner": "ENG-mohammed-fares",
        "repo": "AgentOffice",
    }.items():
        if value(key) != expected:
            raise RuntimeError("Unexpected updater field: " + key)
    if re.search(r"^[ \t]*(token|authorization|requestHeaders|private)[ \t]*:", text, re.M | re.I):
        raise RuntimeError("Unexpected private feed or credential setting in packaged update configuration")


def main():
    root = Path(__file__).resolve().parents[1]
    config = root / "app" / "release" / "win-unpacked" / "resources" / "app-update.yml"
    validate(config.read_text(encoding="utf-8"))
    print("Packaged application targets the AgentOffice GitHub release channel.")


if __name__ == "__main__":
    main()
