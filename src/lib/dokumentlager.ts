/**
 * Filbaserat dokumentlager (`docs/adr.md#skiss`: dokument ligger som JSON på disk).
 *
 * Lagret håller det senaste granskningsläget per dokument. Historiken ligger i
 * kontrolloggen, inte här. S07 skapade lagret; S08 och S09 läser och skriver
 * samma poster.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { Fynd, GranskatDokument } from './granskning/kontrakt.ts';
import type { Fyndutgang, Granskningsstatus } from './granskning/omgang/index.ts';

/** Ett registratorbeslut om ett fynd, som det visas i detaljvyn. */
export interface Fyndbeslut {
  regelId: string;
  utgang: Fyndutgang;
  roll: string;
  tidpunkt: string;
  motivering: string;
}

export interface Dokumentpost {
  dokument: GranskatDokument & { id: string };
  /** Utfallet av senaste granskningsomgång. Kön filtrerar på det här värdet. */
  granskningsstatus: Granskningsstatus;
  /** Alla fynd i senaste omgång, även avvisade. */
  fynd: Fynd[];
  /** Registratorns beslut sedan senaste omgång som inte hade några beslut. */
  beslut: Fyndbeslut[];
}

export interface Dokumentlager {
  alla(): Dokumentpost[];
  hamta(dokumentId: string): Dokumentpost | undefined;
  spara(post: Dokumentpost): void;
}

function lasFil(filsokvag: string): Dokumentpost[] {
  let innehall: string;
  try {
    innehall = readFileSync(filsokvag, 'utf8');
  } catch (orsak) {
    if ((orsak as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw orsak;
  }
  return JSON.parse(innehall) as Dokumentpost[];
}

/**
 * Varje anrop läser filen på nytt och returnerar nya objekt, så en anropare
 * som ändrar en post i minnet påverkar inget förrän `spara` anropas.
 */
export function oppnaDokumentlager(filsokvag: string): Dokumentlager {
  const absolutSokvag = resolve(filsokvag);

  return {
    alla: () => lasFil(absolutSokvag),
    hamta: (dokumentId) => lasFil(absolutSokvag).find((post) => post.dokument.id === dokumentId),
    spara(post) {
      const poster = lasFil(absolutSokvag);
      const index = poster.findIndex((rad) => rad.dokument.id === post.dokument.id);
      if (index === -1) poster.push(post);
      else poster[index] = post;

      mkdirSync(dirname(absolutSokvag), { recursive: true });
      // Skriv och byt namn, så att en avbruten skrivning aldrig lämnar en halv fil.
      const temporar = `${absolutSokvag}.tmp`;
      writeFileSync(temporar, JSON.stringify(poster, null, 2), 'utf8');
      renameSync(temporar, absolutSokvag);
    },
  };
}
