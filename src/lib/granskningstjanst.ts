/**
 * Det som varje vy och testkörare behöver för att köra en granskningsomgång
 * mot lagrade dokument: beroendena samlade på ett ställe, och första omgången
 * för ett nyinläst dokument (S06:s entry point, S03:s dokument, S07:s lager).
 */

import type { Dokumentlager } from './dokumentlager.ts';
import type { AiKlient } from './granskning/ai/klient.ts';
import type { GranskatDokument } from './granskning/kontrakt.ts';
import { korGranskningsomgang, type Filkalla, type Granskningsomgang } from './granskning/omgang/index.ts';
import type { Referensdata } from './granskning/regler.ts';
import type { Kontrollogg } from './kontrollogg/index.ts';
import type { ChecklistCatalog } from './rule-catalog.ts';

export interface Beroenden {
  lager: Dokumentlager;
  logg: Kontrollogg;
  katalog: ChecklistCatalog;
  referensdata: Referensdata;
  klient: AiKlient;
  filkalla?: Filkalla;
  /** Injicerbar klocka, så att tester får deterministiska tidpunkter. */
  nu?: () => Date;
}

/**
 * Granskar ett nyinläst dokument första gången och lagrar resultatet.
 * Kastar om omgångens loggpost inte kunde skrivas: ett dokument utan
 * spårbar första granskning ska inte hamna i lagret (FR7).
 */
export async function granskaOchSpara(
  dokument: GranskatDokument & { id: string },
  beroenden: Beroenden,
): Promise<Granskningsomgang> {
  const omgang = await korGranskningsomgang({
    dokument,
    katalog: beroenden.katalog,
    referensdata: beroenden.referensdata,
    klient: beroenden.klient,
    logg: beroenden.logg,
    ...(beroenden.filkalla === undefined ? {} : { filkalla: beroenden.filkalla }),
    ...(beroenden.nu === undefined ? {} : { nu: beroenden.nu }),
  });
  if (!omgang.omgangLoggad) {
    throw new Error(`Granskningen av ${dokument.id} kunde inte loggas: ${omgang.fel.join('; ')}`);
  }

  beroenden.lager.spara({
    dokument,
    granskningsstatus: omgang.status,
    fynd: omgang.fynd,
    beslut: [],
  });
  return omgang;
}
