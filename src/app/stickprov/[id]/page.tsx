import Link from 'next/link';
import { notFound } from 'next/navigation';

import { delaMetadata } from '../../../lib/registrator-vy.ts';
import { markerbaraRegelIdn, REGISTRERADE_STATUSAR } from '../../../lib/stickprov.ts';
import { hamtaBeroenden } from '../../../server/beroenden.ts';
import { Falttabell, Logglista, tid } from '../../Dokumentvy.tsx';
import { Felbedomningsformular } from './Felbedomningsformular.tsx';

export const dynamic = 'force-dynamic';

const FLIKAR = ['detaljer', 'kontakter', 'filer', 'logg'] as const;
type Flik = (typeof FLIKAR)[number];
const FLIKNAMN: Record<Flik, string> = {
  detaljer: 'Detaljer',
  kontakter: 'Kontakter',
  filer: 'Filer',
  logg: 'Logg',
};

export default async function Stickprovsdetalj({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ flik?: string | string[] }>;
}) {
  const { id } = await params;
  const { flik: valdFlik } = await searchParams;
  const flik = FLIKAR.find((f) => f === valdFlik) ?? 'detaljer';

  const { lager, logg } = hamtaBeroenden();
  const post = lager.hamta(decodeURIComponent(id));
  if (post === undefined) notFound();
  if (!REGISTRERADE_STATUSAR.includes(post.granskningsstatus)) notFound();

  const { dokument } = post;
  const metadata = delaMetadata(dokument);
  // Hela historiken läses alltid: markeringarna nedan bygger på den, inte bara logg-fliken.
  const historik = await logg.lasForDokument(dokument.id);
  const markerbara = await markerbaraRegelIdn(post, logg);

  const markeringar = historik.flatMap((rad) =>
    rad.manskligaBeslut.filter((beslut) => beslut.beslut.startsWith('Stickprov')),
  );
  const flikhref = (f: Flik) => `/stickprov/${encodeURIComponent(dokument.id)}?flik=${f}`;

  return (
    <>
      <p>
        <Link href="/stickprov">← Stickprov</Link>
      </p>
      <h1>{dokument.arendedokument.titel}</h1>
      <p className="undertitel">
        {dokument.arende.diarienummer} · <strong>{post.granskningsstatus}</strong> · Dokumentstatus:{' '}
        {String(dokument.arendedokument['status'] ?? '–')}
      </p>

      <section aria-labelledby="granskat-rubrik">
        <h2 id="granskat-rubrik">Granskade fynd ({markerbara.length})</h2>
        {markerbara.length === 0 && (
          <p className="tomt">
            Granskningen gav inga fynd. Ett dokument utan fynd kan ändå vara fel bedömt – då hör
            felbedömningen hemma i en regel som saknas, inte i ett fynd.
          </p>
        )}
        {markerbara.map((regelId) => {
          const fynd = post.fynd.find((rad) => rad.regelId === regelId);
          const tidigare = markeringar.filter((rad) => rad.regelId === regelId);
          return (
            <article key={regelId} className="fynd">
              <h3>
                {regelId}
                {fynd === undefined ? (
                  <span className="marke">Auto-rättat</span>
                ) : (
                  <span className="marke">{fynd.allvarlighetsgrad}</span>
                )}
              </h3>
              {fynd === undefined ? (
                <p>
                  Fyndet rättades automatiskt och står inte kvar i fyndlistan. Före- och
                  eftervärdena finns i loggen.
                </p>
              ) : (
                <>
                  <p>{fynd.regeltext}</p>
                  <dl className="falt">
                    <div>
                      <dt>Evidens</dt>
                      <dd>{fynd.evidens}</dd>
                    </div>
                    <div>
                      <dt>Förklaring</dt>
                      <dd>{fynd.forklaring}</dd>
                    </div>
                  </dl>
                </>
              )}
              {tidigare.map((markering, i) => (
                <p key={i} className="avgjort">
                  {markering.beslut} av {markering.roll} {tid(markering.tidpunkt)}
                  {markering.motivering !== '' && <> – {markering.motivering}</>}
                </p>
              ))}
              <Felbedomningsformular dokumentId={dokument.id} regelId={regelId} />
            </article>
          );
        })}
      </section>

      <nav aria-label="Flikar" className="flikar">
        {FLIKAR.map((f) => (
          <Link key={f} href={flikhref(f)} aria-current={f === flik ? 'page' : undefined}>
            {FLIKNAMN[f]}
          </Link>
        ))}
      </nav>

      {flik === 'detaljer' && <Falttabell rader={metadata.detaljer} />}
      {flik === 'kontakter' && <Falttabell rader={metadata.kontakter} />}
      {flik === 'filer' && <Falttabell rader={metadata.filer} />}
      {flik === 'logg' && <Logglista historik={historik} />}
    </>
  );
}
