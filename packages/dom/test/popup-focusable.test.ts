// The popup host's Tab trap (Phase 6 step 4, step04-plan §0.2, a11y §21 165): a modal popup keeps Tab inside, wrapping
// from its last control to its first and back. Controls taken out of the tab order (`tabindex="-1"`: a roving list's
// other boxes, the chooser's ▲ ▼ and handles) are not « the last » or « the first »: before this step a button or an
// input with `tabindex="-1"` still counted, so Tab from the real last control left the dialog.
import { describe, it, expect, afterEach } from 'vitest';
import { PopupHost } from '../src/popup.js';
import { Scope } from '../src/render/scope.js';

afterEach(() => {
  document.body.innerHTML = '';
});

/** A modal popup: a search box, a roving list (one box in the tab order), ▲ buttons out of it, then three buttons. */
function dialog() {
  const root = document.createElement('div');
  const anchor = document.createElement('button');
  document.body.append(root, anchor);
  const popups = new PopupHost(document, root, new Scope(), () => 'ltr');
  const content = document.createElement('div');
  content.innerHTML = `<input type="search" id="q">
    <ul><li><input type="checkbox" id="a" tabindex="0"><button tabindex="-1" id="up-a">▲</button></li>
        <li><input type="checkbox" id="b" tabindex="-1"><button tabindex="-1" id="up-b">▲</button></li></ul>
    <button id="all">Show all</button><button id="reset">Reset</button><button id="close">Close</button>
    <button tabindex="-1" id="tail">▲</button>`;
  const ref = popups.open(anchor, content, { placement: 'block-end', modal: true });
  const tab = (shift = false) => {
    const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(e);
    return e;
  };
  const $ = (id: string) => document.getElementById(id)!;
  return { ref, tab, $ };
}

describe('a modal popup\'s Tab trap skips tabindex="-1" controls', () => {
  it('Tab from the last real control (Close) wraps to the first (the search box)', () => {
    const d = dialog();
    expect(document.activeElement).toBe(d.$('q'));
    d.$('close').focus();
    const e = d.tab();
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(d.$('q'));
  });

  it('Shift+Tab from the first wraps to the last real control (Close), never a ▲', () => {
    const d = dialog();
    d.$('q').focus();
    const e = d.tab(true);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(d.$('close'));
  });

  it('elsewhere Tab is the browser\'s (not prevented)', () => {
    const d = dialog();
    d.$('a').focus();
    expect(d.tab().defaultPrevented).toBe(false);
    expect(d.ref.open).toBe(true);
  });
});
