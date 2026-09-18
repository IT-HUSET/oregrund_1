"""Real Claude API connection for the judgment rules — one bundled call per
case, using structured outputs (output_config.format = json_schema) so the
response is guaranteed to validate against RESPONSE_SCHEMA without brittle
text parsing.

This is the only file that talks to the network. judgment.py decides
*when* to call it (never for redacted/Sekretess content) and what to do if
it fails (fall back to the heuristic, tagged transparently) — see
judgment.evaluate_case().
"""

from __future__ import annotations

import json

from app.config import ANTHROPIC_API_KEY, JUDGMENT_MODEL
from app.rule_catalog import JUDGMENT_RULE_IDS, JUDGMENT_RULES

RULE_IDS = JUDGMENT_RULE_IDS

_RULE_BULLETS = "\n".join(f"- {r.rule_id} — {r.description}" for r in JUDGMENT_RULES)

SYSTEM_PROMPT = f"""\
Du är en kvalitetsgranskare i registraturen på Statskontoret, en svensk \
statlig myndighet. Du bedömer ett diariefört ärende och dess ärendedokument \
mot ett fast regelverk, en regel i taget, och rapporterar resultatet \
strukturerat. Du fattar inga beslut och ändrar ingen data — du beskriver \
bara vad du observerar, med tydlig motivering och citerat underlag, så att \
en registrator kan lita på och snabbt verifiera varje bedömning.

Regler att bedöma (rule_id — beskrivning):
{_RULE_BULLETS}

För varje regel: sätt flagged=true endast om du är rimligt säker på att regeln bryts. \
Skriv reasoning på svenska, kort och konkret, riktad till en registrator. \
Sätt evidence till det exakta textutdrag (titel, textstycke, datum etc.) som \
bedömningen bygger på, eller null om inget specifikt utdrag är relevant. \
Sätt confidence till din säkerhet (0.0–1.0). Om ett fält saknas eller är tomt \
och regeln därför inte går att bedöma, sätt flagged=false och förklara det i reasoning.

Rapportera exakt ett resultat per regel-id ovan ({len(JUDGMENT_RULE_IDS)} st totalt, varken fler eller färre), \
vart och ett med korrekt ifyllt rule_id.\
"""


# A schema with one named property per rule_id (14 repeated object schemas)
# blows up the strict-mode grammar compiler ("compiled grammar is too
# large"). A uniform array of {rule_id, ...} items compiles to a single
# reused item schema instead, which stays well within limits.
RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "rule_id": {"type": "string", "enum": RULE_IDS},
                    "flagged": {"type": "boolean"},
                    "reasoning": {"type": "string"},
                    "evidence": {"type": ["string", "null"]},
                    "confidence": {"type": "number"},
                },
                "required": ["rule_id", "flagged", "reasoning", "evidence", "confidence"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["results"],
    "additionalProperties": False,
}


class LLMNotConfigured(Exception):
    pass


class LLMCallFailed(Exception):
    pass


_client = None


def _get_client():
    global _client
    if _client is None:
        import anthropic
        _client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    return _client


def is_configured() -> bool:
    return bool(ANTHROPIC_API_KEY)


def _build_user_message(case) -> str:
    ad = case.arendedokument
    payload = {
        "arende": {
            "titel": case.arende.titel,
            "process": case.arende.process,
            "kontakt": case.arende.kontakt,
        },
        "arendedokument": {
            "titel": ad.titel,
            "handlingstyp": ad.handlingstyp,
            "dokumentkategori": ad.dokumentkategori,
            "avsandare": ad.avsandare,
            "mottagare": ad.mottagare,
            "ankomstdatum": ad.ankomstdatum,
            "dokumentdatum": ad.dokumentdatum,
        },
        "dokumenttext": case.dokumenttext,
    }
    return (
        f"Bedöm följande ärende mot samtliga {len(RULE_IDS)} regler och svara enligt schemat:\n\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
    )


def judge_case(case) -> dict:
    """Makes one real API call bundling all 14 judgment rules for a case.
    Raises LLMNotConfigured / LLMCallFailed rather than returning a
    degraded result — the caller (judgment.evaluate_case) decides what
    "failed" means for the pipeline (fall back to heuristic, tagged)."""
    if not is_configured():
        raise LLMNotConfigured("ANTHROPIC_API_KEY is not set")

    import anthropic

    client = _get_client()
    try:
        # This SDK version predates output_config structured outputs, so we
        # get schema-guaranteed JSON the same way: a single strict tool,
        # forced via tool_choice. Equivalent guarantee, older mechanism.
        response = client.messages.create(
            model=JUDGMENT_MODEL,
            max_tokens=4096,
            # System prompt is identical on every call (only the user
            # message varies per case) — cache it so repeated calls in a
            # session only pay full price once.
            system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": _build_user_message(case)}],
            tools=[{
                "name": "rapportera_fynd",
                "description": "Rapportera bedömningen för samtliga 14 regler.",
                "strict": True,
                "input_schema": RESPONSE_SCHEMA,
            }],
            tool_choice={"type": "tool", "name": "rapportera_fynd"},
        )
    except anthropic.APIError as e:
        raise LLMCallFailed(str(e)) from e

    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_use is None:
        raise LLMCallFailed(f"No tool_use block in response (stop_reason={response.stop_reason})")

    items = tool_use.input.get("results", [])
    data = {item["rule_id"]: item for item in items if "rule_id" in item}

    missing = [r for r in RULE_IDS if r not in data]
    if missing:
        raise LLMCallFailed(f"Response missing rule IDs: {missing}")

    return data
