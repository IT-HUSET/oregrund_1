"""Judgment rules: anything needing text/semantic understanding.

Each case is evaluated against all 14 judgment rules (app/rule_catalog.py)
in a single bundled call to Claude (app/llm_client.py), using structured
outputs so the response is schema-guaranteed JSON. If the API isn't
configured or a call fails, evaluate_case() falls back to the heuristic
implementation in app/rules/heuristics.py — and tags every result with
which engine actually produced it (CheckResult.engine), so a fallback is
visible in the UI rather than silently indistinguishable from a real
model judgment. Sekretess-marked cases never reach either engine:
engine.py passes in a redacted case (see redaction.py), and
evaluate_case() short-circuits before any network call when it detects
redacted content, so nothing masked is ever sent anywhere.

Results are cached in-memory per case content, since case-detail reads
(GET /api/cases, GET /api/cases/<id>) re-run the full rule catalog on every
request — without caching, just opening the case queue would re-trigger a
live API call per case on every page load.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading

from app import llm_client
from app.models import Case
from app.rule_catalog import JUDGMENT_RULES
from app.rules import heuristics
from app.rules.base import ok, fail

logger = logging.getLogger(__name__)

KIND = "judgment"

ALL_JUDGMENT_RULES = [(r.rule_id, r.level) for r in JUDGMENT_RULES]


def expand_abbreviations(title: str):
    """Attempts to expand every abbreviation-looking token in a title.

    Returns (new_title, unresolved_tokens). new_title is None when nothing
    could be confidently expanded (either there was nothing to expand, or
    some tokens looked like abbreviations but aren't in the dictionary —
    in which case we refuse to guess, per the auto-fix policy in
    app/autofix.py: whitelisted rule *types* are allowed to try, but a
    fix is only ever applied when it can be produced with confidence).
    """
    tokens = title.split()
    unresolved = []
    new_tokens = []
    changed = False
    for raw in tokens:
        core = heuristics.clean_token(raw)
        low = core.lower()
        if core and low in heuristics.ABBREVIATIONS:
            expansion = heuristics.ABBREVIATIONS[low]
            new_tokens.append(raw.replace(core, expansion) if core else raw)
            changed = True
        elif core and heuristics.is_allcaps_short(core):
            unresolved.append(core)
            new_tokens.append(raw)
        else:
            new_tokens.append(raw)
    if unresolved:
        return None, unresolved
    if not changed:
        return None, []
    return " ".join(new_tokens), []


def _is_case_redacted(case: Case) -> bool:
    return (
        heuristics.is_redacted(case.arende.titel)
        or heuristics.is_redacted(case.arendedokument.titel)
        or heuristics.is_redacted(case.dokumenttext)
    )


def _cache_key(case: Case) -> str:
    ad = case.arendedokument
    payload = json.dumps({
        "arende_titel": case.arende.titel, "process": case.arende.process, "kontakt": case.arende.kontakt,
        "ad_titel": ad.titel, "handlingstyp": ad.handlingstyp, "avsandare": ad.avsandare, "mottagare": ad.mottagare,
        "ankomstdatum": ad.ankomstdatum, "dokumentdatum": ad.dokumentdatum, "dokumenttext": case.dokumenttext,
    }, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


_cache_lock = threading.Lock()
_CACHE: dict = {}


def evaluate_case(case: Case):
    """Returns (results_by_rule_id, engine_used). engine_used is one of
    "claude-api", "heuristic-fallback", or "redacted-not-evaluated"."""
    if _is_case_redacted(case):
        return {rule_id: dict(heuristics.NOT_EVALUATED) for rule_id, _ in ALL_JUDGMENT_RULES}, "redacted-not-evaluated"

    key = _cache_key(case)
    with _cache_lock:
        cached = _CACHE.get(key)
    if cached is not None:
        return cached

    if llm_client.is_configured():
        try:
            results = llm_client.judge_case(case)
            outcome = (results, "claude-api")
            with _cache_lock:
                _CACHE[key] = outcome
            return outcome
        except (llm_client.LLMNotConfigured, llm_client.LLMCallFailed) as e:
            logger.warning("Claude API judgment call failed for %s, falling back to heuristic: %s", case.case_id, e)

    outcome = (heuristics.evaluate_all(case), "heuristic-fallback")
    with _cache_lock:
        _CACHE[key] = outcome
    return outcome


def run(case: Case) -> list:
    results_by_rule, engine_used = evaluate_case(case)
    out = []
    for rule_id, level in ALL_JUDGMENT_RULES:
        r = results_by_rule[rule_id]
        fn = fail if r["flagged"] else ok
        out.append(fn(rule_id, level, KIND, r["reasoning"], evidence=r.get("evidence"), confidence=r.get("confidence"), engine=engine_used))
    return out
