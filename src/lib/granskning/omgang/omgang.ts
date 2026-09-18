/**
 * Granskningsomgångens entry point (S06 TI02, TI05, TI07, TI08).
 *
 * Det här är den enda platsen S07, S08 och S09 utlöser en granskningsomgång
 * från (`docs/plan.json`, sharedDecision "Granskningsomgång orchestration
 * contract"). Ordningen följer ADR Beslut 2: deterministiskt → AI → status →
 * rättning → exakt en omkörning.
 *
 * Varje mutation är grindad på en lyckad loggskrivning (ADR Beslut 3): posten
 * skrivs först, dokumentet ändras sedan. Misslyckas skrivningen sker ingen
 * ändring alls.
 */

import type { Kontrollogg } from '../../kontrollogg/index.ts';
import type {
  AndringPost,
  FyndPost,
  KontrolloggPost,
  ManskligtBeslutPost,
  RegelutfallPost,
  StatusbytePost,
} from '../../kontrollogg/types.ts';
import type { ChecklistCatalog } from '../../rule-catalog.ts';
import { bedomAiRegler, skapaOmgang } from '../ai/dispatch.ts';
import type { AiKlient } from '../ai/klient.ts';
import type { Fynd, GranskatDokument } from '../kontrakt.ts';
import { skapaDeterministiskMotor, type DeterministiskMotor } from '../motor.ts';
import type { Referensdata } from '../regler.ts';
import { allaFynd, slaSammanUtfall, type SammanslagetUtfall } from './sammanslagning.ts';
import { forberedRattning, rattningsfel, type Filkalla, type Rattning } from './rattning.ts';
import { bestamStatus, satterRegistrerat, REGISTRERAD, type Granskningsstatus } from './status.ts';

export interface ManskligtBeslut {
  roll: string;
  beslut: string;
  motivering: string;
  /** Sätts bara när beslutet uttryckligen registrerar dokumentet (FR4, FR8). */
  sattDokumentstatus?: string;
}

export interface GranskningsomgangIndata {
  dokument: GranskatDokument;
  katalog: ChecklistCatalog;
  referensdata: Referensdata;
  klient: AiKlient;
  logg: Kontrollogg;
  /** Var filer ligger på disk. Utan den kan en zip inte packas upp. */
  filkalla?: Filkalla;
  manskligtBeslut?: ManskligtBeslut;
  /** Injicerbar klocka, så att tester får deterministiska tidpunkter. */
  nu?: () => Date;
}

export interface Granskningsomgang {
  dokumentId: string;
  status: Granskningsstatus;
  /** Dokumentstatusen efter omgången. Oförändrad om ingen skrivning skedde. */
  dokumentstatus: string;
  utfall: SammanslagetUtfall[];
  fynd: Fynd[];
  tillampadeRattningar: Rattning[];
  /** Fynd vars rättning inte kunde utföras och som blev förslag i stället (FR5). */
  degraderadeRattningar: { regelId: string; meddelande: string }[];
  /** Fel som anroparen ska visa, t.ex. en misslyckad loggskrivning. */
  fel: string[];
}

function dokumentIdFor(dokument: GranskatDokument): string {
  return dokument.id ?? dokument.arende.diarienummer;
}

function tillRegelutfallPoster(
  utfall: SammanslagetUtfall[],
  katalog: ChecklistCatalog,
): RegelutfallPost[] {
  const metodPerRegel = new Map(katalog.rules.map((regel) => [regel.id, regel.metod]));
  return utfall.map((rad) => ({
    regelId: rad.regelId,
    utfall: rad.utfall,
    metod: metodPerRegel.get(rad.regelId) ?? '',
  }));
}

function tillFyndPoster(fynd: Fynd[]): FyndPost[] {
  return fynd.map((f) => {
    const post: FyndPost = {
      regelId: f.regelId,
      allvarlighetsgrad: f.allvarlighetsgrad,
      metod: f.metod,
      evidens: f.evidens,
      forklaring: f.forklaring,
    };
    if (f.rattningsforslag !== undefined) post.rattningsforslag = f.rattningsforslag;
    if (f.konfidens !== undefined) post.konfidens = f.konfidens;
    if (f.osaker !== undefined) post.osaker = f.osaker;
    return post;
  });
}

interface Loggunderlag {
  dokumentId: string;
  katalogVersion: string;
  aiModell: string | null;
  nu: () => Date;
}

function nyPost(underlag: Loggunderlag, delar: Partial<KontrolloggPost>): KontrolloggPost {
  return {
    tidpunkt: underlag.nu().toISOString(),
    dokumentId: underlag.dokumentId,
    regelkatalogVersion: underlag.katalogVersion,
    aiModell: underlag.aiModell,
    regelutfall: [],
    fynd: [],
    andringar: [],
    statusbyten: [],
    manskligaBeslut: [],
    ...delar,
  };
}

/**
 * Loggskrivningsgrind (TI02): posten skrivs först, mutationen körs bara om
 * skrivningen lyckades. Returnerar felet i stället för att kasta, så att
 * anroparen kan degradera i stället för att avbryta hela omgången.
 */
async function medLoggrind(
  logg: Kontrollogg,
  post: KontrolloggPost,
  tillampa: () => void,
): Promise<{ ok: true } | { ok: false; fel: string }> {
  try {
    await logg.laggTill(post);
  } catch (fel) {
    return { ok: false, fel: fel instanceof Error ? fel.message : String(fel) };
  }
  tillampa();
  return { ok: true };
}

interface Granskningsresultat {
  utfall: SammanslagetUtfall[];
  aiModell: string | null;
}

async function granskaEnGang(
  dokument: GranskatDokument,
  katalog: ChecklistCatalog,
  motor: DeterministiskMotor,
  klient: AiKlient,
): Promise<Granskningsresultat> {
  // Deterministiskt först och ovillkorligt, sedan AI (ADR Beslut 2).
  const deterministiska = motor.granska(dokument);
  const ai = await bedomAiRegler({ dokument, katalog, klient, omgang: skapaOmgang() });
  return {
    utfall: slaSammanUtfall(katalog, deterministiska, ai.utfall),
    aiModell: ai.aiModell,
  };
}

export async function korGranskningsomgang(
  indata: GranskningsomgangIndata,
): Promise<Granskningsomgang> {
  const { dokument, katalog, referensdata, klient, logg } = indata;
  const nu = indata.nu ?? (() => new Date());
  const motor = skapaDeterministiskMotor(katalog, referensdata);
  const dokumentId = dokumentIdFor(dokument);

  let { utfall, aiModell } = await granskaEnGang(dokument, katalog, motor, klient);
  const underlag: Loggunderlag = {
    dokumentId,
    katalogVersion: katalog.version,
    aiModell,
    nu,
  };

  const tillampadeRattningar: Rattning[] = [];
  const degraderadeRattningar: { regelId: string; meddelande: string }[] = [];
  const fel: string[] = [];

  // TI03/TI04: bara allowlistade regel-ID:n, var och en bakom loggrinden.
  for (const rad of utfall) {
    if (rad.utfall !== 'fynd') continue;
    const forsok = forberedRattning(rad.regelId, dokument, indata.filkalla);
    if (!forsok.ok) {
      if (rad.regelId === 'AD-KONTAKT-5' || rad.regelId === 'FIL-ZIP-1') {
        degraderadeRattningar.push({
          regelId: rad.regelId,
          meddelande: `${rattningsfel(rad.regelId === 'AD-KONTAKT-5' ? 'Kopia till' : 'Filer')}: ${forsok.orsak}`,
        });
      }
      continue;
    }

    const andring: AndringPost = {
      falt: forsok.rattning.falt,
      fore: forsok.rattning.fore,
      efter: forsok.rattning.efter,
      automatisk: true,
      regelId: rad.regelId,
    };
    const resultat = await medLoggrind(
      logg,
      nyPost(underlag, { andringar: [andring] }),
      forsok.tillampa,
    );

    if (resultat.ok) {
      tillampadeRattningar.push(forsok.rattning);
    } else {
      // FR5: en rättning som inte kan loggas utförs inte, utan blir ett förslag.
      degraderadeRattningar.push({
        regelId: rad.regelId,
        meddelande: rattningsfel(forsok.rattning.falt === 'kopia_till' ? 'Kopia till' : 'Filer'),
      });
      fel.push(resultat.fel);
    }
  }

  // TI05: exakt en omkörning, och bara om något faktiskt rättades. Omkörningens
  // fynd auto-rättas aldrig på nytt (FR5).
  if (tillampadeRattningar.length > 0) {
    const omkorning = await granskaEnGang(dokument, katalog, motor, klient);
    utfall = omkorning.utfall;
    aiModell = omkorning.aiModell ?? aiModell;
    underlag.aiModell = aiModell;
  }

  const fynd = allaFynd(utfall);
  const status = bestamStatus({
    utfall,
    katalog,
    antalTillampadeRattningar: tillampadeRattningar.length,
    degraderadeRegelIdn: degraderadeRattningar.map((rad) => rad.regelId),
  });

  // TI07: Registrerat sätts av Godkänd/Autokorrigerad eller av ett uttryckligt
  // mänskligt beslut. Inget annat sätter dokumentstatus.
  const dokumentstatusInnan = String(dokument.arendedokument['status'] ?? '');
  const manskligStatus = indata.manskligtBeslut?.sattDokumentstatus;
  const nyDokumentstatus = satterRegistrerat(status)
    ? REGISTRERAD
    : (manskligStatus ?? dokumentstatusInnan);

  const statusbyten: StatusbytePost[] = [
    { typ: 'granskningsstatus', fran: null, till: status },
  ];
  if (nyDokumentstatus !== dokumentstatusInnan) {
    statusbyten.push({
      typ: 'dokumentstatus',
      fran: dokumentstatusInnan === '' ? null : dokumentstatusInnan,
      till: nyDokumentstatus,
    });
  }

  const manskligaBeslut: ManskligtBeslutPost[] =
    indata.manskligtBeslut === undefined
      ? []
      : [
          {
            roll: indata.manskligtBeslut.roll,
            tidpunkt: nu().toISOString(),
            beslut: indata.manskligtBeslut.beslut,
            motivering: indata.manskligtBeslut.motivering,
          },
        ];

  const omgangspost = nyPost(underlag, {
    regelutfall: tillRegelutfallPoster(utfall, katalog),
    fynd: tillFyndPoster(fynd),
    statusbyten,
    manskligaBeslut,
  });

  const skrivning = await medLoggrind(logg, omgangspost, () => {
    if (nyDokumentstatus !== dokumentstatusInnan) {
      dokument.arendedokument['status'] = nyDokumentstatus;
    }
  });

  if (!skrivning.ok) fel.push(skrivning.fel);

  return {
    dokumentId,
    status,
    dokumentstatus: skrivning.ok ? nyDokumentstatus : dokumentstatusInnan,
    utfall,
    fynd,
    tillampadeRattningar,
    degraderadeRattningar,
    fel,
  };
}
