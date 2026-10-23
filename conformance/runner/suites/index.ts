import { values } from './values.js';
import { rows } from './rows.js';
import { format } from './format.js';
import { columns } from './columns.js';
import { store } from './store.js';
import { sort } from './sort.js';
import { filter } from './filter.js';
import { quick } from './quick.js';
import { model } from './model.js';
import { layout } from './layout.js';
import { selection } from './selection.js';
import { selectionAcross } from './selection-across.js';
import { problems } from './problems.js';
import { keys } from './keys.js';
import { kernel } from './kernel.js';
import { operations } from './operations.js';
import { parts } from './parts.js';
import { server } from './server.js';
import { page } from './page.js';
import { source } from './source.js';
import { wire } from './wire.js';
import { valueList } from './value-list.js';
import { spans } from './spans.js';
import { csv } from './csv.js';
import { selectionRules } from './selection-rules.js';
import { tree } from './tree.js';
import { detail } from './detail.js';
import { editOrder } from './edit-order.js';
import { edit } from './edit.js';

/** A suite turns a case's `input` into what is compared with its `expected`. */
export type Suite = (input: any) => unknown;

/** Every suite the runner knows, by the name of its folder in `cases/`. */
export const SUITES: Record<string, Suite> = { ...values, ...rows, ...format, ...columns, ...store, ...sort, ...filter, ...quick, ...model, ...layout, ...selection, ...selectionAcross, ...problems, ...keys, ...kernel, ...operations, ...parts, ...server, ...page, ...source, ...wire, ...valueList, ...spans, ...csv, ...selectionRules, ...tree, ...detail, ...editOrder, ...edit };
