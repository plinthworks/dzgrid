import type { GridKernel, Problem } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { GridFeature } from '../features.js';
import type { ImportMessageKey } from '../part-texts.js';

/** The texts `fileImport()` needs, from `@dzgrid/dom/locales/<lang>-import`. */
export const IMPORT_KEYS = ['import.drop', 'import.read', 'import.failed'] as const satisfies readonly ImportMessageKey[];

export type ImportFormat = 'csv' | 'xlsx';

/** The file a set of rows came from: its name, its format as read (null: neither). */
export interface ImportedFile {
  readonly name: string;
  readonly format: ImportFormat | null;
}

export interface FileImportOptions {
  /** The formats taken (both by default); another is refused, `import-file` detail `type`. */
  readonly accept?: readonly ImportFormat[];
  /**
   * The rows read, once per file: one object per line after the header, each value at its column's `field` (or id) as its
   * codec reads it; `problems` what was refused (paths and codes, never a value). The application decides what to do.
   */
  readonly onRows: (rows: Record<string, unknown>[], problems: readonly Problem[], file: ImportedFile) => void;
  /** `false`: no drop zone (the button only). */
  readonly drop?: boolean;
}

export interface FileImportApi {
  /** The application's button opens the file picker (its click, so Enter and Space too); the function unbinds it. */
  bind(button: HTMLElement): () => void;
  /** Opens the browser's file picker. */
  open(): void;
  /** Reads a file the application got itself; settles once `onRows` was called. */
  read(file: Blob & { readonly name?: string }): Promise<void>;
}

export interface FileImportFeature extends GridFeature {
  /** The import of a grid this feature is set up on; null before its setup and after it is destroyed. */
  api(grid: { readonly kernel: GridKernel<any, any> }): FileImportApi | null;
}

const TYPES: Readonly<Record<ImportFormat, string>> = { csv: '.csv,text/csv', xlsx: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

/**
 * The drop zone's layout, injected (no colour of its own: the theme's header background and focus ring — the header's text on it, a pair the theme checks — logical sides,
 * zero specificity, in the base's layer): over the grid while a file is dragged on it.
 */
const CSS =
  '@layer dzgrid.layout{' +
  ':where(.dzg-drop){position:absolute;inset:0;z-index:6;display:none;align-items:center;justify-content:center;padding:1rem;text-align:center;font-weight:600;pointer-events:none;' +
  'border:2px dashed var(--dzg-focus-ring,var(--tz-accent,currentColor));background:var(--dzg-header-bg,var(--tz-bg-raised,Canvas))}:where([data-dzg-drop]){position:relative}:where([data-dzg-drop]>.dzg-drop){display:flex}' +
  '}';

/**
 * `fileImport({ accept, onRows, drop })` (docs/behaviors/file-import.md): a CSV or `.xlsx` file dropped on the grid, or
 * picked through the application's button (`api(grid).bind(button)`), read in the browser — the first non-empty line
 * the header matched to the columns, each cell through its column's codec — and handed to `onRows`; the grid's rows
 * untouched. Said when read.
 *
 * ```ts
 * import { fileImport } from '@dzgrid/dom/import';
 * import { FR_IMPORT } from '@dzgrid/dom/locales/fr-import';
 * const imp = fileImport({ onRows: (rows) => grid.update({ rows: [...current, ...rows.map(withId)] }) });
 * const grid = createGrid(host, { …, features: [imp] });
 * imp.api(grid)!.bind(document.querySelector('#import')!);
 * ```
 */
export function fileImport(o: FileImportOptions): FileImportFeature {
  const apis = new WeakMap<object, FileImportApi>();
  return {
    id: 'import',
    api: (grid) => apis.get(grid.kernel) ?? null,
    setup(x) {
      const g = x as GridContext<unknown>;
      const missing = IMPORT_KEYS.filter((k) => g.settings.messages.text[k] === undefined);
      if (missing.length) throw new TypeError(`fileImport: missing ${missing.join(', ')}`);
      const { el, doc, kernel } = g;
      const accept = o.accept ?? ['csv', 'xlsx'];
      let chunk: Promise<typeof import('./read/index.js')> | undefined;

      const read = async (file: Blob & { readonly name?: string }, many = false): Promise<void> => {
        const r = await (await (chunk ??= import('./read/index.js'))).readFile(new Uint8Array(await file.arrayBuffer()), accept, kernel.columns, g.ctx, (g.win ?? globalThis) as typeof globalThis);
        if (many) r.problems.unshift({ code: 'import-file', severity: 'warning', path: 'file', detail: 'many' });
        if (g.scope.isDisposed) return;
        g.live.announce(r.rows.length ? g.msg('import.read', { rows: r.rows.length, problems: r.problems.length }) : g.msg('import.failed'));
        try {
          o.onRows(r.rows, r.problems, { name: file.name ?? '', format: r.format });
        } catch (err) {
          g.report(err);
        }
      };
      const open = (): void => {
        const i = doc.createElement('input');
        i.type = 'file';
        i.accept = accept.map((f) => TYPES[f]).join(',');
        i.addEventListener('change', () => {
          const f = i.files;
          if (f?.length) void read(f[0]!, f.length > 1);
        });
        i.click();
      };

      if (o.drop !== false) {
        const root = el.root.getRootNode() as Document | ShadowRoot;
        if (g.settings.injectStyles !== false && !root.querySelector?.('style[data-dzgrid-import]')) {
          const s = doc.createElement('style');
          s.setAttribute('data-dzgrid-import', '');
          if (g.settings.nonce) s.setAttribute('nonce', g.settings.nonce);
          s.textContent = CSS;
          ('head' in root ? root.head : root).append(s);
        }
        const zone = doc.createElement('div');
        zone.className = 'dzg-drop';
        zone.setAttribute('aria-hidden', 'true');
        el.root.append(zone);
        g.scope.add(() => zone.remove());
        let depth = 0;
        const show = (on: boolean): void => {
          if (on === el.root.hasAttribute('data-dzg-drop')) return;
          if (!on) return el.root.removeAttribute('data-dzg-drop');
          zone.textContent = g.msg('import.drop');
          el.root.setAttribute('data-dzg-drop', '');
          g.live.announce(zone.textContent);
        };
        // Files only: a text or a row being dragged is not ours.
        const files = (e: DragEvent): boolean => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
        g.scope.on(el.root, 'dragenter', (e) => files(e) && (e.preventDefault(), depth++, show(true)));
        g.scope.on(el.root, 'dragover', (e) => files(e) && (e.preventDefault(), (e.dataTransfer!.dropEffect = 'copy')));
        g.scope.on(el.root, 'dragleave', (e) => files(e) && --depth <= 0 && ((depth = 0), show(false)));
        g.scope.on(el.root, 'drop', (e) => {
          if (!files(e)) return;
          e.preventDefault();
          depth = 0;
          show(false);
          const f = e.dataTransfer!.files;
          if (f.length) void read(f[0]!, f.length > 1);
        });
      }

      apis.set(kernel, {
        bind(button) {
          const on = (): void => open();
          button.addEventListener('click', on);
          return () => button.removeEventListener('click', on);
        },
        open,
        read: (f) => read(f),
      });
      return {
        destroy() {
          apis.delete(kernel);
          el.root.removeAttribute('data-dzg-drop');
        },
      };
    },
  };
}
