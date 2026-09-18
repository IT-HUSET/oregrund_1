# Feature Implementation Specification: Registratorvy

**Plan**: docs/plan.json
**Story-ID**: S07

## Feature Overview and Goal

**Intent**: Registraturen kan i dag bara granska ca 20 % av dokumentkorten manuellt; en registratorvy som samlar exakt de dokument som kräver mänsklig bedömning, visar varje fynd med regel/evidens/konfidens, och låter registratorn besluta per fynd gör det möjligt att stänga granskningsomgången utan att gissa eller tappa spårbarhet.

**Expected Outcomes**:

- [OC01] Registratorn väljer sin roll i sidhuvudet utan inloggning och ser en kö som är filtrerbar per status men visar Mänsklig bedömning som standard.
- [OC02] Dokumentdetaljvyn visar Detaljer/Kontakter/Filer samt varje fynd med regel-ID, regeltext, metod, evidens, svensk förklaring och konfidens (AI-fynd), plus dokumentets fulla kontrollogghistorik.
- [OC03] Registratorn kan godkänna eller avvisa (motivering krävs vid avvisning) varje fynd, och varje beslut skrivs till kontrolloggen med roll/tid/motivering innan dokumentets status ändras.
- [OC04] Efter registratorns beslut landar dokumentet på Registrerat eller Åtgärd krävs, och ett fynd som skickas till handläggaren gör att dokumentet syns i handläggarvyns kö.


## Required Context

- `docs/prd.md#fr8-registratorvy` – queue/detail/actions-kraven, acceptance criteria, valideringsregeln (avvisning kräver motivering) och felhanteringsregeln (misslyckat beslut lämnar status oförändrad) som utgör denna berättelses kärnscope.
- `docs/prd.md#user-stories` (US02, US03, US04-raderna) – acceptance criteria: kö filtrerad på Mänsklig bedömning som standard, fynd visar regel/evidens/metod/konfidens, beslut loggas med roll/tid/motivering och ger dokumentet ny status.
- `docs/plan.json#sharedDecisions.0` – RuleOutcome/Finding-kontraktet (S04/S05) som denna vy renderar och som registratorns godkänn/avvisa-beslut verkar på.
- `docs/plan.json#sharedDecisions.1` – Granskningsomgång-orkestreringskontraktet (S06): anropspunkten denna berättelse använder för att köra om en granskningsomgång efter ett beslut. Exakt funktionsnamn är en exekveringsdetalj S06 äger; denna FIS binder bara till kontraktets beskrivna beteende (status-precedens, en omkörning, loggning).
- `docs/plan.json#sharedDecisions.2` – Kontrollogg-händelseschemat och append/read-API:t (S02) som varje registratorbeslut skrivs till och som logg-fliken läser.
- `docs/plan.json#sharedDecisions.3` – Dokument/Ärende-datamodellen (S03) som Detaljer/Kontakter/Filer-flikarna renderar.
- `docs/prd.md#fr7-kontrollogg` – bindingConstraint (`docs/plan.json#bindingConstraints.2`): "Loggposter går inte att ändra eller radera via gränssnittet." Registratorvyns logg-flik är strikt läsbar.


## Deeper Context

- `docs/adr.md#skiss` – Next.js-appens fullstack-form (samma tjänst serverar UI och API-rutter, rollväljare i sidhuvudet, ingen databas).
- `docs/prd.md#fr4-statussättning` – fyrstatuslogiken (Mänsklig bedömning > Åtgärd krävs > Autokorrigerad > Godkänd) som förklarar vilka slutstatusar ett registratorbeslut kan resultera i.
- `docs/prd.md#fr6-förklarade-fynd` – fyndets fullständiga form (regel-ID, allvarlighetsgrad, metod, evidens, konfidens, förklaring, rättningsförslag) som detaljvyn måste rendera fält för fält.
- `docs/prd.md#fr5-automatisk-rättning-av-säkra-fel` och `docs/prd.md#constraints` – varför "godkänn förslag" aldrig får ändra data utöver vad S06 redan beräknat, och aldrig datum/diarienummer/skyddskod.
- `casedetails/testcases.json#cases` – TC-08 (AD-KONTAKT-5), TC-13 (AD-SEKRETESS-1), TC-15 (FIL-ZIP-1/FIL-ANTAL-1), TC-20 (sex fynd) som konkreta fixturer för scenarierna nedan.


## Acceptance Scenarios

- [ ] **S01 [OC01] [TI01,TI08] Registratorrollen väljs i sidhuvudet och kön visar Mänsklig bedömning som standard**
  - **Given** inga användare är inloggade och dokument finns med blandade statusar (Godkänd, Åtgärd krävs, Mänsklig bedömning)
  - **When** en användare väljer "Registrator" i sidhuvudets rollväljare
  - **Then** registratorkön visas utan någon inloggningsprompt och listar bara dokumenten med status Mänsklig bedömning

- [ ] **S02 [OC01] [TI01] Kön filtreras till en annan status**
  - **Given** registratorkön visar Mänsklig bedömning som standard
  - **When** registratorn byter statusfilter till Åtgärd krävs
  - **Then** kön visar bara dokument med status Åtgärd krävs (eller en förklarad tom vy om inga finns), utan att Mänsklig bedömning-filtret återställs automatiskt

- [ ] **S03 [OC02] [TI02,TI03] Dokumentdetaljvyn visar flikar, fynd och logg**
  - **Given** TC-13:s dokument (AD-SEKRETESS-1, status Mänsklig bedömning) har granskats
  - **When** registratorn öppnar dokumentet
  - **Then** vyn visar Detaljer/Kontakter/Filer-flikarna, AD-SEKRETESS-1-fyndet med regel-ID, regeltext, metod, evidens och svensk förklaring, samt en logg-flik med granskningsomgångens händelser i ordning

- [ ] **S04 [OC03] [TI04,TI07] Registratorn godkänner ett fynds rättningsförslag**
  - **Given** TC-08:s dokument väntar med AD-KONTAKT-5-fyndet ("Kopia till" ej rensat) i Mänsklig bedömning
  - **When** registratorn godkänner fyndets rättningsförslag
  - **Then** en loggpost skrivs med roll Registrator, tidpunkt och beslutet innan förslaget tillämpas, och dokumentets nästa status speglar S06:s omgångsresultat (Autokorrigerad/Registrerat)

- [ ] **S05 [OC03] [TI05,TI07] Avvisning utan motivering blockeras**
  - **Given** registratorn öppnat ett fynd och valt att avvisa det
  - **When** registratorn försöker skicka avvisningen utan att fylla i en motivering
  - **Then** avvisningen avvisas med ett valideringsmeddelande, ingen loggpost skrivs och dokumentets status är oförändrad

- [ ] **S06 [OC03,OC04] [TI05,TI07] Avvisning med motivering stänger fyndet och avslutar granskningen**
  - **Given** samma fynd som i S05, denna gång med motiveringen "AI-fyndet stämmer inte, kontakten är korrekt"
  - **When** registratorn skickar avvisningen
  - **Then** en loggpost skrivs med roll, tid och motivering, fyndet räknas inte längre med i utvärderingen, och dokumentet avslutas med status Registrerat eller Åtgärd krävs (aldrig kvar på Mänsklig bedömning enbart för det avvisade fyndet)

- [ ] **S07 [OC04] [TI06] Fynd skickas till handläggaren**
  - **Given** TC-15:s dokument med FIL-ZIP-1-fyndet i Mänsklig bedömning
  - **When** registratorn skickar fyndet till handläggaren
  - **Then** dokumentets status blir Åtgärd krävs och dokumentet syns i handläggarvyns kö (FR9 AC1), utan att registratorvyn själv renderar handläggarens redigeringsflöde


## Structural Criteria

- [ ] Registratorvyn exponerar ingen kontroll som redigerar eller tar bort en befintlig loggpost (FR7 bindingConstraint; strukturellt garanterat genom att bara använda S02:s append/read-API).
- [ ] Ett registratorbeslut som misslyckas skriva till kontrolloggen lämnar dokumentets status och fyndlista oförändrade och visar ett felmeddelande (FR8 Error Handling).
- [ ] Avvisning utan motivering blockeras även om klientvalideringen kringgås (server-side), så en klientbypass inte kan skippa granskningsloggen (plan.json riskSummary S07-mitigation).
- [ ] "Godkänn förslag" ändrar aldrig datum, diarienummer eller skyddskod, och ändrar aldrig data för ett regel-ID utan auto-rättningsflagga utöver vad S06:s kontrakt redan beräknat (docs/prd.md#constraints, docs/prd.md#fr5-automatisk-rättning-av-säkra-fel).


## Scope & Boundaries

### Work Areas
- Registratorkö (lista, statusfilter, default Mänsklig bedömning) – TI01.
- Dokumentdetaljvy (Detaljer/Kontakter/Filer-flikar, fyndlista, logg-flik) – TI02, TI03.
- Per-fynd beslutsflöde (godkänn förslag / avvisa med motivering / skicka till handläggare) – TI04, TI05, TI06.
- Serverdriven loggning som föregår varje status-/dataändring – TI07.
- Rollväljare i sidhuvudet utan inloggning – TI08.

### What We're NOT Doing
- Handläggarvyns lista/detaljvy, redigerbara fält och "Skicka för ny granskning" -- ägs av S08; S07 producerar bara Åtgärd krävs-övergången som gör att dokumentet landar där.
- Stickprovsflödet på registrerade dokument -- S11 äger sin egen kö och flagga-som-felbedömning-funktion.
- Kvalitetsöversiktens aggregerade nyckeltal -- S12 äger dashboarden.
- Granskningsmotorernas och S06:s egen bedömnings-/rättnings-/statuslogik -- S04-S06 äger regelutvärdering, auto-rättning och statusprecedens; S07 anropar bara S06:s omgångskontrakt och renderar dess resultat.


## Architecture Decision

**Approach**: Registratorvyn byggs som Next.js-sidor + API-rutter (`docs/adr.md#skiss`s fullstack-form) som läser S03/S04/S05/S06:s output via deras delade kontrakt och, för varje fyndbeslut, anropar S02:s append-writer innan S06:s omgångskontrakt körs om -- vyn muterar aldrig dokument- eller loggdata direkt.
**Why this over alternatives**: ADR:n slår redan fast en enda Next.js-app med fil-baserad JSON-lagring och utan separat auth-lager; att bygga vyn som en tunn konsument av S02/S06:s kontrakt håller motivering-krävs-vid-avvisning och logg-gating på ett enda serversidigt ställe i stället för att duplicera statuslogik i UI:t.


## Code Patterns & External References

```
# type | path#anchor or url                          | why needed (intent)
file   | docs/prd.md#fr8-registratorvy                | Auktoritativ queue/detail/actions-kravlista och valideringsregel
file   | casedetails/testcases.json#cases             | TC-08/TC-13/TC-15/TC-20-fixturer för scenarierna ovan
file   | docs/adr.md#skiss                             | Next.js fullstack-form, ingen separat auth
```


## Constraints & Gotchas

- **Constraint**: `checklist_rules.json`, S03:s Dokument/Ärende-modell, S04/S05:s RuleOutcome/Finding-output, S02:s kontrollogg-API och S06:s omgångskontrakt finns inte i repot när denna FIS skrivs (S06 är fortfarande `pending`, körs parallellt i samma sub-wave) -- Workaround: bygg mot `docs/plan.json#sharedDecisions`-beskrivningarna och `docs/prd.md`-scheman, inte mot S02/S03/S04/S05/S06-kod; S07 kan inte köras end-to-end förrän S06 landat (S07 `dependsOn` S06).
- **Critical**: rejection-requires-motivation och per-fynd-loggning måste tvingas fram serversidigt, inte bara i klienten (plan.json riskSummary S07-mitigation), annars kan en klientbypass skippa granskningsloggen.
- **Avoid**: att låta "godkänn förslag" tillämpa en korrigering direkt i UI-lagret -- Instead: skicka beslutet till S06:s omgångskontrakt, som äger vilka regler som faktiskt får ändra data (FR5 bindingConstraint).


## Implementation Plan

### Implementation Tasks

- [ ] **TI01** Registratorkön listar dokument filtrerbara per status, med Mänsklig bedömning som standard
  - Läser dokumentstatus från S06:s omgångskontrakt (`docs/plan.json#sharedDecisions.1`); statusfiltret är en explicit UI-kontroll, inte bara ett standardvärde som aldrig kan ändras
  - **Verify**: en fixtur med dokument i alla fyra statusar visar bara Mänsklig bedömning-dokument vid första visning; byte av filter till en annan status visar bara den statusens dokument

- [ ] **TI02** Dokumentdetaljvyn renderar Detaljer/Kontakter/Filer utifrån S03:s dokumentmodell
  - Följer `docs/plan.json#sharedDecisions.3` för fältindelning per flik (ärende/ärendedokument/fil)
  - **Verify**: TC-13:s dokument visar sina ärende- och ärendedokumentfält under respektive flik utan att fält saknas eller dupliceras

- [ ] **TI03** Fyndlistan och logg-fliken renderar S04/S05:s fyndform respektive S02:s dokumenthistorik
  - Fyndlistan visar regel-ID, regeltext, allvarlighetsgrad, metod, evidens, svensk förklaring, rättningsförslag och konfidens (bara AI-fynd) per `docs/plan.json#sharedDecisions.0` och FR6; logg-fliken läser via S02:s per-dokument-API (`docs/plan.json#sharedDecisions.2`) och exponerar ingen redigerings- eller raderingskontroll
  - **Verify**: TC-20:s dokument visar samtliga sex fynd, och minst ett AI-fynd (t.ex. AD-KONTAKT-4) visar ett konfidensvärde medan ett rent metadatafynd inte gör det; ett dokument granskat i två omgångar visar båda omgångarnas händelser i ordning i logg-fliken

- [ ] **TI04** Registratorn godkänner ett fynds rättningsförslag
  - Markerar fyndet godkänt och anropar S06:s omgångskontrakt för att köra om berörda regler; tillämpar aldrig korrigeringen själv (Constraints & Gotchas)
  - **Verify**: godkännande av TC-08:s AD-KONTAKT-5-förslag resulterar i att dokumentets nästa status speglar S06:s omgångsresultat, och TI07:s loggpost skrivs innan förslaget tillämpas

- [ ] **TI05** Registratorn avvisar ett fynd med obligatorisk motivering
  - Blockerar avvisning utan motiveringstext, både i UI och i det anropade API:t; vid giltig motivering exkluderas fyndet från nästa utvärdering via S06:s omgångskontrakt
  - **Verify**: avvisning med tom motivering ger ett valideringsfel och ingen statusändring; avvisning med motiveringen "AI-fyndet stämmer inte, kontakten är korrekt" stänger fyndet och dokumentet omvärderas utan det

- [ ] **TI06** Registratorn skickar ett fynd till handläggaren
  - Sätter dokumentets status till Åtgärd krävs så dokumentet blir synligt i S08:s handläggarvy-scope (FR9 AC1); denna berättelse producerar bara statusövergången, inte handläggarvyns UI
  - **Verify**: att skicka TC-15:s FIL-ZIP-1-fynd till handläggaren sätter dokumentets status till Åtgärd krävs

- [ ] **TI07** Varje fyndbeslut loggas innan det får effekt, och ett misslyckat skrivförsök lämnar tillstånd oförändrat
  - Anropar S02:s append-writer (`docs/plan.json#sharedDecisions.2`) med roll "Registrator", tidpunkt och motivering (vid avvisning) före varje status-/dataändring från TI04-TI06; vid skrivfel visas ett felmeddelande och varken status eller fyndlista ändras (FR8 Error Handling)
  - **Verify**: en framtvingad loggskrivningsfel under en avvisning lämnar dokumentets status och fyndlista oförändrade och visar ett felmeddelande; ett lyckat beslut ger en loggpost som innehåller roll, tid och (vid avvisning) motivering

- [ ] **TI08** Rollväljaren i sidhuvudet växlar mellan Registrator och Handläggare utan inloggning
  - Ingen autentisering; val av roll styr vilken kö/vy som renderas (FR8 AC4)
  - **Verify**: att välja "Registrator" i sidhuvudet visar registratorkön direkt, utan någon inloggnings- eller autentiseringsprompt i flödet

### Testing Strategy
- Återanvänd `casedetails/testcases.json`s TC-08/TC-13/TC-15/TC-20-fixturer i UI-/API-tester i stället för handkonstruerade fixturer, så testerna hålls i synk med S09:s kommande testsvit.


## Implementation Observations

- Kod: `src/app/registrator/` (kö, detaljvy, `Beslutsformular`), `src/app/api/dokument/[id]/beslut/route.ts`, `src/lib/registrator.ts` (beslut, server-validerat), `src/lib/registrator-vy.ts`, `src/lib/dokumentlager.ts` (nytt filbaserat lager, `data/dokument.json`), `src/lib/granskningstjanst.ts` (`granskaOchSpara`), `scripts/seed.ts`.
- S06 utökades: `korGranskningsomgang` tar `avgjorda` (avvisat/godkant/skickat per regel-ID) och returnerar `omgangLoggad`. Ett avvisat fynd rättas inte och räknas inte; ett skickat fynd ger Åtgärd krävs före FR4:s ordning; ett beslut om en regel räknas som dess mänskliga bedömning, även när motorn markerat regeln "ej genomförd" (AD-SEKRETESS-1: S04 ger fyndet, S05 lämnar H-steget till människa).
- Beslutet loggas i en egen post före omgången (S07 S04: beslut före rättning). Misslyckas omgångens loggpost sparas bara dokumentets redan loggade rättningar, inte status eller fynd.
- `Godkänn förslag` på en regel utan auto-rättning bekräftar fyndet och ger Åtgärd krävs; registratorn rättar aldrig data själv (FR5).
- Lagrets `beslut` gäller senaste omgången. S08:s "Skicka för ny granskning" ska nollställa det (den anropar omgången utan `avgjorda`).
- Regler som är "ej genomförd" utan fynd (AI nere) har inget fynd att avgöra, så ett sådant dokument kan inte lämna Mänsklig bedömning från registratorvyn.
- Utan `ANTHROPIC_API_KEY` degraderar alla AI-regler; alla 20 testfall hamnar då i Mänsklig bedömning.
