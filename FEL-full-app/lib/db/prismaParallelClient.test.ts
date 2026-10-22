// PRISMA-PUBLIC step 1 (PR A, PRISMA-PUBLIC-PLAN.md): a parallel client under lib/generated/prisma, no behaviour change.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';

const APP = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');

describe('PRISMA-PUBLIC step 1: the parallel client', () => {
  it('the schema keeps the public client and adds lib/generated/prisma with the same engines', () => {
    const s = read('prisma/schema.prisma');
    expect(s).toContain('output   = "../public/_prisma/client"');
    expect(s).toMatch(/generator clientLib \{[^}]*output\s+= "\.\.\/lib\/generated\/prisma"[^}]*binaryTargets = \["native", "debian-openssl-3\.0\.x"\]/);
  });
  it('the shipped schema copy points both generators at the same directories from public/_prisma', () => {
    const c = read('public/_prisma/schema.prisma');
    expect(c).toContain('output   = "./client"');
    expect(c).toContain('output        = "../../lib/generated/prisma"');
  });
  it('the parallel client is generated, committed-shaped and path-independent, with the Linux engine', () => {
    expect(existsSync(join(APP, 'lib/generated/prisma/libquery_engine-debian-openssl-3.0.x.so.node'))).toBe(true);
    const js = read('lib/generated/prisma/index.js');
    expect(js).not.toMatch(/"(sourceFilePath|value)": "\/[^"]*generated\/prisma/);
    expect(js).toContain('"sourceFilePath": "public/_prisma/schema.prisma"');
  });
  it('nothing imports it yet: lib/db.ts still loads the public client', () => {
    expect(read('lib/db.ts')).toContain('_prisma/client');
    expect(read('lib/db.ts')).not.toContain('lib/generated/prisma');
  });
  it('next.config traces the parallel client and the server build copies the engine into <distDir>/prisma-engine', () => {
    const cfg = read('next.config.js');
    expect(cfg).toContain("'./lib/generated/prisma/**/*'");
    expect(cfg).not.toContain("'./node_modules/.prisma/client/**/*'");
    const dist = mkdtempSync(join(tmpdir(), 'prisma-engine-'));
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { copyPrismaEngine } = require(join(APP, 'next.config.js'));
      const copied: string[] = copyPrismaEngine(relative(APP, dist));
      expect(copied).toEqual(['libquery_engine-debian-openssl-3.0.x.so.node', 'schema.prisma']);
      expect(existsSync(join(dist, 'prisma-engine', 'schema.prisma'))).toBe(true);
    } finally { rmSync(dist, { recursive: true, force: true }); }
  });
  it('CI holds the parallel client to the committed-in-sync rule', () => {
    const ci = readFileSync(join(APP, '..', '.github/workflows/ci.yml'), 'utf8');
    expect(ci).toContain('git diff --exit-code -- lib/generated/prisma/schema.prisma');
  });
});
