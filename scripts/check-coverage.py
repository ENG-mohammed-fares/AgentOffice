"""Enforce conservative, explicitly scoped LCOV regression floors."""
import sys
from pathlib import Path

REQUIRED = {"auth.cjs", "identity.cjs", "startup-update.cjs", "update-policy.cjs", "ipc-security.cjs"}
FLOORS = {"lines": 70, "branches": 60, "functions": 60}
totals = {kind: [0, 0] for kind in FLOORS}
seen = set()
fields = {"LF": ("lines", 0), "LH": ("lines", 1), "BRF": ("branches", 0), "BRH": ("branches", 1), "FNF": ("functions", 0), "FNH": ("functions", 1)}
current = None
for line in Path(sys.argv[1]).read_text(encoding="utf-8-sig").splitlines():
    if line.startswith("SF:"):
        parts = line[3:].replace("\\", "/").split("/")
        current = parts[-1] if len(parts) >= 2 and parts[-2] == "electron" and parts[-1] in REQUIRED else None
        if current:
            if current in seen:
                raise SystemExit(f"Duplicate LCOV production record: {current}")
            seen.add(current)
    elif line == "end_of_record":
        current = None
    elif current and ":" in line:
        field, value = line.split(":", 1)
        if field in fields:
            kind, index = fields[field]
            totals[kind][index] += int(value)
if seen != REQUIRED:
    raise SystemExit(f"Missing production coverage: {sorted(REQUIRED-seen)}")
fail = False
for kind, (total, hit) in totals.items():
    if not total or not 0 <= hit <= total:
        raise SystemExit(f"Invalid {kind} coverage denominator")
    percent = 100 * hit / total
    print(f"{kind}: {percent:.2f}% ({hit}/{total}), initial floor {FLOORS[kind]}%")
    fail |= percent < FLOORS[kind]
if fail:
    raise SystemExit("Production-module coverage below initial floor")
