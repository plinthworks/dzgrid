// S13: tzslot 2.2.0's fields inside DzGrid's top-layer popup (the real PopupHost), with `container`.
import { PopupHost } from '/packages/dom/src/popup.ts';
import { createDateField, createRangeField, createDateTimeField, FR, AR } from '@tzslot/dom';
import { Temporal, usingPolyfill } from '@tzslot/core';

const q = new URLSearchParams(location.search);
const scope = { add() { return () => {}; }, isDisposed: false } as never;
const rootOf = (id: string) => document.getElementById(id)!;
let current: { close(): void } | null = null;
const w = window as never as Record<string, unknown>;

/** Opens a popup at the anchor holding one field: `kind` date | range | moment. `guard`: our capture Escape rule. */
w.openWith = (kind: string, o: { guard?: boolean; dialog?: boolean; locale?: string; zone?: string; dir?: string } = {}) => {
  const root = rootOf(o.dialog ? 'root2' : 'root');
  if (o.dialog) (rootOf('dlg') as HTMLDialogElement).showModal();
  root.dir = o.dir ?? 'ltr';
  const host = new PopupHost(document, root, scope, () => (o.dir ?? 'ltr') as never);
  const form = document.createElement('div');
  form.className = 'dzg-fpop';
  const sel = document.createElement('select');
  sel.innerHTML = '<option>op</option>';
  const wrap = document.createElement('div');
  wrap.className = 'dzg-fdate';
  const fieldHost = document.createElement('div');
  const panelBox = document.createElement('div');
  wrap.append(fieldHost, panelBox);
  const apply = document.createElement('button');
  apply.textContent = 'Apply';
  form.append(sel, wrap, apply);
  const locale = o.locale ?? 'fr-FR-u-ca-gregory-nu-latn';
  const messages = locale.startsWith('ar') ? AR : FR;
  const common = { container: panelBox, injectStyles: true, locale, messages, today: Temporal.PlainDate.from('2026-03-29'), placeholder: '' };
  const zone = o.zone ?? 'Europe/Paris';
  const field = kind === 'date' ? createDateField(fieldHost, { ...common, ariaLabel: 'Date', value: Temporal.PlainDate.from('2026-03-29') })
    : kind === 'range' ? createRangeField(fieldHost, { ...common, timeZone: zone, title: 'Période', showTime: false, clearable: false, presets: ['today', 'yesterday', 'last7Days', 'last30Days', 'thisMonth', 'lastMonth'] })
    : createDateTimeField(fieldHost, { ...common, timeZone: zone, ariaLabel: 'Date et heure', readingStyle: 'named' });
  if (o.guard) form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && field.isOpen) { field.close(); e.preventDefault(); e.stopPropagation(); }
  }, true);
  const anchor = rootOf(o.dialog ? 'anchor2' : 'anchor');
  const ref = host.open(anchor, form, { placement: 'block-end', modal: true, label: 'filter', onClose: () => field.destroy() });
  current = ref;
  w.field = field;
  w.ref = ref;
  return { topLayer: ref.el.matches(':popover-open'), usingPolyfill };
};
w.closeAll = () => { current?.close(); (rootOf('dlg') as HTMLDialogElement).close(); };
w.state = () => {
  const panel = document.querySelector<HTMLElement>('.tz-field__panel');
  const pop = document.querySelector<HTMLElement>('.dzg-popup');
  const r = panel?.getBoundingClientRect();
  const hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(20, r.height / 2)) : null;
  const trig = document.querySelector<HTMLElement>('.dzg-fdate .tz-field__trigger, .dzg-fdate .tz-field__wrap');
  return {
    popupOpen: !!pop?.isConnected, panelOpen: !!panel, panelInPopup: !!panel && !!pop?.contains(panel),
    hitInPanel: !!hit && !!panel?.contains(hit), panelRect: r && { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    trig: trig && (() => { const b = trig.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), b: Math.round(b.bottom), t: Math.round(b.top) }; })(),
    active: document.activeElement?.className ?? '', activeInPanel: !!panel?.contains(document.activeElement), activeInPopup: !!pop?.contains(document.activeElement),
    trigText: document.querySelector('.dzg-fdate')?.textContent ?? '', panelDir: panel?.dir, panelBg: panel && getComputedStyle(panel).backgroundColor,
    styles: [...document.head.querySelectorAll('style[data-tzslot]')].map((s) => (s as HTMLElement).dataset['tzslot']),
  };
};
w.dyn = (url: string) => import(url).then(() => 'ok', (e: Error) => `fail: ${e.message}`);
w.ready = true;
