/**
 * Acceptansscenarier för S07 (`docs/s07-registratorvy.md`), mot testcases.json:s
 * TC-08/TC-13/TC-15/TC-20. AI-klienten är alltid en stub, så ingen testkörning
 * når ett nätverk (NFR Security).
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { oppnaDokumentlager, type Dokumentlager, type Dokumentpost } from './dokumentlager.ts';
import type { AiKlient, AiVerdikt } from './granskning/ai/klient.ts';
import type { GranskatDokument } from './granskning/kontrakt.ts';
import { granskaOchSpara, type Beroenden } from './granskningstjanst.ts';
import { oppnaKontrollogg, type Kontrollogg, type KontrolloggPost } from './kontrollogg/index.ts';
import { hanteraBeslut } from './registrator.ts';
import {
  arGranskningsstatus,
  delaMetadata,
  filtreraKo,
  GRANSKNINGSSTATUSAR,
  STANDARDSTATUS,
} from './registrator-vy.ts';
import { loadKlassificeringsstruktur, loadKontaktregister } from './reference-data.ts';
import { loadChecklistCatalog } from './rule-catalog.ts';

const katalog = loadChecklistCatalog();
const referensdata = {
  kontaktregister: loadKontaktregister(),
  klassificeringsstruktur: loadKlassificeringsstruktur(),
};

const testcases = JSON.parse(
  readFileSync(new URL('../../casedetails/testcases.json', import.meta.url), 'utf8'),
).cases as (GranskatDokument & { case_id: string })[];

/** Dokumentet som S03 lämnar det: status tvingad till "Färdig". */
function fixtur(caseId: string): GranskatDokument & { id: string } {
  const tc = testcases.find((c) => c.case_id === caseId);
  assert.ok(tc, `${caseId} saknas`);
  const kopia = structuredClone(tc);
  return {
    id: `${caseId}-DOK-1`,
    arende: kopia.arende,
    arendedokument: { ...kopia.arendedokument, status: 'Färdig' },
    fil: kopia.fil,
    dokumenttext: kopia.dokumenttext,
  };
}

const intetFynd: AiVerdikt = { fynd: false, konfidens: 0.95, evidens: '', forklaring: '' };
const tystKlient: AiKlient = { modell: 'stub-modell', bedom: async () => ({ ok: true, verdikt: intetFynd }) };
/** AI-tjänsten är nere: alla AI-regler blir "ej genomförd" (ADR Beslut 2). */
const nedKlient: AiKlient = {
  modell: 'stub-modell',
  bedom: async () => ({ ok: false, fel: 'transport', detalj: 'stub' }),
};
const fyndKlient: AiKlient = {
  modell: 'stub-modell',
  bedom: async () => ({
    ok: true,
    verdikt: { fynd: true, konfidens: 0.9, evidens: 'stub-evidens', forklaring: 'stub-förklaring' },
  }),
};

/** Loggen skriver som vanligt tills `villkor` slår till, då varje skrivning kastar. */
function loggSomFallerNar(logg: Kontrollogg, villkor: (post: KontrolloggPost, antalTidigare: number) => boolean): Kontrollogg {
  let antal = 0;
  return {
    lasForDokument: (id) => logg.lasForDokument(id),
    async laggTill(post) {
      if (villkor(post, antal)) throw new Error('loggen är skrivskyddad (test)');
      antal += 1;
      await logg.laggTill(post);
    },
  };
}

let katalogdir: string;
let lager: Dokumentlager;
let logg: Kontrollogg;
let beroenden: Beroenden;

beforeEach(() => {
  katalogdir = mkdtempSync(join(tmpdir(), 'registrator-'));
  lager = oppnaDokumentlager(join(katalogdir, 'dokument.json'));
  logg = oppnaKontrollogg(join(katalogdir, 'kontrollogg.jsonl'));
  beroenden = { lager, logg, katalog, referensdata, klient: tystKlient };
});

afterEach(() => {
  rmSync(katalogdir, { recursive: true, force: true });
});

function post(id: string): Dokumentpost {
  const funnen = lager.hamta(id);
  assert.ok(funnen, `${id} saknas i lagret`);
  return funnen;
}

const beslutsposter = async (id: string) =>
  (await logg.lasForDokument(id)).flatMap((p) => p.manskligaBeslut);

describe('registratorkö (S07)', () => {
  it('S01/S02 [OC01] [TI01] kön visar Mänsklig bedömning som standard och kan filtreras till andra statusar', async () => {
    // TC-01 → Godkänd, TC-13 → Mänsklig bedömning, TC-15 → Åtgärd krävs (zip packas upp, FIL-ANTAL-1 kvar)
    for (const id of ['TC-01', 'TC-13', 'TC-15']) await granskaOchSpara(fixtur(id), beroenden);
    const alla = lager.alla();

    assert.equal(STANDARDSTATUS, 'Mänsklig bedömning');
    assert.deepEqual(
      filtreraKo(alla, STANDARDSTATUS).map((p) => p.dokument.id),
      ['TC-13-DOK-1'],
    );
    const atgard = filtreraKo(alla, 'Åtgärd krävs');
    assert.ok(atgard.every((p) => p.granskningsstatus === 'Åtgärd krävs'));
    assert.ok(!atgard.some((p) => p.dokument.id === 'TC-13-DOK-1'));
    assert.ok(GRANSKNINGSSTATUSAR.every(arGranskningsstatus));
    assert.equal(arGranskningsstatus('Registrerat'), false);
  });
});

describe('dokumentdetalj (S07)', () => {
  it('S03 [OC02] [TI02,TI03] TC-13: fälten delas i flikar utan att något saknas eller dupliceras, och fyndet har full förklaring', async () => {
    const dokument = fixtur('TC-13');
    await granskaOchSpara(dokument, beroenden);
    const lagrad = post(dokument.id);

    const flikar = delaMetadata(lagrad.dokument);
    const antalFalt =
      Object.keys(dokument.arende).length +
      Object.keys(dokument.arendedokument).length +
      Object.keys(dokument.fil ?? {}).length +
      (dokument.dokumenttext === undefined ? 0 : 1);
    assert.equal(flikar.detaljer.length + flikar.kontakter.length + flikar.filer.length, antalFalt);
    const etiketter = [...flikar.detaljer, ...flikar.kontakter, ...flikar.filer].map(([e]) => e);
    assert.equal(new Set(etiketter).size, etiketter.length, 'inget fält får dupliceras mellan flikarna');
    assert.ok(flikar.kontakter.some(([e]) => e === 'Dokument: Avsandare'));

    const sekretess = lagrad.fynd.find((f) => f.regelId === 'AD-SEKRETESS-1');
    assert.ok(sekretess);
    for (const falt of ['regeltext', 'metod', 'evidens', 'forklaring'] as const) {
      assert.ok(sekretess[falt].trim() !== '', `${falt} ska vara ifyllt`);
    }

    const historik = await logg.lasForDokument(dokument.id);
    assert.equal(historik.length, 1);
  });

  it('S03 [TI03] TC-20: alla fynd lagras, konfidens finns bara på AI-fynd, och två omgångar syns i ordning i loggen', async () => {
    const dokument = fixtur('TC-20');
    await granskaOchSpara(dokument, { ...beroenden, klient: fyndKlient });
    const lagrad = post(dokument.id);

    const iLoggen = (await logg.lasForDokument(dokument.id)).flatMap((p) => p.fynd);
    assert.equal(lagrad.fynd.length, iLoggen.length);
    const ai = lagrad.fynd.filter((f) => f.metod === 'AI-bedömning');
    const regelbaserade = lagrad.fynd.filter((f) => f.metod !== 'AI-bedömning');
    assert.ok(ai.length > 0 && regelbaserade.length > 0);
    assert.ok(ai.every((f) => typeof f.konfidens === 'number'));
    assert.ok(regelbaserade.every((f) => f.konfidens === undefined));

    const forsta = lagrad.fynd[0];
    assert.ok(forsta);
    const beslut = await hanteraBeslut(
      { dokumentId: dokument.id, regelId: forsta.regelId, beslut: 'avvisa', motivering: 'Stämmer inte.' },
      { ...beroenden, klient: fyndKlient },
    );
    assert.equal(beslut.ok, true);
    const tidpunkter = (await logg.lasForDokument(dokument.id)).map((p) => p.tidpunkt);
    assert.deepEqual(tidpunkter, [...tidpunkter].sort(), 'loggen läses i tilläggsordning');
    assert.ok(tidpunkter.length >= 3, 'första omgången, beslutet och omgången efter beslutet');
  });
});

describe('registratorns beslut (S07)', () => {
  it('S04 [OC03] [TI04,TI07] godkänt förslag loggas före rättningen, och dokumentet följer S06:s omgångsresultat', async () => {
    // Loggen vägrar rättningsposten i första omgången, så AD-KONTAKT-5 blir ett kvarstående förslag.
    // AI-tjänsten är nere, så dokumentet går till Mänsklig bedömning.
    const dokument = fixtur('TC-08');
    await granskaOchSpara(dokument, {
      ...beroenden,
      klient: nedKlient,
      logg: loggSomFallerNar(logg, (p) => p.andringar.length > 0),
    });
    const fore = post(dokument.id);
    assert.equal(fore.granskningsstatus, 'Mänsklig bedömning');
    assert.equal(fore.dokument.arendedokument.kopia_till, 'Clas Olsson');

    const resultat = await hanteraBeslut(
      { dokumentId: dokument.id, regelId: 'AD-KONTAKT-5', beslut: 'godkann' },
      beroenden,
    );

    assert.equal(resultat.ok, true);
    const efter = post(dokument.id);
    assert.equal(efter.granskningsstatus, 'Autokorrigerad');
    assert.equal(efter.dokument.arendedokument['status'], 'Registrerat');
    assert.equal(efter.dokument.arendedokument.kopia_till, '');

    const poster = await logg.lasForDokument(dokument.id);
    const beslutsindex = poster.findIndex((p) => p.manskligaBeslut.length > 0);
    const rattningsindex = poster.findIndex((p) => p.andringar.length > 0);
    assert.ok(beslutsindex !== -1 && rattningsindex !== -1);
    assert.ok(beslutsindex < rattningsindex, 'beslutet loggas innan rättningen tillämpas');
    const beslut = poster[beslutsindex]?.manskligaBeslut[0];
    assert.equal(beslut?.roll, 'Registrator');
    assert.equal(beslut?.regelId, 'AD-KONTAKT-5');
    assert.ok(!Number.isNaN(Date.parse(beslut?.tidpunkt ?? '')));
  });

  it('S05 [OC03] [TI05,TI07] avvisning utan motivering blockeras: ingen loggpost, oförändrad status', async () => {
    const dokument = fixtur('TC-13');
    await granskaOchSpara(dokument, beroenden);
    const fore = post(dokument.id);
    const loggFore = await logg.lasForDokument(dokument.id);

    for (const motivering of [undefined, '', '   \n ']) {
      const resultat = await hanteraBeslut(
        { dokumentId: dokument.id, regelId: 'AD-SEKRETESS-1', beslut: 'avvisa', motivering },
        beroenden,
      );
      assert.equal(resultat.ok, false);
      assert.equal(resultat.ok === false && resultat.typ, 'ogiltigt');
    }

    assert.deepEqual(post(dokument.id), fore);
    assert.deepEqual(await logg.lasForDokument(dokument.id), loggFore);
  });

  it('S06 [OC03,OC04] [TI05,TI07] avvisning med motivering stänger fyndet och lämnar Mänsklig bedömning', async () => {
    const dokument = fixtur('TC-13');
    await granskaOchSpara(dokument, beroenden);
    const motivering = 'AI-fyndet stämmer inte, kontakten är korrekt';

    const resultat = await hanteraBeslut(
      { dokumentId: dokument.id, regelId: 'AD-SEKRETESS-1', beslut: 'avvisa', motivering },
      beroenden,
    );

    assert.equal(resultat.ok, true);
    const efter = post(dokument.id);
    assert.notEqual(efter.granskningsstatus, 'Mänsklig bedömning');
    assert.ok(['Godkänd', 'Åtgärd krävs'].includes(efter.granskningsstatus));
    assert.equal(efter.beslut[0]?.utgang, 'avvisat');
    // Avvisningen rör inte dokumentets datum, diarienummer eller skyddskod (Constraints).
    const orig = fixtur('TC-13');
    assert.equal(efter.dokument.arende.diarienummer, orig.arende.diarienummer);
    assert.equal(efter.dokument.arendedokument.skyddskod, orig.arendedokument.skyddskod);
    assert.equal(efter.dokument.arendedokument.dokumentdatum, orig.arendedokument.dokumentdatum);

    const beslut = (await beslutsposter(dokument.id))[0];
    assert.equal(beslut?.roll, 'Registrator');
    assert.equal(beslut?.motivering, motivering);
    assert.equal(beslut?.regelId, 'AD-SEKRETESS-1');
  });

  it('[TI04] ett godkänt fynd som inte kan auto-rättas registrerar aldrig dokumentet', async () => {
    const dokument = fixtur('TC-13');
    await granskaOchSpara(dokument, beroenden);

    const resultat = await hanteraBeslut(
      { dokumentId: dokument.id, regelId: 'AD-SEKRETESS-1', beslut: 'godkann' },
      beroenden,
    );

    assert.equal(resultat.ok, true);
    const efter = post(dokument.id);
    assert.equal(efter.granskningsstatus, 'Åtgärd krävs');
    assert.notEqual(efter.dokument.arendedokument['status'], 'Registrerat');
    assert.equal(efter.dokument.arendedokument.skyddskod, fixtur('TC-13').arendedokument.skyddskod);
  });

  it('S07 [OC04] [TI06] skickat fynd sätter Åtgärd krävs även om andra fynd väntar på bedömning', async () => {
    // Utan filkälla kan zip-filen inte packas upp, så FIL-ZIP-1 kvarstår. AI nere ⇒ Mänsklig bedömning.
    const dokument = fixtur('TC-15');
    await granskaOchSpara(dokument, { ...beroenden, klient: nedKlient });
    assert.equal(post(dokument.id).granskningsstatus, 'Mänsklig bedömning');

    const resultat = await hanteraBeslut(
      { dokumentId: dokument.id, regelId: 'FIL-ZIP-1', beslut: 'skicka' },
      { ...beroenden, klient: nedKlient },
    );

    assert.equal(resultat.ok, true);
    assert.equal(post(dokument.id).granskningsstatus, 'Åtgärd krävs');
    assert.equal(post(dokument.id).beslut[0]?.utgang, 'skickat');
    assert.equal((await beslutsposter(dokument.id))[0]?.beslut, 'Skickat till handläggare');
  });

  it('[TI07] misslyckad loggskrivning av beslutet lämnar status och fyndlista oförändrade', async () => {
    const dokument = fixtur('TC-13');
    await granskaOchSpara(dokument, beroenden);
    const fore = post(dokument.id);
    const loggFore = await logg.lasForDokument(dokument.id);

    const resultat = await hanteraBeslut(
      { dokumentId: dokument.id, regelId: 'AD-SEKRETESS-1', beslut: 'avvisa', motivering: 'Fel fynd.' },
      { ...beroenden, logg: loggSomFallerNar(logg, () => true) },
    );

    assert.equal(resultat.ok, false);
    assert.equal(resultat.ok === false && resultat.typ, 'misslyckades');
    assert.match(resultat.ok === false ? resultat.meddelande : '', /kunde inte loggas/);
    assert.deepEqual(post(dokument.id), fore);
    assert.deepEqual(await logg.lasForDokument(dokument.id), loggFore);
  });

  it('[TI07] misslyckad loggning av omgången efter beslutet lämnar status och fyndlista oförändrade', async () => {
    const dokument = fixtur('TC-13');
    await granskaOchSpara(dokument, beroenden);
    const fore = post(dokument.id);

    // Beslutsposten (den första skrivningen) lyckas, omgångsposten därefter gör det inte.
    const resultat = await hanteraBeslut(
      { dokumentId: dokument.id, regelId: 'AD-SEKRETESS-1', beslut: 'avvisa', motivering: 'Fel fynd.' },
      { ...beroenden, logg: loggSomFallerNar(logg, (_p, antal) => antal >= 1) },
    );

    assert.equal(resultat.ok, false);
    const efter = post(dokument.id);
    assert.equal(efter.granskningsstatus, fore.granskningsstatus);
    assert.deepEqual(efter.fynd, fore.fynd);
    assert.deepEqual(efter.beslut, []);
    assert.equal(efter.dokument.arendedokument['status'], fore.dokument.arendedokument['status']);
  });

  it('[TI05] servern avvisar ogiltiga beslut även om klienten kringgås', async () => {
    const dokument = fixtur('TC-13');
    await granskaOchSpara(dokument, beroenden);
    await granskaOchSpara(fixtur('TC-01'), beroenden);
    const fore = post(dokument.id);

    const ogiltiga = [
      { dokumentId: dokument.id, regelId: 'AD-SEKRETESS-1', beslut: 'radera' },
      { dokumentId: dokument.id, regelId: 'AD-TITEL-1', beslut: 'skicka' },
      { dokumentId: 'TC-01-DOK-1', regelId: 'AD-TITEL-1', beslut: 'skicka' },
    ];
    for (const indata of ogiltiga) {
      const resultat = await hanteraBeslut(indata, beroenden);
      assert.equal(resultat.ok, false, JSON.stringify(indata));
    }
    const saknas = await hanteraBeslut(
      { dokumentId: 'finns-inte', regelId: 'AD-TITEL-1', beslut: 'skicka' },
      beroenden,
    );
    assert.equal(saknas.ok === false && saknas.typ, 'ej-hittat');

    assert.deepEqual(post(dokument.id), fore);
    assert.equal((await beslutsposter(dokument.id)).length, 0);
  });

  it('[TI04] ett fynd kan bara avgöras en gång', async () => {
    const dokument = fixtur('TC-20');
    await granskaOchSpara(dokument, { ...beroenden, klient: fyndKlient });
    const regelId = post(dokument.id).fynd[0]?.regelId ?? '';
    const indata = { dokumentId: dokument.id, regelId, beslut: 'godkann' };

    assert.equal((await hanteraBeslut(indata, { ...beroenden, klient: fyndKlient })).ok, true);
    const igen = await hanteraBeslut(indata, { ...beroenden, klient: fyndKlient });

    assert.equal(igen.ok, false);
    assert.equal((await beslutsposter(dokument.id)).length, 1);
  });

  it('[TI05] ett avvisat auto-rättningsbart fynd rättas inte', async () => {
    const dokument = fixtur('TC-08');
    await granskaOchSpara(dokument, {
      ...beroenden,
      klient: nedKlient,
      logg: loggSomFallerNar(logg, (p) => p.andringar.length > 0),
    });

    const resultat = await hanteraBeslut(
      { dokumentId: dokument.id, regelId: 'AD-KONTAKT-5', beslut: 'avvisa', motivering: 'Kopian är avsiktlig.' },
      beroenden,
    );

    assert.equal(resultat.ok, true);
    assert.equal(post(dokument.id).dokument.arendedokument.kopia_till, 'Clas Olsson');
    assert.ok((await logg.lasForDokument(dokument.id)).every((p) => p.andringar.length === 0));
  });
});
