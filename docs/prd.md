# Product Requirements Document: AI-kvalitetskontrollant i diariet

> **Source Trust**: trusted-local
> **Context**: Statskontorets utmaning "Låt AI bli kvalitetskontrollant i diariet" (`problem.md`) samt underlag i `casedetails/` (Checklista för kvalitetskontroller i Janus (Public 360), Instruktionshandbok registraturen, Ang regelverk, OSL 5 kap. 2 §, Business case ESV Registratur, `testcases.json`).
> **Related Assets**: –


## Executive Summary

- **Problem**: Registraturen hinner bara granska ca 20 % av alla dokumentkort manuellt (ca 5 min per kort), medan 10–30 % innehåller fel. Varje rättning tar 10–15 min, och ledtiden till registrerat är ca 5 dagar. Att granska 100 % manuellt skulle kosta ca 1 640 h per år plus ca 990 h rättningar.
- **Vision**: Varje ärendedokument granskas automatiskt mot regelverket när handläggaren markerar det som färdigt. Korrekta dokument registreras direkt, tydliga fel går tillbaka till handläggaren med förklaring, och människor behöver bara bedöma de dokument som verkligen kräver det. Allt är spårbart och förklarat, och inget sker som en svart låda.
- **Target Users**: Registrator/Huvudregistrator, handläggare, samt verksamhetsansvarig/revisor som behöver spårbarhet.
- **Success Metrics**:
  - Alla 20 testfall klarar huvudstatus och förväntade fynd.
  - 100 % av inlästa dokument granskas mot alla 29 regler, och varje kontroll loggas.
  - Varje fynd har regel, förklaring, metod och evidens.
  - Säkra fel rättas automatiskt med logg över före/efter.
  - En granskning tar ≤ 30 s per dokument (p95).

### Capabilities at a Glance
- **FR1: Regelkatalog** _(Must / P0)_ – Checklistans 29 regler som redigerbar data, med allvarlighetsgrad och flagga för auto-rättning.
- **FR2: Inläsning av dokument** _(Must / P0)_ – läser in ärende, dokumentkort och bifogade filer.
- **FR3: Granskning** _(Must / P0)_ – kör alla regler på ett dokument med deterministisk kontroll och AI-bedömning.
- **FR4: Statussättning** _(Must / P0)_ – Godkänd / Autokorrigerad / Åtgärd krävs / Mänsklig bedömning, där godkända dokument blir Registrerat.
- **FR5: Automatisk rättning av säkra fel** _(Must / P0)_ – rensar "Kopia till" och packar upp zip, med omkörning av beroende regler.
- **FR6: Förklarade fynd** _(Must / P0)_ – regel, metod, evidens, konfidens och rättningsförslag per fynd.
- **FR7: Kontrollogg** _(Must / P0)_ – oföränderlig logg över kontroller, ändringar och mänskliga beslut.
- **FR8: Registratorvy** _(Must / P0)_ – kö, detaljvy, godkänna eller avvisa förslag, skicka till handläggare.
- **FR9: Handläggarvy** _(Must / P0)_ – återsända dokument, rätta, skicka för ny granskning.
- **FR10: Testsvit med syntetiska testfiler** _(Must / P0)_ – automatisk körning av de 20 testfallen.
- **FR11: Integrationsplan** _(Must / P0)_ – hur lösningen kopplas in i Janus/P360-flödet.
- **FR12: Stickprov** _(Should / P1)_ – registratorn granskar automatiskt registrerade dokument och kan markera felbedömningar.
- **FR13: Kvalitetsöversikt** _(Could / P2)_ – nyckeltal: andel per status, vanligaste fel, andel felbedömningar.

### Scope Highlights
- **In scope**: granskning mot 29 regler, fyra statusar, auto-rättning av säkra fel, förklaringar och logg, webbgränssnitt för registrator och handläggare, testsvit, integrationsplan.
- **Out of scope**: live-integration mot P360/Janus, att AI skapar dokumentkort eller ärenden, inloggning/behörigheter, e-postnotiser.
- **MVP boundary**: ett färdigmarkerat dokument läses in, granskas mot alla regler, får status med förklarade fynd och hamnar hos rätt roll. Alla 20 testfall passerar.

### Key Constraints, Assumptions & Dependencies
- *Constraint:* AI:n ändrar aldrig datum, diarienummer eller skyddskod. Sekretessfrågor går alltid till människa.
- *Assumption:* prototypen använder bara syntetiska data, och därför får en moln-LLM användas utan krav på var data lagras.
- *Assumption:* Statskontoret är referensorganisation. Kontaktregister och klassificeringsstruktur simuleras från testdata och handbok.
- *Dependency:* `checklist_rules.json` och testfilerna finns inte i underlaget och måste tas fram.


## Problem Definition

### Problem Statement
Handlingar i diariet måste vara korrekta, kompletta och rätt klassificerade. OSL 5 kap. 2 § kräver att registret visar datum, diarienummer, avsändare/mottagare och i korthet vad handlingen rör. I dag kontrollerar registraturen dokumentkort manuellt mot en checklista med 29 punkter, men hinner bara med ca en femtedel. Fel slinker igenom till registret, rättningar sker sent och ledtiden blir lång. Om inget ändras fortsätter 80 % av dokumenten att registreras utan granskning. Kvaliteten i den offentliga förvaltningen blir då beroende av slumpen, och registraturens tid går åt till rutinkontroller i stället för bedömningar.

Samtidigt får AI inte bli en svart låda. Varje flaggning och ändring måste gå att spåra till en regel och förklara, och bedömningar som är juridiska eller osäkra måste lämnas till människa.

### Evidence & Context
- **Volymer:** ca 2 700–3 000 ärenden per år med 1–250 dokumentkort per ärende. Fördelning: hyresavtal ~1 000, EU-revision ~600 à 20–30 kort, övrigt ~770.
- **Nuläge:** 20 % av dokumentkorten granskas, 10–30 % (snitt 20 %) har fel, en rättning tar 10–15 min, och ledtiden är ca 5 dagar.
- **Mål i business case (steg 1–2):** 100 % granskning, ca 5 % av dokumentkorten behöver mänsklig rättning, och ledtiden sjunker mot 0.
- **Nuvarande flöde:** handläggaren sätter dokumentet till "Diarieförd av handläggare" eller "Färdig från handläggare/chef". Huvudregistratorn granskar sedan i vyn "Dokument redo för registrering" och sätter "Registrerat" eller begär rättning.
- **Regelverk:**
  - Checklistan med 29 regler för ärende, ärendedokument och fil.
  - OSL 5 kap. 2 § som juridiskt golv.
  - OSL/TF och JK:s checklista: registrering utan dröjsmål, högst 24 h.
- **Vanliga fel enligt de annoterade skärmdumparna:**
  - obegripliga eller förkortade titlar
  - fel handlingstyp och process
  - avsändare och mottagare omkastade
  - en tjänsteperson angiven som avsändare
  - tom ansvarig


## Scope

### In Scope
- Regelkatalog med Checklistans 29 regler som data (FR1).
- Inläsning av ärende, dokumentkort och bifogade filer (FR2).
- Granskning med deterministiska kontroller och AI-bedömning (FR3).
- Fyra resultatstatusar och allvarlighetsgrad per fynd (FR4).
- Automatisk rättning av säkra, deterministiska och reversibla fel (FR5).
- Förklaring, evidens och konfidens per fynd (FR6).
- Kontrollogg (FR7).
- Webbgränssnitt för registrator och handläggare (FR8, FR9).
- Testsvit mot 20 testfall, med syntetiska testfiler (FR10).
- Integrationsplan för Janus/P360 (FR11).
- Stickprov (FR12) och kvalitetsöversikt (FR13) i mån av tid.

### Out of Scope
- Live-integration mot P360/Janus. Den beskrivs bara i integrationsplanen.
- Att AI skapar eller fyller i dokumentkort från filer (business case steg 3).
- Automatiskt skapande av ärenden.
- Inloggning och behörighetshantering. Rollen väljs i gränssnittet.
- E-postnotiser. Återkoppling till handläggaren sker bara i appen.
- Senare regler som inte ingår nu:
  - tidsregeln ≤ 24 h
  - makuleringskontroller
  - kontroller som utlöses vid avslut av ärende. AD-SEKRETESS-1 ingår ändå: regeln prövas vid granskningen av ett ärendedokument när ärendets status är Avslutat (TC-13)
  - validering mot mallar för återkommande ärendetyper

### MVP Boundary
Ett dokument med status "Färdig" läses in (metadata och filer) och granskas mot alla 29 regler. Det får en av fyra statusar med förklarade fynd:
- **Godkänd/Autokorrigerad:** blir Registrerat.
- **Åtgärd krävs:** syns i handläggarvyn.
- **Mänsklig bedömning:** syns i registratorvyn.

Alla 20 testfall passerar i testsviten. Integrationsplanen finns som dokument.


## Functional Requirements

### User Stories

| ID | Story | Acceptance Criteria | Priority |
|----|-------|---------------------|----------|
| US01 | Som registrator vill jag att varje färdigmarkerat dokument granskas automatiskt mot hela checklistan, så att 100 % granskas utan att jag lägger ca 5 min per dokumentkort | Varje inläst dokument har en logg där alla 29 regler har ett utfall: uppfylld, fynd, ej tillämplig eller ej genomförd | Must / P0 |
| US02 | Som registrator vill jag bara få dokument som kräver mänsklig bedömning i min kö, så att jag lägger tid där den behövs | Registratorns kö visar som standard bara Mänsklig bedömning. Godkända och autokorrigerade dokument är registrerade utan åtgärd från registratorn | Must / P0 |
| US03 | Som registrator vill jag se regel, evidens, metod och konfidens för varje fynd, så att jag kan lita på eller underkänna AI:ns bedömning | Varje fynd visar regel-ID, regeltext, metod (regel/AI), evidens och konfidens för AI-fynd | Must / P0 |
| US04 | Som registrator vill jag kunna godkänna eller avvisa rättningsförslag och skicka dokument till handläggaren, så att jag behåller kontrollen över bedömningsfrågor | Varje beslut loggas med roll, tid och motivering (motivering krävs vid avvisning). Dokumentet får ny status | Must / P0 |
| US05 | Som handläggare vill jag få återsända dokument med konkret förklaring och rättningsförslag, så att jag kan åtgärda felet direkt utan att fråga registraturen | Handläggarvyn listar dokument med status Åtgärd krävs, med fynd och förslag som går att tillämpa med ett klick | Must / P0 |
| US06 | Som handläggare vill jag att dokumentet granskas om när jag har rättat det, så att det kan registreras utan ny manuell kontroll | "Skicka för ny granskning" kör en full granskning och sätter ny status | Must / P0 |
| US07 | Som verksamhetsansvarig/revisor vill jag se exakt vilka kontroller som körts och vilka ändringar som gjorts, så att granskningen är spårbar | Loggen visar regelversion, regler, fynd, ändringar före/efter och mänskliga beslut. Den går inte att ändra | Must / P0 |
| US08 | Som registrator vill jag stickprova automatiskt registrerade dokument, så att jag kan följa upp automatikens kvalitet | Registratorn kan öppna registrerade dokument och markera ett fynd som saknat eller felaktigt. Markeringen loggas | Should / P1 |
| US09 | Som registraturansvarig vill jag se nyckeltal för granskningen, så att vi får insyn i hur många och vilka fel som görs | En översikt visar antal per status, de vanligaste reglerna och andelen stickprovsmarkerade felbedömningar | Could / P2 |
| US10 | Som beslutsfattare vill jag ha en plan för hur lösningen kopplas in i diarieflödet, så att vi kan ta ställning till en pilot | Integrationsplanen täcker trigger, statusövergångar, återkoppling, datahantering och steg mot pilot | Must / P0 |

### Feature Specifications

#### FR1: Regelkatalog
**Description**: Checklistans 29 regler finns som strukturerad och redigerbar data (`checklist_rules.json`). Regel-ID:n är kompatibla med `testcases.json`. Varje regel har:
- ID
- nivå (Ärende/Dokument/Fil)
- fält
- regeltext (från Checklistan)
- felvillkor
- metod (M = metadata, M+L = metadata och uppslag, C = innehåll/fil, H = mänskligt omdöme)
- allvarlighetsgrad (Lagkrav / Fel / Anmärkning)
- om auto-rättning är tillåten

| Regel-ID | Nivå | Fält | Fel om … | Metod | Auto-rättning |
|---|---|---|---|---|---|
| AR-TITEL-1 | Ärende | Titel | titeln inte tydligt beskriver vad ärendet rör | C/H | Nej |
| AR-TITEL-2 | Ärende | Titel | den innehåller förkortningar som inte är utskrivna | M/C | Nej |
| AR-TITEL-3 | Ärende | Titel | den inte är på svenska (engelska tillåts om översättning saknas) | C | Nej |
| AR-TITEL-4 | Ärende | Titel | den innehåller personnamn | C | Nej |
| AR-PROCESS-1 | Ärende | Process | processen saknas i klassificeringsstrukturen eller inte stämmer med vad ärendet rör | M+L/C | Nej |
| AR-KONTAKT-1 | Ärende | Motpart | en motpart finns i handlingarna men saknas på ärendet | C | Nej |
| AR-KONTAKT-2 | Ärende | Motpart | kontakten inte finns i kontaktregistret | M+L | Nej |
| AR-KONTAKT-3 | Ärende | Motpart | kontakten är en e-postadress | M | Nej |
| AR-KONTAKT-4 | Ärende | Motpart | kontakten är en enskild tjänsteperson | M+L/C | Nej |
| AD-TITEL-1 | Dokument | Titel | titeln inte tydligt beskriver handlingens innehåll | C/H | Nej |
| AD-TITEL-2 | Dokument | Titel | den innehåller förkortningar som inte är utskrivna | M/C | Nej |
| AD-TITEL-3 | Dokument | Titel | den inte är på svenska (samma undantag som ovan) | C | Nej |
| AD-TITEL-4 | Dokument | Titel | den innehåller personnamn | C | Nej |
| AD-KONTAKT-1 | Dokument | Avsändare/Mottagare | avsändare eller mottagare finns men saknas (Inkommande/Utgående) | M/C | Nej |
| AD-KONTAKT-2 | Dokument | Avsändare/Mottagare | kontakten inte finns i kontaktregistret | M+L | Nej |
| AD-KONTAKT-3 | Dokument | Avsändare/Mottagare | kontakten är en e-postadress | M | Nej |
| AD-KONTAKT-4 | Dokument | Avsändare/Mottagare | kontakten är en enskild tjänsteperson | M+L/C | Nej |
| AD-KONTAKT-5 | Dokument | Kopia till | fältet "Kopia till" inte är rensat | M | **Ja** |
| AD-DATUM-1 | Dokument | Datum | datumet inte stämmer med när handlingen inkom, expedierades eller beslutades | M/C | Nej |
| AD-HANDLINGSTYP-1 | Dokument | Handlingstyp | typen inte stämmer med innehållet eller inte hör till vald process | M+L/C | Nej |
| AD-KATEGORI-1 | Dokument | Dokumentkategori | riktningen är fel, eller handlingar med olika riktning blandas | M/C | Nej |
| AD-SEKRETESS-1 | Dokument | Skyddskod | sekretessmarkering finns kvar på ett avslutat ärende där sekretessen inte längre gäller | M → H | Nej |
| AD-GODKANNANDE-1 | Dokument | Godkännandeflöde | ett beslut saknar godkännandeflöde eller e-signering | M | Nej |
| FIL-ANTAL-1 | Fil | Filer | antalet filer inte stämmer med det som skickats eller med antal bilagor | M/C | Nej |
| FIL-MISSIV-1 | Fil | Filer | mejlmissiv eller liknande inte är diariefört | M/C | Nej |
| FIL-ZIP-1 | Fil | Filer | en zip-fil inte är uppackad | M | **Ja** |
| FIL-LASBAR-1 | Fil | Filer | en fil inte går att öppna | C | Nej |
| FIL-SKANN-1 | Fil | Filer | ett dubbelsidigt original är skannat enkelsidigt | C/H | Nej |
| FIL-UNDERTECKNAD-1 | Fil | Filer | den inskannade handlingen inte är den undertecknade versionen | C/H | Nej |

**Acceptance Criteria**:
- [ ] Katalogen innehåller exakt 29 regler med ID:n enligt tabellen. Alla 22 regel-ID:n i `testcases.json` finns med.
- [ ] Regler som rör OSL 5 kap. 2 § har allvarlighetsgraden Lagkrav. Det gäller datum, avsändare/mottagare och titel som beskrivning (AD-DATUM-1, AD-KONTAKT-1–4, AD-KATEGORI-1, AD-TITEL-1).
- [ ] Den som ändrar allvarlighetsgrad, regeltext eller auto-rättningsflagga i katalogen behöver inte ändra någon kod.
- [ ] Katalogen har ett versionsnummer som loggas vid varje granskning.

**Inputs / Outputs**:
- **Inputs**: regelkatalogfil.
- **Outputs**: laddade regler tillgängliga för granskningen.

**Validation**:
- Unika ID:n.
- Giltiga värden för nivå, metod och allvarlighetsgrad. Metod är ett av grundvärdena M, M+L, C och H eller en kombination av dem enligt tabellen (t.ex. M/C, M+L/C, C/H, M → H).
- Auto-rättning tillåts bara för metod M.

**Error Handling**:
- En ogiltig katalog stoppar granskningen med ett felmeddelande som anger regel och fält. Ingen granskning körs mot en ofullständig katalog.

**Priority**: Must / P0

#### FR2: Inläsning av dokument
**Description**: Ett ärendedokument läses in tillsammans med sitt ärende och sina filer, enligt schemat i `testcases.json`:
- ärende: diarienummer, titel, process, kontakt, status
- ärendedokument: titel, handlingstyp, dokumentkategori, skyddskod, åtkomstgrupp, avsändare, mottagare, kopia till, ankomstdatum, dokumentdatum, sista svarsdatum, ansvarig, status, antal bilagor, godkännandeflöde
- riktiga bifogade filer

Inläsningen simulerar att handläggaren sätter status "Färdig". Statusvärdet i indata ignoreras, och dokumentet får status "Färdig" vid inläsningen (alla testfall i `testcases.json` anger "Registrerat").

Valfria fält som saknas i indata tolkas inte som fel:
- Saknas godkännandeflöde (`godkannandeflode_status`) ger AD-GODKANNANDE-1 inget fynd. Bara det uttryckliga värdet "Saknas" ger fynd (TC-14).
- Saknas ärendets status räknas ärendet som ej avslutat.

**Acceptance Criteria**:
- [ ] Alla 20 testfall går att läsa in, med tillhörande testfiler.
- [ ] Filer i formaten PDF, e-post (.msg/.eml), zip och bild/skanning tas emot.
- [ ] Det inlästa dokumentet hamnar i granskningen direkt (FR3), utan manuellt steg.

**Inputs / Outputs**:
- **Inputs**: metadata (JSON) och filer.
- **Outputs**: ett dokument redo för granskning, med unikt id.

**Validation**:
- Obligatoriska fält: diarienummer, dokumenttitel, handlingstyp, dokumentkategori och skyddskod. Statusvärdet i indata krävs inte, eftersom det ersätts med "Färdig".
- Om obligatoriska fält saknas avvisas inläsningen.

**Error Handling**:
- Ogiltig indata ger felmeddelandet "Dokumentet kunde inte läsas in: fält X saknas" och loggas. Inget dokument skapas.

**Priority**: Must / P0

#### FR3: Granskning
**Description**: Alla regler i katalogen körs på dokumentet. Deterministiska kontroller körs först: metadata, uppslag i kontaktregister och klassificeringsstruktur, samt filanalys. Därefter körs AI-bedömningar av innehåll, språk och rimlighet, med dokumentets filinnehåll som underlag.

**Acceptance Criteria**:
- [ ] Varje regel får ett utfall: uppfylld, fynd, ej tillämplig eller ej genomförd.
- [ ] Alla fynd rapporteras, inte bara det första. TC-20 ger minst sina sex förväntade fynd.
- [ ] Varje testfall ger alla sina `expected_findings`.
- [ ] TC-01 och TC-02 ger inga fynd.
- [ ] En AI-bedömning med konfidens under tröskeln markeras som osäker.

**Inputs / Outputs**:
- **Inputs**: dokument (FR2), regelkatalog (FR1), kontaktregister och klassificeringsstruktur (simulerade).
- **Outputs**: lista av regelutfall och fynd.

**Validation**:
- Regler som kräver filer och där filer saknas blir "ej tillämplig". Det gäller inte FIL-ANTAL-1.

**Error Handling**:
- Om AI-tjänsten inte svarar, svarar för sent eller ger ett svar som inte går att tolka: de deterministiska reglerna körs ändå, och AI-reglerna får utfallet "ej genomförd".
- Användaren ser: "AI-kontroller kunde inte genomföras – dokumentet kräver manuell granskning."
- Det går att köra om granskningen.

**Priority**: Must / P0

#### FR4: Statussättning
**Description**: Dokumentet får en av fyra statusar. Reglerna prövas i följande ordning:

1. **Mänsklig bedömning** om något fynd kommer från en H-regel eller är ett osäkert AI-fynd, eller om någon regel har utfallet "ej genomförd".
2. Annars **Åtgärd krävs** om ett fel finns kvar efter auto-rättning.
3. Annars **Autokorrigerad** om minst en auto-rättning har utförts.
4. Annars **Godkänd**.

Godkänd och Autokorrigerad sätter dokumentstatus "Registrerat" automatiskt.

**Acceptance Criteria**:
- [ ] Testfall med `expected_status: godkänd` får statusen Godkänd. Testfall med `flaggad` får någon av de tre andra statusarna.
- [ ] TC-13 (AD-SEKRETESS-1) får alltid Mänsklig bedömning.
- [ ] TC-08 (bara "Kopia till") får Autokorrigerad och blir Registrerat.
- [ ] TC-15 (zip plus fel antal) får Åtgärd krävs.
- [ ] Status "Registrerat" sätts bara vid Godkänd eller Autokorrigerad, eller efter ett uttryckligt mänskligt beslut.

**Inputs / Outputs**:
- **Inputs**: regelutfall (FR3) och utförda rättningar (FR5).
- **Outputs**: granskningsstatus, dokumentstatus och vilken roll dokumentet hamnar hos.

**Validation**:
- Varje dokument har exakt en granskningsstatus per granskningsomgång.

**Error Handling**:
- Om statusen inte kan bestämmas, till exempel på grund av ett internt fel, sätts Mänsklig bedömning. Det gäller aldrig Godkänd.

**Priority**: Must / P0

#### FR5: Automatisk rättning av säkra fel
**Description**: Fynd på regler med auto-rättningsflagga rättas automatiskt:
- AD-KONTAKT-5: "Kopia till" rensas.
- FIL-ZIP-1: zip-filen packas upp och ersätts av sitt innehåll.

Regler som beror på de ändrade fälten eller filerna körs om, till exempel FIL-ANTAL-1 efter uppackning. I prototypen körs alla regler om en gång efter auto-rättningen. Fynd i omkörningen auto-rättas inte på nytt. Datum, diarienummer och skyddskod ändras aldrig automatiskt.

En auto-rättning genomförs bara om dess loggpost kan skrivas (FR7).

**Acceptance Criteria**:
- [ ] TC-08: "Kopia till" är tomt efter granskningen, och loggen visar före och efter.
- [ ] TC-15: zip-filen är ersatt av sitt innehåll, och FIL-ANTAL-1 är omprövad mot det uppackade innehållet.
- [ ] Varje auto-rättning går att ångra från loggen.
- [ ] Ingen annan regel än dem med auto-rättningsflagga ändrar data.

**Inputs / Outputs**:
- **Inputs**: fynd, samt dokumentets fält och filer.
- **Outputs**: ändrat dokument och loggposter för ändringarna.

**Validation**:
- Zip-filer i zip-filer, lösenordsskyddade zip-filer och zip-filer som inte går att läsa packas inte upp.

**Error Handling**:
- Om en auto-rättning misslyckas blir den ett förslag i stället, och fyndet ger Åtgärd krävs. Meddelandet blir "Automatisk rättning av X misslyckades".

**Priority**: Must / P0

#### FR6: Förklarade fynd
**Description**: Varje fynd innehåller:
- regel-ID och regeltext
- allvarlighetsgrad
- metod (deterministisk regel eller AI-bedömning)
- evidens, alltså fältvärdet eller ett citat eller utdrag ur filen
- konfidens (bara för AI-fynd)
- en förklaring på svenska av varför fyndet flaggats
- ett rättningsförslag där det är möjligt

**Acceptance Criteria**:
- [ ] 100 % av fynden i testsviten har regel-ID, förklaring, metod och evidens.
- [ ] 100 % av AI-fynden har konfidens.
- [ ] Rättningsförslag hittar inte på kontakter. Om kontakten saknas i registret föreslås "beställ ny kontakt av registraturen" (TC-09).
- [ ] Rättningsförslag för titlar innehåller inga personnamn och inget sekretessbelagt innehåll.

**Inputs / Outputs**:
- **Inputs**: regelutfall.
- **Outputs**: fynd som visas i gränssnittet och sparas i loggen.

**Validation**:
- Ett fynd utan evidens eller förklaring räknas som ett fel i granskningen och testas.

**Error Handling**:
- Om AI-tjänsten inte ger någon förklaring markeras fyndet som osäkert, och dokumentet får Mänsklig bedömning.

**Priority**: Must / P0

#### FR7: Kontrollogg
**Description**: Varje granskningsomgång loggas med:
- tidpunkt och dokument-id
- regelkatalogens version
- AI-modell
- utfallet för varje regel
- fynd
- ändringar (före och efter)
- statusbyten
- mänskliga beslut, med roll, tid och motivering

**Acceptance Criteria**:
- [ ] Loggen för ett dokument visar samtliga 29 regler med utfall för varje granskningsomgång.
- [ ] Loggposter går inte att ändra eller radera via gränssnittet.
- [ ] Loggen visar hela historiken när ett dokument har granskats flera gånger (efter rättning).

**Inputs / Outputs**:
- **Inputs**: händelser från FR3–FR5, FR8, FR9 och FR12.
- **Outputs**: loggvy per dokument.

**Validation**:
- Varje statusbyte har en loggpost.

**Error Handling**:
- Om loggen inte går att skriva avbryts statusbytet eller dataändringen (även auto-rättningar), eftersom ingen ändring får ske utan logg. Ett felmeddelande visas.

**Priority**: Must / P0

#### FR8: Registratorvy
**Description**: En webbvy för rollen Registrator med:
- en kö som kan filtreras per status, med Mänsklig bedömning som standard
- en dokumentdetaljvy med metadata (Detaljer/Kontakter/Filer), fynd enligt FR6 och kontrollogg
- åtgärder per fynd: godkänn förslag, avvisa fyndet (motivering krävs) eller skicka till handläggare

**Acceptance Criteria**:
- [ ] Registratorn kan hantera varje fynd i ett dokument med status Mänsklig bedömning och avsluta med Registrerat eller Åtgärd krävs.
- [ ] Ett avvisat fynd stängs med motivering, och dokumentet utvärderas utan det fyndet.
- [ ] Alla beslut syns i loggen (FR7).
- [ ] Rollen väljs i sidhuvudet. Ingen inloggning krävs.

**Inputs / Outputs**:
- **Inputs**: dokument och fynd.
- **Outputs**: beslut, statusbyten och loggposter.

**Validation**:
- Avvisning utan motivering tillåts inte.

**Error Handling**:
- Om ett beslut inte kan sparas visas ett felmeddelande, och dokumentets status förblir oförändrad.

**Priority**: Must / P0

#### FR9: Handläggarvy
**Description**: En webbvy för rollen Handläggare med:
- en lista över dokument med status Åtgärd krävs
- detaljvy med fynd och förslag
- redigerbara fält
- möjlighet att tillämpa förslag
- "Skicka för ny granskning", som kör FR3–FR4 på nytt

**Acceptance Criteria**:
- [ ] Ett dokument som returneras av granskningen eller av registratorn syns direkt i handläggarvyn.
- [ ] Ett förslag kan tillämpas med ett klick, och ändringen loggas.
- [ ] När alla fel i ett testfall rättats ger ny granskning statusen Godkänd, och dokumentet blir Registrerat.

**Inputs / Outputs**:
- **Inputs**: dokument med Åtgärd krävs, samt handläggarens ändringar.
- **Outputs**: uppdaterat dokument och en ny granskningsomgång.

**Validation**:
- Handläggaren kan inte ändra diarienummer.
- Handläggaren kan inte sätta status Registrerat.

**Error Handling**:
- Om ny granskning misslyckas förblir dokumentet i Åtgärd krävs, och ett felmeddelande visas.

**Priority**: Must / P0

#### FR10: Testsvit med syntetiska testfiler
**Description**: En automatisk testsvit kör de 20 testfallen i `testcases.json` genom inläsning, granskning och statussättning, och jämför resultatet med `expected_status` och `expected_findings`. Syntetiska testfiler tas fram per testfall utifrån de filflaggor som finns i `testcases.json`, till exempel:
- zip-fil med för få filer (TC-15)
- korrupt PDF (TC-16)
- enkelsidigt skannat dubbelsidigt original (TC-17)
- e-post utan diariefört missiv (TC-18)
- beslut utan underskrift (TC-14)

**Acceptance Criteria**:
- [ ] Testsviten körs med ett kommando och rapporterar resultat per testfall: status, förväntade fynd som hittats respektive saknas, och extra fynd.
- [ ] Fynd som har auto-rättats (t.ex. AD-KONTAKT-5 i TC-08 och FIL-ZIP-1 i TC-15) räknas som hittade vid jämförelsen med `expected_findings`.
- [ ] 20 av 20 testfall får rätt huvudstatus, och alla förväntade fynd hittas.
- [ ] Extra fynd listas separat med förklaring, så att en människa kan bedöma om de är rimliga.
- [ ] Varje testfall med fil-relaterade förväntade fynd har minst en riktig testfil.

**Inputs / Outputs**:
- **Inputs**: `testcases.json` och testfiler.
- **Outputs**: testrapport.

**Validation**:
- Ett testfall som saknar testfil när det behöver en rapporteras som fel i testsviten, inte som godkänt.

**Error Handling**:
- Ett fel i ett testfall stoppar inte de övriga.

**Priority**: Must / P0

#### FR11: Integrationsplan
**Description**: Ett dokument som beskriver hur lösningen kopplas in i det befintliga diarieflödet i Janus/P360 utan att skapa extra manuella steg. Det ska omfatta:
- trigger vid "Diarieförd av handläggare" eller "Färdig från handläggare/chef"
- hur statusar mappas mot P360-statusar
- återkoppling till handläggaren
- registratorns arbetsyta
- dataflöde och datahantering, inklusive krav på AI-tjänst vid riktiga handlingar under sekretess
- behörigheter
- driftsättning
- mätning mot nyckeltalen i business case
- steg mot pilot: från steg 1 (granskning) via steg 2 (rättning) till steg 3 (AI registrerar)

**Acceptance Criteria**:
- [ ] Planen täcker alla punkter ovan.
- [ ] Planen anger vilka manuella steg i nuvarande flöde som försvinner och vilka som finns kvar.
- [ ] Planen pekar ut vad som måste finnas i P360 (gränssnitt eller API) och vilka frågor som är öppna.

**Inputs / Outputs**:
- **Inputs**: nuvarande flöde och prototypens funktion.
- **Outputs**: ett planeringsdokument.

**Validation**:
- Planen motsäger inte begränsningarna för autonomi (se Constraints).

**Error Handling**:
- Ej tillämpligt.

**Priority**: Must / P0

#### FR12: Stickprov
**Description**: Registratorn kan filtrera fram automatiskt registrerade dokument (Godkänd/Autokorrigerad), se deras logg och markera ett missat eller felaktigt fynd som felbedömning, med kommentar.

**Acceptance Criteria**:
- [ ] Registrerade dokument går att lista och öppna.
- [ ] En felbedömning kan markeras med kommentar och syns i loggen.

**Inputs / Outputs**:
- **Inputs**: registrerade dokument.
- **Outputs**: markeringar av felbedömningar.

**Validation**:
- En markering kräver kommentar.

**Error Handling**:
- Om en markering inte kan sparas visas ett felmeddelande.

**Priority**: Should / P1

#### FR13: Kvalitetsöversikt
**Description**: En översikt med antal och andel dokument per granskningsstatus, de vanligaste reglerna bland fynden, antal auto-rättningar och andelen stickprovsmarkerade felbedömningar.

**Acceptance Criteria**:
- [ ] Siffrorna stämmer med loggen för de dokument som lästs in.

**Inputs / Outputs**:
- **Inputs**: logg.
- **Outputs**: översiktsvy.

**Validation**:
- Ej tillämpligt.

**Error Handling**:
- Om data saknas visas tomt läge med förklaring.

**Priority**: Could / P2

### User Flows
1. **Granskning vid färdigmarkering:**
   1. Handläggaren markerar dokumentet som färdigt (inläsning).
   2. Alla regler körs, och säkra fel rättas automatiskt med omkörning av beroende regler.
   3. Dokumentet får status.
   4. Godkänd/Autokorrigerad → Registrerat. Åtgärd krävs → handläggarvyn. Mänsklig bedömning → registratorns kö.
2. **Åtgärd krävs:**
   1. Handläggaren öppnar dokumentet, läser fynd och förslag och rättar.
   2. Handläggaren väljer "Skicka för ny granskning", och flöde 1 körs igen.
3. **Mänsklig bedömning:** registratorn godkänner eller avvisar varje fynd, eller skickar dokumentet till handläggaren. Därefter blir dokumentet Registrerat eller hamnar i flöde 2.
4. **Stickprov:** registratorn öppnar ett registrerat dokument, granskar loggen och markerar eventuella felbedömningar.
5. **Fel i AI-tjänsten:** deterministiska regler körs ändå, AI-reglerna får utfallet "ej genomförd" och dokumentet går till Mänsklig bedömning. Granskningen kan köras om senare.

### UI Wireframes _(if applicable)_
- **Registratorvy:**
  - köer per status
  - dokumentdetalj med flikarna Detaljer, Kontakter och Filer (som i P360)
  - fyndlista med knapparna Godkänn och Avvisa
  - loggflik
- **Handläggarvy:**
  - lista med återsända dokument
  - dokumentdetalj med redigerbara fält och "Tillämpa förslag"
  - knappen "Skicka för ny granskning"
- Rollväljare i sidhuvudet.

### Data Requirements _(if applicable)_
- **Ärende:** diarienummer, titel, process, kontakt (motpart), status.
- **Ärendedokument:**
  - titel, handlingstyp, dokumentkategori, skyddskod, åtkomstgrupp
  - avsändare, mottagare, kopia till
  - ankomstdatum, dokumentdatum, sista svarsdatum
  - ansvarig, status, antal bilagor
  - status för godkännandeflöde
- **Fil:** namn, typ, innehåll, samt resultat från filanalysen (läsbar, zip, sidor, underskrift).
- **Referensdata (simulerade):**
  - kontaktregister, med organisationer och markering av tjänstepersoner
  - klassificeringsstruktur, med processer och handlingstyper per process
- **Granskning:** omgång, regelutfall, fynd, rättningar, status.
- **Logg:** händelser enligt FR7. Den kan bara utökas, och inget som har skrivits kan ändras.
- **Kvarhållande:** prototypen har inga krav på gallring. Alla data är syntetiska.


## Non-Functional Requirements

| Category | Requirement | Threshold / Target |
|----------|-------------|--------------------|
| Performance | Granskning av ett dokument inklusive AI-kontroller | ≤ 30 s (p95) per dokument i testsviten |
| Performance | Hela testsviten | ≤ 10 min |
| Reliability | Samma dokument ger samma status vid upprepad granskning | Huvudstatusen är densamma vid 3 av 3 körningar per testfall |
| Security | Endast syntetiska data i prototypen | 0 riktiga ärenden eller handlingar skickas till AI-tjänsten |
| Security | Skyddade fält | Datum, diarienummer och skyddskod ändras aldrig av automatiken (verifieras i testsviten) |
| Traceability | Loggning | 100 % av statusbyten och ändringar har en loggpost. Loggen kan inte ändras |
| Explainability | Förklaring per fynd | 100 % av fynden har regel-ID, förklaring, metod och evidens. AI-fynd har även konfidens |
| Maintainability | Regler som data | Att ändra regeltext, allvarlighetsgrad eller auto-flagga kräver ingen kodändring |
| Usability | Språk | Gränssnitt och förklaringar på svenska |
| Accessibility | Webbgränssnitt | WCAG 2.1 AA för grundläggande navigering med tangentbord och för kontrast |


## Edge Cases

| Scenario | Expected Behavior | Recovery Path |
|----------|-------------------|---------------|
| Flera fel i samma dokument (TC-20) | Alla fynd redovisas, var för sig, och statusen följer högsta prioritet | Handläggaren eller registratorn åtgärdar per fynd |
| Blandad riktning i ett dokument (TC-12) | AD-KATEGORI-1 med förslag att dela upp dokumentet. Status: Åtgärd krävs (Mänsklig bedömning om AI-fyndet har låg konfidens) | Handläggaren delar upp och skickar för ny granskning |
| Sekretessmarkering kvar på avslutat ärende (TC-13) | AD-SEKRETESS-1. Status: Mänsklig bedömning. Skyddskoden ändras inte | Registratorn eller juristen bedömer |
| Kontakt saknas i kontaktregistret (TC-09) | AD-KONTAKT-2 med förslaget "beställ ny kontakt av registraturen" | Kontakten läggs till och dokumentet granskas om |
| Zip-fil och fel antal bilagor (TC-15) | Zip-filen packas upp automatiskt, och FIL-ANTAL-1 prövas mot det uppackade innehållet | Handläggaren kompletterar med filerna som saknas |
| Zip-fil i zip-fil, eller lösenordsskyddad zip-fil | Packas inte upp. Status: Åtgärd krävs | Handläggaren packar upp manuellt |
| Engelsk titel där svensk översättning saknas | Inget fynd om det framgår av underlaget, annars ett osäkert fynd och Mänsklig bedömning | Registratorn bedömer |
| Organisationsnamn som liknar ett personnamn | Låg konfidens ger Mänsklig bedömning, inte Åtgärd krävs | Registratorn avvisar fyndet med motivering |
| Dokument utan filer | FIL-ANTAL-1. Övriga filregler blir "ej tillämplig" | Handläggaren bifogar filer |
| Fil som inte går att läsa (TC-16) | FIL-LASBAR-1. AI-regler som behöver filens innehåll blir "ej genomförd" | Handläggaren laddar upp en läsbar fil |
| AI-tjänsten är inte tillgänglig | Deterministiska regler körs, AI-regler blir "ej genomförd" och dokumentet får Mänsklig bedömning | Granskningen körs om när tjänsten fungerar |
| Korrekt dokument (TC-01, TC-02) | Godkänd, inga fynd och Registrerat. Loggen visar alla 29 regler | – |


## Constraints & Assumptions

### Constraints
- **Juridiskt golv:** OSL 5 kap. 2 §. Datum, diarienummer, avsändare/mottagare och en kort beskrivning av innehållet måste vara korrekta. Fel på dessa punkter har allvarlighetsgraden Lagkrav.
- **Autonomi:** automatiken får bara ändra fält via regler som har auto-rättningsflagga, i dag "Kopia till" och zip-uppackning. Datum, diarienummer och skyddskod ändras aldrig automatiskt.
- **Sekretess:** bedömningar av sekretess går alltid till människa.
- **Förslag:** rättningsförslag får inte föra in personnamn eller sekretessbelagt innehåll i titlar.
- **Ingen P360-integration:** prototypen läser in dokument från fil. Trigger och statusbyten simuleras.
- **Förvaltning:** regelverket ska kunna förvaltas av verksamheten, och därför ligger reglerna som data.

### Assumptions
- **Referensorganisation:** Statskontoret, enligt testdata och skärmdumpar. Business case från ESV används bara för volymer och nyttoberäkning.
- **Referensdata:** kontaktregister och klassificeringsstruktur simuleras utifrån testdata och handboken, till exempel processerna 1.1.2, 1.2, 1.2.4, 2.1, 2.3, 2.3.1, 3.1, 4.2, 4.7, 4.8, 5.2 och 6.1 med tillhörande handlingstyper. En fullständig lista finns inte i underlaget. Referensdatan måste täcka testdatan så att testfallen inte ger falska fynd:
  - Alla processer i `testcases.json` finns i klassificeringsstrukturen.
  - Handlingstyperna 6.1-1 (Beslut) och 2.3.1-5 (Korrespondens) är tillåtna i alla processer som testdatan använder (TC-01 har 6.1-1 under process 1.2).
  - Kontaktregistret innehåller alla organisationer i testdatan utom Myndigheten för digital förvaltningsutveckling (TC-09).
  - Rex Ljungqvist och Clas Olsson är markerade som tjänstepersoner (TC-06, TC-20).
- **Testdata:** eftersom prototypen bara hanterar syntetiska data får en moln-LLM användas utan krav på var data lagras. Produktion kräver ett nytt beslut om databehandling.
- **TC-20:** extra fynd som skyddskod eller tom ansvarig person räknas som rimliga extra fynd. Tom ansvarig är inte en egen regel i checklistan.
- **Ärendeexporter:** de fem ärendeexporterna (Ärende 2025-*.docx) innehåller bara skärmdumpar och används som referens, inte som testindata.
- **Konfidenströskel:** tröskeln för när ett AI-fynd räknas som osäkert bestäms empiriskt mot testsviten och dokumenteras i regelkatalogen.
- **Auto-rättning:** en auto-rättning sker direkt i prototypens data. Hur det görs i P360 beskrivs i integrationsplanen.

### Dependencies

| Dependency | Why It Matters |
|------------|----------------|
| Moln-LLM (API) | Behövs för AI-reglerna (C). Om den inte finns tillgänglig går dokumenten till Mänsklig bedömning |
| Checklistan (DOCX) | Källa till regelkatalogen. `checklist_rules.json`, som testdatan hänvisar till, saknas och måste återskapas |
| `testcases.json` | Acceptanskriterier för testsviten |
| Syntetiska testfiler | Krävs för att filreglerna ska kunna testas. De finns inte i underlaget |
| Simulerat kontaktregister och simulerad klassificeringsstruktur | Krävs för AR-/AD-KONTAKT-2 och -4, AR-PROCESS-1 och AD-HANDLINGSTYP-1 |
| Kunskap om P360/Janus (statusar, API) | Krävs för integrationsplanen. Det finns inget API-underlag i materialet |


## Decisions Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|-------------------------|
| Indata: metadata (JSON) och riktiga filer | Filreglerna ska kunna testas på riktigt | Bara JSON, där filregler simuleras. Live-koppling mot P360 (utanför scope) |
| Föreslå alla rättningar, men auto-rätta bara säkra fel. Aldrig datum, diarienummer eller skyddskod | Balans mellan tidsbesparing och rättssäkerhet. AI:n fattar inte juridiska beslut | Bara förslag. Auto-rättning vid hög konfidens |
| Moln-LLM utan krav på datalagring | Prototypen använder syntetiska data | Pluggbar leverantör med EU-krav. Lokal modell |
| Fyra statusar och allvarlighetsgrad, med OSL 5:2 högst | Skiljer tydliga fel (handläggaren) från bedömningsfrågor (registratorn) | Godkänd/flaggad. Tre nivåer |
| Webbgränssnitt för registrator och handläggare | Visar hela flödet, inklusive återsändning | Bara registrator. Bara API eller rapport |
| Checklistans 29 regler som data | Komplett och förvaltningsbart regelverk | Bara de 22 reglerna i testdata. Checklistan plus extra regler |
| Framgång mäts som 20/20 testfall med förklaring. Rimliga extra fynd tillåts | Mätbart mot befintlig testdata | Exakt matchning. Demodrivet |
| Trigger vid färdigmarkering | Matchar steg S02 i business case och ger inga extra manuella steg | På begäran. Både vid färdigmarkering och vid avslut |
| Godkänd blir Registrerat automatiskt, med stickprov | 100 % granskning och ledtid nära 0 | Registratorn bekräftar. Konfigurerbart per ärendetyp |
| Varje fynd förklaras med regel, metod, evidens och konfidens | Lösningen ska inte vara en svart låda | Bara regel och förklaring |
| Återkoppling till handläggaren bara i appen | Enkelt i prototypen | E-post. Kommentar i P360 |
| Referensorganisation: Statskontoret (antagande) | Testdata och skärmdumpar använder Statskontoret | ESV, som business case avser |
