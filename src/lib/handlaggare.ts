/**
 * Handläggarens rättningar (S08, FR9).
 *
 * Servern äger valideringen: diarienummer är oföränderligt och Registrerat
 * kan inte sättas direkt, oavsett vad klienten skickar. Ordningen är ADR
 * Beslut 3: ändringen loggas först, och ingenting sparas om loggningen
 * misslyckas. Ny granskning går via S06:s omgångskontrakt.
 */

import type { Dokumentpost } from './dokumentlager.ts';
import type { GranskatDokument } from './granskning/kontrakt.ts';
import { korGranskningsomgang } from './granskning/omgang/index.ts';
import type { Beroenden } from './granskningstjanst.ts';
import type { KontrolloggPost } from './kontrollogg/index.ts';
import { ATGARD_KRAVS, sokvagForRegel } from './handlaggare-vy.ts';

export const HANDLAGGARE = 'Handläggare';

export type Andringsindata =
  | { dokumentId: string; regelId: string }
  | { dokumentId: string; falt: string; varde: unknown };

export type Handlaggarresultat =
  | { ok: true; post: Dokumentpost }
  | { ok: false; typ: 'ej-hittat' | 'ogiltigt' | 'misslyckades'; meddelande: string };

const ogiltigt = (meddelande: string): Handlaggarresultat => ({
  ok: false,
  typ: 'ogiltigt',
  meddelande,
});

function arDiarienummer(sokvag: string): boolean {
  return sokvag === 'arende.diarienummer' || sokvag.endsWith('.diarienummer');
}

function arStatusfalt(sokvag: string): boolean {
  const nyckel = sokvag.includes('.') ? sokvag.slice(sokvag.lastIndexOf('.') + 1) : sokvag;
  return nyckel === 'status' || sokvag === 'granskningsstatus' || sokvag === 'dokumentstatus';
}

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

function faltvarde(objekt: object, nyckel: string): unknown {
  return (objekt as Record<string, unknown>)[nyckel];
}

function sattFaltvarde(objekt: object, nyckel: string, varde: unknown): void {
  (objekt as Record<string, unknown>)[nyckel] = varde;
}

function lasFalt(dokument: GranskatDokument, sokvag: string): unknown {
  if (sokvag === 'dokumenttext') return dokument.dokumenttext ?? '';
  if (sokvag === 'granskningsstatus') return undefined;
  const punkt = sokvag.indexOf('.');
  if (punkt === -1) return undefined;
  const objekt = sokvag.slice(0, punkt);
  const nyckel = sokvag.slice(punkt + 1);
  if (objekt === 'arende') return faltvarde(dokument.arende, nyckel);
  if (objekt === 'arendedokument') return faltvarde(dokument.arendedokument, nyckel);
  return undefined;
}

function skrivFalt(dokument: GranskatDokument, sokvag: string, varde: unknown): void {
  const nuvarande = lasFalt(dokument, sokvag);
  let skriv = varde;
  if (typeof nuvarande === 'number' && typeof varde === 'string' && varde.trim() !== '' && Number.isFinite(Number(varde))) {
    skriv = Number(varde);
  }
  if (sokvag === 'dokumenttext') {
    dokument.dokumenttext = String(skriv);
    return;
  }
  const punkt = sokvag.indexOf('.');
  if (punkt === -1) return;
  const objekt = sokvag.slice(0, punkt);
  const nyckel = sokvag.slice(punkt + 1);
  if (objekt === 'arende') {
    sattFaltvarde(dokument.arende, nyckel, skriv);
    return;
  }
  if (objekt === 'arendedokument') {
    sattFaltvarde(dokument.arendedokument, nyckel, skriv);
  }
}

function kannerSokvag(sokvag: string): boolean {
  if (sokvag === 'dokumenttext') return true;
  if (sokvag === 'granskningsstatus' || sokvag === 'dokumentstatus') return true;
  return sokvag.startsWith('arende.') || sokvag.startsWith('arendedokument.');
}

async function tillampaFalt(
  post: Dokumentpost,
  sokvag: string,
  varde: unknown,
  beroenden: Beroenden,
  regelId: string | undefined,
  beslutstext: string,
): Promise<Handlaggarresultat> {
  if (!kannerSokvag(sokvag)) {
    return ogiltigt(`Fältet ${sokvag} kan inte ändras av handläggaren.`);
  }
  if (arDiarienummer(sokvag)) {
    return ogiltigt('Handläggaren kan inte ändra diarienummer.');
  }
  if (arStatusfalt(sokvag) && varde === 'Registrerat') {
    return ogiltigt('Handläggaren kan inte sätta status Registrerat.');
  }
  if (sokvag === 'granskningsstatus') {
    return ogiltigt('Handläggaren kan inte sätta granskningsstatus direkt.');
  }

  const fore = lasFalt(post.dokument, sokvag);
  if (fore === undefined && sokvag !== 'dokumenttext' && !sokvag.startsWith('arendedokument.') && !sokvag.startsWith('arende.')) {
    return ogiltigt(`Fältet ${sokvag} finns inte på dokumentet.`);
  }

  const tidpunkt = (beroenden.nu ?? (() => new Date()))().toISOString();
  const uppdaterad: Dokumentpost = structuredClone(post);
  skrivFalt(uppdaterad.dokument, sokvag, varde);

  const andring: KontrolloggPost['andringar'][number] = {
    falt: sokvag,
    fore,
    efter: varde,
    automatisk: false,
  };
  if (regelId !== undefined) andring.regelId = regelId;

  const beslut: KontrolloggPost['manskligaBeslut'][number] = {
    roll: HANDLAGGARE,
    tidpunkt,
    beslut: beslutstext,
    motivering: '',
  };
  if (regelId !== undefined) beslut.regelId = regelId;

  const loggpost: KontrolloggPost = {
    tidpunkt,
    dokumentId: post.dokument.id,
    regelkatalogVersion: beroenden.katalog.version,
    aiModell: null,
    regelutfall: [],
    fynd: [],
    andringar: [andring],
    statusbyten: [],
    manskligaBeslut: [beslut],
  };

  try {
    await beroenden.logg.laggTill(loggpost);
  } catch (fel) {
    return {
      ok: false,
      typ: 'misslyckades',
      meddelande: `Ändringen kunde inte loggas och sparades inte: ${fel instanceof Error ? fel.message : String(fel)}`,
    };
  }

  beroenden.lager.spara(uppdaterad);
  return { ok: true, post: uppdaterad };
}

async function avgorAndring(indata: Andringsindata, beroenden: Beroenden): Promise<Handlaggarresultat> {
  const post = beroenden.lager.hamta(indata.dokumentId);
  if (post === undefined) {
    return { ok: false, typ: 'ej-hittat', meddelande: `Dokumentet ${indata.dokumentId} finns inte.` };
  }
  if (post.granskningsstatus !== ATGARD_KRAVS) {
    return ogiltigt('Bara dokument med status Åtgärd krävs kan ändras av handläggaren.');
  }

  if ('regelId' in indata) {
    const fynd = post.fynd.find((f) => f.regelId === indata.regelId);
    if (fynd === undefined) {
      return ogiltigt(`Dokumentet har inget fynd för regel ${indata.regelId}.`);
    }
    if (fynd.rattningsforslag === undefined || fynd.rattningsforslag === '') {
      return ogiltigt(`Fyndet för regel ${indata.regelId} har inget rättningsförslag att tillämpa.`);
    }
    const regel = beroenden.katalog.rules.find((r) => r.id === indata.regelId);
    if (regel === undefined) {
      return ogiltigt(`Regeln ${indata.regelId} finns inte i katalogen.`);
    }
    const sokvag = sokvagForRegel(regel);
    if (sokvag === undefined) {
      return ogiltigt(`Förslaget för ${indata.regelId} kan inte tillämpas som ett fältvärde.`);
    }
    return tillampaFalt(
      post,
      sokvag,
      fynd.rattningsforslag,
      beroenden,
      indata.regelId,
      'Tillämpade förslag',
    );
  }

  return tillampaFalt(post, indata.falt, indata.varde, beroenden, undefined, 'Redigerade fält');
}

export function hanteraAndring(indata: Andringsindata, beroenden: Beroenden): Promise<Handlaggarresultat> {
  return iTur(indata.dokumentId, () => avgorAndring(indata, beroenden));
}

async function avgorNyGranskning(dokumentId: string, beroenden: Beroenden): Promise<Handlaggarresultat> {
  const post = beroenden.lager.hamta(dokumentId);
  if (post === undefined) {
    return { ok: false, typ: 'ej-hittat', meddelande: `Dokumentet ${dokumentId} finns inte.` };
  }
  if (post.granskningsstatus !== ATGARD_KRAVS) {
    return ogiltigt('Bara dokument med status Åtgärd krävs kan skickas för ny granskning.');
  }

  const { lager, logg, katalog } = beroenden;
  const nu = beroenden.nu ?? (() => new Date());

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
    });
  } catch (fel) {
    return {
      ok: false,
      typ: 'misslyckades',
      meddelande: `Ny granskning misslyckades. Dokumentet är kvar i Åtgärd krävs: ${fel instanceof Error ? fel.message : String(fel)}`,
    };
  }

  if (!omgang.omgangLoggad) {
    // Auto-rättningar som redan loggats har ändrat dokumentet och ska sparas.
    // Status och fynd lämnas orörda tills omgången kan loggas (FR9).
    lager.spara({ ...post, dokument: post.dokument });
    return {
      ok: false,
      typ: 'misslyckades',
      meddelande: `Ny granskning misslyckades. Dokumentet är kvar i Åtgärd krävs: ${omgang.fel.join('; ')}`,
    };
  }

  const uppdaterad: Dokumentpost = {
    dokument: post.dokument,
    granskningsstatus: omgang.status,
    fynd: omgang.fynd,
    beslut: [],
  };
  lager.spara(uppdaterad);
  return { ok: true, post: uppdaterad };
}

export function skickaForNyGranskning(
  dokumentId: string,
  beroenden: Beroenden,
): Promise<Handlaggarresultat> {
  return iTur(dokumentId, () => avgorNyGranskning(dokumentId, beroenden));
}
