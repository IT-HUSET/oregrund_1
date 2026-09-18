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

/**
 * Registratorns beslut om ett fynd (S07, FR8). Beslutet tar fyndet ur
 * "kräver mänsklig bedömning", eftersom en människa nu har bedömt det.
 * - `avvisat`: fyndet stängs och räknas inte med i utvärderingen.
 * - `godkant`: fyndet bekräftas. Det rättas av S06 om regeln är auto-rättningsbar, annars är det kvar och handläggaren åtgärdar det.
 * - `skickat`: fyndet skickas till handläggaren. Dokumentet blir Åtgärd krävs, även om andra fynd väntar på bedömning.
 */
export type Fyndutgang = 'avvisat' | 'godkant' | 'skickat';

export interface AvgjortFynd {
  regelId: string;
  utgang: Fyndutgang;
}

export interface Statusunderlag {
  utfall: SammanslagetUtfall[];
  katalog: ChecklistCatalog;
  /** Antal auto-rättningar som faktiskt applicerats i omgången. */
  antalTillampadeRattningar: number;
  /** Fynd vars auto-rättning misslyckades och degraderats till förslag (TI04). */
  degraderadeRegelIdn: string[];
  /** Registratorns beslut, om några (S07). */
  avgjorda?: AvgjortFynd[];
}

function kraverMansligBedomning(underlag: Statusunderlag, avgjordaRegelIdn: Set<string>): boolean {
  const metodPerRegel = new Map(underlag.katalog.rules.map((regel) => [regel.id, regel.metod]));

  return underlag.utfall.some((rad) => {
    // En regel med ett registratorbeslut har fått sin mänskliga bedömning, även när motorn markerat
    // den "ej genomförd" (t.ex. AD-SEKRETESS-1, där S04 ger fyndet och S05 lämnar H-steget till människa).
    if (avgjordaRegelIdn.has(rad.regelId)) return false;
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
  const avgjorda = underlag.avgjorda ?? [];
  const avgjordaRegelIdn = new Set(avgjorda.map((beslut) => beslut.regelId));
  const avvisadeRegelIdn = new Set(
    avgjorda.filter((beslut) => beslut.utgang === 'avvisat').map((beslut) => beslut.regelId),
  );

  // Ett uttryckligt "skicka till handläggaren" går före FR4:s ordning: registratorn har själv valt vägen.
  if (avgjorda.some((beslut) => beslut.utgang === 'skickat')) return 'Åtgärd krävs';
  if (kraverMansligBedomning(underlag, avgjordaRegelIdn)) return 'Mänsklig bedömning';

  // Ett kvarstående fynd efter rättning och omkörning är ett fel handläggaren
  // måste åtgärda. En degraderad rättning räknas som kvarstående (TI04).
  // Ett avvisat fynd är stängt av en människa och räknas inte.
  // Fynden läses ur raden och inte ur utfallet: en bekräftad "ej genomförd"-regel har fortfarande sitt fynd.
  const kvarstaendeFynd = underlag.utfall.some(
    (rad) => rad.fynd.length > 0 && !avvisadeRegelIdn.has(rad.regelId),
  );
  if (kvarstaendeFynd || underlag.degraderadeRegelIdn.length > 0) return 'Åtgärd krävs';

  if (underlag.antalTillampadeRattningar > 0) return 'Autokorrigerad';
  return 'Godkänd';
}

/** Godkänd och Autokorrigerad sätter dokumentstatus "Registrerat", inget annat gör det (FR4). */
export function satterRegistrerat(status: Granskningsstatus): boolean {
  return status === 'Godkänd' || status === 'Autokorrigerad';
}
