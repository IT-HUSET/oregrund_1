/**
 * Gemensamt RuleOutcome/Finding-kontrakt (shared decision i `docs/plan.json`).
 * Producenter: S04 (metod M/M+L) och S05 (metod C/H). Konsumenter: S06–S09.
 *
 * S06 mappar `Fynd` till kontrolloggens `FyndPost` (`kontrollogg/types.ts`): `regeltext` utelämnas
 * och `metod` blir regelns C/H-token.
 */

import type { Regelutfall } from '../kontrollogg/types.ts';
import type { Allvarlighetsgrad } from '../rule-catalog.ts';

export type { Regelutfall };

/** Källan till ett fynd (FR6): en deterministisk regel eller en AI-bedömning. */
export type Fyndmetod = 'Deterministisk regel' | 'AI-bedömning';

export interface Fynd {
  regelId: string;
  regeltext: string;
  allvarlighetsgrad: Allvarlighetsgrad;
  metod: Fyndmetod;
  evidens: string;
  /** Svensk förklaring av varför fyndet flaggats. */
  forklaring: string;
  rattningsforslag?: string;
  /** Bara för AI-fynd. */
  konfidens?: number;
  /** AI-fynd med konfidens under katalogens tröskel. Bär ändå hela fyndformen. */
  osaker?: boolean;
}

export interface RegelUtfall {
  regelId: string;
  /** Den halva av regelns metod som producenten äger, för kontrolloggens `RegelutfallPost`. */
  metod: 'M' | 'M+L' | 'C' | 'H';
  utfall: Regelutfall;
  /** Finns bara när `utfall` är 'fynd'. */
  fynd?: Fynd;
  /** Varför utfallet är 'ej tillämplig' eller 'ej genomförd'. */
  orsak?: string;
}

/** Fil-fälten från `casedetails/testcases.json`. Frånvarande fakta är undefined eller null. */
export interface Filunderlag {
  filer: string[];
  ar_zip?: boolean | null;
  ar_uppackad?: boolean | null;
  ar_lasbar?: boolean | null;
  ar_dubbelsidig_original?: boolean | null;
  ar_korrekt_skannad?: boolean | null;
  ar_undertecknad_version?: boolean | null;
  mejlmissiv_diarieford?: boolean | null;
}

/** Dokument/Ärende-modellen (S03) som granskningsmotorerna läser. */
export interface Dokument {
  arende: {
    diarienummer: string;
    titel?: string | null;
    process?: string | null;
    kontakt?: string | null;
    status?: string | null;
  };
  arendedokument: {
    titel: string;
    handlingstyp: string;
    dokumentkategori: string;
    skyddskod: string;
    avsandare?: string | null;
    mottagare?: string | null;
    kopia_till?: string | null;
    ankomstdatum?: string | null;
    dokumentdatum?: string | null;
    ansvarig?: string | null;
    antal_bilagor?: number | null;
  };
  fil?: Filunderlag | null;
  dokumenttext?: string | null;
}
