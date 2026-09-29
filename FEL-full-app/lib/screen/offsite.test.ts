// SCREEN-FIX-2 item 1 (Cyber F3): NOTHING ON /screen LOADS FROM OUTSIDE OUR OWN SITE.
//
// A static walk of the Quick Screen's import graph: every file under app/screen/** and app/play/mirror/assess/**, and
// every file they import (relative and '@/…' imports, resolved to files in this repo; node_modules is not walked). No
// string literal in any of them may be an absolute or protocol-relative URL (http://, https://, //host) or name a
// third-party asset host (jsDelivr, googleapis, gstatic, unpkg, cdnjs).
//
// THE ONE EXCEPTION: the adults' Kindle book link, kept in ONE constant (lib/screen/copy.ts KINDLE_BOOK_URL) and used
// only as a plain <a href>, which the browser follows only when it is clicked (it loads nothing).
//
// Before SCREEN-FIX-2 this failed on lib/pose/assets.ts (reached through PoseService → the MediaPipe adapter): its CDN
// fallback held 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@…' and 'https://storage.googleapis.com/…'.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KINDLE_BOOK_URL } from './copy';

const ROOT = join(__dirname, '../..');
const ROOTS = ['app/screen', 'app/play/mirror/assess'];
const EXTS = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '/index.ts', '/index.tsx'];

/** Every .ts/.tsx under a folder (tests are not shipped, so they are not roots). */
function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f)) out.push(relative(ROOT, p));
    }
  };
  walk(join(ROOT, dir));
  return out;
}

/** A file's code with comments removed, and its string literals (quotes, and template text outside `${}`). */
export function scan(src: string): { code: string; strings: string[] } {
  let code = '', i = 0;
  const strings: string[] = [];
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '\'' || c === '"') {
      let s = ''; i++;
      while (i < n && src[i] !== c && src[i] !== '\n') { if (src[i] === '\\') { s += src[i + 1] ?? ''; i += 2; continue; } s += src[i]; i++; }
      i++; strings.push(s); code += '""'; continue;
    }
    if (c === '`') {
      let s = ''; i++;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') { s += src[i + 1] ?? ''; i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') {
          let depth = 1, inner = ''; i += 2;
          while (i < n && depth) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; if (depth) inner += src[i]; i++; }
          const sub = scan(inner); strings.push(...sub.strings); code += ` ${sub.code} `; s += ' ';
          continue;
        }
        s += src[i]; i++;
      }
      i++; strings.push(s); code += '""'; continue;
    }
    code += c; i++;
  }
  return { code, strings };
}

/** The module specifiers a file imports (static, dynamic, re-exports, require). */
function importsOf(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s+['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? m[4]);
  }
  return out;
}

/** A specifier resolved to a file in this repo, or null (a package in node_modules, or a non-code asset). */
function resolveFrom(file: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : spec.startsWith('.') ? join(ROOT, dirname(file), spec) : null;
  if (!base) return null;
  for (const e of EXTS) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile() && /\.(ts|tsx|mts|js|mjs)$/.test(p)) return relative(ROOT, p);
  }
  return null;
}

/** The screen's whole import graph, from its two folders. */
function screenGraph(): string[] {
  const seen = new Set<string>();
  const queue = ROOTS.flatMap(sourcesUnder);
  while (queue.length) {
    const f = queue.shift()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const spec of importsOf(readFileSync(join(ROOT, f), 'utf8'))) {
      const r = resolveFrom(f, spec);
      if (r && !r.includes('node_modules') && !seen.has(r)) queue.push(r);
    }
  }
  return [...seen].sort();
}

/** An absolute URL with a host anywhere in the literal, or a literal that starts with a protocol-relative //host. */
const ABSOLUTE = /https?:\/\/[a-z0-9[]/i;
const PROTOCOL_RELATIVE = /^\s*\/\/[a-z0-9[]/i;
const CDN_HOSTS = /jsdelivr|googleapis|gstatic|unpkg|cdnjs/i;
const offsiteLiteral = (s: string): boolean => ABSOLUTE.test(s) || PROTOCOL_RELATIVE.test(s) || CDN_HOSTS.test(s);

/** Every off-site string in a file, as "file: literal". */
function offsite(f: string): string[] {
  return scan(readFileSync(join(ROOT, f), 'utf8')).strings.filter(offsiteLiteral).map((s) => `${f}: ${s}`);
}

const GRAPH = screenGraph();

describe('the screen\'s import graph', () => {
  it('reaches the pages, the pose pipeline and its asset resolver (so the walk sees what the page ships)', () => {
    for (const f of ['app/screen/privacy/page.tsx', 'app/play/mirror/assess/_components/assess-app.tsx', 'lib/pose/PoseService.ts',
      'lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter.ts', 'lib/pose/assets.ts', 'lib/screen/copy.ts']) expect(GRAPH, f).toContain(f);
    expect(GRAPH.some((f) => f.includes('node_modules'))).toBe(false);
  });

  it('the scanner finds an off-site literal in the forms that matter, and not in comments', () => {
    const got = scan([
      "const a = 'https://cdn.jsdelivr.net/npm/x';", 'const b = "//cdn.example/x.js";', 'const c = `https://storage.googleapis.com/${m}/x.task`;',
      '// https://in.a.comment/only', '/* //also.a.comment */', "const d = '/pose/wasm';", "const e = v.startsWith('//');",
      "const f = 'Open the page over https (the address should start with https://).';", "const g = 'see http://example.com';",
    ].join('\n')).strings.filter(offsiteLiteral);
    expect(got).toEqual(['https://cdn.jsdelivr.net/npm/x', '//cdn.example/x.js', 'https://storage.googleapis.com/ /x.task', 'see http://example.com']);
  });
});

describe('no file the screen ships holds an off-site address', () => {
  it('none, apart from the one Kindle link constant', () => {
    const found = GRAPH.flatMap(offsite).filter((x) => x !== `lib/screen/copy.ts: ${KINDLE_BOOK_URL}`);
    expect(found).toEqual([]);
  });

  it('the Kindle link is ONE constant in lib/screen/copy.ts, exactly the book\'s address', () => {
    expect(KINDLE_BOOK_URL).toBe('https://www.amazon.com/dp/B0H5J1M18H');
    const copy = readFileSync(join(ROOT, 'lib/screen/copy.ts'), 'utf8');
    expect(copy.match(/https?:\/\//g)).toHaveLength(1);
    expect(copy).toMatch(/export const KINDLE_BOOK_URL = 'https:\/\/www\.amazon\.com\/dp\/B0H5J1M18H';/);
  });

  it('it is only ever rendered as a plain link\'s href, once, by the adults\' results', () => {
    const uses = GRAPH.filter((f) => f !== 'lib/screen/copy.ts').flatMap((f) => {
      // the code without its import statements: what is left is every place the constant is USED
      const code = scan(readFileSync(join(ROOT, f), 'utf8')).code.replace(/\bimport\s[^;]*?\bfrom\s*""\s*;?/g, '');
      return [...code.matchAll(/KINDLE_BOOK_URL/g)].map((m) => ({ f, at: code.slice(Math.max(0, m.index! - 9), m.index! + 16) }));
    });
    expect(uses.map((u) => u.f)).toEqual(['app/play/mirror/assess/_components/results-view.tsx']);
    expect(uses[0].at).toBe('<a href={KINDLE_BOOK_URL}');
  });
});
