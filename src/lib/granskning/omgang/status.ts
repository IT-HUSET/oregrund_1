/**
 * Fyrstatuslogiken (S06 TI06, FR4).
 *
 * Ren funktion över det sammanslagna utfallet. Prioritetsordningen är FR4:s och
 * får inte omtolkas här: Mänsklig bedömning > Åtgärd krävs > Autokorrigerad > Godkänd.
 */

import type { ChecklistCatalog } from '../../rule-catalog.ts';
import type { SammanslagetUtfall } from './sammanslagning.ts';

export type Granskningsstatus = 'Mänsklig bedömning' | 'Åtgärd krävs' | 'Autokorrigerad' | 'Godkänd';

/** Dokumentstatus som Godkänd och Autokorrigerad sätter automatiskt (FR4). */
export const REGISTRERAD = 'Registrerat';

export interface Statusunderlag {
  utfall: SammanslagetUtfall[];
  katalog: ChecklistCatalog;
  /** Antal auto-rättningar som faktiskt applicerats i omgången. */
  antalTillampadeRattningar: number;
  /** Fynd vars auto-rättning misslyckades och degraderats till förslag (TI04). */
  degraderadeRegelIdn: string[];
}

function kraverMansligBedomning(underlag: Statusunderlag): boolean {
  const metodPerRegel = new Map(underlag.katalog.rules.map((regel) => [regel.id, regel.metod]));

  return underlag.utfall.some((rad) => {
    if (rad.utfall === 'ej genomförd') return true;
    if (rad.utfall !== 'fynd') return false;
    // Ett osäkert AI-fynd är en bedömningsfråga, inte ett konstaterat fel.
    if (rad.fynd.some((fynd) => fynd.osaker === true)) return true;
    // H-regler kräver mänskligt omdöme. AI-fynd bär "AI-bedömning" som metod,
    // så metoden läses ur katalogen och inte ur fyndet.
    return (metodPerRegel.get(rad.regelId) ?? '').includes('H');
  });
}

export function bestamStatus(underlag: Statusunderlag): Granskningsstatus {
  if (kraverMansligBedomning(underlag)) return 'Mänsklig bedömning';

  // Ett kvarstående fynd efter rättning och omkörning är ett fel handläggaren
  // måste åtgärda. En degraderad rättning räknas som kvarstående (TI04).
  const kvarstaendeFynd = underlag.utfall.some((rad) => rad.utfall === 'fynd');
  if (kvarstaendeFynd || underlag.degraderadeRegelIdn.length > 0) return 'Åtgärd krävs';

  if (underlag.antalTillampadeRattningar > 0) return 'Autokorrigerad';
  return 'Godkänd';
}

/** Godkänd och Autokorrigerad sätter dokumentstatus "Registrerat", inget annat gör det (FR4). */
export function satterRegistrerat(status: Granskningsstatus): boolean {
  return status === 'Godkänd' || status === 'Autokorrigerad';
}
