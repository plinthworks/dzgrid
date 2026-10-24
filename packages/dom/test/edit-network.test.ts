// Phase 5 step 7, a network failure (O11 note, owner S7-O2; step07-plan.md finding 8, « Network »): refused as any
// refusal, but said « server unreachable » when the error looks like a cut (a TypeError, a TimeoutError or
// NetworkError, the browser offline); the host's `reason` and `code` always win. The sentence and the mark agree.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, k } from './support-editors.js';
import { flush, saving } from './support-saves.js';

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

async function refuse(err: unknown, lang: 'en' | 'fr' = 'en') {
  const t = saving({ lang });
  t.api.commit([{ key: k('r1'), column: 'n', input: { text: '17' } }]);
  t.held[0]!.no(err);
  await flush();
  // Past the 0.5 s hold: the mark and its description.
  await new Promise((r) => setTimeout(r, 560));
  const loud = t.host.querySelector('.dzg-live[aria-live="assertive"]')!.textContent;
  return { t, loud, mark: t.descOf('r1') };
}
const named = (name: string) => Object.assign(new Error('x'), { name });

describe('a network failure says « server unreachable » (S7-O2)', () => {
  it('a TypeError (fetch could not connect)', async () => {
    const { loud, mark } = await refuse(new TypeError('Failed to fetch'));
    expect(loud).toBe('Stock: not saved, server unreachable. Previous value restored.');
    expect(mark).toBe('Not saved: server unreachable');
  });

  it('a TimeoutError, a NetworkError', async () => {
    for (const n of ['TimeoutError', 'NetworkError']) {
      const { mark } = await refuse(named(n));
      expect(mark, n).toBe('Not saved: server unreachable');
      cleanup();
    }
  });

  it('the browser offline, whatever the error', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const { mark } = await refuse(new Error('500'));
    expect(mark).toBe('Not saved: server unreachable');
  });

  it('French: « serveur injoignable »', async () => {
    const { loud } = await refuse(new TypeError('Failed to fetch'), 'fr');
    expect(loud).toBe('Stock : non enregistré, serveur injoignable. Valeur précédente rétablie.');
  });

  it('the host\'s reason and code win over the shape of the error', async () => {
    const a = await refuse(Object.assign(new TypeError('x'), { reason: 'quota' }));
    expect(a.mark).toBe('Not saved: quota');
    cleanup();
    const b = await refuse(Object.assign(new TypeError('x'), { code: 'min' }));
    expect(b.mark).toBe('Not saved: at least 0');
  });

  it('any other error stays the server\'s refusal; an AbortError is not a cut', async () => {
    const a = await refuse(new Error('500'));
    expect(a.mark).toBe('Not saved: refused by the server');
    cleanup();
    const b = await refuse(named('AbortError'));
    expect(b.mark).toBe('Not saved: refused by the server');
  });

  it('review 2: a TypeError only when it says fetch, network or load failed (the browsers\' words); an app\'s own TypeError is the server\'s refusal', async () => {
    for (const m of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed']) {
      const { mark } = await refuse(new TypeError(m));
      expect(mark, m).toBe('Not saved: server unreachable');
      cleanup();
    }
    const { mark } = await refuse(new TypeError("Cannot read properties of undefined (reading 'id')"));
    expect(mark).toBe('Not saved: refused by the server');
  });

  it('review 2: the names exactly (a « MyTimeoutError » is not one); the app\'s explicit code « network »', async () => {
    const a = await refuse(named('MyTimeoutError'));
    expect(a.mark).toBe('Not saved: refused by the server');
    cleanup();
    const b = await refuse({ code: 'network' });
    expect(b.mark).toBe('Not saved: server unreachable');
    expect(b.loud).toBe('Stock: not saved, server unreachable. Previous value restored.');
  });

  it('review 2: offline is read from the grid\'s own window', async () => {
    const t = saving();
    // The grid's window says offline; the global is left online.
    Object.defineProperty(t.ctx, 'win', { value: { ...window, navigator: { onLine: false } , AbortController: window.AbortController }, configurable: true });
    t.api.commit([{ key: k('r1'), column: 'n', input: { text: '17' } }]);
    t.held[0]!.no(new Error('500'));
    await flush();
    await new Promise((r) => setTimeout(r, 560));
    expect(t.descOf('r1')).toBe('Not saved: server unreachable');
  });
});

