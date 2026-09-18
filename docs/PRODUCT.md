# Product

> Durable orientation layer above the PRD. Full detail: `docs/prd.md`.

## Vision

Every ärendedokument is checked automatically against the 29-rule checklist the moment a handläggare marks it "Färdig". Correct documents register immediately, clear errors go back to the handläggare with an explanation, and humans only judge the documents that genuinely need it. Every check is traceable and explained – nothing runs as a black box.

## Target Users

- **Registrator / Huvudregistrator**: reviews queued documents, approves or rejects proposed findings/corrections, sends back to handläggare.
- **Handläggare**: receives returned documents with explanations, corrects and resubmits for review.
- **Verksamhetsansvarig / revisor**: needs traceability over what was checked, changed, and decided.

## Value Propositions

- Registraturen today reviews ~20% of document cards manually (~5 min/card); 10-30% contain errors. 100% manual review would cost ~1,640 h/year plus ~990 h corrections.
- Automated review covers 100% of documents against all 29 rules, with every check logged.

## Key Capabilities

| Capability | Description | Status |
|------------|-------------|--------|
| FR1 Regelkatalog | 29 checklist rules as editable, versioned data | Planned |
| FR2 Inläsning av dokument | Reads ärende, dokumentkort, and attached files | Planned |
| FR3 Granskning | Runs all rules per document (deterministic + AI) | Planned |
| FR4 Statussättning | Godkänd / Autokorrigerad / Åtgärd krävs / Mänsklig bedömning | Planned |
| FR5 Automatisk rättning | Auto-corrects safe errors, never datum/diarienummer/skyddskod | Planned |
| FR6 Förklarade fynd | Rule, method, evidence, confidence, correction suggestion per finding | Planned |
| FR7 Kontrollogg | Immutable audit log of checks, changes, human decisions | Planned |
| FR8 Registratorvy | Queue, detail view, approve/reject, send to handläggare | Planned |
| FR9 Handläggarvy | Return, correct, resend for review | Planned |
| FR10 Testsvit | Automated run of the 20 synthetic test cases | Planned |

See `docs/prd.md` for the full capability table (FR1-FR12+) and acceptance criteria.

## Non-Goals

- Automation never changes datum, diarienummer, or skyddskod – see `docs/prd.md#constraints`.

## Success Metrics

- All 20 test cases pass expected status and findings.
- 100% of ingested documents checked against all 29 rules, every check logged.
- Every finding carries rule, explanation, method, evidence.
- Safe errors auto-corrected with a before/after log entry.
- Review latency ≤ 30s per document (p95).
