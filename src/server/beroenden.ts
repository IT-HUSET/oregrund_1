/**
 * Kopplar ihop lagret, loggen, regelkatalogen och AI-klienten för appens
 * serverkod. Sökvägarna anges uttryckligen från arbetskatalogen: modulernas
 * egna standardsökvägar bygger på `import.meta.url`, som inte är tillförlitlig i en bundlad app.
 */

import { join } from 'node:path';

import { oppnaDokumentlager } from '../lib/dokumentlager.ts';
import { skapaClaudeKlient, type AiKlient } from '../lib/granskning/ai/klient.ts';
import type { Beroenden } from '../lib/granskningstjanst.ts';
import { oppnaKontrollogg } from '../lib/kontrollogg/index.ts';
import { loadKlassificeringsstruktur, loadKontaktregister } from '../lib/reference-data.ts';
import { loadChecklistCatalog } from '../lib/rule-catalog.ts';

export function datamapp(): string {
  return process.env['OREGRUND_DATA_DIR'] ?? join(process.cwd(), 'data');
}

/** Utan API-nyckel degraderar AI-reglerna till "ej genomförd" (ADR Beslut 2) i stället för att krascha. */
function skapaKlient(): AiKlient {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (apiKey !== undefined && apiKey !== '') return skapaClaudeKlient({ apiKey });
  return {
    modell: 'ingen-api-nyckel',
    bedom: async () => ({ ok: false, fel: 'transport', detalj: 'ANTHROPIC_API_KEY saknas' }),
  };
}

let beroenden: Beroenden | undefined;

export function hamtaBeroenden(): Beroenden {
  if (beroenden === undefined) {
    const mapp = datamapp();
    beroenden = {
      lager: oppnaDokumentlager(join(mapp, 'dokument.json')),
      logg: oppnaKontrollogg(join(mapp, 'kontrollogg.jsonl')),
      katalog: loadChecklistCatalog(join(mapp, 'checklist_rules.json')),
      referensdata: {
        kontaktregister: loadKontaktregister(join(mapp, 'kontaktregister.json')),
        klassificeringsstruktur: loadKlassificeringsstruktur(join(mapp, 'klassificeringsstruktur.json')),
      },
      klient: skapaKlient(),
    };
  }
  return beroenden;
}
