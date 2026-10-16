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

const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|light-dark|color)\(/i;
const COLOUR_PROPS = /^(color|background|backgroundColor|border(?:Block|Inline)?(?:Start|End)?(?:Color)?|outline(?:Color)?|fill|stroke|caretColor|accentColor|boxShadow|textShadow)$/;
const COLOUR_CSS = /^(color|background(-color)?|border(-[a-z]+)*(-color)?|outline(-color)?|fill|stroke|caret-color|accent-color|box-shadow|text-shadow)$/;
/** CSS text that sets a colour: `color: …`, `background: …`. */
const COLOUR_DECL = /(^|[;{\s])(color|background(-color)?|border(-[a-z]+)*(-color)?|outline(-color)?|fill|stroke)\s*:/i;
const TEXT_PROPS = new Set(['textContent', 'innerText', 'title', 'ariaLabel', 'placeholder', 'ariaPlaceholder', 'ariaRoleDescription', 'ariaValueText', 'ariaDescription', 'alt', 'nodeValue', 'data', 'aria-label', 'aria-placeholder', 'aria-roledescription', 'aria-valuetext', 'aria-description']);
const TEXT_ATTRS = new Set(['aria-label', 'aria-placeholder', 'title', 'placeholder', 'aria-roledescription', 'aria-valuetext', 'aria-description', 'alt']);
const TEXT_CALLS = new Set(['createTextNode', 'append', 'prepend', 'replaceChildren', 'before', 'after', 'replaceWith', 'insertAdjacentText']);
/** Physical names, as properties: `.left`, `.scrollLeft`, `.marginRight`, `.x`, `.clientX`, `.deltaX`, `.scrollX`… */
const PHYSICAL_PROP = /^(left|right|x)$|[a-z](Left|Right)$|^(client|page|screen|offset|movement|layer|delta|scroll)X$|^pageXOffset$|^cssFloat$/;
/** Physical CSS in strings: the words, `translateX(`, `translate(` and `translate3d(`. */
const PHYSICAL_TEXT = /\b(left|right)\b|\btranslate(X|3d)?\(/i;
/** Two- and four-value margin, padding and inset shorthands set an inline side by position. */
const SHORTHAND_PROPS = new Set(['margin', 'padding', 'inset', 'borderWidth', 'borderRadius', 'borderStyle', 'borderColor']);
const ARROWS = /^Arrow(Left|Right)$/;
const HTML = new Set(['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'setHTMLUnsafe', 'createContextualFragment', 'parseFromString', 'srcdoc']);
const INVISIBLE = /[\u00A0\u00AD\u061C\u200B-\u200F\u202A-\u202F\u2060-\u2069\u2007\u2009\uFEFF]/;
const MARK = /\p{M}/u;

const hasLetters = (s: string): boolean => /\p{L}/u.test(s);
const COMPARE = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.LessThanToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanEqualsToken, ts.SyntaxKind.InKeyword, ts.SyntaxKind.InstanceOfKeyword]);

/**
 * Literal text an expression can evaluate to: string literals and template
 * parts in value positions. Not a call's arguments (`msg(m, 'grid.label')`
 * passes a key), not a condition, a comparison, a `typeof` or an index.
 */
function literalTexts(node: ts.Node): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return void out.push(n.text);
    if (ts.isTemplateExpression(n)) {
      out.push(n.head.text, ...n.templateSpans.map((s) => s.literal.text));
      return n.templateSpans.forEach((s) => visit(s.expression));
    }
    if (ts.isCallExpression(n) || ts.isTypeOfExpression(n)) return;
    if (ts.isElementAccessExpression(n)) return visit(n.expression);
    if (ts.isConditionalExpression(n)) return void (visit(n.whenTrue), visit(n.whenFalse));
    if (ts.isBinaryExpression(n) && COMPARE.has(n.operatorToken.kind)) return;
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

/** A property's name: `a.b`, `a['b']`, `{ b: … }`, `{ b }` in a pattern. */
const propName = (n: ts.Node): string | null =>
  ts.isPropertyAccessExpression(n) ? n.name.text
    : ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression) ? n.argumentExpression.text
      : null;
const camel = (s: string): string => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const isStyle = (n: ts.Expression): boolean => propName(n) === 'style' || (ts.isIdentifier(n) && n.text === 'style');

export interface Finding { readonly rule: Rule; readonly line: number; readonly why: string }

export function checkSource(source: string, file: string): Finding[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const out: Finding[] = [];
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const add = (rule: Rule, n: ts.Node, why: string) => out.push({ rule, line: at(n), why });
  const isDir = /(^|\/)dir\.ts$/.test(file);
  const isKeys = /(^|\/)keys\//.test(file);
  // Translations may hold any letter or mark, and say left or right in their language.
  const isLocale = /(^|\/)locales\//.test(file);

  const physicalName = (n: ts.Node, name: string) => {
    if (!isDir && PHYSICAL_PROP.test(name)) add('physical', n, name);
  };

  const visit = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      const text = n.text;
      if (COLOUR.test(text)) add('colour', n, `colour literal "${text}"`);
      if (HTML.has(text) && ts.isElementAccessExpression(n.parent)) add('html', n, text);
      if (!isDir && !isLocale) {
        if (ARROWS.test(text)) { if (!isKeys) add('physical', n, `"${text}" outside keys/`); }
        else if (PHYSICAL_TEXT.test(text)) add('physical', n, `"${text}"`);
      }
    }
    // Property names only: a local `left` in a binary search is no side.
    if (ts.isPropertyAccessExpression(n)) {
      physicalName(n.name, n.name.text);
      if (HTML.has(n.name.text)) add('html', n.name, n.name.text);
      if ((n.name.text === 'write' || n.name.text === 'writeln') && /^(document|doc|ownerDocument)$/.test(propName(n.expression) ?? (ts.isIdentifier(n.expression) ? n.expression.text : ''))) add('html', n.name, 'document.write');
    }
    if (ts.isBindingElement(n) && ts.isObjectBindingPattern(n.parent)) {
      const name = n.propertyName ?? n.name;
      if (ts.isIdentifier(name)) physicalName(name, name.text);
    }
    if (ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) {
      const name = ts.isIdentifier(n.name) || ts.isStringLiteral(n.name) ? n.name.text : null;
      if (name && TEXT_PROPS.has(name) && ts.isPropertyAssignment(n) && literalTexts(n.initializer).some(hasLetters)) add('literal-text', n, `{ ${name}: literal text }`);
    }
    if (ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.EqualsToken || n.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken)) {
      const name = propName(n.left);
      if (name && TEXT_PROPS.has(name) && literalTexts(n.right).some(hasLetters)) add('literal-text', n, `${name} = literal text`);
      if (name && ts.isPropertyAccessExpression(n.left) || ts.isElementAccessExpression(n.left)) {
        const target = (n.left as ts.PropertyAccessExpression | ts.ElementAccessExpression).expression;
        if (name && isStyle(target)) {
          if (COLOUR_PROPS.test(camel(name))) add('colour', n, `style.${name}`);
          if (name === 'cssText' && literalTexts(n.right).some((t) => COLOUR_DECL.test(t))) add('colour', n, 'style.cssText with a colour');
          if (SHORTHAND_PROPS.has(camel(name)) && literalTexts(n.right).some((t) => t.trim().split(/\s+/).length >= 2)) add('physical', n, `style.${name} shorthand`);
          if (camel(name) === 'textAlign' || camel(name) === 'float') physicalName(n.left, 'cssFloat');
        }
      }
    }
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === 'Text' || n.expression.text === 'Option') && n.arguments?.some((a) => literalTexts(a).some(hasLetters))) add('literal-text', n, `new ${n.expression.text}(literal text)`);
    if (ts.isCallExpression(n)) {
      const callee = propName(n.expression) ?? (ts.isIdentifier(n.expression) ? n.expression.text : null);
      const [a0, a1] = n.arguments;
      if (callee === 'setAttribute' && a0 && ts.isStringLiteral(a0) && a1) {
        if (TEXT_ATTRS.has(a0.text) && literalTexts(a1).some(hasLetters)) add('literal-text', n, `setAttribute('${a0.text}', literal text)`);
        if (a0.text === 'style' && literalTexts(a1).some((t) => COLOUR_DECL.test(t))) add('colour', n, "setAttribute('style') with a colour");
      }
      if (callee === 'setProperty' && a0 && ts.isStringLiteral(a0) && COLOUR_CSS.test(a0.text)) add('colour', n, `style.setProperty('${a0.text}')`);
      if (callee && TEXT_CALLS.has(callee)) {
        const args = callee === 'insertAdjacentText' ? n.arguments.slice(1) : n.arguments;
        if (args.some((a) => literalTexts(a).some(hasLetters))) add('literal-text', n, `${callee}(literal text)`);
      }
      if (callee === 'assign' && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === 'Object') {
        // Object.assign(el, { title: … }) is caught by the property rule above.
      }
      if (!isDir && (callee === 'scrollBy' || callee === 'scrollTo' || callee === 'scroll') && n.arguments.length >= 2) add('physical', n, `${callee}(x, y)`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  // Comments are skipped by the scanner, not by lines: a trailing `// …` may say anything.
  const code = stripComments(source);
  code.split('\n').forEach((line, i) => {
    if (INVISIBLE.test(source.split('\n')[i] ?? '')) out.push({ rule: 'invisible', line: i + 1, why: 'raw invisible or bidi-control character' });
    else if (!isLocale && MARK.test(line)) out.push({ rule: 'invisible', line: i + 1, why: 'raw combining mark outside a comment' });
  });
  return out;
}

/** The source with every comment blanked, lines kept. */
function stripComments(source: string): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);
  let out = '';
  for (let k = scanner.scan(); k !== ts.SyntaxKind.EndOfFileToken; k = scanner.scan()) {
    const t = scanner.getTokenText();
    out += k === ts.SyntaxKind.SingleLineCommentTrivia || k === ts.SyntaxKind.MultiLineCommentTrivia ? t.replace(/[^\n]/g, ' ') : t;
  }
  return out;
}

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
