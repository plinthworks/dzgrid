import type { FilterModel } from '../filter/model.js';
import type { WireFilterModel } from './source.js';

/** The filters as sent: the same model for now; step 6 resolves instant filters to bounds in the zone. */
export const toWire = (f: FilterModel): WireFilterModel => f;
