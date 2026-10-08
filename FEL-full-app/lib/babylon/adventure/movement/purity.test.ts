// The plan's rule, measured (lane A1): "the simulation is pure" — no Babylon, no DOM, no clock, no Math.random — so it
// runs headless now and on a dedicated server later. This walks the REAL import graph of every A1 sim file (value
// imports, transitively; `import type` is erased and skipped) and fails on any path into @babylonjs, and greps the sim
// sources for a clock or a random. Only the view binders (view.ts) and the tests may touch Babylon.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const APP = path.resolve(__dirname, '../../../..');
const A1 = ['movement', 'rails', 'flight'].map((d) => path.resolve(__dirname, '..', d));

const simFiles = (): string[] => A1.flatMap((dir) => readdirSync(dir)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'view.ts')
  .map((f) => path.join(dir, f)));

/** Value import specifiers of a source (static `import … from`, `export … from`, minus `import type` / `export type`). */
function valueImports(src: string): string[] {
  const out: string[] = [];
  const re = /^\s*(import|export)\s+(type\s+)?[^'";]*?from\s+['"]([^'"]+)['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) if (!m[2]) out.push(m[3]);
  const bare = /^\s*import\s+['"]([^'"]+)['"]/gm;
  while ((m = bare.exec(src))) out.push(m[1]);
  return out;
}

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join(APP, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) if (existsSync(c)) return c;
  return null;
}

describe('A1 sim purity', () => {
  it('no A1 sim file reaches @babylonjs (or any package but the app\'s own pure modules), transitively', () => {
    const seen = new Set<string>();
    const bad: string[] = [];
    const walk = (file: string, chain: string[]) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const spec of valueImports(readFileSync(file, 'utf8'))) {
        if (!spec.startsWith('.') && !spec.startsWith('@/')) { bad.push(`${[...chain, file].map((f) => path.relative(APP, f)).join(' → ')} → ${spec}`); continue; }
        const next = resolve(file, spec);
        if (next) walk(next, [...chain, file]);
      }
    };
    const files = simFiles();
    expect(files.length).toBeGreaterThanOrEqual(20);
    for (const f of files) walk(f, []);
    expect(bad).toEqual([]);
    // and it did look at the reused core modules
    expect([...seen].map((f) => path.basename(f))).toEqual(expect.arrayContaining(['FreeRunFlow.ts', 'MatrixFocus.ts', 'PrqVitals.ts', 'movement.ts', 'contracts.ts']));
  });

  it('no clock and no Math.random in the sims (time is ctx.tSec; randomness is a seed)', () => {
    for (const f of simFiles()) {
      const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(/Date\.now|performance\.now|Math\.random|requestAnimationFrame|window\.|document\./.test(src), path.basename(f)).toBe(false);
    }
  });

  it('the view binders are the only A1 files that import Babylon', () => {
    const views = A1.map((d) => path.join(d, 'view.ts')).filter(existsSync);
    expect(views).toHaveLength(3);
    for (const v of views) expect(readFileSync(v, 'utf8')).toMatch(/@babylonjs\/core/);
  });
});
