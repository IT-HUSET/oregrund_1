# AI-bedömning av innehåll

**Plan**: docs/plan.json
**Story-ID**: S05

## Feature Overview and Goal

**Intent**: Handlingar och ärenden med innehållsmässiga eller bedömningskrävande fel (otydliga titlar, fel mottagare, felaktig sekretess, obehandlade skanningsfel) i dag slinker igenom manuell granskning eftersom bara ~20 % av ärendena kontrolleras; den här funktionen ger varje "Färdig"-markerad handling en maskinell innehållsbedömning för de regler metadata ensamt inte kan avgöra, så att fler äkta fel fångas utan att en obesvarad eller trasig AI-tjänst blockerar granskningen.

**Expected Outcomes**:

- [OC01] Varje regel i katalogen vars metod innehåller C eller H får ett maskinellt utfall (uppfylld/fynd/ej tillämplig/ej genomförd), med ett FR6-format fynd när regeln flaggas, byggt på en Claude-bedömning av dokumentets innehåll.
- [OC02] Ett fel, en timeout eller ett otolkbart svar från AI-tjänsten degraderar den drabbade regeln till "ej genomförd" utan att resten av granskningsomgången stannar.
- [OC03] Ett AI-fynd med konfidens under katalogens tröskel markeras osäker i stället för att redovisas som ett definitivt fynd.


## Required Context

- `docs/prd.md#fr1-regelkatalog` – 29-regelstabellen och `metod`-kolumnen; den här storyns regelmängd är varje rad vars metod innehåller C eller H (inklusive kombinationer som M/C, M+L/C, C/H, M → H). Auto-rättning är begränsad till metod M, så inget här auto-rättar.
- `docs/prd.md#fr3-granskning` – pipeline-ordningen (deterministiskt före AI), de fyra utfallsvärdena, AI-felkontraktet ("ej genomförd" utan att omgången stannar, går att köra om) och ej-tillämplig-för-saknad-fil-regeln (gäller inte FIL-ANTAL-1).
- `docs/prd.md#fr6-förklarade-fynd` – fyndformen (regel-ID, regeltext, allvarlighetsgrad, metod, evidens, konfidens för AI-fynd, svensk förklaring, rättningsförslag) samt kraven att aldrig hitta på kontakter eller lägga personnamn/sekretessbelagt innehåll i titelförslag.
- `docs/prd.md#dependencies` – Moln-LLM (Claude API) krävs för varje regel i den här storyn; är tjänsten otillgänglig går dokumentet till Mänsklig bedömning nedströms.
- `docs/adr.md#beslut-2-granskningspipeline--deterministiskt--ai--status` – pipeline-ordningen och kravet att motorn degraderar i stället för att krascha, som den här storyn implementerar AI-halvan av.
- `docs/plan.json#sharedDecisions` – RuleOutcome/Finding-kontraktet (produceras gemensamt med S04) och Dokument/Ärende-datamodellen (produceras av S03) som denna story läser.
- `docs/plan.json#riskSummary` – S05:s egen riskmitigering: fail-to-"ej genomförd" på AI-fel/timeout/otolkbart svar, empiriskt trimmad konfidenströskel, max ett AI-anrop per tillämplig regel och omgång.
- `docs/plan.json#bindingConstraints` – NFR-Security: "0 riktiga ärenden eller handlingar skickas till AI-tjänsten"; den här storyns tester får bara använda syntetiska fixturer.


## Acceptance Scenarios

- [x] **S01 [OC01] [TI02,TI04] Korrekt baseline ger inga fynd (TC-01)**
  - **Given** TC-01:s ärende/ärendedokument/fil (`casedetails/testcases.json`) med `dokumenttext` som tydligt och korrekt beskriver ett internt beslut
  - **When** dispatch kör varje katalogregel vars metod innehåller C eller H mot dokumentet
  - **Then** varje tillämpligt utfall är uppfylld eller ej tillämplig, och inget fynd produceras

- [x] **S02 [OC01] [TI04] Innehållsfynd bär hela FR6-formen (TC-04)**
  - **Given** TC-04:s ärendedokument, vars titel innehåller ett personnamn
  - **When** AD-TITEL-4:s handler bedömer det via Claude-klienten
  - **Then** utfallet är fynd med regel-ID AD-TITEL-4, allvarlighetsgrad, metod "AI-bedömning", evidens som citerar titeln, en svensk förklaring och ett konfidensvärde

- [x] **S03 [OC01] [TI05] Oläsbar fil kortsluter AI-anropet och nedströms filregler blir ej genomförd (TC-16)**
  - **Given** TC-16:s fil med `ar_lasbar: false`
  - **When** S05 utvärderar FIL-LASBAR-1 och de filinnehålls-regler som behöver samma fil (FIL-SKANN-1, FIL-UNDERTECKNAD-1)
  - **Then** FIL-LASBAR-1 blir fynd direkt från läsbarhetsfaktan (inget konfidensfält, inget Claude-anrop), och de andra filinnehållsreglerna för samma fil blir ej genomförd i stället för att bedömas mot oläsbart innehåll

- [x] **S04 [OC02] [TI08] AI-tjänsten otillgänglig degraderar hela omgången utan att stanna**
  - **Given** en granskningsomgång där Claude-anropet timeoutar/felar på den första dispatchade regeln
  - **When** S05 fortsätter processa resterande regler i sin dispatch-mängd för dokumentet
  - **Then** varje dispatchad regel blir ej genomförd, S04:s deterministiska utfall i samma omgång påverkas inte, och omgången slutförs (kastar inte) och går att köra om

- [x] **S05 [OC03] [TI07] Lågt konfidens-AI-fynd markeras osäkert, inte ett definitivt fynd**
  - **Given** ett Claude-svar för AD-KATEGORI-1 (blandad inkommande/utgående-riktning, TC-12-liknande) som kommer tillbaka med konfidens under katalogens konfigurerade tröskel
  - **When** S05 mappar svaret till ett RuleOutcome
  - **Then** utfallet taggas osäker i stället för ett definitivt fynd, och bär ändå hela FR6-fyndformen

- [x] **S06 [OC01] [TI09] Rättningsförslag återinför aldrig ett personnamn (TC-04)**
  - **Given** TC-04:s personnamn-i-titel-fynd
  - **When** AD-TITEL-4:s handler bygger ett rättningsförslag
  - **Then** det föreslagna titelförslaget innehåller inget personnamn

- [x] **S07 [OC01] [TI06] Saknad fil ger ej tillämplig, inte fynd eller ej genomförd**
  - **Given** ett dokument utan bifogade filer
  - **When** S05 utvärderar FIL-SKANN-1, FIL-UNDERTECKNAD-1, FIL-MISSIV-1 och FIL-ANTAL-1
  - **Then** de tre filinnehålls-beroende reglerna blir ej tillämplig, medan FIL-ANTAL-1 (katalogens uttryckliga undantag) fortfarande ger ett verkligt utfall


## Structural Criteria

- [x] Varje katalograd vars `metod`-fält innehåller C eller H har exakt en S05-handler; ingen ren M/M+L-rad hanteras här.
- [x] Inget rule-id får mer än ett Claude API-anrop per granskningsomgång.
- [x] Endast syntetiska fixturer från `casedetails/testcases.json` når Claude-klienten i den här storyns automatiska tester – aldrig ett riktigt dokument (NFR-Security, `docs/plan.json#bindingConstraints`).


## Scope & Boundaries

### Work Areas
- AI-regelutvärderingsmodul: katalogdriven dispatch (TI02) plus handlers för innehålls- och filregler (TI04, TI05, TI06)
- Claude API-klientwrapper med timeout/felhantering och typat resultat (TI01)
- Konfidenströskel- och anropstaks-konfiguration på regelkatalogen (TI03)
- Degradering till "ej genomförd" för hela omgången vid AI-tjänstfel (TI08)
- Skyddsspärr mot fabricerade kontakter/personnamn i rättningsförslag (TI09)

### What We're NOT Doing
- Utvärdering av metod M/M+L-regler -- S04:s scope (delat RuleOutcome/Finding-kontrakt).
- Statuskonsekvensen av ett osäkert eller misslyckat AI-utfall (routing till Mänsklig bedömning) -- S06:s uttryckliga scope.
- Den faktiska empiriska trimningen av konfidenströskeln -- kräver S09:s testsvit, som inte finns än; den här storyn bygger bara den konfigurerbara tröskelmekanismen.
- Att applicera auto-rättningar eller skriva till dokumentet -- FR5 begränsar auto-rättning till metod M; ingen handler här muterar data.
- Riktiga Janus/P360-dokumentkällor -- prototypen använder bara `casedetails/testcases.json`-fixturer (NFR-Security); riktig integration är S10:s integrationsplan.


## Architecture Decision

**Approach**: S05 implementeras som ett katalogdrivet handler-register (datadrivet av `checklist_rules.json`s `metod`-fält, S01) bakom en delad, timeout-skyddad Claude API-klient (TI01); varje handler mappar sin regels evidens till det delade RuleOutcome/Finding-kontraktet, och ett klientfel kortsluter hela dispatch-batchen till "ej genomförd" per ADR Beslut 2 i stället för handler-specifik retry-logik.
**Why this over alternatives**: Handler-specifika API-anrop skulle duplicera timeout-/fel-/tröskellogik över ~19 handlers och riskera inkonsekvent "ej genomförd"-beteende; en enda klientgräns håller Beslut 2:s degradera-inte-krascha-kontrakt enforcebart på ett ställe.


## Technical Overview

Det inlästa dokumentet (S03) och regelkatalogen (S01) matar ett dispatch-steg som väljer varje katalograd vars `metod` innehåller C eller H (TI02). Varje vald rad får en handler (TI04 för innehållsregler, TI05 för filinnehållsregler) som bygger en prompt av regelns regeltext plus relevanta ärende-/ärendedokumentfält och `dokumenttext`, skickar den genom den delade klienten (TI01), och mappar svaret till ett RuleOutcome/Finding. Två tvärgående kontroller ligger ovanpå varje handler: tröskeljämförelsen (TI07) som nedgraderar svaga AI-fynd till osäker, och avbrottsspärren (TI08) som gör om ett klientfel till "ej genomförd" för hela batchen i stället för ett kastat eller delvis resultat. TI06 hanterar saknad-fil-fallet innan någon handler anropar klienten. Resultaten lämnas oförändrade till S06; den här storyn muterar aldrig dokumentet och beslutar aldrig slutstatus.


## Code Patterns & External References

```
# type | path#anchor or url               | why needed (intent)
file   | casedetails/testcases.json        | Konkret ärende/ärendedokument/fil/dokumenttext-schema och realistisk evidenstext varje handlers prompt och Finding.evidens bygger på (t.ex. TC-01, TC-04, TC-12, TC-16, TC-17)
file   | docs/prd.md#fr1-regelkatalog      | Regeltabell (id, metod, allvarlighetsgrad) – dispatch-mängden (TI02) härleds direkt ur `metod`-kolumnen
```


## Constraints & Gotchas

- **Constraint**: Kombinerade metodrader (t.ex. M/C, M+L/C, M → H) får oberoende utvärderingar från S04 (M/M+L-halvan) och S05 (C/H-halvan) under samma rule-id -- Workaround: handlers här antar aldrig att S04 redan körts; att förena två per-regel-utfall till ett är S06:s jobb (`docs/plan.json#sharedDecisions`).
- **Critical**: FIL-LASBAR-1s metod är C, så den här storyn äger dess Finding trots att S04:s egen story-scope separat listar "readable" filanalys bland sina tekniska kontroller -- Must handle by: TI05 använder läsbarhetsfaktan som evidens (från S04 om redan kopplad, annars ett eget öppningsförsök) men är själv ansvarig för att producera FIL-LASBAR-1-fyndet; S04:s fyndproduktion är begränsad till M/M+L-regler.
- **Avoid**: att TI01:s klient anropar den riktiga Claude API:n från exec-specs automatiska verifieringsloop -- Instead: stubba/mocka klienten i tester; spara riktiga API-anrop för manuella körningar (`docs/plan.json#bindingConstraints` NFR-Security; `docs/plan.json#riskSummary` p95-budget).


## Implementation Plan

### Implementation Tasks

- [x] **TI01** En timeout-skyddad Claude API-klient returnerar alltid ett typat resultat, aldrig en okontrollerad exception eller hängning
  - Wrappar ett enskilt regelbedömningsanrop med en timeout; en timeout, ett transportfel eller ett svar som inte går att tolka till förväntad verdikt-form ytar alla som samma typade fel-variant anroparen kan göra om till "ej genomförd" (`docs/prd.md#fr3-granskning` felhantering); tester körs bara mot `casedetails/testcases.json`-fixturer, aldrig ett riktigt dokument (`docs/plan.json#bindingConstraints` NFR-Security).
  - **Verify**: Test: en simulerad timeout och ett simulerat otolkbart svar returnerar båda fel-varianten inom konfigurerad timeout, ingen exception kastas och inget test når ett riktigt nätverksanrop.

- [x] **TI02** Dispatch väljer exakt de katalograder vars metod innehåller C eller H
  - Läser S01:s `checklist_rules.json` `metod`-fält (`docs/prd.md#fr1-regelkatalog`) och bygger handler-mängden av varje rad som innehåller "C" eller "H" (täcker kombinationer som M/C, M+L/C, C/H, M → H); rena metod-M-auto-rättningsrader hamnar aldrig i mängden.
  - **Verify**: Test: en katalogfixtur som spänner över M, M+L, C, C/H, M/C och M → H ger en dispatch-mängd som matchar exakt raderna som innehåller C eller H, och exkluderar varje ren M/M+L-rad.

- [x] **TI03** Regelkatalogen bär en konfigurerbar konfidenströskel och ett anropstak per regel
  - Lägger till/läser ett tröskelvärde från S01:s katalogkonfig (`docs/plan.json#riskSummary`: "empirically-tuned confidence threshold"); dispatch (TI02) räknar anrop per rule-id och omgång och vägrar ett andra anrop för samma rule-id inom en omgång (`docs/plan.json#riskSummary`: "cap AI calls to one per applicable rule per round").
  - **Verify**: Test: två dispatch-anrop för samma rule-id inom en omgång ger max ett Claude-anrop för det rule-id:t; tröskelvärdet som används läses från katalogkonfig, inte en literal i handler-koden.

- [x] **TI04** Innehållsbedömningshandlers producerar FR6-formade fynd för titel-, kontakt-, process- och klassificeringsregler
  - Täcker varje dispatchad (TI02) rule-id bland AR-TITEL-1..4, AR-PROCESS-1, AR-KONTAKT-1, AR-KONTAKT-4, AD-TITEL-1..4, AD-KONTAKT-1, AD-KONTAKT-4, AD-DATUM-1, AD-HANDLINGSTYP-1, AD-KATEGORI-1, FIL-ANTAL-1, FIL-MISSIV-1; varje handler skickar regelns regeltext plus relevanta ärende-/ärendedokumentfält och `dokumenttext` (`casedetails/testcases.json`) genom TI01:s klient och mappar svaret till regel-ID, allvarlighetsgrad, metod "AI-bedömning", evidens, konfidens, svensk förklaring och rättningsförslag (`docs/prd.md#fr6-förklarade-fynd`).
  - **Verify**: Test: TC-04- och TC-12-fixturerna (`casedetails/testcases.json`) ger vardera sin förväntade regels fynd med evidens/förklaring/konfidens; TC-01:s rena baseline ger inget fynd från den här handler-gruppen.

- [x] **TI05** Filinnehållshandlers täcker FIL-LASBAR-1, FIL-SKANN-1 och FIL-UNDERTECKNAD-1
  - FIL-LASBAR-1 mappar filens läsbarhetsfakta direkt till uppfylld/fynd utan Claude-anrop (en binär teknisk fakta kräver inget omdöme); när en fil är oläsbar returnerar varje annan handler i denna task som behöver filens innehåll ej genomförd i stället för att försöka bedöma den; FIL-SKANN-1 och FIL-UNDERTECKNAD-1 anropar TI01:s klient med `dokumenttext` som underlag när filen är läsbar.
  - **Verify**: Test: TC-16:s oläsbar-fil-fixtur ger ett FIL-LASBAR-1-fynd utan konfidensfält och inget registrerat Claude-anrop, plus ej genomförd för FIL-SKANN-1/FIL-UNDERTECKNAD-1 på samma dokument; TC-17:s läsbar-fil-fixtur ger ett FIL-SKANN-1-fynd med konfidens.

- [x] **TI06** En saknad fil ger ej tillämplig för filregler, med katalogens uttryckliga undantag respekterat
  - En dispatchad filberoende regel utan bifogad fil blir ej tillämplig utan Claude-anrop; undantaget för FIL-ANTAL-1 (`docs/prd.md#fr3-granskning` validering: "Det gäller inte FIL-ANTAL-1") läses från regelmängden, inte hårdkodat mot ett rule-id, i linje med TI02:s datadrivna mönster.
  - **Verify**: Test: en fixtur med tom `fil.filer` ger ej tillämplig för FIL-SKANN-1, FIL-UNDERTECKNAD-1 och FIL-MISSIV-1, medan FIL-ANTAL-1 fortfarande ger ett utfall som inte är ej tillämplig.

- [x] **TI07** Ett AI-fynd under den konfigurerade konfidenströskeln markeras osäker
  - Jämför varje Claude-svars konfidens mot TI03:s tröskel; under tröskeln taggas utfallet osäker i stället för ett definitivt fynd, men bär ändå hela FR6-fyndformen (`docs/prd.md#fr3-granskning` AC: "konfidens under tröskeln markeras som osäker"); statuskonsekvensen av osäker ligger utanför scope här (S06).
  - **Verify**: Test: ett stubbat lågkonfidenssvar (t.ex. 0.4 mot en konfigurerad tröskel på 0.75) på valfri TI04-handler ytar sitt fynd taggat osäker, inte ett vanligt fynd.

- [x] **TI08** En otillgänglig eller felande AI-tjänst degraderar hela omgången till ej genomförd utan att stanna granskningen
  - När TI01:s klient returnerar sin fel-variant för valfri dispatchad regel blir varje regel i TI02:s dispatch-mängd för den omgången ej genomförd (inte en delvis mix); S04:s deterministiska utfall i samma omgång är opåverkade; omgången slutförs och förblir körbar igen (`docs/adr.md#beslut-2-granskningspipeline--deterministiskt--ai--status`; `docs/prd.md#fr3-granskning` felhantering).
  - **Verify**: Test: en simulerad Claude API-avbrott för en granskningsomgång ger ej genomförd för varje regel i dispatch-mängden och lämnar en fullständig, oförändrad mängd deterministiska utfall för samma omgång.

- [x] **TI09** Rättningsförslag introducerar aldrig en fabricerad kontakt, ett personnamn eller sekretessrelevant innehåll
  - Titelregel-handlers som producerar ett rättningsförslag (AR-TITEL-4, AD-TITEL-4, och varje annan handler som ytar ett) stryker eller avvisar ett förslag som innehåller ett personnamn (`docs/prd.md#fr6-förklarade-fynd` AC); ingen handler hittar på en kontakt som inte finns i indata.
  - **Verify**: Test: TC-04:s personnamn-i-titel-fixtur (`casedetails/testcases.json`) ger ett rättningsförslag utan personnamn.

### Testing Strategy
- Inget testramverk finns ännu i repot (grundstenarna S01–S03 är fortfarande pending); scenarierna ovan är obundna Given/When/Then i väntan på exekverarens stack-/testrunner-val. Stubba TI01:s Claude-klient i alla automatiska tester – inget scenario eller task-Verify kräver ett riktigt API-anrop.

### Execution Contract
- TI04–TI09 förutsätter att TI01 (klient) och TI02 (dispatch) är på plats; TI07 förutsätter dessutom TI03:s tröskelkonfig; TI08 förutsätter TI01:s typade fel-variant.


## Implementation Observations

- Kod: `src/lib/granskning/ai/` (`klient.ts`, `handlers.ts`, `dispatch.ts`, tester i `ai.test.ts`), delat kontrakt i S04:s `src/lib/granskning/kontrakt.ts`. Ingångspunkt för S06: `bedomAiRegler({ dokument, katalog, klient, omgang? })` → `{ utfall, aiModell }`. Verifierat med `npm test` (54 pass); `tsc` finns inte installerat, så `npm run typecheck` är inte körd.
- **Lucka i FIS:** TI04:s regellista saknar AD-SEKRETESS-1 (metod `M → H`), men det strukturella kriteriet kräver en handler per C/H-rad. Handlern anropar aldrig Claude (PRD Constraints: sekretessfrågor går till människa): `ej tillämplig` om skyddskoden inte är Sekretess eller ärendet inte är Avslutat, annars `ej genomförd`.
- **Tolkning av TI08:** ett klientfel (timeout, transportfel eller otolkbart svar från en enda regel) ger `ej genomförd` för varje regel som ställde en fråga till Claude, även regler vars svar hunnit lyckas. Regler som avgörs utan Claude (FIL-LASBAR-1, ej tillämplig, AD-SEKRETESS-1) behåller sitt utfall. Efter första felet ställs inga fler frågor. OC02 ("den drabbade regeln") och TI08 ("hela omgången") skiljer sig åt; TI08 följdes.
- Anropstaket är fast ett per rule-id och omgång (`Omgang`-cache), inte en katalogparameter. Bara `aiKonfidenstroskel` (0.75, katalogversion 1.1.0) ligger i `checklist_rules.json`.
- Kontraktet i `kontrakt.ts` (S04) är delat. S05 lade till två valfria fält: `Fynd.osaker` (TI07) och `Regelutfall.orsak` (varför ej tillämplig/ej genomförd). AI-fynd har `Fynd.metod = 'AI-bedömning'` (scenario S02), medan S04:s fynd och FIL-LASBAR-1 bär katalogens metodvärde. S06 skiljer AI-fynd från deterministiska på `konfidens`/`metod`. Både S04 och S05 producerar utfall för FIL-LASBAR-1, FIL-SKANN-1 och FIL-UNDERTECKNAD-1 (S04 ger dessutom `ej genomförd` vid okänd flagga). S06 måste förena dem per rule-id.
- Rättningsförslags personnamnsspärr är en heuristik (två versalinledda ord i följd, samt orden i `ansvarig`). Den stryker hellre för mycket än läcker ett namn. S09 bör mäta falska strykningar.
- Riktig klient: `skapaClaudeKlient({ apiKey, modell?, timeoutMs? })` (standard `claude-sonnet-5`, 15 s). Anropar Messages API med `fetch`, inget SDK-beroende. Inte körd mot riktiga API:t.
