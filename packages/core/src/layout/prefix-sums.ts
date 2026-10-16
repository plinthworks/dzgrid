/**
 * Running totals of sizes — row heights, column widths — with O(log n)
 * updates and lookups (a Fenwick tree). A measured row height changes one
 * entry; every offset after it must follow without rewriting all of them.
 */
export class PrefixSums {
  readonly #sizes: Float64Array;
  readonly #tree: Float64Array;
  #total = 0;

  constructor(sizes: ArrayLike<number>) {
    this.#sizes = new Float64Array(sizes.length);
    this.#tree = new Float64Array(sizes.length + 1);
    for (let i = 0; i < sizes.length; i++) this.#sizes[i] = check(sizes[i]!);
    this.rebuild();
  }

  get length(): number {
    return this.#sizes.length;
  }

  get total(): number {
    return this.#total;
  }

  sizeAt(i: number): number {
    if (i < 0 || i >= this.length) throw new RangeError(`no entry ${i}`);
    return this.#sizes[i]!;
  }

  /** True if the size changed. */
  set(i: number, size: number): boolean {
    if (i < 0 || i >= this.length) throw new RangeError(`no entry ${i}`);
    const delta = check(size) - this.#sizes[i]!;
    if (delta === 0) return false;
    this.#sizes[i] = size;
    this.#total += delta;
    for (let k = i + 1; k <= this.length; k += k & -k) this.#tree[k]! += delta;
    return true;
  }

  /** The sum of the sizes before entry `i`, for i in [0, length]. */
  offsetOf(i: number): number {
    if (i < 0 || i > this.length) throw new RangeError(`no offset ${i}`);
    let sum = 0;
    for (let k = i; k > 0; k -= k & -k) sum += this.#tree[k]!;
    return sum;
  }

  /** The largest i with offsetOf(i) <= offset, clamped to [0, length − 1]; −1 when empty. */
  indexAt(offset: number): number {
    const n = this.length;
    if (n === 0) return -1;
    if (offset <= 0) return 0;
    let pos = 0;
    let rest = offset;
    for (let step = 1 << Math.floor(Math.log2(n)); step > 0; step >>= 1) {
      const next = pos + step;
      if (next <= n && this.#tree[next]! <= rest) {
        pos = next;
        rest -= this.#tree[next]!;
      }
    }
    return Math.min(pos, n - 1);
  }

  /** Recomputes every running total from the sizes, clearing floating-point drift. */
  rebuild(): void {
    const n = this.length;
    this.#tree.fill(0);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const s = this.#sizes[i]!;
      total += s;
      this.#tree[i + 1]! += s;
      const parent = i + 1 + ((i + 1) & -(i + 1));
      if (parent <= n) this.#tree[parent]! += this.#tree[i + 1]!;
    }
    this.#total = total;
  }
}

function check(size: number): number {
  if (!Number.isFinite(size) || size < 0) throw new RangeError(`not a size: ${size}`);
  return size;
}
