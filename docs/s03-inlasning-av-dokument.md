# Inläsning av dokument

**Plan**: docs/plan.json
**Story-ID**: S03

## Feature Overview and Goal

**Intent**: Every downstream review story (S04–S09) needs one validated, review-ready document shape instead of raw case exports, so a handläggare's "Färdig" marking can enter granskning immediately with no manual reformatting step.

**Expected Outcomes**:

- [OC01] All 20 `casedetails/testcases.json` cases' metadata plus their attached files ingest into one validated Dokument/Ärende shape ready for review, each with a unique id.
- [OC02] Ingestion rejects input missing any required field (diarienummer, arendedokument.titel, handlingstyp, dokumentkategori, skyddskod) with a field-naming error, and no document is created.
- [OC03] The ingested document's status is always "Färdig", regardless of the input status value.
- [OC04] Optional fields absent from input do not block ingestion, and their presence/absence is preserved unchanged so downstream rule evaluation can tell "missing" apart from an explicit value.


## Required Context

- `docs/prd.md#fr2-inläsning-av-dokument` – full FR2 spec: schema, validation, error handling, and the optional-field carve-outs (godkannandeflode_status, ärende.status).
- `docs/prd.md#data-requirements-if-applicable` – authoritative ärende/ärendedokument/fil field list this story's data model must cover.
- `casedetails/testcases.json#cases` – real schema and all 20 cases; ground truth for exact field names/types and which fields are actually optional in practice.
- `docs/adr.md#skiss` – pins the tech stack (Next.js/Node/TypeScript fullstack, JSON-file storage, no DB) this module must fit; no API route exists yet, so this story is framework-agnostic module code.
- `docs/plan.json#sharedDecisions` – "Dokument/Ärende data model" entry: this story produces the contract S04–S09 consume; extend the field set, don't narrow it.


## Acceptance Scenarios

- [ ] **S01 [OC01,OC03] Valid case ingests to a review-ready document**
  - **Given** TC-01's arende (diarienummer `2026-00101`) and arendedokument (status `"Registrerat"`) plus its attached PDF
  - **When** the case is ingested
  - **Then** a document is returned with a unique id, status `"Färdig"`, and every input field preserved

- [ ] **S02 [OC02] Missing required field is rejected**
  - **Given** a copy of TC-01's arendedokument with `titel` removed
  - **When** the case is ingested
  - **Then** ingestion fails with `"Dokumentet kunde inte läsas in: fält titel saknas"` (or the equivalent message naming the missing field) and no document is created

- [ ] **S03 [OC04] Optional fields are not required, and absence is distinguished from an explicit value**
  - **Given** TC-01 (no `godkannandeflode_status` field, `kontakt` is `null`) and TC-14 (`godkannandeflode_status` explicitly `"Saknas"`)
  - **When** both cases are ingested
  - **Then** both succeed, and the two ingested documents differ exactly on `godkannandeflode_status`: absent on one, the literal string `"Saknas"` on the other

- [ ] **S04 [OC01] All FR2-listed file formats are accepted**
  - **Given** a minimal fixture file for each of PDF, e-post (.eml), zip and bild/skanning (PNG)
  - **When** each is ingested alongside valid TC-01-shaped metadata
  - **Then** ingestion succeeds for all four and the ingested document references the file by name, without the file's content being inspected

- [ ] **S05 [OC01,OC03] All 20 testcases.json cases ingest to distinct, review-ready documents**
  - **Given** every case in `casedetails/testcases.json#cases`
  - **When** each is ingested in turn
  - **Then** all 20 produce distinct document ids, all with status `"Färdig"`, and none is rejected


## Structural Criteria

- [ ] Ingesting any of the 20 `casedetails/testcases.json` cases preserves every arende/ärendedokument/fil field from the input without lossy coercion, aside from the forced status.
- [ ] A rejected ingestion never leaves a partial or malformed document behind.


## Scope & Boundaries

### Work Areas
- Dokument/Ärende data model / type definitions (the shared contract S04–S09 consume)
- Required-field validation and field-naming rejection error
- Status-forcing logic (input status ignored, always `"Färdig"`)
- File-acceptance handling for PDF/.msg/.eml/zip/image inputs
- Minimal per-format test fixtures (real synthetic files from `testcases.json` don't exist until S09)

### What We're NOT Doing
- File-content analysis (readable/zip/page-count/signature checks) -- deferred to S04; this story accepts files as-is without inspecting them.
- Creating the full synthetic test files for all 20 `testcases.json` cases -- that's S09's job (wave W5); this story proves file-format acceptance with its own minimal per-format fixtures instead.
- Persisting rejection errors to the kontrollogg audit log -- S03 has no dependency on S02 in this wave; log integration is wired later where S02's writer is actually consumed (S06).
- Invoking the review pipeline (S04/S05) after ingestion -- this story hands back a ready document; actually triggering the review engine is S04/S06's concern, since S03 has no dependency on either.


## Architecture Decision

**Approach**: Implement ingestion as a plain TypeScript module (no HTTP route yet) that accepts arende+arendedokument+fil metadata plus real file objects and returns a validated Dokument/Ärende model with a forced `"Färdig"` status; fits the ADR's Next.js/Node/TypeScript, JSON-file-storage architecture (`docs/adr.md#skiss`) without needing a UI or API route this wave.
**Why this over alternatives**: An API-route-first implementation would force a premature commitment to file-upload transport before S07/S08 exist to call it; a plain module keeps the contract callable from a future route or from S09's test runner alike.


## Code Patterns & External References

```
# type | path#anchor or url                | why needed (intent)
file   | casedetails/testcases.json#cases  | schema source – exact field set every arende/arendedokument/fil object must accept
file   | docs/adr.md#skiss                 | tech stack (Next.js/Node/TypeScript, JSON-file storage) this module must fit
```


## Constraints & Gotchas

- **Constraint**: `testcases.json`'s `fil.filer` file names don't correspond to real files in `casedetails/` yet (S09 creates the synthetic files in wave W5) -- Workaround: ingestion takes file content as opaque input handed by the caller rather than resolving paths itself; this story's own minimal per-format fixtures prove format acceptance instead of the full 20-case file set.
- **Avoid**: rejecting or coercing missing optional fields (`godkannandeflode_status`, `arende.status`, `mottagare`, `kopia_till`, `sista_svarsdatum`) -- Instead: pass them through unchanged; FR2 explicitly excludes these from the required-field check.
- **Critical**: PRD FR2 prose says "dokumenttitel" but the `testcases.json`/Data-Requirements schema names this field `arendedokument.titel` -- Must handle by: using the schema field name (`titel`) in code, types, and the field-naming error message; there is no separate "dokumenttitel" field.
- **Constraint**: this story has no dependency on S02 (Kontrollogg) in wave W1 -- Workaround: rejection errors surface as a return/throw to the caller; wiring them into the audit log is out of scope here.


## Implementation Plan

### Implementation Tasks

- [ ] **TI01** Dokument/Ärende data model captures the full arende+arendedokument+fil field set used across `testcases.json`, plus an ingested-document wrapper (unique id, forced status `"Färdig"`)
  - Create a minimal TypeScript project scaffold (package.json/tsconfig/test runner) first only if none exists yet — check before creating, since sibling foundation stories S01/S02 may land in parallel. Follow `casedetails/testcases.json#cases` for the exact field set.
  - **Verify**: the type/schema accepts every field present across all 20 `casedetails/testcases.json` cases without unknown-field coercion; ingesting each case's raw metadata through the type doesn't throw.

- [ ] **TI02 [S02]** Ingestion rejects input missing any required field (diarienummer, arendedokument.titel, handlingstyp, dokumentkategori, skyddskod) with an error naming the missing field, and creates no document
  - Depends on TI01's data model. Required-field set is FR2's Validation list, mapped onto the schema field names from TI01 (not the PRD's "dokumenttitel" gloss).
  - **Verify**: each of the 5 required fields individually omitted from a valid case (e.g. TC-01) is rejected with a field-naming error; all fields present succeeds; a rejected call returns no partial document.

- [ ] **TI03 [S01,S05]** Ingested document status is always `"Färdig"` regardless of the input arendedokument.status value, and carries a unique id
  - Depends on TI01.
  - **Verify**: ingesting TC-01 (input status `"Registrerat"`) yields status `"Färdig"`; ingesting all 20 `testcases.json` cases yields 20 distinct ids, all with status `"Färdig"`.

- [ ] **TI04 [S03]** Optional/absent fields (godkannandeflode_status, arende.status, mottagare, kopia_till, sista_svarsdatum, kontakt) do not block ingestion and are preserved exactly as given
  - Depends on TI01, TI02. Absent stays absent; an explicit value like `"Saknas"` (TC-14) stays `"Saknas"` — downstream rule evaluation (S04) needs this distinction.
  - **Verify**: TC-01 (godkannandeflode_status absent) and TC-14 (godkannandeflode_status `"Saknas"`) both ingest successfully, and the two ingested documents differ exactly on that field's presence/value.

- [ ] **TI05 [S04]** Ingestion accepts real attached files in PDF, e-post (.msg/.eml), zip and bild/skanning (image) formats without inspecting file content
  - Depends on TI01. Use minimal per-format fixtures (small valid PDF/.eml/.zip/.png) since `testcases.json`'s real synthetic files don't exist yet.
  - **Verify**: ingesting a minimal fixture of each of the 4 formats succeeds and the ingested document references the file(s) by name; an unreadable/corrupt fixture is still accepted at this stage (content validation is S04's job).

### Testing Strategy
- Fixtures for TI05 are minimal synthetic files this story creates itself (a small valid PDF, .eml, .zip, PNG) — not the full `casedetails/testcases.json` file set, which S09 supplies later.


## Implementation Observations

_No observations recorded yet._
