/**
 * A column's cells as one string, for searching.
 *
 * One string per cell costs tens of bytes each — 1.8 kB per row over thirty
 * columns, measured. Joined with a separator no search word can hold, the
 * cells take what their characters take, plus four bytes of offset each, and
 * finding a word in the column is one `indexOf` sweep rather than a call per
 * cell. A row updated later is kept aside (`patched`) rather than rebuilding
 * the string; past a limit the owner rebuilds.
 */
const SEP = '\u0000';

export class Haystack {
  readonly #text: string;
  /** Cell i occupies [starts[i], starts[i + 1] − 1); the separator follows it. */
  readonly #starts: Uint32Array;
  readonly #blank: Uint8Array;
  readonly #patched = new Map<number, string | null>();
  readonly count: number;

  constructor(cells: readonly (string | null)[]) {
    const n = cells.length;
    this.count = n;
    this.#starts = new Uint32Array(n + 1);
    this.#blank = new Uint8Array(n);
    const parts: string[] = new Array(n);
    let at = 0;
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      this.#starts[i] = at;
      if (c == null) {
        this.#blank[i] = 1;
        parts[i] = '';
      } else {
        // A separator inside a cell would split it: it cannot be searched for anyway.
        parts[i] = c.includes(SEP) ? c.split(SEP).join(' ') : c;
      }
      at += parts[i]!.length + 1;
    }
    this.#starts[n] = at;
    this.#text = parts.join(SEP) + SEP;
  }

  get patchedCount(): number {
    return this.#patched.size;
  }

  /** Replaces one cell's text without rebuilding. */
  patch(i: number, value: string | null): void {
    this.#patched.set(i, value);
  }

  isBlank(i: number): boolean {
    const p = this.#patched.get(i);
    return p !== undefined ? p === null : this.#blank[i] === 1;
  }

  /** The cell's text — allocates; for tests and rare paths. */
  cell(i: number): string | null {
    if (this.#patched.has(i)) return this.#patched.get(i)!;
    return this.#blank[i] ? null : this.#text.slice(this.#starts[i]!, this.#starts[i + 1]! - 1);
  }

  /** Rows whose cell contains `word`, as a 0/1 mask. */
  containsMask(word: string): Uint8Array {
    const mask = new Uint8Array(this.count);
    if (word === '' || word.includes(SEP)) {
      if (word === '') for (let i = 0; i < this.count; i++) mask[i] = this.isBlank(i) ? 0 : 1;
      return mask;
    }
    const text = this.#text;
    let pos = text.indexOf(word);
    while (pos >= 0) {
      const row = this.#rowAt(pos);
      mask[row] = 1;
      pos = text.indexOf(word, this.#starts[row + 1]!);
    }
    for (const [i, v] of this.#patched) mask[i] = v !== null && v.includes(word) ? 1 : 0;
    return mask;
  }

  equalsAt(i: number, w: string): boolean {
    const p = this.#patched.get(i);
    if (p !== undefined) return p === w;
    if (this.#blank[i]) return false;
    const s = this.#starts[i]!;
    return this.#starts[i + 1]! - 1 - s === w.length && this.#text.startsWith(w, s);
  }

  startsAt(i: number, w: string): boolean {
    const p = this.#patched.get(i);
    if (p !== undefined) return p !== null && p.startsWith(w);
    if (this.#blank[i]) return false;
    const s = this.#starts[i]!;
    return this.#starts[i + 1]! - 1 - s >= w.length && this.#text.startsWith(w, s);
  }

  endsAt(i: number, w: string): boolean {
    const p = this.#patched.get(i);
    if (p !== undefined) return p !== null && p.endsWith(w);
    if (this.#blank[i]) return false;
    const s = this.#starts[i]!;
    const e = this.#starts[i + 1]! - 1;
    return e - s >= w.length && this.#text.startsWith(w, e - w.length);
  }

  /** The cell holding text position `pos`: the largest i with starts[i] <= pos. */
  #rowAt(pos: number): number {
    let lo = 0;
    let hi = this.count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (this.#starts[mid]! <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
}
