// PRISMA-PUBLIC step 2 (docs/PRISMA-PUBLIC-PLAN.md §4): the app loads lib/generated/prisma, and the production server
// build carries its engine into <distDir>/prisma-engine. public/_prisma stays committed (unused) until step 4.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = join(__dirname, '..', '..');
const ENGINE = 'libquery_engine-debian-openssl-3.0.x.so.node';

describe('the app imports the lib/generated/prisma client', () => {
  it('no source file imports public/_prisma any more', () => {
    // git grep, so generated trees and docs are out; this file and the plan are the only ones that may name it.
    const pattern = "(from|import\\(|mock\\() *'(@/|(\\.\\./)+)public/_prisma";
    const grep = (re: string) => {
      try {
        return execFileSync('git', ['grep', '-l', '-E', re, '--', '*.ts', '*.tsx', '*.mts', '*.js', '*.mjs'], { cwd: APP, encoding: 'utf8' }).trim();
      } catch (e) {
        if ((e as { status?: number }).status === 1) return ''; // git grep: no match
        throw e;
      }
    };
    expect(grep(pattern)).toBe('');
    // control: the same pattern does find the new import, so an empty result above is not a broken grep
    expect(grep(pattern.replace('public/_prisma', 'lib/generated/prisma'))).toContain('lib/db.ts');
  });

  it('lib/db.ts takes the client from lib/generated/prisma and resolves the engine before constructing it', () => {
    const src = readFileSync(join(APP, 'lib/db.ts'), 'utf8');
    expect(src).toContain("from '@/lib/generated/prisma'");
    const resolveAt = src.indexOf('resolveQueryEngine()');
    expect(resolveAt).toBeGreaterThan(0);
    expect(resolveAt).toBeLessThan(src.indexOf('new PrismaClient()'));
  });
});

describe('next.config.js copies the engine on the production server build only', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nextConfig = require(join(APP, 'next.config.js'));
  const run = (ctx: Record<string, unknown>) => {
    const dist = mkdtempSync(join(tmpdir(), 'prisma-engine-'));
    const before = process.env.NEXT_DIST_DIR;
    process.env.NEXT_DIST_DIR = dist;
    try {
      nextConfig.webpack({ output: {} }, ctx);
      const f = join(dist, 'prisma-engine', ENGINE);
      return existsSync(f) ? statSync(f).size : 0;
    } finally {
      if (before === undefined) delete process.env.NEXT_DIST_DIR; else process.env.NEXT_DIST_DIR = before;
      rmSync(dist, { recursive: true, force: true });
    }
  };

  it('`next build`, Node server: the committed engine lands in <distDir>/prisma-engine, byte for byte the same size', () => {
    expect(run({ isServer: true, dev: false, nextRuntime: 'nodejs' })).toBe(statSync(join(APP, 'lib/generated/prisma', ENGINE)).size);
  });

  it('client, edge, dev and a bare call copy nothing', () => {
    expect(run({ isServer: false, dev: false })).toBe(0);
    expect(run({ isServer: true, dev: false, nextRuntime: 'edge' })).toBe(0);
    expect(run({ isServer: true, dev: true, nextRuntime: 'nodejs' })).toBe(0);
    expect(run({ isServer: true })).toBe(0);
  });

  it('traces the lib client, not the node_modules/.prisma stubs nothing imports', () => {
    const inc = nextConfig.experimental.outputFileTracingIncludes['/**/*'];
    expect(inc).toContain('./lib/generated/prisma/**/*');
    expect(inc).not.toContain('./node_modules/.prisma/client/**/*');
  });
});
