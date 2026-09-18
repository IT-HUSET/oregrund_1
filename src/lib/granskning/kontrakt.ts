/**
 * Delat utfalls- och fyndkontrakt för granskningsmotorerna
 * (`docs/plan.json`, sharedDecision "RuleOutcome/Finding data contract").
 *
 * S04 (deterministisk) och S05 (AI) producerar båda in i det här kontraktet.
 * S06 läser det för status och auto-rättning, S07/S08 visar det, S09 jämför
 * mot testfallen. Ändringar här är ett kontraktsbyte.
 */

import type { Allvarlighetsgrad } from '../rule-catalog.ts';

/** Utfall per regel och granskningsomgång (FR3). */
export type Utfall = 'uppfylld' | 'fynd' | 'ej tillämplig' | 'ej genomförd';

/** Ett fynd med den förklaringsdata FR6 kräver. */
export interface Fynd {
  regelId: string;
  regeltext: string;
  allvarlighetsgrad: Allvarlighetsgrad;
  /** Katalogens metodvärde, t.ex. "M", "M+L/C" eller "M → H", för deterministiska fynd. "AI-bedömning" för AI-fynd (S05). */
  metod: string;
  evidens: string;
  forklaring: string;
  rattningsforslag?: string;
  /** Sätts bara av AI-motorn (S05). Deterministiska fynd saknar konfidens (FR6). */
  konfidens?: number;
  /** Sätts bara av S05: konfidensen ligger under katalogens `aiKonfidenstroskel`. */
  osaker?: boolean;
}

export interface Regelutfall {
  regelId: string;
  utfall: Utfall;
  /** Finns om och endast om utfallet är "fynd". */
  fynd?: Fynd;
  /** Varför utfallet är "ej tillämplig" eller "ej genomförd". Sätts av S05. */
  orsak?: string;
}

/**
 * Dokumentet som granskas, i den form S03:s inläsning ger det.
 * Fältnamnen följer `casedetails/testcases.json`. S04 läser, aldrig skriver.
 */
export interface Arende {
  diarienummer: string;
  titel: string;
  process: string;
  kontakt: string | null;
  status?: string;
}

export interface Arendedokument {
  titel: string;
  handlingstyp: string;
  dokumentkategori: string;
  skyddskod: string;
  avsandare?: string | null;
  mottagare?: string | null;
  kopia_till?: string | null;
  ankomstdatum?: string;
  dokumentdatum?: string;
  antal_bilagor?: number;
  godkannandeflode_status?: string;
  [ovrigt: string]: unknown;
}

export interface FilUppgifter {
  filer: string[];
  ar_zip?: boolean;
  ar_uppackad?: boolean;
  ar_lasbar?: boolean | null;
  ar_dubbelsidig_original?: boolean;
  ar_korrekt_skannad?: boolean | null;
  ar_undertecknad_version?: boolean | null;
  mejlmissiv_diarieford?: boolean;
}

export interface GranskatDokument {
  id?: string;
  arende: Arende;
  arendedokument: Arendedokument;
  fil?: FilUppgifter | null | undefined;
  dokumenttext?: string | undefined;
}
