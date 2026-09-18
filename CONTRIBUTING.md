# Contributing

## Adding a new checklist rule

This is the most likely maintenance task on this project — Statskontoret's
checklist changes, or a gap gets noticed. The rule catalog is designed so
this is a small, mechanical checklist rather than a hunt across the
codebase.

### Deterministic rule (pure field comparison — dates, flags, counts, registry lookups)

1. Add a function to `app/rules/deterministic.py` following the existing
   pattern: takes a `Case`, returns a `CheckResult` via `base.ok()` /
   `base.fail()`.
2. Add it to the `RULES` list at the bottom of that file.
3. Re-run `py -3 -m tests.test_engine` and check the new rule fires where
   expected (add a case to `casedetails/testcases.json` /
   `app/data/testcases.json` first if none of the 20 seed cases exercise
   it).

### Judgment rule (needs text/semantic understanding — titles, contact identity, content matching)

1. Add one `JudgmentRule(rule_id, level, description)` entry to
   `app/rule_catalog.py`. `level` is `"arende"` or `"arendedokument"`.
   This alone updates: the Claude API's response schema, the system
   prompt Claude sees (`app/llm_client.py:SYSTEM_PROMPT`), and the rule
   loop in `app/rules/judgment.py:run()`.
2. Add a heuristic implementation in `app/rules/heuristics.py` — a
   function taking a `dict` payload and returning
   `{"flagged": bool, "reasoning": str, "evidence": str|None, "confidence": float}`
   — and wire it into `heuristics.evaluate_all()`. This is the fallback
   path used when the API is unconfigured or a call fails, so it needs to
   cover every rule even if the real model is the primary path.
3. If the rule involves free text (title, dokumenttext), make sure your
   heuristic checks `heuristics.is_redacted(...)` first and returns
   `dict(heuristics.NOT_EVALUATED)` when true — Sekretess-marked content
   must never be analyzed, even by the fallback.
4. Re-run `py -3 -m tests.test_engine` — it reports rule-ID-level accuracy
   against `casedetails/testcases.json` and will tell you if the new rule
   over- or under-fires relative to the handwritten expectations (a
   mismatch isn't automatically wrong — see README.md's "Facit-avstämning"
   section for how real Claude judgments are expected to diverge from that
   handwritten spec, and why that's not necessarily a regression).

### Should it be auto-fixable (Step 2)?

Only if a fix can be produced *mechanically and safely* — see the
whitelist policy in `app/autofix.py`: nothing touching sekretess, contact
identity/registration, dates, or handlingstyp is ever eligible. If it
qualifies, add the rule ID to `AUTOFIX_WHITELIST` and extend
`_build_fix()` with the fix logic. A rule being whitelisted only means
it's *allowed to try* — if a safe fix can't be confidently produced, fall
back to `status="needs_human"` rather than guessing (see the existing
`AD-TITEL-2`/`AR-TITEL-2` abbreviation-expansion case for the pattern).

## Running the app locally

See README.md's "Köra prototypen" section. Short version:
`pip install -r requirements.txt`, set `ANTHROPIC_API_KEY` in `.env`,
`py -3 run.py`.

## Regression check

`py -3 -m tests.test_engine` is the only automated check in this project
(see README.md's "Facit-avstämning" section for what it measures and why
its numbers differ with vs. without a configured API key). Run it after
any change to `app/rules/`, `app/rule_catalog.py`, `app/autofix.py`, or
`app/llm_client.py`.
