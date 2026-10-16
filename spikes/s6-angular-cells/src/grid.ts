/**
 * A deliberately small recycled grid: one scroller, a fixed pool of row
 * elements, cells that keep their element for life. It stands in for
 * @dzgrid/dom so the spike measures the cell renderers, not a grid.
 *
 * Row index r always lives in slot r % pool, so a row that stays in view is
 * never touched; only rows that enter are re-bound — what a real recycler does.
 * Nothing in this file knows about Angular.
 */

/** The contract a column renderer fulfils (§3.8 didMount/didUpdate/willUnmount). */
export interface CellRenderer<R> {
  /** The cell element exists; nothing is shown yet. */
  mount(cell: HTMLElement): void;
  /** A (new) row enters this cell. */
  bind(row: R, value: string, rowIndex: number): void;
  /** The cell goes away for good. */
  destroy(): void;
}

export interface GridColumn<R> {
  readonly key: string;
  readonly width: number;
  readonly renderer: () => CellRenderer<R>;
}

export interface GridOptions<R> {
  readonly rows: readonly R[];
  readonly columns: readonly GridColumn<R>[];
  readonly value: (row: R, key: string) => string;
  readonly rowHeight: number;
  readonly visibleRows: number;
}

export interface MiniGrid {
  /** Scrolls so `first` is the top row and re-binds the rows that entered. Returns how many rows were re-bound. */
  scrollTo(first: number): number;
  readonly viewport: HTMLElement;
  destroy(): void;
}

interface Slot<R> {
  el: HTMLElement;
  rowIndex: number;
  cells: CellRenderer<R>[];
}

export function createMiniGrid<R>(host: HTMLElement, o: GridOptions<R>): MiniGrid {
  const doc = host.ownerDocument;
  const viewport = doc.createElement('div');
  viewport.className = 'vp';
  viewport.style.blockSize = `${o.visibleRows * o.rowHeight}px`;
  const content = doc.createElement('div');
  content.className = 'rows';
  content.style.blockSize = `${o.rows.length * o.rowHeight}px`;
  viewport.append(content);

  const slots: Slot<R>[] = [];
  for (let s = 0; s < o.visibleRows; s++) {
    const el = doc.createElement('div');
    el.className = 'row';
    el.setAttribute('role', 'row');
    const cells: CellRenderer<R>[] = [];
    for (const c of o.columns) {
      const cell = doc.createElement('div');
      cell.className = 'cell';
      cell.setAttribute('role', 'gridcell');
      cell.style.inlineSize = `${c.width}px`;
      cell.style.blockSize = `${o.rowHeight}px`;
      const r = c.renderer();
      r.mount(cell);
      cells.push(r);
      el.append(cell);
    }
    content.append(el);
    slots.push({ el, rowIndex: -1, cells });
  }
  host.append(viewport);

  const n = o.visibleRows;
  const scrollTo = (first: number): number => {
    const max = Math.max(0, o.rows.length - n);
    first = Math.max(0, Math.min(max, first));
    let rebound = 0;
    for (let r = first; r < first + n; r++) {
      const slot = slots[r % n]!;
      if (slot.rowIndex === r) continue;
      slot.rowIndex = r;
      slot.el.style.transform = `translateY(${r * o.rowHeight}px)`;
      slot.el.setAttribute('aria-rowindex', String(r + 1));
      const row = o.rows[r]!;
      for (let c = 0; c < o.columns.length; c++) slot.cells[c]!.bind(row, o.value(row, o.columns[c]!.key), r);
      rebound++;
    }
    viewport.scrollTop = first * o.rowHeight;
    return rebound;
  };

  return {
    scrollTo,
    viewport,
    destroy() {
      for (const s of slots) for (const c of s.cells) c.destroy();
      viewport.remove();
    },
  };
}
