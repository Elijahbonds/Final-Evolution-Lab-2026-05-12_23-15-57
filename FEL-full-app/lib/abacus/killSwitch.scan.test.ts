// ABACUS-KILL (2026-09-29): the switch stays on the server. This reads the source graph instead of a build: every
// 'use client' module under app/, components/ and lib/, and everything those import, is what can reach a client
// bundle. None of it may mention ABACUS_ENABLED or import the server-only switch.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const FLAG = 'ABACUS_ENABLED';
// Built from parts so this file does not add the retired host to the tree (lib/build-config.test.ts).
const RETIRED_HOST = ['abacusai', 'app'].join('.');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.') || e === 'node_modules' || e === '_archive' || e === 'generated') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mts|mjs|cjs|js)$/.test(p)) out.push(p);
  }
  return out;
}
const isTest = (p: string) => /\.(test|spec)\.(tsx?|mts)$/.test(p);
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, '/');
const SOURCES = ['app', 'components', 'lib', 'scripts'].flatMap((d) => walk(join(ROOT, d))).filter((p) => !isTest(p));
const read = (p: string) => readFileSync(p, 'utf8');

function specifiers(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}
const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js'];
function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : spec.startsWith('.') ? join(dirname(from), spec) : null;
  if (!base) return null; // a package
  for (const x of EXTS) {
    const p = base + x;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}
function graphFrom(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const s of specifiers(read(f))) {
      const r = resolve(f, s);
      if (r && !seen.has(r)) queue.push(r);
    }
  }
  return seen;
}
const isClientEntry = (p: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*\s*['"]use client['"]/.test(read(p));

describe('the switch never reaches a client bundle', () => {
  const entries = SOURCES.filter((p) => /\.(tsx?|jsx?)$/.test(p) && isClientEntry(p));
  const client = graphFrom(entries);
  const clientRel = new Set([...client].map(rel));

  it('the scan sees the client graph it is meant to check (control)', () => {
    expect(entries.length).toBeGreaterThan(50);
    for (const f of [
      'app/coach/_components/coach-chat.tsx',
      'components/studio/studio-shell.tsx',
      'components/ai-coming-soon.tsx',
      'lib/abacus/aiStatus.ts',
      'lib/abacus/useAiStatus.ts',
    ]) expect(clientRel.has(f), f).toBe(true);
    // and the resolver follows '@/' imports: the server graph of the status route reaches the switch
    expect([...graphFrom([join(ROOT, 'app/api/ai/status/route.ts')])].map(rel)).toContain('lib/abacus/killSwitch.ts');
    expect(read(join(ROOT, 'lib/abacus/killSwitch.ts'))).toContain(`env.${FLAG}`);
  });

  it(`no client module mentions ${FLAG} or imports lib/abacus/killSwitch`, () => {
    const leaks = [...client].filter((f) => read(f).includes(FLAG) || specifiers(read(f)).some((s) => /abacus\/killSwitch$/.test(s)));
    expect(leaks.map(rel)).toEqual([]);
  });

  it(`only lib/abacus/killSwitch.ts reads ${FLAG}; every other mention sits in a server-only module`, () => {
    const readers = SOURCES.filter((f) => new RegExp(`env\\s*(?:\\.\\s*${FLAG}|\\[\\s*['"]${FLAG}['"]\\s*\\])`).test(read(f)));
    expect(readers.map(rel)).toEqual(['lib/abacus/killSwitch.ts']);
    const mentions = SOURCES.filter((f) => read(f).includes(FLAG));
    for (const f of mentions) expect(read(f), rel(f)).toMatch(/import ['"]server-only['"]/);
  });

  it('no file asks for a NEXT_PUBLIC_ABACUS variable', () => {
    const files = [...SOURCES, join(ROOT, 'next.config.js')].filter(existsSync);
    expect(files.filter((f) => /NEXT_PUBLIC_ABACUS/.test(read(f))).map(rel)).toEqual([]);
  });

  it('no new mention of the retired host: it is still only the one fallback sender address in lib/marketing/email.ts', () => {
    const hits = SOURCES.flatMap((f) => (read(f).split(RETIRED_HOST).length - 1 > 0 ? [`${rel(f)} x${read(f).split(RETIRED_HOST).length - 1}`] : []));
    expect(hits).toEqual(['lib/marketing/email.ts x1']);
  });
});
