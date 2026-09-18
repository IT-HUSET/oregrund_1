import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { KontrolloggPostfel, serialiseraPost, tolkaPost } from './serialisering.ts';
import { granskningspost } from './testdata.ts';

describe('kontrolloggens händelseschema (TI01)', () => {
  it('round-trippar en fullständig post utan fältförlust', () => {
    // Nedströms (S06, S07/S08, S11, S12) läser posten ur filen, inte ur minnet:
    // tappas ett fält i serialiseringen försvinner spårbarheten FR7 kräver.
    const post = granskningspost();

    const tillbaka = tolkaPost(serialiseraPost(post).trimEnd());

    assert.deepEqual(tillbaka, post);
  });

  it('serialiserar till exakt en JSONL-rad även när fältvärden innehåller radbrytningar', () => {
    const post = granskningspost({
      fynd: [
        {
          regelId: 'AD-TITEL-1',
          allvarlighetsgrad: 'hög',
          metod: 'C',
          evidens: 'rad ett\nrad två',
          forklaring: 'Flerradigt citat ur filen.',
        },
      ],
    });

    const rad = serialiseraPost(post);

    assert.equal(rad.endsWith('\n'), true);
    assert.equal(rad.trimEnd().includes('\n'), false);
    assert.equal(tolkaPost(rad.trimEnd()).fynd[0]?.evidens, 'rad ett\nrad två');
  });

  it('avvisar en post som saknar ett FR7-fält', () => {
    const { regelkatalogVersion: _utelamnad, ...utanVersion } = granskningspost();

    assert.throws(() => serialiseraPost(utanVersion as never), KontrolloggPostfel);
  });
});
