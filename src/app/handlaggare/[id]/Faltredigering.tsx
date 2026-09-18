'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import type { RedigerbartFalt } from '../../../lib/handlaggare-vy.ts';

function franFalt(falt: RedigerbartFalt[]): Record<string, string> {
  return Object.fromEntries(falt.map((f) => [f.sokvag, f.varde]));
}

/** Fältredigering. Diarienummer är disabled här, men servern avvisar det oavsett. */
export function Faltredigering({
  dokumentId,
  falt,
}: {
  dokumentId: string;
  falt: RedigerbartFalt[];
}) {
  const router = useRouter();
  const [varden, setVarden] = useState(() => franFalt(falt));
  const [fel, setFel] = useState<string | null>(null);
  const [skickar, setSkickar] = useState(false);
  const signatur = falt.map((f) => `${f.sokvag}=${f.varde}`).join('\n');

  useEffect(() => {
    setVarden(
      Object.fromEntries(
        signatur.split('\n').filter((rad) => rad.includes('=')).map((rad) => {
          const i = rad.indexOf('=');
          return [rad.slice(0, i), rad.slice(i + 1)];
        }),
      ),
    );
  }, [signatur]);

  async function spara(event: FormEvent) {
    event.preventDefault();
    setFel(null);
    const andrade = falt.filter((f) => !f.lasbart && varden[f.sokvag] !== f.varde);
    if (andrade.length === 0) return;
    setSkickar(true);
    let nagonLyckades = false;
    try {
      for (const f of andrade) {
        const svar = await fetch(`/api/dokument/${encodeURIComponent(dokumentId)}/andring`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ falt: f.sokvag, varde: varden[f.sokvag] }),
        });
        if (!svar.ok) {
          const kropp = (await svar.json().catch(() => ({}))) as { meddelande?: string };
          setFel(kropp.meddelande ?? 'Ändringen kunde inte sparas.');
          if (nagonLyckades) router.refresh();
          return;
        }
        nagonLyckades = true;
      }
      router.refresh();
    } catch {
      setFel('Ändringen kunde inte sparas. Försök igen.');
      if (nagonLyckades) router.refresh();
    } finally {
      setSkickar(false);
    }
  }

  return (
    <form className="faltredigering" onSubmit={(e) => void spara(e)}>
      <dl className="falt">
        {falt.map((f) => (
          <div key={f.sokvag}>
            <dt>
              <label htmlFor={f.sokvag}>{f.etikett}</label>
            </dt>
            <dd>
              <input
                id={f.sokvag}
                name={f.sokvag}
                value={varden[f.sokvag] ?? ''}
                readOnly={f.lasbart}
                disabled={f.lasbart}
                onChange={(e) => setVarden((nu) => ({ ...nu, [f.sokvag]: e.target.value }))}
              />
            </dd>
          </div>
        ))}
      </dl>
      <button type="submit" disabled={skickar}>
        Spara ändringar
      </button>
      {fel !== null && (
        <p role="alert" className="fel">
          {fel}
        </p>
      )}
    </form>
  );
}
