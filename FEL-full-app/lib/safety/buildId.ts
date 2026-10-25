// lib/safety/buildId.ts — SAFETY lane (SAF-04): which build a "Report a problem" came from, read on the SERVER (never
// taken from the request). Cloud Run's revision name when the host sets it (K_REVISION), else the Next build id on disk,
// else "dev". Cached for the life of the process. Server only (node:fs).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let cached: string | null = null;

export function buildId(env: NodeJS.ProcessEnv = process.env): string {
  if (cached) return cached;
  let id = (env.K_REVISION ?? '').trim();
  if (!id) {
    try { id = readFileSync(join(process.cwd(), env.NEXT_DIST_DIR || '.next', 'BUILD_ID'), 'utf8').trim(); } catch { id = ''; }
  }
  cached = /^[A-Za-z0-9._-]{1,64}$/.test(id) ? id : 'dev';
  return cached;
}

/** Tests only. */
export function resetBuildId(): void { cached = null; }
