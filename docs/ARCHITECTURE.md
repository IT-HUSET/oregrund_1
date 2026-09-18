# Architecture

> Summary of `docs/adr.md`, the source of truth for architecture decisions. Full diagram and rationale there.

## System Overview

Single Next.js app (Node/TypeScript, fullstack): one service serves both the UI (registrator/handläggare views, role picker in the header) and the API routes for ingestion, review, auto-correction, status logic, and logging. All data (rule catalog, reference data, ingested documents, control log) is stored as JSON files on disk – no database. The only external dependency is the Anthropic Claude API, used for AI-assessed rules (method C/H).

## Key Components

| Component | Responsibility | Key Files/Dirs |
|-----------|---------------|----------------|
| API-rutter | Next.js API routes, entry point for UI and test suite | TBD (no code yet) |
| Inläsning (FR2) | Reads ärende, dokumentkort, attached files | TBD |
| Granskningsmotor (FR3) | Runs deterministic + AI rule checks | TBD |
| Auto-rättning (FR5) | Corrects safe errors only (method M) | TBD |
| Statuslogik (FR4) | Derives Godkänd/Autokorrigerad/Åtgärd krävs/Mänsklig bedömning | TBD |
| Loggskrivare (FR7) | Writes append-only `kontrollogg.jsonl` | TBD |

## Data Flow

1. UI (registrator/handläggare) or test suite calls API routes.
2. Inläsning reads the ärende/dokument and attached files into memory.
3. Granskningsmotor runs deterministic rules against `checklist_rules.json` and reference data (`kontaktregister.json`, `klassificeringsstruktur.json`), then AI-assessed rules (method C/H) against the Anthropic Claude API.
4. Auto-rättning applies safe corrections (method M only), then all rules re-run exactly once against the updated document.
5. Statuslogik derives the final status from all rule outcomes.
6. Every step (rule outcome, finding, before/after change, status change, human decision) is written synchronously to `kontrollogg.jsonl` before the corresponding status/data change is allowed to take effect.

## Integration Points

| Service | Purpose | Config Location |
|---------|---------|------------------|
| Anthropic Claude API | AI assessment for method C/H rules (content, language, plausibility) | TBD (no code yet) |

## Key Constraints

- Rule catalog (`checklist_rules.json`) is versioned, external data – never hardcoded – validated before any review runs (ADR Beslut 1).
- Pipeline order is fixed: deterministic rules always run first; an AI failure/timeout/low-confidence result degrades the document to Mänsklig bedömning rather than aborting the review (ADR Beslut 2).
- The control log is append-only; a log write must succeed before the status/data change it records is allowed to happen (ADR Beslut 3).
- Automation never changes datum, diarienummer, or skyddskod (PRD constraint).
