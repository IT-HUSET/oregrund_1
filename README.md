# AI-kvalitetskontroll för diarieföring (Statskontoret / Janus-P360)

Prototyp byggd mot Statskontorets hackathon-case: använd AI för att
kvalitetssäkra ärendedokument i diarieflödet, utan att AI:n blir en svart
låda. Se `problem.md` för uppdraget och `casedetails/` för underlaget —
särskilt `Business case ESV_Registratur_251117_a (1).docx` (nulägesanalys +
tre steg mot ett AI-stött läge, med ROI) och
`Checklista för kvalitetskontroller i Janus (Public 360).DOCX` (regelverket
som implementeras här), operationaliserat i `casedetails/testcases.json`.
Se `CONTRIBUTING.md` för hur man lägger till en ny regel.

## Köra prototypen

Backend/frontend är annars stdlib + statisk HTML/CSS/vanilla JS (inget
npm) — den enda riktiga dependencyn är `anthropic`-paketet för
AI-bedömningen:

```
py -3 -m pip install -r requirements.txt
```

Sätt din Anthropic-API-nyckel i en `.env`-fil i projektroten (gitignorad,
skapas aldrig av git add -A):

```
ANTHROPIC_API_KEY=sk-ant-...
```

Starta sedan servern:

```
py -3 run.py
```

Öppna `http://127.0.0.1:8000`. Utan en giltig nyckel (eller om ett
API-anrop misslyckas) faller appen automatiskt tillbaka till en
heuristisk bedömning — se "AI-bedömningen" nedan.

Kör testsviten (jämför regelmotorn mot alla 20 exempelärenden):

```
py -3 -m tests.test_engine
```

## Vad prototypen gör (kopplat till business casens tre steg)

- **Steg 1 — flagga & förklara**: varje ärende kontrolleras mot *hela*
  regelkatalogen (inte bara de regler som råkar slå till). Varje kontroll
  loggas — godkänd eller ej — med anledning och underlag. Det är detta som
  gör "dokumentera vilka kontroller som har genomförts" konkret i stället
  för en floskel: se granskningsloggen på ett ärendes detaljsida.
- **Steg 2 — auto-rätta**: en liten, explicit whitelist av regeltyper
  (`AD-KONTAKT-5`, `AD-TITEL-2`, `AR-TITEL-2`) kan rättas automatiskt.
  Allt som rör sekretess, kontaktidentitet/registrering, datum eller
  handlingstyp går alltid till en människa. Att en regeltyp är whitelistad
  betyder bara att den *får försöka* — kan ingen säker rättning tas fram
  (t.ex. en okänd förkortning) flaggas den för människa i stället för att
  gissa. Varje utfall loggas.
- **Steg 3 — generera**: `POST /api/cases/generate` tar bara emot text
  (simulerar extraherat filinnehåll) och föreslår ett fullständigt
  ärendedokument. Det genererade kortet körs omedelbart genom exakt samma
  kontroll- och rättningspipeline som alla andra ärenden — Steg 3 kringgår
  aldrig Steg 1/2, det matar dem.

## Arkitektur

```
app/
  models.py         Ärende, Ärendedokument, Fil, Case, CheckResult, CaseReport
  config.py          läser .env, exponerar ANTHROPIC_API_KEY / JUDGMENT_MODEL / LOG_LEVEL / STATE_PATH
  rule_catalog.py     enda källan för de 14 judgment-reglerna (id, nivå, beskrivning)
  llm_client.py       det riktiga Claude API-anropet (ett buntat anrop per ärende)
  rules/
    contacts.py      delad klassificering: e-post / person / organisation
    deterministic.py  fältjämförelser (registerslagning, datum, filstatus, …)
    heuristics.py      heuristisk fallback för de 14 judgment-reglerna (rena funktioner)
    judgment.py         AI-bedömning: orkestrerar Claude API + fallback + cache
    engine.py         kör hela katalogen, bygger CaseReport
  redaction.py       maskerar fritext innan sekretessärenden når judgment.py
  autofix.py         Steg 2: whitelist, förslag, tillämpning, granskningslogg
  generate.py        Steg 3: text -> förslag -> full pipeline
  audit.py           logg per ärende (vem/vad/när/varför) + persistens
  store.py           ärendedatabas (in-memory + JSON-snapshot persistens)
  server.py          stdlib HTTP-API (route-tabell + centraliserad felhantering) + statiska filer
  static/            index.html (kö), case.html (detalj/logg), app.js, style.css
tests/test_engine.py  facit-kontroll mot testcases.json
requirements.txt      pinnad `anthropic`-version
CONTRIBUTING.md        hur man lägger till en ny regel
```

## AI-bedömningen

De 14 "judgment"-reglerna (titlar, kontakttyp, datum, handlingstyp,
kategori, process) bedöms av **Claude Sonnet 5** i ett enda buntat
API-anrop per ärende — inte 14 separata anrop. `llm_client.judge_case()`
skickar ärendets fält i en systeminstruktion som beskriver varje regel,
och tvingar strukturerat JSON-svar via ett "strict" tool-anrop
(`tool_choice` forcerat mot ett schema med exakt de 14 regel-id:na), så
svaret alltid går att lita på utan att parsa fritext.

- **Cache**: `judgment.evaluate_case()` cachar resultatet per ärendes
  faktiska innehåll (in-memory, processens livstid) — annars skulle bara
  det att öppna ärendekön (som kör hela regelkatalogen på nytt vid varje
  GET) trigga ett nytt API-anrop per ärende varje gång sidan laddas.
- **Fallback, men synligt**: om ingen nyckel är satt eller anropet
  misslyckas (nätverk, rate limit, ogiltigt svar) faller
  `evaluate_case()` tillbaka till en heuristisk implementation
  (mönstermatchning mot checklistans ordval och de 20 exempelärendena).
  Varje `CheckResult` taggas med `engine`
  (`claude-api` / `heuristic-fallback` / `redacted-not-evaluated`), synligt
  som en badge i granskningsloggen i UI:t — så det aldrig är dolt att ett
  resultat kom från reservlösningen i stället för en riktig modellbedömning.
- **Sekretess går aldrig till nätet**: `evaluate_case()` kortsluter helt
  innan något API-anrop görs om ärendet är redigerat/maskerat (se
  Sekretess-skydd nedan) — varken det riktiga eller det heuristiska
  spåret körs, ärendet taggas direkt `redacted-not-evaluated`.
- **Modellval**: `JUDGMENT_MODEL` i `.env` (default `claude-sonnet-5`).
- **Prompt caching**: systeminstruktionen (identisk mellan alla anrop,
  bara ärendedatan i användarmeddelandet varierar) skickas med
  `cache_control: {"type": "ephemeral"}`, verifierat att ge
  `cache_read_input_tokens > 0` från och med det andra anropet i en
  session.
- **Parallellisering**: `GET /api/cases` (ärendekön) körde ursprungligen
  hela regelkatalogen — inklusive ett live API-anrop — sekventiellt för
  alla 20 ärenden, vilket tog över två minuter första gången sidan
  laddades. `server.py` kör nu de 20 anropen samtidigt via en liten
  `ThreadPoolExecutor` (~33s kallstart, ~35ms varmstart tack vare cachen
  i `judgment.py`).

## Persistens

Ärendedatabasen och granskningsloggen (`app/store.py`, `app/audit.py`) är
annars in-memory och skulle tappa alla auto-rättningar, genererade ärenden
och granskningsbeslut vid en omstart. `store.save_snapshot()` skriver ett
JSON-snapshot till `app/data/state.json` (gitignorad) efter varje
muterande anrop (`/autofix`, `/review`, `/generate` i `server.py` — inte
inifrån `autofix.py`/`generate.py` själva, så att `tests/test_engine.py`
aldrig skriver ett snapshot som bieffekt). Vid start läser `store.py`
snapshotten om den finns, annars faller den tillbaka till
`testcases.json` precis som tidigare. Radera `app/data/state.json` för
att återgå till exempeldatan.

## Sekretess-skydd

`redaction.redact_for_llm(case)` maskerar titlar och dokumenttext innan
`judgment.py` någonsin ser dem, för ärendedokument med skyddskod
"Sekretess" — ett verkligt skydd i pipelinen, inte bara en dokumenterad
avsikt. Kontrollresultat som därför inte kunnat utvärderas rapporteras
ärligt som just det ("kunde inte utföras automatiskt"), i stället för att
tystas ner som godkända. Utöver detta lägger `engine.py` alltid till en
policy-markering (`POLICY-SEKRETESS-MANUELL`) på sekretessmarkerade
ärenden: de kan aldrig auto-godkännas enbart för att den maskerade texten
inte gav några träffar — de kräver alltid en mänsklig slutgranskning. Se
`TC-13` och `TC-19` i granskningskön för exempel.

## Facit-avstämning mot testcases.json

`py -3 -m tests.test_engine` ger olika siffror beroende på om
`ANTHROPIC_API_KEY` är satt, eftersom den kör den verkliga
regelmotorn/pipelinen — inte ett separat testläge:

- **Utan API-nyckel (heuristisk fallback för alla 14 judgment-regler):**
  **20/20** ärenden får rätt övergripande status (godkänd/flaggad),
  **17/20** matchar exakt vilka regel-ID:n som slår till.
- **Med riktig Claude Sonnet 5:** fortfarande **20/20** rätt övergripande
  status, men bara **9/20** exakt regel-ID-matchning — inte för att modellen
  har fel, utan för att den genomgående är en *strängare* granskare än både
  heuristiken och det handskrivna facit i testcases.json. Den flaggar
  legitima saker heuristiken missar (t.ex. AD-HANDLINGSTYP-1 på fler
  ärenden, AD-TITEL-1 på oklara titlar heuristiken godkände). Detta var
  förväntat: den mockade heuristiken var uttryckligen en tillfällig
  lösning tills en riktig modell fanns tillgänglig (se "AI-bedömningen"
  ovan) — att den nu hittar *fler* rimliga problem än det handskrivna
  facit är precis den kvalitetsförbättring Steg 1 i business casen
  efterfrågar, inte en regression.
- Under den körningen föll också 2 av 20 ärenden (TC-12, TC-14) tillbaka
  till heuristiken efter ett API-svar med ofullständig JSON — synligt i
  serverloggen (`[warn] Claude API judgment call failed for TC-12, falling
  back to heuristic: ...`) och i UI:t via `engine`-badgen. Ett konkret,
  levande exempel på att fallback-mekanismen fungerar som avsett i stället
  för att tystas ner.

De tre avvikelserna i **heuristikläget** är medvetna och förklaras nedan
snarare än dolda:

- **TC-09, TC-20** (`AR-KONTAKT-2` / `AR-KONTAKT-4` slår till "oväntat"):
  checklistan anger samma kontaktregler för både Ärendets och
  Ärendedokumentets kontaktfält, och testdatan bekräftar detta symmetriskt
  i TC-06 (både `AD-KONTAKT-4` och `AR-KONTAKT-4` förväntas slå till för
  samma person). Motorn tillämpar reglerna konsekvent symmetriskt enligt
  checklistans text; testcases.json flaggar bara AD-nivån i just dessa två
  fall, vilket vi bedömer är en inkonsekvens i det handskrivna facit snarare
  än en avsiktlig regelskillnad.
- **TC-19** (`AR-PROCESS-1` uteblir): ärendet är sekretessmarkerat, så
  titlarna som processmatchningen bygger på maskeras av sekretesskyddet
  ovan innan bedömningen körs. Ärendet flaggas ändå korrekt (status
  `flaggad`) via `POLICY-SEKRETESS-MANUELL` och `AD-SEKRETESS-1` — ingen
  risk uppstår, men just detta regel-ID uteblir. Ett tydligt exempel på att
  säkerhetsskyddet ibland kostar en specifik (men inte den övergripande)
  flaggan.
- **TC-20** (`AR-PROCESS-1` uteblir): vår processheuristik är en smal,
  nyckelordsbaserad regel (HR-rekrytering vs. övrigt) eftersom vi saknar
  Statskontorets fullständiga klassificeringsstruktur. TC-20:s
  processavvikelse är mer generell/holistisk än vad en mockad heuristik kan
  fånga — ärendet flaggas ändå korrekt via fem andra regler.

## Kända begränsningar / vad en produktionslösning skulle behöva

- **Strict-tool-svaret är inte alltid komplett**: `llm_client.judge_case()`
  ber om exakt 14 poster men strict-läget i den här SDK-versionen stödjer
  inte `minItems`/`maxItems` > 1 på arrayer, så ofullständiga svar (se
  TC-12/TC-14 ovan) upptäcks först efter anropet (kontroll att alla
  regel-ID:n finns) och hanteras med fallback snarare än att förhindras i
  förväg. En nyare SDK-version med riktigt `output_config.format`-stöd
  (strukturerade utdata) skulle kunna garantera detta på schema-nivå.
- **Sekretess-hantering i skarpt läge**: redigering/maskering av fritext är
  en förenkling. En verklig lösning behöver antingen suverän/lokal
  modellhosting för sekretessbelagt innehåll, eller en jurist-godkänd
  redigeringsprincip per handlingstyp.
- **Riktig integration mot P360/Janus**: `store.py` seedas i dag från
  `testcases.json`. `load_seed_cases()`/`store.add()` är den enda punkt som
  skulle behöva bytas mot P360:s API — resten av pipelinen är oberoende av
  datakällan.
- **Klassificeringsstruktur**: `AR-PROCESS-1` skulle i produktion slå upp
  mot Statskontorets faktiska klassificeringsstruktur i stället för en
  nyckelordslista.
- **Datumextraktion (`AD-DATUM-1`)**: den enda regeln som är genuint
  textförståelse snarare än mönstermatchning — mest känslig för att bytas
  mot en riktig modell.
