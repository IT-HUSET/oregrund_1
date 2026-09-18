import type { KontrolloggPost } from './types.ts';

/** Kastas när en post inte uppfyller schemat, före och i stället för en skrivning. */
export class KontrolloggPostfel extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KontrolloggPostfel';
  }
}

const OBLIGATORISKA_STRANGFALT = ['tidpunkt', 'dokumentId', 'regelkatalogVersion'] as const;
const OBLIGATORISKA_LISTFALT = [
  'regelutfall',
  'fynd',
  'andringar',
  'statusbyten',
  'manskligaBeslut',
] as const;

/**
 * Validerar posten mot FR7:s fältlista. Anropas före varje skrivning så att en
 * ofullständig post aldrig når filen (`docs/adr.md#beslut-3-oföränderlig-kontrollogg-append-only`).
 */
export function validateraPost(post: unknown): asserts post is KontrolloggPost {
  if (typeof post !== 'object' || post === null || Array.isArray(post)) {
    throw new KontrolloggPostfel('Loggposten måste vara ett objekt.');
  }
  const p = post as Record<string, unknown>;

  for (const falt of OBLIGATORISKA_STRANGFALT) {
    if (typeof p[falt] !== 'string' || p[falt] === '') {
      throw new KontrolloggPostfel(`Fältet "${falt}" måste vara en icke-tom sträng.`);
    }
  }
  if (Number.isNaN(Date.parse(p['tidpunkt'] as string))) {
    throw new KontrolloggPostfel('Fältet "tidpunkt" måste vara en ISO 8601-tidpunkt.');
  }
  if (typeof p['aiModell'] !== 'string' && p['aiModell'] !== null) {
    throw new KontrolloggPostfel('Fältet "aiModell" måste vara en sträng eller null.');
  }
  for (const falt of OBLIGATORISKA_LISTFALT) {
    if (!Array.isArray(p[falt])) {
      throw new KontrolloggPostfel(`Fältet "${falt}" måste vara en lista.`);
    }
  }
}

/** Serialiserar posten till en JSONL-rad, inklusive radbrytning. */
export function serialiseraPost(post: KontrolloggPost): string {
  validateraPost(post);
  const rad = JSON.stringify(post);
  if (typeof rad !== 'string' || rad.includes('\n')) {
    throw new KontrolloggPostfel('Loggposten kunde inte serialiseras till en JSONL-rad.');
  }
  return `${rad}\n`;
}

/** Tolkar en JSONL-rad. Kastar hellre än att tyst hoppa över en skadad rad. */
export function tolkaPost(rad: string): KontrolloggPost {
  let tolkad: unknown;
  try {
    tolkad = JSON.parse(rad);
  } catch (orsak) {
    throw new KontrolloggPostfel(`Loggraden är inte giltig JSON: ${(orsak as Error).message}`);
  }
  validateraPost(tolkad);
  return tolkad;
}
