import Link from 'next/link';

import {
  arGranskningsstatus,
  filtreraKo,
  GRANSKNINGSSTATUSAR,
  STANDARDSTATUS,
} from '../../lib/registrator-vy.ts';
import { hamtaBeroenden } from '../../server/beroenden.ts';

export const dynamic = 'force-dynamic';

export default async function Registratorko({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const { status: valt } = await searchParams;
  const status = arGranskningsstatus(valt) ? valt : STANDARDSTATUS;
  const poster = filtreraKo(hamtaBeroenden().lager.alla(), status);

  return (
    <>
      <h1>Registratorkö</h1>
      <p className="undertitel">
        <Link href="/stickprov">Stickprov på automatiskt registrerade dokument →</Link>
      </p>
      <nav aria-label="Statusfilter" className="filter">
        {GRANSKNINGSSTATUSAR.map((s) => (
          <Link
            key={s}
            href={s === STANDARDSTATUS ? '/registrator' : `/registrator?status=${encodeURIComponent(s)}`}
            aria-current={s === status ? 'true' : undefined}
          >
            {s}
          </Link>
        ))}
      </nav>

      {poster.length === 0 ? (
        <p className="tomt">Inga dokument har status {status}.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Diarienummer</th>
              <th>Titel</th>
              <th>Handlingstyp</th>
              <th>Fynd</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {poster.map((post) => (
              <tr key={post.dokument.id}>
                <td>{post.dokument.arende.diarienummer}</td>
                <td>
                  <Link href={`/registrator/${encodeURIComponent(post.dokument.id)}`}>
                    {post.dokument.arendedokument.titel}
                  </Link>
                </td>
                <td>{post.dokument.arendedokument.handlingstyp}</td>
                <td>{post.fynd.length}</td>
                <td>{post.granskningsstatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
