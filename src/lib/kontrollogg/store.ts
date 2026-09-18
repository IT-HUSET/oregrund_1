import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { serialiseraPost, tolkaPost } from './serialisering.ts';
import type { KontrolloggPost } from './types.ts';

/** Kastas när en loggpost inte kunde skrivas. Anroparen ska avbryta sin ändring. */
export class KontrolloggSkrivfel extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'KontrolloggSkrivfel';
  }
}

/** Kastas när loggfilen inte kunde läsas eller innehåller en skadad rad. */
export class KontrolloggLasfel extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'KontrolloggLasfel';
  }
}

export interface Kontrollogg {
  /**
   * Lägger till en post sist i loggen. Kastar `KontrolloggSkrivfel` om posten
   * inte kunde skrivas, och skriver då ingenting alls.
   */
  laggTill(post: KontrolloggPost): Promise<void>;
  /** Hela historiken för ett dokument i tilläggsordning. Tom lista om inget loggats. */
  lasForDokument(dokumentId: string): Promise<KontrolloggPost[]>;
}

/**
 * Enkelt lås per loggfil. ADR Beslut 3: samtidiga skrivningar mot samma fil
 * kräver ett lås så att ingen post tappas eller trasas sönder.
 */
const skrivkoer = new Map<string, Promise<void>>();

function koaSkrivning(nyckel: string, skrivning: () => void): Promise<void> {
  const foregaende = skrivkoer.get(nyckel) ?? Promise.resolve();
  const nasta = foregaende.then(skrivning);
  // Kön håller bara ordningen. Felet tillhör anroparen, inte nästa skrivare,
  // så den lagrade kedjan är alltid avfångad.
  skrivkoer.set(
    nyckel,
    nasta.then(
      () => undefined,
      () => undefined,
    ),
  );
  return nasta;
}

/**
 * Öppnar en append-only kontrollogg mot en JSONL-fil
 * (`docs/adr.md#beslut-3-oföränderlig-kontrollogg-append-only`).
 *
 * Modulen exponerar bara tillägg och läsning. Det finns avsiktligt ingen väg
 * att ändra eller ta bort en befintlig post (FR7).
 */
export function oppnaKontrollogg(filsokvag: string): Kontrollogg {
  const absolutSokvag = resolve(filsokvag);

  return {
    // Async så att även ett valideringsfel når anroparen som ett avvisat löfte,
    // inte som ett synkront kast.
    async laggTill(post: KontrolloggPost): Promise<void> {
      // Serialiseras före kön: en ogiltig post ska aldrig nå filen.
      const rad = serialiseraPost(post);

      return koaSkrivning(absolutSokvag, () => {
        try {
          mkdirSync(dirname(absolutSokvag), { recursive: true });
          appendFileSync(absolutSokvag, rad, { encoding: 'utf8' });
        } catch (orsak) {
          throw new KontrolloggSkrivfel(
            `Kunde inte skriva till kontrolloggen ${absolutSokvag}.`,
            { cause: orsak },
          );
        }
      });
    },

    async lasForDokument(dokumentId: string): Promise<KontrolloggPost[]> {
      let innehall: string;
      try {
        innehall = readFileSync(absolutSokvag, 'utf8');
      } catch (orsak) {
        if ((orsak as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw new KontrolloggLasfel(`Kunde inte läsa kontrolloggen ${absolutSokvag}.`, {
          cause: orsak,
        });
      }

      // Ingen indexering: hela filen läses och filtreras (ADR Beslut 3).
      return innehall
        .split('\n')
        .filter((rad) => rad.trim() !== '')
        .map(tolkaPost)
        .filter((post) => post.dokumentId === dokumentId);
    },
  };
}
