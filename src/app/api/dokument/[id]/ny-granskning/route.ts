import { NextResponse } from 'next/server';

import { skickaForNyGranskning } from '../../../../../lib/handlaggare.ts';
import { hamtaBeroenden } from '../../../../../server/beroenden.ts';

const STATUSKOD = { 'ej-hittat': 404, ogiltigt: 422, misslyckades: 500 } as const;

/**
 * "Skicka för ny granskning" (FR9). Anropar S06:s omgångskontrakt. Rollen är
 * Handläggare; prototypen har ingen inloggning som skulle kunna säga något annat.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resultat = await skickaForNyGranskning(id, hamtaBeroenden());
  if (!resultat.ok) {
    return NextResponse.json({ meddelande: resultat.meddelande }, { status: STATUSKOD[resultat.typ] });
  }
  return NextResponse.json({ status: resultat.post.granskningsstatus });
}
