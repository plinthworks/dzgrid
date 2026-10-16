/**
 * Checks every text/background pair of the theme against 4.5:1 (3:1 for
 * large text and UI parts), for each palette in light and dark. The theme
 * arrives in Phase 2; until then there is nothing to check, and saying so is
 * better than passing silently.
 */
import { existsSync } from 'node:fs';
const pairs = new URL('../packages/theme/contrast-pairs.json', import.meta.url);
if (!existsSync(pairs)) {
  console.log('check-contrast: no theme yet (Phase 2) — nothing to check.');
  process.exit(0);
}
console.error('check-contrast: the theme exists but the check is not written yet.');
process.exit(1);
