# Kontrollogg-infrastruktur

**Plan**: docs/plan.json
**Story-ID**: S02

## Feature Overview and Goal

**Intent**: Every later mutation in the pipeline (status changes, auto-corrections, human decisions) must be structurally unable to happen without a corresponding, unerasable record — this story builds the append-only log primitive the rest of the system gates on, not just a place to write events.

**Expected Outcomes**:

- [OC01] A state-changing event (rule outcome, finding, before/after change, status transition, or human decision) can be durably appended as a new log entry carrying timestamp, document id, rule-catalog version, AI model, and the event payload.
- [OC02] A failed log write aborts the write attempt with no partial or malformed entry persisted, so a caller can safely treat "log write failed" as "nothing happened."
- [OC03] Reading a document's log returns its full event history in append order across every review round, and no exported function can modify or remove an existing entry.


## Required Context

- `docs/prd.md#fr7-kontrollogg` – FR7 field list (timestamp, document id, regelkatalogversion, AI-modell, regelutfall, fynd, ändringar, statusbyten, mänskliga beslut), acceptance criteria (immutable via the interface, full history across granskningsomgångar), and the error-handling rule that a failed log write aborts the triggering status/data change.
- `docs/prd.md#non-functional-requirements` – Traceability row (100% of status changes have a log entry; the log cannot be changed) and Explainability row (100% of findings carry rule id, explanation, method, evidence, plus AI confidence) that this story's schema must be able to carry.
- `docs/adr.md#beslut-3-oföränderlig-kontrollogg-append-only` – the append-only JSONL storage decision (`kontrollogg.jsonl`), synchronous fail-closed write gating, and the "concurrent writes need a simple lock" consequence this FIS's Architecture Decision follows directly.
- `docs/plan.json` (`sharedDecisions[2]`, "Kontrollogg event schema") – names every downstream consumer of the entry shape this story defines (S06 writes; S07/S08 display a log tab; S11 stickprov; S12 kvalitetsöversikt), so the schema in TI01 must satisfy all of them, not just S02's own scope.


## Acceptance Scenarios

- [ ] **S01 [OC01] [TI01,TI02,TI03] Append a review-round event and read it back**
  - **Given** a document id `"ARENDE-2025-01053-DOK-1"` and rule-catalog version `"1.0.0"`
  - **When** the writer appends a status-transition event with timestamp, per-rule outcomes, findings, before/after values, and a human decision (role, time, motivering)
  - **Then** reading that document id's log returns exactly that entry, with every field intact, as the only item in its history

- [ ] **S02 [OC01,OC03] [TI02,TI03] Full history across multiple review rounds, earlier entries unchanged**
  - **Given** a document that already has one logged review round
  - **When** a second review round (following an auto-correction) is appended for the same document
  - **Then** reading the document's log returns both entries in append order, and the first entry's fields are byte-for-byte unchanged — the store gained a row, nothing was overwritten

- [ ] **S03 [OC02] [TI02] A failed write aborts the change and leaves the log untouched**
  - **Given** the append-only store's write path is forced to fail (e.g. the underlying write call errors)
  - **When** a caller attempts to append an event
  - **Then** the writer surfaces a failure the caller can detect, no partial or corrupted entry appears in the store, and a subsequent read for that document returns the same entries as before the attempt

- [ ] **S04 [OC03] [TI03] Reading a never-logged document returns empty history, not an error**
  - **Given** a document id with no prior log entries
  - **When** its log is read
  - **Then** the read returns an empty history rather than throwing or returning an error


## Structural Criteria

- [ ] Concurrent append calls targeting the same store do not lose or corrupt entries (simple lock, per ADR Beslut 3's "kräver ett enkelt lås" consequence)
- [ ] No function exported by the kontrollogg module updates or deletes an existing log entry (FR7 acceptance criterion + ADR Beslut 3: "Inget API eller UI exponerar uppdatering eller radering mot loggfilen")


## Scope & Boundaries

### Work Areas
- Kontrollogg entry schema/type (timestamp, document id, rule-catalog version, AI model, per-rule outcomes, findings, before/after, status transitions, human decisions with role/time/motivering)
- Append-only writer with fail-closed behavior on write failure
- Per-document read returning full ordered history across review rounds
- JSONL-backed storage (`kontrollogg.jsonl`) with a simple lock for concurrent appends
- Public API surface restricted to append + read (no update/delete)

### What We're NOT Doing
- Log UI / log tab rendering -- owned by S07 (registratorvy) and S08 (handläggarvy), which consume this story's read API.
- Deciding *what* gets logged and *when* a mutation is gated on the log write -- that domain logic belongs to S06 and later stories; S02 only provides the append/read primitive.
- An index or database-backed lookup for the log -- ADR Beslut 3 explicitly accepts the full-file-scan cost at prototype scale; adding indexing now is unrequested scope.
- Retention/archival of the growing log file -- ADR Beslut 3 defers this to the integration plan (S10/FR11) ahead of any production rollout.


## Architecture Decision

**Approach**: Implement the log as a single append-only JSONL file (`kontrollogg.jsonl`) per `docs/adr.md#beslut-3-oföränderlig-kontrollogg-append-only` — a synchronous append write gates the caller (a failed write aborts the triggering change) and a per-document read parses and filters the full file, since the prototype has no index.
**Why this over alternatives**: The ADR already fixed file-based JSON storage project-wide and explicitly accepts the whole-file-scan cost at this data scale; adding a database or index here would contradict that decision rather than build on it.


## Code Patterns & External References

```
# type | path#anchor or url                                                   | why needed (intent)
file   | docs/adr.md#beslut-3-oföränderlig-kontrollogg-append-only            | Storage shape, fail-closed write gating, concurrent-write lock requirement
file   | docs/prd.md#fr7-kontrollogg                                          | Log entry field list, acceptance criteria, error-handling rule to implement
```


## Constraints & Gotchas

- **Constraint**: No ärende/ärendedokument data model exists yet (S03 owns it, runs in parallel) -- Workaround: treat document id as an opaque string identifier; do not import or assume S03's document shape.
- **Critical**: This log is the single fail-closed gate every later mutation (S06 onward) depends on -- Must handle by: making the writer's failure mode unambiguous (thrown error or explicit failure result) and never leaving a partial/malformed line in the JSONL file on failure.
- **Avoid**: adding any update/delete entry point, even for internal test cleanup -- Instead: isolate tests behind a throwaway file path per test run/case rather than a "remove one line" utility on the production module.


## Implementation Plan

### Implementation Tasks

- [ ] **TI01** Kontrollogg entry shape is defined as the shared data contract
  - Captures timestamp, document id, rule-catalog version, AI model, per-rule outcomes, findings (rule id/severity/method/evidence/explanation/confidence), before/after values, status transitions, and human decisions (role, time, motivering) per FR7 and `plan.json`'s "Kontrollogg event schema" sharedDecision — S06, S07/S08, S11 and S12 all depend on this shape.
  - **Verify**: `Test: a constructed log entry satisfying the schema round-trips through serialize/deserialize without field loss`

- [ ] **TI02** Append-only writer persists an entry and fails closed
  - Synchronous append to the `kontrollogg.jsonl` store (`docs/adr.md#beslut-3-oföränderlig-kontrollogg-append-only`); on failure, nothing partial is written and the caller receives an unambiguous failure signal. Concurrent append calls to the same store are serialized by a simple lock so no entry is lost or corrupted.
  - **Verify**: `Test: two concurrent appends for the same document both persist as separate, complete entries; a forced write failure surfaces to the caller and adds nothing to the store`

- [ ] **TI03** Per-document read returns full ordered history across review rounds
  - Reads and filters the append-only store by document id, returning entries in append order across every review round; a document with no entries returns an empty history rather than erroring. Depends on TI01's entry shape and TI02's store.
  - **Verify**: `Test: after appending 2 entries for one document across two simulated rounds, read returns both in order; reading a never-logged document id returns an empty history`

- [ ] **TI04** No update or delete entry point exists on the kontrollogg module's public API
  - The module exports only append and read-by-document-id; structurally enforces FR7's "Loggposter går inte att ändra eller radera via gränssnittet."
  - **Verify**: `Test/inspection: the module's exports contain no function that updates or removes an existing entry`

### Testing Strategy
- Tests exercising the append-only store use an isolated file path (e.g. a temp directory) per test run/case, so failure-injection (S03/TI02) and multi-round ordering (S02/TI03) tests don't leak state between each other or pollute a shared `kontrollogg.jsonl`.


## Implementation Observations

_No observations recorded yet._
