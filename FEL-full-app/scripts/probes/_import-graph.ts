// Which source files a route can reach — a static import walk (MIRROR-COACH P1 baseline, 2026-09-25).
//
// "Can a coach add an exercise to the prescribable catalogue from any mounted UI?" is a question about the import graph:
// the only code that POSTs to /api/coach/programs/exercises is lib/hooks/useExerciseLibrary.ts, and it counts only if
// some page Next actually serves imports its way down to it. Grepping for the component name finds the file that
// defines it and the (unmounted) dashboard that holds it, and a reader has to walk the rest by eye. This walks it.
//
// Rules: `@/x` is the app root (tsconfig paths), `./x` and `../x` are relative, anything else is a package and is not
// followed. `import type` / `export type` pull in no code and are not followed. Dynamic `import('x')`, `require('x')`
// and side-effect `import 'x'` are. Extensions tried: .ts .tsx .js .jsx .mts, then /index.*. Pure apart from reading
// the files it is pointed at.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const EXT = ['', '.ts', '.tsx', '.js', '.jsx', '.mts'];
const INDEX = ['/index.ts', '/index.tsx', '/index.js'];

/** Every module specifier a file pulls in at runtime (type-only imports skipped). */
export function runtimeImports(src: string): string[] {
  const out: string[] = [];
  // strip comments so a commented-out import does not count
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const fromRe = /(?:^|[;\n}])\s*(import|export)\s+(type\s+)?([^'";]*?)\s+from\s+['"]([^'"]+)['"]/g;
  for (let m; (m = fromRe.exec(code));) {
    if (m[2]) continue;                                    // import type { … } from / export type { … } from
    const names = m[3].trim();
    if (/^\{\s*(type\s+\w+\s*,?\s*)+\}$/.test(names)) continue;   // import { type A, type B } from — types only
    out.push(m[4]);
  }
  for (const re of [/(?:^|[;\n])\s*import\s+['"]([^'"]+)['"]/g, /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g, /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g]) {
    for (let m; (m = re.exec(code));) out.push(m[1]);
  }
  return out;
}

export function resolveSpecifier(spec: string, fromFile: string, root: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(root, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null;                                        // a package
  for (const e of EXT) { const p = base + e; if (existsSync(p) && statSync(p).isFile()) return p; }
  for (const e of INDEX) { const p = base + e; if (existsSync(p)) return p; }
  return null;
}

/** Every file reachable from `entries` (absolute paths), following runtime imports inside `root`. */
export function reachable(entries: readonly string[], root: string): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    let src = '';
    try { src = readFileSync(f, 'utf8'); } catch { continue; }
    for (const spec of runtimeImports(src)) {
      const to = resolveSpecifier(spec, f, root);
      if (to && !to.includes('/node_modules/') && !seen.has(to)) stack.push(to);
    }
  }
  return seen;
}

const ENTRY = /^(page|layout|template|default|not-found|error|global-error|loading)\.(tsx|ts|jsx|js)$/;

/** Next's served entry files under app/ (pages, layouts, …), split into the dev-only ones (app/dev/**) and the rest. */
export function appEntries(root: string): { served: string[]; devOnly: string[] } {
  const served: string[] = [], devOnly: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== 'api') walk(p); continue; }
      if (!ENTRY.test(name)) continue;
      (relative(root, p).startsWith('app/dev/') ? devOnly : served).push(p);
    }
  };
  walk(join(root, 'app'));
  return { served: served.sort(), devOnly: devOnly.sort() };
}

/** The import graph from every entry at once: file → the files it imports (runtime only). */
export function importGraph(entries: readonly string[], root: string): Map<string, string[]> {
  const edges = new Map<string, string[]>();
  const stack = [...entries];
  while (stack.length) {
    const f = stack.pop()!;
    if (edges.has(f)) continue;
    let src = '';
    try { src = readFileSync(f, 'utf8'); } catch { edges.set(f, []); continue; }
    const to = runtimeImports(src).map((s) => resolveSpecifier(s, f, root)).filter((x): x is string => !!x && !x.includes('/node_modules/'));
    edges.set(f, to);
    for (const t of to) if (!edges.has(t)) stack.push(t);
  }
  return edges;
}

/**
 * For each target file: the served entries that reach it (empty = no page Next serves mounts it), and the import
 * chain from the first such entry. One graph for all entries, walked backwards from each target.
 */
export function whoReaches(targets: readonly string[], root: string): Record<string, { served: string[]; devOnly: string[]; chain: string[] }> {
  const { served, devOnly } = appEntries(root);
  const edges = importGraph([...served, ...devOnly], root);
  const back = new Map<string, string[]>();
  for (const [from, tos] of edges) for (const t of tos) (back.get(t) ?? back.set(t, []).get(t)!).push(from);
  const out: Record<string, { served: string[]; devOnly: string[]; chain: string[] }> = {};
  const servedSet = new Set(served), devSet = new Set(devOnly);
  for (const t of targets) {
    // backwards breadth-first, keeping each file's next hop toward the target so a chain can be printed
    const next = new Map<string, string | null>([[t, null]]);
    const queue = [t];
    while (queue.length) {
      const f = queue.shift()!;
      for (const p of back.get(f) ?? []) if (!next.has(p)) { next.set(p, f); queue.push(p); }
    }
    const s = [...next.keys()].filter((f) => servedSet.has(f)).map((f) => relative(root, f)).sort();
    const d = [...next.keys()].filter((f) => devSet.has(f)).map((f) => relative(root, f)).sort();
    const first = [...next.keys()].find((f) => servedSet.has(f)) ?? [...next.keys()].find((f) => devSet.has(f));
    const chain: string[] = [];
    for (let f: string | null | undefined = first; f; f = next.get(f)) chain.push(relative(root, f));
    out[relative(root, t)] = { served: s, devOnly: d, chain };
  }
  return out;
}

// ── symbol level: which declarations a page actually USES ─────────────────────────────────────────────────────────
//
// A file-level walk says app/training/page.tsx "reaches" the exercise library, because it imports
// components/training/TrainingDashboard.tsx — but only for TrainingClientView, and the library is rendered by a
// different export of that file (TrainingCoachDashboard) that nothing imports. So this walks DECLARATIONS: from each
// page's default export, the identifiers its body uses, through the imports that bind them, into the declarations
// they name. A component is mounted when a served page's default export can get to it this way.
//
// Approximate on purpose, and conservative where it cannot tell: a name it cannot find a declaration for pulls in the
// whole file. Comments are stripped; strings are not (an identifier-shaped word in a string can over-reach, never
// under-reach).

interface Binding { source: string; imported: string }   // imported: 'default' | '*' | a name
interface FileInfo {
  imports: Map<string, Binding>;                           // local name → where it comes from
  decls: Map<string, string>;                              // top-level declared name → its statement text
  reexports: Map<string, Binding>;                         // export { a as b } from 's' → b
  stars: string[];                                         // export * from 's'
  dynamic: string[];                                       // import('s') anywhere
  code: string;
}

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/** Top-level statements, split at depth-0 newlines/semicolons after a declaration keyword. */
function topLevelDecls(code: string): Map<string, string> {
  const decls = new Map<string, string>();
  // positions of top-level statement starts: scan with a brace/paren depth counter, skipping strings and templates
  const starts: number[] = [];
  let depth = 0;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < code.length && code[i] !== q) { if (code[i] === '\\') i++; i++; }
      continue;
    }
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (i === 0 || code[i - 1] === '\n')) starts.push(i);
  }
  starts.push(code.length);
  const declRe = /^\s*(export\s+)?(default\s+)?(async\s+)?(function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/;
  let cur: { name: string; from: number; isDefault: boolean } | null = null;
  const close = (to: number) => {
    if (!cur) return;
    const text = code.slice(cur.from, to);
    decls.set(cur.name, text);
    if (cur.isDefault) decls.set('default', text);
    cur = null;
  };
  for (let k = 0; k < starts.length - 1; k++) {
    const line = code.slice(starts[k], starts[k + 1]);
    const m = declRe.exec(line);
    const defaultOf = /^\s*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/.exec(line);
    if (m) { close(starts[k]); cur = { name: m[5], from: starts[k], isDefault: !!m[2] }; }
    else if (defaultOf) { close(starts[k]); decls.set('default', defaultOf[1]); }
    else if (/^\s*(import|export)\b/.test(line)) close(starts[k]);
  }
  close(code.length);
  return decls;
}

function fileInfo(file: string, root: string, cache: Map<string, FileInfo>): FileInfo {
  const hit = cache.get(file);
  if (hit) return hit;
  let src = '';
  try { src = readFileSync(file, 'utf8'); } catch { /* unreadable: empty */ }
  const code = stripComments(src);
  const imports = new Map<string, Binding>(), reexports = new Map<string, Binding>(), stars: string[] = [], dynamic: string[] = [];
  const res = (spec: string) => resolveSpecifier(spec, file, root);
  const importRe = /(?:^|[;\n])\s*import\s+(?!type\s)([^'";]*?)\s+from\s+['"]([^'"]+)['"]/g;
  for (let m; (m = importRe.exec(code));) {
    const source = res(m[2]); if (!source || source.includes('/node_modules/')) continue;
    let clause = m[1].trim();
    const ns = /\*\s+as\s+([\w$]+)/.exec(clause);
    if (ns) { imports.set(ns[1], { source, imported: '*' }); clause = clause.replace(ns[0], ''); }
    const named = /\{([^}]*)\}/.exec(clause);
    if (named) {
      for (const part of named[1].split(',')) {
        const p = part.trim(); if (!p || p.startsWith('type ')) continue;
        const [a, b] = p.split(/\s+as\s+/);
        imports.set((b ?? a).trim(), { source, imported: a.trim() });
      }
      clause = clause.replace(named[0], '');
    }
    const def = /^([A-Za-z_$][\w$]*)/.exec(clause.replace(/^[\s,]+/, ''));
    if (def) imports.set(def[1], { source, imported: 'default' });
  }
  const reRe = /(?:^|[;\n])\s*export\s+(?!type\s)(\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g;
  for (let m; (m = reRe.exec(code));) {
    const source = res(m[2]); if (!source || source.includes('/node_modules/')) continue;
    if (m[1] === '*') { stars.push(source); continue; }
    for (const part of m[1].slice(1, -1).split(',')) {
      const p = part.trim(); if (!p || p.startsWith('type ')) continue;
      const [a, b] = p.split(/\s+as\s+/);
      reexports.set((b ?? a).trim(), { source, imported: a.trim() });
    }
  }
  for (const m of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) { const s = res(m[1]); if (s && !s.includes('/node_modules/')) dynamic.push(s); }
  const info: FileInfo = { imports, decls: topLevelDecls(code), reexports, stars, dynamic, code };
  cache.set(file, info);
  return info;
}

/** Every (file, declaration) the default exports of `entries` use, transitively. Keys are "file#name". */
export function usedDeclarations(entries: readonly string[], root: string): Set<string> {
  const cache = new Map<string, FileInfo>();
  const seen = new Set<string>();
  const stack: [string, string][] = entries.map((e) => [e, 'default']);
  while (stack.length) {
    const [file, name] = stack.pop()!;
    const key = `${file}#${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const info = fileInfo(file, root, cache);
    if (name !== '*' && !info.decls.has(name)) {
      const re = info.reexports.get(name);
      if (re) { stack.push([re.source, re.imported]); continue; }
      if (info.stars.length) { for (const s of info.stars) stack.push([s, name]); continue; }
    }
    // the text this declaration runs: itself, or the whole file when it cannot be found (or '*' was asked for)
    const text = name === '*' || !info.decls.has(name) ? info.code : info.decls.get(name)!;
    const aliasOf = name === 'default' && info.decls.get('default') && /^[A-Za-z_$][\w$]*$/.test(info.decls.get('default')!) ? info.decls.get('default')! : null;
    if (aliasOf) { stack.push([file, aliasOf]); continue; }
    for (const id of new Set(text.match(/[A-Za-z_$][\w$]*/g) ?? [])) {
      const b = info.imports.get(id);
      if (b) stack.push([b.source, b.imported]);
      else if (id !== name && info.decls.has(id)) stack.push([file, id]);
    }
    for (const m of text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const s = resolveSpecifier(m[1], file, root); if (s && !s.includes('/node_modules/')) stack.push([s, '*']);
    }
  }
  return seen;
}

/** Is a declaration used from any served page? Per target "file#name": the served and dev-only pages that use it. */
export function whoMounts(targets: readonly { file: string; name: string }[], root: string): Record<string, { served: string[]; devOnly: string[] }> {
  const { served, devOnly } = appEntries(root);
  const out: Record<string, { served: string[]; devOnly: string[] }> = {};
  for (const t of targets) out[`${relative(root, t.file)}#${t.name}`] = { served: [], devOnly: [] };
  for (const [list, key] of [[served, 'served'], [devOnly, 'devOnly']] as const) {
    for (const e of list) {
      const used = usedDeclarations([e], root);
      for (const t of targets) {
        if (used.has(`${t.file}#${t.name}`) || used.has(`${t.file}#*`)) out[`${relative(root, t.file)}#${t.name}`][key].push(relative(root, e));
      }
    }
  }
  return out;
}

/** Source files under `dirs` whose code matches `re` (a POST to one endpoint, say). */
export function filesMatching(root: string, dirs: readonly string[], re: RegExp): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== 'node_modules' && !name.startsWith('.')) walk(p); continue; }
      if (!/\.(tsx?|jsx?|mts)$/.test(name) || /\.test\.|\.suite\./.test(name)) continue;
      if (re.test(readFileSync(p, 'utf8'))) hits.push(p);
    }
  };
  for (const d of dirs) walk(join(root, d));
  return hits.sort();
}

/** The one question: which files POST to the prescribable catalogue, and which served pages reach them. */
export const CATALOGUE_POST = /fetch\(\s*['"`]\/api\/coach\/programs\/exercises['"`]\s*,\s*\{[^}]*method:\s*['"]POST['"]/s;
