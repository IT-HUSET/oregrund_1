"""Data shapes for cases moving through the quality-control pipeline.

These mirror the schema established by casedetails/testcases.json, which
was itself derived from the checklist and the Janus/P360 screenshots. All
fields are read with .get(...) defaults because real records (and,
deliberately, the Step 3 "generate a card from raw text" path) may be
missing fields that a fully-registered case would have.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Optional


@dataclass
class Arende:
    diarienummer: str = ""
    titel: str = ""
    process: str = ""
    kontakt: Optional[str] = None
    status: str = "Under handläggning"

    @classmethod
    def from_dict(cls, d: dict) -> "Arende":
        d = d or {}
        return cls(
            diarienummer=d.get("diarienummer", ""),
            titel=d.get("titel", ""),
            process=d.get("process", ""),
            kontakt=d.get("kontakt"),
            status=d.get("status", "Under handläggning"),
        )


@dataclass
class Arendedokument:
    titel: str = ""
    handlingstyp: str = ""
    dokumentkategori: str = ""
    skyddskod: str = ""
    atkomstgrupp: str = ""
    avsandare: Optional[str] = None
    mottagare: Optional[str] = None
    kopia_till: str = ""
    ankomstdatum: str = ""
    dokumentdatum: str = ""
    sista_svarsdatum: str = ""
    ansvarig: Optional[str] = None
    status: str = "Under behandling"
    antal_bilagor: int = 0
    godkannandeflode_status: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict) -> "Arendedokument":
        d = d or {}
        return cls(
            titel=d.get("titel", ""),
            handlingstyp=d.get("handlingstyp", ""),
            dokumentkategori=d.get("dokumentkategori", ""),
            skyddskod=d.get("skyddskod", ""),
            atkomstgrupp=d.get("atkomstgrupp", ""),
            avsandare=d.get("avsandare"),
            mottagare=d.get("mottagare"),
            kopia_till=d.get("kopia_till", ""),
            ankomstdatum=d.get("ankomstdatum", ""),
            dokumentdatum=d.get("dokumentdatum", ""),
            sista_svarsdatum=d.get("sista_svarsdatum", ""),
            ansvarig=d.get("ansvarig"),
            status=d.get("status", "Under behandling"),
            antal_bilagor=d.get("antal_bilagor", 0),
            godkannandeflode_status=d.get("godkannandeflode_status"),
        )


@dataclass
class Fil:
    filer: list = field(default_factory=list)
    ar_zip: bool = False
    ar_uppackad: Optional[bool] = None
    ar_lasbar: Optional[bool] = True
    ar_dubbelsidig_original: Optional[bool] = False
    ar_korrekt_skannad: Optional[bool] = True
    ar_undertecknad_version: Optional[bool] = None
    mejlmissiv_diarieford: Optional[bool] = None

    @classmethod
    def from_dict(cls, d: dict) -> "Fil":
        d = d or {}
        return cls(
            filer=list(d.get("filer", [])),
            ar_zip=d.get("ar_zip", False),
            ar_uppackad=d.get("ar_uppackad"),
            ar_lasbar=d.get("ar_lasbar", True),
            ar_dubbelsidig_original=d.get("ar_dubbelsidig_original", False),
            ar_korrekt_skannad=d.get("ar_korrekt_skannad", True),
            ar_undertecknad_version=d.get("ar_undertecknad_version"),
            mejlmissiv_diarieford=d.get("mejlmissiv_diarieford"),
        )


@dataclass
class Case:
    """A full ärende + ärendedokument + fil bundle moving through QC."""

    case_id: str
    beskrivning: str
    arende: Arende
    arendedokument: Arendedokument
    fil: Fil
    dokumenttext: str = ""
    expected_findings: list = field(default_factory=list)
    expected_status: Optional[str] = None
    source: str = "seed"  # "seed" | "generated"

    @classmethod
    def from_dict(cls, d: dict) -> "Case":
        return cls(
            case_id=d.get("case_id", ""),
            beskrivning=d.get("beskrivning", ""),
            arende=Arende.from_dict(d.get("arende", {})),
            arendedokument=Arendedokument.from_dict(d.get("arendedokument", {})),
            fil=Fil.from_dict(d.get("fil", {})),
            dokumenttext=d.get("dokumenttext", ""),
            expected_findings=d.get("expected_findings", []),
            expected_status=d.get("expected_status"),
            source=d.get("source", "seed"),
        )

    def to_dict(self) -> dict:
        out = {
            "case_id": self.case_id,
            "beskrivning": self.beskrivning,
            "arende": asdict(self.arende),
            "arendedokument": asdict(self.arendedokument),
            "fil": asdict(self.fil),
            "dokumenttext": self.dokumenttext,
            "source": self.source,
        }
        if self.expected_findings:
            out["expected_findings"] = self.expected_findings
        if self.expected_status:
            out["expected_status"] = self.expected_status
        return out


@dataclass
class CheckResult:
    """One rule evaluated against a case — logged regardless of outcome."""

    rule_id: str
    level: str  # "arende" | "arendedokument" | "fil"
    kind: str  # "deterministic" | "judgment"
    passed: bool
    reasoning: str
    evidence: Optional[str] = None
    confidence: Optional[float] = None
    engine: Optional[str] = None  # "claude-api" | "heuristic-fallback" | "redacted-not-evaluated" | None (deterministic/policy)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class CaseReport:
    case_id: str
    results: list  # list[CheckResult] — every rule evaluated
    status: str = "godkänd"  # "godkänd" | "flaggad"

    @property
    def findings(self) -> list:
        return [r for r in self.results if not r.passed]

    def to_dict(self) -> dict:
        return {
            "case_id": self.case_id,
            "status": self.status,
            "results": [r.to_dict() for r in self.results],
            "findings": [r.to_dict() for r in self.findings],
        }
