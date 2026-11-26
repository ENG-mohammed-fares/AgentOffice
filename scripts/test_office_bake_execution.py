"""Measure real Blender execution against the canonical generated office.

Run only with Blender in the Linux asset job, never as part of the Windows
unittest discovery. Coverage records executed Python lines and branches.
"""
import json
import runpy
import sys
from pathlib import Path


def run_bake_coverage():
    import coverage

    root = Path(__file__).resolve().parents[1]
    if Path.cwd() != root:
        raise RuntimeError("Expected repository working directory")
    script = root / "assets/agile-office/bake-office-candidate.py"
    output = root / "office-candidates"
    original_argv = sys.argv[:]
    cov = coverage.Coverage(
        branch=True,
        source=["assets/agile-office"],
        data_file=str(root / ".coverage.office-bake"),
    )
    cov.set_option("run:relative_files", True)
    cov.start()
    try:
        common = [
            str(script), "--", "--source", "assets/agile-office/office.glb",
            "--layout", "assets/agile-office/scene.json", "--output",
            "office-candidates", "--samples", "16", "--atlas", "1024",
        ]
        for combined in (False, True):
            sys.argv = common + (["--combined"] if combined else [])
            runpy.run_path(str(script), run_name="__main__")
            report = json.loads((output / "bake-report.json").read_text())
            expected_mode = "combined" if combined else "diffuse"
            if report["mode"] != expected_mode or not report["baked_nodes"]:
                raise RuntimeError("Unexpected actual bake report")
            if report["original"]["triangles"] != report["candidate"]["triangles"]:
                raise RuntimeError("Baked topology changed")
            if any(name.lower().startswith("chair_") for name in report["baked_nodes"]):
                raise RuntimeError("A movable chair was baked as static geometry")
            if not combined:
                for index in range(4):
                    if not (output / f"view-{index}.png").is_file():
                        raise RuntimeError("Missing actual Full HD preview")
    finally:
        cov.stop()
        cov.save()
        sys.argv = original_argv
    cov.xml_report(
        outfile=str(root / "compressed/office-bake-coverage.xml"),
        include=["*/bake-office-candidate.py", "assets/agile-office/bake-office-candidate.py"],
    )


if __name__ == "__main__":
    run_bake_coverage()
