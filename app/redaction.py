"""Sekretess safeguard: mask free text before it ever reaches judgment.py.

This is a real guardrail, not just a documented intention: engine.py calls
redact_for_llm(case) and passes the RESULT — never the original case — into
the judgment rules. judgment.py's heuristics stand in for a real LLM call,
but the point of this module is that the redaction happens regardless of
what's on the other side of that seam, so swapping in a real external model
later doesn't require anyone to remember to add the safeguard then.

Scope: only free-text fields where substantive case content lives (document
titles and body text) are redacted. Organization/contact identifiers are
left intact, since an organization's name is not itself normally the
sekretessbelagda uppgift — the case *content* is. This is a simplification;
a real deployment should have a jurist confirm the scope per case type.
"""

from __future__ import annotations

import dataclasses

from app.models import Case

REDACTED_PLACEHOLDER = "[REDIGERAT – sekretessbelagt innehåll skickas inte till AI-bedömning]"


def is_sekretess(case: Case) -> bool:
    return case.arendedokument.skyddskod.strip().lower() == "sekretess"


def redact_for_llm(case: Case) -> Case:
    if not is_sekretess(case):
        return case
    redacted_arende = dataclasses.replace(case.arende, titel=REDACTED_PLACEHOLDER)
    redacted_dokument = dataclasses.replace(case.arendedokument, titel=REDACTED_PLACEHOLDER)
    return dataclasses.replace(
        case,
        arende=redacted_arende,
        arendedokument=redacted_dokument,
        dokumenttext=REDACTED_PLACEHOLDER,
    )
