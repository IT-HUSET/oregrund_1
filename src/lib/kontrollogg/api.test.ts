import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import * as kontrollogg from './index.ts';

const MUTERANDE_NAMN =
  /(uppdatera|ändra|andra|radera|taBort|skrivOver|rensa|update|delete|remove|patch|clear|truncate)/i;

describe('kontrolloggens publika API (TI04)', () => {
  it('exporterar bara tillägg, läsning och feltyper', () => {
    // FR7: "Loggposter går inte att ändra eller radera via gränssnittet." Kravet
    // hålls strukturellt, genom att ingen sådan väg finns att anropa.
    assert.deepEqual(Object.keys(kontrollogg).sort(), [
      'KontrolloggLasfel',
      'KontrolloggPostfel',
      'KontrolloggSkrivfel',
      'oppnaKontrollogg',
    ]);
  });

  it('loggobjektet har inga metoder som ändrar eller tar bort en befintlig post', () => {
    const katalog = mkdtempSync(join(tmpdir(), 'kontrollogg-api-'));
    try {
      const logg = kontrollogg.oppnaKontrollogg(join(katalog, 'kontrollogg.jsonl'));

      const metoder = Object.keys(logg).sort();

      assert.deepEqual(metoder, ['laggTill', 'lasForDokument']);
      assert.deepEqual(metoder.filter((namn) => MUTERANDE_NAMN.test(namn)), []);
    } finally {
      rmSync(katalog, { recursive: true, force: true });
    }
  });
});
