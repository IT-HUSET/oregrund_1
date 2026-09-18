/**
 * Vymodell för handläggarvyn (S08): Åtgärd-krävs-kön och de redigerbara fälten.
 * Ren logik utan React, så att den kan testas mot testcases.json.
 */

import type { Dokumentpost } from './dokumentlager.ts';
import type { GranskatDokument } from './granskning/kontrakt.ts';
import { filtreraKo } from './registrator-vy.ts';
import type { ChecklistRule } from './rule-catalog.ts';

export const ATGARD_KRAVS = 'Åtgärd krävs' as const;

/** Handläggarkön visar bara det som kräver åtgärd (FR9). */
export function handlaggarko(poster: Dokumentpost[]): Dokumentpost[] {
  return filtreraKo(poster, ATGARD_KRAVS);
}

export interface RedigerbartFalt {
  sokvag: string;
  etikett: string;
  varde: string;
  lasbart: boolean;
}

export interface RedigerbaraFlikar {
  detaljer: RedigerbartFalt[];
  kontakter: RedigerbartFalt[];
}

const KONTAKTNYCKLAR = new Set(['kontakt', 'avsandare', 'mottagare', 'kopia_till', 'ansvarig']);

/** Diarienummer är FR9-låst. Dokumentstatus Registrerat får bara sättas av omgången. */
const LASBART = new Set(['arende.diarienummer', 'arendedokument.status']);

function etikett(nyckel: string): string {
  const text = nyckel.replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function visa(varde: unknown): string {
  if (varde === null || varde === undefined) return '';
  if (typeof varde === 'boolean') return varde ? 'Ja' : 'Nej';
  if (Array.isArray(varde)) return varde.join(', ');
  return String(varde);
}

function faltI(
  objekt: object,
  objektnamn: 'arende' | 'arendedokument',
  prefix: string,
): RedigerbartFalt[] {
  return Object.keys(objekt).map((nyckel) => {
    const sokvag = `${objektnamn}.${nyckel}`;
    return {
      sokvag,
      etikett: `${prefix}${etikett(nyckel)}`,
      varde: visa((objekt as Record<string, unknown>)[nyckel]),
      lasbart: LASBART.has(sokvag),
    };
  });
}

/**
 * Fälten handläggaren ser som formulär. Kontaktfält under Kontakter, resten
 * under Detaljer. Filer är read-only (samma flik som i registratorvyn).
 */
export function redigerbaraFalt(dokument: GranskatDokument): RedigerbaraFlikar {
  const arendeFalt = faltI(dokument.arende, 'arende', 'Ärende: ');
  const dokumentFalt = faltI(dokument.arendedokument, 'arendedokument', 'Dokument: ');
  const arKontakt = (f: RedigerbartFalt) => KONTAKTNYCKLAR.has(f.sokvag.split('.')[1] ?? '');

  const detaljer = [
    ...arendeFalt.filter((f) => !arKontakt(f)),
    ...dokumentFalt.filter((f) => !arKontakt(f)),
  ];
  if (dokument.dokumenttext !== undefined) {
    detaljer.push({
      sokvag: 'dokumenttext',
      etikett: 'Dokumenttext',
      varde: visa(dokument.dokumenttext),
      lasbart: false,
    });
  }

  return {
    detaljer,
    kontakter: [...arendeFalt.filter(arKontakt), ...dokumentFalt.filter(arKontakt)],
  };
}

/**
 * Katalogens (niva, falt) → sökväg i dokumentmodellen. Fil-regler har ingen
 * textuell fältyta, så de saknas här: ett sådant förslag kan inte tillämpas
 * som fältvärde.
 */
const FALT_TILL_SOKVAG: Readonly<Record<string, string>> = {
  'Ärende:Titel': 'arende.titel',
  'Ärende:Process': 'arende.process',
  'Ärende:Motpart': 'arende.kontakt',
  'Dokument:Titel': 'arendedokument.titel',
  'Dokument:Avsändare/Mottagare': 'arendedokument.avsandare',
  'Dokument:Kopia till': 'arendedokument.kopia_till',
  'Dokument:Datum': 'arendedokument.dokumentdatum',
  'Dokument:Handlingstyp': 'arendedokument.handlingstyp',
  'Dokument:Dokumentkategori': 'arendedokument.dokumentkategori',
  'Dokument:Skyddskod': 'arendedokument.skyddskod',
  'Dokument:Godkännandeflöde': 'arendedokument.godkannandeflode_status',
};

export function sokvagForRegel(regel: ChecklistRule): string | undefined {
  return FALT_TILL_SOKVAG[`${regel.niva}:${regel.falt}`];
}

export function kanTillampaForslag(regelId: string, katalog: { rules: ChecklistRule[] }): boolean {
  const regel = katalog.rules.find((r) => r.id === regelId);
  return regel !== undefined && sokvagForRegel(regel) !== undefined;
}
