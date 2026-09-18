/**
 * Minimal zip-läsare för auto-rättningen av FIL-ZIP-1 (S06 TI03).
 *
 * Läser filnamnen ur zip-filens centrala katalog. Prototypens dokumentmodell
 * håller bara filnamn, så uppackningen behöver inte skriva ut innehållet.
 * En lösenordsskyddad zip eller en zip i en zip packas inte upp
 * (`docs/prd.md#edge-cases`) – då misslyckas rättningen och degraderas (TI04).
 */

import { readFileSync } from 'node:fs';

const EOCD_SIGNATUR = 0x06054b50;
const CENTRAL_SIGNATUR = 0x02014b50;
const EOCD_MIN_STORLEK = 22;
const KRYPTERAD_FLAGGA = 0x1;

export type ZipInnehall =
  | { ok: true; filer: string[] }
  | { ok: false; orsak: string };

function hittaEocd(buffert: Buffer): number | undefined {
  for (let i = buffert.length - EOCD_MIN_STORLEK; i >= 0; i--) {
    if (buffert.readUInt32LE(i) === EOCD_SIGNATUR) return i;
  }
  return undefined;
}

/** Filnamnen i zip-filen, eller orsaken till att den inte kan packas upp. */
export function lasZipInnehall(sokvag: string): ZipInnehall {
  let buffert: Buffer;
  try {
    buffert = readFileSync(sokvag);
  } catch (fel) {
    return { ok: false, orsak: `zip-filen kunde inte läsas: ${(fel as Error).message}` };
  }

  const eocd = hittaEocd(buffert);
  if (eocd === undefined) return { ok: false, orsak: 'filen är inte en giltig zip-fil' };

  const antal = buffert.readUInt16LE(eocd + 10);
  let position = buffert.readUInt32LE(eocd + 16);
  const filer: string[] = [];

  for (let i = 0; i < antal; i++) {
    if (position + 46 > buffert.length || buffert.readUInt32LE(position) !== CENTRAL_SIGNATUR) {
      return { ok: false, orsak: 'zip-filens centrala katalog är skadad' };
    }
    const flaggor = buffert.readUInt16LE(position + 8);
    if ((flaggor & KRYPTERAD_FLAGGA) !== 0) {
      return { ok: false, orsak: 'zip-filen är lösenordsskyddad' };
    }
    const namnlangd = buffert.readUInt16LE(position + 28);
    const extralangd = buffert.readUInt16LE(position + 30);
    const kommentarlangd = buffert.readUInt16LE(position + 32);
    const namn = buffert.toString('utf8', position + 46, position + 46 + namnlangd);
    if (namn.toLowerCase().endsWith('.zip')) {
      return { ok: false, orsak: 'zip-filen innehåller en zip-fil' };
    }
    if (!namn.endsWith('/')) filer.push(namn);
    position += 46 + namnlangd + extralangd + kommentarlangd;
  }

  return { ok: true, filer };
}
