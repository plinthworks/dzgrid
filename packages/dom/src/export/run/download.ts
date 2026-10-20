import type { GridContext } from '../../context.js';

/**
 * Saves a file the browser's way: a detached `<a download>` in the page, clicked once and removed; a
 * Blob through an object URL revoked a minute later (the download has started by then).
 */
export function download(g: GridContext<unknown>, f: { readonly blob?: Blob; readonly url?: string; readonly fileName: string }): void {
  const w = (g.win ?? globalThis) as Window & typeof globalThis;
  const href = f.blob ? w.URL.createObjectURL(f.blob) : f.url!;
  const a = g.doc.createElement('a');
  a.href = href;
  a.download = f.fileName;
  a.hidden = true;
  g.doc.body.append(a);
  a.click();
  a.remove();
  if (f.blob) w.setTimeout(() => w.URL.revokeObjectURL(href), 60_000);
}
