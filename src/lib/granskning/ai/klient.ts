/**
 * Timeout-skyddad Claude API-klient (S05 TI01). Returnerar alltid ett typat resultat och kastar aldrig,
 * så att anroparen kan degradera en regel till "ej genomförd" (ADR Beslut 2).
 */

export interface AiVerdikt {
  fynd: boolean;
  /** 0–1. */
  konfidens: number;
  evidens: string;
  forklaring: string;
  rattningsforslag?: string;
}

export type KlientFel = 'timeout' | 'transport' | 'otolkbart';

export type KlientSvar = { ok: true; verdikt: AiVerdikt } | { ok: false; fel: KlientFel; detalj?: string };

export interface AiBegaran {
  system: string;
  anvandare: string;
}

export interface AiKlient {
  /** Modellnamnet som loggas i kontrolloggen. */
  readonly modell: string;
  bedom(begaran: AiBegaran): Promise<KlientSvar>;
}

export interface ClaudeKlientAlternativ {
  apiKey: string;
  modell?: string;
  timeoutMs?: number;
  /** Injicerbar så att tester aldrig når nätverket. */
  fetchFn?: typeof fetch;
}

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
export const STANDARDMODELL = 'claude-sonnet-5';
export const STANDARD_TIMEOUT_MS = 15_000;
const MAX_TOKENS = 1024;

/** Tolkar modellens textsvar till ett verdikt. Returnerar undefined om formen inte stämmer. */
export function tolkaVerdikt(text: string): AiVerdikt | undefined {
  const start = text.indexOf('{');
  const slut = text.lastIndexOf('}');
  if (start === -1 || slut < start) return undefined;

  let rad: unknown;
  try {
    rad = JSON.parse(text.slice(start, slut + 1));
  } catch {
    return undefined;
  }
  if (typeof rad !== 'object' || rad === null) return undefined;
  const { fynd, konfidens, evidens, forklaring, rattningsforslag } = rad as Record<string, unknown>;

  if (typeof fynd !== 'boolean') return undefined;
  if (typeof konfidens !== 'number' || !(konfidens >= 0 && konfidens <= 1)) return undefined;
  if (typeof evidens !== 'string' || typeof forklaring !== 'string') return undefined;
  // FR6: varje fynd måste ha evidens och förklaring.
  if (fynd && (evidens.trim() === '' || forklaring.trim() === '')) return undefined;

  const verdikt: AiVerdikt = { fynd, konfidens, evidens, forklaring };
  if (typeof rattningsforslag === 'string' && rattningsforslag.trim() !== '') {
    verdikt.rattningsforslag = rattningsforslag;
  }
  return verdikt;
}

export function skapaClaudeKlient(alternativ: ClaudeKlientAlternativ): AiKlient {
  const modell = alternativ.modell ?? STANDARDMODELL;
  const timeoutMs = alternativ.timeoutMs ?? STANDARD_TIMEOUT_MS;
  const fetchFn = alternativ.fetchFn ?? fetch;

  return {
    modell,
    async bedom({ system, anvandare }) {
      let text: string;
      // AbortSignal.timeout() håller avsiktligt inte event-loopen vid liv, så en
      // fetch som varken svarar eller håller loopen öppen får processen att ta slut
      // innan timeouten löser ut. En egen ref:ad timer gör timeouten observerbar.
      const avbrytare = new AbortController();
      const timer = setTimeout(
        () => avbrytare.abort(new DOMException('Timeout', 'TimeoutError')),
        timeoutMs,
      );
      try {
        const svar = await fetchFn(API_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': alternativ.apiKey,
            'anthropic-version': API_VERSION,
          },
          body: JSON.stringify({
            model: modell,
            max_tokens: MAX_TOKENS,
            system,
            messages: [{ role: 'user', content: anvandare }],
          }),
          signal: avbrytare.signal,
        });
        if (!svar.ok) return { ok: false, fel: 'transport', detalj: `HTTP ${svar.status}` };
        const kropp = (await svar.json()) as { content?: { type?: string; text?: string }[] };
        text = kropp.content?.find((del) => del.type === 'text')?.text ?? '';
      } catch (fel) {
        const namn = fel instanceof Error ? fel.name : '';
        if (namn === 'TimeoutError' || namn === 'AbortError') return { ok: false, fel: 'timeout' };
        return { ok: false, fel: 'transport', detalj: fel instanceof Error ? fel.message : String(fel) };
      } finally {
        clearTimeout(timer);
      }

      const verdikt = tolkaVerdikt(text);
      return verdikt === undefined ? { ok: false, fel: 'otolkbart' } : { ok: true, verdikt };
    },
  };
}
