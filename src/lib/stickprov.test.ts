/**
 * Acceptansscenarier för S11 (`docs/s11-stickprov.md`), mot testcases.json:s
 * TC-01 (Godkänd) och TC-08 (Autokorrigerad, AD-KONTAKT-5 auto-rättad).
 * AI-klienten är alltid en stub, så ingen testkörning når ett nätverk.
 */

import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { oppnaDokumentlager, type Dokumentpost } from './dokumentlager.ts';
import type { AiKlient } from './granskning/ai/klient.ts';
import type { GranskatDokument } from './granskning/kontrakt.ts';
import { granskaOchSpara, type Beroenden } from './granskningstjanst.ts';
import { oppnaKontrollogg, type KontrolloggPost } from './kontrollogg/index.ts';
import { loadKlassificeringsstruktur, loadKontaktregister } from './reference-data.ts';
import { loadChecklistCatalog } from './rule-catalog.ts';
import {
  filtreraStickprovsko,
  hanteraStickprov,
  markerbaraRegelIdn,
  REGISTRERADE_STATUSAR,
  STICKPROV_FELBEDOMNING,
  STICKPROV_UTAN_ANMARKNING,
} from './stickprov.ts';

const katalog = loadChecklistCatalog();
const referensdata = {
  kontaktregister: loadKontaktregister(),
  klassificeringsstruktur: loadKlassificeringsstruktur(),
};

const testcases = JSON.parse(
  readFileSync(new URL('../../casedetails/testcases.json', import.meta.url), 'utf8'),
).cases as (GranskatDokument & { case_id: string })[];

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

const tystKlient: AiKlient = {
  modell: 'stub-modell',
  bedom: async () => ({ ok: true, verdikt: { fynd: false, konfidens: 0.95, evidens: '', forklaring: '' } }),
};

let katalogmapp: string;
let loggfil: string;
let beroenden: Beroenden;

beforeEach(() => {
  katalogmapp = mkdtempSync(join(tmpdir(), 'stickprov-'));
  loggfil = join(katalogmapp, 'kontrollogg.jsonl');
  beroenden = {
    lager: oppnaDokumentlager(join(katalogmapp, 'dokument.json')),
    logg: oppnaKontrollogg(loggfil),
    katalog,
    referensdata,
    klient: tystKlient,
  };
});

afterEach(() => rmSync(katalogmapp, { recursive: true, force: true }));

async function granska(caseId: string): Promise<Dokumentpost> {
  await granskaOchSpara(fixtur(caseId), beroenden);
  const post = beroenden.lager.hamta(`${caseId}-DOK-1`);
  assert.ok(post, `${caseId} hamnade inte i lagret`);
  return post;
}

function loggposter(): KontrolloggPost[] {
  const innehall = readFileSync(loggfil, 'utf8').trim();
  return innehall === '' ? [] : innehall.split('\n').map((rad) => JSON.parse(rad) as KontrolloggPost);
}

function markeringar(): KontrolloggPost['manskligaBeslut'] {
  return loggposter().flatMap((post) => post.manskligaBeslut);
}

describe('stickprov (S11)', () => {
  it('S01 [OC01] [TI01] kön visar bara automatiskt registrerade dokument', async () => {
    await granska('TC-01'); // Godkänd
    await granska('TC-08'); // Autokorrigerad
    await granska('TC-09'); // Åtgärd krävs
    await granska('TC-13'); // Mänsklig bedömning

    const ko = filtreraStickprovsko(beroenden.lager.alla());

    assert.deepEqual(ko.map((post) => post.dokument.id).sort(), ['TC-01-DOK-1', 'TC-08-DOK-1']);
    for (const post of ko) {
      assert.ok(REGISTRERADE_STATUSAR.includes(post.granskningsstatus));
    }
  });

  it('S06 [OC01] [TI01] utan registrerade dokument är kön tom, inte trasig', async () => {
    await granska('TC-13');

    assert.deepEqual(filtreraStickprovsko(beroenden.lager.alla()), []);
  });

  it('S02 [OC01] [TI02] ett auto-rättat fynd går att hitta trots att det inte står kvar', async () => {
    const post = await granska('TC-08');

    // Omkörningen rensade AD-KONTAKT-5 ur fyndlistan; rättningen i loggen är beviset.
    assert.equal(post.fynd.some((fynd) => fynd.regelId === 'AD-KONTAKT-5'), false);
    const markerbara = await markerbaraRegelIdn(post, beroenden.logg);
    assert.ok(markerbara.includes('AD-KONTAKT-5'));
  });

  it('S03 [OC02] [TI03,TI04,TI05] en felbedömning loggas med roll, tid, regel-ID och kommentar', async () => {
    const post = await granska('TC-08');
    const kommentar = 'Kopia till borde ha behållits – mottagaren behövde kopian';

    const resultat = await hanteraStickprov(
      { dokumentId: post.dokument.id, regelId: 'AD-KONTAKT-5', utgang: 'felbedomning', kommentar },
      beroenden,
    );

    assert.equal(resultat.ok, true);
    const markering = markeringar().find((rad) => rad.beslut === STICKPROV_FELBEDOMNING);
    assert.ok(markering, 'markeringen saknas i loggen');
    assert.equal(markering.roll, 'Registrator');
    assert.equal(markering.regelId, 'AD-KONTAKT-5');
    assert.equal(markering.motivering, kommentar);
    assert.ok(Date.parse(markering.tidpunkt) > 0);
  });

  it('S04 [OC03] [TI04] flaggning utan kommentar blockeras och skriver ingen loggpost', async () => {
    const post = await granska('TC-08');
    const posterInnan = loggposter().length;

    for (const kommentar of [undefined, '', '   ']) {
      const resultat = await hanteraStickprov(
        { dokumentId: post.dokument.id, regelId: 'AD-KONTAKT-5', utgang: 'felbedomning', kommentar },
        beroenden,
      );

      assert.equal(resultat.ok, false);
      assert.equal(resultat.ok === false && resultat.typ, 'ogiltigt');
      assert.match(resultat.ok === false ? resultat.meddelande : '', /kräver en kommentar/);
    }
    assert.equal(loggposter().length, posterInnan);
  });

  it('S05 [OC03] [TI05] en misslyckad loggskrivning lämnar dokumentet oförändrat', async (t) => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      t.skip('root kringgår filrättigheter');
      return;
    }
    const post = await granska('TC-08');
    const innehallInnan = readFileSync(loggfil, 'utf8');
    const statusInnan = post.granskningsstatus;
    const fyndInnan = JSON.stringify(post.fynd);

    chmodSync(loggfil, 0o444);
    let resultat;
    try {
      resultat = await hanteraStickprov(
        {
          dokumentId: post.dokument.id,
          regelId: 'AD-KONTAKT-5',
          utgang: 'felbedomning',
          kommentar: 'Borde inte ha rättats automatiskt.',
        },
        beroenden,
      );
    } finally {
      chmodSync(loggfil, 0o644);
    }

    assert.equal(resultat.ok, false);
    assert.equal(resultat.ok === false && resultat.typ, 'misslyckades');
    assert.equal(readFileSync(loggfil, 'utf8'), innehallInnan);
    const efter = beroenden.lager.hamta(post.dokument.id);
    assert.equal(efter?.granskningsstatus, statusInnan);
    assert.equal(JSON.stringify(efter?.fynd), fyndInnan);
  });

  it('[TI05] en markering ändrar aldrig status, fynd eller dokumentdata', async () => {
    const post = await granska('TC-08');
    const lagretInnan = JSON.stringify(beroenden.lager.hamta(post.dokument.id));

    await hanteraStickprov(
      {
        dokumentId: post.dokument.id,
        regelId: 'AD-KONTAKT-5',
        utgang: 'felbedomning',
        kommentar: 'Fel bedömt.',
      },
      beroenden,
    );

    // Bara loggen växte. Lagret är orört, ordagrant.
    assert.equal(JSON.stringify(beroenden.lager.hamta(post.dokument.id)), lagretInnan);
  });

  it('[TI01] ett dokument som inte är automatiskt registrerat kan inte stickprovas', async () => {
    const post = await granska('TC-13');

    const resultat = await hanteraStickprov(
      {
        dokumentId: post.dokument.id,
        regelId: 'AD-SEKRETESS-1',
        utgang: 'felbedomning',
        kommentar: 'Fel bedömt.',
      },
      beroenden,
    );

    assert.equal(resultat.ok === false && resultat.typ, 'ogiltigt');
    assert.match(resultat.ok === false ? resultat.meddelande : '', /automatiskt registrerade/);
  });

  it('[TI04] ett okänt regel-ID eller en okänd utgång avvisas', async () => {
    const post = await granska('TC-08');

    const okandRegel = await hanteraStickprov(
      { dokumentId: post.dokument.id, regelId: 'AR-TITEL-3', utgang: 'felbedomning', kommentar: 'x' },
      beroenden,
    );
    const okandUtgang = await hanteraStickprov(
      { dokumentId: post.dokument.id, regelId: 'AD-KONTAKT-5', utgang: 'radera', kommentar: 'x' },
      beroenden,
    );
    const okantDokument = await hanteraStickprov(
      { dokumentId: 'finns-inte', regelId: 'AD-KONTAKT-5', utgang: 'felbedomning', kommentar: 'x' },
      beroenden,
    );

    assert.equal(okandRegel.ok === false && okandRegel.typ, 'ogiltigt');
    assert.equal(okandUtgang.ok === false && okandUtgang.typ, 'ogiltigt');
    assert.equal(okantDokument.ok === false && okantDokument.typ, 'ej-hittat');
    assert.deepEqual(markeringar(), []);
  });

  it('ett stickprov utan anmärkning loggas utan att kräva kommentar', async () => {
    const post = await granska('TC-08');

    const resultat = await hanteraStickprov(
      { dokumentId: post.dokument.id, regelId: 'AD-KONTAKT-5', utgang: 'utan-anmarkning' },
      beroenden,
    );

    assert.equal(resultat.ok, true);
    const markering = markeringar().find((rad) => rad.beslut === STICKPROV_UTAN_ANMARKNING);
    assert.ok(markering);
    assert.equal(markering.regelId, 'AD-KONTAKT-5');
  });

  it('kvalitetsöversikten räknar markeringarna som stickprov och felbedömningar', async () => {
    const { hamtaKvalitetsoversikt } = await import('./kvalitet/oversikt.ts');
    const post = await granska('TC-08');
    await hanteraStickprov(
      { dokumentId: post.dokument.id, regelId: 'AD-KONTAKT-5', utgang: 'felbedomning', kommentar: 'Fel.' },
      beroenden,
    );
    await hanteraStickprov(
      // Samma fynd granskat igen vid ett senare stickprov: loggen är append-only,
      // så båda markeringarna finns kvar och båda räknas.
      { dokumentId: post.dokument.id, regelId: 'AD-KONTAKT-5', utgang: 'utan-anmarkning' },
      beroenden,
    );

    const oversikt = await hamtaKvalitetsoversikt(loggfil);

    // Nämnaren är gjorda stickprov, täljaren de som markerats som felbedömning.
    assert.equal(oversikt.stickprov.antalStickprov, 2);
    assert.equal(oversikt.stickprov.antalFelbedomningar, 1);
    assert.equal(oversikt.stickprov.andel, 50);
  });
});

describe('S11:s strukturkriterier', () => {
  it('modulen exponerar ingen väg att ändra eller ta bort en loggpost', async () => {
    const modul = await import('./stickprov.ts');
    const muterande = /uppdatera|ändra|andra|radera|taBort|update|delete|remove|patch/i;

    assert.deepEqual(Object.keys(modul).filter((namn) => muterande.test(namn)), []);
  });

  it('markeringen skriver bara till loggen, aldrig till dokumentlagret', () => {
    const kalla = readFileSync(new URL('stickprov.ts', import.meta.url), 'utf8');

    assert.doesNotMatch(kalla, /lager\.spara/);
    assert.match(kalla, /logg\.laggTill/);
  });
});
