/**
 * Acceptansscenarier för S08 (`docs/s08-handlaggarvy.md`), mot testcases.json:s
 * TC-01/TC-03/TC-15. AI-klienten är alltid en stub, så ingen testkörning
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
import { hanteraAndring, skickaForNyGranskning } from './handlaggare.ts';
import { ATGARD_KRAVS, handlaggarko, kanTillampaForslag, redigerbaraFalt } from './handlaggare-vy.ts';
import { oppnaKontrollogg, type Kontrollogg, type KontrolloggPost } from './kontrollogg/index.ts';
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
  katalogdir = mkdtempSync(join(tmpdir(), 'handlaggare-'));
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

describe('handläggarkö (S08)', () => {
  it('S01 [OC01] [TI01] kön visar bara dokument med Åtgärd krävs, med fynd', async () => {
    // TC-03 → Åtgärd krävs, TC-01 → Godkänd, TC-13 → Mänsklig bedömning, TC-08 → Autokorrigerad
    for (const id of ['TC-03', 'TC-01', 'TC-13', 'TC-08']) await granskaOchSpara(fixtur(id), beroenden);

    assert.equal(post('TC-01-DOK-1').granskningsstatus, 'Godkänd');
    assert.equal(post('TC-13-DOK-1').granskningsstatus, 'Mänsklig bedömning');
    assert.equal(post('TC-08-DOK-1').granskningsstatus, 'Autokorrigerad');

    const ko = handlaggarko(lager.alla());
    assert.deepEqual(
      ko.map((p) => p.dokument.arende.diarienummer),
      ['2026-00103'],
    );
    assert.ok(ko.every((p) => p.granskningsstatus === ATGARD_KRAVS));
    assert.ok(ko[0]?.fynd.some((f) => f.regelId === 'AD-TITEL-2'));
    for (const id of ['TC-01-DOK-1', 'TC-13-DOK-1', 'TC-08-DOK-1']) {
      assert.ok(!ko.some((p) => p.dokument.id === id), id);
    }
  });
});

describe('dokumentdetalj (S08)', () => {
  it('S02 [OC02] [TI02] TC-03 visar AD-TITEL-2 med regel-id, förklaring och rättningsförslag', async () => {
    const dokument = fixtur('TC-03');
    await granskaOchSpara(dokument, beroenden);
    const lagrad = post(dokument.id);

    const titel2 = lagrad.fynd.find((f) => f.regelId === 'AD-TITEL-2');
    assert.ok(titel2);
    assert.equal(titel2.regelId, 'AD-TITEL-2');
    assert.ok(titel2.forklaring.trim() !== '');
    assert.ok(titel2.evidens.trim() !== '');
    assert.ok((titel2.rattningsforslag ?? '').trim() !== '');
    assert.equal(lagrad.dokument.arendedokument.titel, 'Bslt ang IK-plan 2026 fr GD');

    const flikar = redigerbaraFalt(lagrad.dokument);
    const diarienr = [...flikar.detaljer, ...flikar.kontakter].find((f) => f.sokvag === 'arende.diarienummer');
    assert.equal(diarienr?.lasbart, true);
    assert.ok(flikar.kontakter.some((f) => f.sokvag === 'arendedokument.avsandare'));
    assert.equal(kanTillampaForslag('AD-TITEL-2', katalog), true);
    assert.equal(kanTillampaForslag('FIL-ZIP-1', katalog), false);
  });
});

describe('tillämpa förslag och redigera (S08)', () => {
  it('S02 [OC02] [TI03] Tillämpa förslag uppdaterar titel och loggas med roll Handläggare', async () => {
    const dokument = fixtur('TC-03');
    await granskaOchSpara(dokument, beroenden);
    const fore = post(dokument.id);
    const fynd = fore.fynd.find((f) => f.regelId === 'AD-TITEL-2');
    assert.ok(fynd?.rattningsforslag);

    const resultat = await hanteraAndring({ dokumentId: dokument.id, regelId: 'AD-TITEL-2' }, beroenden);

    assert.equal(resultat.ok, true);
    const efter = post(dokument.id);
    assert.equal(efter.dokument.arendedokument.titel, fynd.rattningsforslag);
    const poster = await logg.lasForDokument(dokument.id);
    const andring = poster.flatMap((p) => p.andringar).find((a) => a.regelId === 'AD-TITEL-2');
    assert.ok(andring);
    assert.equal(andring.fore, 'Bslt ang IK-plan 2026 fr GD');
    assert.equal(andring.efter, fynd.rattningsforslag);
    assert.equal(andring.automatisk, false);
    const beslut = poster.flatMap((p) => p.manskligaBeslut).find((b) => b.regelId === 'AD-TITEL-2');
    assert.equal(beslut?.roll, 'Handläggare');
  });

  it('[TI03] misslyckad loggskrivning lämnar titel oförändrad', async () => {
    const dokument = fixtur('TC-03');
    await granskaOchSpara(dokument, beroenden);
    const titelFore = post(dokument.id).dokument.arendedokument.titel;
    const loggFore = await logg.lasForDokument(dokument.id);

    const resultat = await hanteraAndring(
      { dokumentId: dokument.id, regelId: 'AD-TITEL-2' },
      { ...beroenden, logg: loggSomFallerNar(logg, () => true) },
    );

    assert.equal(resultat.ok, false);
    assert.equal(resultat.ok === false && resultat.typ, 'misslyckades');
    assert.equal(post(dokument.id).dokument.arendedokument.titel, titelFore);
    assert.deepEqual(await logg.lasForDokument(dokument.id), loggFore);
  });

  it('[TI04] tillåtet fält (avsandare) på TC-03 sparas', async () => {
    const dokument = fixtur('TC-03');
    await granskaOchSpara(dokument, beroenden);

    const resultat = await hanteraAndring(
      { dokumentId: dokument.id, falt: 'arendedokument.avsandare', varde: 'Rättad avsändare' },
      beroenden,
    );

    assert.equal(resultat.ok, true);
    assert.equal(post(dokument.id).dokument.arendedokument.avsandare, 'Rättad avsändare');
    const andring = (await logg.lasForDokument(dokument.id))
      .flatMap((p) => p.andringar)
      .find((a) => a.falt === 'arendedokument.avsandare');
    assert.equal(andring?.efter, 'Rättad avsändare');
    assert.equal(andring?.automatisk, false);
  });

  it('S05 [OC04] [TI04] diarienummer-ändring avvisas och loggas inte', async () => {
    const dokument = fixtur('TC-03');
    await granskaOchSpara(dokument, beroenden);
    const loggFore = await logg.lasForDokument(dokument.id);

    const resultat = await hanteraAndring(
      { dokumentId: dokument.id, falt: 'arende.diarienummer', varde: '2026-99999' },
      beroenden,
    );

    assert.equal(resultat.ok, false);
    assert.equal(resultat.ok === false && resultat.typ, 'ogiltigt');
    assert.equal(post(dokument.id).dokument.arende.diarienummer, '2026-00103');
    const efter = await logg.lasForDokument(dokument.id);
    assert.deepEqual(efter, loggFore);
    assert.ok(!efter.flatMap((p) => p.andringar).some((a) => String(a.falt).includes('diarienummer')));
  });

  it('S06 [OC04] [TI06] direkt Registrerat-skrivning avvisas, status förblir Åtgärd krävs', async () => {
    const dokument = fixtur('TC-15');
    await granskaOchSpara(dokument, beroenden);
    assert.equal(post(dokument.id).granskningsstatus, ATGARD_KRAVS);
    const statusFore = post(dokument.id).dokument.arendedokument['status'];

    for (const falt of ['arendedokument.status', 'dokumentstatus', 'granskningsstatus'] as const) {
      const resultat = await hanteraAndring({ dokumentId: dokument.id, falt, varde: 'Registrerat' }, beroenden);
      assert.equal(resultat.ok, false, falt);
      assert.equal(resultat.ok === false && resultat.typ, 'ogiltigt', falt);
    }

    const efter = post(dokument.id);
    assert.equal(efter.granskningsstatus, ATGARD_KRAVS);
    assert.equal(efter.dokument.arendedokument['status'], statusFore);
    assert.notEqual(efter.dokument.arendedokument['status'], 'Registrerat');
  });
});

describe('ny granskning (S08)', () => {
  it('S03 [OC03] [TI05] rättat TC-03 blir Godkänd/Registrerat och lämnar kön', async () => {
    const dokument = fixtur('TC-03');
    await granskaOchSpara(dokument, beroenden);
    // S04:s rättningsförslag för AD-TITEL-2 är en instruktion, inte en ersättningstitel.
    // S03 kräver en redan rättad titel; samma endpoint som fältredigering (TI04) sätter den.
    const rattning = await hanteraAndring(
      { dokumentId: dokument.id, falt: 'arendedokument.titel', varde: 'Beslut om intern kontrollplan 2026' },
      beroenden,
    );
    assert.equal(rattning.ok, true);

    const resultat = await skickaForNyGranskning(dokument.id, beroenden);

    assert.equal(resultat.ok, true);
    const efter = post(dokument.id);
    assert.equal(efter.granskningsstatus, 'Godkänd');
    assert.equal(efter.dokument.arendedokument['status'], 'Registrerat');
    assert.ok(!handlaggarko(lager.alla()).some((p) => p.dokument.id === dokument.id));
  });

  it('S04 [OC03] [TI05] misslyckad omgång lämnar Åtgärd krävs med felmeddelande', async () => {
    const dokument = fixtur('TC-15');
    await granskaOchSpara(dokument, beroenden);
    const fore = post(dokument.id);

    const resultat = await skickaForNyGranskning(dokument.id, {
      ...beroenden,
      logg: loggSomFallerNar(logg, () => true),
    });

    assert.equal(resultat.ok, false);
    assert.equal(resultat.ok === false && resultat.typ, 'misslyckades');
    assert.match(resultat.ok === false ? resultat.meddelande : '', /Åtgärd krävs/);
    const efter = post(dokument.id);
    assert.equal(efter.granskningsstatus, ATGARD_KRAVS);
    assert.equal(efter.granskningsstatus, fore.granskningsstatus);
    assert.notEqual(efter.dokument.arendedokument['status'], 'Registrerat');
  });
});
