/**
 * Läser in testcases.json som dokument och kör första granskningsomgången, så att
 * registratorkön har något att visa. Syntetiska data bara (NFR Security).
 * Kör: npm run seed (ANTHROPIC_API_KEY valfri; utan den blir AI-reglerna "ej genomförda").
 */

import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { lasInDokument } from '../lib/ingest.js';
import type { GranskatDokument } from '../src/lib/granskning/kontrakt.ts';
import { granskaOchSpara } from '../src/lib/granskningstjanst.ts';
import { datamapp, hamtaBeroenden } from '../src/server/beroenden.ts';

const mapp = datamapp();
rmSync(join(mapp, 'dokument.json'), { force: true });
rmSync(join(mapp, 'kontrollogg.jsonl'), { force: true });

const { cases } = JSON.parse(readFileSync('casedetails/testcases.json', 'utf8')) as {
  cases: (GranskatDokument & { case_id: string })[];
};

const beroenden = hamtaBeroenden();
for (const tc of cases) {
  const dokument = lasInDokument(tc) as GranskatDokument & { id: string };
  dokument.id = `${tc.case_id}-DOK-1`;
  const omgang = await granskaOchSpara(dokument, beroenden);
  console.log(`${tc.case_id}: ${omgang.status}`);
}
