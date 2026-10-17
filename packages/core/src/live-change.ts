import { problem, type Problem } from './problems.js';

/**
 * Settings a grid takes only at creation, changed live: each is refused and
 * said (`unsupported-live-change`), never half applied. `policy` names each
 * setting `live` or `fixed` (a nested one as `selection.mode`); a value equal
 * to the previous one is no change.
 */
export function liveChangeProblems(
  policy: Readonly<Record<string, 'live' | 'fixed'>>,
  prev: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>,
): Problem[] {
  const out: Problem[] = [];
  for (const key of Object.keys(patch)) {
    if (policy[key] === 'fixed' && !Object.is(patch[key], prev[key])) out.push(problem('unsupported-live-change', 'error', `settings.${key}`));
  }
  return out;
}
