import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { CURRICULUM, allLessons } from './blueprint';
import { bankRefs, lessonQuestions } from './assessments';

/**
 * HOTFIX (2026-09-24): THE ANSWER KEY STAYS ON THE SERVER — proved without a build.
 *
 * The paid facilitator certification's answer key shipped to every browser because a 'use client' page
 * (components/camp/camp-view.tsx) imported lib/curriculum/blueprint.ts, which carried it. The key now lives
 * in lib/curriculum/assessments.ts. Next's `import 'server-only'` guard would fail a production build if
 * a client module reached it, but a build is minutes and nobody runs one per edit; this walks the same
 * import graph in about a second.
 *
 * It starts from EVERY 'use client' module under app/, components/, hooks/ and lib/ (not just camp-view:
 * the next page to import the key will be a different one), follows relative and '@/' imports, re-exports
 * and dynamic import('…') with a literal path, and fails if any of them reaches the key. Package imports
 * (node_modules) are not followed — the key is not in a package.
 *
 * HOTFIX (2026-09-24): the edges come from TypeScript's own parser, not from regexes. The first version
 * matched `import … from '…'` with a pattern that stopped at any quote, so an import whose brace list held
 * a comment with an apostrophe ("// the grader's key") was invisible to it — a server page importing the
 * key that way passed every test here. The same blind spot was already hiding real imports in this repo
 * (OneVOneMode → HandleSystem). A parser sees exactly the imports the bundler sees, and never mistakes a
 * comment or a string for one; the self-test below pins that on a fixture.
 */

const ROOT = resolve(__dirname, '../..');
const KEY_FILE = 'lib/curriculum/assessments.ts';
const CLIENT_ROOTS = ['app', 'components', 'hooks', 'lib'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.next-lb', '.next-prod', '.next-verify', '.next-rc2', '.build', 'dist']);
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkFiles(p, out);
    else if (CODE.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

function parse(fileName: string, src: string): ts.SourceFile {
  const kind = /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX
    : /\.jsx$/.test(fileName) ? ts.ScriptKind.JSX
    : /\.[cm]?js$/.test(fileName) ? ts.ScriptKind.JS
    : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, false, kind);
}

/** A 'use client' directive in the file's directive prologue (the leading string-literal statements), as Next reads it. */
function isClientModule(fileName: string, src: string): boolean {
  for (const st of parse(fileName, src).statements) {
    if (!ts.isExpressionStatement(st) || !ts.isStringLiteral(st.expression)) return false;
    if (st.expression.text === 'use client') return true;
  }
  return false;
}

/**
 * Every module specifier the file names: static imports and re-exports, `import x = require('…')`,
 * dynamic `import('…')` and `require('…')` with a literal path, and `import('…')` types. Type-only imports
 * count too — stricter than the bundler (which erases them) on purpose: a type the client needs belongs in
 * a client-safe module, not next to the answers.
 */
function specifiers(fileName: string, src: string): string[] {
  const out: string[] = [];
  const literal = (e: ts.Node | undefined): string | null =>
    e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ? e.text : null;
  const visit = (n: ts.Node): void => {
    let spec: string | null = null;
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) spec = literal(n.moduleSpecifier);
    else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) spec = literal(n.moduleReference.expression);
    else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))) spec = literal(n.arguments[0]);
    else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument)) spec = literal(n.argument.literal);
    if (spec != null) out.push(spec);
    ts.forEachChild(n, visit);
  };
  visit(parse(fileName, src));
  return out;
}

const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js'];
function resolveSpec(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null;                                          // a package: not followed
  for (const ext of EXTS) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile() && CODE.test(p)) return p;
  }
  return null;                                               // json, css, svg… — not code that could carry the key
}

const cache = new Map<string, string[]>();
function edges(file: string): string[] {
  let e = cache.get(file);
  if (!e) {
    e = specifiers(file, readFileSync(file, 'utf8')).map((s) => resolveSpec(file, s)).filter((p): p is string => !!p);
    cache.set(file, e);
  }
  return e;
}

/** Every file reachable from `start`, with the path that first reached it (for a readable failure). */
function reach(start: string): Map<string, string[]> {
  const seen = new Map<string, string[]>([[start, [start]]]);
  const queue = [start];
  while (queue.length) {
    const f = queue.shift()!;
    for (const next of edges(f)) {
      if (seen.has(next)) continue;
      seen.set(next, [...seen.get(f)!, next]);
      queue.push(next);
    }
  }
  return seen;
}

const rel = (p: string) => relative(ROOT, p);
const CLIENT_FILES = CLIENT_ROOTS.flatMap((d) => walkFiles(join(ROOT, d))).filter((f) => isClientModule(f, readFileSync(f, 'utf8')));
const KEY_ABS = join(ROOT, KEY_FILE);

describe('the walker reads imports the way the compiler does', () => {
  // If these fail, every "no leak" below is proving nothing — fix the walker, not these expectations.
  const FIXTURE = [
    'import {',
    "  // the grader's key — an apostrophe inside the brace list hid this import from the regex walker",
    '  answerKeyForPresented,',
    "} from '@/lib/curriculum/assessments';",
    'export * from "./a";',
    "export { b } from './b';",
    "import './side-effect';",
    "import type { E } from './e';",
    "import f = require('./f');",
    'const jsx = <p>Don\'t use `this — an unpaired backtick in JSX text</p>;',
    "const c = import('./c');",
    'const d = require(`./d`);',
    "type G = typeof import('./g');",
    "// import { h } from './h'",
    "const s = \"import x from './i'\";",
    '/* export * from "./j" */',
  ].join('\n');

  it('finds every kind of import, including one with a quote in a comment inside its brace list', () => {
    expect(specifiers('fixture.tsx', FIXTURE).sort()).toEqual(
      ['./a', './b', './c', './d', './e', './f', './g', './side-effect', '@/lib/curriculum/assessments'].sort(),
    );
  });

  it('does not mistake a comment or a string for an import', () => {
    const s = specifiers('fixture.tsx', FIXTURE);
    for (const ghost of ['./h', './i', './j']) expect(s).not.toContain(ghost);
  });

  it("reads 'use client' only as a directive", () => {
    expect(isClientModule('a.tsx', "// header\n/* block */\n'use client';\nexport const x = 1;")).toBe(true);
    expect(isClientModule('a.tsx', "'use strict';\n\"use client\";\nexport {};")).toBe(true);
    expect(isClientModule('a.tsx', "import x from './x';\n'use client';")).toBe(false);
    expect(isClientModule('a.ts', "const s = 'use client';")).toBe(false);
  });
});

describe('the certification answer key never reaches a client bundle', () => {
  it('the walker finds the client modules, and camp-view is one of them', () => {
    expect(CLIENT_FILES.length).toBeGreaterThan(50);
    expect(CLIENT_FILES.map(rel)).toContain('components/camp/camp-view.tsx');
  });

  it('the walker actually follows edges: camp-view reaches the lesson content and the attempt policy', () => {
    // If this ever fails, the walk below is proving nothing — fix the walker, not this expectation.
    const r = reach(join(ROOT, 'components/camp/camp-view.tsx'));
    expect(r.has(join(ROOT, 'lib/curriculum/blueprint.ts'))).toBe(true);
    expect(r.has(join(ROOT, 'lib/camp/assessPolicy.ts'))).toBe(true);
    expect(r.has(join(ROOT, 'lib/camp/curriculum.ts'))).toBe(true);
  });

  it('camp-view — the page that leaked it — does not reach the key', () => {
    const r = reach(join(ROOT, 'components/camp/camp-view.tsx'));
    expect(r.get(KEY_ABS)?.map(rel) ?? null).toBeNull();
  });

  it('NO client module reaches the key', () => {
    const leaks: string[] = [];
    for (const f of CLIENT_FILES) {
      const path = reach(f).get(KEY_ABS);
      if (path) leaks.push(path.map(rel).join(' → '));
    }
    expect(leaks).toEqual([]);
  });

  it('only the assess route (and the tests and the local walk script) import the key at all', () => {
    // A server component could still hand the key to a client one as props, which no import walk from the
    // client side can see. So the list of direct importers is closed: a new one joins with a reason.
    const ALLOWED: Record<string, string> = {
      'app/api/v1/camp/assess/route.ts': 'the one place that grades',
      'lib/curriculum/assessments.test.ts': 'behavioural tests of the grader',
      'lib/camp/assessRoute.test.ts': 'runs the route against an in-memory table; answers with the key to reach a pass',
      'lib/curriculum/answerKeyBoundary.test.ts': 'this file — reads the bank to prove the client module does not carry it',
      'scripts/camp-walk.mts': 'local dev walk that certifies a playtest account against a dev server',
    };
    const importers: string[] = [];
    for (const f of [...CLIENT_ROOTS, 'scripts', 'server', 'tests'].flatMap((d) => {
      const all: string[] = [];
      const walk = (dir: string) => {
        if (!existsSync(dir)) return;
        for (const name of readdirSync(dir)) {
          if (SKIP_DIRS.has(name)) continue;
          const p = join(dir, name);
          if (statSync(p).isDirectory()) walk(p);
          else if (CODE.test(name) || name.endsWith('.mts')) all.push(p);
        }
      };
      walk(join(ROOT, d));
      return all;
    })) {
      if (f === KEY_ABS) continue;
      const src = readFileSync(f, 'utf8');
      if (specifiers(f, src).some((s) => resolveSpec(f, s) === KEY_ABS || /curriculum\/assessments(\.ts)?$/.test(s))) importers.push(rel(f));
    }
    expect(importers.filter((f) => !(f in ALLOWED))).toEqual([]);
    expect(importers).toContain('app/api/v1/camp/assess/route.ts');
  });

  it("the key's own file carries the build-time guard", () => {
    const src = readFileSync(KEY_ABS, 'utf8');
    expect(src).toMatch(/^import 'server-only';$/m);
    expect(isClientModule(KEY_ABS, src)).toBe(false);
  });
});

describe('the client-side curriculum module has no answer fields', () => {
  /** Every object key anywhere in a value. */
  function keysDeep(v: unknown, out = new Set<string>()): Set<string> {
    if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out); }
    return out;
  }

  it('CURRICULUM and every lesson carry no answer, assessment, options or questions', () => {
    const keys = keysDeep(CURRICULUM);
    for (const k of ['answer', 'assessment', 'options', 'questions', 'correct']) expect(keys.has(k), k).toBe(false);
    for (const k of ['answer', 'assessment']) expect(keysDeep(allLessons()).has(k), k).toBe(false);
  });

  it('no question prompt from the bank appears anywhere in the client module source', () => {
    const src = readFileSync(join(ROOT, 'lib/curriculum/blueprint.ts'), 'utf8');
    const prompts = bankRefs().flatMap((r) => lessonQuestions(r).map((q) => q.prompt));
    expect(prompts.length).toBe(50);
    // blueprint.ts writes apostrophes escaped (\'); compare on the unescaped source too
    const plain = src.replace(/\\'/g, "'");
    expect(prompts.filter((p) => plain.includes(p))).toEqual([]);
  });
});
