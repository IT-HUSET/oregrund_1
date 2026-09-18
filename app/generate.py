"""Step 3: propose a full dokumentkort from raw file content alone.

Reuses the exact same judgment heuristics, engine, and autofix pipeline as
Steps 1/2 — a generated card is just "QC on an empty card". Nothing
generated here is ever returned to the caller without having gone through
engine.run() and autofix.apply_autofixes() first, and the whole thing is
logged like any other case, which is the point: Step 3 doesn't bypass QC,
it feeds it.
"""

from __future__ import annotations

import re

from app.audit import audit_log
from app.autofix import apply_autofixes
from app.models import Arende, Arendedokument, Case, Fil
from app.rules import heuristics
from app.rules.engine import run as run_engine

_BESLUT_SIGNAL_RE = heuristics.BESLUT_SIGNAL_RE


def _guess_titel(dokumenttext: str, fallback: str) -> str:
    if fallback:
        return fallback
    words = re.findall(r"[^\s]+", dokumenttext)[:8]
    guess = " ".join(words).rstrip(".,;:")
    return guess or "Ny handling (titel ej angiven)"


def _guess_datum(dokumenttext: str) -> str:
    text = dokumenttext if "daterat" in dokumenttext.lower() else "daterat " + dokumenttext
    d = heuristics.parse_swedish_or_iso_date(text)
    return d.isoformat() if d else ""


def generate_dokumentkort(dokumenttext: str, arende_titel: str = "", kontakt=None) -> Arendedokument:
    is_beslut = bool(_BESLUT_SIGNAL_RE.search(dokumenttext))
    handlingstyp = "6.1-1 - Beslut" if is_beslut else "2.3.1-5 (Korrespondens)"
    dokumentkategori = "Internt" if is_beslut else "Inkommande"
    titel = _guess_titel(dokumenttext, arende_titel)
    datum = _guess_datum(dokumenttext)
    return Arendedokument(
        titel=titel,
        handlingstyp=handlingstyp,
        dokumentkategori=dokumentkategori,
        skyddskod="Allmän handling - Offentlig",
        atkomstgrupp="Alla",
        avsandare=None if is_beslut else kontakt,
        mottagare="Statskontoret" if not is_beslut else None,
        kopia_till="",
        ankomstdatum=datum,
        dokumentdatum=datum,
        status="Registrerat",
        antal_bilagor=0,
    )


def generate_case(case_id: str, arende: Arende, dokumenttext: str):
    """Generates a dokumentkort, then immediately runs it through the full
    check -> autofix pipeline. Returns (case, report, fixes)."""
    ad = generate_dokumentkort(dokumenttext, arende_titel=arende.titel, kontakt=arende.kontakt)
    fil = Fil(filer=["(genererat från inskickad text)"], ar_zip=False, ar_uppackad=None,
              ar_lasbar=True, ar_dubbelsidig_original=False, ar_korrekt_skannad=True,
              ar_undertecknad_version=None)
    case = Case(case_id=case_id, beskrivning="Genererat ärendedokument (Steg 3 — AI-förslag från text)",
                arende=arende, arendedokument=ad, fil=fil, dokumenttext=dokumenttext, source="generated")

    audit_log.log(case_id, "generated", "AI",
                   f"Ärendedokument föreslaget automatiskt från inskickad text (handlingstyp={ad.handlingstyp}).",
                   detail={"dokumenttext": dokumenttext})

    report = run_engine(case)
    for r in report.results:
        audit_log.log(case_id, "check_run", "AI", f"{r.rule_id}: {'OK' if r.passed else 'FLAGGAD'} — {r.reasoning}")

    new_case, fixes = apply_autofixes(case, report)
    if new_case is not case:
        report = run_engine(new_case)

    return new_case, report, fixes
