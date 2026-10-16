import { describe, it, expect } from 'vitest';
import { isolationFor } from '../src/render/bidi.js';

describe('isolationFor', () => {
  it('isolates free text only when it mixes directions with the grid', () => {
    expect(isolationFor('Hélène Dupont', 'text', 'ltr')).toBeNull();
    expect(isolationFor('Hélène (مريم)', 'text', 'ltr')).toBe('free');
    expect(isolationFor('مريم سارة', 'text', 'rtl')).toBeNull();
    expect(isolationFor('مُحَمَّد', 'text', 'rtl')).toBeNull();
    expect(isolationFor('مريم!', 'text', 'rtl')).toBe('free');
    expect(isolationFor('Room 12', 'text', 'rtl')).toBe('free');
    expect(isolationFor('', 'text', 'rtl')).toBeNull();
  });
  it('isolates numbers in RTL only, and nothing else', () => {
    expect(isolationFor('-12.5', 'number', 'rtl')).toBe('num');
    expect(isolationFor('-12.5', 'number', 'ltr')).toBeNull();
    expect(isolationFor('2026-03-05', 'day', 'rtl')).toBeNull();
  });
});
