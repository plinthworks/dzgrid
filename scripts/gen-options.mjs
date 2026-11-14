/**
 * `node scripts/gen-options.mjs`: website/src/generated/options.json, the facts of every setting of `createGrid`
 * and every key of a column definition, read from the sources (docs/website-plan.md, batch 3: the facts generated,
 * the text written; as DzCalendar's gen-options) — the type as written, the comment, the default (the JSDoc
 * `@default`: a code literal, or a `{token}` the site translates), whether `update()` changes it (`UPDATE_POLICY`
 * in packages/dom/src/update.ts), whether it is required, the Angular input of the same name, the `<dz-grid>`
 * attribute or property that sets it, where it is declared; and each feature's import, signature, options, texts
 * bundle, theme sheet and own CSS. `--check` fails when the file differs.
 */
import ts from 'typescript';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
export const OUT = join(root, 'website', 'src', 'generated', 'options.json');
const SETTINGS = join(root, 'packages/dom/src/settings.ts');
const COLUMNS = join(root, 'packages/core/src/columns/defs.ts');
const POLICY = join(root, 'packages/dom/src/update.ts');
const ANGULAR = join(root, 'packages/angular/src/grid.ts');
const ELEMENT = join(root, 'packages/element/src/index.ts');
const KNOWN_TAGS = new Set(['default']);
const DOM = join(root, 'packages/dom/src');
/**
 * The features, one page each (`features/<slug>`): the entry they are imported from and the function. An entry that
 * exports two (`parts`: `badge` and `cellBoolean`) gives two pages; `filters-base` and `editors-base` are the same
 * functions without the calendar, told on the `filters` and `editors` pages.
 */
export const FEATURES = [
  ['pagination', 'pagination'], ['search', 'quickSearch'], ['export', 'csvExport'], ['parts', 'badge'], ['parts', 'cellBoolean'],
  ['rules', 'rules'], ['tree', 'tree'], ['tree-lazy', 'lazyChildren'], ['detail', 'detail'], ['detail', 'nestedGrid'],
  ['edit', 'edit'], ['editors', 'editors'], ['editors-list', 'listEditor'], ['filters', 'filters'], ['range', 'range'],
  ['fill', 'fill'], ['columns', 'columns'], ['column-menu', 'columnMenu'], ['context-menu', 'contextMenu'],
  ['statusbar', 'statusBar'], ['find', 'find'], ['row-drag', 'rowDrag'], ['dock', 'dock'], ['pivot', 'pivot'],
  ['pivot-bar', 'pivotBar'], ['row-numbers', 'rowNumbers'], ['grouping', 'grouping'], ['group-zone', 'groupZone'],
  ['filters-panel', 'filtersPanel'], ['columns-panel', 'columnsChooser'], ['state', 'gridState'], ['pinned-rows', 'pinnedRows'],
  ['auto-height', 'autoHeight'], ['row-gaps', 'rowGaps'], ['print', 'print'], ['print-menu', 'printOnMenu'],
  ['fresh-rows', 'freshRows'], ['motion-gsap', 'motion'], ['totals-row', 'totalsRow'], ['vertical-headers', 'verticalHeaders'],
  ['theme', 'theming'], ['wrapped-headers', 'wrappedHeaders'], ['column-hover', 'columnHover'], ['responsive', 'responsive'],
  ['import', 'fileImport'], ['spans', 'spans'], ['groups', 'groups'], ['slots', 'slots'], ['tooltip', 'tooltips'],
];
/** A feature whose entry exports no `*_KEYS` but uses another's texts (`printOnMenu`: `print()`'s table). */
const TEXTS_OF = { printOnMenu: 'print' };
/** The `@dzgrid/theme` sheet a feature needs after `dzgrid.css`, read from each sheet's opening comment. */
const SHEETS = {
  edit: 'edit', editors: 'edit', range: 'range', fill: 'fill', columns: 'columns', columnMenu: 'columns', contextMenu: 'menu',
  columnsChooser: 'columns-panel', pinnedRows: 'pinned-rows', print: 'print', printOnMenu: 'print', freshRows: 'fresh-rows',
  find: 'find', rowDrag: 'row-drag', dock: 'dock', pivotBar: 'pivot', verticalHeaders: 'vertical-headers',
  filtersPanel: 'filters-panel', rowNumbers: 'row-numbers', quickSearch: 'search', grouping: 'grouping', groupZone: 'grouping',
  tooltips: 'tooltips',
};

const parse = (file) => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
/** The first node of a file that `test` accepts, depth first. */
function find(node, test) {
  if (test(node)) return node;
  return ts.forEachChild(node, (c) => find(c, test));
}
const nameOf = (n) => (n.name && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) ? n.name.text : null);

/** `UPDATE_POLICY`: setting → 'live' | 'fixed'. */
function policy() {
  const decl = find(parse(POLICY), (n) => ts.isVariableDeclaration(n) && n.name.getText() === 'UPDATE_POLICY');
  return Object.fromEntries(decl.initializer.properties.map((p) => [nameOf(p), p.initializer.text]));
}
/** The Angular component's inputs: `readonly x = input…(…)`. */
function angularInputs() {
  const cls = find(parse(ANGULAR), (n) => ts.isClassDeclaration(n) && n.name?.text === 'DzGrid');
  return new Set(cls.members.filter((m) => ts.isPropertyDeclaration(m) && m.initializer && /^input\b/.test(m.initializer.getText())).map(nameOf));
}
/** `<dz-grid>`: setting → its attribute, or 'property' for the element's own properties. */
function elementKeys() {
  const src = parse(ELEMENT);
  const attrs = find(src, (n) => ts.isVariableDeclaration(n) && n.name.getText() === 'ATTRIBUTES');
  const props = find(src, (n) => ts.isVariableDeclaration(n) && n.name.getText() === 'PROPS');
  const out = {};
  for (const p of attrs.initializer.properties) out[p.initializer.elements[0].text] = { attribute: nameOf(p) };
  const list = ts.isAsExpression(props.initializer) ? props.initializer.expression : props.initializer;
  for (const e of list.elements) out[e.text] = { ...out[e.text], property: e.text };
  return out;
}

export function generate() {
  const config = ts.getParsedCommandLineOfConfigFile(join(root, 'packages/dom/tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
  const entries = [...new Set(FEATURES.map(([e]) => join(DOM, `${e}.ts`)))];
  const program = ts.createProgram([SETTINGS, COLUMNS, ...entries], { ...config.options, noEmit: true });
  const checker = program.getTypeChecker();
  const interfaceOf = (file, name) => {
    const node = find(program.getSourceFile(file), (n) => ts.isInterfaceDeclaration(n) && n.name.text === name);
    return checker.getDeclaredTypeOfSymbol(checker.getSymbolAtLocation(node.name));
  };
  const tag = (sym, name) => sym.getJsDocTags(checker).find((t) => t.name === name);
  const tagText = (t) => (t ? ts.displayPartsToString(t.text).trim() : null);
  const doc = (sym) => ts.displayPartsToString(sym.getDocumentationComment(checker)).replace(/\s+/g, ' ').trim();
  const written = (sym) => {
    const d = sym.declarations?.[0];
    return d && d.type ? d.type.getText().replace(/\s+/g, ' ').replace(/; }/g, ' }') : checker.typeToString(checker.getTypeOfSymbol(sym));
  };
  /** The type spelled out when it is one name that hides a short union of values (`Side` → `'start' | 'end'`). */
  const resolved = (sym, type) => {
    if (!/^[A-Z]\w*$/.test(type)) return null;
    const t = checker.typeToString(checker.getNonNullableType(checker.getTypeOfSymbol(sym)), undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias);
    return t !== type && t.length <= 120 && !/^\{/.test(t) ? t : null;
  };
  const record = (sym) => {
    for (const t of sym.getJsDocTags(checker)) if (!KNOWN_TAGS.has(t.name)) throw new Error(`${sym.name}: an unknown JSDoc tag @${t.name} (a stray "@" cuts the comment: write \`@scope/package\`)`);
    const def = tagText(tag(sym, 'default'));
    const type = written(sym);
    return {
      name: sym.name,
      type,
      resolved: resolved(sym, type),
      required: !(sym.flags & ts.SymbolFlags.Optional),
      doc: doc(sym),
      default: def === null ? null : /^\{[a-zA-Z]+\}$/.test(def) ? { token: def.slice(1, -1) } : { code: def },
      source: relative(root, sym.declarations[0].getSourceFile().fileName),
    };
  };

  const live = policy();
  const inputs = angularInputs();
  const element = elementKeys();
  const settings = checker.getPropertiesOfType(interfaceOf(SETTINGS, 'GridSettings')).map((sym) => {
    if (!live[sym.name]) throw new Error(`${sym.name}: no policy in UPDATE_POLICY`);
    return { ...record(sym), live: live[sym.name] === 'live', angular: inputs.has(sym.name), element: element[sym.name] ?? null };
  });
  const columns = checker.getPropertiesOfType(interfaceOf(COLUMNS, 'ColumnDef')).map(record);
  return { settings, columns, features: features(program, checker, record) };
}

/** The keys of a `text: { … }` bundle (`locales/en-*.ts`, `locales/en.ts`): bundle name → its keys. */
function bundles() {
  const out = {};
  for (const file of readdirSync(join(DOM, 'locales')).filter((f) => /^en(-.+)?\.ts$/.test(f))) {
    const text = find(parse(join(DOM, 'locales', file)), (n) => ts.isPropertyAssignment(n) && nameOf(n) === 'text' && ts.isObjectLiteralExpression(n.initializer));
    if (text) out[file === 'en.ts' ? '' : file.slice(3, -3)] = new Set(text.initializer.properties.map(nameOf));
  }
  return out;
}

/**
 * A `*_KEYS` constant's keys, read from its type (a list of string literals, or `readonly SomeMessageKey[]`), or
 * null when it holds no text keys (`THEME_KEYS`: the theme's own keys).
 */
function keysOf(checker, sym) {
  const type = checker.getTypeOfSymbol(sym);
  const elems = checker.isTupleType(type) ? checker.getTypeArguments(type) : checker.isArrayType(type) ? [checker.getTypeArguments(type)[0]] : [];
  const out = elems.flatMap((t) => (t.isUnion() ? t.types : [t])).filter((t) => t.isStringLiteral()).map((t) => t.value);
  return out.length && out.every((k) => k.includes('.')) ? out : null;
}

/**
 * Each feature's facts: its import, its signature, its options (the first parameter's keys, recorded as settings
 * are), its texts bundle (the `locales/<lang>-<name>` holding every key of the entry's `*_KEYS`), its own CSS export.
 */
function features(program, checker, record) {
  const texts = bundles();
  const langs = (b) => ['en', 'fr', 'ar'].filter((l) => existsSync(join(DOM, 'locales', `${l}-${b}.ts`)));
  for (const s of Object.values(SHEETS)) if (!existsSync(join(root, 'packages/theme', `${s}.scss`))) throw new Error(`no @dzgrid/theme/${s}.css`);
  return FEATURES.map(([entry, name]) => {
    const file = program.getSourceFile(join(DOM, `${entry}.ts`));
    const exports = checker.getExportsOfModule(checker.getSymbolAtLocation(file));
    const real = (s) => (s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s);
    const fn = exports.find((s) => s.name === name);
    if (!fn) throw new Error(`@dzgrid/dom/${entry} exports no ${name}`);
    const sym = real(fn);
    const sig = checker.getSignaturesOfType(checker.getTypeOfSymbol(sym), ts.SignatureKind.Call)[0];
    // A ready value (`cellBoolean`, a part) has no call: its type is shown instead.
    // The options are the parameter named `o` (`fill(blocks, o)`, `print(grid, o)`); a function without one has none.
    const param = sig?.parameters.find((p) => p.name === 'o');
    let options = [];
    if (param) {
      const t = checker.getNonNullableType(checker.getTypeOfSymbol(param));
      if (!checker.getSignaturesOfType(t, ts.SignatureKind.Call).length && !(t.flags & ts.TypeFlags.StringLike)) options = checker.getPropertiesOfType(t).map((p) => record(p));
    }
    const keys = exports.filter((s) => /_KEYS$/.test(s.name)).map((s) => keysOf(checker, real(s))).find(Boolean) ?? null;
    let bundle = TEXTS_OF[name] ?? null;
    if (keys && !bundle) {
      bundle = Object.keys(texts).find((b) => b && keys.every((k) => texts[b].has(k))) ?? (keys.every((k) => texts[''].has(k)) ? '' : undefined);
      if (bundle === undefined) throw new Error(`${name}: no texts bundle holds all of its keys`);
    }
    const decl = sym.declarations[0];
    return {
      name,
      entry: `@dzgrid/dom/${entry}`,
      signature: (sig ? `${name}${checker.signatureToString(sig, undefined, ts.TypeFormatFlags.NoTruncation)}` : `${name}: ${checker.typeToString(checker.getTypeOfSymbol(sym))}`).replace(/\s+/g, ' '),
      param: param ? param.name : null,
      options,
      texts: bundle ? { bundle, langs: langs(bundle) } : bundle === '' ? { bundle: '', langs: ['en', 'fr', 'ar'] } : null,
      sheet: SHEETS[name] ? `@dzgrid/theme/${SHEETS[name]}.css` : null,
      css: exports.filter((s) => /_CSS$/.test(s.name)).map((s) => s.name),
      doc: ts.displayPartsToString(sym.getDocumentationComment(checker)).split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim(),
      source: relative(root, decl.getSourceFile().fileName),
    };
  });
}

const text = (data) => JSON.stringify(data, null, 2) + '\n';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const now = text(generate());
  if (process.argv.includes('--check')) {
    let before = '';
    try {
      before = readFileSync(OUT, 'utf8');
    } catch {}
    if (before !== now) {
      console.error(`${relative(root, OUT)} is out of date: run node scripts/gen-options.mjs`);
      process.exit(1);
    }
    console.log('options.json up to date.');
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, now);
    console.log(`${relative(root, OUT)}: written.`);
  }
}
