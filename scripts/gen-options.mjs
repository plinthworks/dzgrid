/**
 * `node scripts/gen-options.mjs`: website/src/generated/options.json, the facts of every setting of `createGrid`
 * and every key of a column definition, read from the sources (docs/website-plan.md, batch 3: the facts generated,
 * the text written; as DzCalendar's gen-options) — the type as written, the comment, the default (the JSDoc
 * `@default`: a code literal, or a `{token}` the site translates), whether `update()` changes it (`UPDATE_POLICY`
 * in packages/dom/src/update.ts), whether it is required, the Angular input of the same name, the `<dz-grid>`
 * attribute or property that sets it, where it is declared. `--check` fails when the file differs.
 */
import ts from 'typescript';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  const program = ts.createProgram([SETTINGS, COLUMNS], { ...config.options, noEmit: true });
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
  return { settings, columns };
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
