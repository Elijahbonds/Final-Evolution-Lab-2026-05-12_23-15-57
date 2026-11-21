// PRISMA-PUBLIC step 2 (docs/PRISMA-PUBLIC-PLAN.md §4): tell the client in lib/generated/prisma where its query engine is.
//
// WHY THIS EXISTS. The client's JS is bundled into .next by webpack, so it ships. Its 17 MB engine does not: the deployed
// function receives public/ and <distDir>/ but never lib/, and that is exactly how the 2026-09 attempt at lib/generated
// died ("engine not found", /workspace/lib/generated/prisma searched and empty). So next.config.js copies the one engine
// into <distDir>/prisma-engine during `next build`, and this module points Prisma at it through
// PRISMA_QUERY_ENGINE_LIBRARY, before the client is constructed.
//
// Order, first hit wins:
//   0. PRISMA_QUERY_ENGINE_LIBRARY already set: an operator's override, left alone (the rollback lever in the plan).
//   1. Linux, a source checkout: lib/generated/prisma/<engine> (preferred over a possibly stale build copy).
//   2. Linux, the deployed function: <cwd>/<NEXT_DIST_DIR or .next>/prisma-engine/<engine>.
//   3. Any other platform (the owner's Mac), or a Linux box where neither exists: the native engine that
//      @prisma/engines' own install put in node_modules/@prisma/engines. The lib client deliberately has no darwin
//      engine (no "native" binaryTarget), and @prisma/engines is the same Prisma version, so the same engine build.
// Nothing found: nothing is set, and Prisma searches its usual places and names them in its error.
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const ENGINE_FILE = 'libquery_engine-debian-openssl-3.0.x.so.node';
export const ENGINE_DIR = 'prisma-engine';
export const LIB_CLIENT_DIR = path.join('lib', 'generated', 'prisma');

type Env = Record<string, string | undefined>;
export interface EngineProbe {
  env?: Env;
  cwd?: string;
  platform?: string;
  exists?: (p: string) => boolean;
  list?: (dir: string) => string[];
}

const listDir = (dir: string): string[] => {
  try { return readdirSync(dir).sort(); } catch { return []; }
};

/** Where an engine may be, in the order tried (see the header). */
export function queryEngineCandidates({ env = process.env, cwd = process.cwd(), platform = process.platform, list = listDir }: EngineProbe = {}): string[] {
  const out: string[] = [];
  if (platform === 'linux') {
    out.push(path.join(cwd, LIB_CLIENT_DIR, ENGINE_FILE));
    out.push(path.join(cwd, env.NEXT_DIST_DIR || '.next', ENGINE_DIR, ENGINE_FILE));
  }
  const engines = path.join(cwd, 'node_modules', '@prisma', 'engines');
  for (const f of list(engines)) if (/^(lib)?query_engine[-_].*\.node$/.test(f)) out.push(path.join(engines, f));
  return out;
}

/** Sets PRISMA_QUERY_ENGINE_LIBRARY to the first engine that exists, unless it is already set. Returns the path in use. */
export function resolveQueryEngine(probe: EngineProbe = {}): string | null {
  const env = probe.env ?? process.env;
  if (env.PRISMA_QUERY_ENGINE_LIBRARY) return env.PRISMA_QUERY_ENGINE_LIBRARY;
  const exists = probe.exists ?? existsSync;
  const hit = queryEngineCandidates({ ...probe, env }).find((p) => exists(p)) ?? null;
  if (hit) env.PRISMA_QUERY_ENGINE_LIBRARY = hit;
  return hit;
}
