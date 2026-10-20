// Fixture for scripts/size-split.mjs: two static imports and one dynamic one.
import { a } from './a.js';
import { b } from './b.js';
export const run = async () => a() + b() + (await import('./lazy.js')).lazy();
