#!/usr/bin/env python3
"""
jobspy_runner.py — thin sidecar for providers/jobspy.mjs.

Reads a JSON args object from stdin, calls python-jobspy scrape_jobs(),
and prints a JSON array of job records to stdout.

stdin JSON shape:
  { "sites": [...], "term": "...", "location": "...",
    "results_wanted": 25, "hours_old": 168, "proxies": null | [...] }

stdout: JSON array of job dicts (all columns python-jobspy returns).
stderr: any error messages (caller treats non-zero exit as failure).
"""
import sys
import json


def main():
    try:
        a = json.load(sys.stdin)
    except Exception as e:
        print(f"ERROR: could not parse stdin JSON: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        from jobspy import scrape_jobs
    except ImportError:
        print("ERROR: python-jobspy not installed. Run: pip install python-jobspy", file=sys.stderr)
        sys.exit(1)

    kwargs = dict(
        site_name=a["sites"],
        search_term=a["term"],
        location=a["location"],
        results_wanted=a["results_wanted"],
        hours_old=a["hours_old"],
    )
    if a.get("proxies"):
        kwargs["proxies"] = a["proxies"]

    try:
        df = scrape_jobs(**kwargs)
    except Exception as e:
        print(f"ERROR: scrape_jobs failed: {e}", file=sys.stderr)
        sys.exit(1)

    cols = [
        "title", "company", "location", "job_url", "description",
        "date_posted", "min_amount", "max_amount", "currency", "site",
    ]
    df = df[[c for c in cols if c in df.columns]].fillna("")
    df["date_posted"] = df["date_posted"].astype(str)
    print(json.dumps(df.to_dict("records"), default=str))


if __name__ == "__main__":
    main()
