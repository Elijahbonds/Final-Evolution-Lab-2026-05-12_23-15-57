// A Next.js route file (app/**/route.ts[x]) may export only the HTTP handlers and Next's route-segment config.
// Anything else passes tsc and vitest but fails `next build`'s type check ("X is not a valid Route export field"),
// which CI reaches last, after ~25 minutes (lane/progress-card's IMAGE_LIMIT, 2026-10-24). This catches it in seconds.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = path.resolve(__dirname, '..', 'app');
const ALLOWED = new Set([
  'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'DELETE', 'PATCH',
  'runtime', 'dynamic', 'dynamicParams', 'revalidate', 'fetchCache', 'preferredRegion', 'maxDuration',
  'generateStaticParams',
]);

function routes(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) routes(p, out);
    else if (/^route\.(ts|tsx|js)$/.test(name)) out.push(p);
  }
  return out;
}

const EXPORT = /^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST = /^export\s*\{([^}]*)\}/gm;

describe('route files export only what Next allows', () => {
  it('no extra named exports in app/**/route.ts', () => {
    const bad: string[] = [];
    for (const f of routes(APP)) {
      const src = readFileSync(f, 'utf8');
      const names = [...src.matchAll(EXPORT)].map((m) => m[1]);
      for (const m of src.matchAll(EXPORT_LIST)) {
        for (const part of m[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/).pop()?.trim();
          if (name && !name.startsWith('type ')) names.push(name);
        }
      }
      for (const n of names) if (!ALLOWED.has(n)) bad.push(`${path.relative(APP, f)}: ${n}`);
    }
    expect(bad, 'move these into a lib module').toEqual([]);
  });
});
