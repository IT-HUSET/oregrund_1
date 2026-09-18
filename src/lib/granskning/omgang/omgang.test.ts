/**
 * Acceptansscenarier för S06 (`docs/s06-granskningsomgang-status-auto-rattning-och-logg.md`).
 * Fixturerna är testcases.json:s TC-01/TC-08/TC-13/TC-15, och AI-klienten är
 * alltid en stub – ingen testkörning når ett nätverk (NFR Security).
 */

import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { oppnaKontrollogg, type Kontrollogg } from '../../kontrollogg/index.ts';
import type { KontrolloggPost } from '../../kontrollogg/types.ts';
import { loadChecklistCatalog, type ChecklistCatalog } from '../../rule-catalog.ts';
import { loadKlassificeringsstruktur, loadKontaktregister } from '../../reference-data.ts';
import type { AiKlient, AiVerdikt } from '../ai/klient.ts';
import type { GranskatDokument, Regelutfall } from '../kontrakt.ts';
import { korGranskningsomgang, type Granskningsomgang } from './omgang.ts';
import { slaSammanUtfall } from './sammanslagning.ts';
import { AUTO_RATTNINGSBARA } from './rattning.ts';

const FIXTURKATALOG = new URL('../../../../test/fixtures/', import.meta.url);

const katalog = loadChecklistCatalog();
const referensdata = {
  kontaktregister: loadKontaktregister(),
  klassificeringsstruktur: loadKlassificeringsstruktur(),
};

const testcases = JSON.parse(
  readFileSync(new URL('../../../../casedetails/testcases.json', import.meta.url), 'utf8'),
).cases as (GranskatDokument & { case_id: string })[];

/** Dokumentet som S03 lämnar det: status tvingad till "Färdig". */
function fixtur(caseId: string): GranskatDokument {
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

/** AI-klient som aldrig hittar något, så testerna mäter S06 och inte S05. */
function tystKlient(): AiKlient {
  return { modell: 'stub-modell', bedom: async () => ({ ok: true, verdikt: intetFynd }) };
}

let katalogdir: string;
let loggfil: string;
let logg: Kontrollogg;

beforeEach(() => {
  katalogdir = mkdtempSync(join(tmpdir(), 'omgang-'));
  loggfil = join(katalogdir, 'kontrollogg.jsonl');
  logg = oppnaKontrollogg(loggfil);
});

afterEach(() => {
  rmSync(katalogdir, { recursive: true, force: true });
});

function loggposter(): KontrolloggPost[] {
  const innehall = readFileSync(loggfil, 'utf8').trim();
  return innehall === '' ? [] : innehall.split('\n').map((rad) => JSON.parse(rad) as KontrolloggPost);
}

function kor(
  dokument: GranskatDokument,
  extra: Partial<Parameters<typeof korGranskningsomgang>[0]> = {},
): Promise<Granskningsomgang> {
  return korGranskningsomgang({
    dokument,
    katalog,
    referensdata,
    klient: tystKlient(),
    logg,
    ...extra,
  });
}

const filkalla = (filnamn: string): string | undefined =>
  filnamn === 'anbud_bilagor.zip' ? new URL('anbud_bilagor.zip', FIXTURKATALOG).pathname : undefined;

describe('granskningsomgång (S06)', () => {
  it('S01 [OC01] [TI01,TI06,TI08] TC-13 ger Mänsklig bedömning och rör inte skyddskoden', async () => {
    const dokument = fixtur('TC-13');

    const omgang = await kor(dokument);

    assert.equal(omgang.status, 'Mänsklig bedömning');
    assert.equal(dokument.arendedokument.skyddskod, 'Sekretess');
    // Mänsklig bedömning registrerar aldrig dokumentet.
    assert.equal(dokument.arendedokument['status'], 'Färdig');
  });

  it('S02 [OC01,OC02,OC03] [TI03,TI05,TI06,TI07] TC-08 auto-rättas till Autokorrigerad och Registrerat', async () => {
    const dokument = fixtur('TC-08');

    const omgang = await kor(dokument);

    assert.equal(dokument.arendedokument.kopia_till, '');
    assert.equal(omgang.status, 'Autokorrigerad');
    assert.equal(omgang.dokumentstatus, 'Registrerat');
    assert.equal(dokument.arendedokument['status'], 'Registrerat');

    const poster = loggposter();
    const andring = poster.flatMap((post) => post.andringar).find((a) => a.falt === 'kopia_till');
    assert.ok(andring, 'rättningen saknar loggpost');
    assert.equal(andring.fore, 'Clas Olsson');
    assert.equal(andring.efter, '');
    assert.equal(andring.automatisk, true);
    // Statusbytet ligger i omgångens egen post.
    const statusbyten = poster.flatMap((post) => post.statusbyten);
    assert.ok(statusbyten.some((b) => b.typ === 'dokumentstatus' && b.till === 'Registrerat'));
  });

  it('S03 [OC01,OC03] [TI03,TI05,TI06] TC-15 packas upp men Åtgärd krävs kvarstår', async () => {
    const dokument = fixtur('TC-15');

    const omgang = await kor(dokument, { filkalla });

    // Zip-filen är ersatt av sitt innehåll, och omkörningen prövar FIL-ANTAL-1 mot det.
    assert.deepEqual(dokument.fil?.filer, ['prisbilaga.pdf', 'referenslista.pdf']);
    assert.equal(dokument.fil?.ar_uppackad, true);
    assert.equal(omgang.tillampadeRattningar.length, 1);
    const antal = omgang.utfall.find((rad) => rad.regelId === 'FIL-ANTAL-1');
    assert.equal(antal?.utfall, 'fynd', 'tre bilagor mot två filer ska fortfarande avvika');
    assert.equal(omgang.status, 'Åtgärd krävs');
    assert.equal(dokument.arendedokument['status'], 'Färdig');
  });

  it('S03 [OC03] [TI05] omkörningen sker exakt en gång och rättar inte om', async () => {
    const dokument = fixtur('TC-15');

    await kor(dokument, { filkalla });

    // En enda rättningspost: omkörningens fynd auto-rättas inte på nytt (FR5).
    const andringar = loggposter().flatMap((post) => post.andringar);
    assert.equal(andringar.length, 1);
    assert.equal(andringar[0]?.regelId, 'FIL-ZIP-1');
  });

  it('S05 [OC04] [TI02,TI04,TI06] misslyckad loggskrivning avbryter rättningen', async (t) => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      t.skip('root kringgår filrättigheter');
      return;
    }
    const dokument = fixtur('TC-08');
    writeFileSync(loggfil, '', 'utf8');
    chmodSync(loggfil, 0o444);

    let omgang: Granskningsomgang;
    try {
      omgang = await kor(dokument);
    } finally {
      chmodSync(loggfil, 0o644);
    }

    // Ingen mutation utan logg (ADR Beslut 3).
    assert.equal(dokument.arendedokument.kopia_till, 'Clas Olsson');
    assert.deepEqual(loggposter(), []);
    assert.equal(omgang.status, 'Åtgärd krävs');
    assert.ok(omgang.fel.length > 0);
    const degraderad = omgang.degraderadeRattningar.find((rad) => rad.regelId === 'AD-KONTAKT-5');
    assert.match(degraderad?.meddelande ?? '', /Automatisk rättning av Kopia till misslyckades/);
  });

  it('S06 [OC02] [TI03] en felkonfigurerad auto-flagga ger ingen mutation', async () => {
    // AD-DATUM-1 bär auto-rättningsflagga av misstag. Allowlisten är hårdkodad,
    // så flaggan kan inte bredda mutationsytan.
    const felkonfigurerad: ChecklistCatalog = {
      ...katalog,
      rules: katalog.rules.map((regel) =>
        regel.id === 'AD-DATUM-1' ? { ...regel, autoRattning: true } : regel,
      ),
    };
    const dokument = fixtur('TC-10');
    const datumInnan = dokument.arendedokument.dokumentdatum;

    const omgang = await korGranskningsomgang({
      dokument,
      katalog: felkonfigurerad,
      referensdata,
      klient: tystKlient(),
      logg,
    });

    assert.equal(dokument.arendedokument.dokumentdatum, datumInnan);
    assert.equal(dokument.arendedokument.ankomstdatum, '2026-08-25');
    assert.deepEqual(omgang.tillampadeRattningar, []);
    assert.deepEqual(AUTO_RATTNINGSBARA, ['AD-KONTAKT-5', 'FIL-ZIP-1']);
  });

  it('[TI06,TI07] TC-01 ger Godkänd och Registrerat', async () => {
    const dokument = fixtur('TC-01');

    const omgang = await kor(dokument);

    assert.equal(omgang.status, 'Godkänd');
    assert.equal(dokument.arendedokument['status'], 'Registrerat');
    assert.deepEqual(omgang.fynd, []);
  });

  it('[TI01] omgången ger ett utfall per katalogregel', async () => {
    const omgang = await kor(fixtur('TC-01'));

    assert.equal(omgang.utfall.length, katalog.rules.length);
    assert.deepEqual(
      omgang.utfall.map((rad) => rad.regelId),
      katalog.rules.map((regel) => regel.id),
    );
  });

  it('[TI02] varje granskningsomgång lämnar en loggpost med utfall och fynd', async () => {
    await kor(fixtur('TC-13'));

    const omgangsposter = loggposter().filter((post) => post.regelutfall.length > 0);
    assert.equal(omgangsposter.length, 1);
    const post = omgangsposter[0];
    assert.equal(post?.regelutfall.length, katalog.rules.length);
    assert.ok(post?.fynd.some((fynd) => fynd.regelId === 'AD-SEKRETESS-1'));
    assert.equal(post?.regelkatalogVersion, katalog.version);
    assert.equal(post?.aiModell, 'stub-modell');
  });

  it('[TI07] ett uttryckligt mänskligt beslut kan registrera dokumentet, och loggas', async () => {
    const dokument = fixtur('TC-13');

    const omgang = await kor(dokument, {
      manskligtBeslut: {
        roll: 'Registrator',
        beslut: 'registrerat efter bedömning',
        motivering: 'Sekretessen gäller fortfarande, dokumentet registreras ändå.',
        sattDokumentstatus: 'Registrerat',
      },
    });

    assert.equal(omgang.status, 'Mänsklig bedömning');
    assert.equal(dokument.arendedokument['status'], 'Registrerat');
    const beslut = loggposter().flatMap((post) => post.manskligaBeslut);
    assert.equal(beslut.length, 1);
    assert.equal(beslut[0]?.roll, 'Registrator');
    assert.ok((beslut[0]?.motivering ?? '').length > 0);
  });
});

describe('sammanslagning av motorernas utfall (S06 TI01)', () => {
  const uppfylld = (regelId: string): Regelutfall => ({ regelId, utfall: 'uppfylld' });
  const fynd = (regelId: string, evidens: string): Regelutfall => ({
    regelId,
    utfall: 'fynd',
    fynd: {
      regelId,
      regeltext: 'regeltext',
      allvarlighetsgrad: 'Lagkrav',
      metod: 'AI-bedömning',
      evidens,
      forklaring: 'Innehållet pekar på fel mottagare.',
      konfidens: 0.9,
    },
  });

  it('S04 [OC01] [TI01] ett fynd från en motor vinner över uppfylld från den andra', () => {
    const deterministiska = [uppfylld('AD-KONTAKT-1')];
    const ai = [fynd('AD-KONTAKT-1', 'brevet är ställt till någon annan')];

    const sammanslaget = slaSammanUtfall(katalog, deterministiska, ai);

    const rad = sammanslaget.find((r) => r.regelId === 'AD-KONTAKT-1');
    assert.equal(rad?.utfall, 'fynd');
    // Fyndet får inte tystas av det uppfyllda delutfallet.
    assert.equal(rad?.fynd.length, 1);
    assert.equal(rad?.fynd[0]?.evidens, 'brevet är ställt till någon annan');
  });

  it('[TI01] fynd från båda motorerna för samma regel behålls båda', () => {
    const sammanslaget = slaSammanUtfall(
      katalog,
      [{ ...fynd('AD-HANDLINGSTYP-1', 'metadata'), fynd: { ...fynd('AD-HANDLINGSTYP-1', 'metadata').fynd!, metod: 'M+L/C' } }],
      [fynd('AD-HANDLINGSTYP-1', 'innehåll')],
    );

    const rad = sammanslaget.find((r) => r.regelId === 'AD-HANDLINGSTYP-1');
    assert.equal(rad?.utfall, 'fynd');
    assert.deepEqual(rad?.fynd.map((f) => f.evidens).sort(), ['innehåll', 'metadata']);
  });

  it('[TI01] ej genomförd vinner över fynd, och en regel utan utfall blir ej genomförd', () => {
    const sammanslaget = slaSammanUtfall(
      katalog,
      [{ regelId: 'AR-TITEL-1', utfall: 'ej genomförd', orsak: 'AI-tjänsten svarade inte' }],
      [fynd('AR-TITEL-1', 'oklar titel')],
    );

    assert.equal(sammanslaget.find((r) => r.regelId === 'AR-TITEL-1')?.utfall, 'ej genomförd');
    // Ingen motor rapporterade AD-TITEL-1 i det här anropet.
    const orapporterad = sammanslaget.find((r) => r.regelId === 'AD-TITEL-1');
    assert.equal(orapporterad?.utfall, 'ej genomförd');
    assert.match(orapporterad?.orsak ?? '', /Ingen motor/);
  });
});

describe('S06:s strukturkriterier', () => {
  it('ingen skrivväg tilldelar datum, diarienummer eller skyddskod', () => {
    const kallor = ['omgang.ts', 'rattning.ts', 'status.ts', 'sammanslagning.ts', 'zip.ts'].map(
      (namn) => readFileSync(new URL(namn, import.meta.url), 'utf8'),
    );

    for (const kalla of kallor) {
      assert.doesNotMatch(kalla, /\b(ankomstdatum|dokumentdatum|diarienummer|skyddskod)\s*=[^=]/);
    }
  });

  it('allowlisten innehåller exakt de två auto-rättningsbara reglerna', () => {
    assert.deepEqual([...AUTO_RATTNINGSBARA], ['AD-KONTAKT-5', 'FIL-ZIP-1']);
    // Katalogens egna flaggor ska stämma med allowlisten.
    const flaggade = katalog.rules.filter((regel) => regel.autoRattning).map((regel) => regel.id);
    assert.deepEqual(flaggade.sort(), ['AD-KONTAKT-5', 'FIL-ZIP-1']);
  });
});
