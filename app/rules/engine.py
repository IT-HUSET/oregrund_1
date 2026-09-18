"""Runs the full rule catalog over a case and produces a CaseReport.

Every rule in both deterministic.RULES and judgment.ALL_JUDGMENT_RULES (see
app/rule_catalog.py) is evaluated and
logged — passed or not — which is what makes the per-case audit trail a
complete "these are all the checks that were performed" record rather than
just a list of problems. Judgment rules always run against a redacted copy
of the case when the document is Sekretess-marked; a policy-level finding
is added on top so a Sekretess case is never silently auto-approved purely
because its (redacted) content produced no findings.
"""

from __future__ import annotations

from app.models import Case, CaseReport, CheckResult
from app.redaction import is_sekretess, redact_for_llm
from app.rules import deterministic, judgment

POLICY_SEKRETESS_RULE_ID = "POLICY-SEKRETESS-MANUELL"


def run(case: Case) -> CaseReport:
    results = list(deterministic.run(case))

    redacted_case = redact_for_llm(case)
    results.extend(judgment.run(redacted_case))

    if is_sekretess(case):
        results.append(CheckResult(
            rule_id=POLICY_SEKRETESS_RULE_ID,
            level="arendedokument",
            kind="policy",
            passed=False,
            reasoning=(
                "Handlingen är sekretessmarkerad. Fritext (titlar, dokumentinnehåll) "
                "maskeras och skickas inte till AI-bedömning, vilket gör att flera "
                "kontroller inte kunnat utföras fullt ut. Ärendet kräver därför alltid "
                "en manuell slutgranskning av registraturen innan godkännande, "
                "oavsett övriga kontrollresultat."
            ),
            evidence=f"skyddskod='{case.arendedokument.skyddskod}'",
        ))

    status = "godkänd" if all(r.passed for r in results) else "flaggad"
    return CaseReport(case_id=case.case_id, results=results, status=status)
