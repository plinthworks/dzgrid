// @vitest-environment node
// The wrong ways to bind step 12's members must not compile under strictTemplates (step12-plan §6 A10, negative side):
// `ngc` on a host written wrong, in a scratch folder under node_modules/.cache (never in the typecheck's sources).
// The right ways are packages/angular/test/strict-templates.test.ts, compiled by `npm run typecheck`. One ngc run.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIR = join(ROOT, 'node_modules/.cache/dzgrid-strict-negative');

/** Each case: a template on `<dz-grid>`, and what tsc must say about it. */
const CASES: [string, string, RegExp][] = [
  ['StateNumber', `<dz-grid [columns]="c" [getRowId]="id" [state]="123" />`, /Type 'number' is not assignable to type 'GridState/],
  ['PinnedMiddle', `<dz-grid [columns]="c" [getRowId]="id" [pinnedRows]="{ middle: [] }" />`, /'middle' does not exist|no properties in common|Object literal may only specify known properties/],
  ['StateNope', `<dz-grid [columns]="c" [getRowId]="id" (stateChanged)="n = $event.nope" />`, /Property 'nope' does not exist/],
  // The allergen screen's bug (app-feedback): `.rows` was never on the event; strict templates now say so.
  ['SelectionRows', `<dz-grid [columns]="c" [getRowId]="id" (selectionChanged)="n = $event.rows" />`, /Property 'rows' does not exist/],
  ['MenuItemNope', `<dz-grid [columns]="c" [getRowId]="id"><ng-template dzgPart="m" slot="menuItem" let-c>{{ c.nope }}</ng-template></dz-grid>`, /Property 'nope' does not exist/],
];

describe('strict templates refuse the wrong bindings of step 12', () => {
  it('ngc fails on each wrong host, with the expected message on its line', { timeout: 240_000 }, () => {
    rmSync(DIR, { recursive: true, force: true });
    mkdirSync(DIR, { recursive: true });
    const lines = [
      `import { Component } from '@angular/core';`,
      `import { DzGrid, DzgPart } from '@dzgrid/angular';`,
      ...CASES.map(([name, tpl]) => `@Component({ selector: 't-${name.toLowerCase()}', imports: [DzGrid, DzgPart], template: \`${tpl}\` }) export class ${name} { c = [{ id: 'a' }]; id = (r: { id: string }) => r.id; n: unknown = 0; }`),
    ];
    writeFileSync(join(DIR, 'negative.ts'), lines.join('\n') + '\n');
    writeFileSync(join(DIR, 'tsconfig.json'), JSON.stringify({ extends: join(ROOT, 'packages/angular/tsconfig.spec.json'), include: [join(DIR, 'negative.ts')], exclude: [] }));
    const r = spawnSync(process.execPath, [join(ROOT, 'node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js'), '-p', join(DIR, 'tsconfig.json'), '--noEmit'], { cwd: ROOT, encoding: 'utf8' });
    const out = `${r.stdout}${r.stderr}`.replace(/\x1b\[[0-9;]*m/g, '');
    rmSync(DIR, { recursive: true, force: true });
    expect(r.status, out).not.toBe(0);
    // Each case's line (3 + its index) carries its own error.
    CASES.forEach(([name, , msg], i) => {
      const at = out.split(/\n(?=\S*negative\.ts:)/).filter((b) => b.includes(`negative.ts:${3 + i}:`));
      expect(at.join('\n'), name).toMatch(msg);
    });
  });
});
