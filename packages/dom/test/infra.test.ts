import { describe, it, expect } from 'vitest';
import { FrameScheduler } from '../src/render/scheduler.js';
import { Scope } from '../src/render/scope.js';
import { LAYOUT_CSS, injectStyles } from '../src/styles.js';

describe('FrameScheduler', () => {
  it('runs every read before any write, in one frame', () => {
    const order: string[] = [];
    let cb: (() => void) | null = null;
    const s = new FrameScheduler({ requestAnimationFrame: (f) => { cb = () => f(0); return 1; }, cancelAnimationFrame: () => { cb = null; } });
    s.schedule({ read: () => order.push('r1'), write: () => order.push('w1') });
    s.schedule({ read: () => order.push('r2'), write: () => order.push('w2') });
    expect(order).toEqual([]);
    cb!();
    expect(order).toEqual(['r1', 'r2', 'w1', 'w2']);
  });
  it('runs at once when sync, and drops pending jobs on cancel', () => {
    const order: string[] = [];
    new FrameScheduler(null, true).schedule({ read: () => 1, write: (v) => order.push(`w${v}`) });
    expect(order).toEqual(['w1']);
    let cancelled = 0;
    const s = new FrameScheduler({ requestAnimationFrame: () => 7, cancelAnimationFrame: (id) => { cancelled = id; } });
    s.schedule({ read: () => 0, write: () => order.push('late') });
    s.cancel();
    s.flush();
    expect(cancelled).toBe(7);
    expect(order).toEqual(['w1']);
  });
  it('schedules a job added while flushing for the next frame, not this one', () => {
    let cb: (() => void) | null = null;
    const s = new FrameScheduler({ requestAnimationFrame: (f) => { cb = () => f(0); return 1; }, cancelAnimationFrame: () => {} });
    const order: string[] = [];
    s.schedule({ read: () => 0, write: () => { order.push('a'); s.schedule({ read: () => 0, write: () => order.push('b') }); } });
    const first = cb!; cb = null;
    first();
    expect(order).toEqual(['a']);
    cb!();
    expect(order).toEqual(['a', 'b']);
  });
});

describe('Scope', () => {
  it('removes every listener, timer and observer it was given', () => {
    const scope = new Scope();
    const el = document.createElement('div');
    let clicks = 0;
    scope.on(el, 'click', () => clicks++);
    scope.on(el, 'keydown', () => {});
    let disconnected = false;
    scope.observe({ disconnect: () => { disconnected = true; } });
    expect(scope.listenerCount).toBe(2);
    scope.dispose();
    el.click();
    expect(clicks).toBe(0);
    expect(disconnected).toBe(true);
    expect(scope.listenerCount).toBe(0);
    // Added after dispose: released at once.
    let late = false;
    scope.add(() => { late = true; });
    expect(late).toBe(true);
  });
});

describe('layout styles', () => {
  it('pin the header, contain rows without breaking sticky, clip the body', () => {
    expect(LAYOUT_CSS).toMatch(/\.dzg-header\)\s*\{[^}]*position: sticky;[^}]*inset-block-start: 0/);
    expect(LAYOUT_CSS).toMatch(/\.dzg-row\)\s*\{[^}]*contain: content/);
    expect(LAYOUT_CSS).not.toMatch(/contain: strict/);
    expect(LAYOUT_CSS).toMatch(/\.dzg-body\)\s*\{[^}]*overflow: clip/);
    expect(LAYOUT_CSS).toMatch(/\.dzg-seg-start\)\s*\{[^}]*position: sticky;[^}]*inset-inline-start: 0/);
    expect(LAYOUT_CSS).toMatch(/\.dzg-seg-end\)\s*\{[^}]*position: sticky;[^}]*inset-inline-end: 0/);
    // Every rule has zero specificity, so a host's stylesheet always wins.
    for (const sel of LAYOUT_CSS.match(/[^{}]+(?=\{)/g)!) expect(sel.trim()).toMatch(/^:where\(/);
  });
  it('are injected once per document, with a nonce when given', () => {
    const doc = document.implementation.createHTMLDocument('x');
    injectStyles(doc, 'abc');
    injectStyles(doc);
    const styles = doc.head.querySelectorAll('style[data-dzgrid]');
    expect(styles.length).toBe(1);
    expect(styles[0]!.getAttribute('nonce')).toBe('abc');
  });
});
