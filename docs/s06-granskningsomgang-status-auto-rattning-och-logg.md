# Feature Implementation Specification: Granskningsomgång: status, auto-rättning och logg

**Plan**: docs/plan.json
**Story-ID**: S06

## Feature Overview and Goal

**Intent**: Registratorn och handläggaren ska kunna agera på en enda, pålitlig slutstatus per granskningsomgång i stället för att själva väga ihop S04:s och S05:s separata regelutfall och gissa vilka fel som är säkra att rätta automatiskt.

**Expected Outcomes**:

- [OC01] Varje granskningsomgång får exakt en av de fyra statusarna (Mänsklig bedömning > Åtgärd krävs > Autokorrigerad > Godkänd) enligt FR4:s precedensordning, beräknad över det sammanslagna utfallet för samtliga regel-ID:n i katalogen.
- [OC02] Bara AD-KONTAKT-5 och FIL-ZIP-1 muterar dokumentets data; datum, diarienummer och skyddskod förblir okörda av automatiken under alla omständigheter, även vid en felkonfigurerad katalogflagga.
- [OC03] En lyckad auto-rättning utlöser exakt en omkörning av de regler den påverkar, och fynd i omkörningen auto-rättas inte på nytt.
- [OC04] Ingen status- eller datamutation (inklusive en auto-rättning) sker om dess loggpost inte kan skrivas; en misslyckad rättning degraderas i stället till ett förslag med felmeddelande.


## Required Context

- `docs/prd.md#fr4-statussättning` – fyrstatusordningen, regeln att bara Godkänd/Autokorrigerad sätter "Registrerat" automatiskt, och Acceptance Criteria (TC-08/TC-13/TC-15:s förväntade statusar) den här FIS:ens scenarier återger.
- `docs/prd.md#fr5-automatisk-rättning-av-säkra-fel` – AD-KONTAKT-5/FIL-ZIP-1-rättningarnas beteende, enda-omkörningsregeln, "fynd i omkörningen auto-rättas inte på nytt", och felvägen där en misslyckad rättning blir ett förslag (bindingConstraint: "Ingen annan regel än dem med auto-rättningsflagga ändrar data").
- `docs/prd.md#fr7-kontrollogg` – fältlistan och felhanteringsregeln att en misslyckad loggskrivning avbryter ändringen, som varje mutation i den här storyn är grindad på.
- `docs/prd.md#constraints` – "Datum, diarienummer och skyddskod ändras aldrig automatiskt" (bindingConstraint); TI03:s rättnings-allowlist finns för att hålla detta även mot en felkonfigurerad katalog.
- `docs/adr.md#beslut-2-granskningspipeline--deterministiskt--ai--status` – pipelineordningen (deterministiska+AI-utfall → status → auto-rättning → en omkörning) som den här storyns tasktordning följer.
- `docs/adr.md#beslut-3-oföränderlig-kontrollogg-append-only` – synkron, fail-closed loggskrivning och "ingen mutation utan en lyckad loggskrivning"-invarianten TI02 implementerar.
- `docs/plan.json#sharedDecisions.0` – RuleOutcome/Finding-kontraktet S04 och S05 var för sig producerar in i; TI01 slår samman det.
- `docs/plan.json#sharedDecisions.1` – Granskningsomgång-orkestreringskontraktet den här storyn själv producerar (TI08); S07/S08/S09 är dess konsumenter.
- `docs/plan.json#sharedDecisions.2` – Kontrollogg-händelseschemat S02 definierar; TI02:s grind skriver poster i den formen.
- `docs/plan.json#sharedDecisions.3` – Dokument/Ärende-datamodellen S03 producerar; TI03:s rättningar muterar fält i den formen.
- `docs/s02-kontrollogg-infrastruktur.md` – append/läs-API:t (bara append + läs, fail-closed, inget uppdatera/radera) TI02 anropar.
- `docs/s04-deterministisk-granskningsmotor.md` – S04:s ägda regel-ID-mängd och RuleOutcome-form TI01 slår samman; se Constraints & Gotchas för dess motstridiga ägarskapsanspråk på FIL-LASBAR-1.
- `docs/s05-ai-bedomning-av-innehall.md` – S05:s ägda regel-ID-mängd, konfidens/osäker-taggning och ej-genomförd-vid-AI-fel-kontraktet TI01 slår samman; se Constraints & Gotchas för dess motstridiga ägarskapsanspråk på FIL-LASBAR-1.


## Deeper Context

- `docs/prd.md#edge-cases` – TC-08/TC-09/TC-12/TC-13/TC-15/TC-20-raderna den här storyns scenarier och sammanslagningslogik ska återge.
- `casedetails/testcases.json#cases` – TC-08, TC-13 och TC-15:s konkreta ärende/ärendedokument/fil/`expected_status`-fixturer som Acceptance Scenarios binder mot.


## Acceptance Scenarios

- [ ] **S01 [OC01] [TI01,TI06,TI08] Sekretessfynd via H-regel ger alltid Mänsklig bedömning (TC-13)**
  - **Given** TC-13-fixturen (`ärende.status="Avslutat"`, `skyddskod="Sekretess"`, S04:s AD-SEKRETESS-1-fynd via M→H)
  - **When** granskningsomgångens entry point körs för dokumentet
  - **Then** slutstatusen är Mänsklig bedömning per FR4:s Acceptance Criteria, och `skyddskod` är oförändrad

- [ ] **S02 [OC01,OC02,OC03] [TI03,TI05,TI06,TI07] Kopia-till-fynd auto-rättas till Autokorrigerad och Registrerat (TC-08)**
  - **Given** TC-08-fixturen med `kopia_till: "Clas Olsson"` (S04:s AD-KONTAKT-5-fynd)
  - **When** granskningsomgången körs
  - **Then** AD-KONTAKT-5 rättas automatiskt (`kopia_till` blir tomt, loggen visar före/efter), en omkörning sker, slutstatusen blir Autokorrigerad, och `dokumentstatus` sätts till "Registrerat"

- [ ] **S03 [OC01,OC03] [TI03,TI05,TI06] Zip-rättning löser inte hela avvikelsen – Åtgärd krävs kvarstår (TC-15)**
  - **Given** TC-15-fixturen (`ar_zip=true`, `ar_uppackad=false`, `antal_bilagor=3`, en registrerad fil)
  - **When** granskningsomgången körs
  - **Then** FIL-ZIP-1 rättas automatiskt (zip-filen packas upp), en omkörning av FIL-ANTAL-1 sker mot det uppackade innehållet, avvikelsen kvarstår, och slutstatusen blir Åtgärd krävs, inte Autokorrigerad

- [ ] **S04 [OC01] [TI01] Ett regel-ID med utfall från båda motorerna slås samman utan att tappa fyndet**
  - **Given** en syntetisk fixtur där AD-KONTAKT-1:s metadata-del (S04) returnerar "uppfylld" (avsändaren finns i kontaktregistret) men dess innehållsdel (S05) returnerar "fynd" för samma regel-ID (dokumenttexten indikerar fel mottagare)
  - **When** TI01:s sammanslagningslager kombinerar de två motorernas utfall för AD-KONTAKT-1
  - **Then** det sammanslagna utfallet är "fynd" (worst-outcome-wins), och S05:s fynd redovisas oförkortat i granskningsomgångens resultat i stället för att S04:s uppfyllda delutfall tyst vinner

- [ ] **S05 [OC04] [TI02,TI04,TI06] Misslyckad loggskrivning avbryter rättningen och degraderar till Åtgärd krävs**
  - **Given** TC-08-fixturen och en loggskrivning som tvingas misslyckas under AD-KONTAKT-5-rättningens append-anrop
  - **When** granskningsomgången försöker applicera rättningen
  - **Then** `kopia_till` är fortfarande "Clas Olsson" efteråt, fyndet blir ett förslag med felmeddelandet "Automatisk rättning av Kopia till misslyckades", och slutstatusen blir Åtgärd krävs, inte Autokorrigerad

- [ ] **S06 [OC02] [TI03] Datum, diarienummer och skyddskod muteras aldrig, även vid en felkonfigurerad katalogflagga**
  - **Given** en testkatalogfixtur där regel-ID AD-DATUM-1 av misstag bär auto-rättningsflagga="Ja"
  - **When** granskningsomgången utvärderar auto-rättningskandidater mot fyndet för AD-DATUM-1
  - **Then** ingen rättning appliceras för AD-DATUM-1 och `dokumentdatum` ändras inte – bara AD-KONTAKT-5 och FIL-ZIP-1 finns i TI03:s hårdkodade allowlist, oavsett katalogens auto-rättningsflagga


## Structural Criteria

- [ ] Sammanslagnings-, status- och rättningslogiken (TI01, TI06, TI03) är rena funktioner över RuleOutcome[]-indata; ingen väg i den här modulen anropar S04:s eller S05:s handlers direkt utanför det delade RuleOutcome-kontraktet.
- [ ] TI08:s entry point är den enda platsen S07/S08/S09 utlöser en granskningsomgång från – ingen duplicerad orkestreringslogik finns någon annanstans i den här storyns kod.
- [ ] Inget skrivfall i den här modulen refererar `ankomstdatum`, `dokumentdatum`, `diarienummer` eller `skyddskod` som mål för en tilldelning.
- [ ] Varje status- eller datamutationsväg (TI03, TI07) är bevisligen grindad på ett lyckat TI02-loggskrivningsanrop innan den tar effekt.


## Scope & Boundaries

### Work Areas
- Sammanslagningslager som kombinerar S04:s och S05:s per-regel-ID-utfall till ett beslut per regel (worst-outcome-wins, alla fynd bevarade)
- Fyrstatuslogik enligt FR4:s precedensordning
- Auto-rättningsexekverare begränsad till AD-KONTAKT-5/FIL-ZIP-1 med hårdkodad allowlist
- Enkel-omkörningsorkestrering som återanropar S04:s/S05:s handlers för berörda regler efter en rättning
- Loggskrivningsgrind som omsluter varje mutation via S02:s append-API
- "Registrerat"-sättning och granskningsomgångens callable entry point (S07/S08/S09:s kontrakt)

### What We're NOT Doing
- UI:t som utlöser eller visar en granskningsomgång (registrator-/handläggarkö, loggflik) -- ägs av S07/S08, som konsumerar den här storyns entry point och loggläs-API.
- Själva S04-/S05-regelmotorerna (metadata-/uppslags-/filanalyshandlers, AI-dispatch/innehållshandlers) -- produceras uppströms; S06 slår bara samman deras resultat.
- Att avgöra vilken motor som "äger" en kombinerad metodrad (M/C-, M+L/C-, C/H-, M → H-uppdelningen) -- S04:s och S05:s egna FIS-filer är oense om detta (se Constraints & Gotchas); att förena ägarskapsanspråken är den tvärgående granskningens jobb, inte S06:s. TI01:s sammanslagningslager är medvetet byggt för att inte behöva den lösningen.
- Empirisk trimning av AI-konfidenströskeln eller vilka specifika regler som eskalerar till Mänsklig bedömning utöver H-regel/ej genomförd/osäkert AI-fynd -- S05 äger tröskelkonfigurationen, S09:s testsvit äger den empiriska trimningen.


## Architecture Decision

**Approach**: S06 implementerar omgången som en ren sammanslagnings- och statuspipeline (TI01, TI06) över de RuleOutcome[]-arrayer S04/S05 redan producerat, följt av ett rättningssteg med hårdkodad allowlist (TI03) och en enda omkörning (TI05), allt grindat bakom S02:s loggskrivning (TI02) innan någon status- eller dataändring tar effekt. Se ADR: `docs/adr.md#beslut-2-granskningspipeline--deterministiskt--ai--status`
**Why this over alternatives**: En enda loggrindad orkestreringsfunktion håller FR4:s precedens och FR5:s rättningsomfång verkställbara på ett ställe i stället för utspridda över S07:s och S08:s anropsplatser, och matchar Beslut 3:s "ingen mutation utan en lyckad loggskrivning"-invariant strukturellt snarare än genom konvention.


## Technical Overview

S04:s och S05:s FIS-filer är oense om vilken motor som äger FIL-LASBAR-1 (en ren C-rad): S04:s Technical Overview hävdar alla 6 FIL-raderna via ett S03-scope-undantag om filanalys, medan S05:s Constraints & Gotchas hävdar varje rad vars metod innehåller C eller H, inklusive FIL-LASBAR-1, och argumenterar explicit att S04:s egen scope-text undantar den. Den här FIS:en tar inte ställning till vem som "äger" fyndproduktionen för det regel-ID:t – det flaggas här för Steg 6:s tvärgående granskning i stället för att avgöras tyst (se Constraints & Gotchas). TI01:s sammanslagningslager är byggt för att tåla utfallet oavsett hur konflikten löses: den antar att ett regel-ID kan få utfall från båda motorerna under samma omgång, inte att exakt en motor rapporterar per regel-ID. Per regel-ID väljs det sämsta utfallet (ej genomförd > H-regel-fynd/osäkert AI-fynd > fynd > ej tillämplig > uppfylld) för FR4:s precedensberäkning, och samtliga fynd från båda motorerna redovisas oförkortade i resultatet.


## Code Patterns & External References

```
# type | path#anchor or url                              | why needed (intent)
file   | casedetails/testcases.json#cases                | TC-08/TC-13/TC-15-fixturer för rättnings-, status- och loggscenarierna
file   | docs/prd.md#fr4-statussättning                  | Auktoritativ fyrstatustabell och Acceptance Criteria
file   | docs/s02-kontrollogg-infrastruktur.md            | S02:s append/läs-API-signatur TI02 anropar in i
```


## Constraints & Gotchas

- **Critical**: S04:s och S05:s FIS-filer hävdar motstridigt ägarskap av FIL-LASBAR-1 och, mer generellt, hur kombinerade metodrader delas mellan motorerna -- Must handle by: TI01:s sammanslagningslager antar att vilket regel-ID som helst kan få utfall från båda motorerna (inte ömsesidigt uteslutande) och tillämpar worst-outcome-wins i stället för att välja en vinnare mellan de två FIS:ernas anspråk; konflikten flaggas härmed för orkestratorns Steg 6-granskning i stället för att tyst avgöras i den här storyn.
- **Constraint (narrowing note)**: bindingConstraints FR9 ("Handläggaren kan inte ändra diarienummer/sätta Registrerat") och NFR-Security ("0 riktiga ärenden... till AI-tjänsten") gäller S08:s UI/API-validering respektive S05:s AI-klient, inte den här storyns sammanslagnings-/status-/rättningslogik -- S06 har ingen UI-yta och gör inga AI-anrop själv (den konsumerar bara S05:s redan producerade utfall); flaggas här explicit i stället för att uteslutas tyst, för Steg 6 att bekräfta.
- **Constraint**: Datum, diarienummer och skyddskod får aldrig muteras, oavsett vad en felaktig katalog-auto-rättningsflagga säger -- Workaround: TI03 använder en hårdkodad allowlist {AD-KONTAKT-5, FIL-ZIP-1} som en andra spärr utöver katalogens egen "auto-rättning bara för metod M"-validering (S01).
- **Critical**: FR5:s "fynd i omkörningen auto-rättas inte på nytt" och Beslut 3:s log-gates-mutation-invariant måste hålla samtidigt -- Must handle by: TI05:s omkörning matar tillbaka i TI01/TI06 men aldrig i TI03 igen; TI02:s loggrind omsluter varje mutation i TI03 och TI07, inte bara den första.


## Implementation Plan

### Implementation Tasks

- [ ] **TI01** Sammanslagningslagret kombinerar S04:s och S05:s per-regel-ID-utfall till ett beslut per regel, tolerant mot att båda motorerna bidrar
  - Konsumerar de delade RuleOutcome[]/Finding[]-arrayer S04 och S05 var för sig returnerar (`docs/plan.json#sharedDecisions.0`); grupperar per regel-ID och reducerar med worst-outcome-wins (ej genomförd > H-regel/osäkert AI-fynd > fynd > ej tillämplig > uppfylld), och behåller varje fynd från varje bidragande motor i stället för att anta exakt ett utfall per regel-ID (se Constraints & Gotchas: S04:s/S05:s motstridiga FIL-LASBAR-1-anspråk)
  - **Verify**: TC-01:s fixtur slås samman till 29 "uppfylld"-utfall utan fynd; en syntetisk fixtur där ena motorn returnerar "uppfylld" och andra "fynd" för samma regel-ID slås samman till "fynd" och behåller det flaggande fyndet intakt

- [ ] **TI02** En loggskrivningsgrind omsluter ett mutationsförsök och avbryter det vid ett misslyckat append
  - Anropar S02:s append-API (`docs/s02-kontrollogg-infrastruktur.md`) synkront omedelbart innan en status- eller dataändring tar effekt; vid ett misslyckat append tillämpas den omslutna ändringen inte, och grinden ytar en tydlig felsignal anroparen kan agera på (FR7 felhantering, ADR Beslut 3). Varje senare mutationstask (TI03, TI07) byggs på den här grinden, inte en egen skrivväg
  - **Verify**: ett tvingat append-fel genom grinden lämnar den omslutna mutationen otillämpad och returnerar en felsignal; ett lyckat append låter den omslutna mutationen genomföras och båda syns vid en loggläsning

- [ ] **TI03** Auto-rättningsexekveraren applicerar exakt AD-KONTAKT-5 och FIL-ZIP-1, aldrig datum/diarienummer/skyddskod
  - För ett sammanslaget fynd (TI01) på regel-ID AD-KONTAKT-5 rensas `kopia_till`; för FIL-ZIP-1 packas zip-filen upp och ersätts av sitt innehåll; båda går genom TI02:s loggskrivningsgrind med registrerade före/efter-värden. Använder en hårdkodad tvåregel-allowlist i stället för att bara lita på katalogens auto-rättningsflagga, så en felkonfigurerad katalog inte kan bredda mutationsytan (Constraints bindingConstraint)
  - **Verify**: TC-08:s `kopia_till` blir "" med en före/efter-loggpost; TC-15:s zip-fil ersätts av sitt uppackade innehåll; en fixtur med ett icke-allowlistat regel-ID som bär `auto-rättning: true` i en felformad katalog ger ingen mutation för det regel-ID:t

- [ ] **TI04** Ett misslyckat rättningsförsök degraderas till ett förslag som bär FR5:s felmeddelande
  - När TI02:s grind rapporterar fel för en TI03-rättning (eller rättningens eget förvillkor fallerar, t.ex. en nästlad eller lösenordsskyddad zip), taggas fyndet om till ett förslag med "Automatisk rättning av X misslyckades" i stället för en applicerad rättning, och räknas som ett kvarstående fel för TI06:s statusberäkning (inte en applicerad Autokorrigerad)
  - **Verify**: ett simulerat append-fel under TC-08:s AD-KONTAKT-5-rättning lämnar `kopia_till` oförändrat och ger ett förslagsfynd med FR5:s felmeddelande

- [ ] **TI05** En enda omkörning omprövar regler som påverkas av en applicerad rättning, utan att auto-rätta omkörningens fynd på nytt
  - Efter att ≥1 TI03-rättning lyckats återanropas de berörda S04-/S05-handlerna exakt en gång mot det rättade dokumentet (t.ex. FIL-ANTAL-1 efter FIL-ZIP-1:s uppackning), och omkörningens utfall matas tillbaka genom TI01:s sammanslagning; TI03 körs inte igen i samma omgång för omkörningens fynd (FR5: "Fynd i omkörningen auto-rättas inte på nytt"). En omgång utan applicerad rättning utlöser aldrig den här omkörningen
  - **Verify**: TC-15:s omkörning omprövar FIL-ANTAL-1 mot det uppackade filantalet och ger fortfarande en avvikelse utan ett andra rättningsförsök; TC-08:s omkörning (bara AD-KONTAKT-5 berörs, ingen beroende regel) slutförs utan att ändra något annat regel-ID:s utfall

- [ ] **TI06** Fyrstatuslogiken löser exakt en status per granskningsomgång
  - Tillämpar FR4:s ordning över TI01:s/TI05:s slutliga sammanslagna utfall: Mänsklig bedömning (ett H-regel-fynd, ett osäkert AI-fynd eller ett ej genomförd-utfall finns) > Åtgärd krävs (en TI04-nedgradering eller ett olöst fynd kvarstår) > Autokorrigerad (≥1 TI03-rättning applicerad, inget olöst kvarstår) > Godkänd
  - **Verify**: TC-13 löser till Mänsklig bedömning; TC-08 löser till Autokorrigerad; TC-15 löser till Åtgärd krävs (FIL-ANTAL-1 olöst efter omkörning); TC-01 löser till Godkänd

- [ ] **TI07** "Registrerat" sätts bara för Godkänd/Autokorrigerad eller ett uttryckligt mänskligt beslut
  - TI06:s Godkänd-/Autokorrigerad-resultat sätter `dokumentstatus` till "Registrerat" som en del av samma TI02-grindade skrivning; Mänsklig bedömning/Åtgärd krävs lämnar `dokumentstatus` oförändrad om inte entry pointen (TI08) tar emot en uttrycklig mänsklig beslutshändelse
  - **Verify**: TC-08 slutar med `dokumentstatus` "Registrerat"; TC-13 och TC-15 slutar med `dokumentstatus` oförändrad från sitt indatavärde

- [ ] **TI08** En callable granskningsomgång-entry point orkestrerar TI01-TI07 och är kontraktet nedströms-storyer anropar
  - En enda funktion/endpoint som tar emot ett dokument-id (eller dokument+ärende) kör TI01→TI03→TI05→TI06→TI07 i ordning och returnerar den färdiga omgången (status, applicerade rättningar, fynd, bekräftelse att loggposterna skrivits); det här är "Granskningsomgång orchestration contract"-sharedDecisionen (`docs/plan.json#sharedDecisions.1`) som S07:s godkänn/avvisa/skicka, S08:s "Skicka för ny granskning" och S09:s testkörare alla anropar, så signaturen bär inget UI-sessionsspecifikt tillstånd
  - **Verify**: att anropa entry pointen en gång vardera mot TC-01, TC-08, TC-13 och TC-15 ger exakt den status FR4:s Acceptance Criteria namnger för respektive fall, utan att anroparen kopplar ihop TI01-TI07 manuellt

### Testing Strategy

- Inget testramverk finns ännu i repot (grundstenarna S01–S05 är fortfarande pending eller under exekvering); återanvänd `casedetails/testcases.json`s TC-01/TC-08/TC-13/TC-15-fixturer direkt i stället för handkonstruerade fixturer, så testerna hålls i synk med S09:s kommande testsvit.


## Implementation Observations

_No observations recorded yet._
