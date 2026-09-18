import { NextResponse } from 'next/server';

import { hanteraAndring } from '../../../../../lib/handlaggare.ts';
import { hamtaBeroenden } from '../../../../../server/beroenden.ts';

const STATUSKOD = { 'ej-hittat': 404, ogiltigt: 422, misslyckades: 500 } as const;

/**
 * Handläggarens fältändring eller tillämpade förslag (FR9). Rollen är alltid
 * Handläggare: den här vägen är handläggarens, och prototypen har ingen inloggning.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let kropp: unknown;
  try {
    kropp = await request.json();
  } catch {
    return NextResponse.json({ meddelande: 'Begäran måste vara giltig JSON.' }, { status: 400 });
  }
  const { regelId, falt, varde } = (kropp ?? {}) as Record<string, unknown>;

  let resultat;
  if (typeof regelId === 'string') {
    resultat = await hanteraAndring({ dokumentId: id, regelId }, hamtaBeroenden());
  } else if (typeof falt === 'string') {
    resultat = await hanteraAndring({ dokumentId: id, falt, varde }, hamtaBeroenden());
  } else {
    return NextResponse.json({ meddelande: 'regelId eller falt krävs.' }, { status: 400 });
  }

  if (!resultat.ok) {
    return NextResponse.json({ meddelande: resultat.meddelande }, { status: STATUSKOD[resultat.typ] });
  }
  return NextResponse.json({ status: resultat.post.granskningsstatus });
}
