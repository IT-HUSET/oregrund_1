/**
 * Acceptansscenarier för S04 (`docs/s04-deterministisk-granskningsmotor.md`).
 * Fixturerna är `casedetails/testcases.json` direkt, så testerna håller sig i
 * synk med S09:s kommande testsvit i stället för att driva iväg från den.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { loadChecklistCatalog } from '../rule-catalog.ts';
import { loadKlassificeringsstruktur, loadKontaktregister } from '../reference-data.ts';
import type { GranskatDokument, Regelutfall } from './kontrakt.ts';
import { MotorKonfigurationsfel, skapaDeterministiskMotor } from './motor.ts';
import { S04_REGEL_IDN } from './regler.ts';

interface Testfall {
  case_id: string;
  arende: GranskatDokument['arende'];
  arendedokument: GranskatDokument['arendedokument'];
  fil?: GranskatDokument['fil'];
  dokumenttext?: string;
  expected_findings: { rule: string }[];
}

const testfall: Testfall[] = JSON.parse(
  readFileSync(new URL('../../../casedetails/testcases.json', import.meta.url), 'utf8'),
).cases;

const katalog = loadChecklistCatalog();
const referensdata = {
  kontaktregister: loadKontaktregister(),
  klassificeringsstruktur: loadKlassificeringsstruktur(),
};
const motor = skapaDeterministiskMotor(katalog, referensdata);

function fixtur(caseId: string): GranskatDokument {
  const tc = testfall.find((c) => c.case_id === caseId);
  assert.ok(tc, `Testfall ${caseId} saknas`);
  return {
    arende: tc.arende,
    arendedokument: tc.arendedokument,
    fil: tc.fil,
    dokumenttext: tc.dokumenttext,
  };
}

function utfallFor(utfall: Regelutfall[], regelId: string): Regelutfall {
  const traff = utfall.find((u) => u.regelId === regelId);
  assert.ok(traff, `Regel ${regelId} saknar utfall`);
  return traff;
}

/**
 * Fynd som testfallen förväntar sig men som hör till S05:s innehållsdel av en
 * kombinerad regel (M/C, M+L/C). S04 äger bara metadata- och uppslagsdelen, och
 * i de här fallen är metadatan i sig korrekt – processen finns, handlingstypen
 * är tillåten, kategorin är ett giltigt värde. Det är innehållet som avviker.
 */
const S05_DELFYND: Record<string, string[]> = {
  'TC-11': ['AD-HANDLINGSTYP-1'],
  'TC-12': ['AD-KATEGORI-1'],
  'TC-19': ['AR-PROCESS-1'],
  'TC-20': ['AR-PROCESS-1', 'AD-HANDLINGSTYP-1'],
};

function fyndIdn(utfall: Regelutfall[]): string[] {
  return utfall.filter((u) => u.utfall === 'fynd').map((u) => u.regelId);
}

describe('deterministisk granskningsmotor (S04)', () => {
  it('S01 [OC01] [TI01,TI09] TC-01 ger uppfylld på hela motorns regelset', () => {
    const utfall = motor.granska(fixtur('TC-01'));

    assert.equal(utfall.length, 22);
    assert.deepEqual(fyndIdn(utfall), []);
    // TC-01 är baseline: allt motorn kan pröva ska vara uppfyllt, inget "ej genomförd".
    assert.deepEqual(
      [...new Set(utfall.map((u) => u.utfall))].sort(),
      ['ej tillämplig', 'uppfylld'],
    );
  });

  it('S02 [OC01,OC02,OC03] [TI02,TI08] AD-KONTAKT-5 ger fynd utan att rätta fältet', () => {
    const dokument = fixtur('TC-08');

    const utfall = utfallFor(motor.granska(dokument), 'AD-KONTAKT-5');

    assert.equal(utfall.utfall, 'fynd');
    assert.equal(utfall.fynd?.evidens, 'Clas Olsson');
    assert.match(utfall.fynd?.forklaring ?? '', /Kopia till/);
    // Auto-rättningen ägs av S06. Motorn får inte ha rört dokumentet.
    assert.equal(dokument.arendedokument.kopia_till, 'Clas Olsson');
  });

  it('S03 [OC01,OC02,OC04] [TI03,TI08] AD-KONTAKT-2 ger det föreskrivna rättningsförslaget', () => {
    const utfall = utfallFor(motor.granska(fixtur('TC-09')), 'AD-KONTAKT-2');

    assert.equal(utfall.utfall, 'fynd');
    // PRD:ns formulering, ordagrant. Ingen kontakt hittas på (TC-09).
    assert.equal(utfall.fynd?.rattningsforslag, 'beställ ny kontakt av registraturen');
    assert.match(utfall.fynd?.evidens ?? '', /Myndigheten för digital förvaltningsutveckling/);
  });

  it('S04 [OC01,OC02,OC04] [TI04,TI08] AR-PROCESS-1 slår bara på processens existens', () => {
    const okand = fixtur('TC-01');
    okand.arende = { ...okand.arende, process: '9.9 - Hitta på en process' };

    const fynd = utfallFor(motor.granska(okand), 'AR-PROCESS-1');
    assert.equal(fynd.utfall, 'fynd');
    assert.match(fynd.fynd?.evidens ?? '', /9\.9/);

    // TC-19:s process finns i strukturen; att den inte stämmer med innehållet är S05:s del.
    assert.equal(utfallFor(motor.granska(fixtur('TC-19')), 'AR-PROCESS-1').utfall, 'uppfylld');
  });

  it('S05 [OC01,OC02] [TI05,TI08] AD-DATUM-1 ger fynd när handlingens eget datum avviker', () => {
    const utfall = utfallFor(motor.granska(fixtur('TC-10')), 'AD-DATUM-1');

    assert.equal(utfall.utfall, 'fynd');
    assert.match(utfall.fynd?.evidens ?? '', /2026-08-25/);
    assert.match(utfall.fynd?.evidens ?? '', /2026-07-01/);
  });

  it('S05 [OC01] [TI05] AD-DATUM-1 jämför inte datum som saknar ledtrådsord', () => {
    // TC-13 nämner "vann laga kraft 2026-05-20" och "avtal tecknades 2026-06-01".
    // Inget av dem är handlingens eget datum, så de får inte ge ett fynd.
    assert.equal(utfallFor(motor.granska(fixtur('TC-13')), 'AD-DATUM-1').utfall, 'uppfylld');
    // TC-12 anger både "(inkommet …)" och "expedierat …", båda registrerade.
    assert.equal(utfallFor(motor.granska(fixtur('TC-12')), 'AD-DATUM-1').utfall, 'uppfylld');
  });

  it('S06 [OC01,OC02] [TI06,TI08] TC-15 ger FIL-ZIP-1 och FIL-ANTAL-1 utan uppackning', () => {
    const dokument = fixtur('TC-15');

    const utfall = motor.granska(dokument);

    assert.equal(utfallFor(utfall, 'FIL-ZIP-1').utfall, 'fynd');
    const antal = utfallFor(utfall, 'FIL-ANTAL-1');
    assert.equal(antal.utfall, 'fynd');
    assert.match(antal.fynd?.evidens ?? '', /3/);
    // Uppackningen ägs av S06. Fillistan ska vara orörd.
    assert.deepEqual(dokument.fil?.filer, ['anbud_bilagor.zip']);
    assert.equal(dokument.fil?.ar_uppackad, false);
  });

  it('S07 [OC01] [TI06] Utan filer blir fem filregler ej tillämpliga, FIL-ANTAL-1 inte', () => {
    const utanFiler = fixtur('TC-01');
    utanFiler.fil = { filer: [] };
    utanFiler.arendedokument = { ...utanFiler.arendedokument, antal_bilagor: 2 };

    const utfall = motor.granska(utanFiler);

    for (const regelId of ['FIL-MISSIV-1', 'FIL-ZIP-1', 'FIL-LASBAR-1', 'FIL-SKANN-1', 'FIL-UNDERTECKNAD-1']) {
      assert.equal(utfallFor(utfall, regelId).utfall, 'ej tillämplig', regelId);
    }
    // FIL-ANTAL-1 utvärderas alltid: två angivna bilagor utan filer är ett fynd.
    assert.equal(utfallFor(utfall, 'FIL-ANTAL-1').utfall, 'fynd');
  });

  it('S08 [OC01,OC02] [TI07] AD-SEKRETESS-1 flaggar utan AI och utan att röra skyddskoden', () => {
    const dokument = fixtur('TC-13');

    const utfall = utfallFor(motor.granska(dokument), 'AD-SEKRETESS-1');

    assert.equal(utfall.utfall, 'fynd');
    // Metoden visar att regeln kräver mänskligt omdöme, utan att något AI-anrop skett.
    assert.match(utfall.fynd?.metod ?? '', /H/);
    assert.match(utfall.fynd?.forklaring ?? '', /människa/);
    assert.equal(dokument.arendedokument.skyddskod, 'Sekretess');
    // Sekretessregeln gäller bara avslutade ärenden: TC-19 har skyddskod men är inte avslutat.
    assert.equal(utfallFor(motor.granska(fixtur('TC-19')), 'AD-SEKRETESS-1').utfall, 'uppfylld');
  });

  it('[TI09] varje testfall ger exakt ett utfall per ägt regel-ID', () => {
    for (const tc of testfall) {
      const utfall = motor.granska(fixtur(tc.case_id));

      assert.deepEqual(
        utfall.map((u) => u.regelId).sort(),
        [...S04_REGEL_IDN].sort(),
        `${tc.case_id} saknar eller dubblerar utfall`,
      );
    }
  });

  it('[TI08] varje fynd har FR6:s fält och aldrig konfidens', () => {
    for (const tc of testfall) {
      for (const utfall of motor.granska(fixtur(tc.case_id))) {
        if (utfall.utfall !== 'fynd') {
          assert.equal(utfall.fynd, undefined, `${tc.case_id}/${utfall.regelId}`);
          continue;
        }
        const fynd = utfall.fynd;
        assert.ok(fynd, `${tc.case_id}/${utfall.regelId} saknar fynd`);
        assert.equal(fynd.regelId, utfall.regelId);
        assert.ok(fynd.regeltext.length > 0);
        assert.ok(fynd.allvarlighetsgrad.length > 0);
        assert.ok(fynd.metod.length > 0);
        assert.ok(fynd.evidens.length > 0, `${tc.case_id}/${utfall.regelId} saknar evidens`);
        assert.ok(fynd.forklaring.length > 0, `${tc.case_id}/${utfall.regelId} saknar förklaring`);
        assert.equal('konfidens' in fynd, false, `${tc.case_id}/${utfall.regelId} har konfidens`);
      }
    }
  });

  it('motorn hittar varje deterministiskt fynd testfallen förväntar sig', () => {
    const agda = new Set(S04_REGEL_IDN);

    for (const tc of testfall) {
      const forvantade = tc.expected_findings
        .map((f) => f.rule)
        .filter((id) => agda.has(id) && !(S05_DELFYND[tc.case_id] ?? []).includes(id));
      const faktiska = new Set(fyndIdn(motor.granska(fixtur(tc.case_id))));

      for (const regelId of forvantade) {
        assert.ok(faktiska.has(regelId), `${tc.case_id}: ${regelId} förväntades men uteblev`);
      }
    }
  });

  it('S05:s innehållsdel av en kombinerad regel ger uppfylld här, inte ett fynd', () => {
    // Sömmen mot S05: motorn får aldrig låtsas kunna bedöma innehåll. Om en
    // handler börjar läsa dokumenttext för de här reglerna fallerar testet.
    for (const [caseId, regelIdn] of Object.entries(S05_DELFYND)) {
      const utfall = motor.granska(fixtur(caseId));
      for (const regelId of regelIdn) {
        assert.equal(utfallFor(utfall, regelId).utfall, 'uppfylld', `${caseId}/${regelId}`);
      }
    }
  });

  it('baseline-fallen ger inga fynd alls', () => {
    for (const caseId of ['TC-01', 'TC-02']) {
      assert.deepEqual(fyndIdn(motor.granska(fixtur(caseId))), [], caseId);
    }
  });
});

describe('motorns konstruktion och avgränsning (S04, strukturkriterier)', () => {
  it('[TI01] motorn registrerar exakt de 22 S04-ägda reglerna', () => {
    assert.equal(motor.regelIdn.length, 22);
    assert.deepEqual([...motor.regelIdn].sort(), [...S04_REGEL_IDN].sort());
  });

  it('[TI01] en katalog utan ett S04-ägt regel-ID gör att konstruktionen fallerar', () => {
    const utanZipregel = {
      ...katalog,
      rules: katalog.rules.filter((regel) => regel.id !== 'FIL-ZIP-1'),
    };

    assert.throws(
      () => skapaDeterministiskMotor(utanZipregel, referensdata),
      (fel: unknown) => fel instanceof MotorKonfigurationsfel && fel.regelId === 'FIL-ZIP-1',
    );
  });

  it('ingen handler finns för en ren C/H-regel – de ägs av S05', () => {
    for (const regelId of ['AR-TITEL-1', 'AR-TITEL-3', 'AR-TITEL-4', 'AR-KONTAKT-1', 'AD-TITEL-1', 'AD-TITEL-3', 'AD-TITEL-4']) {
      assert.equal(S04_REGEL_IDN.includes(regelId), false, regelId);
    }
  });

  it('motorn importerar ingen AI-klient', () => {
    const kallor = ['motor.ts', 'regler.ts', 'kontrakt.ts', 'index.ts'].map((namn) =>
      readFileSync(new URL(namn, import.meta.url), 'utf8'),
    );

    for (const kalla of kallor) {
      assert.doesNotMatch(kalla, /anthropic|@anthropic-ai|claude/i);
    }
  });

  it('granskningen lämnar dokumentet oförändrat', () => {
    for (const tc of testfall) {
      const dokument = fixtur(tc.case_id);
      const innan = JSON.stringify(dokument);

      motor.granska(dokument);

      assert.equal(JSON.stringify(dokument), innan, tc.case_id);
    }
  });
});
