"""Step 2: apply high-confidence fixes for a small whitelist of rule types.

Per the policy agreed for this build: nothing touching sekretess, contact
identity/registration, dates, or handlingstyp is ever auto-fixable — those
always go to a human. Only AD-KONTAKT-5 (clearing a stray "kopia till") and
AD-TITEL-2 / AR-TITEL-2 (expanding recognized abbreviations) are eligible.

Being whitelisted only means a rule type is *allowed to try* — it does not
mean a fix is always applied. AD-TITEL-2/AR-TITEL-2 fall back to
needs_human whenever the abbreviation dictionary can't confidently resolve
every abbreviation-looking token (see judgment.expand_abbreviations), so an
eligible rule type never silently applies a guess.

Every outcome — applied or fallen-back — is written to the audit log.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from typing import Optional

from app.audit import audit_log
from app.models import Case, CaseReport, CheckResult
from app.rules import judgment

AUTOFIX_WHITELIST = {"AD-KONTAKT-5", "AD-TITEL-2", "AR-TITEL-2"}


@dataclass
class ProposedFix:
    rule_id: str
    field_path: str
    before: str
    after: Optional[str]
    status: str  # "auto_applied" | "needs_human"
    reasoning: str

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


def _build_fix(case: Case, finding: CheckResult) -> ProposedFix:
    if finding.rule_id == "AD-KONTAKT-5":
        before = case.arendedokument.kopia_till
        return ProposedFix(
            rule_id=finding.rule_id, field_path="arendedokument.kopia_till",
            before=before, after="", status="auto_applied",
            reasoning="Fältet 'Kopia till' rensas — mekanisk åtgärd, alltid säker inom whitelisten.",
        )

    title_field = "arendedokument.titel" if finding.rule_id == "AD-TITEL-2" else "arende.titel"
    before = case.arendedokument.titel if finding.rule_id == "AD-TITEL-2" else case.arende.titel
    new_title, unresolved = judgment.expand_abbreviations(before)
    if new_title is None:
        return ProposedFix(
            rule_id=finding.rule_id, field_path=title_field, before=before, after=None,
            status="needs_human",
            reasoning=(
                f"Kan inte expandera med säkerhet: {', '.join(unresolved)} finns inte i "
                f"förkortningsordlistan. Regeltypen är whitelistad men gissar inte — flaggas för människa."
                if unresolved else
                "Ingen känd förkortning kunde identifieras att expandera trots att regeln flaggade titeln."
            ),
        )
    return ProposedFix(
        rule_id=finding.rule_id, field_path=title_field, before=before, after=new_title,
        status="auto_applied",
        reasoning=f"Samtliga förkortningar i titeln finns i ordlistan och har expanderats med säkerhet.",
    )


def _apply(case: Case, fix: ProposedFix) -> Case:
    if fix.field_path == "arendedokument.kopia_till":
        return dataclasses.replace(case, arendedokument=dataclasses.replace(case.arendedokument, kopia_till=fix.after))
    if fix.field_path == "arendedokument.titel":
        return dataclasses.replace(case, arendedokument=dataclasses.replace(case.arendedokument, titel=fix.after))
    if fix.field_path == "arende.titel":
        return dataclasses.replace(case, arende=dataclasses.replace(case.arende, titel=fix.after))
    raise ValueError(f"Unknown field_path: {fix.field_path}")


def propose_fixes(case: Case, report: CaseReport) -> list:
    """Pure preview: what would happen for whitelisted findings, with no
    side effects (no store mutation, no audit log entries). Used by the
    read-only case-detail view so opening a case doesn't itself change it."""
    return [
        _build_fix(case, finding)
        for finding in report.findings
        if finding.kind != "policy" and finding.rule_id in AUTOFIX_WHITELIST
    ]


def apply_autofixes(case: Case, report: CaseReport):
    """Returns (possibly-updated Case, list[ProposedFix]) and, unlike
    propose_fixes(), actually applies auto_applied fixes and writes every
    outcome (applied or fallen-back) to the audit log. Call this only from
    an explicit action (the /autofix endpoint), never from a read path.
    """
    new_case = case
    fixes = []
    for finding in report.findings:
        if finding.kind == "policy" or finding.rule_id not in AUTOFIX_WHITELIST:
            continue
        fix = _build_fix(new_case, finding)
        fixes.append(fix)
        if fix.status == "auto_applied":
            new_case = _apply(new_case, fix)
            audit_log.log(
                case.case_id, "autofix_applied", "AI",
                f"{fix.rule_id}: '{fix.before}' -> '{fix.after}'",
                detail=fix.to_dict(),
            )
        else:
            audit_log.log(
                case.case_id, "autofix_skipped", "AI",
                f"{fix.rule_id}: {fix.reasoning}",
                detail=fix.to_dict(),
            )
    return new_case, fixes


def record_human_decision(case_id: str, rule_id: str, action: str, detail: dict = None) -> None:
    summary = f"{rule_id}: registrator {'godkände' if action == 'approve' else 'avvisade'} förslaget."
    audit_log.log(case_id, f"human_{action}d", "Registrator", summary, detail=detail)
