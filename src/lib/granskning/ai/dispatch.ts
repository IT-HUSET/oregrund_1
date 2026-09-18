/**
 * Katalogdriven dispatch av AI-regler (S05 TI02, TI03, TI08). Väljer varje katalograd vars metod innehåller
 * C eller H, kör dess handler och degraderar hela omgången till "ej genomförd" när AI-tjänsten felar
 * (ADR Beslut 2). Kastar aldrig.
 */

import type { ChecklistCatalog, ChecklistRule } from '../../rule-catalog.ts';
import type { Dokument, RegelUtfall } from '../types.ts';
import { arAiRegel, HANDLERS, nyttUtfall, type HandlerKontext, type HandlerResultat } from './handlers.ts';
import type { AiKlient } from './klient.ts';

/** Högst så här många Claude-anrop pågår samtidigt, för att inte köra in i API:ets rate limit. */
const STANDARD_SAMTIDIGHET = 5;

/**
 * Tillstånd för en granskningsomgång. Ett rule-id ställer högst en fråga till Claude per omgång: en andra
 * dispatch i samma omgång återanvänder det första resultatet (`docs/plan.json#riskSummary`, S05).
 */
export interface Omgang {
  readonly resultat: Map<string, Promise<HandlerResultat>>;
}

export function skapaOmgang(): Omgang {
  return { resultat: new Map() };
}

export function valjAiRegler(katalog: ChecklistCatalog): ChecklistRule[] {
  return katalog.rules.filter(arAiRegel);
}

export interface AiGranskningIndata {
  dokument: Dokument;
  katalog: ChecklistCatalog;
  klient: AiKlient;
  omgang?: Omgang;
  samtidighet?: number;
}

export interface AiGranskning {
  utfall: RegelUtfall[];
  /** Modellen som anropades för kontrolloggen, eller null om inget Claude-anrop gjordes. */
  aiModell: string | null;
}

async function medBegransadSamtidighet<T>(jobb: (() => Promise<T>)[], grans: number): Promise<T[]> {
  const ut: T[] = new Array(jobb.length);
  let nasta = 0;
  const arbetare = Array.from({ length: Math.min(grans, jobb.length) }, async () => {
    while (nasta < jobb.length) {
      const index = nasta++;
      ut[index] = await jobb[index]!();
    }
  });
  await Promise.all(arbetare);
  return ut;
}

function ejGenomford(regel: ChecklistRule, orsak: string): HandlerResultat {
  return { utfall: nyttUtfall(regel, 'ej genomförd', orsak), anvandeKlient: false };
}

export async function bedomAiRegler(indata: AiGranskningIndata): Promise<AiGranskning> {
  const { dokument, katalog, klient } = indata;
  const omgang = indata.omgang ?? skapaOmgang();
  let avbruten = false;
  let anropad = false;

  const fraga: HandlerKontext['fraga'] = async (begaran) => {
    if (avbruten) return { ok: false, fel: 'transport', detalj: 'hoppade över anrop efter tidigare AI-fel' };
    anropad = true;
    const svar = await klient.bedom(begaran);
    if (!svar.ok) avbruten = true;
    return svar;
  };

  const kor = (regel: ChecklistRule) => (): Promise<HandlerResultat> => {
    let resultat = omgang.resultat.get(regel.id);
    if (resultat === undefined) {
      const handler = HANDLERS[regel.id];
      resultat =
        handler === undefined
          ? Promise.resolve(ejGenomford(regel, 'Regeln saknar AI-handler'))
          : handler({ regel, dokument, troskel: katalog.aiKonfidenstroskel, fraga }).catch(() =>
              ejGenomford(regel, 'Internt fel i regelhanteraren'),
            );
      omgang.resultat.set(regel.id, resultat);
    }
    return resultat;
  };

  const resultat = await medBegransadSamtidighet(
    valjAiRegler(katalog).map(kor),
    indata.samtidighet ?? STANDARD_SAMTIDIGHET,
  );

  // TI08: ett klientfel gör varje regel som frågade Claude till ej genomförd, inte en blandning av
  // lyckade och misslyckade. Regler som avgjordes utan Claude behåller sitt utfall.
  const klientfel = resultat.find((rad) => rad.klientfel !== undefined)?.klientfel;
  const utfall = resultat.map((rad): RegelUtfall => {
    if (klientfel === undefined || !rad.anvandeKlient) return rad.utfall;
    const { regelId, metod } = rad.utfall;
    return { regelId, metod, utfall: 'ej genomförd', orsak: `AI-tjänsten svarade inte som väntat (${klientfel})` };
  });
  return { utfall, aiModell: anropad ? klient.modell : null };
}
