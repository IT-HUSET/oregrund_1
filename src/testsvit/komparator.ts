/**
 * Jämförelse mot testfallens facit (S09 TI04, TI05, TI06).
 *
 * Ren funktion över en färdig granskningsomgång. Den rättar ingenting och
 * kör ingenting – den avgör bara om fallet stämmer med `testcases.json`.
 */

import type { ChecklistCatalog } from '../lib/rule-catalog.ts';
import type { Granskningsomgang } from '../lib/granskning/omgang/omgang.ts';

/** Fält automatiken aldrig får ändra (`docs/prd.md#constraints`). */
export const SKYDDADE_FALT = ['ankomstdatum', 'dokumentdatum', 'diarienummer', 'skyddskod'] as const;

export type Falldom = 'godkänt' | 'underkänt' | 'kräver live-läge' | 'testsvitsfel';

export interface Falljamforelse {
  caseId: string;
  dom: Falldom;
  forvantadStatus: string;
  faktiskStatus: string;
  statusStammer: boolean;
  hittadeFynd: string[];
  /** Förväntade fynd som varken rapporterades eller auto-rättades. */
  saknadeFynd: string[];
  /** Fynd utanför facit. Avgör aldrig ensamt om fallet underkänns (FR10). */
  extraFynd: { regelId: string; forklaring: string }[];
  /** Skyddade fält som ändrats. Icke-tom lista är alltid ett testsvitsfel. */
  brutnaFaltskydd: string[];
  anmarkning?: string;
}

export interface Jamforelseindata {
  caseId: string;
  forvantadStatus: string;
  forvantadeFynd: string[];
  omgang: Granskningsomgang;
  katalog: ChecklistCatalog;
  /** Fältvärden före körningen, för att bevisa att de skyddade är orörda. */
  faltInnan: Record<string, unknown>;
  faltEfter: Record<string, unknown>;
  /** Sant när AI-klienten var en stub, så innehållsregler inte kunde bedömas. */
  stubbadAi: boolean;
}

/**
 * FR4:s AC: "godkänd" kräver exakt statusen Godkänd, medan "flaggad" accepterar
 * vilken som helst av de tre andra.
 */
export function statusStammer(forvantad: string, faktisk: string): boolean {
  if (forvantad === 'godkänd') return faktisk === 'Godkänd';
  return ['Autokorrigerad', 'Åtgärd krävs', 'Mänsklig bedömning'].includes(faktisk);
}

/** En regel bara AI-motorn kan avgöra: metoden innehåller C eller H. */
function arAiRegel(katalog: ChecklistCatalog, regelId: string): boolean {
  const metod = katalog.rules.find((regel) => regel.id === regelId)?.metod ?? '';
  return /[CH]/.test(metod);
}

export function jamforFall(indata: Jamforelseindata): Falljamforelse {
  const { omgang, forvantadeFynd, katalog } = indata;

  // Ett auto-rättat fynd räknas som hittat (FR10): rättningen är beviset på att
  // regeln slog till, även när omkörningen inte längre rapporterar fyndet.
  const rattadeRegelIdn = omgang.tillampadeRattningar.map((rattning) => rattning.regelId);
  const rapporteradeRegelIdn = omgang.fynd.map((fynd) => fynd.regelId);
  const faktiska = new Set([...rapporteradeRegelIdn, ...rattadeRegelIdn]);

  const hittadeFynd = forvantadeFynd.filter((regelId) => faktiska.has(regelId));
  const saknadeFynd = forvantadeFynd.filter((regelId) => !faktiska.has(regelId));

  const forvantade = new Set(forvantadeFynd);
  const extraFynd = omgang.fynd
    .filter((fynd) => !forvantade.has(fynd.regelId))
    .map((fynd) => ({ regelId: fynd.regelId, forklaring: fynd.forklaring }));

  const brutnaFaltskydd = SKYDDADE_FALT.filter(
    (falt) => JSON.stringify(indata.faltInnan[falt]) !== JSON.stringify(indata.faltEfter[falt]),
  );

  const stammer = statusStammer(indata.forvantadStatus, omgang.status);
  const jamforelse: Omit<Falljamforelse, 'dom'> = {
    caseId: indata.caseId,
    forvantadStatus: indata.forvantadStatus,
    faktiskStatus: omgang.status,
    statusStammer: stammer,
    hittadeFynd,
    saknadeFynd,
    extraFynd,
    brutnaFaltskydd,
  };

  // Ett brutet fältskydd underkänner fallet oavsett allt annat.
  if (brutnaFaltskydd.length > 0) {
    return {
      ...jamforelse,
      dom: 'testsvitsfel',
      anmarkning: `Automatiken ändrade skyddade fält: ${brutnaFaltskydd.join(', ')}`,
    };
  }

  if (stammer && saknadeFynd.length === 0) return { ...jamforelse, dom: 'godkänt' };

  // Med stubbad AI kan innehållsregler inte bedömas. Ett fall som fallerar
  // enbart på sådana regler är inte en bugg i pipelinen, och markeras som att
  // det kräver live-läge i stället för underkänt.
  const endastAiSaknas =
    saknadeFynd.length > 0 && saknadeFynd.every((regelId) => arAiRegel(katalog, regelId));
  if (indata.stubbadAi && endastAiSaknas) {
    return {
      ...jamforelse,
      dom: 'kräver live-läge',
      anmarkning: `Fynden ${saknadeFynd.join(', ')} kräver en riktig AI-bedömning; klienten var stubbad.`,
    };
  }

  return {
    ...jamforelse,
    dom: 'underkänt',
    anmarkning: stammer
      ? `Saknade fynd: ${saknadeFynd.join(', ')}`
      : `Status ${omgang.status} uppfyller inte förväntat ${indata.forvantadStatus}`,
  };
}

export interface Sammanstallning {
  totalt: number;
  godkanda: number;
  underkanda: number;
  kraverLive: number;
  testsvitsfel: number;
}

export function sammanstall(rader: { dom: Falldom }[]): Sammanstallning {
  const rakna = (dom: Falldom): number => rader.filter((rad) => rad.dom === dom).length;
  return {
    totalt: rader.length,
    godkanda: rakna('godkänt'),
    underkanda: rakna('underkänt'),
    kraverLive: rakna('kräver live-läge'),
    testsvitsfel: rakna('testsvitsfel'),
  };
}
