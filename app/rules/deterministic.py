"""Deterministic rules: pure field comparisons, no text understanding.

Each function takes a Case and returns a CheckResult. These never call the
LLM — that's the point of splitting them out: anything that can be answered
by looking at structured fields is answered in code, kept fast, free, and
trivially auditable, and only genuinely fuzzy questions go through
judgment.py's Claude API call (with a heuristic fallback if it's
unavailable).
"""

from __future__ import annotations

from app.models import Case, CheckResult
from app.rules.base import ok, fail
from app.rules.contacts import classify_contact, is_registered

KIND = "deterministic"


def _kontakt_registry_check(rule_id: str, level: str, value) -> CheckResult:
    category = classify_contact(value)
    if category == "empty":
        return ok(rule_id, level, KIND, "Inget kontaktvärde angivet — inget att slå upp i registret.")
    if category in ("email", "person"):
        return ok(
            rule_id, level, KIND,
            f"Kontakten klassificerades som '{category}', inte en organisation — "
            f"registerkontroll är inte tillämplig (se motsvarande {'KONTAKT-3' if category=='email' else 'KONTAKT-4'}-regel istället).",
            evidence=value,
        )
    if is_registered(value):
        return ok(rule_id, level, KIND, f"'{value}' finns registrerad i Janus kontaktregister.", evidence=value)
    return fail(
        rule_id, level, KIND,
        f"'{value}' finns inte i Janus kontaktregister. En beställning hos registraturen behövs innan handlingen kan godkännas.",
        evidence=value,
    )


def _kontakt_email_check(rule_id: str, level: str, value) -> CheckResult:
    category = classify_contact(value)
    if category == "email":
        return fail(rule_id, level, KIND, f"'{value}' är en mejladress, inte en giltig registrerad kontakt.", evidence=value)
    return ok(rule_id, level, KIND, "Kontaktfältet innehåller inte en mejladress.", evidence=value)


def ar_kontakt_2(case: Case) -> CheckResult:
    return _kontakt_registry_check("AR-KONTAKT-2", "arende", case.arende.kontakt)


def ar_kontakt_3(case: Case) -> CheckResult:
    return _kontakt_email_check("AR-KONTAKT-3", "arende", case.arende.kontakt)


def ad_kontakt_2(case: Case) -> CheckResult:
    ad = case.arendedokument
    for value in (ad.avsandare, ad.mottagare):
        result = _kontakt_registry_check("AD-KONTAKT-2", "arendedokument", value)
        if not result.passed:
            return result
    return ok("AD-KONTAKT-2", "arendedokument", KIND, "Avsändare/mottagare (i förekommande fall) finns registrerade i Janus kontaktregister.")


def ad_kontakt_3(case: Case) -> CheckResult:
    ad = case.arendedokument
    for value in (ad.avsandare, ad.mottagare):
        result = _kontakt_email_check("AD-KONTAKT-3", "arendedokument", value)
        if not result.passed:
            return result
    return ok("AD-KONTAKT-3", "arendedokument", KIND, "Varken avsändare eller mottagare är en mejladress.")


def ad_kontakt_5(case: Case) -> CheckResult:
    kopia = case.arendedokument.kopia_till
    if kopia and kopia.strip():
        return fail(
            "AD-KONTAKT-5", "arendedokument", KIND,
            f"Fältet 'Kopia till' är inte rensat (innehåller '{kopia}').",
            evidence=kopia,
        )
    return ok("AD-KONTAKT-5", "arendedokument", KIND, "Fältet 'Kopia till' är rensat.")


_BESLUT_HANDLINGSTYPER = ("beslut",)


def ad_godkannande_1(case: Case) -> CheckResult:
    ad = case.arendedokument
    if "beslut" not in ad.handlingstyp.lower():
        return ok("AD-GODKANNANDE-1", "arendedokument", KIND, "Handlingstypen är inte ett beslut — godkännandeflöde ej tillämpligt.")
    if ad.godkannandeflode_status == "Saknas":
        return fail(
            "AD-GODKANNANDE-1", "arendedokument", KIND,
            "Beslutet saknar ett registrerat godkännandeflöde; det elektroniska beslutsfattandet har inte hanterats enligt rutin.",
            evidence="godkannandeflode_status = 'Saknas'",
        )
    return ok("AD-GODKANNANDE-1", "arendedokument", KIND, "Godkännandeflöde är registrerat (eller ej ännu flaggat som saknat).")


def ad_sekretess_1(case: Case) -> CheckResult:
    ad = case.arendedokument
    if ad.skyddskod.strip().lower() != "sekretess":
        return ok("AD-SEKRETESS-1", "arendedokument", KIND, "Handlingen är inte sekretessmarkerad.")
    if case.arende.status.strip().lower() == "avslutat":
        return fail(
            "AD-SEKRETESS-1", "arendedokument", KIND,
            "Ärendet är avslutat men skyddskoden är fortfarande satt till 'Sekretess' trots att skälet för sekretess sannolikt inte längre föreligger.",
            evidence=f"skyddskod='{ad.skyddskod}', arende.status='{case.arende.status}'",
        )
    return ok("AD-SEKRETESS-1", "arendedokument", KIND, "Ärendet är inte avslutat — sekretessmarkeringen kan fortsatt vara relevant.")


def fil_undertecknad_1(case: Case) -> CheckResult:
    fil = case.fil
    if fil.ar_undertecknad_version is False:
        return fail(
            "FIL-UNDERTECKNAD-1", "fil", KIND,
            "Den inskannade/bifogade filen är inte den undertecknade versionen av handlingen.",
            evidence=str(fil.filer),
        )
    return ok("FIL-UNDERTECKNAD-1", "fil", KIND, "Filen är (såvitt känt) den undertecknade versionen, eller detta kunde inte avgöras.")


def fil_zip_1(case: Case) -> CheckResult:
    fil = case.fil
    if fil.ar_zip and not fil.ar_uppackad:
        return fail("FIL-ZIP-1", "fil", KIND, f"Zip-filen {fil.filer} har inte packats upp.", evidence=str(fil.filer))
    return ok("FIL-ZIP-1", "fil", KIND, "Ingen ouppackad zip-fil registrerad.")


def fil_antal_1(case: Case) -> CheckResult:
    fil, ad = case.fil, case.arendedokument
    if fil.ar_zip and not fil.ar_uppackad and ad.antal_bilagor > 0:
        return fail(
            "FIL-ANTAL-1", "fil", KIND,
            f"Antal bilagor anges som {ad.antal_bilagor}, men endast zip-arkivet är registrerat — "
            f"antalet stämmer inte överens förrän filerna packas upp och registreras var för sig.",
            evidence=f"antal_bilagor={ad.antal_bilagor}, filer={fil.filer}",
        )
    return ok("FIL-ANTAL-1", "fil", KIND, "Antal bilagor och registrerade filer är konsistenta (eller ej tillämpligt).")


def fil_lasbar_1(case: Case) -> CheckResult:
    fil = case.fil
    if fil.ar_lasbar is False:
        return fail("FIL-LASBAR-1", "fil", KIND, f"Filen {fil.filer} går inte att öppna och bedöms som skadad.", evidence=str(fil.filer))
    return ok("FIL-LASBAR-1", "fil", KIND, "Filen går att öppna.")


def fil_skann_1(case: Case) -> CheckResult:
    fil = case.fil
    if fil.ar_dubbelsidig_original and not fil.ar_korrekt_skannad:
        return fail(
            "FIL-SKANN-1", "fil", KIND,
            "Originalet är dubbelsidigt men har skannats in enkelsidigt — baksidor saknas i den registrerade filen.",
            evidence=str(fil.filer),
        )
    return ok("FIL-SKANN-1", "fil", KIND, "Inskanningen matchar originalets sidor (eller originalet är enkelsidigt).")


def fil_missiv_1(case: Case) -> CheckResult:
    fil = case.fil
    if fil.mejlmissiv_diarieford is False:
        return fail("FIL-MISSIV-1", "fil", KIND, "Mejlmissivet (följebrevet i mejlet) har inte diarieförts som ett eget dokument.")
    return ok("FIL-MISSIV-1", "fil", KIND, "Mejlmissiv är diarieförd eller ej tillämpligt för detta ärendedokument.")


RULES = [
    ar_kontakt_2, ar_kontakt_3,
    ad_kontakt_2, ad_kontakt_3, ad_kontakt_5,
    ad_godkannande_1, ad_sekretess_1,
    fil_undertecknad_1, fil_zip_1, fil_antal_1, fil_lasbar_1, fil_skann_1, fil_missiv_1,
]


def run(case: Case) -> list:
    return [rule(case) for rule in RULES]
