'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Per-fynd-åtgärderna (FR8). Servern validerar om allt detta; kontrollerna här är bara snabbare återkoppling. */
export function Beslutsformular({ dokumentId, regelId }: { dokumentId: string; regelId: string }) {
  const router = useRouter();
  const [avvisar, setAvvisar] = useState(false);
  const [motivering, setMotivering] = useState('');
  const [fel, setFel] = useState<string | null>(null);
  const [skickar, setSkickar] = useState(false);

  async function skicka(beslut: 'godkann' | 'avvisa' | 'skicka') {
    setFel(null);
    if (beslut === 'avvisa' && motivering.trim() === '') {
      setFel('Avvisning kräver en motivering.');
      return;
    }
    setSkickar(true);
    try {
      const svar = await fetch(`/api/dokument/${encodeURIComponent(dokumentId)}/beslut`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ regelId, beslut, motivering }),
      });
      if (!svar.ok) {
        const kropp = (await svar.json().catch(() => ({}))) as { meddelande?: string };
        setFel(kropp.meddelande ?? 'Beslutet kunde inte sparas.');
        return;
      }
      router.refresh();
    } catch {
      setFel('Beslutet kunde inte sparas. Försök igen.');
    } finally {
      setSkickar(false);
    }
  }

  return (
    <div className="beslut">
      <div className="knappar">
        <button type="button" disabled={skickar} onClick={() => skicka('godkann')}>
          Godkänn förslag
        </button>
        <button type="button" disabled={skickar} onClick={() => skicka('skicka')}>
          Skicka till handläggare
        </button>
        <button type="button" disabled={skickar} onClick={() => setAvvisar(true)} aria-expanded={avvisar}>
          Avvisa fyndet
        </button>
      </div>
      {avvisar && (
        <div className="avvisning">
          <label htmlFor={`motivering-${regelId}`}>Motivering (krävs)</label>
          <textarea
            id={`motivering-${regelId}`}
            value={motivering}
            onChange={(e) => setMotivering(e.target.value)}
            rows={3}
          />
          <button type="button" disabled={skickar} onClick={() => skicka('avvisa')}>
            Skicka avvisning
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
