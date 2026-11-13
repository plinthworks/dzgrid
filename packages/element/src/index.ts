/**
 * @dzgrid/element — DzGrid as a Web Component, for any page or framework (docs/behaviors/web-component.md).
 *
 * ```html
 * <script type="module">import '@dzgrid/element/define';</script>
 * <dz-grid locale="fr-FR" density="compact"></dz-grid>
 * ```
 *
 * In the page, never in a shadow root (the theme, the popups and the print table live in the document). Properties
 * for what is not text (rows, columns, getRowId, messages, features, parts, theme, icons, settings), attributes for the simple
 * settings; every grid event re-dispatched as `dzg-<type in kebab case>`. Bad input never throws: `dzg-problems`.
 */
import { problem, type GridEvent, type Problem, type RowModel } from '@dzgrid/core';
import { createGrid, type GridEnv, type GridInstance, type GridSettings } from '@dzgrid/dom';

/** The settings the element's own properties hold (everything else goes through `settings`). */
const PROPS = ['rows', 'source', 'columns', 'getRowId', 'messages', 'features', 'parts', 'theme', 'icons'] as const;
type Prop = (typeof PROPS)[number];
/** Without these three the grid cannot be made: the element waits for them. */
const REQUIRED: readonly Prop[] = ['columns', 'getRowId', 'messages'];
/** A property and what it must be (anything else is refused and told). */
const KIND: Record<Prop | 'settings', 'list' | 'function' | 'object'> = { rows: 'object', source: 'object', columns: 'list', getRowId: 'function', messages: 'object', features: 'list', parts: 'object', theme: 'object', icons: 'object', settings: 'object' };

/**
 * An attribute and the setting it sets: a list of the words it takes, or how it is read. Attributes win over
 * `settings`; taken away, the setting goes back to the grid's default.
 */
const ATTRIBUTES: Record<string, readonly [keyof GridSettings<unknown>, readonly string[] | 'text' | 'number' | 'boolean' | 'locale' | 'zone']> = {
  locale: ['locale', 'locale'],
  'time-zone': ['timeZone', 'zone'],
  numerals: ['numerals', ['latn', 'locale']],
  direction: ['direction', ['auto', 'ltr', 'rtl']],
  density: ['density', ['compact', 'comfortable', 'spacious']],
  headers: ['headers', ['shown', 'hidden']],
  'row-height': ['rowHeight', 'number'],
  'header-height': ['headerHeight', 'number'],
  label: ['label', 'text'],
  overlay: ['overlay', ['loading', 'error']],
  busy: ['busy', 'boolean'],
  motion: ['motion', 'boolean'],
  'multi-sort': ['multiSort', 'boolean'],
};

/** At most this many problems kept on `problems` (the oldest go). */
const KEEP = 100;
/** `selectionChanged` → `dzg-selection-changed`: one rule for every event, no list. */
const eventName = (type: string): string => 'dzg-' + type.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
/** Whether `Intl` takes the value (a locale, a time zone): the element never hands the grid one that throws. */
const takes = (fn: () => unknown): boolean => {
  try {
    return fn(), true;
  } catch {
    return false;
  }
};

/** On a server (no DOM), a class to extend all the same: importing the element never throws. */
const Base = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;

export class DzGridElement<T = unknown> extends Base {
  static readonly observedAttributes = Object.keys(ATTRIBUTES);

  #grid: GridInstance<T, RowModel<T>> | null = null;
  #props: Partial<Record<Prop, unknown>> = {};
  #settings: Partial<GridSettings<T>> = {};
  #attrs: Record<string, unknown> = {};
  #env: GridEnv = {};
  /** The settings last given to the grid (to send only what changed). */
  #last: Record<string, unknown> = {};
  /** The grid's events heard while it is being made: told a microtask later (a page listening right after hears them). */
  #early: GridEvent<T>[] | null = null;
  /** Connected at least once since the element was made: attributes are read, the grid may be made. */
  #wired = false;
  #seen: Problem[] = [];
  #drawn: () => void = () => {};
  #gaveUp: (e: unknown) => void = () => {};
  /** Resolved once the grid is first made; rejected when it cannot be (refused, or a grid already there). Settled once. */
  readonly ready: Promise<void> = new Promise<void>((resolve, reject) => ((this.#drawn = resolve), (this.#gaveUp = reject)));

  constructor() {
    super();
    // Rejected for whoever awaits it; never an unhandled rejection for a page that does not (it is told anyway).
    this.ready.catch(() => {});
    // Properties set before the element was defined (a framework rendering first): taken back through the setters.
    const self = this as unknown as Record<string, unknown>;
    for (const p of [...PROPS, 'settings', 'env']) {
      if (Object.hasOwn(this, p)) {
        const v = self[p];
        delete self[p];
        self[p] = v;
      }
    }
  }

  /** The DOM grid (`kernel`, `api`, `update`) while drawn; null otherwise. */
  get grid(): GridInstance<T, RowModel<T>> | null {
    return this.#grid;
  }
  /** Every problem seen so far (each also a `dzg-problems` event), the last 100. */
  get problems(): readonly Problem[] {
    return this.#seen;
  }

  get rows(): GridSettings<T>['rows'] { return this.#props.rows as never; }
  set rows(v: GridSettings<T>['rows']) { this.#set('rows', v); }
  get source(): GridSettings<T>['source'] { return this.#props.source as never; }
  set source(v: GridSettings<T>['source']) { this.#set('source', v); }
  get columns(): GridSettings<T>['columns'] | undefined { return this.#props.columns as never; }
  set columns(v: GridSettings<T>['columns'] | undefined) { this.#set('columns', v); }
  get getRowId(): GridSettings<T>['getRowId'] | undefined { return this.#props.getRowId as never; }
  set getRowId(v: GridSettings<T>['getRowId'] | undefined) { this.#set('getRowId', v); }
  get messages(): GridSettings<T>['messages'] | undefined { return this.#props.messages as never; }
  set messages(v: GridSettings<T>['messages'] | undefined) { this.#set('messages', v); }
  get features(): GridSettings<T>['features'] { return this.#props.features as never; }
  set features(v: GridSettings<T>['features']) { this.#set('features', v); }
  get parts(): GridSettings<T>['parts'] { return this.#props.parts as never; }
  set parts(v: GridSettings<T>['parts']) { this.#set('parts', v); }
  /** CSS variables on the grid's root, by typed keys (needs `theming()`, presentation-settings.md 20); live. */
  get theme(): GridSettings<T>['theme'] { return this.#props.theme as never; }
  set theme(v: GridSettings<T>['theme']) { this.#set('theme', v); }
  /** The application's own icons (needs `theming()`, presentation-settings.md 17); live. */
  get icons(): GridSettings<T>['icons'] { return this.#props.icons as never; }
  set icons(v: GridSettings<T>['icons']) { this.#set('icons', v); }
  /** Every other setting (`selection`, `context`, `rowClass`, `pagination`…), compared key by key; the attributes win over it. */
  get settings(): Partial<GridSettings<T>> { return this.#settings; }
  set settings(v: Partial<GridSettings<T>>) {
    if (this.#refused('settings', v)) return;
    this.#settings = v ?? {};
    this.#apply();
  }
  /** The grid's environment (`GridEnv`), read when the grid is made. */
  get env(): GridEnv { return this.#env; }
  set env(v: GridEnv) { this.#env = v ?? {}; }

  #set(p: Prop, v: unknown): void {
    if (this.#refused(p, v)) return;
    this.#props[p] = v;
    this.#apply();
  }
  /** A property of the wrong kind: told, and the value kept as it was. */
  #refused(p: Prop | 'settings', v: unknown): boolean {
    const k = KIND[p];
    const ok = v == null || (k === 'list' ? Array.isArray(v) : k === 'function' ? typeof v === 'function' : typeof v === 'object');
    if (!ok) this.#tell([problem('invalid-setting', 'error', `property:${p}`)]);
    return !ok;
  }

  /** The settings as the grid takes them: `settings`, then the properties, then the attributes that say something. */
  #compose(): Record<string, unknown> {
    const out: Record<string, unknown> = { ...this.#settings };
    for (const p of PROPS) if (this.#props[p] !== undefined) out[p] = this.#props[p];
    for (const k in this.#attrs) if (this.#attrs[k] !== undefined) out[k] = this.#attrs[k];
    delete out['onEvent'];
    return out;
  }

  /** Made when it can be; once made, what changed is one `update`. */
  #apply(): void {
    if (!this.#wired || !this.isConnected) return;
    if (!this.#grid) return this.#mount();
    const next = this.#compose();
    const patch: Record<string, unknown> = {};
    let any = false;
    for (const k of new Set([...Object.keys(this.#last), ...Object.keys(next)])) if (!Object.is(next[k], this.#last[k])) (patch[k] = next[k]), (any = true);
    this.#last = next;
    if (any) this.update(patch as Partial<GridSettings<T>>);
  }

  /**
   * Asks the data again, then paints: its grid's `api.reload()` (reload.md 5, 1.12.0) — on a server, the page or the
   * window fetched again, filters, sort, page and selection kept; on given rows, nothing to fetch. `grid.api.refresh()`
   * only paints. Nothing before the grid exists.
   */
  reload(): void {
    this.#grid?.api.reload?.();
  }

  /** `grid.update`; nothing before the grid exists. A patch the grid refuses (it throws) is told. */
  update(patch: Partial<GridSettings<T>>): void {
    try {
      this.#grid?.update(patch);
    } catch {
      this.#tell([problem('invalid-setting', 'error', 'update', 'refused')]);
    }
  }

  connectedCallback(): void {
    this.#wired = true;
    // Not a box of its own unless the page says so: laid out as Angular's host. The layout sheet's zero-specificity
    // rule reads the mark (also under a flex or grid parent, which makes an inline element a block, 1.11.0); inline
    // style before that sheet is in the page.
    this.setAttribute('data-dzg-host', '');
    if (!this.style.display && this.ownerDocument.defaultView?.getComputedStyle(this).display === 'inline') this.style.display = 'contents';
    // Changed while out of the page (a framework moving it): the grid kept takes what changed.
    this.#apply();
  }

  disconnectedCallback(): void {
    // Moved within the page, the element is connected again in the same task: kept.
    queueMicrotask(() => {
      if (this.isConnected || !this.#grid) return;
      this.#grid.destroy();
      this.#grid = null;
    });
  }

  attributeChangedCallback(name: string, was: string | null, now: string | null): void {
    if (was === now) return;
    const [key, kind] = ATTRIBUTES[name]!;
    let v: unknown = undefined;
    if (now !== null) {
      if (kind === 'boolean') v = now !== 'false';
      else if (kind === 'number') {
        // An empty or unreadable number is left out and told, as any value it cannot read (`Number('')` is 0).
        if (now.trim() && Number.isFinite(+now)) v = +now;
        else this.#tell([problem('invalid-setting', 'warning', `attribute:${name}`, now)]);
      }
      else if (kind === 'text') v = now;
      else if (now !== '') {
        const ok = kind === 'locale' ? takes(() => Intl.getCanonicalLocales(now)) : kind === 'zone' ? takes(() => new Intl.DateTimeFormat('en', { timeZone: now })) : kind.includes(now);
        if (ok) v = now;
        else this.#tell([problem('invalid-setting', 'warning', `attribute:${name}`, now)]);
      }
    }
    this.#attrs[key] = v;
    this.#apply();
  }

  #mount(): void {
    if (!this.#wired || !this.isConnected || REQUIRED.some((p) => this.#props[p] === undefined)) return;
    // An Angular <dz-grid> already drew here (the same tag name): left alone.
    if (this.querySelector(':scope > .dzg')) {
      this.#tell([problem('invalid-setting', 'error', 'element', 'already-a-grid')]);
      return this.#gaveUp(new Error('dzgrid: <dz-grid> already holds a grid (Angular’s, the same tag name): left alone'));
    }
    const s = this.#compose();
    const early: GridEvent<T>[] = (this.#early = []);
    try {
      this.#grid = createGrid<T, RowModel<T>>(this, { ...(s as unknown as GridSettings<T>), onEvent: (e) => this.#hear(e) }, this.#env);
    } catch (e) {
      this.#early = null;
      this.replaceChildren(...[...this.childNodes].filter((c) => !(c as Element).classList?.contains('dzg')));
      this.#tell([problem('invalid-setting', 'error', 'element', 'refused')]);
      return this.#gaveUp(e);
    }
    this.#early = null;
    this.#last = s;
    const grid = this.#grid;
    // The creation's events, then ready: a microtask later, in order.
    queueMicrotask(() => {
      if (this.#grid !== grid) return;
      for (const e of early) this.#fire(e);
      this.dispatchEvent(new CustomEvent('dzg-ready', { detail: { grid }, bubbles: true, composed: true }));
      this.#drawn();
    });
  }

  #hear(e: GridEvent<T>): void {
    if (this.#early) this.#early.push(e);
    else this.#fire(e);
  }

  /** One grid event on the element, then the application's own `settings.onEvent`. */
  #fire(e: GridEvent<T>): void {
    if (e.type === 'problems') this.#keep(e.problems);
    this.dispatchEvent(new CustomEvent(eventName(e.type), { detail: e, bubbles: true, composed: true }));
    this.#settings.onEvent?.(e);
  }

  #keep(ps: readonly Problem[]): void {
    this.#seen.push(...ps);
    if (this.#seen.length > KEEP) this.#seen.splice(0, this.#seen.length - KEEP);
  }

  /** The element's own problems: `dzg-problems`, the grid's shape, a microtask later (a parsed element has no listener yet). */
  #tell(problems: readonly Problem[]): void {
    this.#keep(problems);
    queueMicrotask(() => this.dispatchEvent(new CustomEvent('dzg-problems', { detail: { type: 'problems', source: 'host', problems }, bubbles: true, composed: true })));
  }
}

/** Defines the element under `name` (once; `dz-grid` by default). Does nothing without `customElements` (a server). */
export function defineDzGrid(name = 'dz-grid'): void {
  if (typeof customElements === 'undefined' || customElements.get(name)) return;
  customElements.define(name, class extends DzGridElement {});
}
