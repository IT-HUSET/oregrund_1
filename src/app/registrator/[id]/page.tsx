import Link from 'next/link';
import { notFound } from 'next/navigation';

import type { Fyndbeslut } from '../../../lib/dokumentlager.ts';
import { delaMetadata, type Faltrad } from '../../../lib/registrator-vy.ts';
import { hamtaBeroenden } from '../../../server/beroenden.ts';
import { Beslutsformular } from './Beslutsformular.tsx';

export const dynamic = 'force-dynamic';

const FLIKAR = ['detaljer', 'kontakter', 'filer', 'logg'] as const;
type Flik = (typeof FLIKAR)[number];
const FLIKNAMN: Record<Flik, string> = {
  detaljer: 'Detaljer',
  kontakter: 'Kontakter',
  filer: 'Filer',
  logg: 'Logg',
};

const UTGANGSTEXT: Record<Fyndbeslut['utgang'], string> = {
  godkant: 'Godkänt förslag',
  avvisat: 'Avvisat',
  skickat: 'Skickat till handläggare',
};

const tid = (iso: string) => iso.replace('T', ' ').slice(0, 19);

function Falttabell({ rader }: { rader: Faltrad[] }) {
  if (rader.length === 0) return <p className="tomt">Inga uppgifter.</p>;
  return (
    <dl className="falt">
      {rader.map(([etikett, varde]) => (
        <div key={etikett}>
          <dt>{etikett}</dt>
          <dd>{varde}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function Dokumentdetalj({
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

  const { dokument } = post;
  const metadata = delaMetadata(dokument);
  const historik = flik === 'logg' ? await logg.lasForDokument(dokument.id) : [];
  const kanBeslutas = post.granskningsstatus === 'Mänsklig bedömning';
  const flikhref = (f: Flik) => `/registrator/${encodeURIComponent(dokument.id)}?flik=${f}`;

  return (
    <>
      <p>
        <Link href="/registrator">← Registratorkö</Link>
      </p>
      <h1>{dokument.arendedokument.titel}</h1>
      <p className="undertitel">
        {dokument.arende.diarienummer} · <strong>{post.granskningsstatus}</strong> · Dokumentstatus:{' '}
        {String(dokument.arendedokument['status'] ?? '–')}
      </p>

      <section aria-labelledby="fynd-rubrik">
        <h2 id="fynd-rubrik">Fynd ({post.fynd.length})</h2>
        {post.fynd.length === 0 && <p className="tomt">Inga fynd.</p>}
        {post.fynd.map((fynd) => {
          const beslut = post.beslut.find((b) => b.regelId === fynd.regelId);
          return (
            <article key={`${fynd.regelId}-${fynd.metod}`} className="fynd">
              <h3>
                {fynd.regelId} <span className="marke">{fynd.allvarlighetsgrad}</span>
                {fynd.osaker === true && <span className="marke osaker">Osäker</span>}
              </h3>
              <p>{fynd.regeltext}</p>
              <dl className="falt">
                <div>
                  <dt>Metod</dt>
                  <dd>{fynd.metod}</dd>
                </div>
                {fynd.konfidens !== undefined && (
                  <div>
                    <dt>Konfidens</dt>
                    <dd>{Math.round(fynd.konfidens * 100)} %</dd>
                  </div>
                )}
                <div>
                  <dt>Evidens</dt>
                  <dd>{fynd.evidens}</dd>
                </div>
                <div>
                  <dt>Förklaring</dt>
                  <dd>{fynd.forklaring}</dd>
                </div>
                {fynd.rattningsforslag !== undefined && (
                  <div>
                    <dt>Rättningsförslag</dt>
                    <dd>{fynd.rattningsforslag}</dd>
                  </div>
                )}
              </dl>
              {beslut !== undefined ? (
                <p className="avgjort">
                  {UTGANGSTEXT[beslut.utgang]} av {beslut.roll} {tid(beslut.tidpunkt)}
                  {beslut.motivering !== '' && <> – {beslut.motivering}</>}
                </p>
              ) : (
                kanBeslutas && <Beslutsformular dokumentId={dokument.id} regelId={fynd.regelId} />
              )}
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
      {flik === 'logg' && (
        <ol className="logg">
          {historik.length === 0 && <li className="tomt">Ingen loggad historik.</li>}
          {historik.map((p, i) => (
            <li key={`${p.tidpunkt}-${i}`}>
              <strong>{tid(p.tidpunkt)}</strong> · regelkatalog {p.regelkatalogVersion}
              {p.aiModell !== null && <> · AI {p.aiModell}</>}
              <ul>
                {p.regelutfall.length > 0 && (
                  <li>
                    {p.regelutfall.length} regelutfall, {p.fynd.length} fynd
                  </li>
                )}
                {p.andringar.map((a, j) => (
                  <li key={`a${j}`}>
                    Ändring ({a.automatisk ? 'automatisk' : 'manuell'}
                    {a.regelId !== undefined && <> {a.regelId}</>}): {a.falt} {JSON.stringify(a.fore)} →{' '}
                    {JSON.stringify(a.efter)}
                  </li>
                ))}
                {p.statusbyten.map((s, j) => (
                  <li key={`s${j}`}>
                    Statusbyte ({s.typ}): {s.fran ?? '–'} → {s.till}
                  </li>
                ))}
                {p.manskligaBeslut.map((b, j) => (
                  <li key={`b${j}`}>
                    Beslut av {b.roll}: {b.beslut}
                    {b.regelId !== undefined && <> ({b.regelId})</>}
                    {b.motivering !== '' && <> – {b.motivering}</>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
