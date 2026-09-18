import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { KontrolloggPostfel } from './serialisering.ts';
import { KontrolloggSkrivfel, oppnaKontrollogg } from './store.ts';
import { granskningspost } from './testdata.ts';

const DOKUMENT_ID = 'ARENDE-2025-01053-DOK-1';

let katalog: string;
let filsokvag: string;

describe('append-only kontrollogg (TI02, TI03)', () => {
  beforeEach(() => {
    // Egen fil per test: fel-injektionen nedan får inte läcka till ordningstesterna.
    katalog = mkdtempSync(join(tmpdir(), 'kontrollogg-'));
    filsokvag = join(katalog, 'kontrollogg.jsonl');
  });

  afterEach(() => {
    rmSync(katalog, { recursive: true, force: true });
  });

  it('S01: lägger till en granskningsomgång och läser tillbaka den med alla fält intakta', async () => {
    const logg = oppnaKontrollogg(filsokvag);
    const post = granskningspost();

    await logg.laggTill(post);

    assert.deepEqual(await logg.lasForDokument(DOKUMENT_ID), [post]);
  });

  it('S02: andra granskningsomgången läggs till utan att den första rörs', async () => {
    const logg = oppnaKontrollogg(filsokvag);
    const forstaOmgangen = granskningspost();
    await logg.laggTill(forstaOmgangen);
    const forstaRadenInnan = readFileSync(filsokvag, 'utf8').split('\n')[0];

    const andraOmgangen = granskningspost({
      tidpunkt: '2025-11-17T10:05:00.000Z',
      fynd: [],
      statusbyten: [{ typ: 'granskningsstatus', fran: 'Mänsklig bedömning', till: 'Godkänd' }],
    });
    await logg.laggTill(andraOmgangen);

    // FR7: loggen visar hela historiken när dokumentet granskats flera gånger.
    assert.deepEqual(await logg.lasForDokument(DOKUMENT_ID), [forstaOmgangen, andraOmgangen]);
    // Filen fick en rad. Den första raden är oförändrad, tecken för tecken.
    assert.equal(readFileSync(filsokvag, 'utf8').split('\n')[0], forstaRadenInnan);
  });

  it('läser bara det efterfrågade dokumentets poster ur den gemensamma filen', async () => {
    const logg = oppnaKontrollogg(filsokvag);
    await logg.laggTill(granskningspost());
    await logg.laggTill(granskningspost({ dokumentId: 'ARENDE-2025-00008-DOK-3' }));

    const historik = await logg.lasForDokument(DOKUMENT_ID);

    assert.equal(historik.length, 1);
    assert.equal(historik[0]?.dokumentId, DOKUMENT_ID);
  });

  it('S04: ett dokument utan loggposter ger tom historik, inte ett fel', async () => {
    const logg = oppnaKontrollogg(filsokvag);

    // En registrator som öppnar loggvyn för ett ogranskat dokument ska se en tom
    // logg, inte ett felmeddelande.
    assert.deepEqual(await logg.lasForDokument('ARENDE-2025-02220-DOK-9'), []);
  });

  it('S03: en misslyckad skrivning signaleras till anroparen och lämnar loggen orörd', async (t) => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      t.skip('root kringgår filrättigheter, så skrivfelet går inte att framkalla');
      return;
    }
    const logg = oppnaKontrollogg(filsokvag);
    const forstaOmgangen = granskningspost();
    await logg.laggTill(forstaOmgangen);
    const innehallInnan = readFileSync(filsokvag, 'utf8');

    chmodSync(filsokvag, 0o444);
    try {
      // ADR Beslut 3: anroparen måste kunna upptäcka felet och avbryta sin
      // status- eller dataändring.
      await assert.rejects(
        logg.laggTill(granskningspost({ tidpunkt: '2025-11-17T10:05:00.000Z' })),
        KontrolloggSkrivfel,
      );
    } finally {
      chmodSync(filsokvag, 0o644);
    }

    assert.equal(readFileSync(filsokvag, 'utf8'), innehallInnan);
    assert.deepEqual(await logg.lasForDokument(DOKUMENT_ID), [forstaOmgangen]);
  });

  it('en ogiltig post avvisas innan något skrivs till filen', async () => {
    const logg = oppnaKontrollogg(filsokvag);
    const { dokumentId: _utelamnad, ...utanDokumentId } = granskningspost();

    await assert.rejects(logg.laggTill(utanDokumentId as never), KontrolloggPostfel);

    assert.deepEqual(await logg.lasForDokument(DOKUMENT_ID), []);
  });

  it('samtidiga tillägg mot samma fil ger separata, kompletta poster', async () => {
    const logg = oppnaKontrollogg(filsokvag);
    const poster = Array.from({ length: 20 }, (_, i) =>
      granskningspost({ tidpunkt: new Date(Date.UTC(2025, 10, 17, 9, i)).toISOString() }),
    );

    // Utan lås kan samtidiga skrivningar mot samma fil tappa eller blanda rader.
    await Promise.all(poster.map((post) => logg.laggTill(post)));

    const historik = await logg.lasForDokument(DOKUMENT_ID);
    assert.equal(historik.length, poster.length);
    assert.deepEqual(
      historik.map((p) => p.tidpunkt).sort(),
      poster.map((p) => p.tidpunkt).sort(),
    );
  });

  it('en skadad rad i loggfilen ger ett läsfel i stället för tyst bortfall', async () => {
    writeFileSync(filsokvag, '{"dokumentId": "trasig"\n', 'utf8');

    await assert.rejects(
      oppnaKontrollogg(filsokvag).lasForDokument(DOKUMENT_ID),
      KontrolloggPostfel,
    );
  });
});
