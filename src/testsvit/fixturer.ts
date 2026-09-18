/**
 * Syntetiska testfiler per fil-flaggprofil (S09 TI01).
 *
 * Varje fixtur är en riktig fil med den egenskap `testcases.json`s `fil`-flaggor
 * anger – den korrupta går verkligen inte att öppna, zip-filen innehåller
 * verkligen färre poster än `antal_bilagor`. S04 läser visserligen bara
 * flaggorna, men FR10 kräver riktiga filer.
 *
 * Fixturerna är härledda ur testfallens data. Ingen av dem är kopierad från
 * `casedetails/`s verkliga ärendeexporter eller skärmdumpar (NFR Security).
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURKATALOG = path.join(MODULE_DIR, '..', '..', 'testfixturer');

export type Filprofil =
  | 'standard'
  | 'osignerad'
  | 'zip-med-for-fa-filer'
  | 'korrupt'
  | 'enkelsidig-skanning'
  | 'utan-filandelse';

const FIXTURFIL: Record<Filprofil, string> = {
  standard: 'standard.pdf',
  osignerad: 'osignerad.pdf',
  'zip-med-for-fa-filer': 'anbud_bilagor.zip',
  korrupt: 'korrupt.pdf',
  'enkelsidig-skanning': 'enkelsidig-skanning.pdf',
  'utan-filandelse': 'utan-filandelse',
};

export interface Filflaggor {
  filer?: string[];
  ar_zip?: boolean;
  ar_uppackad?: boolean;
  ar_lasbar?: boolean | null;
  ar_dubbelsidig_original?: boolean;
  ar_korrekt_skannad?: boolean | null;
  ar_undertecknad_version?: boolean | null;
  mejlmissiv_diarieford?: boolean;
}

/**
 * Väljer profil ur fallets flaggor. TC-18:s `mejlmissiv_diarieford` är
 * metadata om registreringen, inte en egenskap hos filen, och återanvänder
 * därför standardfixturen.
 */
export function valjProfil(fil: Filflaggor | null | undefined): Filprofil | undefined {
  if (fil === null || fil === undefined || fil.filer === undefined || fil.filer.length === 0) {
    return undefined;
  }
  if (fil.ar_zip === true) return 'zip-med-for-fa-filer';
  if (fil.ar_lasbar === false) return 'korrupt';
  if (fil.ar_dubbelsidig_original === true && fil.ar_korrekt_skannad === false) {
    return 'enkelsidig-skanning';
  }
  if (fil.ar_undertecknad_version === false) return 'osignerad';
  if (fil.filer.every((namn) => !namn.includes('.'))) return 'utan-filandelse';
  return 'standard';
}

export interface Fixturuppslag {
  profil: Filprofil;
  /** Absolut sökväg till fixturen. */
  sokvag: string;
  /** Sant när filen faktiskt finns på disk. */
  finns: boolean;
}

export function slaUppFixtur(fil: Filflaggor | null | undefined): Fixturuppslag | undefined {
  const profil = valjProfil(fil);
  if (profil === undefined) return undefined;
  const sokvag = path.join(FIXTURKATALOG, FIXTURFIL[profil]);
  return { profil, sokvag, finns: existsSync(sokvag) };
}

/** Alla profiler och var deras fixtur ska ligga, för täckningskontroll. */
export function allaFixturer(): { profil: Filprofil; sokvag: string; finns: boolean }[] {
  return (Object.keys(FIXTURFIL) as Filprofil[]).map((profil) => {
    const sokvag = path.join(FIXTURKATALOG, FIXTURFIL[profil]);
    return { profil, sokvag, finns: existsSync(sokvag) };
  });
}
