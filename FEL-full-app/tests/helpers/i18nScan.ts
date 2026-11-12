// The hard-coded-text scanner behind tests/i18n-ratchet.test.ts (A11-07). It parses with the TypeScript compiler the repo
// already has (no new dependency) rather than with regular expressions, so a `<` in a comparison or an apostrophe in a
// sentence cannot fool it, and it reports what a player would read:
//   - JSX text with a letter in it                                 <p>Pick your lane</p>
//   - a string in a JSX attribute a person reads                   aria-label="Sign out"   title="…"   placeholder="…"
//   - prose in a string literal anywhere else in the file          label: 'Play'   const L = { reduce: 'Reduced' }
// and NOT: class lists, paths and URLs, keys and ids, comparisons against a one-word state ('authenticated'), the
// argument of t() (a message key), imports, or anything in a comment.
import ts from 'typescript';

export interface TextHit { line: number; text: string; kind: 'jsx-text' | 'attr' | 'literal' }

/** Attributes whose string value is never read by a person. */
const NON_TEXT_ATTRS = new Set([
  'className', 'class', 'href', 'src', 'id', 'key', 'type', 'role', 'rel', 'target', 'style', 'sizes', 'd', 'viewBox', 'fill',
  'stroke', 'as', 'method', 'name', 'value', 'htmlFor', 'mode', 'variant', 'size', 'accent', 'tab', 'initialFamily',
  'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-live', 'aria-current', 'aria-hidden', 'autoComplete',
  'inputMode', 'lang', 'dir', 'tone', 'layout', 'height', 'width', 'loading', 'decoding', 'strokeWidth', 'callbackUrl',
]);

/** A string that is a class list, a path, a key or an identifier rather than words. */
function notProse(s: string): boolean {
  const t = s.trim();
  if (!/[A-Za-z]{2,}/.test(t)) return true;
  if (/^(\/|https?:|#|\.|@|data:|mailto:)/.test(t)) return true;
  const tokens = t.split(/\s+/);
  // a class list: every token is lowercase/digits with -, :, /, [], ., %, !, (), _ and at least one token has - or :
  if (tokens.every((w) => /^[a-z0-9:\-/[\].%!()_#,>&*=+~'"]+$/.test(w)) && tokens.some((w) => /[-:[\]/]/.test(w))) return true;
  // one lowercase word or a dotted / dashed key: a state, an id, a message key
  if (tokens.length === 1 && /^[a-z0-9_.\-:/]+$/.test(t)) return true;
  // a CSS value or a colour
  if (/^(rgba?|hsla?|var|calc|linear-gradient|radial-gradient|repeating-)/.test(t)) return true;
  return false;
}

function attrName(n: ts.Node): string | null {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    if (ts.isJsxAttribute(p)) return p.name.getText();
    if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) || ts.isCallExpression(p) || ts.isPropertyAssignment(p)) return null;
  }
  return null;
}

function insideCallTo(n: ts.Node, names: readonly string[]): boolean {
  const p = n.parent;
  return !!p && ts.isCallExpression(p) && names.includes(p.expression.getText());
}

/** Every piece of hard-coded, user-facing text in a TS / TSX source. */
export function hardCodedText(source: string, fileName = 'x.tsx'): TextHit[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits: TextHit[] = [];
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (n: ts.Node) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isJsxText(n)) {
      const t = n.getText(sf).replace(/\s+/g, ' ').trim();
      if (/[A-Za-z]/.test(t)) hits.push({ line: line(n), text: t, kind: 'jsx-text' });
      return;
    }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const text = n.text;
      if (ts.isExpressionStatement(n.parent)) return;   // a directive ('use client')
      const attr = attrName(n);
      if (attr !== null) {
        if (!NON_TEXT_ATTRS.has(attr) && !attr.startsWith('data-') && !notProse(text)) hits.push({ line: line(n), text, kind: 'attr' });
        return;
      }
      if (insideCallTo(n, ['t', 'require', 'import', 'querySelector', 'querySelectorAll', 'getItem', 'setItem', 'matchMedia', 'addEventListener', 'removeEventListener', 'startsWith', 'includes', 'getAttribute', 'setAttribute', 'removeAttribute', 'setProperty', 'removeProperty'])) return;
      if (ts.isPropertyAssignment(n.parent) && n.parent.name === n) return;   // a key
      if (ts.isElementAccessExpression(n.parent)) return;
      if (ts.isLiteralTypeNode(n.parent)) return;                              // a type, not a value
      if (ts.isCaseClause(n.parent) || ts.isBinaryExpression(n.parent) && /^(===|!==|==|!=)$/.test(n.parent.operatorToken.getText(sf))) {
        if (!/\s/.test(text)) return;   // a comparison with a one-word state
      }
      if (!notProse(text) && (/\s/.test(text.trim()) || /^[A-Z]/.test(text.trim()))) hits.push({ line: line(n), text, kind: 'literal' });
      return;
    }
    if (ts.isTemplateExpression(n)) {
      const parts = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' ').trim();
      const attr = attrName(n);
      if (attr !== null && (NON_TEXT_ATTRS.has(attr) || attr.startsWith('data-'))) { n.templateSpans.forEach((s) => visit(s.expression)); return; }
      if (!notProse(parts) && /[A-Za-z]{3,}\s+[A-Za-z]/.test(parts)) hits.push({ line: line(n), text: parts, kind: 'literal' });
      n.templateSpans.forEach((s) => visit(s.expression));
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}
