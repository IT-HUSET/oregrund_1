/**
 * Kvalitetsöversikt (S12, FR13).
 *
 * Ren aggregering över kontrolloggen: allt räknas om vid varje läsning, och
 * ingenting cachas, eftersom FR13:s acceptanskriterium är att siffrorna stämmer
 * med loggen. Modulen skriver aldrig.
 */

import type { KontrolloggPost, ManskligtBeslutPost } from '../kontrollogg/types.ts';
import { AUTO_RATTNINGSBARA } from '../granskning/omgang/rattning.ts';
import type { Granskningsstatus } from '../granskning/omgang/status.ts';
import { lasAllaPoster } from './lasning.ts';

/** FR4:s fyra statusar, i den ordning översikten redovisar dem. */
export const STATUSAR: readonly Granskningsstatus[] = [
  'Godkänd',
  'Autokorrigerad',
  'Åtgärd krävs',
  'Mänsklig bedömning',
];

export interface Statusandel {
  status: Granskningsstatus;
  antal: number;
  /** Procent av granskade dokument, avrundat till en decimal. */
  andel: number;
}

export interface Fyndrad {
  regelId: string;
  antal: number;
}

export interface Rattningsrad {
  regelId: string;
  antal: number;
}

export interface Stickprovsandel {
  /** Antal dokument som faktiskt stickprovsgranskats. */
  antalStickprov: number;
  antalFelbedomningar: number;
  /** Andel av stickproven, inte av alla registrerade dokument. null när inget stickprov gjorts. */
  andel: number | null;
  forklaring?: string;
}

/** Varje sektion bär sin egen förklaring när den saknar data (FR13). */
export interface Statusoversikt {
  rader: Statusandel[];
  forklaring?: string;
}

export interface Fyndoversikt {
  rader: Fyndrad[];
  forklaring?: string;
}

export interface Rattningsoversikt {
  totalt: number;
  perRegel: Rattningsrad[];
  forklaring?: string;
}

export interface Kvalitetsoversikt {
  antalGranskadeDokument: number;
  statusfordelning: Statusoversikt;
  vanligasteFynd: Fyndoversikt;
  autoRattningar: Rattningsoversikt;
  stickprov: Stickprovsandel;
  /** Satt när loggen är tom: då är varje siffra nedan noll av brist på data. */
  forklaring?: string;
}

const TOM_LOGG =
  'Inga granskningar är loggade ännu. Siffrorna fylls i när det första dokumentet har granskats.';
const INGA_DOKUMENT = 'Inga dokument har granskats ännu, så fördelningen är tom.';
const INGA_FYND = 'Inga fynd är loggade ännu.';
const INGA_RATTNINGAR = 'Inga automatiska rättningar är loggade ännu.';
const INGA_STICKPROV =
  'Inga stickprov är gjorda ännu, så andelen felbedömningar går inte att beräkna.';

/**
 * Stickprovsbeslut känns igen på beslutstexten i den mänskliga beslutsposten.
 * S11 har ingen FIS ännu, så kontraktet är avsiktligt tolerant: ett beslut som
 * nämner stickprov räknas som ett stickprov, och ett som dessutom nämner
 * felbedömning räknas som en markerad felbedömning. Stäms av mot S11:s FIS.
 */
const STICKPROV_MONSTER = /stickprov/i;
const FELBEDOMNING_MONSTER = /felbedömning/i;

function arStickprov(beslut: ManskligtBeslutPost): boolean {
  return STICKPROV_MONSTER.test(beslut.beslut);
}

function arFelbedomning(beslut: ManskligtBeslutPost): boolean {
  return arStickprov(beslut) && FELBEDOMNING_MONSTER.test(beslut.beslut);
}

function andel(del: number, helhet: number): number {
  return helhet === 0 ? 0 : Math.round((del / helhet) * 1000) / 10;
}

/**
 * Dokumentets nuvarande status: granskningsstatusen i dess senaste loggade
 * omgång. Ett dokument som skickats in på nytt efter rättning räknas alltså en
 * gång, under sin nya status – inte två gånger (TI02).
 */
function statusPerDokument(poster: KontrolloggPost[]): Map<string, Granskningsstatus> {
  const senaste = new Map<string, { tidpunkt: number; index: number; status: Granskningsstatus }>();

  poster.forEach((post, index) => {
    const statusbyte = post.statusbyten.filter((byte) => byte.typ === 'granskningsstatus').at(-1);
    if (statusbyte === undefined) return;

    const tidpunkt = Date.parse(post.tidpunkt);
    const befintlig = senaste.get(post.dokumentId);
    // Tidpunkt först, tilläggsordning som utslagsgivare när två poster delar sekund.
    const arSenare =
      befintlig === undefined ||
      tidpunkt > befintlig.tidpunkt ||
      (tidpunkt === befintlig.tidpunkt && index > befintlig.index);
    if (arSenare) {
      senaste.set(post.dokumentId, {
        tidpunkt,
        index,
        status: statusbyte.till as Granskningsstatus,
      });
    }
  });

  return new Map([...senaste].map(([dokumentId, rad]) => [dokumentId, rad.status]));
}

/**
 * Räknar hur många granskningsomgångar som gav fynd per regel. Inom en omgång
 * räknas en regel en gång även om båda motorerna rapporterade den: S04 och S05
 * delar flera regel-ID:n, och två fynd på samma regel i samma omgång är ett
 * problem, inte två. Två omgångar för samma dokument räknas däremot var för sig.
 */
function raknaFynd(poster: KontrolloggPost[]): Fyndrad[] {
  const antalPerRegel = new Map<string, number>();
  for (const post of poster) {
    for (const regelId of new Set(post.fynd.map((fynd) => fynd.regelId))) {
      antalPerRegel.set(regelId, (antalPerRegel.get(regelId) ?? 0) + 1);
    }
  }
  return [...antalPerRegel]
    .map(([regelId, antal]) => ({ regelId, antal }))
    .sort((a, b) => b.antal - a.antal || a.regelId.localeCompare(b.regelId, 'sv'));
}

/**
 * Bara faktiskt utförda rättningar räknas. En rättning som degraderats till ett
 * förslag efter en misslyckad loggskrivning har per definition ingen loggpost
 * med före/efter-värden, och syns därför inte här (S06 TI04).
 */
function raknaRattningar(poster: KontrolloggPost[]): { totalt: number; perRegel: Rattningsrad[] } {
  const antalPerRegel = new Map<string, number>();
  for (const post of poster) {
    for (const andring of post.andringar) {
      if (!andring.automatisk) continue;
      const regelId = andring.regelId;
      if (regelId === undefined || !AUTO_RATTNINGSBARA.includes(regelId)) continue;
      antalPerRegel.set(regelId, (antalPerRegel.get(regelId) ?? 0) + 1);
    }
  }
  const perRegel = [...antalPerRegel]
    .map(([regelId, antal]) => ({ regelId, antal }))
    .sort((a, b) => b.antal - a.antal || a.regelId.localeCompare(b.regelId, 'sv'));
  return { totalt: perRegel.reduce((summa, rad) => summa + rad.antal, 0), perRegel };
}

function raknaStickprov(poster: KontrolloggPost[]): Stickprovsandel {
  const beslut = poster.flatMap((post) => post.manskligaBeslut);
  const stickprov = beslut.filter(arStickprov);
  const felbedomningar = stickprov.filter(arFelbedomning);

  if (stickprov.length === 0) {
    return {
      antalStickprov: 0,
      antalFelbedomningar: 0,
      andel: null,
      forklaring: INGA_STICKPROV,
    };
  }
  return {
    antalStickprov: stickprov.length,
    antalFelbedomningar: felbedomningar.length,
    // Nämnaren är antalet stickprov, inte alla registrerade dokument.
    andel: andel(felbedomningar.length, stickprov.length),
  };
}

/** Sammanställer översikten ur loggposterna. Ren funktion, ingen I/O. */
export function sammanstallOversikt(poster: KontrolloggPost[]): Kvalitetsoversikt {
  const statusar = statusPerDokument(poster);
  const antalGranskadeDokument = statusar.size;
  const raknade = [...statusar.values()];

  const statusrader = STATUSAR.map((status) => {
    const antal = raknade.filter((rad) => rad === status).length;
    return { status, antal, andel: andel(antal, antalGranskadeDokument) };
  });
  const statusfordelning: Statusoversikt =
    antalGranskadeDokument === 0
      ? { rader: statusrader, forklaring: INGA_DOKUMENT }
      : { rader: statusrader };

  const fyndrader = raknaFynd(poster);
  const vanligasteFynd: Fyndoversikt =
    fyndrader.length === 0 ? { rader: fyndrader, forklaring: INGA_FYND } : { rader: fyndrader };

  const rattningar = raknaRattningar(poster);
  const autoRattningar: Rattningsoversikt =
    rattningar.totalt === 0 ? { ...rattningar, forklaring: INGA_RATTNINGAR } : rattningar;

  const stickprov = raknaStickprov(poster);

  const oversikt: Kvalitetsoversikt = {
    antalGranskadeDokument,
    statusfordelning,
    vanligasteFynd,
    autoRattningar,
    stickprov,
  };
  return poster.length === 0 ? { ...oversikt, forklaring: TOM_LOGG } : oversikt;
}

/** Läser loggen och sammanställer översikten. Varje anrop räknar om allt. */
export async function hamtaKvalitetsoversikt(filsokvag: string): Promise<Kvalitetsoversikt> {
  return sammanstallOversikt(await lasAllaPoster(filsokvag));
}

/** Förklarande texter för de tomma lägen FR13 kräver. */
export const TOMMA_LAGEN = {
  logg: TOM_LOGG,
  dokument: INGA_DOKUMENT,
  fynd: INGA_FYND,
  rattningar: INGA_RATTNINGAR,
  stickprov: INGA_STICKPROV,
} as const;
