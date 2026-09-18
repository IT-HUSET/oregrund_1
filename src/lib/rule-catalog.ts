import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG_PATH = path.join(MODULE_DIR, '..', '..', 'data', 'checklist_rules.json');

export type Niva = 'Ärende' | 'Dokument' | 'Fil';
export type Allvarlighetsgrad = 'Lagkrav' | 'Fel' | 'Anmärkning';

export interface ChecklistRule {
  id: string;
  niva: Niva;
  falt: string;
  regeltext: string;
  felvillkor: string;
  metod: string;
  allvarlighetsgrad: Allvarlighetsgrad;
  autoRattning: boolean;
}

export interface ChecklistCatalog {
  version: string;
  /** AI-fynd med konfidens under detta värde markeras osäkra (S05). Trimmas empiriskt mot S09:s testsvit. */
  aiKonfidenstroskel: number;
  rules: ChecklistRule[];
}

export class CatalogValidationError extends Error {
  readonly ruleId: string;
  readonly field: string;

  constructor(message: string, ruleId: string, field: string) {
    super(message);
    this.name = 'CatalogValidationError';
    this.ruleId = ruleId;
    this.field = field;
  }
}

const VALID_NIVA = new Set<Niva>(['Ärende', 'Dokument', 'Fil']);
const VALID_ALLVARLIGHETSGRAD = new Set<Allvarlighetsgrad>(['Lagkrav', 'Fel', 'Anmärkning']);
const VALID_METOD_BASTOKEN = new Set(['M+L', 'M', 'C', 'H']);
const SKYDDADE_FALT = new Set(['Datum', 'Diarienummer', 'Skyddskod']);

function isValidMetod(metod: string): boolean {
  return metod
    .split(' → ')
    .every((steg) => steg.split('/').every((token) => VALID_METOD_BASTOKEN.has(token)));
}

function validateRule(rule: ChecklistRule, seenIds: Set<string>): void {
  if (seenIds.has(rule.id)) {
    throw new CatalogValidationError(`Regel-id "${rule.id}" förekommer mer än en gång i katalogen`, rule.id, 'id');
  }
  seenIds.add(rule.id);

  if (!VALID_NIVA.has(rule.niva)) {
    throw new CatalogValidationError(`Regel "${rule.id}" har ogiltig nivå "${rule.niva}"`, rule.id, 'niva');
  }

  if (!isValidMetod(rule.metod)) {
    throw new CatalogValidationError(`Regel "${rule.id}" har ogiltig metod "${rule.metod}"`, rule.id, 'metod');
  }

  if (!VALID_ALLVARLIGHETSGRAD.has(rule.allvarlighetsgrad)) {
    throw new CatalogValidationError(
      `Regel "${rule.id}" har ogiltig allvarlighetsgrad "${rule.allvarlighetsgrad}"`,
      rule.id,
      'allvarlighetsgrad',
    );
  }

  if (rule.autoRattning && rule.metod !== 'M') {
    throw new CatalogValidationError(
      `Regel "${rule.id}" har auto-rättning men metod "${rule.metod}" är inte exakt "M"`,
      rule.id,
      'autoRattning',
    );
  }

  if (rule.autoRattning && SKYDDADE_FALT.has(rule.falt)) {
    throw new CatalogValidationError(
      `Regel "${rule.id}" har auto-rättning på skyddat fält "${rule.falt}"`,
      rule.id,
      'autoRattning',
    );
  }
}

function validateCatalog(catalog: ChecklistCatalog): void {
  const troskel = catalog.aiKonfidenstroskel;
  if (typeof troskel !== 'number' || !(troskel >= 0 && troskel <= 1)) {
    throw new CatalogValidationError(
      `aiKonfidenstroskel måste vara ett tal mellan 0 och 1, fick "${String(troskel)}"`,
      '',
      'aiKonfidenstroskel',
    );
  }
  const seenIds = new Set<string>();
  for (const rule of catalog.rules) {
    validateRule(rule, seenIds);
  }
}

export function loadChecklistCatalog(filePath: string = DEFAULT_CATALOG_PATH): ChecklistCatalog {
  const raw = readFileSync(filePath, 'utf-8');
  const catalog = JSON.parse(raw) as ChecklistCatalog;
  validateCatalog(catalog);
  return catalog;
}
