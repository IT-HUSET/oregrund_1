import { NextResponse } from 'next/server';

import { hanteraBeslut } from '../../../../../lib/registrator.ts';
import { hamtaBeroenden } from '../../../../../server/beroenden.ts';

const STATUSKOD = { 'ej-hittat': 404, ogiltigt: 422, misslyckades: 500 } as const;

/**
 * Registratorns beslut om ett fynd (FR8). Rollen är alltid Registrator: den här vägen
 * är registratorns, och prototypen har ingen inloggning som skulle kunna säga något annat.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let kropp: unknown;
  try {
    kropp = await request.json();
  } catch {
    return NextResponse.json({ meddelande: 'Begäran måste vara giltig JSON.' }, { status: 400 });
  }
  const { regelId, beslut, motivering } = (kropp ?? {}) as Record<string, unknown>;
  if (typeof regelId !== 'string' || typeof beslut !== 'string') {
    return NextResponse.json({ meddelande: 'regelId och beslut krävs.' }, { status: 400 });
  }
  if (motivering !== undefined && typeof motivering !== 'string') {
    return NextResponse.json({ meddelande: 'motivering måste vara text.' }, { status: 400 });
  }

  const resultat = await hanteraBeslut({ dokumentId: id, regelId, beslut, motivering }, hamtaBeroenden());
  if (!resultat.ok) {
    return NextResponse.json({ meddelande: resultat.meddelande }, { status: STATUSKOD[resultat.typ] });
  }
  return NextResponse.json({ status: resultat.post.granskningsstatus });
}
