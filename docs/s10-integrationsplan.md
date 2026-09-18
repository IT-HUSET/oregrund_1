# Integrationsplan

**Plan**: docs/plan.json
**Story-ID**: S10

## Feature Overview and Goal

**Intent**: Stakeholders deciding whether to move the prototype's finished review pipeline (S01-S09) into production need a single document mapping today's manual Janus/P360 diarieflöde onto the automated one — what triggers a review, how the four statuses read back into P360, what changes for handläggare and registrator, and which questions must be answered before a pilot — without any of it contradicting the rule that datum, diarienummer and skyddskod are never changed automatically.

**Expected Outcomes**:

- [OC01] The document covers all nine FR11 points (trigger, P360 status mapping, feedback to handläggaren, registratorns arbetsyta, dataflöde/datahantering incl. AI-tjänst-krav, behörigheter, driftsättning, mätning mot KPI, steg 1→3 pilotväg) with concrete content, not placeholders.
- [OC02] The document explicitly names which of today's manual steps (huvudregistratorns granskning i vyn "Dokument redo för registrering") disappear and which remain.
- [OC03] The document names what must exist in P360 (gränssnitt eller API) and lists the open P360/production questions explicitly, including kontrollogg-retention.
- [OC04] The document's status-mapping and data-handling descriptions never contradict the autonomy constraint (datum, diarienummer och skyddskod ändras aldrig automatiskt).


## Required Context

- `docs/prd.md#fr11-integrationsplan` – the nine required points and the three Acceptance Criteria bullets (coverage, manual-steps delta, P360 requirements/open questions) this document must satisfy, plus the Validation line ("Planen motsäger inte begränsningarna för autonomi").
- `docs/prd.md#evidence--context` – the current flow this plan replaces: handläggaren sets "Diarieförd av handläggare" or "Färdig från handläggare/chef"; huvudregistratorn then reviews in "Dokument redo för registrering" and sets "Registrerat" or requests a correction.
- `docs/prd.md#constraints` – binding constraint (verbatim): "Datum, diarienummer och skyddskod ändras aldrig automatiskt." Every status-mapping or auto-registrering description in this document must hold to it.
- `docs/prd.md#dependencies` – names the gap this document's open-questions section must reflect: "Kunskap om P360/Janus (statusar, API) ... Det finns inget API-underlag i materialet."
- `docs/adr.md#beslut-3-oföränderlig-kontrollogg-append-only` – conclusion explicitly defers kontrollogg-rensning/arkivering to this integration plan as an open question.


## Deeper Context

- `docs/prd.md#fr4-statussättning` – the four-status precedence (Mänsklig bedömning > Åtgärd krävs > Autokorrigerad > Godkänd) the P360 status-mapping section must reflect, not redefine.
- `docs/prd.md#fr8-registratorvy` – the registrator queue/detail-view/actions (S07) this document's "registratorns arbetsyta" section points to rather than reinvents.
- `docs/prd.md#fr9-handläggarvy` – the handläggare return-and-fix flow (S08) this document's feedback section points to.
- `docs/prd.md#fr13-kvalitetsöversikt` – the KPI data source (S12's kvalitetsöversikt, built on S02's kontrollogg) this document's mätning section ties business-case KPIs to.


## Acceptance Scenarios

- [x] **S01 [OC01] [TI01,TI02,TI03,TI04,TI05,TI06,TI07] Document covers every FR11 point with concrete content**
  - **Given** `docs/integrationsplan.md` as produced by this story
  - **When** checked against FR11's nine required points
  - **Then** each point has a named section with concrete, case-specific content — no section is a placeholder or a restatement of the FR11 bullet text alone

- [x] **S02 [OC02] [TI02] Manual-steps delta is explicit**
  - **Given** today's flow (handläggaren sets "Diarieförd av handläggare" / "Färdig från handläggare/chef"; huvudregistratorn reviews every card in "Dokument redo för registrering") and the prototype's automatic review
  - **When** the document's manual-steps section is read
  - **Then** it names which steps disappear (huvudregistratorns manual review of Godkänd/Autokorrigerad cards) and which remain (handläggarens rättning of Åtgärd krävs, registratorns bedömning of Mänsklig bedömning, sekretessbedömning always going to a human per `docs/prd.md#constraints`)

- [x] **S03 [OC03] [TI05] P360 requirements and open questions are named, including kontrollogg retention**
  - **Given** no P360/Janus API documentation exists in the source material (`docs/prd.md#dependencies`) and `docs/adr.md#beslut-3-oföränderlig-kontrollogg-append-only` defers log retention/arkivering to this plan
  - **When** the document's P360-requirements section is read
  - **Then** it names what must exist in P360 (gränssnitt eller API) to receive the trigger and write back a status, and lists open questions explicitly as unresolved — including kontrollogg-retention/arkivering — rather than assuming an answer

- [x] **S04 [OC04] [TI01,TI04] Document never contradicts the autonomy constraint**
  - **Given** the binding constraint "Datum, diarienummer och skyddskod ändras aldrig automatiskt."
  - **When** the document's status-mapping and dataflöde/datahantering sections are read
  - **Then** no described P360 write path auto-changes datum, diarienummer or skyddskod; automatic "Registrerat" is described only for Godkänd/Autokorrigerad or an explicit human decision, per `docs/prd.md#fr4-statussättning`

- [x] **S05 [OC01] [TI07] Pilot path never overstates step-3 readiness**
  - **Given** the prototype covers only granskning (steg 1) and rättning (steg 2), with live P360-integration and AI-driven registrering excluded from this prototype's scope
  - **When** the document's steg 1→3 pilotväg section is read
  - **Then** step 3 (AI registrerar) is described as a future step gated on the open production data-handling decision and P360 write-back questions (TI04/TI05), not as ready today

- [x] **S06 [OC01] [TI04] Data handling names the AI-service requirement for real, classified documents**
  - **Given** the assumption "eftersom prototypen bara hanterar syntetiska data får en moln-LLM användas utan krav på var data lagras. Produktion kräver ett nytt beslut om databehandling." (`docs/prd.md#assumptions`)
  - **When** the document's dataflöde/datahantering section is read
  - **Then** it states that real/classified handlingar require a new, explicit AI-service data-handling decision (e.g. data residency, EU-hosted or on-prem model) before production use, distinct from the prototype's cloud-LLM assumption


## Structural Criteria

- [x] `docs/integrationsplan.md` parses as valid Markdown with all nine FR11-point section headings present — no broken structure or unresolved template placeholders.
- [x] No code, config, or data files are added or modified by this story — the deliverable is a document only, per `docs/plan.json`'s S10 notes ("No code dependency").
- [x] No status, rule, or auto-correction field is described beyond what S01-S09 already establish in `docs/plan.json` — this document reflects the pipeline's finished behavior, it does not redesign it.


## Scope & Boundaries

### Work Areas
- `docs/integrationsplan.md` (new) – trigger points & P360 status-mapping section
- Feedback-to-handläggaren & manual-steps-delta section
- Registratorns arbetsyta section
- Dataflöde/datahantering & AI-service-requirements section
- P360-krav & öppna frågor section (incl. kontrollogg-retention)
- Behörigheter, driftsättning & KPI-mätning section
- Steg 1→3 pilotväg section

### What We're NOT Doing
- Live P360/Janus integration or API calls -- explicitly out of scope per `docs/prd.md#out-of-scope` ("Live-integration mot P360/Janus. Den beskrivs bara i integrationsplanen"); this document describes, it does not implement.
- Code changes to the review pipeline -- S10 has no code dependency (`docs/plan.json`, S10 `dependsOn: []`); it only documents S01-S09's already-planned behavior.
- New rules, statuses, or auto-correction fields beyond what S01-S09 define -- inventing new pipeline behavior here would contradict the plan's own reason for scheduling S10 in hardening ("reflects the pipeline's actual finished behavior... rather than the plan").
- Resolving the production AI-service data-residency decision -- `docs/prd.md#assumptions` explicitly defers this to "ett nytt beslut"; this document can only name it as an open question, not settle it.


## Architecture Decision

**Approach**: The integration plan ships as a single Markdown document (`docs/integrationsplan.md`) with FR11's nine points as top-level sections, cross-referencing S01-S09's already-established behavior and the current Janus/P360 flow instead of inventing new pipeline logic.
**Why this over alternatives**: Matches this story's own scope (document deliverable, no code dependency) and the plan's decision to schedule S10 after the pipeline stories so it reflects finished behavior, not speculation.


## Code Patterns & External References

```
type | path#anchor                                              | why needed (intent)
file | docs/prd.md#fr11-integrationsplan                         | FR11's nine points + Acceptance Criteria this document must satisfy
file | docs/prd.md#evidence--context                             | Current flow (Diarieförd/Färdig triggers, huvudregistratorns "Dokument redo för registrering" view) this plan replaces
file | docs/prd.md#constraints                                   | Autonomy constraint the status-mapping/data-handling sections must never contradict
file | docs/prd.md#dependencies                                  | P360/Janus API-documentation gap the open-questions section must reflect
file | docs/adr.md#beslut-3-oföränderlig-kontrollogg-append-only | Kontrollogg retention/arkivering flagged as an open question for this plan
```


## Constraints & Gotchas

- **Constraint**: FR11's Validation line requires the plan not contradict the autonomy constraint -- every status-mapping or auto-registrering description must keep datum, diarienummer and skyddskod out of any automatic P360 write path.
- **Critical**: No P360/Janus API documentation exists in the source material (`docs/prd.md#dependencies`) -- name concrete open questions rather than assume an API shape or endpoint.


## Implementation Plan

### Implementation Tasks

- [x] **TI01** Document names trigger points and maps the four review statuses to P360
  - Cover the trigger at "Diarieförd av handläggare" / "Färdig från handläggare/chef" (`docs/prd.md#evidence--context`) and map Godkänd/Autokorrigerad/Åtgärd krävs/Mänsklig bedömning to corresponding P360 statuses, keeping automatic "Registrerat" limited to Godkänd/Autokorrigerad or an explicit human decision per `docs/prd.md#fr4-statussättning`
  - **Verify**: document section names both trigger points and a status-mapping table covering all four statuses, with no automatic write path touching datum/diarienummer/skyddskod

- [x] **TI02** Document states handläggare feedback and enumerates the manual-steps delta
  - Cover in-app-only feedback (no e-post, per `docs/prd.md#out-of-scope`) and explicitly list which of huvudregistratorns current manual-review steps disappear versus remain (registratorns bedömning for Mänsklig bedömning, handläggarens rättning for Åtgärd krävs, sekretessbedömning always to a human)
  - **Verify**: document names the feedback mechanism and lists disappearing vs. remaining manual steps per FR11's Acceptance Criteria bullet on manual steps

- [x] **TI03** Document describes the registrator's workspace built on the existing registratorvy
  - Point to the registrator queue/detail-view/actions already scoped for FR8 (`docs/prd.md#fr8-registratorvy`) as the "registratorns arbetsyta" FR11 requires, without describing new UI
  - **Verify**: document's registratorns-arbetsyta section references the existing queue/detail-view/actions rather than proposing new UI

- [x] **TI04** Document covers dataflöde/datahantering including the AI-service requirement for classified documents
  - State the prototype's cloud-LLM-for-syntetisk-data-only assumption (`docs/prd.md#assumptions`) and name that production use on real, classified handlingar requires a new, separate data-handling decision (e.g. data residency) before any AI-tjänst call
  - **Verify**: document's data-handling section distinguishes the prototype's synthetic-data assumption from the open production decision for classified documents, and does not describe an automatic change to datum/diarienummer/skyddskod

- [x] **TI05** Document names P360 requirements and lists open questions, including kontrollogg retention
  - Name what must exist in P360 (gränssnitt eller API) to receive the trigger and write back status, since no API documentation exists in the source material (`docs/prd.md#dependencies`); include kontrollogg-retention/arkivering as an explicit open question per `docs/adr.md#beslut-3-oföränderlig-kontrollogg-append-only`
  - **Verify**: document lists concrete P360 UI/API requirements and a separate, explicit list of open questions that includes kontrollogg-retention

- [x] **TI06** Document covers behörigheter, driftsättning and KPI measurement
  - Behörigheter: note the prototype has no login/role enforcement today (`docs/prd.md#out-of-scope`) and state what production behörigheter would require; driftsättning: outline the rollout; mätning: tie each business-case KPI (100 % granskning, ~5 % kräver mänsklig rättning, ledtid mot 0, per `docs/prd.md#evidence--context`) to a measurable signal sourced from S02's kontrollogg / S12's kvalitetsöversikt (`docs/prd.md#fr13-kvalitetsöversikt`)
  - **Verify**: document names behörigheter, a driftsättning outline, and each KPI's measurement source

- [x] **TI07** Document lays out the steg 1→3 pilot path without overstating step-3 readiness
  - Describe steg 1 (granskning) and steg 2 (rättning) as achievable on the S01-S09 pipeline; describe steg 3 (AI registrerar) explicitly as a future step gated on the open production data-handling decision (TI04) and the open P360 write-back questions (TI05)
  - **Verify**: document's pilotväg section marks steg 3 as gated/future rather than implemented today

- [x] **TI08** Document stays document-only and scoped to already-established pipeline behavior
  - No code, config, or data files are added or modified by this story; every status, rule, or auto-correction reference in the document points to behavior an S01-S09 story already establishes in `docs/plan.json` rather than inventing new pipeline behavior
  - **Verify**: only `docs/integrationsplan.md` is added by this story; the file parses as valid Markdown with all nine FR11-point section headings present; no status/rule/field described is absent from S01-S09's scope


## Implementation Observations

- Deliverable: `docs/integrationsplan.md`. No code, config or data files touched.
- The document has eleven sections, not nine: FR11's nine points plus two sections the Acceptance Criteria require as standalone content – the manual-steps delta (section 4) and the P360 requirements/open-questions tables (section 5). Folding those into other sections would have buried them.
- Concrete P360 vocabulary (statuses "Diarieförd av handläggare" / "Färdig från handläggare/chef" / "Registrerat" / "Makulerad" / "Avslutat", the view "Dokument redo för registrering", the role "Huvudregistrator") comes from `casedetails/Instruktionshandbok registraturen.DOCX`, section "Kvalitetsgranska ärenden". The PRD paraphrases it; the handbook has the exact terms.
- KPI figures in section 10 come from the PRD's Evidence & Context, cross-checked against `casedetails/Business case ESV_Registratur_251117_a (1).docx` (sections 6.2/6.3). The business case's step-3 framing is "dokumentkort skapas automatiskt utifrån filer"; the document follows the PRD's out-of-scope wording rather than the business case's.
- Two measurements were added that the business case lacks: false findings (rejected with motivering, FR8) and missed errors (stickprov, FR12). Both are already in the kontrollogg, so they cost nothing to collect, and without them a pilot cannot tell whether auto-registrering is safe.
- Requirements are numbered P1–P7 and open questions Ö1–Ö10 so later stories and meeting notes can reference them without quoting prose.
- The P360 write path is described as "log first, then write". The reverse order of ADR Beslut 3 would leave a document registered in P360 with no log entry, which is exactly the failure FR7 exists to prevent. A failed P360 write after a successful log write is itself a logged event, with the document left in its previous status.
