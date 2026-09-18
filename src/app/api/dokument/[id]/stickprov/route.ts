import { NextResponse } from 'next/server';

import { hamtaBeroenden } from '../../../../../server/beroenden.ts';
import { hanteraStickprov } from '../../../../../lib/stickprov.ts';

const STATUSKOD = { 'ej-hittat': 404, ogiltigt: 422, misslyckades: 500 } as const;

/**
 * Registratorns bedömning av ett stickprovat fynd (FR12). Rollen är alltid
 * Registrator: prototypen har ingen inloggning som kan säga något annat.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let kropp: unknown;
  try {
    kropp = await request.json();
  } catch {
    return NextResponse.json({ meddelande: 'Begäran måste vara giltig JSON.' }, { status: 400 });
  }
  const { regelId, utgang, kommentar } = (kropp ?? {}) as Record<string, unknown>;
  if (typeof regelId !== 'string' || typeof utgang !== 'string') {
    return NextResponse.json({ meddelande: 'regelId och utgang krävs.' }, { status: 400 });
  }
  if (kommentar !== undefined && typeof kommentar !== 'string') {
    return NextResponse.json({ meddelande: 'kommentar måste vara text.' }, { status: 400 });
  }

  const resultat = await hanteraStickprov(
    { dokumentId: decodeURIComponent(id), regelId, utgang, kommentar },
    hamtaBeroenden(),
  );
  if (!resultat.ok) {
    return NextResponse.json({ meddelande: resultat.meddelande }, { status: STATUSKOD[resultat.typ] });
  }
  return NextResponse.json({ loggat: resultat.loggtext });
}
