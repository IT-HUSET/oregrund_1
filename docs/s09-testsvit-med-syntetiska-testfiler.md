# Testsvit med syntetiska testfiler

**Plan**: docs/plan.json
**Story-ID**: S09

## Feature Overview and Goal

**Intent**: Registraturen hinner i dag bara granska ca 20 % av dokumentkorten manuellt; innan granskningspipelinen (S03–S06) kan bära resten måste dess beteende mot samtliga 20 dokumenterade testfall – inklusive de filrelaterade felmönster riktiga handlingar faktiskt uppvisar – gå att bevisa med ett upprepningsbart kommando i stället för en manuell genomgång.

**Expected Outcomes**:

- [OC01] Ett enda kommando läser in, granskar och statussätter samtliga 20 `testcases.json`-fall genom S03–S06 exakt en gång var och producerar en rapport per fall plus en sammanställning, utan att ett fals fel stoppar de övriga.
- [OC02] Varje filberoende testfall körs mot en riktig syntetisk testfil vars egenskaper är härledda ur fallets `fil`-flaggor; ett fall som saknar sin testfil rapporteras som ett fel i testsviten, aldrig som godkänt.
- [OC03] Rapporten räknar ett auto-rättat fynd som hittat och listar varje fynd utanför `expected_findings` separat, så att en människa kan bedöma om det extra fyndet är rimligt.
- [OC04] Samtliga 20 fall får rätt huvudstatus enligt FR4:s godkänd/flaggad-mappning, och ingen körning ändrar datum, diarienummer eller skyddskod.


## Required Context

- `docs/prd.md#fr10-testsvit-med-syntetiska-testfiler` – auktoritativ FR10-spec: enkommandokörning, auto-rättade fynd räknas som hittade, extra fynd listas separat, saknad testfil är ett fel i testsviten (inte godkänt), ett testfalls fel stoppar inte övriga.
- `docs/prd.md#fr4-statussättning` – AC-raden testsviten implementerar ordagrant: `expected_status: godkänd` kräver den exakta statusen Godkänd; `flaggad` accepterar valfri av Autokorrigerad/Åtgärd krävs/Mänsklig bedömning.
- `docs/prd.md#constraints` – datum, diarienummer och skyddskod ändras aldrig automatiskt (bindingConstraint); testsviten är den plats som strukturellt verifierar det.
- `docs/plan.json#sharedDecisions.0` – RuleOutcome/Finding-kontraktet komparatorn läser.
- `docs/plan.json#sharedDecisions.1` – Granskningsomgång-orkestreringskontraktet: den callable entry point S06 exponerar för att trigga en omgång; S09 driver denna, se Constraints (S06 har ingen FIS ännu).
- `docs/plan.json#sharedDecisions.2` – Kontrolloggens händelseschema (före/efter-värden, statusbyten); används för att bekräfta auto-rättning och fältskydd när omgångens eget svar inte redan flaggar det.
- `docs/plan.json#sharedDecisions.3` – Dokument/Ärende-datamodellen (S03) som varje fall läses in till.
- `casedetails/testcases.json#cases` – facit för alla 20 fall: `fil`-flaggor, `expected_status`, `expected_findings`.


## Deeper Context

- `docs/s04-deterministisk-granskningsmotor.md#technical-overview` – bekräftar att filanalysen läser färdiga `ar_*`-flaggor direkt i stället för att parsa filinnehåll; formar hur "riktig testfil" ska tolkas här (se Constraints).
- `docs/s03-inlasning-av-dokument.md#feature-overview-and-goal` – inläsningsmodulen TI02 anropar; dess egna minimala per-format-fixturer är skilda från S09:s fullständiga 20-fallsuppsättning.
- `docs/prd.md#fr5-automatisk-rättning-av-säkra-fel` – auto-rättning är begränsad till AD-KONTAKT-5 och FIL-ZIP-1; det är dessa två TI05:s "auto-rättat räknas som hittat"-logik gäller.


## Acceptance Scenarios

- [ ] **S01 [OC01] [TI02,TI03,TI07] Ett kommando kör hela 20-fallssviten**
  - **Given** alla 20 `casedetails/testcases.json`-fall med sina syntetiska fixturer på plats
  - **When** testsvitskommandot körs
  - **Then** varje fall läses in och körs genom exakt en granskningsomgång, och rapporten listar ett resultat per `case_id`

- [ ] **S02 [OC01,OC04] [TI03,TI04] Korrekt baseline ger Godkänd (TC-01)**
  - **Given** TC-01 (`expected_status: "godkänd"`, `expected_findings: []`)
  - **When** sviten kör TC-01 genom S03–S06
  - **Then** den faktiska statusen är exakt "Godkänd", inga fynd redovisas, och fallet markeras godkänt i rapporten

- [ ] **S03 [OC03] [TI04,TI05] Auto-rättat fynd räknas som hittat (TC-08)**
  - **Given** TC-08, där AD-KONTAKT-5 auto-rättas av granskningsomgången ("Kopia till" töms)
  - **When** komparatorn jämför faktiska fynd mot `expected_findings`
  - **Then** AD-KONTAKT-5 räknas som hittat (inte saknat), den faktiska statusen "Autokorrigerad" uppfyller `expected_status: "flaggad"`, och fallet markeras godkänt

- [ ] **S04 [OC02] [TI01,TI03] Zip-fixturen driver riktig uppackning (TC-15)**
  - **Given** TC-15:s riktiga syntetiska zip-fil med färre filer än `antal_bilagor: 3`, härledd ur `ar_zip=true`/`ar_uppackad=false`
  - **When** sviten kör TC-15 genom pipelinen
  - **Then** både FIL-ZIP-1 och FIL-ANTAL-1 hamnar som hittade i jämförelsen (FIL-ZIP-1 auto-rättat, FIL-ANTAL-1 hittat i omkörningen mot det uppackade innehållet), i linje med `expected_findings`

- [ ] **S05 [OC02] [TI01,TI02] Saknad testfil är ett fel i testsviten, inte godkänt (TC-16)**
  - **Given** TC-16:s korrupt-fil-fixtur saknas på disk
  - **When** sviten kör TC-16
  - **Then** körningen rapporterar TC-16 som ett testsvitsfel som namnger den saknade fixturen, och räknar det varken som godkänt eller hoppar tyst över det

- [ ] **S06 [OC03] [TI06] Oväntat extra fynd listas separat**
  - **Given** ett fall vars faktiska körning ger ett fynd som inte finns i `expected_findings` (t.ex. en av TC-20:s tolererade extrafynd enligt PRD:ns Assumptions)
  - **When** rapporten byggs
  - **Then** det fyndet hamnar i en egen "extra fynd"-lista med regel-ID och förklaring, och avgör inte ensamt om fallet blir underkänt

- [ ] **S07 [OC01] [TI07] Ett fals fel stoppar inte resten av sviten**
  - **Given** ett fall vars faktiska resultat avviker från `expected_status`/`expected_findings` (t.ex. en ännu ej rättad motorbugg)
  - **When** sviten kör samtliga 20 fall
  - **Then** det avvikande fallet rapporteras underkänt med en diff mot förväntat resultat, och alla övriga 19 fall slutförs och redovisas i samma körning


## Structural Criteria

- [ ] Ett fals jämförelsefel stoppar aldrig sviten; alla 20 fall (plus ett medvetet trasigt fall) redovisas i samma körning.
- [ ] Varje filberoende fall pekar mot en riktig fixtur på disk med den egenskap fallets `fil`-flaggor anger; en saknad fixtur är alltid ett testsvitsfel, aldrig ett godkänt fall.
- [ ] Datum, diarienummer och skyddskod är oförändrade före/efter för samtliga 20 fall (bindingConstraint, `docs/prd.md#constraints`).
- [ ] Endast `testcases.json`-härledda syntetiska fixturer når inläsning eller AI-tjänsten; ingen `casedetails/*.docx`-export används som testindata (NFR-Security, PRD Assumptions).


## Scope & Boundaries

### Work Areas
- Syntetiska testfilsfixturer för varje distinkt `fil`-flaggprofil i `testcases.json` (ny fixturkatalog, aldrig i `casedetails/`s befintliga verkliga filer)
- Enkommandokörare som läser in varje fall via S03 och driver exakt en granskningsomgång per fall via S06:s orkestreringskontrakt
- Komparator som mappar `expected_status` (godkänd/flaggad) och `expected_findings` mot faktiskt RuleOutcome/Finding-utfall, med auto-rättade fynd räknade som hittade
- Rapportgenerering: per-fallresultat, separat extra-fynd-lista, sammanställning (t.ex. X/20 godkända)
- Feldetektering för saknad testfil, så ett sådant fall räknas som testsvitsfel

### What We're NOT Doing
- Rätta buggar som sviten avslöjar -- ägs av den berättelse vars logik är fel (S03–S06), inte S09 själv.
- Manuellt stickprov (S11) -- separat, människodriven verifieringsväg som bygger på loggen, inte på `testcases.json`-facit.
- Den faktiska empiriska trimningen av S05:s konfidenströskel -- S05:s riskmitigering säger att trimningen sker "mot S09:s testsvit", men själva trimningsbeslutet ägs av S05; S09 levererar bara den körbara pipelinen S05 trimmar mot.
- Riktiga Janus/P360-datakällor eller gallringsfrågor -- prototypen använder enbart syntetiska fixturer (NFR-Security); produktionsintegration är S10:s integrationsplan.


## Architecture Decision

**Approach**: En Node/TypeScript-körare (fits `docs/adr.md#skiss`) itererar `testcases.json#cases`, slår upp varje falls fixturprofil, läser in via S03 och triggar en granskningsomgång via S06:s callable entry point en gång per fall, jämför resultatet mot facit och samlar allt i en rapport.
**Why this over alternatives**: Att återanvända S06:s enda omgångstrigger i stället för att S09 själv sekvenserar S04→S05→S06 undviker att duplicera orkestreringslogik S06 redan äger, och kräver inget UI (S07/S08 finns inte förrän våg W4/W5 löper klart).


## Technical Overview

Per fall: en fixturprofil slås upp ur `testcases.json#cases`s `fil`-flaggor (TI01), fallet läses in via S03 (TI02), och exakt en granskningsomgång triggas via S06:s ännu ej specade orkestreringskontrakt (TI03, `docs/plan.json#sharedDecisions.1`). Resultatet jämförs mot `expected_status` enligt FR4:s godkänd/flaggad-regel (TI04) och mot `expected_findings` med auto-rättning räknad som hittat (TI05), innan per-fall- och sammanställningsrapporten byggs (TI06, TI07).


## Code Patterns & External References

```
# type | path#anchor or url                                      | why needed (intent)
file   | casedetails/testcases.json#cases                        | Facit för alla 20 fall – fil-flaggor, expected_status, expected_findings fixturer och komparator byggs mot
file   | docs/prd.md#fr10-testsvit-med-syntetiska-testfiler       | Auktoritativ FR10-AC: enkommando, auto-rättat=hittat, extra fynd separat, saknad-fixtur=fel
file   | docs/s04-deterministisk-granskningsmotor.md#technical-overview | Bekräftar att filanalys läser ar_*-flaggor direkt, inte riktig parsning – formar vad "riktig testfil" betyder här
```


## Constraints & Gotchas

- **Constraint**: S04:s filanalys läser färdiga `ar_*`-flaggor direkt i stället för att parsa filbytes (`docs/s04-deterministisk-granskningsmotor.md#technical-overview`) -- Workaround: fixturerna ska ändå faktiskt ha den egenskap FR10:s AC kräver (t.ex. TC-16 ska verkligen inte gå att öppna), även om dagens motor skulle "klara sig" på flaggan ensam.
- **Critical**: `casedetails/` innehåller redan fem verkliga ärendeexporter (`Ärende 2025-*.docx`) och riktiga skärmdumpar som bara är referensmaterial, aldrig testindata (`docs/prd.md#assumptions`) -- Must handle by: härleda varje fixtur ur `testcases.json`s falldata, aldrig kopiera eller läsa in `Ärende *.docx`-filerna som falldata; nya fixturer läggs i en egen katalog, aldrig ovanpå befintliga filer i `casedetails/`.
- **Avoid**: att tolka `expected_status: "flaggad"` som en bokstavlig statussträng -- Instead: matcha den mot valfri av Autokorrigerad/Åtgärd krävs/Mänsklig bedömning per FR4:s AC; bara "godkänd" mappar mot den exakta strängen "Godkänd".
- **Constraint**: S06 (orkestreringsentrypunkten S09 driver) specas parallellt och har ingen FIS än -- Workaround: implementera TI03 mot formen beskriven i `docs/plan.json#sharedDecisions.1` (en enda callable som triggar en omgång per dokument); vänta inte på S06:s FIS innan S09 påbörjas.


## Implementation Plan

### Implementation Tasks

- [ ] **TI01** Syntetiska fixturer täcker varje distinkt `fil`-flaggprofil i `testcases.json`, med riktiga filer vars egenskaper matchar flaggorna
  - Sex profiler: standard/giltig (de 14 fall med identiska `ar_*`-flaggor), osignerad (TC-14), zip med för få filer (TC-15), oläsbar/korrupt (TC-16), enkelsidig skanning av dubbelsidigt original (TC-17), filändelselös minimal fil (TC-20); TC-18:s särdrag (`mejlmissiv_diarieford`) är fil-metadata, inte en binär egenskap, och återanvänder standardfixturen
  - **Verify**: alla sex profiler finns som riktiga filer på disk och har faktiskt den angivna egenskapen (TC-16:s fixtur går verkligen inte att öppna, TC-15:s zip innehåller verkligen färre poster än `antal_bilagor`); samtliga 20 fall pekar mot en existerande fixturväg; ingen fixtur är en kopia av eller läsning från `casedetails/Ärende *.docx`

- [ ] **TI02** Köraren läser in varje `testcases.json`-fall med sin uppslagna fixtur via S03
  - Använder S03:s inläsningsmodul (`docs/s03-inlasning-av-dokument.md`) per fall; ett fall vars fixtur saknas registreras som ett testsvitsfel, inte som överhoppat eller godkänt
  - **Verify**: alla 20 fall läses in till 20 distinkta Färdig-dokument när fixturerna finns; ett fall med en medvetet borttagen fixtur rapporteras som fel, och körningen fortsätter till övriga fall

- [ ] **TI03** Köraren driver varje inläst dokument genom exakt en granskningsomgång via S06:s orkestreringsentrypunkt
  - Anropar den callable S06 exponerar (`docs/plan.json#sharedDecisions.1`) en gång per fall; simulerar inte handläggarens "Skicka för ny granskning"-loop (S06:s egen interna omkörning efter auto-rättning gäller ändå)
  - **Verify**: TC-08 och TC-15 visar sina auto-rättade fält ändrade, och deras auto-rättningsbara fynd finns med i omgångens utfall

- [ ] **TI04** Komparatorn mappar varje falls faktiska status mot `expected_status` enligt FR4:s godkänd/flaggad-regel
  - `"godkänd"` kräver den exakta faktiska statusen "Godkänd"; `"flaggad"` accepterar valfri av Autokorrigerad/Åtgärd krävs/Mänsklig bedömning (`docs/prd.md#fr4-statussättning` AC)
  - **Verify**: TC-01/TC-02 ("godkänd") underkänns av komparatorn om faktisk status är något annat än "Godkänd"; TC-08 ("flaggad", faktisk status Autokorrigerad) godkänns av statusjämförelsen

- [ ] **TI05** Komparatorn matchar faktiska fynd mot `expected_findings` per regel-ID, och räknar auto-rättade fynd som hittade
  - Läser omgångens fynd och – där omgångens eget svar inte redan flaggar auto-rättning – kontrolloggens före/efter-värden (`docs/plan.json#sharedDecisions.2`) för AD-KONTAKT-5 och FIL-ZIP-1 (`docs/prd.md#fr5-automatisk-rättning-av-säkra-fel`); bekräftar också att datum, diarienummer och skyddskod är oförändrade
  - **Verify**: TC-08:s AD-KONTAKT-5 och TC-15:s FIL-ZIP-1/FIL-ANTAL-1 markeras hittade; ett regel-ID i `expected_findings` som varken finns i omgångens fynd eller loggens auto-rättningspost markeras saknat; en stubbad ändring av datum/diarienummer/skyddskod på valfritt fall flippar det fallet till testsvitsfel oavsett status-/fyndmatchning

- [ ] **TI06** Rapporten listar extra fynd separat utan att ensamt underkänna fallet
  - Ett fynd vars regel-ID inte finns i fallets `expected_findings` läggs i en egen "extra fynd"-lista med regel-ID och förklaring; fallets godkänt/underkänt avgörs bara av hittade/saknade förväntade fynd och statusmatchning
  - **Verify**: ett stubbat extra fynd på ett valfritt fall hamnar i det fallets extra-fynd-lista och flippar inte ensamt fallet från godkänt till underkänt

- [ ] **TI07** Sviten körs med ett kommando och rapporterar per-fall och sammanställning utan att stanna på ett fals fel
  - En entrypunkt (CLI/npm-skript) itererar alla 20 fall; varje falls inläsning/omgång/jämförelse fångas så att ett fel i ett fall rapporteras i stället för att kasta och avbryta körningen
  - **Verify**: kommandot körs med ett falls fixtur borttagen och producerar ändå en fullständig rapport för de övriga 19 fallen plus det ena testsvitsfelet; sammanställningsraden anger antal godkända av 20

### Testing Strategy

- Inget testramverk finns ännu i repot (S01–S03 kan fortfarande vara under uppbyggnad i denna våg); scenarierna ovan är obundna Given/When/Then. Stubba S05:s Claude-klient i den automatiska exekverarens verifieringsloop (matchar S05:s egen `docs/s05-ai-bedomning-av-innehall.md#constraints-gotchas`-riktlinje); spara riktiga API-anrop och den fullständiga 10-minutersbudgeten för manuella körningar.

### Execution Contract

- TI04–TI07 förutsätter TI01–TI03 på plats. TI03 kan inte köras end-to-end förrän S06 landat (S09 `dependsOn` S06); TI01/TI02 går att bygga och verifiera oberoende av S06 under tiden.


## Final Validation Checklist

- [ ] Nya fixturfiler ligger i en egen katalog och skriver aldrig över någon befintlig fil i `casedetails/` (t.ex. `Ärende *.docx`, `Test *.png`, `testcases.json`).


## Implementation Observations

_No observations recorded yet._
