"""Heuristic fallback for the 14 judgment rules: pure functions, no I/O.

Used by judgment.evaluate_case() when the Claude API isn't configured or a
call fails. Backed by pattern-matching tuned against the checklist's own
wording and the 20 seed test cases — see README.md's "AI-bedömningen"
section for how this compares to the real model, and CONTRIBUTING.md for
how to add a new rule's heuristic here.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime
from pathlib import Path

from app.redaction import REDACTED_PLACEHOLDER
from app.rules.contacts import ORG_KEYWORDS, ORG_SUFFIXES, classify_contact

DATA_DIR = Path(__file__).parent.parent / "data"

ABBREVIATIONS = json.loads((DATA_DIR / "abbreviations.json").read_text(encoding="utf-8"))
ABBREVIATIONS = {k: v for k, v in ABBREVIATIONS.items() if not k.startswith("_")}

NOT_EVALUATED = {
    "flagged": False,
    "reasoning": (
        "Innehållet är redigerat/maskerat inför AI-bedömning eftersom handlingen är "
        "sekretessmarkerad. Denna kontroll kunde inte utföras automatiskt och ingår "
        "därför i den obligatoriska manuella slutgranskningen."
    ),
    "evidence": None,
    "confidence": None,
}


def is_redacted(text) -> bool:
    return text == REDACTED_PLACEHOLDER


_ENGLISH_MARKERS = {
    "decision", "regarding", "the", "of", "and", "for", "report", "meeting",
    "agreement", "request", "response", "internal", "control", "plan",
}

_SWEDISH_MONTHS = {
    "januari": 1, "februari": 2, "mars": 3, "april": 4, "maj": 5, "juni": 6,
    "juli": 7, "augusti": 8, "september": 9, "oktober": 10, "november": 11,
    "december": 12,
}

_DATING_KEYWORDS = r"(?:daterat|daterad|poststämplat|poststämplad)"
_SWE_DATE = re.compile(
    _DATING_KEYWORDS + r"\s*(?:den\s+)?(\d{1,2})\s+(" + "|".join(_SWEDISH_MONTHS) + r")\s+(\d{4})",
    re.IGNORECASE,
)
_ISO_DATE = re.compile(_DATING_KEYWORDS + r"\s*(\d{4}-\d{2}-\d{2})", re.IGNORECASE)

BESLUT_SIGNAL_RE = re.compile(r"besluta|beslutet|fastställ|tilldelningsbeslut", re.IGNORECASE)

_INBOUND_MARKERS = ("frågar", "inkommet", "inkom ")
_OUTBOUND_MARKERS = ("svar", "expedierat", "expedierad")

_HR_KEYWORDS = ("rekrytering", "anställa", "anställning", "enhetschef", "personal")


def clean_token(tok: str) -> str:
    return tok.strip(".,()”“\"'")


def is_allcaps_short(tok: str) -> bool:
    if tok.lower() in ORG_SUFFIXES:
        return False
    return tok.isalpha() and tok.isupper() and 2 <= len(tok) <= 6


def _analyze_title_abbreviations(title: str) -> dict:
    tokens = [clean_token(t) for t in title.split() if clean_token(t)]
    found, resolved, unresolved = [], [], []
    for tok in tokens:
        low = tok.lower()
        if low in ABBREVIATIONS:
            found.append(tok)
            resolved.append(tok)
        elif is_allcaps_short(tok):
            found.append(tok)
            unresolved.append(tok)
    return {"tokens": tokens, "found": found, "resolved": resolved, "unresolved": unresolved}


def _meaningful_word_count(tokens: list) -> int:
    n = 0
    for tok in tokens:
        low = tok.lower()
        if low in ABBREVIATIONS or is_allcaps_short(tok) or tok.isdigit():
            continue
        if tok.isalpha() and len(tok) >= 3:
            n += 1
    return n


def _looks_like_org_word(tok: str) -> bool:
    low = tok.lower()
    if low in ORG_SUFFIXES:
        return True
    return any(kw in low for kw in ORG_KEYWORDS)


def _titel_personnamn(title: str) -> str:
    tokens = [clean_token(t) for t in title.split() if clean_token(t)]
    for i in range(1, len(tokens) - 1):
        a, b = tokens[i], tokens[i + 1]
        if len(a) < 2 or len(b) < 2:
            continue
        if _looks_like_org_word(a) or _looks_like_org_word(b):
            continue
        if a.isalpha() and b.isalpha() and a.istitle() and b.istitle():
            return f"{a} {b}"
    return ""


def parse_swedish_or_iso_date(text: str):
    m = _SWE_DATE.search(text)
    if m:
        day, month_name, year = m.groups()
        return date(int(year), _SWEDISH_MONTHS[month_name.lower()], int(day))
    m = _ISO_DATE.search(text)
    if m:
        return datetime.strptime(m.group(1), "%Y-%m-%d").date()
    return None


def _h_titel_clarity(payload: dict) -> dict:
    title = payload["title"]
    if is_redacted(title):
        return dict(NOT_EVALUATED)
    analysis = _analyze_title_abbreviations(title)
    meaningful = _meaningful_word_count(analysis["tokens"])
    if meaningful == 0 and analysis["unresolved"]:
        return {
            "flagged": True,
            "reasoning": f"Titeln '{title}' beskriver inte vad handlingen rör — den består enbart av oidentifierbara/oförklarade tokens ({', '.join(analysis['unresolved'])}) utan igenkännbara ord.",
            "evidence": title,
            "confidence": 0.8,
        }
    return {"flagged": False, "reasoning": "Titeln innehåller igenkännbara ord som beskriver innehållet (eller endast kända, expanderbara förkortningar).", "evidence": title, "confidence": 0.7}


def _h_titel_abbreviations(payload: dict) -> dict:
    title = payload["title"]
    if is_redacted(title):
        return dict(NOT_EVALUATED)
    analysis = _analyze_title_abbreviations(title)
    if analysis["found"]:
        return {
            "flagged": True,
            "reasoning": f"Titeln innehåller outskrivna förkortningar ({', '.join(analysis['found'])}).",
            "evidence": title,
            "confidence": 0.85,
        }
    return {"flagged": False, "reasoning": "Inga förkortningar identifierades i titeln.", "evidence": title, "confidence": 0.7}


def _h_titel_english(payload: dict) -> dict:
    title = payload["title"]
    if is_redacted(title):
        return dict(NOT_EVALUATED)
    tokens = [clean_token(t).lower() for t in title.split()]
    hits = [t for t in tokens if t in _ENGLISH_MARKERS]
    if hits:
        return {
            "flagged": True,
            "reasoning": f"Titeln är på engelska ({', '.join(hits)}) trots att dokumentet/sakinnehållet är på svenska och ingen anledning till engelsk titel framgår.",
            "evidence": title,
            "confidence": 0.75,
        }
    return {"flagged": False, "reasoning": "Titeln innehåller inga engelska markörord.", "evidence": title, "confidence": 0.6}


def _h_titel_personnamn(payload: dict) -> dict:
    title = payload["title"]
    if is_redacted(title):
        return dict(NOT_EVALUATED)
    name = _titel_personnamn(title)
    if name:
        return {
            "flagged": True,
            "reasoning": f"Titeln innehåller ett personnamn ('{name}').",
            "evidence": title,
            "confidence": 0.7,
        }
    return {"flagged": False, "reasoning": "Inget personnamn identifierades i titeln.", "evidence": title, "confidence": 0.6}


def _h_kontakt_individual(payload: dict) -> dict:
    value = payload["value"]
    field_label = payload.get("field_label", "kontaktfältet")
    category = classify_contact(value)
    if category == "person":
        return {
            "flagged": True,
            "reasoning": f"{field_label} är angiven som en enskild tjänsteperson ('{value}') i stället för den organisation personen företräder.",
            "evidence": value,
            "confidence": 0.75,
        }
    return {"flagged": False, "reasoning": f"{field_label} klassificeras inte som en enskild persons namn.", "evidence": value, "confidence": 0.6}


def _h_datum_match(payload: dict) -> dict:
    text = payload["text"]
    if is_redacted(text):
        return dict(NOT_EVALUATED)
    registered = payload["registered_date"]
    mentioned = parse_swedish_or_iso_date(text)
    if not mentioned or not registered:
        return {"flagged": False, "reasoning": "Inget entydigt daterings-uttryck hittades i dokumenttexten att jämföra mot.", "evidence": None, "confidence": 0.4}
    try:
        reg_date = datetime.strptime(registered, "%Y-%m-%d").date()
    except ValueError:
        return {"flagged": False, "reasoning": "Registrerat datum kunde inte tolkas.", "evidence": registered, "confidence": 0.3}
    diff = abs((mentioned - reg_date).days)
    if diff > 3:
        return {
            "flagged": True,
            "reasoning": f"Registrerat datum ({reg_date.isoformat()}) stämmer inte med det datum handlingen själv anger ({mentioned.isoformat()}) — {diff} dagars avvikelse.",
            "evidence": text,
            "confidence": 0.8,
        }
    return {"flagged": False, "reasoning": f"Registrerat datum ({reg_date.isoformat()}) matchar (inom rimlig marginal) det datum handlingen själv anger ({mentioned.isoformat()}).", "evidence": text, "confidence": 0.7}


def _h_handlingstyp_match(payload: dict) -> dict:
    text = payload["text"]
    if is_redacted(text):
        return dict(NOT_EVALUATED)
    handlingstyp = payload["handlingstyp"]
    is_beslut_type = "beslut" in handlingstyp.lower()
    has_beslut_signal = bool(BESLUT_SIGNAL_RE.search(text))
    if has_beslut_signal and not is_beslut_type:
        return {
            "flagged": True,
            "reasoning": f"Innehållet uttrycker ett beslut men handlingstypen är registrerad som '{handlingstyp}' i stället för Beslut.",
            "evidence": text,
            "confidence": 0.75,
        }
    if is_beslut_type and not has_beslut_signal and text.strip():
        return {
            "flagged": True,
            "reasoning": f"Handlingstypen är registrerad som Beslut ('{handlingstyp}'), men innehållet ger inget stöd för att ett beslut faktiskt fattats.",
            "evidence": text,
            "confidence": 0.6,
        }
    return {"flagged": False, "reasoning": "Handlingstypen och innehållet stämmer överens (eller innehållet ger inte underlag att avgöra motsatsen).", "evidence": text, "confidence": 0.6}


def _h_kategori_mixed(payload: dict) -> dict:
    if is_redacted(payload["text"]):
        return dict(NOT_EVALUATED)
    text = payload["text"].lower()
    inbound = any(m in text for m in _INBOUND_MARKERS)
    outbound = any(m in text for m in _OUTBOUND_MARKERS)
    if inbound and outbound:
        return {
            "flagged": True,
            "reasoning": "Dokumentet innehåller tecken på både en inkommen handling och ett utgående svar i samma ärendedokument; dessa ska diarieföras separat med korrekt riktning var för sig.",
            "evidence": payload["text"],
            "confidence": 0.7,
        }
    return {"flagged": False, "reasoning": "Inga tecken på blandad riktning (inkommet + utgående) i samma dokument.", "evidence": payload["text"], "confidence": 0.5}


def _h_process_match(payload: dict) -> dict:
    if is_redacted(payload.get("arende_titel")) or is_redacted(payload.get("dokument_titel")):
        return dict(NOT_EVALUATED)
    process = payload["process"].lower()
    combined_text = " ".join([payload.get("arende_titel", ""), payload.get("dokument_titel", "")]).lower()
    is_hr_case = any(kw in combined_text for kw in _HR_KEYWORDS)
    process_looks_hr = any(kw in process for kw in ("hr", "personal", "rekrytering"))
    if is_hr_case and not process_looks_hr:
        return {
            "flagged": True,
            "reasoning": f"Ärendet rör en personal-/HR-fråga men har fått processen '{payload['process']}', vilket inte stämmer med Statskontorets klassificeringsstruktur för personalärenden.",
            "evidence": payload["process"],
            "confidence": 0.65,
        }
    return {"flagged": False, "reasoning": "Vald process ser ut att stämma överens med vad ärendet rör (utifrån tillgängliga nyckelord).", "evidence": payload["process"], "confidence": 0.4}


def _ad_kontakt_individual(case) -> dict:
    ad = case.arendedokument
    for value, label in ((ad.avsandare, "Avsändaren"), (ad.mottagare, "Mottagaren")):
        r = _h_kontakt_individual({"value": value, "field_label": label})
        if r["flagged"]:
            return r
    return {"flagged": False, "reasoning": "Varken avsändare eller mottagare klassificeras som en enskild persons namn.", "evidence": None, "confidence": 0.6}


def evaluate_all(case) -> dict:
    """Builds all 14 judgment results for a case without any network call."""
    ad = case.arendedokument
    return {
        "AR-TITEL-1": _h_titel_clarity({"title": case.arende.titel}),
        "AR-TITEL-2": _h_titel_abbreviations({"title": case.arende.titel}),
        "AR-TITEL-3": _h_titel_english({"title": case.arende.titel}),
        "AR-TITEL-4": _h_titel_personnamn({"title": case.arende.titel}),
        "AD-TITEL-1": _h_titel_clarity({"title": ad.titel}),
        "AD-TITEL-2": _h_titel_abbreviations({"title": ad.titel}),
        "AD-TITEL-3": _h_titel_english({"title": ad.titel}),
        "AD-TITEL-4": _h_titel_personnamn({"title": ad.titel}),
        "AR-KONTAKT-4": _h_kontakt_individual({"value": case.arende.kontakt, "field_label": "Ärendets kontaktfält"}),
        "AD-KONTAKT-4": _ad_kontakt_individual(case),
        "AD-DATUM-1": _h_datum_match({"text": case.dokumenttext, "registered_date": ad.ankomstdatum or ad.dokumentdatum}),
        "AD-HANDLINGSTYP-1": _h_handlingstyp_match({"text": case.dokumenttext, "handlingstyp": ad.handlingstyp}),
        "AD-KATEGORI-1": _h_kategori_mixed({"text": case.dokumenttext}),
        "AR-PROCESS-1": _h_process_match({
            "process": case.arende.process,
            "arende_titel": case.arende.titel,
            "dokument_titel": ad.titel,
        }),
    }
