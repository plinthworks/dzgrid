import { values } from './values.js';
import { rows } from './rows.js';
import { format } from './format.js';
import { columns } from './columns.js';
import { store } from './store.js';

/** A suite turns a case's `input` into what is compared with its `expected`. */
export type Suite = (input: any) => unknown;

/** Every suite the runner knows, by the name of its folder in `cases/`. */
export const SUITES: Record<string, Suite> = { ...values, ...rows, ...format, ...columns, ...store };
