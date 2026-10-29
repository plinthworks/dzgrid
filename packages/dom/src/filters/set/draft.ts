/** A set filter as the list writes it (`ColumnFilter`'s `set` variant, one list only). */
export type SetFilter = { readonly type: 'set'; readonly include?: readonly string[]; readonly exclude?: readonly string[]; readonly blanks?: 'include' | 'exclude' };

/**
 * The ticks of a value list (docs/behaviors/filter-set.md "The draft"): in `include` mode `vals`
 * are the values ticked, in `exclude` mode the ones unticked; `blanks`: blanks are kept.
 */
export interface Draft {
  mode: 'include' | 'exclude';
  vals: Set<string>;
  blanks: boolean;
}

/** The draft of a stored filter (one it can show); none is everything ticked. */
export const draftOf = (f: SetFilter | null): Draft =>
  f?.include ? { mode: 'include', vals: new Set(f.include), blanks: f.blanks === 'include' } : { mode: 'exclude', vals: new Set(f?.exclude), blanks: f?.blanks !== 'exclude' };

export const ticked = (d: Draft, v: string): boolean => d.vals.has(v) === (d.mode === 'include');

/** Ticks (`on`) or unticks a value. */
export const tick = (d: Draft, v: string, on: boolean): void => void (on === (d.mode === 'include') ? d.vals.add(v) : d.vals.delete(v));

export const tickAll = (d: Draft, vs: readonly string[], on: boolean): void => {
  for (const v of vs) tick(d, v, on);
};

/**
 * The half rule, on a complete list only (`all`; null: searched, truncated or unavailable): more
 * than half ticked is written as an `exclude` of the others, fewer than half as an `include`; a
 * tie keeps the mode.
 */
export const settle = (d: Draft, all: readonly string[] | null): void => {
  if (!all) return;
  const on = all.filter((v) => ticked(d, v));
  const inc = d.mode === 'include';
  if (inc ? on.length * 2 <= all.length : on.length * 2 >= all.length) return;
  d.vals = new Set(inc ? all.filter((v) => !d.vals.has(v)) : on);
  d.mode = inc ? 'exclude' : 'include';
};

/**
 * Include only (filter-set.md « Include only »; `filter.exclude: false`), in place of the half rule: leaving
 * « everything » is an include of the whole list (`known`: the last complete one shown, else the values shown) less
 * the unticked; blanks are never kept; every value ticked on a complete list (`all`) is « everything » again (no filter).
 */
export const only = (d: Draft, all: readonly string[] | null, known: readonly string[]): void => {
  if (d.mode === 'exclude') {
    if (!d.vals.size && d.blanks) return;
    d.vals = new Set(known.filter((v) => !d.vals.has(v)));
    d.mode = 'include';
  }
  d.blanks = false;
  if (all?.length && all.every((v) => d.vals.has(v))) (d.mode = 'exclude'), (d.vals = new Set()), (d.blanks = true);
};

/** The filter a draft writes: its list sorted by code unit, `blanks` only when not the mode's default; null for "everything". */
export const filterOf = (d: Draft): SetFilter | null => {
  const list = [...d.vals].sort();
  if (d.mode === 'include') return { type: 'set', include: list, ...(d.blanks && { blanks: 'include' }) };
  return !list.length && d.blanks ? null : { type: 'set', exclude: list, ...(!d.blanks && { blanks: 'exclude' }) };
};
