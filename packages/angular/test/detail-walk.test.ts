// A random walk on detail panels as Angular components (coverage review of phase 4 step 11): scroll,
// host writes, user toggles, a search on and off, renames and removals, interleaved; after each step
// mounts − destroys = the panels in the page, every live panel shows its own master's current data, a
// rename updates in place (no remount), and emit reaches (partAction) with slot 'detail'.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { dataKey, type ColumnOrGroup, type GridEvent, type GridKernel, type RowKey } from '@dzgrid/core';
import type { GridFeature, SlotPart } from '@dzgrid/dom';
import { detail } from '@dzgrid/dom/detail';
import { EN_DETAIL } from '@dzgrid/dom/locales/en-detail';
import { DzGrid, componentPart } from '@dzgrid/angular';
import { MESSAGES, fakeEnv, scroller } from './support';
import { PanelProbe, panels } from './tree-support';

beforeEach(() => panels.reset());
afterEach(() => {
  document.body.innerHTML = '';
  TestBed.resetTestingModule();
});

type M = { id: string; name: string };
const N = 60;
const k = (id: string): RowKey => dataKey(id)!;

@Component({
  selector: 't-dwalk',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows()" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" [parts]="parts"
    [expanded]="open()" (expandedChange)="open.set($event)" (partAction)="actions.push($event)" />`,
})
class Host {
  readonly rows = signal<M[]>(Array.from({ length: N }, (_, i) => ({ id: `m${i}`, name: `master ${i}` })));
  readonly cols: ColumnOrGroup<M>[] = [{ id: 'name', header: 'Name' }];
  readonly id = (r: M) => r.id;
  readonly messages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_DETAIL.text } };
  readonly features: GridFeature[] = [detail<M>({ part: 'panel', height: 90 })];
  readonly parts: Record<string, SlotPart> = { panel: componentPart('detail', PanelProbe) };
  readonly open = signal<ReadonlySet<RowKey> | undefined>(undefined);
  readonly actions: Extract<GridEvent<M>, { type: 'partAction' }>[] = [];
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function detailWalk(seed: number, steps: number): string | null {
  const r = rng(seed);
  const env = fakeEnv({ block: 400 });
  TestBed.configureTestingModule({ providers: [env.provider] });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  fixture.detectChanges();
  const grid = fixture.debugElement.query(By.directive(DzGrid)).componentInstance as DzGrid<M>;
  const kernel = grid.controller.kernel()! as GridKernel<M>;
  const el = fixture.nativeElement as HTMLElement;
  const scroll = scroller(fixture, env.box);
  const live = () => el.querySelectorAll('t-panel').length;
  /** The instances not yet destroyed (destroy is counted by ngOnDestroy; we track by order). */
  const alive = new Set<PanelProbe>();
  const gone = new Set<PanelProbe>();
  const proto = PanelProbe.prototype as unknown as { ngOnDestroy(): void };
  const was = proto.ngOnDestroy;
  proto.ngOnDestroy = function (this: PanelProbe) {
    gone.add(this);
    was.call(this);
  };
  const trail: string[] = [];
  try {
    for (let s = 0; s < steps; s++) {
      const op = r();
      const madeBefore = panels.made;
      const liveBefore = panels.seen.filter((p) => !gone.has(p));
      const scrollBefore = env.box.scrollTop;
      const rowsDom = () => { const x = [...el.querySelectorAll('.dzg-layer .dzg-row')].map((e) => +(e.getAttribute('aria-rowindex') ?? 0)).filter((n) => n > 0); return `${x.length} rows ${Math.min(...x)}-${Math.max(...x)} open ${kernel.expansion.size} displayed ${kernel.rows.displayed.count}`; };
      const domBefore = rowsDom();
      let renamed = false;
      if (op < 0.2) {
        const top = Math.floor(r() * N * 60);
        trail.push(`scroll ${top}`);
        scroll(top);
      } else if (op < 0.4) {
        const S = new Set<RowKey>();
        for (let i = 0; i < N; i++) if (r() < 0.3) S.add(k(`m${i}`));
        trail.push(`host ${S.size}`);
        host.open.set(S);
      } else if (op < 0.55) {
        const x = `m${Math.floor(r() * N)}`;
        const to = r() < 0.6;
        trail.push(`user ${to} ${x}`);
        kernel.dispatch({ type: 'rows.expand', rows: [k(x)], expanded: to }, 'user');
      } else if (op < 0.68) {
        const text = r() < 0.5 ? '' : `master ${Math.floor(r() * 6)}`;
        trail.push(`search '${text}'`);
        kernel.dispatch({ type: 'quick.set', text }, 'api');
      } else if (op < 0.8) {
        // Rename every master (new objects, same ids): open panels update in place.
        const tag = `#${String.fromCharCode(97 + (s % 26))}${String.fromCharCode(97 + Math.floor(s / 26))}`;
        trail.push(`rename ${tag}`);
        host.rows.set(host.rows().map((m) => ({ ...m, name: m.name.replace(/ #[a-z]+$/, '') + ' ' + tag })));
        renamed = true;
      } else if (op < 0.9) {
        const x = `m${Math.floor(r() * N)}`;
        const has = host.rows().some((m) => m.id === x);
        trail.push(`${has ? 'remove' : 'add'} ${x}`);
        if (has) host.rows.set(host.rows().filter((m) => m.id !== x));
        else host.rows.set([...host.rows(), { id: x, name: `master ${x.slice(1)}` }]);
      } else {
        // A click on a live panel's button: partAction with slot 'detail' and the master.
        const btn = el.querySelector<HTMLButtonElement>('t-panel .pb');
        trail.push(`click ${btn ? 'panel' : 'none'}`);
        if (btn) {
          const before = host.actions.length;
          btn.click();
          const a = host.actions.slice(before);
          const name = btn.closest('t-panel')!.querySelector('.pn')!.textContent;
          const row = host.rows().find((m) => m.name === name);
          if (a.length !== 1 || a[0]!.slot !== 'detail' || a[0]!.column !== null || a[0]!.name !== 'open' || a[0]!.source !== 'user' || a[0]!.detail !== k(row!.id))
            return `seed ${seed} step ${s}: partAction ${JSON.stringify(a)}`;
        }
      }
      fixture.detectChanges();
      const where = `seed ${seed} step ${s}: ${trail.slice(-6).join(' ; ')}`;
      if (panels.made - panels.gone !== live()) return `${where}: made ${panels.made} − gone ${panels.gone} ≠ live ${live()}`;
      const living = panels.seen.filter((p) => !gone.has(p));
      if (living.length !== live()) return `${where}: ${living.length} instances alive, ${live()} in the page`;
      const open = kernel.expansion;
      for (const p of living) {
        const c = p.cell();
        const row = host.rows().find((m) => k(m.id) === c.master);
        if (!row) return `${where}: a panel alive for a removed master ${String(c.master)}`;
        if (!open.has(c.master)) return `${where}: a panel alive for a closed master ${String(c.master)}`;
        if (c.row !== row) return `${where}: panel of ${String(c.master)} holds stale row data`;
      }
      // The text shown matches the master's current name.
      const shown = [...el.querySelectorAll('t-panel .pn')].map((x) => x.textContent!).sort();
      const want = living.map((p) => (p.cell().row as M).name).sort();
      if (JSON.stringify(shown) !== JSON.stringify(want)) return `${where}: shown ${shown.slice(0, 3)} vs ${want.slice(0, 3)}`;
      // A rename keeps every panel that stays in the page: no remount.
      if (renamed) {
        // (The window may widen or narrow on a data change, so panels may come and go; none may be remade.)
        const fresh = new Set(panels.seen.slice(madeBefore).map((p) => p.cell().master));
        const lost = liveBefore.filter((p) => gone.has(p) && fresh.has(p.cell().master)).map((p) => String(p.cell().master));
        const twice = living.length !== new Set(living.map((p) => p.cell().master)).size;
        const domAfter = rowsDom();
        scroll(env.box.scrollTop);
        fixture.detectChanges();
        if (lost.length || twice) return `${where}: rename remade [${lost}] made [${[...fresh].map(String)}] twice ${twice} (scrollTop ${scrollBefore} → ${env.box.scrollTop}, live ${liveBefore.length} → ${living.length}; dom ${domBefore} → ${domAfter} → after a scroll event ${rowsDom()})`;
      }
    }
    fixture.destroy();
    if (panels.gone !== panels.made) return `seed ${seed}: after the grid's end made ${panels.made}, gone ${panels.gone}`;
    return null;
  } finally {
    proto.ngOnDestroy = was;
  }
}

describe('detail panels: random walk', () => {
  for (const seed of [101, 102, 103, 104, 105, 106, 107, 108, 109, 110]) {
    it(`seed ${seed}`, () => {
      expect(detailWalk(seed, 60)).toBeNull();
    });
  }
});
