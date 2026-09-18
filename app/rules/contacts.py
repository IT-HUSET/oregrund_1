"""Shared contact classification used by both deterministic and judgment rules.

Classifying a contact string as an email address is pure pattern matching
(deterministic). Classifying it as "an individual person" vs "an
organization" is a judgment call in a real system (that's why AD/AR-KONTAKT-4
is one of the 14 rules Claude bedöms in app/llm_client.py, with a heuristic
fallback in app/rules/heuristics.py) but is implemented here as a heuristic
shared by both, so KONTAKT-2/3 (deterministic) and KONTAKT-4 (judgment)
agree on what a contact "is" and never double-flag the same string under
two different rules.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

ORG_SUFFIXES = {"ab", "hb", "kb", "ag"}

# Substrings that strongly indicate an organization name rather than a
# person, drawn from the checklist's own examples and the registered
# contacts in the seed data. Exported for reuse by judgment.py's title
# heuristics (personnamn / abbreviation detection), so both modules agree
# on what counts as "clearly an organization, not a person or an
# abbreviation to expand".
ORG_KEYWORDS = [
    "myndighet", "verket", "kommun", "förvaltning", "kontoret", "styrelsen",
    "departementet", "inspektionen", "nämnden", "rådet", "organisationen",
    "leverant", "universitetet", "sekretariatet", "akademin",
    "statskontoret", "riksarkivet", "ekonomistyrningsverket",
]
_ORG_SUFFIXES = ORG_SUFFIXES
_ORG_KEYWORDS = ORG_KEYWORDS


def load_registry() -> set:
    raw = json.loads((DATA_DIR / "kontaktregister.json").read_text(encoding="utf-8"))
    return {name.strip().lower() for name in raw.get("organisationer", [])}


REGISTRY = load_registry()


def is_registered(value: str) -> bool:
    return value.strip().lower() in REGISTRY


def classify_contact(value):
    """Returns one of "empty" | "email" | "person" | "org"."""
    if not value or not value.strip():
        return "empty"
    v = value.strip()
    if _EMAIL_RE.match(v):
        return "email"
    lower = v.lower()
    if any(kw in lower for kw in _ORG_KEYWORDS):
        return "org"
    tokens = v.split()
    if any(t.strip(".").lower() in _ORG_SUFFIXES for t in tokens):
        return "org"
    if len(tokens) == 2 and all(t.isalpha() and t[:1].isupper() for t in tokens):
        return "person"
    return "org"
