/**
 * Acceptansscenarier för S09 (`docs/s09-testsvit-med-syntetiska-testfiler.md`).
 * Sviten körs en gång och delas av testerna, så att de mäter samma körning.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { loadChecklistCatalog } from '../lib/rule-catalog.ts';
import { allaFixturer, slaUppFixtur, valjProfil } from './fixturer.ts';
import { jamforFall, statusStammer, type Falljamforelse } from './komparator.ts';
import { korTestsvit, type Korningsresultat } from './kor.ts';

const katalog = loadChecklistCatalog();
const arbetskatalog = mkdtempSync(join(tmpdir(), 'testsvit-test-'));

after(() => rmSync(arbetskatalog, { recursive: true, force: true }));

const korning: Promise<Korningsresultat> = korTestsvit({
  loggfil: join(arbetskatalog, 'kontrollogg.jsonl'),
});

function rad(resultat: Korningsresultat, caseId: string): Falljamforelse {
  const traff = resultat.rader.find((r) => r.caseId === caseId);
  assert.ok(traff, `${caseId} saknas i rapporten`);
  return traff;
}

describe('testsvitens körning (S09)', () => {
  it('S01 [OC01] [TI02,TI03,TI07] ett kommando kör alla 20 fall', async () => {
    const resultat = await korning;

    assert.equal(resultat.rader.length, 20);
    assert.equal(new Set(resultat.rader.map((r) => r.caseId)).size, 20);
    assert.equal(resultat.sammanstallning.totalt, 20);
  });

  it('S02 [OC01,OC04] [TI03,TI04] TC-01 ger exakt Godkänd utan fynd', async () => {
    const tc01 = rad(await korning, 'TC-01');

    assert.equal(tc01.faktiskStatus, 'Godkänd');
    assert.equal(tc01.dom, 'godkänt');
    assert.deepEqual(tc01.extraFynd, []);
  });

  it('S03 [OC03] [TI04,TI05] TC-08:s auto-rättade fynd räknas som hittat', async () => {
    const tc08 = rad(await korning, 'TC-08');

    // Omkörningen rapporterar inte längre AD-KONTAKT-5 – rättningen är beviset.
    assert.deepEqual(tc08.hittadeFynd, ['AD-KONTAKT-5']);
    assert.deepEqual(tc08.saknadeFynd, []);
    assert.equal(tc08.faktiskStatus, 'Autokorrigerad');
    assert.equal(tc08.dom, 'godkänt');
  });

  it('S04 [OC02] [TI01,TI03] TC-15:s zip-fixtur driver riktig uppackning', async () => {
    const tc15 = rad(await korning, 'TC-15');

    assert.deepEqual(tc15.hittadeFynd.sort(), ['FIL-ANTAL-1', 'FIL-ZIP-1']);
    assert.equal(tc15.dom, 'godkänt');
  });

  it('S05 [OC02] [TI01,TI02] en saknad testfil är ett testsvitsfel, inte ett godkänt fall', async () => {
    const resultat = await korTestsvit({
      loggfil: join(arbetskatalog, 'saknad.jsonl'),
      saknadeFixturer: ['TC-16'],
    });

    const tc16 = rad(resultat, 'TC-16');
    assert.equal(tc16.dom, 'testsvitsfel');
    assert.match(tc16.anmarkning ?? '', /Testfilen saknas/);
    assert.match(tc16.anmarkning ?? '', /korrupt\.pdf/);
    // S07: de övriga 19 fallen slutförs i samma körning.
    assert.equal(resultat.rader.length, 20);
    assert.equal(resultat.sammanstallning.testsvitsfel, 1);
    assert.ok(resultat.sammanstallning.godkanda > 10);
  });

  it('S06 [OC03] [TI06] ett extra fynd listas separat utan att underkänna fallet', async () => {
    // TC-09 ger även AR-KONTAKT-2: ärendets motpart är samma oregistrerade
    // organisation. Rimligt extrafynd enligt PRD:ns beslutslogg.
    const tc09 = rad(await korning, 'TC-09');

    assert.deepEqual(tc09.extraFynd.map((f) => f.regelId), ['AR-KONTAKT-2']);
    assert.ok(tc09.extraFynd[0]?.forklaring.length ?? 0 > 0);
    assert.equal(tc09.dom, 'godkänt');
  });

  it('[OC04] ingen körning ändrar datum, diarienummer eller skyddskod', async () => {
    const resultat = await korning;

    for (const r of resultat.rader) {
      assert.deepEqual(r.brutnaFaltskydd, [], `${r.caseId} ändrade skyddade fält`);
    }
  });

  it('innehållsberoende fall markeras som live-krävande, aldrig som godkända', async () => {
    const resultat = await korning;

    const kraverLive = resultat.rader.filter((r) => r.dom === 'kräver live-läge');
    assert.deepEqual(
      kraverLive.map((r) => r.caseId).sort(),
      ['TC-04', 'TC-05', 'TC-11', 'TC-12', 'TC-19', 'TC-20'],
    );
    assert.equal(resultat.sammanstallning.underkanda, 0);
    assert.equal(resultat.sammanstallning.godkanda, 14);
  });
});

describe('komparatorn (S09 TI04, TI05, TI06)', () => {
  const grund = {
    caseId: 'TC-X',
    forvantadStatus: 'flaggad',
    forvantadeFynd: ['AD-KONTAKT-5'],
    katalog,
    faltInnan: { ankomstdatum: '2026-08-20', dokumentdatum: '2026-08-20', diarienummer: '1', skyddskod: 'Offentlig' },
    faltEfter: { ankomstdatum: '2026-08-20', dokumentdatum: '2026-08-20', diarienummer: '1', skyddskod: 'Offentlig' },
    stubbadAi: false,
  };
  const omgang = (delar: Record<string, unknown> = {}) =>
    ({
      dokumentId: 'X',
      status: 'Åtgärd krävs',
      dokumentstatus: 'Färdig',
      utfall: [],
      fynd: [],
      tillampadeRattningar: [{ regelId: 'AD-KONTAKT-5', falt: 'kopia_till', fore: 'a', efter: '' }],
      degraderadeRattningar: [],
      fel: [],
      ...delar,
    }) as never;

  it('[TI04] "godkänd" kräver exakt Godkänd, "flaggad" accepterar de tre andra', () => {
    assert.equal(statusStammer('godkänd', 'Godkänd'), true);
    assert.equal(statusStammer('godkänd', 'Autokorrigerad'), false);
    for (const status of ['Autokorrigerad', 'Åtgärd krävs', 'Mänsklig bedömning']) {
      assert.equal(statusStammer('flaggad', status), true);
    }
    assert.equal(statusStammer('flaggad', 'Godkänd'), false);
  });

  it('S07 [OC01] [TI07] ett fall med fel status underkänns med en förklaring', () => {
    const jamforelse = jamforFall({ ...grund, omgang: omgang({ status: 'Godkänd' }) });

    assert.equal(jamforelse.dom, 'underkänt');
    assert.match(jamforelse.anmarkning ?? '', /uppfyller inte förväntat/);
  });

  it('[TI05] en ändring av ett skyddat fält underkänner fallet oavsett status', () => {
    const jamforelse = jamforFall({
      ...grund,
      faltEfter: { ...grund.faltEfter, skyddskod: 'Sekretess' },
      omgang: omgang(),
    });

    assert.equal(jamforelse.dom, 'testsvitsfel');
    assert.deepEqual(jamforelse.brutnaFaltskydd, ['skyddskod']);
    assert.match(jamforelse.anmarkning ?? '', /skyddade fält/);
  });

  it('[TI05] ett förväntat fynd som varken rapporterats eller rättats markeras saknat', () => {
    const jamforelse = jamforFall({
      ...grund,
      forvantadeFynd: ['AD-DATUM-1'],
      omgang: omgang({ tillampadeRattningar: [] }),
    });

    assert.deepEqual(jamforelse.saknadeFynd, ['AD-DATUM-1']);
    assert.equal(jamforelse.dom, 'underkänt');
  });

  it('[TI06] ett extra fynd ensamt flippar aldrig ett godkänt fall', () => {
    const jamforelse = jamforFall({
      ...grund,
      omgang: omgang({
        fynd: [{ regelId: 'AR-KONTAKT-2', forklaring: 'motparten saknas i registret' }],
      }),
    });

    assert.equal(jamforelse.dom, 'godkänt');
    assert.deepEqual(jamforelse.extraFynd.map((f) => f.regelId), ['AR-KONTAKT-2']);
  });
});

describe('syntetiska fixturer (S09 TI01)', () => {
  it('alla sex profiler finns som riktiga filer på disk', () => {
    const fixturer = allaFixturer();

    assert.equal(fixturer.length, 6);
    for (const fixtur of fixturer) {
      assert.ok(fixtur.finns, `${fixtur.profil} saknas: ${fixtur.sokvag}`);
      assert.ok(statSync(fixtur.sokvag).size > 0, `${fixtur.profil} är tom`);
    }
  });

  it('fixturerna har verkligen de egenskaper flaggorna påstår', async () => {
    const { lasZipInnehall } = await import('../lib/granskning/omgang/zip.ts');
    const sokvag = (profil: string) =>
      allaFixturer().find((f) => f.profil === profil)?.sokvag ?? '';

    // Den korrupta filen går inte att öppna: den saknar både objekt och EOF.
    const korrupt = readFileSync(sokvag('korrupt'));
    assert.ok(!korrupt.includes('%%EOF'), 'korrupt.pdf ser ut som en komplett PDF');
    // Standardfixturen går att öppna.
    assert.ok(readFileSync(sokvag('standard')).includes('%%EOF'));

    // Zip-fixturen innehåller färre filer än TC-15:s antal_bilagor (3).
    const zip = lasZipInnehall(sokvag('zip-med-for-fa-filer'));
    assert.ok(zip.ok);
    assert.equal(zip.filer.length, 2);
  });

  it('varje testfall med filer pekar mot en befintlig fixtur', () => {
    const testfall = JSON.parse(
      readFileSync(new URL('../../casedetails/testcases.json', import.meta.url), 'utf8'),
    ).cases as { case_id: string; fil?: never }[];

    for (const tc of testfall) {
      const fixtur = slaUppFixtur(tc.fil);
      assert.ok(fixtur, `${tc.case_id} fick ingen fixturprofil`);
      assert.ok(fixtur.finns, `${tc.case_id} pekar mot en fixtur som saknas`);
    }
  });

  it('profilvalet skiljer de fem särfallen från standardprofilen', () => {
    assert.equal(valjProfil({ filer: ['a.pdf'], ar_zip: true }), 'zip-med-for-fa-filer');
    assert.equal(valjProfil({ filer: ['a.pdf'], ar_lasbar: false }), 'korrupt');
    assert.equal(
      valjProfil({ filer: ['a.pdf'], ar_dubbelsidig_original: true, ar_korrekt_skannad: false }),
      'enkelsidig-skanning',
    );
    assert.equal(valjProfil({ filer: ['a.pdf'], ar_undertecknad_version: false }), 'osignerad');
    assert.equal(valjProfil({ filer: ['Test'] }), 'utan-filandelse');
    assert.equal(valjProfil({ filer: ['a.pdf'] }), 'standard');
    assert.equal(valjProfil({ filer: [] }), undefined);
  });

  it('ingen fixtur eller körning rör casedetails verkliga ärendeexporter', () => {
    for (const namn of ['fixturer.ts', 'kor.ts', 'komparator.ts']) {
      const kalla = readFileSync(new URL(namn, import.meta.url), 'utf8');
      assert.doesNotMatch(kalla, /Ärende 20|\.docx|Skärmdump/);
    }
  });
});
