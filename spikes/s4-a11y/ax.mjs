// Chrome accessibility trees for S4 / S10: CDP's getFullAXTree, and chrome://accessibility
// dumps of Blink's internal tree and of the native macOS tree (what VoiceOver reads).

/** Parses a chrome://accessibility text dump into nodes; `:N` references are 1-based line numbers. */
export function parseDump(text) {
  const lines = text.split('\n').filter((l) => l.trim());
  const nodes = lines.map((line, i) => {
    const m = /^(\+*)(?:id#=-?\d+\s+)?(\S+)\s?(.*)$/.exec(line);
    const attrs = {}, flags = new Set();
    for (const t of m[3].matchAll(/([\w-]+)=('(?:[^'\\]|\\.)*'|\[[^\]]*\]|\{[^}]*\}|\([^)]*\)|\S+)|(\S+)/g)) {
      if (t[1]) attrs[t[1]] = t[2].replace(/^'([\s\S]*)'$/, '$1'); else flags.add(t[3]);
    }
    return { n: i + 1, depth: m[1].length / 2, role: m[2], attrs, flags, children: [], text: '' };
  });
  const stack = [];
  for (const n of nodes) {
    while (stack.length && stack[stack.length - 1].depth >= n.depth) stack.pop();
    if (stack.length) { n.parent = stack[stack.length - 1]; n.parent.children.push(n); }
    stack.push(n);
  }
  const textOf = (n) => (n.role === 'AXStaticText' ? n.attrs.AXValue ?? '' : n.role === 'staticText' ? n.attrs.name ?? '' : n.children.map(textOf).filter(Boolean).join(' '));
  for (const n of nodes) n.text = textOf(n);
  const ref = (s) => (s ? [...s.matchAll(/:(\d+)/g)].map((x) => nodes[Number(x[1]) - 1]) : []);
  return { nodes, ref };
}

/** One dump of the page whose <title> is `title`. api: 'blink' | 'mac'. */
export async function chromeDump(ctx, title, api) {
  const a = await ctx.newPage();
  try {
    await a.goto('chrome://accessibility');
    await a.selectOption('#apiType', api);
    const row = a.locator('[id^=page_]').filter({ hasText: title }).first();
    const id = await row.getAttribute('id');
    await a.click(`[id="${id}-showOrRefreshTree"]`);
    await a.waitForFunction((id) => (document.querySelector(`[id="${id}"] pre`)?.textContent?.length ?? 0) > 100, id);
    return parseDump(await a.locator(`[id="${id}"] pre`).first().innerText());
  } finally { await a.close(); }
}

/** macOS view: table counts, rows (first cell's indices), focused cell and its headers. */
export function macSummary({ nodes, ref }) {
  const table = nodes.find((n) => n.role === 'AXTable');
  const rows = table.children.filter((c) => c.role === 'AXRow').map((r) => {
    const c = r.children.find((x) => x.role === 'AXCell');
    return { rowindex: Number(c?.attrs.AXARIARowIndex), level: r.attrs.AXDisclosureLevel != null ? Number(r.attrs.AXDisclosureLevel) + 1 : null,
      expanded: r.attrs.AXExpanded != null ? r.attrs.AXExpanded === '1' : null, title: r.attrs.AXTitle };
  });
  const seen = new Set();
  const cells = nodes.filter((n) => n.role === 'AXCell' && !seen.has(n.attrs.ChromeAXNodeId) && seen.add(n.attrs.ChromeAXNodeId));
  const focused = cells.find((c) => c.attrs.AXFocused === '1');
  const sorted = cells.filter((c) => c.attrs.AXSortDirection && c.attrs.AXSortDirection !== 'AXUnknownSortDirection')
    .map((c) => ({ header: c.text, dir: c.attrs.AXSortDirection }));
  const cellInfo = (c) => c && ({
    rowindex: Number(c.attrs.AXARIARowIndex), colindex: Number(c.attrs.AXARIAColumnIndex), text: c.text,
    roleDescription: c.attrs.AXRoleDescription, colspan: c.attrs.AXColumnIndexRange,
    columnHeaders: ref(c.attrs.AXColumnHeaderUIElements).map((h) => h.text),
    rowHeaders: ref(c.attrs.AXRowHeaderUIElements).map((h) => h.text),
  });
  return {
    role: table.attrs.AXRoleDescription, label: table.attrs.AXDescription ?? table.attrs.AXTitle,
    rowcount: Number(table.attrs.AXARIARowCount), colcount: Number(table.attrs.AXARIAColumnCount),
    rows, focused: cellInfo(focused), sorted,
    cell: (ri, ci) => cellInfo(cells.find((c) => Number(c.attrs.AXARIARowIndex) === ri && Number(c.attrs.AXARIAColumnIndex) === ci)),
  };
}

/** Blink internal view: rows with aria/table indices, tree attributes, offscreen flag. */
export function blinkSummary({ nodes }) {
  const grid = nodes.find((n) => n.role === 'grid' || n.role === 'treeGrid');
  const rows = nodes.filter((n) => n.role === 'row').map((r) => ({
    rowindex: Number(r.attrs.ariaCellRowIndex), tableRowIndex: Number(r.attrs.tableRowIndex),
    level: r.attrs.hierarchicalLevel ? Number(r.attrs.hierarchicalLevel) : null,
    setsize: r.attrs.setSize ? Number(r.attrs.setSize) : null, posinset: r.attrs.posInSet ? Number(r.attrs.posInSet) : null,
    expanded: r.flags.has('expanded') ? true : r.flags.has('collapsed') ? false : null,
    offscreen: r.flags.has('offscreen'), ignored: r.flags.has('ignored'), name: r.attrs.name,
  }));
  const live = nodes.find((n) => n.attrs.containerLiveStatus === 'polite' && n.role === 'genericContainer' && n.attrs.liveStatus);
  const cells = nodes.filter((n) => ['gridCell', 'rowHeader', 'cell'].includes(n.role)).map((c) => ({
    rowindex: Number(c.attrs.ariaCellRowIndex), colindex: Number(c.attrs.ariaCellColumnIndex),
    colspan: Number(c.attrs.tableCellColumnSpan ?? 1), ariaColspan: c.attrs.ariaCellColumnSpan ? Number(c.attrs.ariaCellColumnSpan) : null,
    expanded: c.flags.has('expanded') ? true : c.flags.has('collapsed') ? false : null, name: c.attrs.name, role: c.role,
  }));
  return {
    role: grid.role, rowcount: Number(grid.attrs.ariaRowCount), colcount: Number(grid.attrs.ariaColumnCount),
    tableRowCount: Number(grid.attrs.tableRowCount), rows, cells,
    live: live ? { liveStatus: live.attrs.liveStatus, atomic: live.attrs.liveAtomic ?? live.attrs.containerLiveAtomic, name: live.attrs.name ?? live.text } : null,
  };
}

/** CDP: focused node, and the AX node of a DOM element given by selector. */
export async function cdpView(page, selector) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Accessibility.enable');
  await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const prop = (n, k) => n.properties?.find((p) => p.name === k)?.value?.value;
  const focusedAX = nodes.find((n) => prop(n, 'focused') && n.role?.value !== 'RootWebArea');
  const domOf = async (backendNodeId) => {
    const { object } = await cdp.send('DOM.resolveNode', { backendNodeId });
    const { result } = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, returnByValue: true,
      functionDeclaration: 'function(){const r=this.closest("[role=row]");return {role:this.getAttribute("role"),col:this.getAttribute("aria-colindex"),key:r?.dataset.key,rowindex:r?.getAttribute("aria-rowindex")}}' });
    return result.value;
  };
  let target = null;
  if (selector) {
    const { result } = await cdp.send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(selector)})` });
    if (result.objectId) {
      const { node } = await cdp.send('DOM.describeNode', { objectId: result.objectId });
      const ax = nodes.find((n) => n.backendDOMNodeId === node.backendNodeId);
      target = ax ? { role: ax.role?.value, name: ax.name?.value, ignored: ax.ignored, ignoredReasons: ax.ignoredReasons?.map((r) => r.name) } : { missing: true };
    }
  }
  const liveAX = nodes.find((n) => prop(n, 'live') === 'polite' && n.role?.value !== 'StaticText' && prop(n, 'atomic') !== undefined);
  const out = {
    focused: focusedAX ? { role: focusedAX.role?.value, name: focusedAX.name?.value, dom: await domOf(focusedAX.backendDOMNodeId) } : null,
    target,
    rowsExposed: nodes.filter((n) => n.role?.value === 'row' && !n.ignored).length,
    live: liveAX ? { live: prop(liveAX, 'live'), atomic: prop(liveAX, 'atomic'), relevant: prop(liveAX, 'relevant') } : null,
  };
  await cdp.detach();
  return out;
}
