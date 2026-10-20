/**
 * The audit screen's permutations (step 18, docs/behaviors/audit-screen.md): a seed makes a
 * script of 8 to 14 gestures and an order of answers; the runner plays it on a mounted screen
 * whose server holds every request (`mode: 'hold'`), releasing or failing them by the script's
 * policy between and inside the gestures, and checks the invariants I1-I7 after every answer and
 * at rest. The oracle reads the gestures, never the grid: `Intent` is what the user asked, and
 * `refRows` computes what it should show over the universe, on its own.
 *
 * Shared by the jsdom tier (packages/dom/test/audit-permutations.test.ts: fake timers) and the
 * Chrome tier (packages/dom/test/browser/audit.ts: a clock of its own, real DOM events, or real
 * timers and the keyboard). No test framework here: a broken invariant throws, with the seed,
 * the configuration and the gestures so far.
 */
import type { AuditConfig, AuditScreen } from './audit-screen.js';
import { ACTIONS, ACTORS, auditRow, fold, rng, type FakeServer, type LogEntry } from './fake-server.js';

export type PagerGo = 'first' | 'prev' | 'next';
export type Gesture =
  | { readonly t: 'pager'; readonly go: PagerGo }
  | { readonly t: 'size'; readonly size: 25 | 50 | 100 }
  | { readonly t: 'sort' }
  /** Typed in the floating box of `actor`, character by character: `gaps[k]` ms after character k. '' empties it. */
  | { readonly t: 'actor'; readonly text: string; readonly gaps: readonly number[] }
  | { readonly t: 'duration'; readonly op: 'gt' | 'lt' | 'equals' | 'between'; readonly value: number; readonly to: number; readonly end: 'apply' | 'clear' | 'escape' | 'outside' }
  /** The value list: untick all, maybe search, tick the options at `picks` (visible order), then close. */
  | { readonly t: 'set'; readonly picks: readonly number[]; readonly search: string; readonly end: 'apply' | 'escape' | 'outside' }
  | { readonly t: 'quick'; readonly text: string; readonly gaps: readonly number[]; readonly enter: boolean }
  | { readonly t: 'clear' }
  | { readonly t: 'refresh' }
  | { readonly t: 'retry' }
  | { readonly t: 'selectAll' };

export interface Script {
  readonly seed: number;
  readonly gestures: readonly Gesture[];
  /** The order answers come in: oldest first, newest first, any, or all at once now and then. */
  readonly policy: 'fifo' | 'lifo' | 'random' | 'burst';
  /** The server honours the signal (an aborted request rejects at once) or answers late anyway. */
  readonly honour: boolean;
  /** B: the server gives its total (one seed in five). */
  readonly total: boolean;
  readonly failRate: number;
  /** Ends with the grid destroyed while requests wait. */
  readonly destroy: boolean;
}

const FAST = 40;
const PAUSE = 400;
/** After a typed gesture: longer than every pause (300 ms on a server). */
const SETTLE = 350;

const fragments = (r: ReturnType<typeof rng>, pool: readonly string[]): string => {
  const s = r.pick(pool);
  const at = r.int(Math.max(1, s.length - 3));
  const t = s.slice(at, at + 2 + r.int(3)).trim();
  return r.int(3) === 0 ? t.toUpperCase() : t;
};

/** The script of a seed: the same gestures for A and B. `typing: false` leaves out what is typed (the browser's fast tier). */
export function script(seed: number, o: { readonly typing: boolean }): Script {
  const r = rng(seed * 7919 + 17);
  const n = 8 + r.int(7);
  const gaps = (len: number, pauses: boolean) => Array.from({ length: len }, () => (pauses && r.int(4) === 0 ? PAUSE : FAST));
  const gestures: Gesture[] = [];
  const kinds = ['pager', 'pager', 'pager', 'pager', 'size', 'sort', 'sort', 'duration', 'duration', 'set', 'set', 'clear', 'refresh', 'retry', 'retry', 'selectAll',
    ...(o.typing ? (['actor', 'actor', 'actor', 'quick', 'quick', 'quick'] as const) : [])] as const;
  for (let i = 0; i < n; i++) {
    const k = r.pick(kinds);
    if (k === 'pager') gestures.push({ t: 'pager', go: r.pick(['next', 'next', 'next', 'prev', 'first'] as const) });
    else if (k === 'size') gestures.push({ t: 'size', size: r.pick([25, 50, 100] as const) });
    else if (k === 'duration') {
      const value = r.pick([500, 841, 1000, 2500, 4000]);
      gestures.push({ t: 'duration', op: r.pick(['gt', 'lt', 'equals', 'between'] as const), value, to: value + 1500, end: r.pick(['apply', 'apply', 'apply', 'clear', 'escape', 'outside'] as const) });
    } else if (k === 'set') {
      const picks = Array.from({ length: r.int(3) }, () => r.int(8));
      gestures.push({ t: 'set', picks: [...new Set(picks)], search: o.typing && r.int(3) === 0 ? r.pick(['compte', 'dossier-1', 'rapport-0', '18', 'ملف']) : '', end: r.pick(['apply', 'apply', 'apply', 'escape', 'outside'] as const) });
    } else if (k === 'actor') {
      const text = r.int(5) === 0 ? '' : fragments(r, ACTORS);
      gestures.push({ t: 'actor', text, gaps: gaps(text.length, r.int(2) === 0) });
    } else if (k === 'quick') {
      const core = r.int(6) === 0 ? '' : fragments(r, [...ACTORS.slice(0, 20), ...ACTIONS, 'compte-1', 'dossier-0', 'rapport-15', 'ordonnance']);
      const text = r.int(3) === 0 ? ` ${core}  ` : core;
      gestures.push({ t: 'quick', text, gaps: gaps(text.length, r.int(2) === 0), enter: r.int(4) === 0 });
    } else gestures.push({ t: k });
  }
  return { seed, gestures, policy: r.pick(['fifo', 'lifo', 'random', 'burst'] as const), honour: r.int(2) === 0, total: r.int(5) === 0, failRate: 0.08, destroy: r.int(10) === 0 };
}

// ---------------------------------------------------------------- the oracle

/** What the user asked, read from the gestures. */
export interface Intent {
  actor: string;
  duration: { readonly op: 'gt' | 'lt' | 'equals' | 'between'; readonly value: number; readonly to: number } | null;
  resource: { readonly values: ReadonlySet<string>; readonly blanks: boolean } | null;
  quick: string;
  sort: 'none' | 'asc' | 'desc';
  index: number;
  size: number;
}

const queryKey = (i: Intent) => JSON.stringify([i.actor, i.duration, i.resource && [[...i.resource.values].sort(), i.resource.blanks], i.quick, i.sort]);

/** The rows the intent should show, all of them in order, over `universe` rows (a filtered query looks at the newest `scanCap`). */
export function refRows(i: Intent, universe: number, scanCap: number): { readonly count: number; slice(from: number, to: number): string[] } {
  const filtered = i.actor !== '' || i.duration !== null || i.resource !== null || i.quick !== '';
  const asc = i.sort === 'asc';
  if (!filtered) {
    return { count: universe, slice: (a, b) => Array.from({ length: Math.max(0, Math.min(b, universe) - a) }, (_, k) => `e${asc ? universe - 1 - a - k : a + k}`) };
  }
  const n = Math.min(universe, scanCap);
  const a = fold(i.actor);
  const q = fold(i.quick);
  const hit: number[] = [];
  for (let x = 0; x < n; x++) {
    const r = auditRow(x);
    if (a && !fold(r.actor).includes(a)) continue;
    const d = i.duration;
    if (d && !(d.op === 'gt' ? r.durationMs > d.value : d.op === 'lt' ? r.durationMs < d.value : d.op === 'equals' ? r.durationMs === d.value : r.durationMs >= d.value && r.durationMs <= d.to)) continue;
    if (i.resource && !(r.resource === null ? i.resource.blanks : i.resource.values.has(r.resource))) continue;
    if (q && !(fold(r.actor).includes(q) || r.action.includes(q) || (r.resource !== null && fold(r.resource).includes(q)))) continue;
    hit.push(x);
  }
  if (asc) hit.reverse();
  return { count: hit.length, slice: (from, to) => hit.slice(from, to).map((x) => `e${x}`) };
}

// ---------------------------------------------------------------- the runner

export interface RunEnv {
  /** Moves the clock (fake timers, or real time), running what falls due and the promises they settle. */
  advance(ms: number): Promise<void>;
  /**
   * Types `text` in `input` from empty, character by character, calling `between(k)` after
   * character k (where the runner waits `gaps[k]` and may release answers). The default
   * dispatches input events; the Chrome typing tier uses the keyboard.
   */
  type?(input: HTMLInputElement, text: string, between: (k: number) => Promise<void>): Promise<void>;
}

export interface RunContext {
  readonly screen: AuditScreen;
  readonly server: FakeServer;
  readonly host: HTMLElement;
  readonly search: HTMLInputElement;
  readonly config: AuditConfig;
  readonly universe: number;
  readonly scanCap: number;
  readonly env: RunEnv;
  /** The bundle's words the checks read (English). */
  readonly text: Readonly<Record<string, unknown>>;
}

export interface RunResult {
  /** The ids shown at rest (null when the script destroyed the grid), on page `index`. */
  readonly ids: readonly string[] | null;
  readonly index: number;
  /** The query at rest (the oracle's), with the page left out. */
  readonly query: string;
  readonly releases: number;
  readonly requests: number;
}

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

/** Plays a script on a mounted screen. Throws on the first broken invariant. */
export async function runPermutation(s: Script, c: RunContext): Promise<RunResult> {
  const { screen, server, host, search, env } = c;
  const g = screen.grid;
  const k = g.kernel;
  const doc = host.ownerDocument;
  const r = rng(s.seed * 104729 + (c.config === 'fetched' ? 1 : 2));
  const trail: string[] = [];
  const fail = (m: string, detail?: unknown): never => {
    throw new Error(`permutation seed ${s.seed} (${c.config}, ${s.policy}, honour ${s.honour}${c.config === 'server' ? `, total ${s.total}` : ''}): ${m}${detail === undefined ? '' : `\n  ${JSON.stringify(detail).slice(0, 600)}`}\n  replay: PERM_SEED=${s.seed}\n  ${trail.join('\n  ')}`);
  };
  const want = (ok: unknown, m: string, detail?: unknown) => void (ok || fail(m, detail));

  /** The counts a sentence carries: "N rows" (not "rows selected"). */
  const counts = (t: string) => (/selected/.test(t) ? [] : [...t.matchAll(/([\d,]+) rows?\b/g)].map((m) => Number(m[1]!.replace(/,/g, ''))));
  // What the grid says: every sentence, in order.
  const live = (g as unknown as { context: { live: { announce(t: string): void } } }).context.live;
  const said: string[] = [];
  const announce = live.announce.bind(live);
  /** Inside `release`: what is said then belongs to an answer. A count said outside one: reported at the next check. */
  let answering = false;
  let early: string | null = null;
  /** A: the epoch of the set shown (a run of rows requests with the same key). */
  let shownSet = -1;
  const epochOf = (e: LogEntry): number => {
    let n = 0;
    let key: string | null = null;
    for (const x of rowsLog()) {
      if (x.key !== key) n++, (key = x.key);
      if (x === e) return n;
    }
    return n;
  };
  /** A pager or size gesture in A (the browser pages). */
  let paging = false;
  live.announce = (t: string) => {
    said.push(t);
    // I3: every operation that changes the rows runs on the server here (a page in A only cuts):
    // a count said before the answer is a count of rows that are about to go.
    // A page in A only cuts the set held: its range may say the count, which must be the set's.
    if (!answering && counts(t).length && !(paging && counts(t).every((x) => x === k.rows.counts.filtered))) early ??= t;
    announce(t);
  };

  const fmt = new Intl.NumberFormat('en-US');
  const T = c.text as Record<string, string>;
  const intent: Intent = { actor: '', duration: null, resource: null, quick: '', sort: 'none', index: 0, size: k.rows.page?.size ?? 50 };
  let failing = s.failRate;
  let destroyed = false;
  let releases = 0;
  /** Answers applied (released while current): the gate's `accepted` must match. */
  let accepted = 0;

  // ---- elements
  const q = <E extends Element = HTMLElement>(sel: string) => host.querySelector<E>(sel);
  const footer = () => q('.dzg-footer');
  const pagerBtn = (go: string) => q<HTMLButtonElement>(`.dzg-footer button[data-go="${go}"]`);
  const viewport = () => q('.dzg-viewport')!;
  const ids = () => {
    const d = k.rows.displayed;
    return Array.from({ length: d.count }, (_, i) => String((k.rows.row(d.keyAt(d.index(i)!))?.data as { id: string }).id));
  };
  const popup = () => q('.dzg-popup');
  const filterButton = (col: string) => q<HTMLButtonElement>(`.dzg-hcell[role=columnheader][data-col="${col}"] > .dzg-fbtn`);
  const click = (el: HTMLElement | null, m: string) => {
    if (!el) fail(`no ${m}`);
    el!.focus();
    el!.click();
  };
  /** The input event a typed value makes (the value already set). */
  const fire = (el: HTMLElement) => void el.dispatchEvent(new (doc.defaultView!.InputEvent ?? Event)('input', { bubbles: true }));
  const key = (el: Element, k2: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k2, bubbles: true, cancelable: true }));
  const pointerOutside = () => {
    const P = (doc.defaultView as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
    doc.body.dispatchEvent(new P('pointerdown', { bubbles: true, composed: true }));
  };

  // ---- the server's log, read
  const rowsLog = () => server.log.filter((e) => e.channel === 'rows');
  const latest = (channel: string) => {
    let last: LogEntry | undefined;
    for (const e of server.log) if (e.channel === channel) last = e;
    return last;
  };
  const isCurrent = (e: LogEntry) => latest(e.channel) === e && e.abort === null && !destroyed;
  const diag = () => (k.rows as unknown as { diagnostics: { gate: { begun: number; accepted: number; dropped: Record<string, number> } } }).diagnostics.gate;

  // ---- invariants that hold at any moment
  function check(where: string): void {
    if (destroyed) return;
    want(early === null, `${where}: a count said before the answer: "${early}"`);
    // I2: every waiting request but the last of its channel was aborted; the last rows request never.
    const last = new Map<string, LogEntry>();
    for (const e of server.log) last.set(e.channel, e);
    for (const e of server.log) if (e.state === 'pending' && last.get(e.channel) !== e && e.abort === null) fail(`${where}: request ${e.seq} (${e.channel}) superseded but not aborted`);
    const lr = last.get('rows');
    want(!lr || lr.abort === null, `${where}: the current rows request was aborted (${String(lr?.abort)})`);
    // I2: the gate's counts agree with the server's log.
    const d = diag();
    const settled = server.log.filter((e) => e.state !== 'pending').length;
    const dropped = Object.values(d.dropped).reduce((a, b) => a + b, 0);
    want(d.begun === server.log.length, `${where}: gate began ${d.begun}, server saw ${server.log.length}`);
    want(d.accepted + dropped === settled, `${where}: gate settled ${d.accepted}+${dropped}, server settled ${settled}`, d);
    want(d.accepted === accepted, `${where}: gate accepted ${d.accepted}, current answers released ${accepted}`, d);
    // I3: busy exactly while the current rows request runs; stale styling while rows are kept.
    const running = !!lr && lr.state === 'pending';
    want((viewport().getAttribute('aria-busy') === 'true') === running, `${where}: aria-busy ${viewport().getAttribute('aria-busy')} while the current request is ${lr?.state}`);
    const root = q('.dzg')!;
    want(root.hasAttribute('data-stale') === (running && k.rows.displayed.count > 0), `${where}: stale styling ${root.hasAttribute('data-stale')}, running ${running}, rows ${k.rows.displayed.count}`);
    // I4: the footer agrees with the page.
    const p = k.rows.page!;
    const off = (b: HTMLElement | null) => b?.getAttribute('aria-disabled') === 'true';
    want(off(pagerBtn('first')) === (p.index === 0) && off(pagerBtn('prev')) === (p.index === 0), `${where}: first/prev disabled iff page 0`, p);
    want(off(pagerBtn('next')) === !p.hasNext, `${where}: next disabled iff no next`, p);
    const lastBtn = pagerBtn('last');
    if (lastBtn) want(off(lastBtn) === !(p.pageCount !== null && p.index < p.pageCount - 1), `${where}: last disabled iff not before the last page`, p);
    const st = k.rows.status.phase;
    const n = k.rows.displayed.count;
    const cts = k.rows.counts;
    const from = p.index * p.size + 1;
    const range = `${fmt.format(from)} to ${fmt.format(from + n - 1)}`;
    const text = st === 'loading' ? T['grid.loading'] : st === 'error' ? T['grid.error'] : n === 0 ? '0 rows'
      : cts.filtered !== null && cts.total !== null && cts.filtered !== cts.total ? `${range} of ${fmt.format(cts.filtered)} (${fmt.format(cts.total)} in all)`
      : p.total !== null ? `${range} of ${fmt.format(p.total)}` : range;
    want(q('.dzg-pcount')?.textContent === text, `${where}: the count reads "${q('.dzg-pcount')?.textContent}", not "${text}"`);
    const all = q<HTMLButtonElement>('.dzg-footer button[data-act="all"]');
    if (all && !all.hidden) want(cts.filtered !== null && all.textContent === (cts.filtered === 1 ? 'Select 1 row' : `Select all ${fmt.format(cts.filtered)} rows`), `${where}: "${all.textContent}" with ${cts.filtered} filtered`);
    // I6: never more than a page of rows shown on server pages; the search sent trimmed.
    // (While a page loads the one before stays, at its own size: at most a page of the largest size.)
    if (c.config === 'server') want(n <= (st === 'idle' ? p.size : 100), `${where}: ${n} rows shown, page size ${p.size}`);
    for (const e of rowsLog()) {
      const qk = (e.req as { quick?: string }).quick;
      if (qk !== undefined) want(qk !== '' && qk === qk.trim(), `${where}: request ${e.seq} sent the search "${qk}"`);
    }
  }


  // ---- answers
  async function release(e: LogEntry, failIt: boolean): Promise<void> {
    if (destroyed) {
      if (failIt) server.fail(e.seq);
      else server.release(e.seq);
      return flush();
    }
    const current = isCurrent(e);
    const before = { ids: ids().join(), status: k.rows.status.phase, q: search.value, said: said.length, focus: doc.activeElement };
    trail.push(`  ${failIt ? 'fail' : 'answer'} #${e.seq} ${e.channel}${current ? '' : ' (stale)'}`);
    want(failIt ? server.fail(e.seq) : server.release(e.seq), `request ${e.seq} could not be ${failIt ? 'failed' : 'released'}`);
    releases++;
    if (current) accepted++;
    answering = true;
    await flush();
    answering = false;
    const now = ids();
    const told = said.slice(before.said);
    // I5: the search field is never rewritten by an answer; the focus stays on the control used.
    want(search.value === before.q, `answer #${e.seq} rewrote the search field ("${before.q}" -> "${search.value}")`);
    const f = before.focus as HTMLElement | null;
    if (f && f !== doc.body && f.isConnected && (f === search || f.closest('.dzg-footer, .dzg-hextra') || f.matches('.dzg-fbtn')))
      want(doc.activeElement === f, `answer #${e.seq} moved the focus from ${f.className || f.tagName} to ${(doc.activeElement as HTMLElement)?.className}`);
    if (e.channel !== 'rows') {
      want(now.join() === before.ids, `a value list answer (#${e.seq}) changed the rows`);
      want(told.length === 0, `a value list answer (#${e.seq}) said something: ${told.join(' | ')}`);
      return check(`after #${e.seq}`);
    }
    if (!current) {
      // I1, I2: a stale answer changes nothing and says nothing.
      want(now.join() === before.ids && k.rows.status.phase === before.status, `stale answer #${e.seq} was applied`, { before: before.ids.slice(0, 80), now: now.join().slice(0, 80) });
      want(told.length === 0, `stale answer #${e.seq} said: ${told.join(' | ')}`);
      return check(`after stale #${e.seq}`);
    }
    // An empty page past an unknown end: the model steps back and asks again (server-pagination.md).
    if (!failIt && rowsLog().some((x) => x.seq > e.seq)) {
      want(c.config === 'server' && e.ids!.length === 0, `answer #${e.seq} made the grid ask again`, e.ids?.length);
      return check(`after #${e.seq} (a step back)`);
    }
    if (failIt) {
      want(k.rows.status.phase === 'error' && now.join() === before.ids, `a failure kept the rows and shows the error (${k.rows.status.phase})`);
      want(!!q('.dzg-overlay button'), 'the error shows Retry');
    } else {
      const got = e.ids!;
      // A: the first set of a query (a new key in the requests, even one changed and back) starts on
      // page 0; pages turned while it loaded or failed were the old set's (server-pagination.md).
      // A refresh or a retry (the same key again) keeps the page.
      if (c.config === 'fetched') {
        const epoch = epochOf(e);
        if (epoch !== shownSet) intent.index = 0;
        shownSet = epoch;
      }
      const p = k.rows.page!;
      const expect = c.config === 'server' ? got : got.slice(p.index * p.size, (p.index + 1) * p.size);
      want(k.rows.status.phase === 'idle', `the current answer #${e.seq} left the status ${k.rows.status.phase}`);
      want(now.join() === expect.join(), `the current answer #${e.seq} is not what is shown (page ${p.index})`, { shown: now.slice(0, 6), answer: expect.slice(0, 6) });
      // I3: a count said is the count of the answer applied; none when the server does not know it.
      // Known: the set's length (A), the total, or where an answer without a next page ends (B).
      const offset = (e.req as { page?: { offset: number } }).page?.offset ?? 0;
      const n = c.config === 'fetched' ? got.length : e.total ?? (e.hasNext === false ? offset + got.length : null);
      const said2 = told.flatMap(counts);
      if (n === null) want(said2.length === 0, `answer #${e.seq}: a count said while the server does not know it: ${told.join(' | ')}`);
      else want(said2.every((x) => x === n), `answer #${e.seq}: said ${said2.join(', ')}, the answer counts ${n}: ${told.join(' | ')}`);
      want(told.filter((t) => counts(t).length).length <= 1, `answer #${e.seq}: more than one count said: ${told.join(' | ')}`);
    }
    return check(`after #${e.seq}`);
  }

  const order = (list: LogEntry[]): LogEntry[] => {
    if (s.policy === 'lifo') return [...list].reverse();
    if (s.policy === 'random' || s.policy === 'burst') return [...list].sort(() => r.next() - 0.5);
    return list;
  };
  /** Some waiting answers, by the policy: a burst releases them all, otherwise one, with probability `p`. */
  async function maybe(p: number, only?: (e: LogEntry) => boolean): Promise<void> {
    if (r.next() >= p) return;
    const list = order(server.pending().filter((e) => !only || only(e)));
    const take = s.policy === 'burst' ? list : list.slice(0, 1);
    for (const e of take) await release(e, r.next() < failing);
  }

  // ---- the oracle's page
  const setIndex = (i: number) => void (intent.index = Math.max(0, i));
  const queryChanged = (before: string) => {
    if (queryKey(intent) !== before) intent.index = 0;
  };

  // ---- gestures
  async function typeInto(input: HTMLInputElement, text: string, gaps: readonly number[]): Promise<void> {
    input.focus();
    const between = async (i: number) => {
      await env.advance(gaps[i] ?? FAST);
      await maybe(0.3);
      check(`typing "${text.slice(0, i + 1)}"`);
    };
    if (env.type) return env.type(input, text, between);
    if (text === '') {
      input.value = '';
      fire(input);
      return between(0);
    }
    for (let i = 0; i < text.length; i++) {
      input.value = text.slice(0, i + 1);
      fire(input);
      await between(i);
    }
  }

  async function openPopup(col: string): Promise<boolean> {
    const b = filterButton(col);
    if (!b) return false;
    click(b, `${col} filter button`);
    await flush();
    return !!popup();
  }
  async function closePopup(end: 'apply' | 'escape' | 'outside' | 'clear'): Promise<void> {
    const pop = popup()!;
    if (end === 'apply' || end === 'clear') {
      if (end === 'clear') click(pop.querySelector<HTMLButtonElement>('.dzg-fclr'), 'clear');
      click(pop.querySelector<HTMLButtonElement>('.dzg-fapply'), 'apply');
    } else if (end === 'escape') key(doc.activeElement && pop.contains(doc.activeElement) ? doc.activeElement : pop, 'Escape');
    else pointerOutside();
    await env.advance(1);
    await flush();
    want(!popup(), `the popup stays open after ${end}`);
  }

  async function gesture(x: Gesture): Promise<void> {
    trail.push(JSON.stringify(x));
    paging = c.config === 'fetched' && (x.t === 'pager' || x.t === 'size');
    const before = queryKey(intent);
    const requests = server.log.length;
    switch (x.t) {
      case 'pager': {
        const b = pagerBtn(x.go)!;
        const enabled = b.getAttribute('aria-disabled') !== 'true';
        click(b, `pager ${x.go}`);
        want(doc.activeElement === b, 'the focus stays on the pager button');
        if (enabled) setIndex(x.go === 'first' ? 0 : x.go === 'prev' ? intent.index - 1 : intent.index + 1);
        // I6: a page change in A asks nothing.
        if (c.config === 'fetched') want(server.log.length === requests, 'a page change in A asked the server');
        break;
      }
      case 'size': {
        const sel = q<HTMLSelectElement>('.dzg-footer select')!;
        sel.focus();
        sel.value = String(x.size);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        if (x.size !== intent.size) {
          intent.index = Math.floor((intent.index * intent.size) / x.size);
          intent.size = x.size;
        }
        if (c.config === 'fetched') want(server.log.length === requests, 'a page size change in A asked the server');
        break;
      }
      case 'sort': {
        click(q('.dzg-hcell[role=columnheader][data-col="occurredAt"] .dzg-hlabel'), 'the time header');
        intent.sort = intent.sort === 'none' ? 'asc' : intent.sort === 'asc' ? 'desc' : 'none';
        queryChanged(before);
        break;
      }
      case 'actor': {
        const input = q<HTMLInputElement>('.dzg-hextra[data-col="actor"] input');
        if (!input) fail('no floating box for actor');
        await typeInto(input!, x.text, x.gaps);
        await env.advance(SETTLE);
        intent.actor = x.text;
        queryChanged(before);
        // A pause mid-way applied a filter: page 0, even if the text ends where it started.
        if (rowsLog().some((e) => e.seq > requests)) intent.index = 0;
        break;
      }
      case 'quick': {
        const pauses = x.gaps.filter((ms) => ms >= PAUSE).length;
        await typeInto(search, x.text, x.gaps);
        if (x.enter) key(search, 'Enter');
        await env.advance(SETTLE);
        intent.quick = x.text.trim();
        queryChanged(before);
        if (rowsLog().some((e) => e.seq > requests)) intent.index = 0;
        // I6: one request per typing pause, at most.
        const asked = rowsLog().filter((e) => e.seq > requests).length;
        want(asked <= pauses + 1, `typing "${x.text}" with ${pauses} pauses asked ${asked} times`);
        break;
      }
      case 'duration': {
        if (!(await openPopup('durationMs'))) fail('the duration popup did not open');
        const pop = popup()!;
        const op = pop.querySelector<HTMLSelectElement>('select.dzg-fop')!;
        op.value = x.op;
        op.dispatchEvent(new Event('change', { bubbles: true }));
        const val = pop.querySelector<HTMLInputElement>('input.dzg-fval')!;
        val.value = String(x.value);
        fire(val);
        if (x.op === 'between') {
          const to = pop.querySelector<HTMLInputElement>('input.dzg-fto')!;
          to.value = String(x.to);
          fire(to);
        }
        await maybe(0.3);
        await closePopup(x.end);
        if (x.end === 'apply') intent.duration = { op: x.op, value: x.value, to: x.to };
        if (x.end === 'clear') intent.duration = null;
        queryChanged(before);
        break;
      }
      case 'set': {
        if (!(await openPopup('resource'))) fail('the resource popup did not open');
        const pop = popup()!;
        const values = (e: LogEntry) => e.channel === 'values:resource';
        // The list: its answers released (a failure shows Retry: used once).
        const load = async () => {
          for (let i = 0; i < 6 && server.pending().some(values); i++) {
            const e = order(server.pending().filter(values))[0]!;
            await release(e, i === 0 && r.next() < failing);
            const retry = pop.querySelector<HTMLButtonElement>('.dzg-flistw .dzg-fretry');
            if (retry && !retry.closest('[hidden]')) {
              click(retry, 'list retry');
              await flush();
            }
          }
        };
        await load();
        const opts = () => [...pop.querySelectorAll<HTMLElement>('[role=option]')].sort((a, b) => Number(a.getAttribute('aria-posinset')) - Number(b.getAttribute('aria-posinset')));
        const size = Number(opts()[0]?.getAttribute('aria-setsize') ?? 0);
        // Fewer than six values: ticking two could be more than half (exclude): left alone.
        if (size < 6 || x.end !== 'apply') {
          await closePopup(x.end === 'apply' ? 'escape' : x.end);
          break;
        }
        const allBox = pop.querySelector<HTMLInputElement>('input.dzg-fall')!;
        for (let i = 0; i < 3 && (allBox.checked || allBox.indeterminate); i++) allBox.click();
        want(!allBox.checked && !allBox.indeterminate, 'the value list could not be emptied');
        if (x.search) {
          const box = pop.querySelector<HTMLInputElement>('input.dzg-fsearch')!;
          box.value = x.search;
          fire(box);
          await env.advance(SETTLE);
          await load();
        }
        const picked = new Set<string>();
        let blanks = false;
        const shown = opts();
        for (const at of x.picks) {
          const o = shown[at];
          if (!o || o.getAttribute('aria-selected') === 'true') continue;
          o.click();
          const name = o.querySelector('.dzg-fname')!.textContent!;
          if (name === T['filter.set.blanks']) blanks = true;
          else picked.add(name);
        }
        await maybe(0.3, (e) => !values(e));
        await closePopup('apply');
        intent.resource = { values: picked, blanks };
        queryChanged(before);
        break;
      }
      case 'clear': {
        k.dispatch({ type: 'query.set', query: { filter: {}, quick: '', sort: k.query.sort } as never }, 'user');
        intent.actor = '';
        intent.duration = null;
        intent.resource = null;
        intent.quick = '';
        queryChanged(before);
        break;
      }
      case 'refresh':
        k.dispatch({ type: 'rows.refresh' }, 'user');
        break;
      case 'retry': {
        const b = q<HTMLButtonElement>('.dzg-overlay button');
        if (b && !q('.dzg-overlay')!.hidden) click(b, 'retry');
        break;
      }
      case 'selectAll': {
        const box = q('.dzg-hcell.dzg-check .dzg-box');
        if (box) box.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const all = q<HTMLButtonElement>('.dzg-footer button[data-act="all"]');
        if (all && !all.hidden) click(all, 'select all');
        break;
      }
    }
    await flush();
    check(`after ${x.t}`);
  }

  // ---- the script
  check('mounted');
  for (const x of s.gestures) {
    await gesture(x);
    // Between gestures: answers by the policy.
    for (let i = 0; i < 3; i++) await maybe(0.45);
  }

  if (s.destroy) {
    const shown = ids().join();
    const n = said.length;
    const d0 = diag();
    trail.push('destroy');
    screen.destroy();
    destroyed = true;
    for (const e of order(server.pending())) await release(e, r.next() < 0.5);
    await env.advance(SETTLE);
    want(ids().join() === shown, 'rows changed after destroy');
    want(said.length === n, `said after destroy: ${said.slice(n).join(' | ')}`);
    want(diag().accepted === d0.accepted, 'an answer was applied after destroy');
    return { ids: null, index: -1, query: '', releases, requests: server.log.length };
  }

  // ---- at rest: no more failures; Retry after an error; everything answered.
  failing = 0;
  trail.push('drain');
  for (let round = 0; round < 40; round++) {
    await env.advance(SETTLE);
    const waiting = server.pending();
    if (!waiting.length) {
      if (k.rows.status.phase !== 'error') break;
      click(q<HTMLButtonElement>('.dzg-overlay button'), 'retry at rest');
      await flush();
      continue;
    }
    for (const e of order(waiting)) await release(e, false);
  }
  want(server.pending().length === 0 && k.rows.status.phase === 'idle', `not at rest: ${server.pending().length} waiting, ${k.rows.status.phase}`);
  check('at rest');
  const ref = refRows(intent, c.universe, c.scanCap);
  const last = Math.max(0, Math.ceil(ref.count / intent.size) - 1);
  const index = Math.min(intent.index, last);
  const p = k.rows.page!;
  want(p.size === intent.size && p.index === index, `at rest on page ${p.index} (size ${p.size}), the gestures asked page ${index} (size ${intent.size})`, intent);
  const shown = ids();
  const expected = ref.slice(index * intent.size, (index + 1) * intent.size);
  want(shown.join() === expected.join(), 'at rest the rows are not the gestures\' rows', { shown: shown.slice(0, 8), expected: expected.slice(0, 8), count: ref.count });
  if (c.config === 'server' && s.total) want(p.total === ref.count, `the total says ${p.total}, the gestures' rows count ${ref.count}`);
  return { ids: shown, index, query: queryKey(intent) + intent.size, releases, requests: server.log.length };
}

/**
 * A clock of the page's own (the Chrome tier's fast runs): `setTimeout` and `clearTimeout`
 * replaced on `win` until `restore`; `advance(ms)` runs what falls due, in order, letting the
 * promises each one settles run before the next.
 */
export function pageClock(win: { setTimeout: unknown; clearTimeout: unknown }) {
  let now = 0;
  let ids = 0;
  const timers = new Map<number, { at: number; fn: (...a: unknown[]) => void; args: unknown[] }>();
  const real = { setTimeout: win.setTimeout, clearTimeout: win.clearTimeout };
  win.setTimeout = (fn: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) => {
    timers.set(++ids, { at: now + Math.max(0, Number(ms) || 0), fn, args });
    return ids;
  };
  win.clearTimeout = (id: number) => void timers.delete(id);
  return {
    async advance(ms: number): Promise<void> {
      const end = now + ms;
      for (;;) {
        let next: [number, { at: number }] | null = null;
        for (const t of timers) if (t[1].at <= end && (!next || t[1].at < next[1].at)) next = t;
        if (!next) break;
        const t = timers.get(next[0])!;
        timers.delete(next[0]);
        now = t.at;
        t.fn(...t.args);
        await flush();
      }
      now = end;
      await flush();
    },
    restore(): void {
      win.setTimeout = real.setTimeout;
      win.clearTimeout = real.clearTimeout;
    },
  };
}
