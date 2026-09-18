/**
 * Acceptansscenarier för S12 (`docs/s12-kvalitetsoversikt.md`).
 * Fixturerna är handbyggda kontrolloggposter, eftersom översiktens siffror är
 * tvärsnitt över många dokument och inte utfall för ett enskilt testfall.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { oppnaKontrollogg, type Kontrollogg } from '../kontrollogg/index.ts';
import type { KontrolloggPost } from '../kontrollogg/types.ts';
import type { Granskningsstatus } from '../granskning/omgang/status.ts';
import { hamtaKvalitetsoversikt, sammanstallOversikt, TOMMA_LAGEN } from './oversikt.ts';
import { lasAllaPoster } from './lasning.ts';

let katalog: string;
let loggfil: string;
let logg: Kontrollogg;

beforeEach(() => {
  katalog = mkdtempSync(join(tmpdir(), 'kvalitet-'));
  loggfil = join(katalog, 'kontrollogg.jsonl');
  logg = oppnaKontrollogg(loggfil);
});

afterEach(() => {
  rmSync(katalog, { recursive: true, force: true });
});

let sekund = 0;

function post(dokumentId: string, delar: Partial<KontrolloggPost> = {}): KontrolloggPost {
  sekund += 1;
  return {
    tidpunkt: new Date(Date.UTC(2026, 8, 18, 9, 0, sekund)).toISOString(),
    dokumentId,
    regelkatalogVersion: '1.0.0',
    aiModell: 'claude-sonnet-5',
    regelutfall: [],
    fynd: [],
    andringar: [],
    statusbyten: [],
    manskligaBeslut: [],
    ...delar,
  };
}

function omgang(dokumentId: string, status: Granskningsstatus, delar: Partial<KontrolloggPost> = {}) {
  return post(dokumentId, {
    statusbyten: [{ typ: 'granskningsstatus', fran: null, till: status }],
    ...delar,
  });
}

function fynd(regelId: string) {
  return {
    regelId,
    allvarlighetsgrad: 'Fel',
    metod: 'M',
    evidens: 'evidens',
    forklaring: 'förklaring',
  };
}

function rattning(regelId: string) {
  return { falt: 'kopia_till', fore: 'Clas Olsson', efter: '', automatisk: true, regelId };
}

function stickprovsbeslut(beslut: string) {
  return {
    roll: 'Registrator',
    tidpunkt: '2026-09-18T10:00:00.000Z',
    beslut,
    motivering: 'Stickprovskommentar.',
  };
}

describe('kvalitetsöversikt (S12)', () => {
  it('S01 [OC01] [TI01,TI02,TI03] statusfördelning över tio dokument', async () => {
    const statusar: Granskningsstatus[] = [
      ...Array<Granskningsstatus>(6).fill('Godkänd'),
      ...Array<Granskningsstatus>(2).fill('Autokorrigerad'),
      'Åtgärd krävs',
      'Mänsklig bedömning',
    ];
    for (const [index, status] of statusar.entries()) {
      await logg.laggTill(omgang(`DOK-${index}`, status));
    }

    const oversikt = await hamtaKvalitetsoversikt(loggfil);

    assert.equal(oversikt.antalGranskadeDokument, 10);
    assert.deepEqual(
      oversikt.statusfordelning.rader.map((rad) => [rad.status, rad.antal, rad.andel]),
      [
        ['Godkänd', 6, 60],
        ['Autokorrigerad', 2, 20],
        ['Åtgärd krävs', 1, 10],
        ['Mänsklig bedömning', 1, 10],
      ],
    );
    assert.equal(
      oversikt.statusfordelning.rader.reduce((summa, rad) => summa + rad.andel, 0),
      100,
    );
  });

  it('[TI02] ett omgranskat dokument räknas en gång, under sin senaste status', async () => {
    await logg.laggTill(omgang('DOK-1', 'Åtgärd krävs'));
    await logg.laggTill(omgang('DOK-1', 'Autokorrigerad'));

    const oversikt = await hamtaKvalitetsoversikt(loggfil);

    assert.equal(oversikt.antalGranskadeDokument, 1);
    const rader = oversikt.statusfordelning.rader;
    assert.equal(rader.find((rad) => rad.status === 'Autokorrigerad')?.antal, 1);
    assert.equal(rader.find((rad) => rad.status === 'Åtgärd krävs')?.antal, 0);
  });

  it('S02 [OC02] [TI01,TI04] vanligaste fynden rankas efter frekvens', async () => {
    await logg.laggTill(omgang('DOK-1', 'Autokorrigerad', { fynd: [fynd('AD-KONTAKT-5'), fynd('FIL-ZIP-1')] }));
    await logg.laggTill(omgang('DOK-2', 'Åtgärd krävs', { fynd: [fynd('AD-KONTAKT-5'), fynd('FIL-ZIP-1')] }));
    await logg.laggTill(omgang('DOK-3', 'Mänsklig bedömning', { fynd: [fynd('AD-KONTAKT-5'), fynd('AR-TITEL-1')] }));

    const oversikt = await hamtaKvalitetsoversikt(loggfil);

    assert.deepEqual(
      oversikt.vanligasteFynd.rader.map((rad) => [rad.regelId, rad.antal]),
      [
        ['AD-KONTAKT-5', 3],
        ['FIL-ZIP-1', 2],
        ['AR-TITEL-1', 1],
      ],
    );
  });

  it('[TI04] två motorers fynd på samma regel i samma omgång räknas en gång', async () => {
    // S04 och S05 rapporterar båda t.ex. FIL-LASBAR-1. Det är ett problem med
    // dokumentet, inte två, och får inte blåsa upp rankingen.
    await logg.laggTill(
      omgang('DOK-1', 'Mänsklig bedömning', {
        fynd: [fynd('FIL-LASBAR-1'), { ...fynd('FIL-LASBAR-1'), metod: 'AI-bedömning' }],
      }),
    );
    // Samma dokument, ny omgång efter rättning: den räknas för sig.
    await logg.laggTill(omgang('DOK-1', 'Åtgärd krävs', { fynd: [fynd('FIL-LASBAR-1')] }));

    const oversikt = await hamtaKvalitetsoversikt(loggfil);

    assert.deepEqual(
      oversikt.vanligasteFynd.rader.map((rad) => [rad.regelId, rad.antal]),
      [['FIL-LASBAR-1', 2]],
    );
  });

  it('S03 [OC03] [TI01,TI05] degraderade rättningar räknas inte som utförda', async () => {
    for (let i = 0; i < 5; i++) {
      await logg.laggTill(post(`DOK-${i}`, { andringar: [rattning('AD-KONTAKT-5')] }));
    }
    // Den sjätte rättningen misslyckades och blev ett förslag: fyndet loggades,
    // men ingen ändring skrevs (S06 TI04).
    await logg.laggTill(omgang('DOK-6', 'Åtgärd krävs', { fynd: [fynd('AD-KONTAKT-5')] }));

    const oversikt = await hamtaKvalitetsoversikt(loggfil);

    assert.equal(oversikt.autoRattningar.totalt, 5);
  });

  it('[TI05] en ändring utanför allowlisten räknas aldrig som auto-rättning', async () => {
    await logg.laggTill(
      post('DOK-1', {
        andringar: [
          { falt: 'dokumentdatum', fore: 'a', efter: 'b', automatisk: true, regelId: 'AD-DATUM-1' },
          { falt: 'titel', fore: 'a', efter: 'b', automatisk: false, regelId: 'AD-TITEL-2' },
        ],
      }),
    );

    const oversikt = await hamtaKvalitetsoversikt(loggfil);

    assert.equal(oversikt.autoRattningar.totalt, 0);
    assert.equal(oversikt.autoRattningar.forklaring, TOMMA_LAGEN.rattningar);
  });

  it('S04 [OC03] [TI01,TI06] felbedömningsandelen räknas på stickproven, inte på alla dokument', async () => {
    for (let i = 0; i < 200; i++) await logg.laggTill(omgang(`DOK-${i}`, 'Godkänd'));
    for (let i = 0; i < 20; i++) {
      const beslut = i < 4 ? 'stickprov: felbedömning' : 'stickprov: korrekt bedömt';
      await logg.laggTill(post(`DOK-${i}`, { manskligaBeslut: [stickprovsbeslut(beslut)] }));
    }

    const oversikt = await hamtaKvalitetsoversikt(loggfil);

    assert.equal(oversikt.antalGranskadeDokument, 200);
    assert.equal(oversikt.stickprov.antalStickprov, 20);
    assert.equal(oversikt.stickprov.antalFelbedomningar, 4);
    // 4 av 20 stickprov, inte 4 av 200 registrerade dokument.
    assert.equal(oversikt.stickprov.andel, 20);
  });

  it('S05 [OC03] [TI06] utan stickprov visas en förklaring i stället för noll procent', async () => {
    await logg.laggTill(omgang('DOK-1', 'Godkänd'));

    const oversikt = await hamtaKvalitetsoversikt(loggfil);

    assert.equal(oversikt.stickprov.andel, null);
    assert.equal(oversikt.stickprov.antalStickprov, 0);
    assert.equal(oversikt.stickprov.forklaring, TOMMA_LAGEN.stickprov);
  });

  it('S06 [OC04] [TI01,TI07] en tom logg ger förklarade tomma lägen i varje sektion', async () => {
    const oversikt = await hamtaKvalitetsoversikt(loggfil);

    assert.equal(oversikt.forklaring, TOMMA_LAGEN.logg);
    assert.equal(oversikt.statusfordelning.forklaring, TOMMA_LAGEN.dokument);
    assert.equal(oversikt.vanligasteFynd.forklaring, TOMMA_LAGEN.fynd);
    assert.equal(oversikt.autoRattningar.forklaring, TOMMA_LAGEN.rattningar);
    assert.equal(oversikt.stickprov.forklaring, TOMMA_LAGEN.stickprov);
    // Inga NaN: andelarna är noll, inte odefinierade.
    for (const rad of oversikt.statusfordelning.rader) assert.equal(rad.andel, 0);
    assert.equal(oversikt.antalGranskadeDokument, 0);
  });

  it('[TI01] loggbred läsning ser alla dokument, och en post som tillkommit sedan förra läsningen', async () => {
    await logg.laggTill(omgang('DOK-1', 'Godkänd'));
    await logg.laggTill(omgang('DOK-2', 'Godkänd'));
    const forsta = await hamtaKvalitetsoversikt(loggfil);

    await logg.laggTill(omgang('DOK-3', 'Mänsklig bedömning'));
    const andra = await hamtaKvalitetsoversikt(loggfil);

    assert.equal(forsta.antalGranskadeDokument, 2);
    // Siffrorna räknas om mot loggen varje gång, utan cache (FR13).
    assert.equal(andra.antalGranskadeDokument, 3);
    assert.equal((await lasAllaPoster(loggfil)).length, 3);
  });

  it('[TI01] en logg som inte finns ännu ger tom lista, inte ett fel', async () => {
    const oversikt = await hamtaKvalitetsoversikt(join(katalog, 'finns-inte.jsonl'));

    assert.equal(oversikt.antalGranskadeDokument, 0);
    assert.equal(oversikt.forklaring, TOMMA_LAGEN.logg);
  });

  it('[TI02] en post utan statusbyte påverkar inte fördelningen', () => {
    // Rättningsposter bär bara en ändring. De ska inte skapa ett dokument i
    // statistiken, bara bidra till rättningsräkningen.
    const oversikt = sammanstallOversikt([
      post('DOK-1', { andringar: [rattning('AD-KONTAKT-5')] }),
    ]);

    assert.equal(oversikt.antalGranskadeDokument, 0);
    assert.equal(oversikt.autoRattningar.totalt, 1);
  });
});

describe('S12:s strukturkriterier', () => {
  it('modulen exporterar ingen skrivväg', async () => {
    const modul = await import('./index.ts');

    assert.deepEqual(Object.keys(modul).sort(), [
      'KvalitetsLasfel',
      'STATUSAR',
      'TOMMA_LAGEN',
      'hamtaKvalitetsoversikt',
      'lasAllaPoster',
      'sammanstallOversikt',
    ]);
  });

  it('källkoden anropar aldrig loggens append', async () => {
    const { readFileSync } = await import('node:fs');
    for (const namn of ['oversikt.ts', 'lasning.ts', 'index.ts']) {
      const kalla = readFileSync(new URL(namn, import.meta.url), 'utf8');
      assert.doesNotMatch(kalla, /laggTill|oppnaKontrollogg/);
    }
  });
});
