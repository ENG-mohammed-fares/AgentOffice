"""Measure completed GitHub Actions runs without altering their release gates."""

import argparse
import json
import os
from datetime import datetime
from pathlib import Path
from statistics import median
from http.client import HTTPSConnection


REPOSITORY = "ENG-mohammed-fares/AgentOffice"
OUTPUT = Path("ci-timings.json")
API_PATH = "/repos/ENG-mohammed-fares/AgentOffice/actions"


def duration(start, end):
    """Return elapsed seconds for valid ordered ISO timestamps, or None."""
    if not start or not end:
        return None
    try:
        first = datetime.fromisoformat(start.replace("Z", "+00:00"))
        last = datetime.fromisoformat(end.replace("Z", "+00:00"))
        seconds = (last - first).total_seconds()
    except (TypeError, ValueError):
        return None
    return seconds if seconds >= 0 else None


def summarize(values):
    """Return observed sample count, median and nearest-rank p90 in seconds."""
    ordered = sorted(value for value in values if value is not None)
    if not ordered:
        return {"samples": 0, "p50_seconds": None, "p90_seconds": None}
    rank = max(0, (9 * len(ordered) + 9) // 10 - 1)
    return {"samples": len(ordered), "p50_seconds": median(ordered),
            "p90_seconds": ordered[rank]}


def measure(runs, jobs_by_run):
    """Group queue, execution and total durations by workflow and job name."""
    observations = {}
    omissions = 0
    for run in runs:
        if run.get("status") != "completed":
            omissions += 1
            continue
        workflow = run.get("name") or "Unnamed workflow"
        key = (workflow, "Total run")
        observations.setdefault(key, {"queue": [], "execute": [], "total": []})
        total = duration(run.get("created_at"), run.get("updated_at"))
        if total is None:
            omissions += 1
        observations[key]["total"].append(total)
        for job in jobs_by_run.get(run["id"], []):
            if job.get("status") != "completed":
                omissions += 1
                continue
            key = (workflow, job.get("name") or "Unnamed job")
            values = observations.setdefault(key, {"queue": [], "execute": [], "total": []})
            queue = duration(job.get("created_at"), job.get("started_at"))
            execute = duration(job.get("started_at"), job.get("completed_at"))
            if queue is None or execute is None:
                omissions += 1
            values["queue"].append(queue)
            values["execute"].append(execute)
            values["total"].append(duration(job.get("created_at"), job.get("completed_at")))
            for step in job.get("steps", []):
                if step.get("status") != "completed":
                    continue
                step_seconds = duration(step.get("started_at"), step.get("completed_at"))
                step_key = (workflow, f"{job.get('name') or 'Unnamed job'} / "
                            f"{step.get('name') or 'Unnamed step'}")
                step_values = observations.setdefault(
                    step_key, {"queue": [], "execute": [], "total": []})
                if step_seconds is None:
                    omissions += 1
                step_values["execute"].append(step_seconds)
                step_values["total"].append(step_seconds)
    return {"omitted_incomplete_records": omissions, "metrics": [
        {"workflow": workflow, "job": job,
         **{metric: summarize(values[metric]) for metric in ("queue", "execute", "total")}}
        for (workflow, job), values in sorted(observations.items())]}


def fetch_json(path, token):
    """Use a fixed HTTPS host, without following redirects or forwarding the token."""
    connection = HTTPSConnection("api.github.com", timeout=30)
    try:
        connection.request("GET", path, headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"})
        response = connection.getresponse()
        if response.status != 200:
            raise OSError(f"GitHub Actions API returned HTTP {response.status}")
        return json.load(response)
    finally:
        connection.close()


def collect(repository, token, limit):
    """Collect completed runs and all paginated jobs for a bounded sample."""
    if repository != REPOSITORY or type(limit) is not int or not 1 <= limit <= 100:
        raise ValueError("Invalid timing repository or sample limit")
    runs = fetch_json(f"{API_PATH}/runs?status=completed&per_page={limit:d}", token)["workflow_runs"]
    jobs = {}
    for run in runs:
        run_id = run["id"]
        if type(run_id) is not int or run_id <= 0:
            raise ValueError("Invalid GitHub Actions run ID")
        page = 1
        jobs[run_id] = []
        while True:
            data = fetch_json(f"{API_PATH}/runs/{run_id:d}/jobs?per_page=100&page={page:d}", token)
            batch = data["jobs"]
            jobs[run_id].extend(batch)
            if len(batch) < 100:
                break
            page += 1
    return measure(runs, jobs)


def markdown_cell(value):
    """Keep untrusted workflow names as plain text in the Markdown summary."""
    return "".join(character if character.isalnum() or character in " -_./()" else " "
                   for character in value)


def main():
    """Write machine-readable observations and a compact Actions summary."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True, choices=(REPOSITORY,))
    parser.add_argument("--output", required=True, choices=("ci-timings.json",))
    parser.add_argument("--limit", type=int, default=30)
    args = parser.parse_args()
    if not 1 <= args.limit <= 100:
        parser.error("--limit must be between 1 and 100")
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        parser.error("GITHUB_TOKEN is required")
    try:
        report = collect(args.repository, token, args.limit)
    except (KeyError, OSError, ValueError) as error:
        parser.exit(1, f"Cannot collect Actions timing metadata: {error}\n")
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        rows = ["## CI timing baseline", "", "Observed completed runs; seconds, no speedup claim.",
                f"Incomplete records omitted: {report['omitted_incomplete_records']}", "",
                "| Workflow | Job | Execution samples | p50 (s) | p90 (s) |", "|---|---|---:|---:|---:|"]
        for item in report["metrics"]:
            execution = item["execute"] if item["job"] != "Total run" else item["total"]
            workflow = markdown_cell(item['workflow'])
            job = markdown_cell(item['job'])
            rows.append(f"| {workflow} | {job} | {execution['samples']} | "
                        f"{execution['p50_seconds']} | {execution['p90_seconds']} |")
        with open(summary, "a", encoding="utf-8") as file:
            file.write("\n".join(rows) + "\n")


if __name__ == "__main__":
    main()
