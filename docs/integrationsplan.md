# Integrationsplan: AI-kvalitetskontrollant i Janus/P360

**Story-ID**: S10 · **FR**: FR11 · **Senast uppdaterad**: 2026-09-18

Dokumentet beskriver hur prototypens granskningspipeline (S01–S09) kopplas in i ESV:s befintliga diarieflöde i Janus (P360) utan att lägga till manuella steg. Det beskriver, det implementerar inte: live-integration mot P360 ligger utanför prototypens scope (`prd.md#out-of-scope`).

Prototypen läser i dag in dokument från fil, och trigger och statusbyten simuleras (`prd.md#constraints`). Allt nedan som rör P360 är därför krav och öppna frågor, inte byggd funktionalitet.

**Bindande begränsning genom hela dokumentet:** datum, diarienummer och skyddskod ändras aldrig automatiskt, och sekretessbedömningar går alltid till människa (`prd.md#constraints`). Ingen skrivväg i denna plan bryter mot det.


## 1. Trigger

Granskningen startar när ett ärendedokument får någon av de två statusar som i dag placerar det i huvudregistratorns arbetslista (`prd.md#evidence--context`, Instruktionshandbok registraturen, avsnittet "Kvalitetsgranska ärenden"):

- **Diarieförd av handläggare**
- **Färdig från handläggare/chef**

Det är samma ögonblick som i dag lägger dokumentkortet under rubriken "Dokument redo för registrering", vilket är poängen: granskningen ersätter ett steg som redan finns i stället för att lägga till ett nytt. Handläggaren gör ingenting annorlunda.

En andra trigger behövs för omgranskning: när ett dokument med status Åtgärd krävs har rättats och skickas för ny granskning (FR9), körs samma pipeline igen. Kontrolloggen visar då hela historiken över alla granskningsomgångar (FR7).

Tekniskt kan triggern realiseras på tre sätt, i fallande ordning av önskvärdhet. Vilket som är möjligt är en öppen fråga (avsnitt 5):

1. Händelse eller webhook från P360 vid statusbyte.
2. Pollning av vyn "Dokument redo för registrering" med ett tjänstekonto.
3. Batchkörning på schema, om varken händelse eller läs-API finns.


## 2. Statusmappning mot P360

Granskningen sätter en av fyra granskningsstatusar enligt prioritetsordningen i FR4 (Mänsklig bedömning > Åtgärd krävs > Autokorrigerad > Godkänd). Granskningsstatusen är lösningens egen. Den mappas mot P360:s dokumentstatus så här:

| Granskningsstatus | Dokumentstatus i P360 | Skrivs automatiskt? | Hamnar hos |
|---|---|---|---|
| Godkänd | Registrerat | Ja | Ingen. Syns i stickprov (FR12) |
| Autokorrigerad | Registrerat | Ja, efter att auto-rättningen skrivits | Ingen. Syns i stickprov (FR12) |
| Åtgärd krävs | Oförändrad (kvar som Diarieförd/Färdig) | Nej | Handläggaren (FR9) |
| Mänsklig bedömning | Oförändrad (kvar som Diarieförd/Färdig) | Nej | Registratorn (FR8) |

Regler för skrivvägen:

- **Registrerat sätts automatiskt bara vid Godkänd eller Autokorrigerad**, eller efter ett uttryckligt mänskligt beslut i registratorvyn (FR4, FR8). Ingen annan väg leder till Registrerat.
- **Fältändringar skrivs bara för regler med auto-rättningsflagga**, i dag AD-KONTAKT-5 ("Kopia till" rensas) och FIL-ZIP-1 (zip packas upp). Datum, diarienummer och skyddskod ingår aldrig, oavsett fynd (`prd.md#constraints`, NFR Security).
- **Inget skrivs förrän kontrolloggposten är skriven.** Loggskrivningen är synkron och gate:ar ändringen; misslyckas den avbryts hela operationen, inklusive auto-rättningen (`adr.md#beslut-3-oföränderlig-kontrollogg-append-only`). Mot P360 betyder det: logga först, skriv sedan. Om P360-skrivningen i sin tur misslyckas måste den avvikelsen också loggas, och dokumentet lämnas i sin tidigare status.
- **Status Makulerad och Avslutat rörs inte** av automatiken. De hanteras manuellt enligt handboken, och makuleringskontroller ligger utanför nuvarande regelverk (`prd.md#out-of-scope`).


## 3. Återkoppling till handläggaren

Återkoppling sker **bara i appen**, inte via e-post (`prd.md#out-of-scope`). Ett dokument med status Åtgärd krävs dyker upp direkt i handläggarvyn (FR9, S08) med:

- fynden, var för sig, med regel-ID, regeltext, allvarlighetsgrad, metod, evidens och konfidens för AI-fynd (FR6)
- rättningsförslag där sådana går att ge, som kan tillämpas med ett klick
- redigerbara fält och knappen "Skicka för ny granskning", som kör om granskningen

Samma väg används när registratorn aktivt skickar tillbaka ett dokument. Varje tillämpat förslag och varje manuell ändring loggas (FR7).

I produktion tillkommer frågan om handläggaren ska arbeta i lösningens vy eller i P360. Se avsnitt 5.


## 4. Manuella steg som försvinner och som finns kvar

Nuläget: huvudregistratorn granskar varje dokumentkort under "Dokument redo för registrering" mot checklistans 29 punkter och sätter Registrerat eller begär rättning. I praktiken hinner registraturen ca 20 % av korten (`prd.md#evidence--context`).

**Försvinner**

- Huvudregistratorns manuella genomgång av de dokumentkort som granskningen bedömer som Godkänd eller Autokorrigerad. De registreras automatiskt och syns bara via stickprov (FR12).
- Den manuella jämförelsen mot checklistan punkt för punkt: dokumenttitel, handlingstyp, dokumentkategori, skyddskod, datum, kontakt och filer prövas maskinellt mot alla 29 regler.
- Manuell rensning av "Kopia till" och manuell uppackning av zip-filer, som auto-rättas.
- Den informella kontakten för att tala om vad som är fel: förklaringen finns i handläggarvyn.

**Finns kvar**

- Registratorns bedömning av dokument med status Mänsklig bedömning, inklusive alla H-regler, osäkra AI-fynd och regler med utfallet "ej genomförd".
- **Sekretessbedömning, alltid.** Skyddskoden ändras aldrig automatiskt, och AD-SEKRETESS-1 går alltid till människa (`prd.md#constraints`).
- Handläggarens rättning av dokument med status Åtgärd krävs.
- Stickprovsgranskning av automatiskt registrerade dokument (FR12), som är kontrollen av att automatiken har rätt.
- Allt registraturarbete utanför kvalitetskontrollen: skapa ärenden, posthantering, stänga och makulera ärenden, kontaktregistervård. När ett fynd är "kontakten saknas i registret" är åtgärden fortfarande registraturens (TC-09).

Nettot är att registraturens tid flyttas från rutinkontroll av alla kort till bedömning av de kort som faktiskt kräver en bedömning.


## 5. Vad som måste finnas i P360, och öppna frågor

Det finns **inget API-underlag för P360/Janus i materialet** (`prd.md#dependencies`). Nedan står vad som måste finnas, inte hur det ser ut.

**Krav på P360**

| # | Krav | Varför |
|---|---|---|
| P1 | Händelse, webhook eller läsbar vy när ett dokumentkort får status Diarieförd av handläggare / Färdig från handläggare/chef | Trigger (avsnitt 1) |
| P2 | Läsning av dokumentkortets metadata: diarienummer, titel, handlingstyp, dokumentkategori, skyddskod, datum, kontakter, antal bilagor, process, ärendestatus | Indata till reglerna (FR2) |
| P3 | Läsning av bifogade filer, inklusive filnamn, antal och innehåll | Filreglerna (FIL-*) |
| P4 | Skrivning av dokumentstatus till Registrerat | Godkänd/Autokorrigerad (avsnitt 2) |
| P5 | Skrivning av de fält som har auto-rättningsflagga, i dag "Kopia till" och bifogade filer | Auto-rättning (FR5) |
| P6 | Tjänstekonto med avgränsad behörighet, och spårbarhet för vad det kontot ändrat | Behörigheter (avsnitt 7) |
| P7 | Ett ställe där registrator och handläggare når fynden och loggen, antingen lösningens vy eller ett inbäddat läge i P360 | Arbetsyta (avsnitt 6) |

**Öppna frågor**

| # | Fråga | Blockerar |
|---|---|---|
| Ö1 | Finns händelser/webhooks i P360, eller måste triggern bygga på pollning? | Val av trigger (avsnitt 1) |
| Ö2 | Vilka exakta statusvärden och fältnamn har dokumentkortet i ESV:s P360-installation? | Statusmappning (avsnitt 2) |
| Ö3 | Får ett tjänstekonto skriva status och fält, och hur representeras "ändrad av automatiken" i P360:s egen historik? | P4, P5, P6 |
| Ö4 | Ska registrator och handläggare arbeta i lösningens vy eller i P360? | Arbetsyta (avsnitt 6) |
| Ö5 | **Kontrollogg-retention och arkivering.** Loggen är append-only och växer obegränsat. Hur länge ska poster sparas, var ska de lagras, ska de arkiveras och omfattas de av gallringsbeslut? Frågan är uttryckligen skjuten hit från `adr.md#beslut-3-oföränderlig-kontrollogg-append-only` | Driftsättning (avsnitt 8) |
| Ö6 | Är kontrolloggen en allmän handling, och hur förhåller den sig till P360:s egen loggning? | Ö5, juridisk granskning |
| Ö7 | Vilken AI-tjänst får användas för riktiga, eventuellt sekretessbelagda handlingar? | Avsnitt 9 och hela produktionssättningen |
| Ö8 | Hur hanteras dokument som ändras i P360 mitt under en granskningsomgång? | Dataflöde (avsnitt 9) |
| Ö9 | Vad händer med kort som redan ligger i kön vid driftsättning: granskas de retroaktivt eller bara nya? | Driftsättning (avsnitt 8) |
| Ö10 | Vem förvaltar regelkatalogen i produktion, och hur godkänns en ny version? | Förvaltning efter pilot |

Ingen av dessa frågor har ett antaget svar i prototypen.


## 6. Registratorns arbetsyta

Arbetsytan är registratorvyn som redan är specificerad i FR8 och byggs i S07. Den ska inte uppfinnas på nytt här. Den innehåller:

- en kö som filtreras per status, med **Mänsklig bedömning som standardfilter** – det är den vy som ersätter dagens "Dokument redo för registrering"
- en detaljvy med metadata (Detaljer/Kontakter/Filer), fynden enligt FR6 och kontrolloggen för dokumentet
- åtgärder per fynd: godkänn förslag, avvisa fyndet med obligatorisk motivering, eller skicka till handläggaren
- stickprovsvyn för automatiskt registrerade dokument (FR12, S11)

Att vyn ska ligga i lösningen eller bäddas in i P360 är öppen fråga Ö4. Funktionellt är innehållet detsamma.


## 7. Behörigheter

Prototypen har **ingen inloggning och ingen behörighetskontroll**. Rollen väljs i sidhuvudet (`prd.md#out-of-scope`, FR8). Det duger för en demo och inte för produktion.

Produktion kräver:

- Inloggning mot ESV:s befintliga katalogtjänst, med rollerna Handläggare, Registrator och Huvudregistrator mappade mot P360:s egna roller.
- Att åtgärder begränsas per roll så som FR9 redan kräver funktionellt: handläggaren kan inte ändra diarienummer och kan inte sätta Registrerat.
- Ett avgränsat tjänstekonto för integrationen (P6), med rätt att läsa dokumentkort och att skriva enbart status Registrerat och de auto-rättningsbara fälten. Inte mer.
- Att kontrolloggens roll-fält fylls från den inloggade användaren i stället för från ett rollval i gränssnittet. Loggposten kräver roll, tid och motivering (FR7), och i produktion måste "roll" gå att härleda till en person.
- Att åtkomsten till loggen och till sekretessmarkerade dokument följer samma behörighetsregler som P360, inte lösningens egna.


## 8. Driftsättning

Förslagen ordning:

1. **Skuggläge.** Lösningen läser dokumentkort och granskar, men skriver ingenting till P360. Utfallen jämförs mot vad huvudregistratorn faktiskt gör. Syftet är att mäta träffsäkerhet på riktig data innan någon skrivväg öppnas, och att sätta konfidenströskeln för AI-fynd empiriskt (`prd.md#assumptions`).
2. **Pilot med skrivning, avgränsad mängd.** Skrivvägen öppnas för en avgränsad ärendetyp med hög volym och låg komplexitet. Hyresavtal (~1 000 ärenden/år) är kandidaten. Auto-registrering av Godkänd och Autokorrigerad slås på, och allt annat går till människa som förut.
3. **Utökning** till övriga ärendetyper allteftersom stickprovsresultaten håller.

Förutsättningar oavsett steg:

- Skuggläget kräver att Ö7 (AI-tjänst för riktiga handlingar) är löst, eftersom skuggläget körs på riktiga ärenden.
- Auto-registrering ska gå att slå av per ärendetyp och i sin helhet, utan att granskningen stängs av.
- Kontrolloggens retention (Ö5) måste vara beslutad innan loggen börjar fyllas med riktiga ärenden. Det är svårare att städa i efterhand i en append-only-logg.
- Regelkatalogen är data och versioneras. Varje loggpost bär katalogversionen, så ett historiskt fynd går alltid att härleda till den regeltext som gällde då (`adr.md#beslut-1-regler-som-datadriven-konfiguration`).
- En ogiltig regelkatalog stoppar all granskning tills den rättas. Det är avsiktligt, och det måste finnas en rutin för vem som larmas.


## 9. Dataflöde och datahantering

**Flödet per granskningsomgång**

1. Trigger från P360 (avsnitt 1).
2. Dokumentkortets metadata och bifogade filer läses in (FR2).
3. Deterministiska regler körs först och ger utfall direkt. De slår upp kontakter och klassificering mot referensdata.
4. AI-bedömda regler (metod C/H) anropas mot AI-tjänsten med timeout. Fel, timeout eller svar under konfidenströskeln ger utfallet "ej genomförd" eller ett osäkert fynd, vilket leder till Mänsklig bedömning. Granskningen avbryts aldrig av ett AI-fel (`adr.md#beslut-2-granskningspipeline--deterministiskt--ai--status`).
5. Status sätts enligt FR4, auto-rättning körs enligt FR5, och alla regler körs om exakt en gång mot det uppdaterade dokumentet.
6. Kontrolloggposten skrivs. **Först därefter** skrivs statusen eller fältändringen till P360.

**AI-tjänst och datahantering**

Prototypens antagande är att en moln-LLM får användas utan krav på var data lagras, **eftersom prototypen bara hanterar syntetiska data** (`prd.md#assumptions`, NFR Security: 0 riktiga ärenden skickas till AI-tjänsten).

Det antagandet upphör att gälla i samma stund lösningen ser riktiga handlingar. Produktion kräver ett nytt, uttryckligt beslut om databehandling innan något anrop görs, som minst omfattar:

- var data behandlas och lagras (EU-hostad tjänst, egen hosting eller lokal modell)
- personuppgiftsbiträdesavtal och rättslig grund
- att leverantören inte tränar på inskickat innehåll, och vilken loggning som sker hos leverantören
- hur sekretessbelagda handlingar hanteras: ska de över huvud taget skickas till en AI-tjänst, eller ska dokument med skyddskod gå direkt till Mänsklig bedömning utan AI-anrop
- vilka fält och vilket filinnehåll som skickas, och om innehåll kan begränsas eller maskas

Beslutet är öppen fråga Ö7 och kan inte avgöras i detta dokument. Fram till dess gäller prototypens gräns: bara syntetiska data.

**Skrivningar mot P360** är begränsade till dokumentstatus Registrerat och de auto-rättningsbara fälten. Datum, diarienummer och skyddskod läses men skrivs aldrig av automatiken. Det verifieras i testsviten (NFR Security, S09).


## 10. Mätning mot business case

Nyckeltalen kommer från kvalitetsöversikten (FR13, S12), som i sin tur räknar på kontrolloggen (FR7, S02). Inget av detta kräver separat mätinsamling: loggen har redan en post per statusbyte och per ändring.

| Nyckeltal ur business case | Nuläge | Mål | Mäts som | Källa |
|---|---|---|---|---|
| Andel dokumentkort som granskas | ca 20 % | 100 % | Antal dokument med minst en granskningsomgång i loggen / antal färdigmarkerade dokument | Kontrollogg |
| Andel som kräver mänsklig rättning | 10–30 % (snitt 20 %) innehåller fel | ca 5 % (steg 2) | Andel med status Åtgärd krävs eller Mänsklig bedömning | Kvalitetsöversikt |
| Ledtid från färdigmarkering till Registrerat | ca 5 dagar | mot 0 för Godkänd/Autokorrigerad | Tid mellan trigger-posten och statusbytet till Registrerat i loggen | Kontrollogg |
| Tid per dokumentkort i registraturen | ca 5 min granskning, 10–15 min per rättning | – | Antal kort som når registratorns kö, gånger uppmätt handläggningstid | Kvalitetsöversikt + tidsuppföljning |
| Andel auto-rättade fel | 0 | – | Antal auto-rättningar per regel | Kontrollogg |
| Träffsäkerhet | – | – | Andel stickprovsmarkerade felbedömningar (FR12) | Stickprov |

Två mått som business case inte har men som piloten behöver:

- **Falska fynd**, alltså fynd som registratorn avvisar med motivering. För många falska fynd gör att lösningen kostar tid i stället för att spara den.
- **Missade fel**, alltså fel som hittas i stickprov på automatiskt registrerade dokument. Det är det enda måttet som fångar risken med auto-registrering.

Båda finns redan i loggen: ett avvisat fynd kräver motivering (FR8) och en felbedömning kräver kommentar (FR12).


## 11. Vägen mot pilot: steg 1 till 3

Stegen följer business case (Scenario S02 och S03).

**Steg 1 – Granskning.** Alla dokumentkort granskas automatiskt mot alla 29 regler, med förklarade fynd och logg. Registratorn fattar besluten. Bygger på S01–S09. Detta är vad prototypen visar.

**Steg 2 – Rättning.** Säkra fel rättas automatiskt, resten går som konkreta rättningsförslag till handläggaren, och Godkänd/Autokorrigerad registreras utan manuell hantering. Bygger också på S01–S09, och är det som kräver skrivvägen till P360 (P4, P5) och därmed Ö1–Ö3.

**Steg 3 – AI registrerar.** AI skapar eller fyller i dokumentkort utifrån filer, så att kortet är korrekt från början. **Detta är inte byggt och ingår inte i prototypen** (`prd.md#out-of-scope`). Steget är spärrat tills:

- beslutet om databehandling för riktiga, eventuellt sekretessbelagda handlingar är fattat (Ö7),
- skrivvägen till P360 är verifierad i drift genom steg 2 (Ö1–Ö3),
- stickprovsdata från steg 2 visar att träffsäkerheten håller, och
- ett regelverk för hur avvikelser vid automatiskt skapade kort ska hanteras är definierat.

Steg 3 ska alltså beskrivas som en möjlig fortsättning, inte som något som går att slå på efter piloten.
