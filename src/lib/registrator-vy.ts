/**
 * Vymodell för registratorvyn (S07): kön och fältindelningen i detaljvyn.
 * Ren logik utan React, så att den kan testas mot testcases.json.
 */

import type { Dokumentpost } from './dokumentlager.ts';
import type { GranskatDokument } from './granskning/kontrakt.ts';
import type { Granskningsstatus } from './granskning/omgang/index.ts';

export const GRANSKNINGSSTATUSAR: readonly Granskningsstatus[] = [
  'Mänsklig bedömning',
  'Åtgärd krävs',
  'Autokorrigerad',
  'Godkänd',
];

/** Registratorkön visar det som kräver mänsklig bedömning tills registratorn väljer annat (FR8). */
export const STANDARDSTATUS: Granskningsstatus = 'Mänsklig bedömning';

export function arGranskningsstatus(varde: unknown): varde is Granskningsstatus {
  return GRANSKNINGSSTATUSAR.some((status) => status === varde);
}

export function filtreraKo(poster: Dokumentpost[], status: Granskningsstatus): Dokumentpost[] {
  return poster.filter((post) => post.granskningsstatus === status);
}

export type Faltrad = readonly [etikett: string, varde: string];

export interface Metadatafliker {
  detaljer: Faltrad[];
  kontakter: Faltrad[];
  filer: Faltrad[];
}

/** Fält som hör till Kontakter-fliken. Övriga ärende- och dokumentfält hamnar under Detaljer. */
const KONTAKTFALT = {
  arende: ['kontakt'],
  arendedokument: ['avsandare', 'mottagare', 'kopia_till', 'ansvarig'],
} as const;

function etikett(nyckel: string): string {
  const text = nyckel.replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function visa(varde: unknown): string {
  if (varde === null || varde === undefined || varde === '') return '–';
  if (typeof varde === 'boolean') return varde ? 'Ja' : 'Nej';
  if (Array.isArray(varde)) return varde.length === 0 ? '–' : varde.join(', ');
  return String(varde);
}

function rader(objekt: object, nycklar: readonly string[], prefix: string): Faltrad[] {
  const post = objekt as Record<string, unknown>;
  return nycklar.map((nyckel) => [`${prefix}${etikett(nyckel)}`, visa(post[nyckel])] as const);
}

/**
 * Delar in dokumentets fält i flikarna. Varje fält hamnar i exakt en flik:
 * kontaktfälten under Kontakter, filfälten under Filer och resten under Detaljer.
 */
export function delaMetadata(dokument: GranskatDokument): Metadatafliker {
  const arendeNycklar = Object.keys(dokument.arende);
  const dokumentNycklar = Object.keys(dokument.arendedokument);

  const kontaktArende = arendeNycklar.filter((n) => (KONTAKTFALT.arende as readonly string[]).includes(n));
  const kontaktDokument = dokumentNycklar.filter((n) =>
    (KONTAKTFALT.arendedokument as readonly string[]).includes(n),
  );
  const detaljer: Faltrad[] = [
    ...rader(dokument.arende, arendeNycklar.filter((n) => !kontaktArende.includes(n)), 'Ärende: '),
    ...rader(
      dokument.arendedokument,
      dokumentNycklar.filter((n) => !kontaktDokument.includes(n)),
      'Dokument: ',
    ),
  ];
  if (dokument.dokumenttext !== undefined) detaljer.push(['Dokumenttext', visa(dokument.dokumenttext)]);

  const fil = dokument.fil;
  return {
    detaljer,
    kontakter: [
      ...rader(dokument.arende, kontaktArende, 'Ärende: '),
      ...rader(dokument.arendedokument, kontaktDokument, 'Dokument: '),
    ],
    filer: fil === undefined || fil === null ? [] : rader(fil, Object.keys(fil), ''),
  };
}
