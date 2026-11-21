// PRISMA-PUBLIC step 2 (docs/PRISMA-PUBLIC-PLAN.md §4): which query engine lib/db.ts hands the lib/generated/prisma client.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { ENGINE_FILE, queryEngineCandidates, resolveQueryEngine } from './queryEngine';

const CWD = '/workspace';
const LIB = path.join(CWD, 'lib/generated/prisma', ENGINE_FILE);
const DIST = path.join(CWD, '.next/prisma-engine', ENGINE_FILE);
const MAC = path.join(CWD, 'node_modules/@prisma/engines/libquery_engine-darwin-arm64.dylib.node');
const only = (...hits: string[]) => (p: string) => hits.includes(p);
const none = () => [] as string[];

describe('resolveQueryEngine', () => {
  it('the deployed function (no lib/): the engine next build copied into .next/prisma-engine', () => {
    const env: Record<string, string | undefined> = {};
    expect(resolveQueryEngine({ env, cwd: CWD, platform: 'linux', exists: only(DIST), list: none })).toBe(DIST);
    expect(env.PRISMA_QUERY_ENGINE_LIBRARY).toBe(DIST);
  });

  it('a Linux source checkout: the committed engine, ahead of a possibly stale build copy', () => {
    const env: Record<string, string | undefined> = {};
    expect(resolveQueryEngine({ env, cwd: CWD, platform: 'linux', exists: only(LIB, DIST), list: none })).toBe(LIB);
  });

  it('honours NEXT_DIST_DIR, the same variable next.config.js copies into', () => {
    const env: Record<string, string | undefined> = { NEXT_DIST_DIR: '.next-verify' };
    const verify = path.join(CWD, '.next-verify/prisma-engine', ENGINE_FILE);
    expect(resolveQueryEngine({ env, cwd: CWD, platform: 'linux', exists: only(verify), list: none })).toBe(verify);
  });

  it('a Mac: never the debian engine, the native one @prisma/engines installed', () => {
    const env: Record<string, string | undefined> = {};
    const list = () => ['README.md', 'libquery_engine-darwin-arm64.dylib.node', 'package.json'];
    const cands = queryEngineCandidates({ env, cwd: CWD, platform: 'darwin', list });
    expect(cands).toEqual([MAC]);
    expect(resolveQueryEngine({ env, cwd: CWD, platform: 'darwin', exists: only(LIB, DIST, MAC), list })).toBe(MAC);
  });

  it('an operator override wins and is left untouched (the rollback lever)', () => {
    const env: Record<string, string | undefined> = { PRISMA_QUERY_ENGINE_LIBRARY: '/workspace/public/_prisma/client/x.node' };
    expect(resolveQueryEngine({ env, cwd: CWD, platform: 'linux', exists: only(LIB, DIST), list: none })).toBe('/workspace/public/_prisma/client/x.node');
    expect(env.PRISMA_QUERY_ENGINE_LIBRARY).toBe('/workspace/public/_prisma/client/x.node');
  });

  it('nothing found: sets nothing, so Prisma reports its own search', () => {
    const env: Record<string, string | undefined> = {};
    expect(resolveQueryEngine({ env, cwd: CWD, platform: 'linux', exists: () => false, list: none })).toBeNull();
    expect('PRISMA_QUERY_ENGINE_LIBRARY' in env).toBe(false);
  });

  it('this checkout resolves to the committed lib/generated/prisma engine', () => {
    if (process.platform !== 'linux') return;
    expect(resolveQueryEngine({ env: {} })).toBe(path.join(process.cwd(), 'lib/generated/prisma', ENGINE_FILE));
  });
});
