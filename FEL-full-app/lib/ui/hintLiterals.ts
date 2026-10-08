// hintLiterals — every string a mode file can put in its HUD `hint`, read from the source (controls-screen, console-view
// lane, 2026-10-06). Test support for controlsScreen.scan.test.ts: the guard that sorts each one as a static button map
// (kept off the play screen, lib/babylon/ui/staticControls.ts) or a live prompt (left alone). Pure text scanning, no
// TypeScript compiler: the shapes it reads are `hint: <expr>`, `const fooHint = <expr>`, `function fooHint() { … }`.

/** A string literal as written; a template literal's `${…}` holes become `${}`. */
function readLiteral(src: string, i: number): { text: string; end: number } {
  const q = src[i];
  let text = '';
  let j = i + 1;
  while (j < src.length && src[j] !== q) {
    if (src[j] === '\\') { text += src[j + 1]; j += 2; continue; }
    if (q === '`' && src[j] === '$' && src[j + 1] === '{') {
      let depth = 1; j += 2;
      while (j < src.length && depth > 0) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') depth--;
        else if (src[j] === '`' || src[j] === "'" || src[j] === '"') { j = readLiteral(src, j).end; continue; }
        j++;
      }
      text += '${}';
      continue;
    }
    text += src[j]; j++;
  }
  return { text, end: j + 1 };
}

/** The literals in one expression, from `i` to the `,` `;` or closing bracket that ends it at depth 0. */
function literalsOfExpression(src: string, i: number, stopAtBlockEnd = false): string[] {
  const out: string[] = [];
  let depth = 0;
  for (let j = i; j < src.length;) {
    const ch = src[j];
    if (ch === "'" || ch === '"' || ch === '`') { const l = readLiteral(src, j); out.push(l.text); j = l.end; continue; }
    if (ch === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); if (j < 0) break; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') { if (depth === 0) break; depth--; if (depth === 0 && stopAtBlockEnd) break; }
    else if ((ch === ',' || ch === ';') && depth === 0) break;
    j++;
  }
  return out;
}

export interface HintLiteral { text: string; line: number }

export function hintLiterals(src: string): HintLiteral[] {
  const out: HintLiteral[] = [];
  const lineAt = (i: number) => src.slice(0, i).split('\n').length;
  const add = (i: number, texts: string[]) => { for (const t of texts) if (t.trim()) out.push({ text: t, line: lineAt(i) }); };
  // hint: <expr>   (not boostHint:, not a type annotation `hint: string`)
  for (const m of src.matchAll(/(?<![A-Za-z0-9_$.])hint\s*:\s*/g)) {
    const at = m.index! + m[0].length;
    if (/^(string|number|boolean)\b/.test(src.slice(at, at + 8))) continue;
    add(at, literalsOfExpression(src, at));
  }
  // const fooHint = <expr> / const HINT_FOO = <expr>
  for (const m of src.matchAll(/\bconst\s+(\w*[Hh]int\w*|HINT_\w+|\w+_HINT)\s*(?::[^=]+)?=\s*/g)) {
    const at = m.index! + m[0].length;
    add(at, literalsOfExpression(src, at));
  }
  // function fooHint(...) { ... }
  for (const m of src.matchAll(/\bfunction\s+\w*[Hh]int\w*\s*\([^)]*\)[^{]*\{/g)) {
    const at = m.index! + m[0].length;
    add(at, literalsOfExpression(src, at - 1, true));
  }
  return out;
}
