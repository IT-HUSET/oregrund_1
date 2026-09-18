# Feature Implementation Specification: Stickprov

**Plan**: docs/plan.json
**Story-ID**: S11

## Feature Overview and Goal

**Intent**: Godkända och autokorrigerade dokument aldrig syns i registratorns Mänsklig bedömning-kö (S07), så utan ett eget stickprovsflöde kan registratorn inte upptäcka en felbedömning som automatiken redan registrerat -- stickprov ger registratorn insyn i automatikens kvalitet i efterhand.

**Expected Outcomes**:

- [OC01] Registratorn kan filtrera fram och öppna automatiskt registrerade dokument (status Godkänd eller Autokorrigerad) och se dokumentets fulla kontrollogghistorik.
- [OC02] Registratorn kan markera ett specifikt fynd i ett sådant dokument som en felbedömning med en obligatorisk kommentar; markeringen loggas med roll, tid, regel-ID och kommentar och syns i logg-fliken.
- [OC03] Ett misslyckat eller ogiltigt (kommentarslöst) markeringsförsök lämnar dokumentets status, fyndlista och logg oförändrade och visar ett fel-/valideringsmeddelande.


## Required Context

- `docs/prd.md#fr12-stickprov` – FR12:s auktoritativa scope (lista/öppna registrerade dokument, markera missat/felaktigt fynd med kommentar), acceptance criteria, valideringsregeln ("En markering kräver kommentar") och felhanteringsregeln ("Om en markering inte kan sparas visas ett felmeddelande") som utgör denna berättelses kärnscope.
- `docs/prd.md#user-stories` (US08-raden) – acceptance criteria: registratorn kan öppna registrerade dokument och markera ett fynd som saknat eller felaktigt, markeringen loggas.
- `docs/plan.json#sharedDecisions.2` – Kontrollogg-händelseschemat och append/read-API:t (S02) som S11 både läser (dokumentets fulla logg) och skriver till (felbedömningsmarkeringen); S11 är namngiven konsument.
- `docs/s07-registratorvy.md` – den etablerade registratorytan (kö/detaljvy-mönster, rollväljare i sidhuvudet, logg-flik läst via S02:s API) S11 återanvänder i stället för att bygga en parallell yta; särskilt `docs/s07-registratorvy.md#implementation-tasks` (TI02/TI03) för detaljvyns flik-/loggstruktur och TI07:s logg-gated-mutation-mönster.
- `docs/prd.md#fr7-kontrollogg` – bindingConstraint (`docs/plan.json#bindingConstraints.2`): "Loggposter går inte att ändra eller radera via gränssnittet." En felbedömningsmarkering skriver alltid en ny loggpost, ändrar aldrig en befintlig.


## Deeper Context

- `docs/prd.md#fr4-statussättning` – fyrstatuslogiken; Godkänd och Autokorrigerad är de enda statusar som sätter "Registrerat" automatiskt och är därmed stickprovsköns filterkriterium.
- `docs/prd.md#edge-cases` – TC-01/TC-02-raden ("Godkänd, inga fynd och Registrerat") som konkret fixtur för ett rent stickprovat dokument.
- `docs/s06-granskningsomgang-status-auto-rattning-och-logg.md#acceptance-scenarios` – scenario S02 (TC-08 löser till Autokorrigerad, AD-KONTAKT-5 auto-rättas, `dokumentstatus` sätts till Registrerat) som konkret fixtur för ett stickprovat dokument med ett auto-rättat fynd.
- `casedetails/testcases.json#cases` – TC-01 (Godkänd) och TC-08 (Autokorrigerad, AD-KONTAKT-5) som stickprovsfixturer.
- `docs/adr.md#skiss` – Next.js-appens fullstack-form (samma tjänst serverar UI och API-rutter, rollväljare i sidhuvudet, ingen databas), samma mönster S07 redan följer.


## Acceptance Scenarios

- [ ] **S01 [OC01] [TI01] Stickprovskön visar bara automatiskt registrerade dokument**
  - **Given** dokument finns med status Godkänd (TC-01), Autokorrigerad (TC-08), Åtgärd krävs och Mänsklig bedömning
  - **When** registratorn öppnar stickprovsvyn
  - **Then** listan visar bara TC-01 och TC-08, inte dokumenten med Åtgärd krävs eller Mänsklig bedömning

- [ ] **S02 [OC01] [TI02] Registratorn öppnar ett registrerat dokument och ser dess fulla logg**
  - **Given** TC-08:s dokument (Autokorrigerad, AD-KONTAKT-5 auto-rättades och `kopia_till` blev tomt)
  - **When** registratorn öppnar dokumentet från stickprovskön
  - **Then** vyn visar granskningsomgångens händelser i ordning, inklusive AD-KONTAKT-5:s före/efter-värden, utan någon synlig redigerings- eller raderingskontroll för befintliga poster

- [ ] **S03 [OC02] [TI03,TI04,TI05] Registratorn flaggar ett fynd som felbedömning med kommentar**
  - **Given** TC-08:s dokument öppet i stickprovsvyn, med AD-KONTAKT-5-fyndet synligt i loggen
  - **When** registratorn markerar fyndet som felbedömning med kommentaren "Kopia till borde ha behållits – mottagaren behövde kopian"
  - **Then** en loggpost skrivs med roll Registrator, tidpunkt, fyndets regel-ID (AD-KONTAKT-5) och kommentaren, och markeringen syns i dokumentets logg-flik

- [ ] **S04 [OC03] [TI04] Flaggning utan kommentar blockeras**
  - **Given** registratorn har öppnat flagga-som-felbedömning-dialogen för ett fynd
  - **When** registratorn försöker skicka markeringen med ett tomt kommentarfält
  - **Then** markeringen avvisas med ett valideringsmeddelande och ingen loggpost skrivs

- [ ] **S05 [OC03] [TI05] Misslyckad sparning lämnar dokumentet oförändrat**
  - **Given** ett forcerat skrivfel i kontrolloggens append-anrop
  - **When** registratorn skickar en i övrigt giltig felbedömningsmarkering (kommentar ifylld)
  - **Then** ett felmeddelande visas, ingen ofullständig loggpost sparas, och dokumentets status, fyndlista och logg är oförändrade

- [ ] **S06 [OC01] [TI01] Ingen registrerade dokument ger en förklarad tom vy**
  - **Given** inga dokument har status Godkänd eller Autokorrigerad
  - **When** registratorn öppnar stickprovsvyn
  - **Then** vyn visar en förklarad tom vy, samma mönster som S07:s statusfilter använder, i stället för ett fel eller en blank lista


## Structural Criteria

- [ ] Stickprovsvyn exponerar ingen kontroll som redigerar eller tar bort en befintlig loggpost (FR7 bindingConstraint; strukturellt garanterat genom att bara använda S02:s append/read-API).
- [ ] En felbedömningsmarkering som misslyckas skriva till kontrolloggen lämnar dokumentets status, fyndlista och logg oförändrade och visar ett felmeddelande (FR12 Error Handling).
- [ ] Kommentar krävs vid flaggning även om klientvalideringen kringgås (server-side), så en klientbypass inte kan skippa kravet (FR12 Validation; samma mönster som S07:s riskSummary-mitigation för avvisning-kräver-motivering).
- [ ] En felbedömningsmarkering ändrar aldrig dokumentets data, status eller något regel-ID:s befintliga utfall -- bara en ny loggpost tillkommer (docs/prd.md#constraints: automatiken/registratorn ändrar aldrig data utöver auto-rättningsflaggade fält).


## Scope & Boundaries

### Work Areas
- Stickprovskö (lista/filter på Godkänd/Autokorrigerad, förklarad tom vy) – TI01.
- Dokumentdetaljvy återanvänd från S07 (logg-flik, flikstruktur) för ett stickprovat dokument – TI02.
- Flagga-som-felbedömning-flöde (per-fynd-kontroll, obligatorisk kommentar) – TI03, TI04.
- Serverdriven loggning av markeringen innan den syns – TI05.

### What We're NOT Doing
- Aggregering av felbedömningsandelar och nyckeltal till en dashboard -- S12 (kvalitetsöversikt) äger den.
- Registratorkön för Mänsklig bedömning, per-fynd-beslutsflödet (godkänn/avvisa/skicka till handläggare) och rollväljaren -- redan byggt av S07; S11 återanvänder samma yta och komponenter, bygger inte en parallell.
- Att ändra dokumentets granskningsstatus eller trigga en ny S06-granskningsomgång som följd av en flaggning -- en felbedömningsmarkering är bara en ny logghändelse, aldrig en statusändrande händelse.
- Handläggarvyns flöde -- opåverkad av stickprov.


## Architecture Decision

**Approach**: Bygg stickprovsvyn som ytterligare Next.js-sidor/API-rutter inom samma registrator-yta som S07 (`docs/adr.md#skiss`), filtrera S06:s dokumentstatus till Godkänd/Autokorrigerad, återanvänd S07:s detaljvy-/logg-flik-komponent för visning, och lägg till en flagga-som-felbedömning-API-rutt som bara anropar S02:s append-writer.
**Why this over alternatives**: Undviker att duplicera detaljvy- och loggrendering; håller kommentar-krävs-valideringen och loggskrivningen på samma serversidiga mönster S07 redan etablerat för avvisning-kräver-motivering.


## Code Patterns & External References

```
# type | path#anchor or url                                                        | why needed (intent)
file   | docs/prd.md#fr12-stickprov                                                | Auktoritativ scope, AC, validerings- och felhanteringsregel
file   | docs/s07-registratorvy.md#implementation-tasks                            | TI02/TI03:s detaljvy-/logg-flik-mönster och TI07:s logg-gated-mutation-mönster att återanvända
file   | docs/plan.json#sharedDecisions.2                                          | Kontrollogg-händelseschemat och append/read-API:t S11 läser och skriver till
file   | casedetails/testcases.json#cases                                         | TC-01 (Godkänd) och TC-08 (Autokorrigerad, AD-KONTAKT-5) som stickprovsfixturer
file   | docs/adr.md#skiss                                                         | Next.js fullstack-form, ingen separat auth
```


## Constraints & Gotchas

- **Constraint**: S02:s kontrollogg-API, S06:s omgångskontrakt och S07:s registratorkomponenter (kö, detaljvy, logg-flik) finns inte i repot när denna FIS skrivs -- Workaround: bygg mot `docs/plan.json#sharedDecisions`-beskrivningarna och S07:s FIS-etablerade mönster (kö/detaljvy/logg-flik-struktur), inte mot faktisk kod; S11 kan inte köras end-to-end förrän S02/S06/S07 landat (S11 `dependsOn` S07).
- **Critical**: kommentar-krävs-vid-flaggning måste tvingas fram serversidigt, inte bara i klienten (samma riskmönster som S07:s riskSummary-mitigation för avvisning-kräver-motivering) -- annars kan en klientbypass skippa granskningsloggen.
- **Avoid**: att låta flaggningen mutera dokumentets fyndutfall, status eller trigga en ny S06-granskningsomgång -- Instead: flaggningen är alltid bara en ny kontrolloggpost (append); S06:s omgångskontrakt äger all statuslogik, inte S11.


## Implementation Plan

### Implementation Tasks

- [ ] **TI01** Stickprovskön listar bara dokument med status Godkänd eller Autokorrigerad
  - Filtrerar på S06:s omgångskontrakts slutstatus (`docs/plan.json#sharedDecisions.1`); en tom kö visar en förklarad tom vy i stället för ett fel eller en blank lista, samma mönster som S07:s statusfilter (`docs/s07-registratorvy.md`)
  - **Verify**: en fixtur med dokument i alla fyra statusar (inkl. TC-01 Godkänd, TC-08 Autokorrigerad) visar bara de två registrerade statusarna vid stickprovsvyns öppning; en fixtur utan Godkända/Autokorrigerade dokument visar en förklarad tom vy

- [ ] **TI02** Dokumentdetaljvyn återanvänder S07:s flik-/loggstruktur för ett stickprovat dokument
  - Följer `docs/s07-registratorvy.md#implementation-tasks` (TI02/TI03) för fältindelning och logg-flikens append/read-läsning (`docs/plan.json#sharedDecisions.2`); exponerar ingen redigerings- eller raderingskontroll för befintliga loggposter
  - **Verify**: TC-08:s dokument öppnat från stickprovskön visar samma logghistorik (inklusive AD-KONTAKT-5:s före/efter-värden) som registratorns Mänsklig bedömning-detaljvy, utan någon synlig redigerings- eller raderingskontroll

- [ ] **TI03** Registratorn kan markera ett specifikt fynd som felbedömning
  - Varje fynd i ett stickprovat dokuments loggade granskningsomgång har en flagga-som-felbedömning-kontroll som öppnar ett kommentarfält; markeringen refererar fyndets regel-ID och den granskningsomgång det tillhör
  - **Verify**: TC-08:s AD-KONTAKT-5-fynd kan markeras som felbedömning från detaljvyn

- [ ] **TI04** Flaggning kräver en kommentar, både i klienten och i det anropade API:t
  - Blockerar tomt/whitespace-only kommentarfält innan anropet når S02:s writer; serversidig validering upprepar samma krav (Constraints & Gotchas), depends on TI03's flag control
  - **Verify**: ett anrop med tom kommentar avvisas med ett valideringsfel och ingen loggpost skrivs, oavsett om anropet görs via UI eller direkt mot API:t

- [ ] **TI05** Varje giltig felbedömningsmarkering loggas innan den syns i logg-fliken, och ett misslyckat skrivförsök lämnar tillståndet oförändrat
  - Anropar S02:s append-writer (`docs/plan.json#sharedDecisions.2`) med roll "Registrator", tidpunkt, fyndets regel-ID och kommentaren; skriver aldrig till dokumentets status- eller fyndfält (Avoid-regeln ovan)
  - **Verify**: en framtvingad loggskrivningsfel under en flaggning lämnar dokumentets logg och status oförändrade och visar ett felmeddelande; en lyckad flaggning ger en loggpost med roll, tid, regel-ID och kommentar synlig i logg-fliken, utan att dokumentets status eller något regel-ID:s utfall ändras

### Testing Strategy
- Återanvänd `casedetails/testcases.json`s TC-01 (Godkänd, inga fynd) och TC-08 (Autokorrigerad, AD-KONTAKT-5 auto-rättad) som stickprovsfixturer i stället för handkonstruerade fixturer.


## Implementation Observations

_No observations recorded yet._
