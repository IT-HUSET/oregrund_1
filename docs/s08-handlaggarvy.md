# Handläggarvy

**Plan**: docs/plan.json
**Story-ID**: S08

## Feature Overview and Goal

**Intent**: Today a handläggare who gets a document back must route every fix, however small, back through registraturen; this story gives them a direct queue, one-click suggestion application, and a self-service re-review action so most Åtgärd-krävs documents can be corrected and re-registered without any registrator involvement.

**Expected Outcomes**:

- [OC01] Every document currently at status Åtgärd krävs appears in the handläggarvy's queue with its findings and suggestions, and no document at another status appears there.
- [OC02] A finding's rättningsförslag can be applied to its field with one click, and the resulting field change is logged.
- [OC03] "Skicka för ny granskning" reruns the full FR3–FR4 review against the edited document via the Granskningsomgång orchestration contract, moving a now-clean document to Godkänd/Registrerat, and leaving a still-failing or erroring one visibly in Åtgärd krävs with an error message.
- [OC04] The server rejects any handläggare attempt to change diarienummer or to set status Registrerat directly, regardless of what the client sends.


## Required Context

- `docs/prd.md#fr9-handläggarvy` – full FR9 spec: description, acceptance criteria, validation and error handling this story implements.
- `docs/prd.md#fr9-handläggarvy` – binding constraint verbatim (`plan.json` bindingConstraints): "Handläggaren kan inte ändra diarienummer. Handläggaren kan inte sätta status Registrerat." – the two hard rules this story enforces server-side, per the S08 risk mitigation below.
- `docs/prd.md#user-stories` – US05 (return-and-fix with concrete suggestion, one-click apply) and US06 ("Skicka för ny granskning" runs a full review and sets a new status) rows this story's outcomes trace to.
- `docs/plan.json` (`sharedDecisions[0]`, "RuleOutcome/Finding data contract") – the finding shape (rule id, severity, method, evidence, Swedish explanation, correction suggestion, confidence for AI findings) this view must render and let the handläggare apply.
- `docs/plan.json` (`sharedDecisions[1]`, "Granskningsomgång orchestration contract") – the entry point "Skicka för ny granskning" calls to rerun S04–S06 against the edited document; the exact function name is S06's implementation detail, resolved at build time, not pinned here.
- `docs/plan.json` (`sharedDecisions[2]`, "Kontrollogg event schema") – every applied suggestion and field edit by the handläggare must write an FR7-shaped log entry with role "Handläggare" before it takes effect.
- `docs/plan.json` (`sharedDecisions[3]`, "Dokument/Ärende data model") – the ärende+ärendedokument+fil shape (S03) this view reads and edits, including where diarienummer lives on that model.
- `docs/adr.md#skiss` – pins the Next.js/Node/TypeScript fullstack, JSON-file storage architecture (no DB) this view/route must fit.


## Deeper Context

- `docs/prd.md#fr4-statussättning` – status precedence applied after "Skicka för ny granskning" (Godkänd/Autokorrigerad → Registrerat automatically; otherwise the document routes elsewhere).
- `docs/prd.md#fr5-automatisk-rättning-av-säkra-fel` – why only AD-KONTAKT-5/FIL-ZIP-1 auto-correct; every other finding here is what the handläggare fixes manually.
- `docs/prd.md#fr6-förklarade-fynd` – suggestion-content rules (no fabricated contacts, no personnamn/sekretess in title suggestions) the rendered suggestions must already satisfy.
- `casedetails/testcases.json#cases` – TC-03 (AD-TITEL-2, unspelled-out abbreviations) and TC-15 (FIL-ZIP-1 + FIL-ANTAL-1, Åtgärd krävs) ground truth for scenario data.


## Acceptance Scenarios

- [x] **S01 [OC01] [TI01] Åtgärd-krävs queue shows only documents in that status**
  - **Given** TC-03's document (diarienummer `2026-00103`) has completed a granskningsomgång with status "Åtgärd krävs" and finding AD-TITEL-2, while TC-01's document is at status "Godkänd"/"Registrerat"
  - **When** a handläggare opens handläggarvyn
  - **Then** the queue lists TC-03's document with its AD-TITEL-2 finding, and TC-01's document does not appear

- [x] **S02 [OC02] [TI02,TI03] Applying a rättningsförslag updates the field and is logged**
  - **Given** TC-03's document detail view showing the AD-TITEL-2 finding for titel `"Bslt ang IK-plan 2026 fr GD"` with its suggested corrected title
  - **When** the handläggare clicks "Tillämpa förslag" on that finding
  - **Then** the document's titel field is replaced by the suggested value, and the kontrollogg (S02) records a log entry with the before/after title values and role "Handläggare"

- [x] **S03 [OC03] [TI05] Skicka för ny granskning on a corrected document registers it**
  - **Given** TC-03's document with its titel already corrected via S02's suggestion and no other outstanding findings
  - **When** the handläggare clicks "Skicka för ny granskning"
  - **Then** the full review reruns via the Granskningsomgång orchestration contract, the document receives status "Godkänd", dokumentstatus becomes "Registrerat", and it no longer appears in the handläggarvy's Åtgärd-krävs queue

- [x] **S04 [OC03] [TI05] A failed rerun leaves the document in Åtgärd krävs with an error shown**
  - **Given** TC-15's document at status "Åtgärd krävs" with the review rerun forced to fail (e.g. the orchestration call errors)
  - **When** the handläggare clicks "Skicka för ny granskning"
  - **Then** the document's status remains "Åtgärd krävs", no new status is set, and an error message is shown per FR9's error handling

- [x] **S05 [OC04] [TI04] Diarienummer edits are rejected server-side**
  - **Given** TC-03's document open in the handläggarvy's editable detail view
  - **When** the handläggare submits a changed diarienummer value (e.g. via a direct request bypassing the disabled field)
  - **Then** the server rejects the change, the stored diarienummer remains `"2026-00103"`, and no diarienummer-change log entry is written

- [x] **S06 [OC04] [TI06] Direct Registrerat status writes are rejected server-side**
  - **Given** TC-15's document at status "Åtgärd krävs" open in the handläggarvy
  - **When** the handläggare's client submits a direct status change to "Registrerat" (bypassing "Skicka för ny granskning")
  - **Then** the server rejects the request, the document's status remains "Åtgärd krävs", and Registrerat is reachable only through a successful "Skicka för ny granskning" round (S03) or an explicit registrator decision (S07, out of scope here)


## Structural Criteria

- [x] Diarienummer-immutability and Registrerat-blocking validation are enforced by the server endpoint that applies suggestions/edits, not only disabled in client UI — a direct request bypassing the UI is still rejected (S08 risk mitigation, `plan.json` riskSummary).
- [x] Applying a suggestion or field edit only takes effect after its kontrollogg (S02) log write succeeds; a forced log-write failure leaves the field unchanged, per FR7/ADR Beslut 3's fail-closed gate.


## Scope & Boundaries

### Work Areas
- Åtgärd-krävs document queue (handläggarvy list view)
- Document detail view: findings/suggestions rendering (RuleOutcome/Finding contract) + editable fields + "Tillämpa förslag" action
- Suggestion-apply / field-edit server endpoint gated on a successful kontrollogg write (S02) and diarienummer-immutability
- "Skicka för ny granskning" action invoking the Granskningsomgång orchestration contract (S06)
- Server-side rejection of direct Registrerat-status writes by the handläggare

### What We're NOT Doing
- Registratorvy (Mänsklig-bedömning queue, per-finding approve/reject/send) -- owned by S07, building in the same wave against the same shared contracts.
- Stickprov and kvalitetsöversikt -- S11/S12 depend on S07 and S02/S06 respectively, not S08; out of scope here.
- The Granskningsomgång engine itself (status precedence, auto-correction, log writes) -- S06's scope; S08 only calls its documented entry point and reacts to the resulting status.
- Building a new role-selector/login shell from scratch -- FR8/FR9 share one "no login, header role selector" pattern; this story adds only the minimum routing needed to reach handläggarvy if nothing from S07 exists yet at build time.


## Architecture Decision

**Approach**: Implement handläggarvyn as a Next.js route (list + detail) reading/writing through the Dokument/Ärende model (S03) and the Granskningsomgång orchestration contract (S06), with diarienummer-immutability and Registrerat-blocking validation enforced in the same server-side handler that applies suggestions/edits — never only in the client.
**Why this over alternatives**: Client-only validation would let a direct API call bypass the two FR9 hard rules; pinning the check to the server endpoint matches how S02's log-gated writes already enforce invariants structurally rather than by UI convention, and is the S08 risk mitigation named in `plan.json`'s riskSummary.


## Code Patterns & External References

```
# type | path#anchor or url                | why needed (intent)
file   | docs/adr.md#skiss                 | tech stack (Next.js/Node/TypeScript, JSON-file storage) this view/route must fit
file   | docs/prd.md#fr9-handläggarvy      | FR9 spec source: scope, validation, error handling
file   | casedetails/testcases.json#cases  | TC-03 (AD-TITEL-2) / TC-15 (FIL-ZIP-1, FIL-ANTAL-1) ground truth for scenario data
```


## Constraints & Gotchas

- **Constraint**: S06 (Granskningsomgång orchestration contract) and S07 (registratorvy) build in the same wave and may not exist yet at implementation time -- Workaround: call the orchestration entry point by its documented contract shape (`plan.json` sharedDecisions[1]) rather than importing a concrete S06 module path; treat the exact function name as resolved at build time.
- **Critical**: diarienummer-immutability and Registrerat-blocking are FR9's own binding constraint -- Must handle by: rejecting both server-side on the same endpoint that applies suggestions/edits, not just disabling the field in the UI (S08 risk mitigation, `plan.json` riskSummary).
- **Avoid**: re-running auto-correction or generating a second auto-corrected suggestion for AD-KONTAKT-5/FIL-ZIP-1 from this view -- Instead: "Skicka för ny granskning" delegates the full round (including any remaining auto-correction) to the S06 orchestration entry point; this view only edits fields, applies non-auto-correction suggestions, and triggers the rerun.


## Implementation Plan

### Implementation Tasks

- [x] **TI01** Handläggarvyns queue lists exactly the documents currently at status Åtgärd krävs
  - Reads each document's current review status from the Dokument/Ärende model (S03) as updated by the Granskningsomgång orchestration contract (S06); no dependency on S06's internal module shape, only its resulting status field.
  - **Verify**: `Test: given one document at Åtgärd krävs (TC-03) and one at Godkänd (TC-01), the queue returns only the Åtgärd-krävs document`

- [x] **TI02** Document detail view renders every finding with its rule id, severity, evidence, Swedish explanation, and rättningsförslag
  - Follows the RuleOutcome/Finding contract (`plan.json` sharedDecisions[0]) produced by S04/S05.
  - **Verify**: `Test: opening TC-03's document detail shows the AD-TITEL-2 finding with rule id, Swedish explanation, and its suggested corrected title text`

- [x] **TI03** Applying a finding's suggestion updates its field and is gated on a successful kontrollogg write
  - Depends on TI02. Calls S02's append API with an FR7-shaped before/after entry (role "Handläggare") before the field change is considered applied; a failed log write leaves the field unchanged.
  - **Verify**: `Test: clicking "Tillämpa förslag" on TC-03's AD-TITEL-2 finding updates titel to the suggested value and appends a log entry recording the before/after title and role Handläggare; forcing the log write to fail leaves titel unchanged`

- [x] **TI04** Fields are directly editable except diarienummer, which the server rejects regardless of client state
  - Depends on TI01. Validation runs server-side on the same handler that applies edits/suggestions (TI03), not only as a disabled UI field, per the S08 risk mitigation in `plan.json`'s riskSummary.
  - **Verify**: `Test: editing an allowed field (e.g. avsandare) on TC-03's document persists; submitting a changed diarienummer value through the same endpoint is rejected and the stored diarienummer stays "2026-00103"`

- [x] **TI05** "Skicka för ny granskning" reruns the full review via the Granskningsomgång orchestration contract and reflects the resulting status
  - Depends on TI03, TI04 (edits/suggestions apply before rerun). Calls the entry point described in `plan.json` sharedDecisions[1]; the exact function name is resolved at build time against S06's implementation.
  - **Verify**: `Test: sending TC-03's corrected document for new review yields status Godkänd and dokumentstatus Registrerat, and it leaves the Åtgärd-krävs queue; forcing the rerun call to fail leaves the document at Åtgärd krävs with an error message shown`

- [x] **TI06** Handläggaren cannot set status Registrerat directly, only via a successful "Skicka för ny granskning" round
  - Depends on TI04's server-side validation pattern. Any direct status write to Registrerat through this view's endpoints is rejected independent of client state.
  - **Verify**: `Test: a direct request setting TC-15's document status to Registrerat (bypassing Skicka för ny granskning) is rejected, and the document's status remains Åtgärd krävs`


## Implementation Observations

### Run: 2026-09-18 16:00 UTC – observations

#### NOTICED BUT NOT TOUCHING

- S04:s `rattningsforslag` för AD-TITEL-2 (och flera andra M-regler) är en instruktion, inte ett ersättningsvärde (`src/lib/granskning/regler.ts`). S08 skriver strängen till det mappade fältet, vilket TI03:s Verify kräver ("updates titel to the suggested value"). S03:s Godkänd-väg sätter därför en giltig titel via fältredigering (samma endpoint). Ett byte till "bara tillämpa substituterbara värden" eller att S04 emitterar ersättningstitlar är ett kontraktsbeslut, inte en S08-lokal fix.
- `docs/KEY_DEVELOPMENT_COMMANDS.md` nämner bara `/registrator`, inte `/handlaggare`.
- Utan `ANTHROPIC_API_KEY` landar `npm run seed` alla fall i Mänsklig bedömning; handläggarkön är tom tills registratorn skickar fynd.

#### ASSUMPTIONS (AUTO_MODE)

- Inga AUTO_MODE-antaganden; körningen var interaktiv.
