import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DZGRID_ANGULAR_VERSION, DzgProbe } from '@dzgrid/angular';

/**
 * The toolchain renders real templates: a binding that silently failed to
 * compile would leave the element empty, which plain tsc never notices.
 * `DzgProbe` exists for this test only; the real component is step 22.
 */
@Component({
  selector: 'dzg-host',
  imports: [DzgProbe],
  template: `<dzg-probe [label]="label" />`,
})
class Host {
  label = 'first';
}

describe('the Angular toolchain', () => {
  it('compiles and renders a standalone component’s template, bindings included', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const probe = (fixture.nativeElement as HTMLElement).querySelector('dzg-probe');
    expect(probe?.textContent?.trim()).toBe('DzGrid first');

    fixture.componentInstance.label = 'second';
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(probe?.textContent?.trim()).toBe('DzGrid second');
  });

  it('was compiled ahead of time by the Vite plugin, not left to the JIT compiler', () => {
    // setup.ts loads @angular/compiler, so a missing plugin would still render
    // through JIT and hide the fault. AOT output defines the component as a
    // plain static field; JIT defines it behind a getter.
    const own = Object.getOwnPropertyDescriptor(DzgProbe, 'ɵcmp');
    expect(own && 'value' in own).toBe(true);
  });

  it('exposes the version written in its package.json', () => {
    const manifest = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'));
    expect(DZGRID_ANGULAR_VERSION).toBe(manifest.version);
  });
});
