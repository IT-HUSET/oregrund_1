'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Ett klick tillämpar fyndets rättningsförslag. Servern validerar och loggar. */
export function TillampaForslag({ dokumentId, regelId }: { dokumentId: string; regelId: string }) {
  const router = useRouter();
  const [fel, setFel] = useState<string | null>(null);
  const [skickar, setSkickar] = useState(false);

  async function tillampa() {
    setFel(null);
    setSkickar(true);
    try {
      const svar = await fetch(`/api/dokument/${encodeURIComponent(dokumentId)}/andring`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ regelId }),
      });
      if (!svar.ok) {
        const kropp = (await svar.json().catch(() => ({}))) as { meddelande?: string };
        setFel(kropp.meddelande ?? 'Förslaget kunde inte tillämpas.');
        return;
      }
      router.refresh();
    } catch {
      setFel('Förslaget kunde inte tillämpas. Försök igen.');
    } finally {
      setSkickar(false);
    }
  }

  return (
    <div className="beslut">
      <button type="button" disabled={skickar} onClick={() => void tillampa()}>
        Tillämpa förslag
      </button>
      {fel !== null && (
        <p role="alert" className="fel">
          {fel}
        </p>
      )}
    </div>
  );
}
