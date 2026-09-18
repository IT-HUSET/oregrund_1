"""Single source of truth for the 14 "judgment" rule IDs.

Before this existed, the same 14 rule IDs were hard-coded independently in
app/rules/judgment.py (ALL_JUDGMENT_RULES) and app/llm_client.py
(RULE_IDS + the hand-typed bullet list in SYSTEM_PROMPT). Adding or
renaming a rule in only one of those places would silently drift: the API
schema, the system prompt, and the heuristic fallback would disagree about
what the 14 rules even are, and llm_client.judge_case() would treat that
as a "failed" API call and fall back to the heuristic — a real bug
disguised as a transient network issue.

To add a rule: add one entry here, then implement it in
app/rules/heuristics.py (heuristic fallback) — see CONTRIBUTING.md.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class JudgmentRule:
    rule_id: str
    level: str  # "arende" | "arendedokument"
    description: str  # Swedish, one line — used verbatim in the LLM system prompt


JUDGMENT_RULES = [
    JudgmentRule("AR-TITEL-1", "arende", "Ärendets titel ska tydligt beskriva vad ärendet rör."),
    JudgmentRule("AR-TITEL-2", "arende", "Ärendets titel får inte innehålla outskrivna förkortningar."),
    JudgmentRule("AR-TITEL-3", "arende", "Ärendets titel ska vara på svenska (engelska tillåts bara om ingen svensk motsvarighet finns)."),
    JudgmentRule("AR-TITEL-4", "arende", "Personnamn får inte förekomma i ärendets titel."),
    JudgmentRule("AD-TITEL-1", "arendedokument", "Ärendedokumentets titel ska tydligt beskriva vad handlingen rör."),
    JudgmentRule("AD-TITEL-2", "arendedokument", "Ärendedokumentets titel får inte innehålla outskrivna förkortningar."),
    JudgmentRule("AD-TITEL-3", "arendedokument", "Ärendedokumentets titel ska vara på svenska (engelska tillåts bara om ingen svensk motsvarighet finns)."),
    JudgmentRule("AD-TITEL-4", "arendedokument", "Personnamn får inte förekomma i ärendedokumentets titel."),
    JudgmentRule("AR-KONTAKT-4", "arende", "Ärendets kontaktfält ska vara en organisation, inte en enskild tjänstepersons namn."),
    JudgmentRule("AD-KONTAKT-4", "arendedokument", "Avsändare/mottagare ska vara en organisation, inte en enskild tjänstepersons namn."),
    JudgmentRule("AD-DATUM-1", "arendedokument", 'Registrerat datum ska stämma med det datum handlingen själv anger (om ett sådant datum uttryckligen anges i texten, t.ex. efter "daterat"/"poststämplat").'),
    JudgmentRule("AD-HANDLINGSTYP-1", "arendedokument", "Den registrerade handlingstypen ska stämma med vad innehållet faktiskt är (t.ex. ett beslut ska vara registrerat som Beslut)."),
    JudgmentRule("AD-KATEGORI-1", "arendedokument", "Ett ärendedokument får inte blanda en inkommen handling och ett utgående svar i samma dokument."),
    JudgmentRule("AR-PROCESS-1", "arende", "Vald process ska stämma överens med vad ärendet faktiskt rör."),
]

JUDGMENT_RULE_IDS = [r.rule_id for r in JUDGMENT_RULES]
