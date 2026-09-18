# Feature Implementation Specification: Deterministisk granskningsmotor

**Plan**: docs/plan.json
**Story-ID**: S04

## Feature Overview and Goal

**Intent**: Registraturen kan i dag bara hinna granska ca 20 % av dokumentkorten manuellt; en deterministisk motor som maskinellt prövar varje metadata- och uppslagsbar regel mot varje dokument gör 100 % granskning möjlig för den delen av regelverket, utan att gissa på sådant som kräver innehållsläsning.

**Expected Outcomes**:

- [OC01] Varje regel i motorns ansvarsområde (M/M+L-raderna plus samtliga FIL-regler, se Technical Overview) får exakt ett utfall per granskning – uppfylld, fynd, ej tillämplig eller ej genomförd – och FIL-ANTAL-1 utvärderas alltid, även utan filer.
- [OC02] Varje fynd som motorn producerar har regel-ID, regeltext, allvarlighetsgrad, metod, evidens och en svensk förklaring (FR6), utan att hitta på kontakter.
- [OC03] Motorn ändrar aldrig dokumentets eller ärendets data – inte ens för AD-KONTAKT-5 och FIL-ZIP-1, som har auto-rättningsflagga men vars faktiska rättning hör till S06.
- [OC04] Uppslag mot kontaktregister och klassificeringsstruktur ger deterministiska, återupprepningsbara utfall och det rättningsförslag som PRD:n föreskriver (t.ex. TC-09:s "beställ ny kontakt av registraturen").


## Required Context

- `docs/prd.md#fr1-regelkatalog` – auktoritativ tabell (Regel-ID/Nivå/Fält/Fel om/Metod/Auto-rättning) som motorns handler-set är härlett från; se Technical Overview för hur denna FIS tolkar kombinerade metodvärden (M/C, M+L/C, M → H).
- `docs/prd.md#fr3-granskning` – varje regel ska få ett utfall, alla fynd rapporteras (inte bara det första), regler som kräver filer blir "ej tillämplig" om filer saknas (utom FIL-ANTAL-1).
- `docs/prd.md#fr6-förklarade-fynd` – fyndformen varje S04-fynd måste uppfylla (regel-ID, allvarlighetsgrad, metod, evidens, förklaring, rättningsförslag; konfidens bara för AI-fynd).
- `docs/adr.md#beslut-2-granskningspipeline--deterministiskt--ai--status` – pipelineordning: deterministiska regler körs först och ovillkorligt, innan AI eller status.
- `docs/plan.json#sharedDecisions.0` – RuleOutcome/Finding-kontraktet som både S04 och S05 producerar in i, och som S06 konsumerar.
- `docs/plan.json#sharedDecisions.3` – Dokument/Ärende-datamodellen (produceras av S03) som motorn läser.
- `docs/prd.md#constraints` – datum, diarienummer och skyddskod ändras aldrig automatiskt (bindingConstraint).
- `docs/prd.md#fr5-automatisk-rättning-av-säkra-fel` – "Ingen annan regel än dem med auto-rättningsflagga ändrar data" (bindingConstraint); motorn själv rättar aldrig, den bara rapporterar.


## Deeper Context

- `docs/prd.md#data-requirements-if-applicable` – fältschema för Ärende/Ärendedokument/Fil/Referensdata som handlerna läser.
- `docs/prd.md#fr2-inläsning-av-dokument` – valfria-fält-nyansen: saknat `godkannandeflode_status` ger inget AD-GODKANNANDE-1-fynd, bara det explicita värdet "Saknas" gör det.
- `docs/prd.md#edge-cases` – "Dokument utan filer"-raden bakom S05:s ej-tillämplig-scenario nedan.


## Acceptance Scenarios

- [x] **S01 [OC01] [TI01,TI09] Korrekt dokument ger uppfylld på hela motorns regelset**
  - **Given** TC-01-fixturen (internt beslut, alla fält korrekta, `ar_lasbar=true`, ingen zip)
  - **When** motorn kör sitt regelset mot dokumentet
  - **Then** varje regel i motorns ansvarsområde returnerar "uppfylld" och inga fynd produceras, i linje med TC-01:s `expected_findings: []`

- [x] **S02 [OC01,OC02,OC03] [TI02,TI08] Metadatafynd utan självrättning – AD-KONTAKT-5**
  - **Given** TC-08-fixturen med `kopia_till: "Clas Olsson"`
  - **When** motorn utvärderar AD-KONTAKT-5
  - **Then** utfallet är "fynd" med regel-ID AD-KONTAKT-5, evidens "Clas Olsson" och en svensk förklaring, och `kopia_till` är fortfarande "Clas Olsson" efter körningen – rättningen sker inte här

- [x] **S03 [OC01,OC02,OC04] [TI03,TI08] Uppslagsfynd med föreskrivet rättningsförslag – AD-KONTAKT-2**
  - **Given** TC-09-fixturen där avsändaren "Myndigheten för digital förvaltningsutveckling" saknas i kontaktregistret (PRD:s antagande)
  - **When** motorn utvärderar AD-KONTAKT-2
  - **Then** utfallet är "fynd" med rättningsförslaget "beställ ny kontakt av registraturen" och ingen påhittad kontakt

- [x] **S04 [OC01,OC02,OC04] [TI04,TI08] Klassificeringsuppslag ger fynd vid okänd process – AR-PROCESS-1**
  - **Given** ett ärende vars `process`-fält inte finns i klassificeringsstrukturen
  - **When** motorn utvärderar AR-PROCESS-1
  - **Then** utfallet är "fynd" med evidens som anger den okända processkoden; för en process som finns i strukturen (t.ex. TC-01:s "1.2 - Leda och styra verksamheten") ger regeln "uppfylld"

- [x] **S05 [OC01,OC02] [TI05,TI08] Datummismatch mot dokumenttext – AD-DATUM-1**
  - **Given** TC-10-fixturen där `dokumenttext` anger "1 juli 2026" men `dokumentdatum` är satt till "2026-08-25"
  - **When** motorn utvärderar AD-DATUM-1
  - **Then** utfallet är "fynd" med evidens som visar båda datumen

- [x] **S06 [OC01,OC02] [TI06,TI08] Filanalysfynd – FIL-ZIP-1 och FIL-ANTAL-1**
  - **Given** TC-15-fixturen (`ar_zip=true`, `ar_uppackad=false`, `antal_bilagor=3`, `filer=["anbud_bilagor.zip"]`)
  - **When** motorn utvärderar filreglerna
  - **Then** FIL-ZIP-1 ger "fynd" (zip ej uppackad) och FIL-ANTAL-1 ger "fynd" (3 bilagor angivna mot 1 registrerad fil), båda med FR6-formad evidens, och zip-filen packas inte upp av motorn

- [x] **S07 [OC01] [TI06] Ej tillämplig vid saknade filer, utom FIL-ANTAL-1**
  - **Given** ett dokument utan bifogade filer (PRD:s edge case "Dokument utan filer")
  - **When** motorn utvärderar filreglerna
  - **Then** FIL-ANTAL-1 ger ett riktigt utfall (fynd eller uppfylld beroende på `antal_bilagor`) medan FIL-MISSIV-1, FIL-ZIP-1, FIL-LASBAR-1, FIL-SKANN-1 och FIL-UNDERTECKNAD-1 alla ger "ej tillämplig"

- [x] **S08 [OC01,OC02] [TI07] Eskalering utan AI – AD-SEKRETESS-1**
  - **Given** TC-13-fixturen (`ärende.status="Avslutat"`, `skyddskod="Sekretess"`)
  - **When** motorn utvärderar AD-SEKRETESS-1
  - **Then** utfallet är "fynd" med metodtaggen som visar att regeln kräver mänsklig bedömning, inget anrop görs mot Claude API, och `skyddskod` förblir "Sekretess"


## Structural Criteria

- [x] Motorns handler-set täcker exakt S04:s regel-ID:n (16 M/M+L-rader plus 6 FIL-rader = 22, se Technical Overview) och stäms av mot de 22 regel-ID:n som `testcases.json` refererar (S04:s riskSummary-mitigation).
- [x] Ingen handler finns för en ren C/H-regel (AR-TITEL-1/3/4, AR-KONTAKT-1, AD-TITEL-1/3/4) i denna motor.
- [x] Motorn är en ren funktion `(dokument, regelkatalog, referensdata) -> RuleOutcome[]`; den skriver aldrig till dokument, ärende, filer eller logg.
- [x] Ingen Claude/Anthropic API-klient importeras eller anropas av denna modul.


## Scope & Boundaries

### Work Areas
- Regelmotorns dispatcher/handler-set (ny modul) som mappar regel-ID → utfall, motorns del av FR3:s pipeline-steg 1.
- Metadatahandlers för rena M-regler och M-delen av kombinerade regler (AD-KONTAKT-1/3/5, AR-KONTAKT-3, AD-GODKANNANDE-1, AD-DATUM-1, AD-KATEGORI-1).
- Uppslagshandlers mot kontaktregister.json/klassificeringsstruktur.json (S01) för AR-/AD-KONTAKT-2/4, AR-PROCESS-1, AD-HANDLINGSTYP-1.
- Filanalyshandlers som läser S03:s inlästa fil-flaggor för samtliga 6 FIL-regler, inklusive FIL-ANTAL-1-undantaget.
- AD-SEKRETESS-1-eskaleringshandler (M → H, ingen AI).
- Sammanställning av RuleOutcome/Finding enligt FR6 och det delade kontraktet (`docs/plan.json#sharedDecisions.0`).

### What We're NOT Doing
- Innehålls-/språk-/rimlighetsbedömning för rena C/H-regler (AR-TITEL-1/3/4, AR-KONTAKT-1, AD-TITEL-1/3/4) -- ägs av syskonberättelsen S05 (AI-motorn).
- Utförande av AD-KONTAKT-5/FIL-ZIP-1-rättningar eller omkörning av beroende regler efter rättning -- ägs av S06 (FR5); S04 rapporterar bara.
- Fyrstatuslogiken (Godkänd/Autokorrigerad/Åtgärd krävs/Mänsklig bedömning) -- ägs av S06 (FR4).
- Skrivning till kontrolloggen -- ägs av S02 (skrivaren)/S06 (anropsplatsen); S04 returnerar bara utfall till sin anropare.


## Architecture Decision

**Approach**: Motorn byggs som ett regel-ID-indexerat handler-set (en ren funktion per S04-ägd regel), laddat mot S01:s katalog/referensdata och S03:s dokumentmodell, och körs som pipelinens första steg. Se ADR: `docs/adr.md#beslut-2-granskningspipeline--deterministiskt--ai--status`
**Why this over alternatives**: En handler-per-regel-ID-karta gör det möjligt för S09:s testsvit och S04:s egen riskSummary-mitigation att stämma av täckning 1:1 mot katalogen och `testcases.json`, i stället för en monolitisk regeltolk som gömmer vilka regler som faktiskt är implementerade.


## Technical Overview

`checklist_rules.json` finns inte än (S01 körs parallellt) – regeltilldelningen nedan är härledd direkt ur `prd.md#fr1-regelkatalog`:s Metod-kolumn, inte ur S01:s (ännu ej skrivna) katalogformat.

**Uppdelningsprincip**: S04 äger varje rad vars Metod-värde börjar med `M` eller `M+L` (16 rader: AR-TITEL-2, AR-PROCESS-1, AR-KONTAKT-2/3/4, AD-TITEL-2, AD-KONTAKT-1/2/3/4/5, AD-DATUM-1, AD-HANDLINGSTYP-1, AD-KATEGORI-1, AD-SEKRETESS-1, AD-GODKANNANDE-1) plus samtliga 6 FIL-regler. FIL-reglerna hör till S04 oavsett PRD:ns C/C+H-metodetikett, eftersom S03:s story-scope uttryckligen undantar "file-content analysis (S04)" åt den här berättelsen – i prototypen är filanalys ett uppslag av redan beräknade booleska flaggor (`ar_lasbar`, `ar_zip`, `ar_dubbelsidig_original`, `ar_korrekt_skannad`, `ar_undertecknad_version`, `mejlmissiv_diarieford`) på det inlästa dokumentet, inte faktisk filparsning. De 7 rena C/H-raderna (AR-TITEL-1/3/4, AR-KONTAKT-1, AD-TITEL-1/3/4) hör till S05.

För de 10 kombinerade M/C-, M+L/C- och M → H-raderna utvärderar S04 bara den metadata- eller uppslagsbara delen av "Fel om"-villkoret (aldrig fritext/`dokumenttext`); S05 utvärderar självständigt samma regel-ID:s innehållsbaserade del, enligt det delade RuleOutcome-kontraktet. Exempel: AR-PROCESS-1:s "saknas i klassificeringsstrukturen" är S04, men "stämmer inte med vad ärendet rör" (TC-19) kräver innehållsförståelse och är S05.


## Code Patterns & External References

```
# type | path#anchor or url               | why needed (intent)
file   | casedetails/testcases.json#cases | Konkreta ärende/ärendedokument/fil-fixturer och expected_findings per regel-ID – spegla denna form för handler-in/output
file   | docs/prd.md#fr1-regelkatalog     | Auktoritativ Regel-ID/Metod/Fel-om-tabell handler-setet är härlett från
```


## Constraints & Gotchas

- **Constraint**: `checklist_rules.json`/`kontaktregister.json`/`klassificeringsstruktur.json` (S01) och den inlästa Dokument/Ärende-modellen (S03) finns inte i repot än -- Workaround: skriv handlerna mot scheman i `prd.md#fr1-regelkatalog`/`#data-requirements-if-applicable`, inte mot S01/S03-kod; motorn kan inte köras end-to-end förrän båda landat (S04 `dependsOn` S01, S03).
- **Critical**: Metod-kolumnens uppdelning (se Technical Overview) är den här berättelsens egen scope-tolkning, inte ordagrant angiven i PRD:n eller planen -- håll S04:s handlers till metadata-/uppslagsbara delvillkor; varje frestelse att läsa `dokumenttext` för en kombinerad regel hör till S05.
- **Avoid**: att låta en handler rätta AD-KONTAKT-5/FIL-ZIP-1 -- Instead: returnera bara fyndet; S06 äger rättningen (FR5, bindingConstraints).


## Implementation Plan

### Implementation Tasks

- [x] **TI01** Motorn laddar S01:s katalog och referensdata och validerar sin egen regel-täckning
  - Laddar regelkatalogen, kontaktregistret och klassificeringsstrukturen (eller en testdubblett medan S01 pågår); vid konstruktion registreras exakt de 22 S04-ägda regel-ID:na (Technical Overview)
  - **Verify**: konstruktion mot en fixtur med alla 29 katalograder registrerar 22 handlers; ett S04-ägt regel-ID utan handler gör att konstruktionen fallerar synligt

- [x] **TI02** Rena metadata-handlers utvärderar AD-KONTAKT-1/3/5, AR-KONTAKT-3, AD-GODKANNANDE-1
  - Följ `prd.md#fr1-regelkatalog`s Fel om-kolumn per regel; AD-GODKANNANDE-1 ger fynd bara vid det explicita värdet "Saknas" (FR2-nyansen), aldrig vid ett utelämnat fält
  - **Verify**: TC-08 ger AD-KONTAKT-5-fyndet, TC-14 ger AD-GODKANNANDE-1-fyndet; TC-01/TC-02 ger inget av dem

- [x] **TI03** Uppslagshandlers mot kontaktregistret utvärderar AR-/AD-KONTAKT-2 och AR-/AD-KONTAKT-4
  - Slår upp avsändare/mottagare/motpart mot kontaktregistret; fynd vid saknad kontakt (KONTAKT-2) eller vid en kontakt flaggad som tjänsteperson (KONTAKT-4)
  - **Verify**: TC-09 ger AD-KONTAKT-2 med rättningsförslaget "beställ ny kontakt av registraturen"; TC-06 ger både AD-KONTAKT-4 och AR-KONTAKT-4

- [x] **TI04** Uppslagshandlers mot klassificeringsstrukturen utvärderar existens-/tillhörighetsdelen av AR-PROCESS-1 och AD-HANDLINGSTYP-1
  - Bara delvillkoret "saknas i klassificeringsstrukturen" respektive "inte hör till vald process"; den innehållsbaserade delen (TI04 läser aldrig `dokumenttext`) hör till S05
  - **Verify**: en process som inte finns i klassificeringsstrukturen ger AR-PROCESS-1 "fynd"; en handlingstyp som inte är tillåten under den angivna processen ger AD-HANDLINGSTYP-1 "fynd"

- [x] **TI05** Metadatajämförbara delvillkor för AD-DATUM-1 och AD-KATEGORI-1
  - AD-DATUM-1: jämför `ankomstdatum`/`dokumentdatum` mot ett datummönster extraherat ur `dokumenttext` med deterministisk parsning (inte semantisk tolkning); AD-KATEGORI-1: validerar att `dokumentkategori` är ett enda giltigt enumvärde konsekvent med avsändare/mottagare
  - **Verify**: TC-10:s textdatum ("1 juli 2026") mot `dokumentdatum` ("2026-08-25") ger AD-DATUM-1 "fynd"

- [x] **TI06** Filanalyshandlers utvärderar samtliga 6 FIL-regler från S03:s inlästa fil-flaggor
  - Läser `ar_lasbar`/`ar_zip`/`ar_uppackad`/`ar_dubbelsidig_original`/`ar_korrekt_skannad`/`ar_undertecknad_version`/`mejlmissiv_diarieford`/`antal_bilagor` direkt; FIL-ANTAL-1 utvärderas alltid, de övriga fem ger "ej tillämplig" när `filer` är tom
  - **Verify**: TC-15 ger FIL-ZIP-1 och FIL-ANTAL-1 utan att zip-filen packas upp; TC-16 ger FIL-LASBAR-1; TC-17 ger FIL-SKANN-1; TC-18 ger FIL-MISSIV-1; en fixtur utan filer ger "ej tillämplig" för de fem och ett riktigt utfall för FIL-ANTAL-1

- [x] **TI07** AD-SEKRETESS-1-handlern flaggar Mänsklig bedömning utan AI-anrop
  - Ger fynd bara när `ärende.status == "Avslutat"` och `skyddskod` fortfarande markerar sekretess; ändrar aldrig `skyddskod` (Constraints bindingConstraint)
  - **Verify**: TC-13 ger AD-SEKRETESS-1 "fynd", `skyddskod` är oförändrad efteråt, och inget Claude API-anrop sker för denna regel

- [x] **TI08** Varje fynd från TI02-TI07 sätts samman enligt FR6:s fyndform
  - regel-ID, regeltext, allvarlighetsgrad och metod läses från katalogen (S01); evidens och svensk förklaring genereras av handlern; rättningsförslag där det går att avgöra; inget konfidensfält (det är bara för AI-fynd)
  - **Verify**: varje fynd från TI02-TI07:s fixturer innehåller regel-ID, metod, evidens och en svensk förklaringssträng; inget av dem har ett konfidensfält

- [x] **TI09** Motorn returnerar exakt ett utfall per S04-ägt regel-ID per körning
  - Aggregeringslagret mappar handler-resultaten (uppfylld/fynd/ej tillämplig/ej genomförd) 1:1 mot de 22 S04-ägda regel-ID:na; inga dubbletter eller luckor
  - **Verify**: TC-01 ger 22 utfall, samtliga "uppfylld"; TC-20 slutförs utan fel och ger exakt ett utfall per S04-ägt regel-ID (t.ex. "fynd" för AD-KONTAKT-4 via tjänsteperson-uppslaget)

### Testing Strategy

- Återanvänd `casedetails/testcases.json`s fixturer direkt i handler-tester i stället för handkonstruerade fixturer, så testerna hålls i synk med S09:s kommande testsvit.


## Implementation Observations

- Kod: `src/lib/granskning/` – `kontrakt.ts` (delat RuleOutcome/Finding-kontrakt, även S05:s), `regler.ts` (22 handlers), `motor.ts` (dispatcher och aggregering), `motor.test.ts`. Motorn konstrueras mot S01:s laddade katalog och referensdata; dokumentformen är deklarerad strukturellt i `kontrakt.ts` i stället för importerad från S03, så modulerna inte kopplas ihop.
- **Sömmen mot S05 är kodad som data.** Testfallens förväntade fynd för TC-11 (AD-HANDLINGSTYP-1), TC-12 (AD-KATEGORI-1), TC-19 (AR-PROCESS-1) och TC-20 (AR-PROCESS-1, AD-HANDLINGSTYP-1) hör till innehållsdelen av kombinerade regler: metadatan i sig är korrekt – processen finns, handlingstypen är tillåten, kategorin är ett giltigt värde. Motorn ger uppfylld på dem, och ett test slår larm om en handler börjar läsa `dokumenttext` för att komma åt dem. S05 måste därför äga C-delen av de här fyra regel-ID:na, inte bara de sju rena C/H-reglerna.
- **AD-DATUM-1** jämför bara datum i `dokumenttext` som ett ledtrådsord pekar ut som handlingens eget (daterat, poststämplat, inkom, expedierat, undertecknat). Utan den avgränsningen ger TC-13 ("vann laga kraft 2026-05-20", "avtal tecknades 2026-06-01") och TC-19 ("från och med 2026-10-01") falska fynd. Datumparsningen klarar ISO-format och svenska månadsnamn.
- **FIL-ANTAL-1** ger fynd när `antal_bilagor` överstiger antalet registrerade filer, inte vid varje avvikelse. Testdatan har `antal_bilagor: 0` tillsammans med en huvudfil i baseline-fallen, så en strikt likhetsjämförelse hade flaggat TC-01 och TC-02.
- **Förkortningsregeln** (AR-/AD-TITEL-2) flaggar versala tokens (≤5 tecken) och tokens utan vokal, med en kort lista accepterade förkortningar (IT, EU, HR, AB, SCB, ESV …). Utan listan ger TC-13 ("IT-säkerhet"), TC-19 ("HR") och TC-16 ("AB") falska fynd. Den svåra bedömningen – är förkortningen begriplig? – hör till S05.
- **Okända filflaggor ger "ej genomförd", inte "uppfylld".** TC-16 (oläsbar fil) och TC-20 har `ar_undertecknad_version: null`, vilket ger FIL-UNDERTECKNAD-1 utfallet "ej genomförd". Enligt FR4 innebär det Mänsklig bedömning i S06. Det är avsiktligt: motorn påstår inte att en fil den inte kunnat läsa är korrekt.
- **AD-HANDLINGSTYP-1 ger "ej genomförd" när processen inte går att slå upp**, eftersom tillhörigheten inte går att pröva då. AR-PROCESS-1 bär fyndet i det läget.
- Rimliga extra fynd utöver testfallens lista: TC-09 ger även AR-KONTAKT-2 (ärendets motpart är samma oregistrerade organisation) och TC-20 ger även AR-KONTAKT-4 (ärendets kontakt är samma tjänsteperson). Båda är korrekta enligt regeltexten och tillåtna enligt `prd.md`:s beslutslogg ("Rimliga extra fynd tillåts").
- **Ändring i S02:** `Regelmetod` i `src/lib/kontrollogg/types.ts` var unionen `'M' | 'M+L' | 'C' | 'H'` och kunde inte bära katalogens sammansatta värden (M/C, M+L/C, M → H). Den är nu en strängtyp med vokabulären ägd av regelkatalogen (S01), annars hade S06 inte kunnat logga ett S04-fynd.
- Fyra av S04:s regler har inget testfall som täcker deras fyndgren: AR-KONTAKT-3, AD-KONTAKT-1, AD-KATEGORI-1 (enum-delen) och AR-PROCESS-1 (existens-delen). De två sistnämnda täcks av konstruerade fixturer i testerna; AR-KONTAKT-3 och AD-KONTAKT-1 täcks bara av att de ger uppfylld/ej tillämplig på testdatan. S09 bör lägga till fall för dem.
