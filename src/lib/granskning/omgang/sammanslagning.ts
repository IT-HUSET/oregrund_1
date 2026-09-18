/**
 * Sammanslagning av S04:s och S05:s regelutfall (S06 TI01).
 *
 * Ett regel-ID kan få utfall från båda motorerna under samma omgång – S04 och
 * S05 delar de kombinerade metodraderna (M/C, M+L/C, C/H) och gör dessutom
 * motstridiga anspråk på FIL-raderna. Lagret tar därför inte ställning till
 * ägarskap: det reducerar med sämsta-utfallet-vinner och behåller varje fynd
 * från varje bidragande motor (`docs/s06-...md`, Constraints & Gotchas).
 */

import type { ChecklistCatalog } from '../../rule-catalog.ts';
import type { Fynd, Regelutfall, Utfall } from '../kontrakt.ts';

export interface SammanslagetUtfall {
  regelId: string;
  utfall: Utfall;
  /** Alla fynd för regel-ID:t, från båda motorerna. Tom när utfallet inte är "fynd". */
  fynd: Fynd[];
  /** Första angivna orsaken till "ej tillämplig"/"ej genomförd". */
  orsak?: string;
}

/** Sämst först: ett sämre utfall vinner över ett bättre för samma regel-ID. */
const ALLVARLIGHET: Record<Utfall, number> = {
  'ej genomförd': 3,
  fynd: 2,
  'ej tillämplig': 1,
  uppfylld: 0,
};

/**
 * Slår samman utfallen till ett per regel-ID, i katalogens ordning. Varje regel
 * i katalogen får ett utfall även om ingen motor rapporterade den – då "ej
 * genomförd", så att en lucka syns i stället för att räknas som godkänd (FR3).
 */
export function slaSammanUtfall(
  katalog: ChecklistCatalog,
  ...utfallslistor: Regelutfall[][]
): SammanslagetUtfall[] {
  const perRegel = new Map<string, Regelutfall[]>();
  for (const lista of utfallslistor) {
    for (const utfall of lista) {
      const befintliga = perRegel.get(utfall.regelId);
      if (befintliga === undefined) perRegel.set(utfall.regelId, [utfall]);
      else befintliga.push(utfall);
    }
  }

  return katalog.rules.map((regel) => {
    const bidrag = perRegel.get(regel.id) ?? [];
    if (bidrag.length === 0) {
      return {
        regelId: regel.id,
        utfall: 'ej genomförd',
        fynd: [],
        orsak: 'Ingen motor rapporterade ett utfall för regeln',
      };
    }

    const utfall = bidrag.reduce(
      (samst, rad) => (ALLVARLIGHET[rad.utfall] > ALLVARLIGHET[samst] ? rad.utfall : samst),
      'uppfylld' as Utfall,
    );
    // Fynden bevaras oavkortat: ett uppfyllt delutfall får aldrig tysta det andra.
    const fynd = bidrag.flatMap((rad): Fynd[] => (rad.fynd === undefined ? [] : [rad.fynd]));
    const orsak = bidrag.find((rad) => rad.orsak !== undefined)?.orsak;

    const sammanslaget: SammanslagetUtfall = { regelId: regel.id, utfall, fynd };
    return orsak === undefined ? sammanslaget : { ...sammanslaget, orsak };
  });
}

/** Alla fynd i omgången, i katalogordning. */
export function allaFynd(utfall: SammanslagetUtfall[]): Fynd[] {
  return utfall.flatMap((rad) => rad.fynd);
}
