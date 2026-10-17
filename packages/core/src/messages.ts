import { problem, type Problem } from './problems.js';

/**
 * A host's own message (`app.*`), looked up when a part asks for it: one the
 * bundle lacks is told (`missing-message`, a warning) and its key is shown.
 */
export function messageProblems(key: string, available: ReadonlySet<string>): Problem[] {
  return available.has(key) ? [] : [problem('missing-message', 'warning', `messages.text.${key}`)];
}
