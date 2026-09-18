# CHECK.md — Avstämning: appen mot SPEC.md

Avstämning gjord genom kodgranskning (varje regel/fil namngiven) och
live-verifiering mot den körande appen (testsvit, curl mot API:t,
omstart för persistenstest) under samma session som byggde
funktionaliteten. 50 krav totalt.

**Sammanfattning:** 34 Uppfyllt · 11 Delvis · 3 Gap · 2 Ej tillämpligt.

## Viktigt observerat fynd: modellvarians

Under avstämningen kördes `tests/test_engine.py` två gånger mot skarp
Claude Sonnet 5 med identisk kod. Resultatet skilde sig:

| Körning | Status-träff | Regel-ID-träff | Anmärkning |
|---|---|---|---|
| 1 | 20/20 | 9/20 | TC-12, TC-14 föll tillbaka till heuristik (API returnerade ofullständig JSON) |
| 2 | 19/20 | 7/20 | TC-02 flaggades felaktigt (falsk positiv), TC-20 föll tillbaka till heuristik |

Ingen kodändring låg mellan körningarna — detta är modellens egen
variation (adaptive thinking, ingen temperatur=0/seed tillgänglig i den
använda API-ytan), inte en regression i regelmotorn. Det påverkar dock
direkt hur mycket man kan lita på en enskild bedömning, så det vägs in
nedan mot TRACE-5, TRACE-6 och HITL-3/4.

---

## A. Funktionella krav — regelkatalogen

| ID | Status | Motivering |
|---|---|---|
| FUNC-1 | Uppfyllt | `AR-TITEL-1`, `app/rules/heuristics.py:_h_titel_clarity` + Claude-bedömning |
| FUNC-2 | Uppfyllt | `AR-TITEL-2`, dessutom auto-rättningsbar (`AUTOFIX_WHITELIST`) |
| FUNC-3 | Uppfyllt | `AR-TITEL-3` |
| FUNC-4 | Uppfyllt | `AR-TITEL-4` |
| FUNC-5 | **Delvis** | `AR-PROCESS-1` finns, men heuristik-fallbacken är en smal nyckelordsregel (endast HR-rekrytering vs. övrigt, `_HR_KEYWORDS` i `heuristics.py`) eftersom Statskontorets fulla klassificeringsstruktur inte finns tillgänglig i prototypen. Med skarp Claude missade den TC-19 i en av två körningar (se modellvarians ovan). |
| FUNC-6 | **Gap** | Checklistan kräver att ett fält *fylls i om en motpart finns*, inte bara att ett ifyllt fält är giltigt. Ingen regel upptäcker "kontakt saknas men borde funnits" — `AR-KONTAKT-2/3/4` kör bara när fältet redan har ett värde (se `contacts.classify_contact` → `"empty"` → alla tre regler passerar tyst). |
| FUNC-7 | Uppfyllt | `AR-KONTAKT-2` mot `kontaktregister.json` |
| FUNC-8 | Uppfyllt | `AR-KONTAKT-3`, deterministisk e-postregex |
| FUNC-9 | Uppfyllt | `AR-KONTAKT-4` |
| FUNC-10 | Uppfyllt | `AD-TITEL-1` |
| FUNC-11 | Uppfyllt | `AD-TITEL-2`, auto-rättningsbar |
| FUNC-12 | Uppfyllt | `AD-TITEL-3` |
| FUNC-13 | Uppfyllt | `AD-TITEL-4` |
| FUNC-14 | **Gap** | Samma begränsning som FUNC-6 men för ärendedokumentet — `AD-KONTAKT-2/3/4` körs bara när avsändare/mottagare redan är ifyllt. |
| FUNC-15 | Uppfyllt | `AD-KONTAKT-2` |
| FUNC-16 | Uppfyllt | `AD-KONTAKT-3` |
| FUNC-17 | Uppfyllt | `AD-KONTAKT-4` |
| FUNC-18 | Uppfyllt | `AD-KONTAKT-5`, deterministisk, auto-rättningsbar (rensar fältet) |
| FUNC-19 | **Delvis** | `AD-DATUM-1` kräver ett explicit dateringsuttryck i texten ("daterat"/"poststämplat") för att kunna jämföra — datum som uttrycks på andra sätt ("expedierades den...", "beslutades vid mötet...") upptäcks inte. Skarp Claude visade dessutom falska positiver på flera ärenden (TC-09, TC-10, TC-12, TC-14, TC-17) i en körning. |
| FUNC-20 | **Delvis** | `AD-HANDLINGSTYP-1`s heuristik-fallback känner bara igen "beslut" som handlingstyp-signal — remisser, hyresavtal, avgiftssamråd m.fl. har ingen motsvarande innehålls-vs-typ-kontroll. Skarp Claude visade också instabilitet mellan körningar (extra flaggor på TC-02, TC-06, TC-15, TC-16, TC-18 i en körning). |
| FUNC-21 | **Delvis** | `AD-KATEGORI-1` upptäcker bara det specifika fallet "inkommet + utgående i samma dokument" via nyckelord (`_INBOUND_MARKERS`/`_OUTBOUND_MARKERS`); kontrollerar inte generellt att `dokumentkategori`-fältet matchar innehållets riktning i andra avseenden. |
| FUNC-22 | Uppfyllt | `AD-SEKRETESS-1`, deterministisk (`skyddskod == Sekretess` + `arende.status == Avslutat`) |
| FUNC-23 | **Delvis** | `AD-GODKANNANDE-1` litar helt på ett explicit `godkannandeflode_status`-fält i indata — kontrollerar inte en faktisk signerings-/arbetsflödeshistorik. I en verklig P360-integration måste det fältet härledas ur systemets egna data, inte antas finnas. |
| FUNC-24 | **Delvis** | `FIL-ANTAL-1` täcker bara scenariot "ouppackad zip + `antal_bilagor` > 0"; en generell avstämning mellan `antal_bilagor` och faktiskt registrerade filer utanför zip-fallet saknas (medvetet, för att undvika falska positiver — se `casedetails`-anteckning i `deterministic.py`, men det är fortfarande en begränsning av täckningen). |
| FUNC-25 | Uppfyllt | `FIL-MISSIV-1` |
| FUNC-26 | Uppfyllt | `FIL-ZIP-1` |
| FUNC-27 | Uppfyllt | `FIL-LASBAR-1` |
| FUNC-28 | Uppfyllt | `FIL-SKANN-1` |
| FUNC-29 | Uppfyllt | `FIL-UNDERTECKNAD-1` |
| FUNC-30 | Uppfyllt (indirekt) | Datum/motpart/vad-det-rör täcks av FUNC-1/7/10/15/19 tillsammans. Diarienummer valideras dock aldrig explicit (ingen regel läser `arende.diarienummer`) — i denna prototyp tilldelas det av `store.next_id()`, så det kan inte saknas i praktiken, men det finns ingen regel som skulle upptäcka det om datakällan bytte till en verklig P360-integration. |

## B. Spårbarhet / förklarbarhet

| ID | Status | Motivering |
|---|---|---|
| TRACE-1 | Uppfyllt | Hela regelkatalogen (`app/rules/engine.py:run`) |
| TRACE-2 | Uppfyllt | Metadatafälten är precis vad regelkatalogen kontrollerar |
| TRACE-3 | Uppfyllt | Varje `CheckResult.reasoning` + varje `ProposedFix.reasoning` + audit-loggens `summary` |
| TRACE-4 | Uppfyllt | `engine.run()` returnerar **alla** kontrollresultat, godkända som flaggade — visas i sin helhet i `case.html`s granskningslogg, inte bara flaggorna |
| TRACE-5 | **Delvis** | Arkitekturen är designad för att aldrig dölja en bedömningskälla (`engine`-taggen: `claude-api`/`heuristic-fallback`/`redacted-not-evaluated`, synlig som badge i UI). Men modellvariansen ovan är i sig en spårbarhets-brist: samma ärende kan ge olika resultat vid olika körningar utan att UI:t varnar för det — det finns ingen indikation av att en bedömning kan vara instabil. |
| TRACE-6 | Uppfyllt | `CheckResult.evidence` på i princip alla regler, citerat textutdrag visas i UI |
| TRACE-7 | Delvis | Se SEC-kategorin — den tekniska säkerheten (sekretesskydd) är uppfylld; den *tillförlitlighet* som "säker" rimligen också innefattar dras ner av modellvariansen (se TRACE-5). |

## C. Människa-i-loopen / föreslå eller genomföra rättningar

| ID | Status | Motivering |
|---|---|---|
| HITL-1 | Uppfyllt | `autofix.propose_fixes()`, visas som "Föreslagna rättningar" i UI |
| HITL-2 | **Delvis** | Fungerar men avsiktligt smalt: bara `AD-KONTAKT-5`, `AD-TITEL-2`, `AR-TITEL-2` är auto-rättningsbara (`AUTOFIX_WHITELIST`) — se avvägningen mot HITL-5 nedan. |
| HITL-3 | Uppfyllt | "Markera som granskad"-flöde + `POLICY-SEKRETESS-MANUELL` tvingar alltid mänsklig slutgranskning av sekretessärenden |
| HITL-4 | Uppfyllt | `engine.run()` körs på **alla** ärenden i kön (`GET /api/cases`), inte ett stickprov |
| HITL-5 | **Gap** | Ingen mätning finns av hur stor andel ärenden som faktiskt kräver mänsklig rättning, och den *avsiktligt* konservativa whitelisten (2 av 26 regeltyper) innebär i praktiken en betydligt högre andel än business casens ~5 %-mål. Det är en medveten säkerhetsavvägning (se `autofix.py`s dokumenterade policy), men den uppfyller inte kvantitetsmålet som det står i business caset. |
| HITL-6 | **Delvis** | UI:t visar bara flaggade ärenden som behöver uppmärksamhet (godkända ärenden har 0 findings), men det finns ingen roll-uppdelad vy eller prioritering/arbetskö specifikt för handläggare — bara en generell registrator-kö. |
| HITL-7 | Uppfyllt | `app/rule_catalog.py` + `AUTOFIX_WHITELIST` + `CONTRIBUTING.md` utgör ett explicit, dokumenterat regelverk för vad som flaggas/rättas/eskaleras |

## D. Säkerhet / sekretesshantering

| ID | Status | Motivering |
|---|---|---|
| SEC-1 | Ej tillämpligt | Gäller registraturens arbetsprocess (måste registrera även känsliga handlingar) — utanför vad ett AI-kvalitetskontrollverktyg på redan registrerade ärenden kan påverka |
| SEC-2 | Uppfyllt | Se FUNC-22 |
| SEC-3 | Uppfyllt | `redaction.redact_for_llm()` + hårt kortslut i `judgment.evaluate_case()` — verifierat live i denna session: ett sekretessärende (TC-13) returnerar `redacted-not-evaluated` på samtliga 14 regler utan att något anrop görs |
| SEC-4 | Ej tillämpligt | Explicit utanför scope (processtidskrav, inte en AI-kvalitetskontrollfråga) — se SPEC.md |

## Integration & drift

| ID | Status | Motivering |
|---|---|---|
| INT-1 | **Delvis** | Arkitekturen är förberedd för integration (`store.py`s docstring pekar ut exakt bytpunkten mot ett P360-API), men ingen verklig integration finns — datakällan är `testcases.json`/ett lokalt JSON-snapshot, inte Janus/P360. |
| INT-2 | Uppfyllt | Körbar prototyp med UI, verifierad end-to-end i denna session (kö, ärendedetalj, auto-rättning, granskning, Steg 3-generering, omstart-persistens) |

---

## Prioriterade gap (Must-krav som inte är Uppfyllt)

1. **FUNC-6 / FUNC-14** (Gap, Must) — "kontakt saknas fast den borde finnas" upptäcks aldrig. Kräver antingen en heuristik som gissar om en motpart borde funnits utifrån innehållet, eller en enklare regel som flaggar när `dokumentkategori` är Inkommande/Utgående men avsändare/mottagare är tomt.
2. **HITL-7 uppfylld, men HITL-5 (Should) är ett gap** — inte Must, men värt att åtgärda: lägg till ett litet mät-steg (t.ex. i `tests/test_engine.py`) som räknar andelen findings inom `AUTOFIX_WHITELIST` vs. utanför, så påståendet blir verifierbart i stället för antaget.
3. **TRACE-5 (Must, Delvis)** — modellvariansen. Enklaste åtgärden utan att byta modell: sätt en låg/fast `effort`-nivå och överväg att köra samma bedömning två gånger och flagga instabila resultat för människa, snarare än att lita på ett enda anrop.

Övriga Delvis-poster (FUNC-19/20/21/23/24, AR-PROCESS-1 under FUNC-5) är
medvetna, dokumenterade avgränsningar av heuristik-fallbackens räckvidd
(se README.md "Facit-avstämning" och "Kända begränsningar") snarare än
förbisedda krav — men de bör inte läsas som fullt uppfyllda bara för att
en regel med samma namn existerar.
