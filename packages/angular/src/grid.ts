import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  afterNextRender,
  Injector,
  NgZone,
  PLATFORM_ID,
  computed,
  contentChildren,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  type AfterContentInit,
  type OutputEmitterRef,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ColumnOrGroup, FilterModel, Query, GridEvent, GridKernel, Problem, RowIdInput, RowKey, RowModel, SelectionState } from '@dzgrid/core';
import { canonical, emit, isDataKey } from '@dzgrid/core/internal';
import { detailConflicts } from '@dzgrid/core/detail';
import { createGrid, type GridFeature, type GridInstance, type GridMessages, type GridSettings, type SlotContext, type SlotPart } from '@dzgrid/dom';
import { DzgController } from './controller';
import { DzgPart } from './dzg-part';
import { MARKS, boundPart, type Bindings } from './part-bind';
import { DZG_DEFAULTS, DZG_ENV, DZG_MESSAGES, DZG_PARTS } from './providers';
import { shadowedParts } from './shadow';

type S<T> = GridSettings<T>;
type Ev<T, K extends GridEvent<T>['type']> = Extract<GridEvent<T>, { type: K }>;

/** The settings read from the inputs, in this order; the defaults' keys fall back to `provideDzGrid`. */
const KEYS = [
  'rows', 'source', 'columns', 'getRowId', 'locale', 'timeZone', 'numerals', 'direction', 'density', 'overlay', 'label', 'tooltips', 'overscan',
  'searchWarmup', 'selection', 'context', 'fullWidth', 'operations', 'pagination', 'filterKinds', 'clock', 'injectStyles', 'nonce', 'features',
] as const;
/** Events with an output of their own name. */
const OUTS = ['cellClicked', 'rowClicked', 'cellAction', 'partAction', 'fetchFailed', 'rowExpanded'];

/** What `membershipOf` reads of a query with no filter and no search. */
const NONE = { filter: {}, quick: '' } as Query;
const sameSet = (a: ReadonlySet<unknown>, b: ReadonlySet<unknown>): boolean => a.size === b.size && [...a].every((k) => b.has(k));
const sameSelection = (a: SelectionState, b: SelectionState): boolean => a.mode === b.mode && sameSet(a.keys, b.keys);

/**
 * `<dz-grid>`: the grid of `@dzgrid/dom` in an Angular template (docs/behaviors/angular-parts.md).
 * Inputs map to `createGrid`'s settings (live ones through `update()`, by identity), events to
 * outputs, parts to components and templates. Zoneless first; with zone.js the grid runs outside
 * Angular's zone and its outputs inside it. On a server it renders nothing.
 */
@Component({
  selector: 'dz-grid',
  exportAs: 'dzGrid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DzgController],
  template: '',
})
export class DzGrid<T> implements AfterContentInit {
  readonly rows = input<Iterable<T>>();
  readonly source = input<S<T>['source']>();
  readonly columns = input.required<readonly ColumnOrGroup<T>[]>();
  readonly getRowId = input.required<(row: T) => RowIdInput>();
  /** Required here or through `provideDzGrid({ messages })`. */
  readonly messages = input<GridMessages>();
  readonly locale = input<string>();
  readonly timeZone = input<string>();
  readonly numerals = input<S<T>['numerals']>();
  readonly direction = input<S<T>['direction']>();
  readonly density = input<S<T>['density']>();
  readonly overlay = input<S<T>['overlay']>();
  readonly label = input<string>();
  readonly tooltips = input<S<T>['tooltips']>();
  readonly overscan = input<S<T>['overscan']>();
  readonly searchWarmup = input<S<T>['searchWarmup']>();
  readonly selection = input<S<T>['selection']>();
  readonly context = input<unknown>();
  readonly fullWidth = input<S<T>['fullWidth']>();
  readonly parts = input<Readonly<Record<string, SlotPart>>>();
  /**
   * In a detail panel's component or template, the panel's context (`[dzgNested]="cell()"`, read when
   * the grid is made): Escape this grid leaves unused goes back to the panel's cell, one level only (not
   * while composing, nor when it only hid this grid's tooltip); past three levels, `detail.depth` told.
   */
  readonly dzgNested = input<SlotContext['detail']>();
  /** Fixed: taken when the grid is made; a later change is `unsupported-live-change`. */
  readonly operations = input<S<T>['operations']>();
  readonly pagination = input<S<T>['pagination']>();
  readonly filterKinds = input<S<T>['filterKinds']>();
  readonly clock = input<S<T>['clock']>();
  readonly injectStyles = input<boolean>();
  readonly nonce = input<string>();
  readonly features = input<S<T>['features']>();
  /**
   * The floating filter row shown or hidden live (`filters().floating`, Phase 4 step 12): unset, the feature's
   * own state; each new value set, never written back over a user's toggle made since (no echo). One-way: the
   * state comes back through `filters().floating.get()`.
   */
  readonly floatingFilters = input<boolean>();

  /** Unset, the grid owns them; set, written as the host; the user's changes come back. */
  readonly quick = model<string>();
  readonly filter = model<FilterModel>();
  readonly selected = model<SelectionState>();
  /** The rows open (a tree's parents, details' masters): the host's set written, the user's and the data's changes back. */
  readonly expanded = model<ReadonlySet<RowKey>>();

  readonly gridEvent = output<GridEvent<T>>();
  readonly cellClicked = output<Ev<T, 'cellClicked'>>();
  readonly rowClicked = output<Ev<T, 'rowClicked'>>();
  readonly cellAction = output<Ev<T, 'cellAction'>>();
  readonly partAction = output<Ev<T, 'partAction'>>();
  readonly fetchFailed = output<Ev<T, 'fetchFailed'>>();
  readonly rowExpanded = output<Ev<T, 'rowExpanded'>>();
  readonly problems = output<readonly Problem[]>();
  readonly gridReady = output<DzgController<T>>();

  readonly controller: DzgController<T> = inject(DzgController);
  private readonly _defaults = inject(DZG_DEFAULTS) as Record<string, unknown>;
  private readonly _provided = inject(DZG_PARTS);
  private readonly _messages = inject(DZG_MESSAGES);
  private readonly _env = inject(DZG_ENV);
  private readonly _zone = inject(NgZone);
  private readonly _el: HTMLElement = inject(ElementRef).nativeElement;
  private readonly _browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _templates = contentChildren(DzgPart);
  private readonly _grid = signal<GridInstance<T, RowModel<T>> | null>(null);
  /** The kernel, from its creation (before the first paint) until the grid is gone. */
  private _k: GridKernel<T, RowModel<T>> | null = null;
  private readonly _b: Bindings = { env: inject(EnvironmentInjector), app: inject(ApplicationRef), injector: inject(Injector), kernel: () => this._k };
  /** Each marker or template bound to this grid once: the same part while it stays. */
  private readonly _bound = new WeakMap<object, SlotPart>();
  private readonly _told = new Set<string>();
  private _last: Record<string, unknown> = {};
  private _gone = false;
  /** The events of the grid's making, told after the first render: written during the host's check, NG0100. */
  private _early: GridEvent<T>[] | null = [];
  /** The model's last set, the host's or the grid's copy: another one is a host write. */
  private _seen?: ReadonlySet<RowKey>;
  /** Keys the host named whose rows the grid did not hold: they open when their rows arrive, until its next write. */
  private _pend = new Set<RowKey>();
  /** Rows closed by the user or the API since the host's write: a pending key below one is dropped. */
  private _closed = new Set<RowKey>();

  /** The registry: the provider's, `[parts]`, then the templates; Angular entries bound to this grid. */
  private readonly _registry = computed(() => {
    const all: Record<string, SlotPart> = {};
    const put = (n: string, e: SlotPart, key: object = e): void => {
      const m = MARKS.get(e);
      let b = m && this._bound.get(key);
      if (m && (!b || b.slot !== e.slot)) this._bound.set(key, (b = boundPart(this._b, e.slot, m)));
      all[n] = b ?? e;
    };
    for (const r of [this._provided, this.parts() ?? {}]) for (const n in r) put(n, r[n]!);
    for (const t of this._templates()) {
      const e = { slot: t.slot(), part: null! } as SlotPart;
      MARKS.set(e, t.template);
      put(t.dzgPart(), e, t);
    }
    return all;
  });

  private readonly _settings = computed(() => {
    const s: Record<string, unknown> = {};
    for (const k of KEYS) s[k] = this[k]() ?? this._defaults[k];
    // Unset after creation with no provider: the bundle in force stays (the grid needs one).
    s['messages'] = this.messages() ?? this._messages ?? this._last['messages'];
    s['parts'] = this._registry();
    return s as unknown as S<T>;
  });

  constructor() {
    if (this._browser) this._el.style.display = 'contents';
    effect(() => {
      const g = this._grid();
      if (!g) return;
      const s = this._settings() as unknown as Record<string, unknown>;
      untracked(() => {
        const patch: Record<string, unknown> = {};
        let any = false;
        for (const k in s) if (!Object.is(s[k], this._last[k])) (patch[k] = s[k]), (any = true);
        this._last = s;
        if (any) this._zone.runOutsideAngular(() => g.update(patch as Partial<S<T>>));
        this._tell();
      });
    });
    effect(() => (this.quick(), this.filter(), this.selected(), this.expanded(), this._write(this.controller.kernel())));
    effect(() => {
      const on = this.floatingFilters();
      if (on !== undefined) for (const f of (this.features() ?? this._defaults['features'] ?? []) as { floating?: { set(on: boolean): void } }[]) f.floating?.set(on);
    });
    // After the first render (never on a server): the grid's events heard so far; with no model, what
    // it opened by itself at creation (a tree's `initial`) comes back.
    afterNextRender(() => {
      const early = this._early!;
      this._early = null;
      for (const e of early) this._hear(e);
      if (this._k && !this.expanded()) this._open(this._k);
    });
    inject(DestroyRef).onDestroy(() => {
      this._gone = true;
      untracked(this._grid)?.destroy();
      this._grid.set(null);
      this._k = null;
      this.controller._attach(null);
    });
  }

  /** After the content: the `dzgPart` templates are known, the first paint already uses them. */
  ngAfterContentInit(): void {
    if (!this._browser) return;
    const s = this._settings();
    if (!s.messages) throw new Error('dz-grid: messages are required ([messages] or provideDzGrid({ messages }))');
    this._last = s as unknown as Record<string, unknown>;
    // A feature first, set up before the first paint: the parts that paint mounts can emit, and
    // see the controller ready (its kernel; the API calls wait for createGrid to return).
    const early: GridFeature = { id: 'dzg-kernel', setup: (c) => (this.controller._attach((this._k = c.kernel as never)), { destroy() {} }) };
    const g = this._zone.runOutsideAngular(() =>
      createGrid<T, RowModel<T>>(this._el, { ...s, features: [early, ...(s.features ?? [])], onEvent: (e) => this._hear(e) }, this._env),
    );
    if (this.dzgNested()) this._nest(g.kernel);
    this.controller._attach(g.kernel, g, s.features);
    this._grid.set(g);
    this._write(g.kernel);
    this._tell();
    this.gridReady.emit(this.controller);
  }

  /**
   * The host's models written to the grid as the host, unless the grid already holds them (no
   * echo). Each read after the write before it: a filter that clears the selection has set the
   * model by then, so the selection held before is not written back.
   */
  private _write(k: GridKernel<T, RowModel<T>> | null): void {
    if (!k) return;
    untracked(() =>
      this._zone.runOutsideAngular(() => {
        const quick = this.quick();
        if (quick !== undefined && quick !== k.query.quick) k.dispatch({ type: 'quick.set', text: quick }, 'host');
        const filter = this.filter();
        if (filter && canonical(filter) !== canonical(k.query.filter)) k.dispatch({ type: 'filter.set', filter }, 'host');
        const selected = this.selected();
        if (selected && !sameSelection(selected, k.selection)) k.dispatch({ type: 'selection.set', selection: selected }, 'host');
        this._shut(k);
      }),
    );
  }

  /**
   * The `expanded` model written: what the grid holds open and the set does not, closed; then what it
   * adds and the pending keys, opened, but for rows the grid does not hold (refused, they would stop the
   * rest: pending, a data change writes again) and those below a row closed since the host's write. An
   * equal set has nothing to close or open: nothing is written (the echo guard). Read untracked (from
   * `_write`, or an event).
   */
  private _shut(k: GridKernel<T, RowModel<T>>): void {
    const open = this.expanded();
    const now = k.expansion;
    if (!open) return;
    // A host write: each key pending until the grid holds its row.
    if (open !== this._seen) (this._seen = open), (this._pend = new Set(open)), this._closed.clear();
    // A pending key whose row the grid holds: applied, unless a row above it was closed since the write.
    const up = (x: RowKey | null | undefined): boolean => !!x && (this._closed.has(x) || up(k.rows.displayed.parentOf?.(x)));
    const add = [...open, ...this._pend].filter((x) => (!isDataKey(x) || k.rows.keeps(x)) && (!this._pend.delete(x) || !up(x)) && !now.has(x));
    for (const [rows, expanded] of [[[...now].filter((x) => !open.has(x)), false], [add, true]] as const) if (rows.length) k.dispatch({ type: 'rows.expand', rows, expanded }, 'host');
  }

  /** Inside a detail panel (`dzgNested`): the depth told, Escape back to the panel; on the host element, outside the zone. */
  private _nest(k: GridKernel<T, RowModel<T>>): void {
    const el = this._el;
    const told = detailConflicts({ depth: this.dzgNested()!.depth });
    if (told.length) emit(k, { type: 'problems', source: 'host', problems: told });
    // The tooltip's state before the grid's own keydown (which hides it, and leaves the key unused).
    let tip = false;
    this._zone.runOutsideAngular(() => {
      el.addEventListener('keydown', () => void (tip = el.querySelector<HTMLElement>(':scope > .dzg > .dzg-tooltip')?.hidden === false), true);
      el.addEventListener('keydown', (e) => {
        // On this grid's own cells (a grid deeper inside took its own Escape first).
        if (e.key === 'Escape' && !e.defaultPrevented && !e.isComposing && !tip && (e.target as Element).closest('.dzg')?.parentElement === el) e.preventDefault(), this.dzgNested()?.leave?.();
      });
    });
  }

  /**
   * The `expanded` model follows the grid's open rows (a copy: the grid changes its own in place); not
   * under a tree's filter, whose layer takes every toggle, the host's too (tree-filter.md): the model
   * stays the set outside it, written again when the query changes.
   */
  private _open(k: GridKernel<T, RowModel<T>>): void {
    const r = k.rows;
    if (!(r.displayed.levelAt && r.membershipOf(k.query) !== r.membershipOf(NONE)) && !sameSet(this.expanded() ?? new Set(), k.expansion))
      this.expanded.set((this._seen = new Set(k.expansion)));
  }

  /** `part-shadowed` for the names a later layer took, once per name for this grid. */
  private _tell(): void {
    const k = this._k;
    const names = (r?: Readonly<Record<string, unknown>>) => Object.keys(r ?? {});
    const problems = shadowedParts(
      [
        { from: 'feature', names: (this.features() ?? []).flatMap((f) => names(f.parts)) },
        { from: 'provider', names: names(this._provided) },
        { from: 'parts', names: names(this.parts()) },
        { from: 'template', names: this._templates().map((t) => t.dzgPart()) },
      ],
      this._told,
    );
    if (k && problems.length) emit(k, { type: 'problems', source: 'host', problems });
  }

  private _hear(e: GridEvent<T>): void {
    if (this._gone) return;
    if (this._early) return void this._early.push(e);
    this._zone.run(() => {
      this.gridEvent.emit(e);
      if (e.type === 'problems') this.problems.emit(e.problems);
      else if (OUTS.includes(e.type)) (this[e.type as 'cellClicked'] as OutputEmitterRef<unknown>).emit(e);
      if (e.type === 'selectionChanged') {
        // A host-caused clear (a narrower [selection] mode, a filter written by the host) too, when the
        // model holds something else; never an echo of the host's own write.
        const m = this.selected();
        if (e.source !== 'host' || (m && !sameSelection(m, e.selection))) this.selected.set(e.selection);
      }
      // Rows opened or closed by anyone but the host; a data change (rows arrived or gone, a tree's
      // `initial`): the model written again first (rows it names that just arrived), then followed.
      // A query, an order, a page: written again too (a filter's layer gone, the host's set held there).
      const k = this._k;
      if (k && e.type === 'modelUpdated' && e.kind !== 'expand') this._zone.runOutsideAngular(() => this._shut(k)), this._open(k);
      if (e.source === 'host') return;
      if (k && e.type === 'rowExpanded') {
        if (!e.expanded) for (const x of e.rows) this._closed.add(x);
        this._open(k);
      }
      if (e.type === 'quickChanged') this.quick.set(e.text);
      if (e.type === 'filterChanged') this.filter.set(e.filter);
    });
  }
}
