/**
 * Deterministiska regelhandlers (S04).
 *
 * En handler per regel-ID, var och en en ren funktion av dokumentet och
 * referensdatan. Ingen handler skriver till dokumentet, och ingen läser
 * `dokumenttext` för att göra en innehållsbedömning – de kombinerade
 * reglernas C-del ägs av S05 (`docs/s04-deterministisk-granskningsmotor.md`).
 */

import {
  resolveHandlingstyp,
  resolveKontakt,
  resolveProcess,
  type Kontaktregister,
  type Klassificeringsstruktur,
} from '../reference-data.ts';
import type { GranskatDokument, Utfall } from './kontrakt.ts';

export interface Referensdata {
  kontaktregister: Kontaktregister;
  klassificeringsstruktur: Klassificeringsstruktur;
}

export interface HandlerResultat {
  utfall: Utfall;
  /** Krävs när utfallet är "fynd" (FR6). */
  evidens?: string;
  forklaring?: string;
  rattningsforslag?: string;
}

export type Regelhandler = (dokument: GranskatDokument, referensdata: Referensdata) => HandlerResultat;

const UPPFYLLD: HandlerResultat = { utfall: 'uppfylld' };
const EJ_TILLAMPLIG: HandlerResultat = { utfall: 'ej tillämplig' };

const EPOST_MONSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GILTIGA_KATEGORIER = new Set(['Inkommande', 'Utgående', 'Internt']);

function text(varde: unknown): string {
  return typeof varde === 'string' ? varde.trim() : '';
}

function harVarde(varde: unknown): boolean {
  return text(varde) !== '';
}

function kontakterPaDokument(dokument: GranskatDokument): { falt: string; varde: string }[] {
  const ad = dokument.arendedokument;
  return [
    { falt: 'Avsändare', varde: text(ad.avsandare) },
    { falt: 'Mottagare', varde: text(ad.mottagare) },
  ].filter((k) => k.varde !== '');
}

/* ------------------------------------------------------------------ Titlar */

/**
 * Accepterade förkortningar: etablerade organisations- och fackförkortningar
 * som inte ska skrivas ut. Listan är avsiktligt kort – den svåra bedömningen
 * av om en förkortning är begriplig hör till S05.
 */
const ACCEPTERADE_FORKORTNINGAR = new Set([
  'IT', 'EU', 'HR', 'AB', 'SCB', 'ESV', 'OSL', 'TF', 'PDF', 'VD', 'GDPR',
]);

const VOKALER = /[aeiouyåäö]/i;

function forkortningarITitel(titel: string): string[] {
  return titel
    .split(/[\s,;:()]+/)
    .flatMap((ord) => ord.split('-'))
    .map((ord) => ord.replace(/[.!?]+$/, ''))
    .filter((ord) => {
      if (ord.length < 2 || /\d/.test(ord)) return false;
      if (ACCEPTERADE_FORKORTNINGAR.has(ord.toUpperCase())) return false;
      const versalt = ord === ord.toUpperCase();
      const utanVokal = !VOKALER.test(ord);
      return (versalt && ord.length <= 5) || utanVokal;
    });
}

function granskaTitelForkortningar(titel: string, niva: string): HandlerResultat {
  const funna = forkortningarITitel(titel);
  if (funna.length === 0) return UPPFYLLD;
  return {
    utfall: 'fynd',
    evidens: titel,
    forklaring: `${niva}s titel innehåller förkortningar som inte är utskrivna: ${funna.join(', ')}.`,
    rattningsforslag: 'Skriv ut förkortningarna så att titeln går att förstå utan förkunskap.',
  };
}

/* ------------------------------------------------------------------ Kontakter */

function granskaKontaktIRegister(
  kontakter: { falt: string; varde: string }[],
  referensdata: Referensdata,
): HandlerResultat {
  const saknade = kontakter.filter(
    (k) => resolveKontakt(referensdata.kontaktregister, k.varde) === undefined,
  );
  if (saknade.length === 0) return UPPFYLLD;
  return {
    utfall: 'fynd',
    evidens: saknade.map((k) => `${k.falt}: ${k.varde}`).join('; '),
    forklaring: `Kontakten finns inte i kontaktregistret: ${saknade.map((k) => k.varde).join(', ')}.`,
    // PRD:n föreskriver just den här formuleringen (TC-09). Ingen kontakt hittas på.
    rattningsforslag: 'beställ ny kontakt av registraturen',
  };
}

function granskaKontaktArEpost(kontakter: { falt: string; varde: string }[]): HandlerResultat {
  const epostkontakter = kontakter.filter((k) => EPOST_MONSTER.test(k.varde));
  if (epostkontakter.length === 0) return UPPFYLLD;
  return {
    utfall: 'fynd',
    evidens: epostkontakter.map((k) => `${k.falt}: ${k.varde}`).join('; '),
    forklaring: 'Kontakten är angiven som en e-postadress i stället för en registrerad kontakt.',
    rattningsforslag: 'Ersätt e-postadressen med den registrerade kontakten i kontaktregistret.',
  };
}

function granskaKontaktArTjansteperson(
  kontakter: { falt: string; varde: string }[],
  referensdata: Referensdata,
): HandlerResultat {
  const tjanstepersoner = kontakter.filter(
    (k) => resolveKontakt(referensdata.kontaktregister, k.varde)?.typ === 'enskild_tjansteperson',
  );
  if (tjanstepersoner.length === 0) return UPPFYLLD;
  return {
    utfall: 'fynd',
    evidens: tjanstepersoner.map((k) => `${k.falt}: ${k.varde}`).join('; '),
    forklaring:
      'Kontakten är en enskild tjänsteperson i stället för den organisation personen företräder.',
    rattningsforslag: 'Ange organisationen som kontakt, med tjänstepersonen som eventuell referens.',
  };
}

/* ------------------------------------------------------------------ Datum */

const MANADER: Record<string, number> = {
  januari: 1, februari: 2, mars: 3, april: 4, maj: 5, juni: 6,
  juli: 7, augusti: 8, september: 9, oktober: 10, november: 11, december: 12,
};

/**
 * Ord som pekar ut ett datum som handlingens eget. Utan ett sådant ord jämförs
 * datumet inte: "avtal tecknades 2026-06-01" säger inget om registreringen.
 */
const DATUMLEDTRAD = /(dater(?:at|ad|ades)|poststämpl\w*|inkom\w*|expedier\w*|undertecknat|undertecknad)[^.]{0,40}$/i;

const ISO_DATUM = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const SVENSKT_DATUM = new RegExp(`\\b(\\d{1,2})\\s+(${Object.keys(MANADER).join('|')})\\s+(\\d{4})\\b`, 'gi');

function iso(ar: number, manad: number, dag: number): string {
  return `${ar}-${String(manad).padStart(2, '0')}-${String(dag).padStart(2, '0')}`;
}

/** Datum i texten som ett ledtrådsord pekar ut som handlingens eget. */
function ledtradsdatum(dokumenttext: string): string[] {
  const funna: string[] = [];
  const laggTill = (index: number, datum: string): void => {
    if (DATUMLEDTRAD.test(dokumenttext.slice(0, index))) funna.push(datum);
  };

  for (const traff of dokumenttext.matchAll(ISO_DATUM)) {
    const [, ar, manad, dag] = traff;
    if (ar !== undefined && manad !== undefined && dag !== undefined) {
      laggTill(traff.index ?? 0, `${ar}-${manad}-${dag}`);
    }
  }
  for (const traff of dokumenttext.matchAll(SVENSKT_DATUM)) {
    const [, dag, manadsnamn, ar] = traff;
    const manad = manadsnamn === undefined ? undefined : MANADER[manadsnamn.toLowerCase()];
    if (dag !== undefined && ar !== undefined && manad !== undefined) {
      laggTill(traff.index ?? 0, iso(Number(ar), manad, Number(dag)));
    }
  }
  return funna;
}

/* ------------------------------------------------------------------ Filer */

function filer(dokument: GranskatDokument): string[] {
  return dokument.fil?.filer ?? [];
}

/** De fem filreglerna som kräver en fil att granska. FIL-ANTAL-1 är undantaget (FR3). */
function kraverFil(dokument: GranskatDokument, granska: () => HandlerResultat): HandlerResultat {
  return filer(dokument).length === 0 ? EJ_TILLAMPLIG : granska();
}

/* ------------------------------------------------------------------ Handlers */

export const REGELHANDLERS: Record<string, Regelhandler> = {
  'AR-TITEL-2': (dokument) => granskaTitelForkortningar(text(dokument.arende.titel), 'Ärendet'),

  'AR-PROCESS-1': (dokument, referensdata) => {
    const process = text(dokument.arende.process);
    if (!harVarde(process)) {
      return {
        utfall: 'fynd',
        evidens: 'Process saknas',
        forklaring: 'Ärendet saknar process, och kan därför inte placeras i klassificeringsstrukturen.',
      };
    }
    if (resolveProcess(referensdata.klassificeringsstruktur, process) !== undefined) return UPPFYLLD;
    return {
      utfall: 'fynd',
      evidens: process,
      forklaring: `Processen "${process}" finns inte i klassificeringsstrukturen.`,
      rattningsforslag: 'Välj en process som finns i klassificeringsstrukturen.',
    };
  },

  'AR-KONTAKT-2': (dokument, referensdata) =>
    harVarde(dokument.arende.kontakt)
      ? granskaKontaktIRegister([{ falt: 'Motpart', varde: text(dokument.arende.kontakt) }], referensdata)
      : EJ_TILLAMPLIG,

  'AR-KONTAKT-3': (dokument) =>
    harVarde(dokument.arende.kontakt)
      ? granskaKontaktArEpost([{ falt: 'Motpart', varde: text(dokument.arende.kontakt) }])
      : EJ_TILLAMPLIG,

  'AR-KONTAKT-4': (dokument, referensdata) =>
    harVarde(dokument.arende.kontakt)
      ? granskaKontaktArTjansteperson(
          [{ falt: 'Motpart', varde: text(dokument.arende.kontakt) }],
          referensdata,
        )
      : EJ_TILLAMPLIG,

  'AD-TITEL-2': (dokument) =>
    granskaTitelForkortningar(text(dokument.arendedokument.titel), 'Ärendedokumentet'),

  'AD-KONTAKT-1': (dokument) => {
    const ad = dokument.arendedokument;
    const kategori = text(ad.dokumentkategori);
    if (kategori === 'Inkommande' && !harVarde(ad.avsandare)) {
      return {
        utfall: 'fynd',
        evidens: 'Avsändare saknas på inkommande handling',
        forklaring: 'En inkommande handling måste ha en avsändare (OSL 5 kap. 2 §).',
      };
    }
    if (kategori === 'Utgående' && !harVarde(ad.mottagare)) {
      return {
        utfall: 'fynd',
        evidens: 'Mottagare saknas på utgående handling',
        forklaring: 'En utgående handling måste ha en mottagare (OSL 5 kap. 2 §).',
      };
    }
    if (kategori === 'Internt') return EJ_TILLAMPLIG;
    return UPPFYLLD;
  },

  'AD-KONTAKT-2': (dokument, referensdata) => {
    const kontakter = kontakterPaDokument(dokument);
    return kontakter.length === 0 ? EJ_TILLAMPLIG : granskaKontaktIRegister(kontakter, referensdata);
  },

  'AD-KONTAKT-3': (dokument) => {
    const kontakter = kontakterPaDokument(dokument);
    return kontakter.length === 0 ? EJ_TILLAMPLIG : granskaKontaktArEpost(kontakter);
  },

  'AD-KONTAKT-4': (dokument, referensdata) => {
    const kontakter = kontakterPaDokument(dokument);
    return kontakter.length === 0
      ? EJ_TILLAMPLIG
      : granskaKontaktArTjansteperson(kontakter, referensdata);
  },

  'AD-KONTAKT-5': (dokument) => {
    const kopiaTill = text(dokument.arendedokument.kopia_till);
    if (kopiaTill === '') return UPPFYLLD;
    // Rättningen utförs av S06 (FR5). Motorn rapporterar bara.
    return {
      utfall: 'fynd',
      evidens: kopiaTill,
      forklaring: `Fältet "Kopia till" är inte rensat (innehåller "${kopiaTill}").`,
      rattningsforslag: 'Rensa fältet "Kopia till".',
    };
  },

  'AD-DATUM-1': (dokument) => {
    const ad = dokument.arendedokument;
    const registrerade = [text(ad.ankomstdatum), text(ad.dokumentdatum)].filter((d) => d !== '');
    const textdatum = ledtradsdatum(dokument.dokumenttext ?? '');
    if (textdatum.length === 0 || registrerade.length === 0) return UPPFYLLD;

    const avvikande = textdatum.filter((datum) => !registrerade.includes(datum));
    if (avvikande.length === 0) return UPPFYLLD;
    return {
      utfall: 'fynd',
      evidens: `Registrerat: ankomstdatum ${text(ad.ankomstdatum) || '-'}, dokumentdatum ${
        text(ad.dokumentdatum) || '-'
      }. Handlingens eget datum: ${avvikande.join(', ')}`,
      forklaring:
        'Det registrerade datumet stämmer inte med det datum handlingen själv anger för när den inkom, expedierades eller beslutades.',
      rattningsforslag: `Rätta datumet till ${avvikande[0]} om det är handlingens rätta datum.`,
    };
  },

  'AD-HANDLINGSTYP-1': (dokument, referensdata) => {
    const ad = dokument.arendedokument;
    const process = resolveProcess(referensdata.klassificeringsstruktur, text(dokument.arende.process));
    if (process === undefined) {
      // Utan en giltig process går tillhörigheten inte att pröva. AR-PROCESS-1 bär fyndet.
      return { utfall: 'ej genomförd' };
    }
    const handlingstyp = text(ad.handlingstyp);
    if (
      resolveHandlingstyp(referensdata.klassificeringsstruktur, handlingstyp, process.id) !== undefined
    ) {
      return UPPFYLLD;
    }
    return {
      utfall: 'fynd',
      evidens: `Handlingstyp: ${handlingstyp || '-'}, process: ${process.id} - ${process.namn}`,
      forklaring: `Handlingstypen hör inte till processen "${process.id} - ${process.namn}" i klassificeringsstrukturen.`,
      rattningsforslag: 'Välj en handlingstyp som är tillåten under den valda processen.',
    };
  },

  'AD-KATEGORI-1': (dokument) => {
    const kategori = text(dokument.arendedokument.dokumentkategori);
    if (!GILTIGA_KATEGORIER.has(kategori)) {
      return {
        utfall: 'fynd',
        evidens: `Dokumentkategori: ${kategori || '-'}`,
        forklaring: `Dokumentkategorin måste vara exakt ett av värdena ${[...GILTIGA_KATEGORIER].join(', ')}.`,
        rattningsforslag: 'Sätt en enda riktning på dokumentkortet.',
      };
    }
    return UPPFYLLD;
  },

  'AD-SEKRETESS-1': (dokument) => {
    const arendestatus = text(dokument.arende.status);
    const skyddskod = text(dokument.arendedokument.skyddskod);
    if (arendestatus !== 'Avslutat' || !/sekretess/i.test(skyddskod)) return UPPFYLLD;
    // Skyddskoden ändras aldrig av automatiken. Bedömningen är en människas.
    return {
      utfall: 'fynd',
      evidens: `Ärendestatus: ${arendestatus}, skyddskod: ${skyddskod}`,
      forklaring:
        'Sekretessmarkeringen finns kvar på ett avslutat ärende. Om sekretessen fortfarande gäller är det en juridisk bedömning som måste göras av en människa.',
    };
  },

  'AD-GODKANNANDE-1': (dokument) => {
    // Bara det explicita värdet "Saknas" är ett fynd. Ett utelämnat fält är inte det (FR2).
    const status = text(dokument.arendedokument.godkannandeflode_status);
    if (status !== 'Saknas') return UPPFYLLD;
    return {
      utfall: 'fynd',
      evidens: 'Godkännandeflöde: Saknas',
      forklaring: 'Handlingen saknar godkännandeflöde eller e-signering.',
      rattningsforslag: 'Komplettera med godkännandeflöde eller elektronisk signering.',
    };
  },

  'FIL-ANTAL-1': (dokument) => {
    // Utvärderas alltid, även utan filer (FR3).
    const antalBilagor = dokument.arendedokument.antal_bilagor ?? 0;
    const registrerade = filer(dokument).length;
    if (antalBilagor <= registrerade) return UPPFYLLD;
    return {
      utfall: 'fynd',
      evidens: `Angivet antal bilagor: ${antalBilagor}, registrerade filer: ${registrerade}`,
      forklaring: `Antalet registrerade filer (${registrerade}) stämmer inte med angivet antal bilagor (${antalBilagor}).`,
      rattningsforslag: 'Komplettera med de filer som saknas, eller rätta antalet bilagor.',
    };
  },

  'FIL-MISSIV-1': (dokument) =>
    kraverFil(dokument, () => {
      if (dokument.fil?.mejlmissiv_diarieford !== false) return UPPFYLLD;
      return {
        utfall: 'fynd',
        evidens: 'Mejlmissiv är inte diariefört',
        forklaring: 'Mejlmissivet till den bifogade handlingen har inte diarieförts som egen handling.',
        rattningsforslag: 'Diarieför mejlmissivet som ett eget ärendedokument.',
      };
    }),

  'FIL-ZIP-1': (dokument) =>
    kraverFil(dokument, () => {
      const fil = dokument.fil;
      if (fil?.ar_zip !== true || fil.ar_uppackad === true) return UPPFYLLD;
      // Uppackningen utförs av S06 (FR5). Motorn packar aldrig upp något.
      return {
        utfall: 'fynd',
        evidens: fil.filer.join(', '),
        forklaring: 'En registrerad zip-fil är inte uppackad.',
        rattningsforslag: 'Packa upp zip-filen och registrera innehållet som separata filer.',
      };
    }),

  'FIL-LASBAR-1': (dokument) =>
    kraverFil(dokument, () => {
      const lasbar = dokument.fil?.ar_lasbar;
      if (lasbar === true) return UPPFYLLD;
      if (lasbar !== false) return { utfall: 'ej genomförd' };
      return {
        utfall: 'fynd',
        evidens: dokument.fil?.filer.join(', ') ?? '',
        forklaring: 'Den bifogade filen går inte att öppna.',
        rattningsforslag: 'Be avsändaren om en läsbar version av filen.',
      };
    }),

  'FIL-SKANN-1': (dokument) =>
    kraverFil(dokument, () => {
      const fil = dokument.fil;
      if (fil?.ar_dubbelsidig_original !== true) return UPPFYLLD;
      if (fil.ar_korrekt_skannad === true) return UPPFYLLD;
      if (fil.ar_korrekt_skannad !== false) return { utfall: 'ej genomförd' };
      return {
        utfall: 'fynd',
        evidens: fil.filer.join(', '),
        forklaring: 'Ett dubbelsidigt original är skannat enkelsidigt, så baksidorna saknas i filen.',
        rattningsforslag: 'Skanna om handlingen dubbelsidigt.',
      };
    }),

  'FIL-UNDERTECKNAD-1': (dokument) =>
    kraverFil(dokument, () => {
      const undertecknad = dokument.fil?.ar_undertecknad_version;
      if (undertecknad === true) return UPPFYLLD;
      if (undertecknad !== false) return { utfall: 'ej genomförd' };
      return {
        utfall: 'fynd',
        evidens: dokument.fil?.filer.join(', ') ?? '',
        forklaring: 'Den inskannade handlingen är inte den undertecknade versionen.',
        rattningsforslag: 'Registrera den undertecknade versionen av handlingen.',
      };
    }),
};

/** Regel-ID:n den deterministiska motorn äger (S04, Technical Overview). */
export const S04_REGEL_IDN: readonly string[] = Object.keys(REGELHANDLERS);
