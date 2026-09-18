/**
 * Auto-rättning av säkra fel (S06 TI03, TI04, FR5).
 *
 * Bara AD-KONTAKT-5 och FIL-ZIP-1 rättas, via en hårdkodad allowlist. Katalogens
 * auto-rättningsflagga kan bredda vad som valideras, men aldrig vad som muteras:
 * en felkonfigurerad katalog får inte nå datum, diarienummer eller skyddskod
 * (`docs/prd.md#constraints`).
 *
 * Förberedelse och tillämpning är åtskilda, så att loggposten hinner skrivas
 * innan dokumentet ändras (ADR Beslut 3).
 */

import type { GranskatDokument } from '../kontrakt.ts';
import { lasZipInnehall } from './zip.ts';

/** Den enda mutationsytan i hela storyn. */
export const AUTO_RATTNINGSBARA: readonly string[] = ['AD-KONTAKT-5', 'FIL-ZIP-1'];

export interface Rattning {
  regelId: string;
  falt: string;
  fore: unknown;
  efter: unknown;
}

export type Rattningsforsok =
  | { ok: true; rattning: Rattning; tillampa: () => void }
  | { ok: false; orsak: string };

/** Slår upp var en fil ligger. Utan källa går en zip inte att packa upp. */
export type Filkalla = (filnamn: string) => string | undefined;

export function arAutoRattningsbar(regelId: string): boolean {
  return AUTO_RATTNINGSBARA.includes(regelId);
}

function rattaKopiaTill(dokument: GranskatDokument): Rattningsforsok {
  const fore = dokument.arendedokument.kopia_till ?? '';
  if (String(fore).trim() === '') return { ok: false, orsak: 'fältet är redan rensat' };
  return {
    ok: true,
    rattning: { regelId: 'AD-KONTAKT-5', falt: 'kopia_till', fore, efter: '' },
    tillampa: () => {
      dokument.arendedokument.kopia_till = '';
    },
  };
}

function packaUppZip(dokument: GranskatDokument, filkalla: Filkalla | undefined): Rattningsforsok {
  const fil = dokument.fil;
  if (fil === undefined || fil === null) return { ok: false, orsak: 'dokumentet saknar filer' };

  const zipnamn = fil.filer.find((namn) => namn.toLowerCase().endsWith('.zip'));
  if (zipnamn === undefined) return { ok: false, orsak: 'ingen zip-fil är registrerad' };

  const sokvag = filkalla?.(zipnamn);
  if (sokvag === undefined) {
    return { ok: false, orsak: `zip-filen "${zipnamn}" kunde inte hittas på disk` };
  }

  const innehall = lasZipInnehall(sokvag);
  if (!innehall.ok) return { ok: false, orsak: innehall.orsak };

  const efter = [...fil.filer.filter((namn) => namn !== zipnamn), ...innehall.filer];
  return {
    ok: true,
    rattning: { regelId: 'FIL-ZIP-1', falt: 'fil.filer', fore: [...fil.filer], efter },
    tillampa: () => {
      fil.filer = efter;
      fil.ar_uppackad = true;
    },
  };
}

/**
 * Förbereder rättningen för ett regel-ID. Returnerar aldrig en tillämpning för
 * ett regel-ID utanför allowlisten, oavsett vad katalogen säger.
 */
export function forberedRattning(
  regelId: string,
  dokument: GranskatDokument,
  filkalla?: Filkalla,
): Rattningsforsok {
  if (!arAutoRattningsbar(regelId)) {
    return { ok: false, orsak: `regel ${regelId} är inte auto-rättningsbar` };
  }
  if (regelId === 'AD-KONTAKT-5') return rattaKopiaTill(dokument);
  return packaUppZip(dokument, filkalla);
}

/** Felmeddelandet FR5 föreskriver när en rättning inte kunde utföras. */
export function rattningsfel(falt: string): string {
  return `Automatisk rättning av ${falt} misslyckades`;
}
