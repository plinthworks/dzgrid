import ts from 'typescript';

/**
 * The DOM layer's five rules, read from its sources with TypeScript's parser
 * (a comment may say anything; `el['inner' + 'HTML']` is not what we fear —
 * a slip of habit is):
 *
 * - `colour`: no colour literal, no colour written through `style`: colours
 *   are the theme's (`--tz-*`, `--dzg-*`);
 * - `literal-text`: no string literal with letters reaching visible text
 *   (`textContent`, `title`, `aria-label`…): text is the messages' (§3.9);
 * - `physical`: no left or right outside `dir.ts`, no `ArrowLeft`/`ArrowRight`
 *   outside `keys/`: right to left is the same code (§3.9);
 * - `html`: no `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
 *   `document.write`: cells hold user data (§7.1);
 * - `invisible`: no invisible or bidi-control character typed raw, no raw
 *   combining mark outside comments (written as escapes).
 */
export type Rule = 'colour' | 'literal-text' | 'physical' | 'html' | 'invisible';

const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i;
const COLOUR_PROPS = /^(color|background|backgroundColor|borderColor|border(?:Block|Inline)?(?:Start|End)?Color|outlineColor|fill|stroke|caretColor|accentColor)$/;
const COLOUR_CSS = /^(color|background(-color)?|border(-[a-z]+)*-color|outline-color|fill|stroke|caret-color|accent-color)$/;
const TEXT_PROPS = new Set(['textContent', 'innerText', 'title', 'ariaLabel', 'placeholder', 'ariaRoleDescription', 'ariaValueText', 'ariaDescription', 'alt', 'nodeValue', 'data']);
const TEXT_ATTRS = new Set(['aria-label', 'title', 'placeholder', 'aria-roledescription', 'aria-valuetext', 'aria-description', 'alt']);
/** Physical names: `left`, `right`, `scrollLeft`, `marginRight`, `clientX`… */
const PHYSICAL_NAME = /^(left|right)$|[a-z](Left|Right)$|^(client|page|screen|offset|movement)X$/;
const PHYSICAL_TEXT = /\b(left|right)\b/i;
const ARROWS = /^Arrow(Left|Right)$/;
const HTML = new Set(['innerHTML', 'outerHTML', 'insertAdjacentHTML']);
const INVISIBLE = /[\u00A0\u061C\u200B-\u200F\u202A-\u202F\u2060-\u2069\u2007\u2009\uFEFF]/;
const MARK = /\p{M}/u;

const hasLetters = (s: string): boolean => /\p{L}/u.test(s);

/** Literal text inside an expression: string literals and template heads, spans and tails. */
function literalTexts(node: ts.Node): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text);
    else if (ts.isTemplateExpression(n)) {
      out.push(n.head.text, ...n.templateSpans.map((s) => s.literal.text));
      n.templateSpans.forEach((s) => visit(s.expression));
      return;
    }
    // A call's arguments are its own business (`msg(m, 'grid.label')` is a key, not text).
    if (ts.isCallExpression(n)) return;
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

const nameOf = (n: ts.Expression): string | null =>
  ts.isPropertyAccessExpression(n) ? n.name.text : ts.isElementAccessExpression(n) && ts.isStringLiteral(n.argumentExpression) ? n.argumentExpression.text : null;

export interface Finding { readonly rule: Rule; readonly line: number; readonly why: string }

export function checkSource(source: string, file: string): Finding[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const out: Finding[] = [];
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const add = (rule: Rule, n: ts.Node, why: string) => out.push({ rule, line: at(n), why });
  const isDir = /(^|\/)dir\.ts$/.test(file);
  const isKeys = /(^|\/)keys\//.test(file);

  const visit = (n: ts.Node): void => {
    // Strings: colours, physical words, arrows.
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      const text = n.text;
      if (COLOUR.test(text)) add('colour', n, `colour literal "${text}"`);
      if (!isDir) {
        if (ARROWS.test(text)) { if (!isKeys) add('physical', n, `"${text}" outside keys/`); }
        else if (PHYSICAL_TEXT.test(text)) add('physical', n, `"${text}"`);
      }
    }
    // Names: physical properties and identifiers, HTML sinks.
    if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) {
      const t = n.text;
      if (!isDir && PHYSICAL_NAME.test(t)) add('physical', n, t);
      if (HTML.has(t)) add('html', n, t);
      if (t === 'write' || t === 'writeln') {
        const p = n.parent;
        if (ts.isPropertyAccessExpression(p) && p.name === n && ts.isIdentifier(p.expression) && p.expression.text === 'document') add('html', n, 'document.write');
      }
    }
    // Assignments: `x.textContent = 'Text'`, `el.style.color = …`.
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const name = nameOf(n.left);
      if (name && TEXT_PROPS.has(name) && literalTexts(n.right).some(hasLetters)) add('literal-text', n, `${name} = literal text`);
      if (name && COLOUR_PROPS.test(name) && ts.isPropertyAccessExpression(n.left) && nameOf(n.left.expression) === 'style') add('colour', n, `style.${name}`);
    }
    if (ts.isCallExpression(n)) {
      const callee = nameOf(n.expression);
      const [a0, a1] = n.arguments;
      if (callee === 'setAttribute' && a0 && ts.isStringLiteral(a0) && TEXT_ATTRS.has(a0.text) && a1 && literalTexts(a1).some(hasLetters)) add('literal-text', n, `setAttribute('${a0.text}', literal text)`);
      if (callee === 'setProperty' && a0 && ts.isStringLiteral(a0) && COLOUR_CSS.test(a0.text)) add('colour', n, `style.setProperty('${a0.text}')`);
      if ((callee === 'createTextNode' || callee === 'append' || callee === 'prepend' || callee === 'replaceChildren') && n.arguments.some((a) => literalTexts(a).some(hasLetters) && (ts.isStringLiteral(a) || ts.isTemplateLiteral(a)))) add('literal-text', n, `${callee}(literal text)`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  source.split('\n').forEach((line, i) => {
    if (INVISIBLE.test(line) || (!/^\s*(\*|\/\*\*|\/\/)/.test(line) && MARK.test(line))) out.push({ rule: 'invisible', line: i + 1, why: 'raw invisible or combining character' });
  });
  return out;
}

/**
 * The theme's SCSS: no colour outside the `$tz-palette` map, no physical side.
 * Line based: SCSS is not parsed here, comments are stripped first.
 */
export function checkScss(source: string): Finding[] {
  const out: Finding[] = [];
  const text = source.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  let inPalette = false;
  let depth = 0;
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\/\/.*$/, '');
    if (/^\s*\$tz-palette\s*:/.test(line)) inPalette = true;
    if (inPalette) {
      depth += (line.match(/\(/g) ?? []).length - (line.match(/\)/g) ?? []).length;
      if (depth <= 0 && /;/.test(line)) inPalette = false;
    } else if (COLOUR.test(line)) out.push({ rule: 'colour', line: i + 1, why: line.trim() });
    if (/(^|[^-\w])(left|right)\b|-(left|right)\b|\b(text-align|float|clear)\s*:\s*(left|right)/.test(line)) out.push({ rule: 'physical', line: i + 1, why: line.trim() });
  });
  return out;
}
