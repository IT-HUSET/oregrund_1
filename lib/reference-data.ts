import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_KONTAKTREGISTER_PATH = path.join(MODULE_DIR, "..", "data", "kontaktregister.json");
const DEFAULT_KLASSIFICERINGSSTRUKTUR_PATH = path.join(
  MODULE_DIR,
  "..",
  "data",
  "klassificeringsstruktur.json",
);

export type OrganisationTyp = "myndighet" | "kommun" | "foretag" | "organisation" | "enskild_tjansteperson";

export interface Organisation {
  namn: string;
  typ: OrganisationTyp;
  epost?: string;
}

export interface Kontaktregister {
  organisationer: Organisation[];
}

export interface Process {
  id: string;
  namn: string;
}

export interface Handlingstyp {
  id: string;
  namn: string;
  processer: string[];
}

export interface Klassificeringsstruktur {
  processer: Process[];
  handlingstyper: Handlingstyp[];
}

export function loadKontaktregister(filePath: string = DEFAULT_KONTAKTREGISTER_PATH): Kontaktregister {
  return JSON.parse(readFileSync(filePath, "utf-8")) as Kontaktregister;
}

export function loadKlassificeringsstruktur(
  filePath: string = DEFAULT_KLASSIFICERINGSSTRUKTUR_PATH,
): Klassificeringsstruktur {
  return JSON.parse(readFileSync(filePath, "utf-8")) as Klassificeringsstruktur;
}

/** Fails closed: an unmatched namn/e-post returns undefined, never a partial or default match. */
export function resolveKontakt(register: Kontaktregister, namnEllerEpost: string): Organisation | undefined {
  const varde = namnEllerEpost.trim();
  return register.organisationer.find((org) => org.namn === varde || org.epost === varde);
}

const PROCESS_ID_PATTERN = /^[\d.]+/;
const HANDLINGSTYP_ID_PATTERN = /^[\d.]+-\d+/;

function extractLeadingId(varde: string, pattern: RegExp): string | undefined {
  return pattern.exec(varde.trim())?.[0];
}

/** Fails closed: an unmatched process returns undefined, never a partial or default match. */
export function resolveProcess(struktur: Klassificeringsstruktur, processVarde: string): Process | undefined {
  const id = extractLeadingId(processVarde, PROCESS_ID_PATTERN);
  if (id === undefined) return undefined;
  return struktur.processer.find((process) => process.id === id);
}

/** Fails closed: an unmatched handlingstyp, or one not allowed under processId, returns undefined. */
export function resolveHandlingstyp(
  struktur: Klassificeringsstruktur,
  handlingstypVarde: string,
  processId: string,
): Handlingstyp | undefined {
  const id = extractLeadingId(handlingstypVarde, HANDLINGSTYP_ID_PATTERN);
  if (id === undefined) return undefined;
  const handlingstyp = struktur.handlingstyper.find((h) => h.id === id);
  if (handlingstyp === undefined || !handlingstyp.processer.includes(processId)) return undefined;
  return handlingstyp;
}
