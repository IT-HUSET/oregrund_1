'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Markering av ett stickprovat fynd (FR12). Servern validerar om allt det här –
 * kontrollerna nedan är bara snabbare återkoppling.
 */
export function Felbedomningsformular({
  dokumentId,
  regelId,
}: {
  dokumentId: string;
  regelId: string;
}) {
  const router = useRouter();
  const [oppen, setOppen] = useState(false);
  const [kommentar, setKommentar] = useState('');
  const [fel, setFel] = useState<string | null>(null);
  const [skickar, setSkickar] = useState(false);

  async function skicka(utgang: 'felbedomning' | 'utan-anmarkning') {
    setFel(null);
    if (utgang === 'felbedomning' && kommentar.trim() === '') {
      setFel('En felbedömning kräver en kommentar.');
      return;
    }
    setSkickar(true);
    try {
      const svar = await fetch(`/api/dokument/${encodeURIComponent(dokumentId)}/stickprov`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ regelId, utgang, kommentar }),
      });
      if (!svar.ok) {
        const kropp = (await svar.json().catch(() => ({}))) as { meddelande?: string };
        setFel(kropp.meddelande ?? 'Markeringen kunde inte sparas.');
        return;
      }
      setOppen(false);
      setKommentar('');
      router.refresh();
    } catch {
      setFel('Markeringen kunde inte sparas. Försök igen.');
    } finally {
      setSkickar(false);
    }
  }

  return (
    <div className="beslut">
      <div className="knappar">
        <button type="button" disabled={skickar} onClick={() => setOppen(true)} aria-expanded={oppen}>
          Markera som felbedömning
        </button>
        <button type="button" disabled={skickar} onClick={() => skicka('utan-anmarkning')}>
          Granskat utan anmärkning
        </button>
      </div>
      {oppen && (
        <div className="avvisning">
          <label htmlFor={`kommentar-${regelId}`}>Kommentar (krävs)</label>
          <textarea
            id={`kommentar-${regelId}`}
            value={kommentar}
            onChange={(e) => setKommentar(e.target.value)}
            rows={3}
          />
          <button type="button" disabled={skickar} onClick={() => skicka('felbedomning')}>
            Spara felbedömning
          </button>
        </div>
      )}
      {fel !== null && (
        <p role="alert" className="fel">
          {fel}
        </p>
      )}
    </div>
  );
}
