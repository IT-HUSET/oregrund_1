'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Kör S06:s omgång på det redigerade dokumentet (FR9). */
export function NyGranskning({ dokumentId }: { dokumentId: string }) {
  const router = useRouter();
  const [fel, setFel] = useState<string | null>(null);
  const [skickar, setSkickar] = useState(false);

  async function skicka() {
    setFel(null);
    setSkickar(true);
    try {
      const svar = await fetch(`/api/dokument/${encodeURIComponent(dokumentId)}/ny-granskning`, {
        method: 'POST',
      });
      const kropp = (await svar.json().catch(() => ({}))) as { meddelande?: string; status?: string };
      if (!svar.ok) {
        setFel(kropp.meddelande ?? 'Ny granskning misslyckades. Dokumentet är kvar i Åtgärd krävs.');
        return;
      }
      if (kropp.status === 'Åtgärd krävs') {
        router.refresh();
        return;
      }
      router.push('/handlaggare');
    } catch {
      setFel('Ny granskning misslyckades. Dokumentet är kvar i Åtgärd krävs.');
    } finally {
      setSkickar(false);
    }
  }

  return (
    <div className="ny-granskning">
      <button type="button" className="primar" disabled={skickar} onClick={() => void skicka()}>
        Skicka för ny granskning
      </button>
      {fel !== null && (
        <p role="alert" className="fel">
          {fel}
        </p>
      )}
    </div>
  );
}
