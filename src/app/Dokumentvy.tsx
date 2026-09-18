/**
 * Delade vykomponenter för dokumentdetaljvyerna (S07 registrator, S11 stickprov).
 *
 * Loggen renderas på ett enda ställe: båda vyerna visar samma historik, och
 * ingen av dem exponerar någon väg att ändra eller ta bort en loggpost (FR7).
 */

import type { KontrolloggPost } from '../lib/kontrollogg/index.ts';
import type { Faltrad } from '../lib/registrator-vy.ts';

export const tid = (iso: string): string => iso.replace('T', ' ').slice(0, 19);

export function Falttabell({ rader }: { rader: Faltrad[] }) {
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

export function Logglista({ historik }: { historik: KontrolloggPost[] }) {
  return (
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
  );
}
