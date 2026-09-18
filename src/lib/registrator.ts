/**
 * Registratorns beslut om fynd (S07, FR8).
 *
 * Servern äger valideringen: klienten kan ha samma kontroller, men ett beslut
 * som kringgår dem nås ändå av samma regler här. Ordningen är ADR Beslut 3:
 * beslutet loggas först, sedan körs S06:s omgång på nytt med beslutet, och
 * ingenting sparas om loggningen misslyckas.
 */

import type { Dokumentpost, Fyndbeslut } from './dokumentlager.ts';
import { korGranskningsomgang, type Fyndutgang } from './granskning/omgang/index.ts';
import type { Beroenden } from './granskningstjanst.ts';
import type { KontrolloggPost } from './kontrollogg/index.ts';

export const REGISTRATOR = 'Registrator';

/** Beslutsvärdena API:t tar emot, och hur de loggas. */
const BESLUT = {
  godkann: { utgang: 'godkant', loggtext: 'Godkänt rättningsförslag' },
  avvisa: { utgang: 'avvisat', loggtext: 'Avvisat fynd' },
  skicka: { utgang: 'skickat', loggtext: 'Skickat till handläggare' },
} as const satisfies Record<string, { utgang: Fyndutgang; loggtext: string }>;

export type Beslutstyp = keyof typeof BESLUT;

export function arBeslutstyp(varde: unknown): varde is Beslutstyp {
  return typeof varde === 'string' && Object.hasOwn(BESLUT, varde);
}

export interface Beslutsindata {
  dokumentId: string;
  regelId: string;
  beslut: string;
  motivering?: string | undefined;
}

export type Beslutsresultat =
  | { ok: true; post: Dokumentpost }
  | { ok: false; typ: 'ej-hittat' | 'ogiltigt' | 'misslyckades'; meddelande: string };

const ogiltigt = (meddelande: string): Beslutsresultat => ({ ok: false, typ: 'ogiltigt', meddelande });

/**
 * Beslut om samma dokument körs efter varandra. Utan det kan två samtidiga
 * beslut läsa samma post och det senare skriva över det förras beslut.
 */
const dokumentkoer = new Map<string, Promise<unknown>>();

function iTur<T>(dokumentId: string, arbete: () => Promise<T>): Promise<T> {
  const foregaende = dokumentkoer.get(dokumentId) ?? Promise.resolve();
  const nasta = foregaende.then(arbete, arbete);
  dokumentkoer.set(
    dokumentId,
    nasta.then(
      () => undefined,
      () => undefined,
    ),
  );
  return nasta;
}

export function hanteraBeslut(indata: Beslutsindata, beroenden: Beroenden): Promise<Beslutsresultat> {
  return iTur(indata.dokumentId, () => avgor(indata, beroenden));
}

async function avgor(indata: Beslutsindata, beroenden: Beroenden): Promise<Beslutsresultat> {
  const { lager, logg, katalog } = beroenden;
  const nu = beroenden.nu ?? (() => new Date());

  if (!arBeslutstyp(indata.beslut)) {
    return ogiltigt('Beslutet måste vara godkann, avvisa eller skicka.');
  }
  const beslutstyp = BESLUT[indata.beslut];
  const motivering = (indata.motivering ?? '').trim();
  // Ingen loggpost och ingen statusändring utan motivering vid avvisning (FR8).
  if (beslutstyp.utgang === 'avvisat' && motivering === '') {
    return ogiltigt('Avvisning kräver en motivering.');
  }

  const post = lager.hamta(indata.dokumentId);
  if (post === undefined) {
    return { ok: false, typ: 'ej-hittat', meddelande: `Dokumentet ${indata.dokumentId} finns inte.` };
  }
  if (post.granskningsstatus !== 'Mänsklig bedömning') {
    return ogiltigt('Bara dokument med status Mänsklig bedömning kan avgöras av registratorn.');
  }
  if (!post.fynd.some((fynd) => fynd.regelId === indata.regelId)) {
    return ogiltigt(`Dokumentet har inget fynd för regel ${indata.regelId}.`);
  }
  if (post.beslut.some((beslut) => beslut.regelId === indata.regelId)) {
    return ogiltigt(`Fyndet för regel ${indata.regelId} är redan avgjort.`);
  }

  const tidpunkt = nu().toISOString();
  const nyttBeslut: Fyndbeslut = {
    regelId: indata.regelId,
    utgang: beslutstyp.utgang,
    roll: REGISTRATOR,
    tidpunkt,
    motivering,
  };

  const beslutspost: KontrolloggPost = {
    tidpunkt,
    dokumentId: post.dokument.id,
    regelkatalogVersion: katalog.version,
    aiModell: null,
    regelutfall: [],
    fynd: [],
    andringar: [],
    statusbyten: [],
    manskligaBeslut: [
      {
        roll: REGISTRATOR,
        tidpunkt,
        beslut: beslutstyp.loggtext,
        motivering,
        regelId: indata.regelId,
      },
    ],
  };
  try {
    await logg.laggTill(beslutspost);
  } catch (fel) {
    return {
      ok: false,
      typ: 'misslyckades',
      meddelande: `Beslutet kunde inte loggas och sparades inte: ${fel instanceof Error ? fel.message : String(fel)}`,
    };
  }

  const beslut = [...post.beslut, nyttBeslut];
  let omgang;
  try {
    omgang = await korGranskningsomgang({
      dokument: post.dokument,
      katalog,
      referensdata: beroenden.referensdata,
      klient: beroenden.klient,
      logg,
      ...(beroenden.filkalla === undefined ? {} : { filkalla: beroenden.filkalla }),
      nu,
      avgjorda: beslut.map(({ regelId, utgang }) => ({ regelId, utgang })),
    });
  } catch (fel) {
    return {
      ok: false,
      typ: 'misslyckades',
      meddelande: `Granskningen efter beslutet misslyckades: ${fel instanceof Error ? fel.message : String(fel)}`,
    };
  }

  if (!omgang.omgangLoggad) {
    // Auto-rättningar som redan loggats har ändrat dokumentet, och det ska sparas.
    // Status och fynd är däremot oförändrade tills omgången kan loggas (FR8).
    lager.spara({ ...post, dokument: post.dokument });
    return {
      ok: false,
      typ: 'misslyckades',
      meddelande: `Beslutet kunde inte slutföras och dokumentets status är oförändrad: ${omgang.fel.join('; ')}`,
    };
  }

  const uppdaterad: Dokumentpost = {
    dokument: post.dokument,
    granskningsstatus: omgang.status,
    fynd: omgang.fynd,
    beslut,
  };
  lager.spara(uppdaterad);
  return { ok: true, post: uppdaterad };
}
