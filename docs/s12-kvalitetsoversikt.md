# Kvalitetsöversikt

**Plan**: docs/plan.json
**Story-ID**: S12

## Feature Overview and Goal

**Intent**: The registraturansvarig has no way today to see whether the automated granskning is actually working across the whole document population — this story turns the per-document kontrollogg into aggregate figures (status mix, common findings, auto-corrections, misjudgment rate) so quality can be judged at a glance instead of document by document.

**Expected Outcomes**:

- [OC01] The overview shows the count and percentage share of documents per review status (Godkänd/Autokorrigerad/Åtgärd krävs/Mänsklig bedömning), computed from the kontrollogg.
- [OC02] The overview lists the most common rule findings across every logged review round, ranked by frequency.
- [OC03] The overview shows the count of applied auto-corrections and the share of stickprov samples flagged as a misjudgment.
- [OC04] When the kontrollogg has no data (overall, or no stickprov samples yet), the overview shows an explained empty state instead of blank or nonsensical figures.


## Required Context

- `docs/prd.md#fr13-kvalitetsöversikt` – FR13's description (counts/shares per status, most common rules, auto-correction count, misjudgment share), its sole Acceptance Criterion ("Siffrorna stämmer med loggen"), and the empty-state error-handling rule ("Om data saknas visas tomt läge med förklaring") OC04/TI07 implement.
- `docs/prd.md#user-stories` – US09 row: the business-owner framing ("nyckeltal för granskningen ... hur många och vilka fel som görs") and its Acceptance Criteria ("antal per status, de vanligaste reglerna och andelen stickprovsmarkerade felbedömningar"), which this FIS's four outcomes map to 1:1.
- `docs/s02-kontrollogg-infrastruktur.md` – the kontrollogg entry shape and the existing public API (append + per-document read only, no all-documents read) TI01 builds on; see Constraints & Gotchas for the resulting gap this story has to bridge itself.
- `docs/s06-granskningsomgang-status-auto-rattning-och-logg.md` – the four-status precedence, what a logged review round contains (status transitions, findings, applied before/after corrections), the AD-KONTAKT-5/FIL-ZIP-1 auto-correction allowlist, and that a handläggare resubmission produces a second logged round for the same document — TI02–TI05 aggregate over this shape.
- `docs/plan.json` (`sharedDecisions[2]`, "Kontrollogg event schema") – names S12 as a consumer of the log entry shape S02 defines and S06/S11 write into.
- `docs/plan.json#stories.10` (story `S11` "Stickprov", `status: pending`, no FIS yet) – the only current source for TI06's misjudgment-flag contract: "a filter/list for Godkänd/Autokorrigerad documents, an open-log action, and a flag-as-misjudgment action with a required comment that is logged." Reconcile TI06 against S11's own FIS once it exists (see Constraints & Gotchas).


## Acceptance Scenarios

- [ ] **S01 [OC01] [TI01,TI02,TI03] Status distribution across ten reviewed documents**
  - **Given** a kontrollogg holding one resolved review round per document for 10 documents, resolving to 6 Godkänd, 2 Autokorrigerad, 1 Åtgärd krävs and 1 Mänsklig bedömning
  - **When** the overview is read
  - **Then** it reports counts 6/2/1/1 and shares 60%/20%/10%/10% for the four statuses, summing to 100%

- [ ] **S02 [OC02] [TI01,TI04] Most common findings ranked by frequency**
  - **Given** a kontrollogg whose logged findings include AD-KONTAKT-5 three times, FIL-ZIP-1 twice and AR-TITEL-1 once, across different documents and rounds
  - **When** the overview is read
  - **Then** the ranked findings list shows AD-KONTAKT-5 first with count 3, ahead of FIL-ZIP-1 (2) and AR-TITEL-1 (1)

- [ ] **S03 [OC03] [TI01,TI05] Auto-correction count excludes downgraded/failed corrections**
  - **Given** a kontrollogg with 5 applied AD-KONTAKT-5/FIL-ZIP-1 corrections (before/after values present) and 1 additional AD-KONTAKT-5 finding downgraded to a suggestion after a failed log write (per S06 TI04)
  - **When** the overview is read
  - **Then** the auto-correction count is 5, not 6

- [ ] **S04 [OC03] [TI01,TI06] Misjudgment share computed over sampled documents, not all registered documents**
  - **Given** a kontrollogg with 20 logged stickprov entries (S11's flag-as-misjudgment action) against a population of 200 registered documents, of which 4 stickprov entries are flagged as a misjudgment
  - **When** the overview is read
  - **Then** the misjudgment share is reported as 20% (4 of 20 sampled), not 2% (4 of 200 registered)

- [ ] **S05 [OC03] [TI06] No stickprov samples yet does not divide by zero**
  - **Given** a kontrollogg with logged review rounds but zero logged stickprov entries
  - **When** the overview is read
  - **Then** the misjudgment-share section shows an explained "inga stickprov ännu" state instead of a NaN, error, or a 0% that would misleadingly imply zero misjudgments were found

- [ ] **S06 [OC04] [TI01,TI07] Empty kontrollogg shows an explained empty state**
  - **Given** a kontrollogg with zero entries
  - **When** the overview is read
  - **Then** every section (status distribution, findings, auto-corrections, misjudgment share) shows explanatory empty-state text per FR13's error handling, instead of blank output or a rendering error


## Structural Criteria

- [ ] Every document with ≥1 logged review round contributes to exactly one status bucket, taken from its most recent round — a resubmitted, re-reviewed document is never counted twice or under its superseded status (proved by TI02's Verify).
- [ ] No function this story exports calls S02's append API or any other mutation entry point — the overview module is read-only, per the plan story's "Excludes: any write actions (S07/S08/S11)" (proved by TI01's Verify).
- [ ] Every figure (status shares, finding ranking, auto-correction count, misjudgment share) is recomputed from a fresh kontrollogg read on each view, with no separately cached or persisted copy that could drift from the log — per FR13's "Siffrorna stämmer med loggen" (proved by TI01's Verify).


## Scope & Boundaries

### Work Areas
- Log-wide aggregation read that returns every entry across all documents, extending beyond S02's per-document API
- Per-document status resolution that collapses multiple review rounds into one current status
- Status count/share view over the resolved per-document statuses
- Most-common-findings ranking over every logged finding
- Auto-correction count aggregation restricted to applied AD-KONTAKT-5/FIL-ZIP-1 corrections
- Misjudgment-share aggregation over S11's stickprov flag-as-misjudgment log entries
- Explained empty states for "no log data at all" and "no stickprov samples yet"

### What We're NOT Doing
- Any write/mutation action (approve, reject, flag a misjudgment) -- owned by S07/S08/S11; this story is read-only per plan scope.
- Production retention/archival of the growing kontrollogg -- explicitly excluded by the plan story scope and deferred to S10's integration plan.
- Real-time/live-updating dashboard (push updates, polling, websockets) -- FR13 has no such Acceptance Criterion; a fresh read on view load is sufficient at prototype scale.
- Trend-over-time or historical-comparison charts -- FR13 asks for point-in-time counts/shares/ranking/share, not a time series; unrequested scope.


## Architecture Decision

**Approach**: Implement kvalitetsöversikt as a pure read-time aggregation layer over S02's kontrollogg store — an all-entries scan groups entries by document id to resolve one current status per document, then reduces findings, applied corrections and misjudgment flags across every entry. No persisted or cached metrics table.
**Why this over alternatives**: ADR Beslut 3 already accepts the full-file-scan cost at prototype scale and rules out adding an index; recomputing on every read is the only approach consistent with FR13's "Siffrorna stämmer med loggen" without introducing a second, driftable source of truth.


## Code Patterns & External References

```
# type | path#anchor or url                                                      | why needed (intent)
file   | docs/s02-kontrollogg-infrastruktur.md                                   | Entry shape + existing append/per-document-read API TI01 builds the all-entries read alongside
file   | docs/s06-granskningsomgang-status-auto-rattning-och-logg.md             | Four-status precedence and AD-KONTAKT-5/FIL-ZIP-1 allowlist TI02-TI05 reduce over
file   | docs/prd.md#fr13-kvalitetsöversikt                                      | FR13 description, Acceptance Criterion and empty-state error handling
```


## Constraints & Gotchas

- **Constraint**: S02's already spec-ready public API is append + per-document read only, with no all-documents/list capability -- Workaround: TI01 adds its own all-entries read against the same `kontrollogg.jsonl` store, reusing S02's entry shape rather than duplicating storage/parsing logic, since widening S02's API surface is out of this story's scope; ADR Beslut 3 already accepts the full-scan cost this implies.
- **Constraint**: S11 ("Stickprov"), which produces the misjudgment log entries TI06 aggregates, has no FIS yet -- Workaround: TI06 keys off the "flag-as-misjudgment action with a required comment that is logged" description already in S11's plan.json scope text, treating "a human-decision log entry representing a misjudgment flag" as the contract rather than a specific field name; reconcile the exact payload shape once S11's FIS exists.
- **Critical**: FR13's "Siffrorna stämmer med loggen" Acceptance Criterion binds every figure to the live log, not a snapshot -- Must handle by: every count/share/ranking is computed fresh from TI01's read on each view (Structural Criteria).


## Implementation Plan

### Implementation Tasks

- [ ] **TI01** A log-wide read returns every kontrollogg entry across all documents
  - Extends beyond S02's per-document filter (`docs/s02-kontrollogg-infrastruktur.md`) with an all-entries read against the same `kontrollogg.jsonl` store, reusing S02's entry shape; exposes no write/mutation call.
  - **Verify**: `Test: appending entries for 3 distinct document ids then reading all-entries returns all 3; an empty store returns an empty list, not an error; the module contains no call into S02's append API; an entry appended between two reads appears on the second read with no separate update step`

- [ ] **TI02** Every document resolves to exactly one of the four statuses, taken from its latest logged review round
  - Groups TI01's entries by document id; a document with multiple rounds (e.g. a handläggare resubmission per `docs/s06-granskningsomgang-status-auto-rattning-och-logg.md`) keeps only its chronologically last round's status.
  - **Verify**: `Test: a document with 2 logged rounds (first Åtgärd krävs, second Autokorrigerad) contributes exactly one count, to Autokorrigerad`

- [ ] **TI03** Overview shows the count and percentage share of documents per status
  - Reduces TI02's per-document statuses into the four FR4 buckets (Mänsklig bedömning, Åtgärd krävs, Autokorrigerad, Godkänd); shares sum to 100% across the four buckets.
  - **Verify**: `Test: a fixture of 10 resolved statuses (6 Godkänd, 2 Autokorrigerad, 1 Åtgärd krävs, 1 Mänsklig bedömning) yields matching counts and shares of 60/20/10/10 percent`

- [ ] **TI04** Overview ranks the most common rule findings across every logged review round
  - Counts each finding occurrence by rule id across all of TI01's entries (not deduplicated per document), ranked descending by count.
  - **Verify**: `Test: a fixture with 3 AD-KONTAKT-5, 2 FIL-ZIP-1 and 1 AR-TITEL-1 finding ranks AD-KONTAKT-5 first with count 3`

- [ ] **TI05** Overview counts applied auto-corrections, restricted to S06's allowlisted rules
  - Counts entries carrying an applied before/after change for AD-KONTAKT-5 or FIL-ZIP-1 (`docs/s06-granskningsomgang-status-auto-rattning-och-logg.md` TI03); a correction downgraded to a suggestion after a failed log write (S06 TI04) is not counted as applied.
  - **Verify**: `Test: a fixture with 5 applied AD-KONTAKT-5/FIL-ZIP-1 corrections and 1 failed-correction suggestion counts 5, not 6`

- [ ] **TI06** Overview shows the share of stickprov samples flagged as a misjudgment
  - Aggregates human-decision log entries representing S11's flag-as-misjudgment action (`docs/plan.json#stories.10`); share = flagged-misjudgment entries ÷ total stickprov entries logged (documents actually sampled), not all registered documents, since most registered documents are never sampled.
  - **Verify**: `Test: a fixture with 20 logged stickprov entries of which 4 are flagged misjudgment reports a share of 20%; a fixture with 0 stickprov entries shows an explained "not yet sampled" state instead of dividing by zero`

- [ ] **TI07** An explained empty state replaces every section when the kontrollogg has no entries at all
  - Distinct from TI06's "no samples yet" sub-state; covers the whole-overview case per FR13's error-handling Acceptance Criterion ("Om data saknas visas tomt läge med förklaring").
  - **Verify**: `Test: reading the overview against a store with zero entries shows explanatory empty-state text for every section instead of NaN, 0%, or a blank page`

### Testing Strategy

- No test framework exists in the repo yet (S01-S11 land before or alongside this story); build TI01-TI07's fixtures as hand-constructed kontrollogg entries matching S02's entry shape and S06's per-round contents rather than depending on `casedetails/testcases.json`, since S12's assetRefs name no testcase fixtures and the quality-overview figures are cross-document aggregates, not single-case outcomes.


## Implementation Observations

_No observations recorded yet._
