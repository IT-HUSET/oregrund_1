/**
 * Testsvitens körare (S09 TI02, TI03, TI07).
 *
 * Ett kommando läser in samtliga 20 fall ur `casedetails/testcases.json` via
 * S03, driver exakt en granskningsomgång per fall via S06:s entry point och
 * jämför mot facit. Ett fels fall stoppar aldrig de övriga.
 *
 * AI-klienten är stubbad: sviten ska gå att köra utan API-nyckel och utan
 * nätverk. Innehållsregler som bara en riktig modell kan avgöra rapporteras
 * som "kräver live-läge", aldrig som godkända.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { lasInDokument } from '../../lib/ingest.js';
import type { AiKlient } from '../lib/granskning/ai/klient.ts';
import type { GranskatDokument } from '../lib/granskning/kontrakt.ts';
import { korGranskningsomgang } from '../lib/granskning/omgang/omgang.ts';
import { oppnaKontrollogg } from '../lib/kontrollogg/index.ts';
import { loadChecklistCatalog } from '../lib/rule-catalog.ts';
import { loadKlassificeringsstruktur, loadKontaktregister } from '../lib/reference-data.ts';
import { slaUppFixtur } from './fixturer.ts';
import {
  jamforFall,
  sammanstall,
  SKYDDADE_FALT,
  type Falljamforelse,
  type Sammanstallning,
} from './komparator.ts';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROT = path.join(MODULE_DIR, '..', '..');
const TESTCASES = path.join(ROT, 'casedetails', 'testcases.json');

interface Testfall {
  case_id: string;
  arende: Record<string, unknown>;
  arendedokument: Record<string, unknown>;
  fil?: Record<string, unknown> | null;
  dokumenttext?: string;
  expected_status: string;
  expected_findings: { rule: string }[];
}

export interface Korningsalternativ {
  /** Loggfil för körningen. Standard: en temporär fil per körning. */
  loggfil: string;
  /** Fall vars fixtur ska låtsas saknas, för att verifiera felvägen. */
  saknadeFixturer?: string[];
}

export interface Korningsresultat {
  rader: Falljamforelse[];
  sammanstallning: Sammanstallning;
}

/** Klient som aldrig hittar något och aldrig når nätverket. */
export function stubbadKlient(): AiKlient {
  return {
    modell: 'stub (ingen AI-bedömning)',
    bedom: async () => ({
      ok: true,
      verdikt: { fynd: false, konfidens: 1, evidens: '', forklaring: '' },
    }),
  };
}

function lasTestfall(): Testfall[] {
  return (JSON.parse(readFileSync(TESTCASES, 'utf8')) as { cases: Testfall[] }).cases;
}

/** Ögonblicksbild av de fält automatiken aldrig får ändra. Typen tvingar fram
 * en post per fält i `SKYDDADE_FALT`, så listorna inte kan glida isär. */
function faltvarden(dokument: GranskatDokument): Record<(typeof SKYDDADE_FALT)[number], unknown> {
  return {
    ankomstdatum: dokument.arendedokument.ankomstdatum,
    dokumentdatum: dokument.arendedokument.dokumentdatum,
    diarienummer: dokument.arende.diarienummer,
    skyddskod: dokument.arendedokument.skyddskod,
  };
}

function testsvitsfel(caseId: string, forvantadStatus: string, anmarkning: string): Falljamforelse {
  return {
    caseId,
    dom: 'testsvitsfel',
    forvantadStatus,
    faktiskStatus: '-',
    statusStammer: false,
    hittadeFynd: [],
    saknadeFynd: [],
    extraFynd: [],
    brutnaFaltskydd: [],
    anmarkning,
  };
}

export async function korTestsvit(alternativ: Korningsalternativ): Promise<Korningsresultat> {
  const katalog = loadChecklistCatalog();
  const referensdata = {
    kontaktregister: loadKontaktregister(),
    klassificeringsstruktur: loadKlassificeringsstruktur(),
  };
  const logg = oppnaKontrollogg(alternativ.loggfil);
  const saknade = new Set(alternativ.saknadeFixturer ?? []);

  const rader: Falljamforelse[] = [];

  for (const testfall of lasTestfall()) {
    const forvantadeFynd = testfall.expected_findings.map((rad) => rad.rule);
    try {
      const fixtur = slaUppFixtur(testfall.fil as never);
      if (fixtur !== undefined && (!fixtur.finns || saknade.has(testfall.case_id))) {
        // FR10: en saknad testfil är ett fel i sviten, aldrig ett godkänt fall.
        rader.push(
          testsvitsfel(
            testfall.case_id,
            testfall.expected_status,
            `Testfilen saknas: ${fixtur.sokvag}`,
          ),
        );
        continue;
      }

      const dokument = lasInDokument({
        arende: testfall.arende,
        arendedokument: testfall.arendedokument,
        fil: testfall.fil,
        dokumenttext: testfall.dokumenttext,
      }) as GranskatDokument;

      const faltInnan = faltvarden(dokument);
      const filkalla = (filnamn: string): string | undefined =>
        fixtur !== undefined && (testfall.fil?.['filer'] as string[] | undefined)?.includes(filnamn)
          ? fixtur.sokvag
          : undefined;

      const omgang = await korGranskningsomgang({
        dokument,
        katalog,
        referensdata,
        klient: stubbadKlient(),
        logg,
        filkalla,
      });

      rader.push(
        jamforFall({
          caseId: testfall.case_id,
          forvantadStatus: testfall.expected_status,
          forvantadeFynd,
          omgang,
          katalog,
          faltInnan,
          faltEfter: faltvarden(dokument),
          stubbadAi: true,
        }),
      );
    } catch (orsak) {
      // Ett fall som kastar rapporteras och stoppar inte resten av sviten.
      rader.push(
        testsvitsfel(
          testfall.case_id,
          testfall.expected_status,
          `Körningen kastade: ${orsak instanceof Error ? orsak.message : String(orsak)}`,
        ),
      );
    }
  }

  return { rader, sammanstallning: sammanstall(rader) };
}

const SYMBOL: Record<Falljamforelse['dom'], string> = {
  godkänt: 'OK  ',
  underkänt: 'FEL ',
  'kräver live-läge': 'AI  ',
  testsvitsfel: 'FEL ',
};

export function formateraRapport(resultat: Korningsresultat): string {
  const rader = resultat.rader.map((rad) => {
    const huvud = `${SYMBOL[rad.dom]} ${rad.caseId}  förväntat ${rad.forvantadStatus.padEnd(8)} faktiskt ${rad.faktiskStatus.padEnd(18)}`;
    const detaljer: string[] = [];
    if (rad.hittadeFynd.length > 0) detaljer.push(`     hittade fynd: ${rad.hittadeFynd.join(', ')}`);
    if (rad.saknadeFynd.length > 0) detaljer.push(`     saknade fynd: ${rad.saknadeFynd.join(', ')}`);
    if (rad.extraFynd.length > 0) {
      detaljer.push(`     extra fynd: ${rad.extraFynd.map((f) => f.regelId).join(', ')}`);
    }
    if (rad.anmarkning !== undefined) detaljer.push(`     ${rad.anmarkning}`);
    return [huvud, ...detaljer].join('\n');
  });

  const s = resultat.sammanstallning;
  return [
    'Testsvit mot casedetails/testcases.json (AI-klienten är stubbad)',
    '',
    ...rader,
    '',
    `${s.godkanda} av ${s.totalt} godkända, ${s.kraverLive} kräver live-läge, ${s.underkanda} underkända, ${s.testsvitsfel} testsvitsfel`,
  ].join('\n');
}

const arDirektkord = process.argv[1] !== undefined && import.meta.url.endsWith(path.basename(process.argv[1]));

if (arDirektkord) {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const loggfil = path.join(mkdtempSync(path.join(tmpdir(), 'testsvit-')), 'kontrollogg.jsonl');
  const resultat = await korTestsvit({ loggfil });
  console.log(formateraRapport(resultat));
  console.log(`\nKontrollogg: ${loggfil}`);
  const s = resultat.sammanstallning;
  process.exitCode = s.underkanda + s.testsvitsfel > 0 ? 1 : 0;
}
