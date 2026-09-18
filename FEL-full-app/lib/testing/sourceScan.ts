// SOURCE SCANNING for rule tests — safely (2026-09-13).
//
// Several tests in this tree enforce rules on the SOURCE rather than on behaviour: no mode keeps its own
// profile, no file outside lib/input reads a raw button index, every ENABLED mode has a host. They all need
// to ignore comments, because a rule about what the code DOES must not be satisfiable — or breakable — by
// prose. (CheckIn.ts's own sentence "There is no watchPosition in this module" broke one of them once.)
//
// My first stripper was `src.replace(/\/\*[\s\S]*?\*\//g, '')`, and it was quietly catastrophic: measured on
// this repo it cut components/games/karate-babylon.tsx from 185 lines to 86 and REMOVED THE `MODES.karate`
// call the test was looking for. A regex cannot tell a comment from a `/*` inside a string, a URL, a regex
// literal or a JSX attribute, so it mispairs and eats live code — and a source test that silently loses the
// code it is inspecting does not fail, it PASSES. That is the worst possible failure mode for a guard.
//
// So: a line-oriented state machine. It never spans further than the block comment actually goes, it keeps
// the line structure the callers report on, and when it is unsure it keeps the code rather than dropping it.

/**
 * Strip comments from TypeScript/TSX source, conservatively.
 *
 * Lines become empty rather than disappearing, so reported line numbers still match the original file.
 */
export function stripComments(src: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of src.split('\n')) {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end < 0) { out.push(''); continue; }
      line = line.slice(end + 2);
      inBlock = false;
    }
    // walk the line, respecting quotes so a `/*` inside a string is not a comment
    let result = '';
    let quote: string | null = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i], next = line[i + 1];
      if (quote) {
        result += c;
        if (c === '\\') { result += next ?? ''; i++; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { quote = c; result += c; continue; }
      if (c === '/' && next === '/') break;                       // line comment: drop the rest
      if (c === '/' && next === '*') {
        const end = line.indexOf('*/', i + 2);
        if (end < 0) { inBlock = true; i = line.length; break; }
        i = end + 1;                                              // skip the block, stay on this line
        continue;
      }
      result += c;
    }
    out.push(result);
  }
  return out.join('\n');
}

/** Every .ts/.tsx file under `dirs`, excluding tests and node_modules. Paths are relative to `root`. */
export function sourceFiles(root: string, dirs: string[], fs: typeof import('node:fs'), path: typeof import('node:path')): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.')) files.push(rel);
    }
  };
  for (const d of dirs) walk(d);
  return files;
}
