/**
 * Kontrolloggens händelseschema (FR7, `docs/prd.md#fr7-kontrollogg`).
 *
 * Shared decision "Kontrollogg event schema" i `docs/plan.json`: S06 skriver poster,
 * S07/S08 visar dem, S11 och S12 aggregerar dem. Ändringar här är därför ett
 * kontraktsbyte, inte en lokal refaktorering.
 *
 * Dokument-id är en ogenomskinlig sträng. S03 äger dokumentmodellen, och loggen
 * får inte binda sig till den.
 */

/** Utfall per regel, enligt shared decision "RuleOutcome/Finding data contract". */
export type Regelutfall = 'uppfylld' | 'fynd' | 'ej tillämplig' | 'ej genomförd';

/**
 * Metodvärdet från regelkatalogen: ett grundvärde (M, M+L, C, H) eller en
 * kombination av dem (M/C, M+L/C, C/H, M → H) enligt FR1. Vokabulären ägs och
 * valideras av regelkatalogen (S01), inte av loggen.
 */
export type Regelmetod = string;

export interface RegelutfallPost {
  regelId: string;
  utfall: Regelutfall;
  metod: Regelmetod;
}

/** Fynd med den förklaringsdata FR6 kräver. `konfidens` finns bara för AI-fynd. */
export interface FyndPost {
  regelId: string;
  allvarlighetsgrad: string;
  metod: Regelmetod;
  evidens: string;
  forklaring: string;
  rattningsforslag?: string;
  konfidens?: number;
  osaker?: boolean;
}

/** Före/efter för en ändring. `automatisk` skiljer auto-rättning (FR5) från manuell. */
export interface AndringPost {
  falt: string;
  fore: unknown;
  efter: unknown;
  automatisk: boolean;
  regelId?: string;
}

export interface StatusbytePost {
  typ: 'granskningsstatus' | 'dokumentstatus';
  /** null när dokumentet inte hade någon status sedan tidigare. */
  fran: string | null;
  till: string;
}

/** Mänskligt beslut med roll, tid och motivering (FR7, FR8). */
export interface ManskligtBeslutPost {
  roll: string;
  tidpunkt: string;
  beslut: string;
  motivering: string;
  regelId?: string;
}

/** En rad i `kontrollogg.jsonl`. Fältlistan följer FR7. */
export interface KontrolloggPost {
  /** ISO 8601-tidpunkt för händelsen. */
  tidpunkt: string;
  dokumentId: string;
  regelkatalogVersion: string;
  /** null när ingen AI-bedömning ingick i händelsen. */
  aiModell: string | null;
  regelutfall: RegelutfallPost[];
  fynd: FyndPost[];
  andringar: AndringPost[];
  statusbyten: StatusbytePost[];
  manskligaBeslut: ManskligtBeslutPost[];
}
