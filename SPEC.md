# SPEC.md — Kravspecifikation

Kraven nedan är hämtade uteslutande ur källdokumenten (inte ur den
befintliga implementationen), så att en avstämning mot appen är en
meningsfull gap-analys snarare än cirkulär. Källor:

- `problem.md` — Statskontorets uppdragsbeskrivning ("PROBLEM")
- `casedetails/Business case ESV_Registratur_251117_a (1).docx` — nulägesanalys, Steg 1/2/3, mätbara mål ("CASE")
- `casedetails/Checklista för kvalitetskontroller i Janus (Public 360).DOCX` — regelverket ("CHECKLIST")
- `casedetails/Ang regelverk.docx` och `casedetails/OSL 5 kap. 2 § UTDRAG.docx` — lagkrav bakom checklistan ("OSL")

Prioritet enligt MoSCoW: **Must** (uttryckligt krav i källan), **Should**
(starkt underförstått eller "bör"-formulerat), **Could** (nämnt som
önskvärt/möjligt), **Won't** (uttryckligen utanför scope för denna
prototyp). Varje krav får ett `Status`-fält (Uppfyllt / Delvis / Gap /
Ej tillämpligt) som fylls i under avstämningen mot appen — se
`CHECK.md` (skapas i nästa steg).

---

## A. Funktionella krav — regelkatalogen

Källa: CHECKLIST. Varje kontroll nedan är ett krav på **vad systemet ska
kunna upptäcka**, oavsett hur (regelmotor, AI-bedömning eller mänsklig
insats).

### Ärende

| ID | Krav | Prio |
|---|---|---|
| FUNC-1 | Ärendets titel ska tydligt beskriva vad ärendet rör. | Must |
| FUNC-2 | Ärendets titel får inte innehålla outskrivna förkortningar. | Must |
| FUNC-3 | Ärendets titel ska vara på svenska (engelska tillåts endast om ingen svensk motsvarighet finns). | Must |
| FUNC-4 | Personnamn får inte förekomma i ärendets titel. | Must |
| FUNC-5 | Vald process ska stämma överens med vad ärendet rör och följa Statskontorets klassificeringsstruktur. | Must |
| FUNC-6 | Finns en motpart/kontakt ska den anges på ärendet. | Should |
| FUNC-7 | Kontakten ska finnas registrerad i Janus kontaktregister; annars ska en beställning hos registraturen identifieras. | Must |
| FUNC-8 | En mejladress är inte en giltig kontakt. | Must |
| FUNC-9 | Namnet på en enskild tjänsteperson är inte en giltig kontakt. | Must |

### Ärendedokument

| ID | Krav | Prio |
|---|---|---|
| FUNC-10 | Ärendedokumentets titel ska tydligt beskriva vad de inkomna/upprättade handlingarna rör. | Must |
| FUNC-11 | Ärendedokumentets titel får inte innehålla outskrivna förkortningar. | Must |
| FUNC-12 | Ärendedokumentets titel ska vara på svenska (engelska tillåts endast om ingen svensk motsvarighet finns). | Must |
| FUNC-13 | Personnamn får inte förekomma i ärendedokumentets titel. | Must |
| FUNC-14 | Finns en avsändare eller mottagare ska det anges på ärendedokumentet. | Should |
| FUNC-15 | Kontakten ska finnas registrerad i Janus kontaktregister; annars beställning hos registraturen. | Must |
| FUNC-16 | En mejladress är inte en giltig kontakt. | Must |
| FUNC-17 | Namnet på en enskild tjänsteperson är inte en giltig kontakt. | Must |
| FUNC-18 | Fältet för kontakter ska vara rensat på "kopia till". | Must |
| FUNC-19 | Datum på ärendedokumentet ska stämma överens med när handlingen inkom, expedierades eller beslutades. | Must |
| FUNC-20 | Handlingstypen ska, så gott det går, stämma överens med vad som faktiskt är diariefört. | Must |
| FUNC-21 | Riktningen (dokumentkategori) ska stämma överens med om handlingen är inkommen, utgående eller intern — handlingar med olika riktning får inte blandas i samma ärendedokument. | Must |
| FUNC-22 | Om sekretess inte längre föreligger när ärendet avslutas ska sekretessmarkeringen plockas bort. | Must |
| FUNC-23 | Det elektroniska beslutsfattandet ska ha hanterats enligt rutin (Elektroniskt beslutsfattande). | Must |

### Fil

| ID | Krav | Prio |
|---|---|---|
| FUNC-24 | Antalet filer ska stämma överens med vad som expedierats eller inkommit. | Must |
| FUNC-25 | Mejlmissiv eller liknande ska diarieföras separat. | Must |
| FUNC-26 | Zip-filer måste packas upp. | Must |
| FUNC-27 | Filerna ska vara läsbara (gå att öppna, inte skadade). | Must |
| FUNC-28 | Filerna ska vara korrekt inskannade (dubbelsidig handling får inte vara enkelsidigt inskannad). | Must |
| FUNC-29 | Det ska vara den undertecknade (upprättade) handlingen som är inskannad. | Must |

### OSL-grund (varför FUNC-19 m.fl. finns)

| ID | Krav | Prio |
|---|---|---|
| FUNC-30 | Registret ska (för registrerade handlingar) innehålla: datum då handlingen kom in eller upprättades; diarienummer; avsändare/mottagare i förekommande fall; kortfattat vad handlingen rör. | Must |

---

## B. Spårbarhet / förklarbarhet

Källa: PROBLEM ("AI får inte bli en svart låda... spårbar, förklarbar och
säker"), CASE (transparens-målet: "Ökad kvalité och transparens av hur
mycket fel som begås").

| ID | Krav | Prio |
|---|---|---|
| TRACE-1 | Systemet ska kunna identifiera fel, avvikelser och saknad information i en handling. | Must |
| TRACE-2 | Systemet ska granska och kvalitetssäkra handlingens metadata. | Must |
| TRACE-3 | Systemet ska förklara **varför** något har flaggats eller ändrats. | Must |
| TRACE-4 | Systemet ska dokumentera **vilka kontroller som har genomförts** — inte bara de som gav en flagga. | Must |
| TRACE-5 | Systemet får inte fatta eller tillämpa ändringar utan insyn (ingen "svart låda"). | Must |
| TRACE-6 | Bedömningar ska vara möjliga att härleda till underlag i handlingen/metadatan (citerat textutdrag e.dyl.), inte bara en slutsats. | Should |
| TRACE-7 | Lösningen ska vara "säker" i den bemärkelse uppdraget avser (se även SEC-kategorin). | Must |

---

## C. Människa-i-loopen / föreslå eller genomföra rättningar

Källa: PROBLEM ("Föreslå eller genomföra rättningar", "Markera ärenden
som kräver mänsklig bedömning"), CASE (Steg 1/2/3-definitionerna och
Nyttoanalys kvalitétsökning-tabellen).

| ID | Krav | Prio |
|---|---|---|
| HITL-1 | Systemet ska kunna föreslå rättningar av fel i en handling. | Must |
| HITL-2 | Systemet ska (i ett mer avancerat läge) kunna genomföra rättningar automatiskt. | Should |
| HITL-3 | Systemet ska markera ärenden som kräver mänsklig bedömning. | Must |
| HITL-4 | 100 % av ärendena ska kvalitetsgranskas (mot ca 20 % manuellt i nuläget). | Must |
| HITL-5 | I det automatiserade läget ska ca 5 % av dokumentkorten kräva mänsklig rättning (resten hanteras automatiskt) — Steg 2/3-målet. | Should |
| HITL-6 | Handläggaren ska kunna fokusera på de handlingar som verkligen kräver mänsklig bedömning (dvs. lågriskärenden ska inte belasta människor i onödan). | Should |
| HITL-7 | Lösningen ska definiera ett regelverk för hur avvikelser/abnormaliteter hanteras (vad flaggas, vad rättas, vad eskaleras). | Must |

---

## D. Säkerhet / sekretesshantering

Källa: PROBLEM ("säker"), OSL (registreringsplikt, sekretessmarkering),
CHECKLIST (FUNC-22).

| ID | Krav | Prio |
|---|---|---|
| SEC-1 | Handlingar med sekretess ska alltid registreras (inte hoppas över för att de är känsliga). | Must |
| SEC-2 | Sekretessmarkering ska tas bort när skälet för sekretess inte längre föreligger (se FUNC-22). | Must |
| SEC-3 | Lösningen ska vara "säker" — rimligen tolkat som: sekretessbelagt/känsligt innehåll hanteras varsamt, inte okontrollerat exponeras (t.ex. till en extern tjänst). | Should |
| SEC-4 | Handlingar ska registreras utan dröjsmål (samma dag, högst 24 timmar). | Won't *(processtidskrav för registraturens arbetssätt, inte något AI-kvalitetskontrollen självt kan påverka eller mäta — utanför denna prototyps scope.)* |

---

## Integration & drift (nämnt i CASE, ej egen kravkategori men värt att spåra)

| ID | Krav | Prio |
|---|---|---|
| INT-1 | Lösningen ska kunna integreras i det befintliga diarieflödet utan att skapa onödiga manuella arbetsmoment. | Should |
| INT-2 | Resultatet ska vara en fungerande prototyp (POC), som underlag för beslut om bredare implementering. | Must |

---

## Hur avstämning görs

Varje krav ovan checkas mot den faktiska appen och får:

- **Uppfyllt** — kravet är implementerat och verifierbart (ange var: fil/regel/endpoint).
- **Delvis** — implementerat men med en tydlig begränsning (ange vilken).
- **Gap** — inte implementerat.
- **Ej tillämpligt** — medvetet utanför scope för denna prototyp (t.ex. SEC-4).

Detta görs i ett separat dokument/pass (nästa steg) snarare än att fyllas
i här, så att SPEC.md förblir en ren kravlista oberoende av
implementationen.
