/**
 * Loggbred läsning för kvalitetsöversikten (S12 TI01).
 *
 * S02:s publika API läser per dokument. Översikten behöver hela loggen, så den
 * läser samma `kontrollogg.jsonl` med S02:s egen radtolkning i stället för att
 * duplicera lagrings- och parsningslogik, och utan att bredda S02:s API-yta.
 *
 * Modulen är läs-only. Inget härifrån skriver till loggen.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { tolkaPost } from '../kontrollogg/serialisering.ts';
import type { KontrolloggPost } from '../kontrollogg/types.ts';

export class KvalitetsLasfel extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'KvalitetsLasfel';
  }
}

/**
 * Alla loggposter, för alla dokument, i tilläggsordning. En logg som inte finns
 * ännu ger en tom lista – ingen granskning har hunnit köras, inte ett fel.
 *
 * Hela filen läses varje gång: ADR Beslut 3 accepterar kostnaden och FR13
 * kräver att siffrorna stämmer med loggen, inte med en cache.
 */
export async function lasAllaPoster(filsokvag: string): Promise<KontrolloggPost[]> {
  const absolutSokvag = resolve(filsokvag);
  let innehall: string;
  try {
    innehall = readFileSync(absolutSokvag, 'utf8');
  } catch (orsak) {
    if ((orsak as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new KvalitetsLasfel(`Kunde inte läsa kontrolloggen ${absolutSokvag}.`, { cause: orsak });
  }

  return innehall
    .split('\n')
    .filter((rad) => rad.trim() !== '')
    .map(tolkaPost);
}
