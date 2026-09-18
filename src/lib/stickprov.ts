/**
 * Stickprov på automatiskt registrerade dokument (S11, FR12).
 *
 * Godkända och autokorrigerade dokument passerar aldrig registratorns kö, så
 * det här är den enda vägen att upptäcka att automatiken haft fel. En markering
 * ändrar aldrig dokumentets data, status eller något regelutfall: den lägger
 * bara till en kontrolloggpost (FR7, ADR Beslut 3).
 */

import type { Dokumentpost } from './dokumentlager.ts';
import type { Granskningsstatus } from './granskning/omgang/index.ts';
import type { Beroenden } from './granskningstjanst.ts';
import type { KontrolloggPost } from './kontrollogg/index.ts';
import { REGISTRATOR } from './registrator.ts';

/** De statusar som registrerar dokumentet automatiskt (FR4), och därmed stickprovskön. */
export const REGISTRERADE_STATUSAR: readonly Granskningsstatus[] = ['Godkänd', 'Autokorrigerad'];

/**
 * Beslutstexterna i loggen. Kvalitetsöversikten (S12) räknar felbedömningar mot
 * antalet gjorda stickprov, så båda utgångarna måste loggas – annars finns
 * ingen nämnare.
 */
export const STICKPROV_FELBEDOMNING = 'Stickprov: felbedömning';
export const STICKPROV_UTAN_ANMARKNING = 'Stickprov: granskat utan anmärkning';

export type Stickprovsutgang = 'felbedomning' | 'utan-anmarkning';

const UTGANGAR = {
  felbedomning: { loggtext: STICKPROV_FELBEDOMNING, kraverKommentar: true },
  'utan-anmarkning': { loggtext: STICKPROV_UTAN_ANMARKNING, kraverKommentar: false },
} as const satisfies Record<Stickprovsutgang, { loggtext: string; kraverKommentar: boolean }>;

export function arStickprovsutgang(varde: unknown): varde is Stickprovsutgang {
  return typeof varde === 'string' && Object.hasOwn(UTGANGAR, varde);
}

export function filtreraStickprovsko(poster: Dokumentpost[]): Dokumentpost[] {
  return poster.filter((post) => REGISTRERADE_STATUSAR.includes(post.granskningsstatus));
}

export interface Stickprovsindata {
  dokumentId: string;
  regelId: string;
  utgang: string;
  kommentar?: string | undefined;
}

export type Stickprovsresultat =
  | { ok: true; loggtext: string }
  | { ok: false; typ: 'ej-hittat' | 'ogiltigt' | 'misslyckades'; meddelande: string };

const ogiltigt = (meddelande: string): Stickprovsresultat => ({
  ok: false,
  typ: 'ogiltigt',
  meddelande,
});

/**
 * Regel-ID:n som går att markera i ett registrerat dokument: de fynd som står
 * kvar plus de som auto-rättades. Ett auto-rättat fynd finns inte längre i
 * fyndlistan efter omkörningen – rättningen i loggen är beviset på att regeln
 * slog till, och den är precis vad en registrator kan vilja underkänna.
 */
export async function markerbaraRegelIdn(
  post: Dokumentpost,
  logg: Beroenden['logg'],
): Promise<string[]> {
  const historik = await logg.lasForDokument(post.dokument.id);
  const rattade = historik.flatMap((rad) =>
    rad.andringar.filter((a) => a.automatisk && a.regelId !== undefined).map((a) => a.regelId as string),
  );
  return [...new Set([...post.fynd.map((fynd) => fynd.regelId), ...rattade])];
}

/**
 * Registrerar registratorns bedömning av ett stickprov. Valideringen ligger här,
 * på servern: en klient som kringgår sitt eget formulär möter samma krav.
 */
export async function hanteraStickprov(
  indata: Stickprovsindata,
  beroenden: Beroenden,
): Promise<Stickprovsresultat> {
  const { lager, logg, katalog } = beroenden;
  const nu = beroenden.nu ?? (() => new Date());

  if (!arStickprovsutgang(indata.utgang)) {
    return ogiltigt('Utgången måste vara felbedomning eller utan-anmarkning.');
  }
  const utgang = UTGANGAR[indata.utgang];
  const kommentar = (indata.kommentar ?? '').trim();
  // FR12: "En markering kräver kommentar."
  if (utgang.kraverKommentar && kommentar === '') {
    return ogiltigt('En felbedömning kräver en kommentar.');
  }

  const post = lager.hamta(indata.dokumentId);
  if (post === undefined) {
    return { ok: false, typ: 'ej-hittat', meddelande: `Dokumentet ${indata.dokumentId} finns inte.` };
  }
  if (!REGISTRERADE_STATUSAR.includes(post.granskningsstatus)) {
    return ogiltigt(
      'Bara automatiskt registrerade dokument (Godkänd eller Autokorrigerad) kan stickprovsgranskas.',
    );
  }
  const markerbara = await markerbaraRegelIdn(post, logg);
  if (!markerbara.includes(indata.regelId)) {
    return ogiltigt(`Dokumentet har inget granskat fynd för regel ${indata.regelId}.`);
  }

  const tidpunkt = nu().toISOString();
  const stickprovspost: KontrolloggPost = {
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
        beslut: utgang.loggtext,
        motivering: kommentar,
        regelId: indata.regelId,
      },
    ],
  };

  try {
    await logg.laggTill(stickprovspost);
  } catch (fel) {
    // Ingen loggpost, ingen markering. Dokumentet är orört i båda fallen.
    return {
      ok: false,
      typ: 'misslyckades',
      meddelande: `Markeringen kunde inte loggas och sparades inte: ${
        fel instanceof Error ? fel.message : String(fel)
      }`,
    };
  }

  // Dokumentlagret rörs aldrig: status, fynd och beslut är oförändrade.
  return { ok: true, loggtext: utgang.loggtext };
}
