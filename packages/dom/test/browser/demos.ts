// The showcase demos on the browser page (docs/phase-5-steps/demos-plan.md §4; scripts/browser.mjs
// `demosChecks`, `-- --only demos`): the playground's own modules (`playground/demos/*.ts`), mounted as the
// pages mount them. Query: demo=orders|hr, locale, theme (light|dark), skin=midnight|clinic|none, rootfont.
import { mountOrders } from '/playground/demos/orders.ts';
import { mountHr } from '/playground/demos/hr.ts';
import { dataKey } from '@dzgrid/core';

const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const ar = locale.startsWith('ar');
document.documentElement.lang = locale;
document.documentElement.dir = ar ? 'rtl' : 'ltr';
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;
// `rootfont`: an app's root font size (`62.5%`): the rows keep the browser's default size (review R3).
if (q.get('rootfont')) document.documentElement.style.fontSize = q.get('rootfont')!;

const anchor = document.querySelector('link[rel=stylesheet]')!;
let last: Element = anchor;
const link = (href: string) =>
  new Promise<void>((done, fail) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.onload = () => done();
    l.onerror = () => fail(new Error(href));
    last.after(l);
    last = l;
  });
const skin = q.get('skin') ?? 'none';
if (skin !== 'none') await link(`/packages/theme/${skin}.css`);
await link('/playground/demos/demos.css');

const host = document.getElementById('host')!;
const problems: unknown[] = [];
const onEvent = (e: { type: string; problems?: unknown }) => void (e.type === 'problems' && problems.push(e.problems));
const demo = q.get('demo') === 'hr' ? mountHr(host, { locale, onEvent }) : (host.classList.add('demo-orders'), mountOrders(host, { locale, onEvent }));
(window as unknown as { t: unknown }).t = { demo, grid: demo.grid, problems, key: (id: string) => dataKey(id) };
await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
(window as unknown as { ready: boolean }).ready = true;
