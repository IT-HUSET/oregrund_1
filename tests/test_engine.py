"""Accuracy harness: runs the full engine over all 20 seed cases and diffs
the fired rule IDs + overall status against testcases.json's
expected_findings / expected_status.

This is the acceptance check for the whole rule engine (deterministic +
judgment + redaction policy combined) — run it after any rule change.
Any divergence is printed with an explanation rather than hidden, in the
same spirit as the rest of the app: don't silently disagree with the spec.
"""

from __future__ import annotations

import sys

from app.rules.engine import run
from app.store import load_seed_cases


def main() -> int:
    cases = load_seed_cases()
    total = len(cases)
    status_matches = 0
    exact_rule_matches = 0
    divergences = []

    for case in cases:
        report = run(case)
        fired = {r.rule_id for r in report.findings if r.kind != "policy"}
        expected = {f["rule"] for f in case.expected_findings}

        status_ok = report.status == case.expected_status
        rules_ok = fired == expected
        status_matches += status_ok
        exact_rule_matches += rules_ok

        if not status_ok or not rules_ok:
            divergences.append({
                "case_id": case.case_id,
                "beskrivning": case.beskrivning,
                "expected_status": case.expected_status,
                "actual_status": report.status,
                "expected_rules": sorted(expected),
                "actual_rules": sorted(fired),
                "missing": sorted(expected - fired),
                "unexpected": sorted(fired - expected),
            })

    print(f"Status match:      {status_matches}/{total}")
    print(f"Exact rule match:  {exact_rule_matches}/{total}")
    print()

    if divergences:
        print(f"--- {len(divergences)} case(s) diverge from testcases.json ---\n")
        for d in divergences:
            print(f"{d['case_id']}: {d['beskrivning']}")
            print(f"  status:   expected={d['expected_status']!r} actual={d['actual_status']!r}")
            if d["missing"]:
                print(f"  MISSING (expected but not fired): {d['missing']}")
            if d["unexpected"]:
                print(f"  UNEXPECTED (fired but not expected): {d['unexpected']}")
            print()
    else:
        print("All cases match testcases.json exactly.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
