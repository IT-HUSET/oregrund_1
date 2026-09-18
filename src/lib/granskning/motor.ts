/**
 * Deterministisk granskningsmotor (S04, FR3 steg 1).
 *
 * Pipelinens första steg: alla deterministiska regler körs ovillkorligt innan
 * AI och status (`docs/adr.md#beslut-2-granskningspipeline--deterministiskt--ai--status`).
 * Motorn är en ren funktion av dokument, katalog och referensdata. Den skriver
 * aldrig till dokumentet, till filer eller till kontrolloggen, och anropar
 * ingen AI-tjänst.
 */

import type { ChecklistCatalog, ChecklistRule } from '../rule-catalog.ts';
import type { Fynd, GranskatDokument, Regelutfall } from './kontrakt.ts';
import { REGELHANDLERS, S04_REGEL_IDN, type Referensdata } from './regler.ts';

/** Kastas vid konstruktion när motorns regeltäckning inte stämmer med katalogen. */
export class MotorKonfigurationsfel extends Error {
  readonly regelId: string;

  constructor(message: string, regelId: string) {
    super(message);
    this.name = 'MotorKonfigurationsfel';
    this.regelId = regelId;
  }
}

export interface DeterministiskMotor {
  /** Regel-ID:n motorn äger, i katalogens ordning. */
  readonly regelIdn: readonly string[];
  /** Ett utfall per ägt regel-ID, i katalogens ordning. */
  granska(dokument: GranskatDokument): Regelutfall[];
}

function byggFynd(
  regel: ChecklistRule,
  evidens: string | undefined,
  forklaring: string | undefined,
  rattningsforslag: string | undefined,
): Fynd {
  if (evidens === undefined || forklaring === undefined) {
    throw new MotorKonfigurationsfel(
      `Regel "${regel.id}" gav ett fynd utan evidens eller förklaring, vilket FR6 kräver`,
      regel.id,
    );
  }
  // Inget konfidensfält: konfidens är bara för AI-fynd (FR6).
  const fynd: Fynd = {
    regelId: regel.id,
    regeltext: regel.regeltext,
    allvarlighetsgrad: regel.allvarlighetsgrad,
    metod: regel.metod,
    evidens,
    forklaring,
  };
  return rattningsforslag === undefined ? fynd : { ...fynd, rattningsforslag };
}

/**
 * Konstruerar motorn mot en laddad katalog. Varje S04-ägt regel-ID måste finnas
 * i katalogen, och varje handler måste ha en regel – annars går motorn inte att
 * skapa, i stället för att tyst hoppa över regeln.
 */
export function skapaDeterministiskMotor(
  katalog: ChecklistCatalog,
  referensdata: Referensdata,
): DeterministiskMotor {
  const regelPerId = new Map(katalog.rules.map((regel) => [regel.id, regel]));

  for (const regelId of S04_REGEL_IDN) {
    if (!regelPerId.has(regelId)) {
      throw new MotorKonfigurationsfel(
        `Regel "${regelId}" har en handler men saknas i regelkatalogen`,
        regelId,
      );
    }
  }

  // Katalogens ordning, så att utfallen kommer i samma ordning som checklistan.
  const agdaRegler = katalog.rules.filter((regel) => REGELHANDLERS[regel.id] !== undefined);

  return {
    regelIdn: agdaRegler.map((regel) => regel.id),

    granska(dokument: GranskatDokument): Regelutfall[] {
      return agdaRegler.map((regel) => {
        const handler = REGELHANDLERS[regel.id] as NonNullable<(typeof REGELHANDLERS)[string]>;
        const resultat = handler(dokument, referensdata);
        if (resultat.utfall !== 'fynd') {
          return { regelId: regel.id, utfall: resultat.utfall };
        }
        return {
          regelId: regel.id,
          utfall: 'fynd',
          fynd: byggFynd(regel, resultat.evidens, resultat.forklaring, resultat.rattningsforslag),
        };
      });
    },
  };
}
