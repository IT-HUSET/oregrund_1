"""Small helpers shared by deterministic.py and judgment.py.

Every rule function has the signature (case: Case) -> CheckResult. Using
ok()/fail() keeps every rule's logging obligation (rule_id, level, kind,
passed, reasoning, evidence) explicit and consistent, which is what makes
"log every rule evaluated, not just the ones that fire" actually hold.
"""

from __future__ import annotations

from app.models import CheckResult


def ok(rule_id: str, level: str, kind: str, reasoning: str, evidence=None, confidence=None, engine=None) -> CheckResult:
    return CheckResult(
        rule_id=rule_id, level=level, kind=kind, passed=True,
        reasoning=reasoning, evidence=evidence, confidence=confidence, engine=engine,
    )


def fail(rule_id: str, level: str, kind: str, reasoning: str, evidence=None, confidence=None, engine=None) -> CheckResult:
    return CheckResult(
        rule_id=rule_id, level=level, kind=kind, passed=False,
        reasoning=reasoning, evidence=evidence, confidence=confidence, engine=engine,
    )
