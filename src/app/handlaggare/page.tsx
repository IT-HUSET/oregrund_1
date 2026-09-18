import Link from 'next/link';

import { handlaggarko } from '../../lib/handlaggare-vy.ts';
import { hamtaBeroenden } from '../../server/beroenden.ts';

export const dynamic = 'force-dynamic';

export default async function Handlaggarko() {
  const poster = handlaggarko(hamtaBeroenden().lager.alla());

  return (
    <>
      <h1>Åtgärdskö</h1>
      {poster.length === 0 ? (
        <p className="tomt">Inga dokument har status Åtgärd krävs.</p>
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
                  <Link href={`/handlaggare/${encodeURIComponent(post.dokument.id)}`}>
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
