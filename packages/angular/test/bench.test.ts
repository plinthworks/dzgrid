// The rebind's cost (step 22, S6: ≈ 5 µs per pooled component rebind in Chrome). jsdom has no layout
// and is noisy: this guards the order of magnitude, 2× S6 (measured ≈ 1 µs here; a fresh view per rebind
// costs several times more); the browser fixture measures the real figure in Chrome.
import { describe, it, expect } from 'vitest';
import { ApplicationRef, ChangeDetectionStrategy, Component, EnvironmentInjector, Injector, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey } from '@dzgrid/core';
import type { SlotContext } from '@dzgrid/dom';
import type { DzgPartContext } from '@dzgrid/angular';
import { boundPart } from '../src/part-bind';

@Component({
  selector: 't-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="b" [class.odd]="cell().row !== null && cell().text === 'odd'">{{ cell().text }}</span>`,
})
class Badge {
  readonly cell = input.required<DzgPartContext<'cell'>>();
}

const base = (i: number) =>
  ({ ctx: {} as never, dir: 'ltr', doc: document, msg: () => '', announce: () => {}, value: i, text: i % 2 ? 'odd' : 'even', row: { i }, key: dataKey(`r${i}`), column: { id: 's' } as never, focused: false }) as SlotContext['cell'];

describe('rebinding a pooled component', () => {
  it('costs microseconds, not a fresh view', () => {
    const b = { env: TestBed.inject(EnvironmentInjector), app: TestBed.inject(ApplicationRef), injector: TestBed.inject(Injector), kernel: () => null };
    const part = boundPart(b, 'cell', Badge).part;
    const hosts = Array.from({ length: 40 }, () => document.createElement('div'));
    const handles = hosts.map((h, i) => part.mount(h, base(i)));
    const contexts = Array.from({ length: 400 }, (_, i) => base(i));
    // Warm the JIT up, then measure.
    for (let r = 0; r < 20; r++) handles.forEach((h, i) => h.update!(contexts[(r * 40 + i) % 400]!));
    const n = 20_000;
    const t0 = performance.now();
    for (let k = 0; k < n; k++) handles[k % 40]!.update!(contexts[k % 400]!);
    const us = ((performance.now() - t0) * 1000) / n;
    process.stdout.write(`rebind: ${us.toFixed(2)} µs per pooled component (jsdom)\n`);
    expect(hosts[7]!.textContent).toBe(contexts[(n - 40 + 7) % 400]!.text);
    expect(us).toBeLessThan(10);
    handles.forEach((h) => h.destroy!());
    expect(hosts.every((h) => h.childNodes.length === 0)).toBe(true);
  });
});
