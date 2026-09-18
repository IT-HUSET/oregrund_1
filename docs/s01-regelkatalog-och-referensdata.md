# Regelkatalog och referensdata

**Plan**: docs/plan.json
**Story-ID**: S01

## Feature Overview and Goal

**Intent**: The review engine (S04/S05) and the business that maintains the checklist both need the 29-rule checklist and its lookup data as validated, versioned, off-code data — never hardcoded — so rules can be edited without a deploy and every review can be traced to the exact rule version it ran against.

**Expected Outcomes**:

- [OC01] `checklist_rules.json` holds exactly the 29 checklist rules from the PRD table, each with id/nivå/fält/regeltext/felvillkor/metod/allvarlighetsgrad/auto-rättning, plus a catalog version exposed to callers.
- [OC02] An invalid catalog (duplicate id, bad enum value, or an auto-rättning flag outside method M) is rejected before any review runs, with an error naming the offending rule and field.
- [OC03] The rules governing OSL 5 kap. 2 § carry `allvarlighetsgrad: "Lagkrav"`.
- [OC04] `kontaktregister.json` and `klassificeringsstruktur.json` resolve every organisation, process and handlingstyp `casedetails/testcases.json`'s 20 cases use, plus the PRD's stated assumptions, without producing a false finding from missing reference data.


## Required Context

- `docs/prd.md#fr1-regelkatalog` – the 29-rule table (id, nivå, fält, regeltext, felvillkor, metod, allvarlighetsgrad, auto-rättning) and FR1's Acceptance Criteria/Validation/Error Handling this story must satisfy.
- `docs/prd.md#key-constraints-assumptions--dependencies` – the `checklist_rules.json` dependency ("finns inte i underlaget och måste tas fram") this story fulfills, and the top-level constraint that automation never touches datum/diarienummer/skyddskod.
- `docs/prd.md#dependencies` – the dependency rows naming `checklist_rules.json`, simulated kontaktregister and simulerad klassificeringsstruktur as required for AR-/AD-KONTAKT-2/-4, AR-PROCESS-1 and AD-HANDLINGSTYP-1.
- `docs/prd.md#constraints` – binding constraint: automation may only change fields via auto-rättningsflagga; datum, diarienummer och skyddskod ändras aldrig automatiskt (validation must guarantee no such rule ever carries the flag).
- `docs/prd.md#fr5-automatisk-rättning-av-säkra-fel` – binding constraint: "Ingen annan regel än dem med auto-rättningsflagga ändrar data" — only AD-KONTAKT-5 and FIL-ZIP-1 may carry the flag.
- `docs/prd.md#assumptions` – exact reference-data coverage requirements: the process list (1.1.2, 1.2, 1.2.4, 2.1, 2.3, 2.3.1, 3.1, 4.2, 4.7, 4.8, 5.2, 6.1), handlingstyper 6.1-1/2.3.1-5 allowed in every process the testdata uses them in, the organisation excluded from kontaktregister (Myndigheten för digital förvaltningsutveckling), and the two tjänstepersoner (Rex Ljungqvist, Clas Olsson).
- `docs/adr.md#beslut-1-regler-som-datadriven-konfiguration` – the chosen storage/validation/versioning approach this story implements: a standalone versioned JSON catalog, loaded and validated (not hardcoded) before any review starts.
- `casedetails/testcases.json` – ground truth: 20 cases referencing 22 distinct rule ids, and every organisation/process/handlingstyp the reference data must resolve without a false finding.


## Deeper Context

- `docs/adr.md` (Skiss, lines 5-47) – system diagram showing how `checklist_rules.json` / `kontaktregister.json` / `klassificeringsstruktur.json` feed the granskningsmotor (S04/S05); read for downstream-consumer context, not required to implement S01.


## Acceptance Scenarios

- [x] **S01 [OC01] [TI01,TI03] Catalog is complete and versioned**
  - **Given** `checklist_rules.json` as authored per the FR1 table
  - **When** it is loaded
  - **Then** it yields exactly 29 rule objects, each with id/nivå/fält/regeltext/felvillkor/metod/allvarlighetsgrad/auto-rättning populated, plus a catalog version string

- [x] **S02 [OC01] [TI01] All testcases.json rule ids exist in the catalog**
  - **Given** the 22 distinct rule ids referenced across `casedetails/testcases.json`'s 20 cases (AD-DATUM-1, AD-GODKANNANDE-1, AD-HANDLINGSTYP-1, AD-KATEGORI-1, AD-KONTAKT-2/3/4/5, AD-SEKRETESS-1, AD-TITEL-1/2/3/4, AR-KONTAKT-4, AR-PROCESS-1, AR-TITEL-2, FIL-ANTAL-1, FIL-LASBAR-1, FIL-MISSIV-1, FIL-SKANN-1, FIL-UNDERTECKNAD-1, FIL-ZIP-1)
  - **When** the catalog is loaded
  - **Then** every one of those 22 ids is present among the 29 catalog rules

- [x] **S03 [OC02] [TI02] Auto-rättning is restricted to method M**
  - **Given** the catalog defines AD-KONTAKT-5 and FIL-ZIP-1 as the only rules with `auto-rättning: true`, both method M
  - **When** the catalog is validated
  - **Then** validation passes; a mutated copy with `auto-rättning: true` on any rule whose metod is not exactly `M` fails validation

- [x] **S04 [OC02] [TI02] An invalid catalog blocks review with a named error**
  - **Given** a catalog copy containing a duplicate rule id or an out-of-enum `allvarlighetsgrad`
  - **When** it is loaded
  - **Then** loading fails with an error naming the offending rule id and field, and no rule evaluation proceeds

- [x] **S05 [OC03] [TI01] OSL 5:2 rules carry Lagkrav severity**
  - **Given** the loaded catalog
  - **When** inspecting AD-DATUM-1, AD-KONTAKT-1, AD-KONTAKT-2, AD-KONTAKT-3, AD-KONTAKT-4, AD-KATEGORI-1 and AD-TITEL-1
  - **Then** each has `allvarlighetsgrad: "Lagkrav"`

- [x] **S06 [OC04] [TI04,TI05] Reference data covers testcases.json and the PRD assumptions**
  - **Given** `kontaktregister.json` and `klassificeringsstruktur.json`
  - **When** cross-checked against `casedetails/testcases.json`'s 20 cases
  - **Then** every process the cases use resolves in `klassificeringsstruktur.json`, handlingstyper 6.1-1 and 2.3.1-5 resolve under every process the testdata pairs them with (including 6.1-1 under process 1.2, per TC-01), every organisation the cases use except "Myndigheten för digital förvaltningsutveckling" resolves in `kontaktregister.json`, and Rex Ljungqvist and Clas Olsson resolve flagged as enskilda tjänstepersoner

- [x] **S07 [OC04] [TI06] An intentionally-unregistered organisation fails closed**
  - **Given** "Myndigheten för digital förvaltningsutveckling" (used in TC-09, deliberately excluded per `docs/prd.md#assumptions`)
  - **When** it is looked up in `kontaktregister.json`
  - **Then** the lookup returns not-found rather than a partial or default match


## Structural Criteria

- [x] `checklist_rules.json`, `kontaktregister.json` and `klassificeringsstruktur.json` each parse as valid JSON and load without error.
- [x] `casedetails/testcases.json` is unmodified by this story.


## Scope & Boundaries

### Work Areas
- `data/checklist_rules.json` (new) – the 29-rule catalog plus version, per `docs/prd.md#fr1-regelkatalog`
- `data/kontaktregister.json` (new) – simulated contact register
- `data/klassificeringsstruktur.json` (new) – simulated classification structure (processes + handlingstyper)
- Catalog loader/validator module (new) – load-time validation and version exposure, per `docs/adr.md#beslut-1-regler-som-datadriven-konfiguration`
- Reference-data lookup surface (new) – organisation/process/handlingstyp lookups that S04's AD-/AR-KONTAKT, AR-PROCESS-1 and AD-HANDLINGSTYP-1 checks will call

### What We're NOT Doing
- Rule evaluation logic (metadata checks, lookups, file analysis) -- deferred to S04 (deterministic engine) and S05 (AI engine); this story only produces and validates the data those engines consume.
- A catalog-editing UI -- excluded per the plan story scope; the catalog is edited as a JSON file by the business, per `docs/adr.md#beslut-1-regler-som-datadriven-konfiguration`.
- Kontrollogg writes or review-round orchestration -- S01 has no log or document-state dependency; that belongs to S02/S06.
- A contact-register/classification schema broader than `casedetails/testcases.json`'s 20 cases and the PRD's stated assumptions require -- "En fullständig lista finns inte i underlaget" (`docs/prd.md#assumptions`); expanding further is unfounded scope.


## Architecture Decision

**Approach**: Rule catalog and reference data ship as standalone, versioned JSON files (`data/checklist_rules.json`, `data/kontaktregister.json`, `data/klassificeringsstruktur.json`) loaded and validated by a loader module at startup, per `docs/adr.md#beslut-1-regler-som-datadriven-konfiguration` — no catalog data is hardcoded in the engine.
**Why this over alternatives**: Keeps the 29-rule catalog editable by the business without a code deploy, while giving S04/S05/S06 a single validated, versioned load path to depend on.


## Code Patterns & External References

```
type | path#anchor                                          | why needed (intent)
file | docs/prd.md#fr1-regelkatalog                          | 29-rule table: id/nivå/fält/regeltext/felvillkor/metod/allvarlighetsgrad/auto-rättning source of truth
file | docs/prd.md#constraints                               | OSL 5 kap. 2 § rule set that must carry Lagkrav severity
file | docs/prd.md#assumptions                               | Referensdata coverage requirements (tjänstepersoner, excluded org, allowed processes/handlingstyper)
file | docs/adr.md#beslut-1-regler-som-datadriven-konfiguration | Load-validate-version contract the loader module must implement
data | casedetails/testcases.json                            | Ground truth for rule-id and reference-data coverage (20 cases, 22 rule ids)
```


## Constraints & Gotchas

- **Constraint**: `metod` values are compound strings, not a flat enum ("M/C", "M+L/C", "C/H", "M → H") -- validate against the allowed base tokens (M, M+L, C, H) and the exact combination forms the FR1 table uses, not a single fixed value list.
- **Avoid**: Treating the 22 rule ids in `testcases.json` as the full catalog -- the catalog holds all 29 checklist rules; testcases.json only exercises 22 of them, so id coverage is a subset check, not an equality check.
- **Critical**: This story is the first to place data/config files in the repo; S02 and S03 (also Wave 1, parallel, no filed convention yet) will need a compatible layout -- keep `data/` and the loader module's location visible in the change so parallel stories don't diverge.


## Implementation Plan

### Implementation Tasks

- [x] **TI01** `checklist_rules.json` contains all 29 checklist rules with correct fields and severities, plus a catalog version
  - Transcribe the FR1 table (`docs/prd.md#fr1-regelkatalog`) verbatim into id/nivå/fält/regeltext/felvillkor/metod/allvarlighetsgrad/auto-rättning per rule; apply `allvarlighetsgrad: "Lagkrav"` to AD-DATUM-1, AD-KONTAKT-1–4, AD-KATEGORI-1, AD-TITEL-1 per `docs/prd.md#constraints`; add a root-level version field
  - **Verify**: loading the file yields exactly 29 rule objects; all 22 rule ids from `casedetails/testcases.json` are present; the 7 named rule ids carry `allvarlighetsgrad: "Lagkrav"`

- [x] **TI02** An invalid catalog is rejected before any review runs, naming the offending rule and field
  - Validate at load time: unique ids; nivå ∈ {Ärende, Dokument, Fil}; metod matches an allowed base/combination token from TI01's table; allvarlighetsgrad ∈ {Lagkrav, Fel, Anmärkning}; `auto-rättning: true` allowed only where metod is exactly `M` (AD-KONTAKT-5, FIL-ZIP-1); reject any rule on fält Datum/Diarienummer/Skyddskod that carries `auto-rättning: true`, per `docs/prd.md#constraints` and `docs/prd.md#fr5-automatisk-rättning-av-säkra-fel`
  - **Verify**: a catalog copy with a duplicate id, an out-of-enum value, or `auto-rättning: true` on a non-M or datum/diarienummer/skyddskod rule fails validation with an error naming the rule id and field; the unmodified TI01 catalog passes

- [x] **TI03** Catalog version is exposed to callers alongside the validated rule set
  - Builds on TI02's validated load; the loader returns the version and the 29 rules together (e.g. `{ version, rules }`) so S04/S05/S06 can log the version used at review time, per `docs/adr.md#beslut-1-regler-som-datadriven-konfiguration`
  - **Verify**: one loader call returns a version string together with the 29 validated rule objects

- [x] **TI04** `kontaktregister.json` resolves every testcases.json organisation except the intentionally-excluded one
  - Include Statskontoret, Ekonomistyrningsverket, Exempelkommun, Exempelorganisationen, Kontorsleverantören AB, Leverantör X AB, Riksarkivet, and the `statistik.support@scb.se` sender; flag Rex Ljungqvist and Clas Olsson as enskilda tjänstepersoner; omit Myndigheten för digital förvaltningsutveckling, per `docs/prd.md#assumptions`
  - **Verify**: every avsändare/mottagare/kontakt across `casedetails/testcases.json`'s 20 cases except "Myndigheten för digital förvaltningsutveckling" resolves; Rex Ljungqvist and Clas Olsson resolve with a tjänsteperson flag

- [x] **TI05** `klassificeringsstruktur.json` resolves every testcases.json process and handlingstyp
  - Cover processes 1.1.2, 1.2, 1.2.4, 2.1, 2.3, 2.3.1, 3.1, 4.2, 4.7, 4.8, 5.2, 6.1 with their handlingstyper; allow handlingstyp 6.1-1 (Beslut) and 2.3.1-5 (Korrespondens) in every process the testdata pairs them with, including 6.1-1 under process 1.2 (TC-01), per `docs/prd.md#assumptions`
  - **Verify**: every process/handlingstyp pair referenced by `casedetails/testcases.json`'s 20 cases resolves without a false "not found"

- [x] **TI06** Reference-data lookups fail closed on no-match rather than defaulting
  - An unmatched organisation (or process/handlingstyp) lookup returns an explicit not-found result, never a partial or default match, so AD-/AR-KONTAKT-2, AR-PROCESS-1 and AD-HANDLINGSTYP-1 can detect it deterministically in S04
  - **Verify**: looking up "Myndigheten för digital förvaltningsutveckling" in `kontaktregister.json` returns not-found, not a partial match


## Implementation Observations

_No observations recorded yet._
