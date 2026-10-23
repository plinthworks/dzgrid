import type { SlotPart } from '../part.js';
import { cellPart } from './draw.js';

/** A badge's tone: its colour and, but for neutral, its shape (owner Q1). */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface BadgeOptions {
  /** The tone of each value, by the value as a string (`String(value)`): `{ done: 'success', late: 'danger' }`. */
  readonly tones?: Readonly<Record<string, Tone>>;
  /** The tone of a value the map does not name; default `neutral`. */
  readonly fallback?: Tone;
  /** The host's classes per tone (showcase themes step 6), beside `dzg-badge`: `{ danger: 'bg-red-100 text-red-800' }`. */
  readonly classes?: Readonly<Partial<Record<Tone, string>>>;
}

/** The shape beside the colour: colour is never the only sign. Neutral has none. */
const GLYPHS: Readonly<Record<string, string>> = { success: '✓', warning: '!', danger: '✕', info: 'i' };

/**
 * A status badge (docs/behaviors/badge-boolean.md), registered by name and used through `ui.cell`:
 * `parts: { statusBadge: badge({ tones: { done: 'success' } }) }`. The label is the cell's text (an
 * enum's label; an unknown value shows the value), the tone `tones[String(value)]` (own keys only)
 * or `fallback`; a blank shows nothing. The tone is never in the accessible name.
 */
export const badge = (o: BadgeOptions = {}): SlotPart<'cell'> =>
  cellPart('dzg-badge', (c) => {
    if (c.value == null || !c.text.trim()) return null;
    const k = String(c.value);
    const t = (o.tones && Object.hasOwn(o.tones, k) ? o.tones[k] : undefined) ?? o.fallback ?? 'neutral';
    return [c.text, GLYPHS[t] ?? '', t, o.classes?.[t]];
  });
