import Link from 'next/link';

import { filtreraStickprovsko, REGISTRERADE_STATUSAR } from '../../lib/stickprov.ts';
import { hamtaBeroenden } from '../../server/beroenden.ts';

export const dynamic = 'force-dynamic';

/** Stickprovskön: bara dokument som automatiken registrerat utan mänsklig blick (FR12). */
export default function Stickprovsko() {
  const poster = filtreraStickprovsko(hamtaBeroenden().lager.alla());

  return (
    <>
      <h1>Stickprov</h1>
      <p className="undertitel">
        Automatiskt registrerade dokument ({REGISTRERADE_STATUSAR.join(' och ')}). De passerar aldrig
        registratorkön, så det här är enda vägen att upptäcka en felbedömning i efterhand.
      </p>

      {poster.length === 0 ? (
        <p className="tomt">
          Inga dokument är automatiskt registrerade ännu. Kön fylls när en granskning slutar i Godkänd
          eller Autokorrigerad.
        </p>
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
                  <Link href={`/stickprov/${encodeURIComponent(post.dokument.id)}`}>
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
