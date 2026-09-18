import type { KontrolloggPost } from './types.ts';

/** Fullständig post enligt FR7-fältlistan, som testernas utgångspunkt. */
export function granskningspost(
  overskrivningar: Partial<KontrolloggPost> = {},
): KontrolloggPost {
  return {
    tidpunkt: '2025-11-17T09:15:00.000Z',
    dokumentId: 'ARENDE-2025-01053-DOK-1',
    regelkatalogVersion: '1.0.0',
    aiModell: 'claude-sonnet-4-5',
    regelutfall: [
      { regelId: 'AD-TITEL-1', utfall: 'fynd', metod: 'C' },
      { regelId: 'AD-KONTAKT-5', utfall: 'uppfylld', metod: 'M' },
      { regelId: 'AD-SEKRETESS-1', utfall: 'ej tillämplig', metod: 'H' },
      { regelId: 'FIL-ZIP-1', utfall: 'ej genomförd', metod: 'M' },
    ],
    fynd: [
      {
        regelId: 'AD-TITEL-1',
        allvarlighetsgrad: 'hög',
        metod: 'C',
        evidens: 'Ang. avtal',
        forklaring: 'Titeln är förkortad och beskriver inte handlingens innehåll.',
        rattningsforslag: 'Hyresavtal för lokal, Öregrund 1:3',
        konfidens: 0.82,
      },
    ],
    andringar: [
      { falt: 'kopiaTill', fore: ['Rex Ljungqvist'], efter: [], automatisk: true, regelId: 'AD-KONTAKT-5' },
    ],
    statusbyten: [
      { typ: 'granskningsstatus', fran: null, till: 'Mänsklig bedömning' },
      { typ: 'dokumentstatus', fran: 'Färdig', till: 'Färdig' },
    ],
    manskligaBeslut: [
      {
        roll: 'Registrator',
        tidpunkt: '2025-11-17T09:20:00.000Z',
        beslut: 'avvisat fynd',
        motivering: 'Titeln följer verksamhetens etablerade namnstandard.',
        regelId: 'AD-TITEL-1',
      },
    ],
    ...overskrivningar,
  };
}
