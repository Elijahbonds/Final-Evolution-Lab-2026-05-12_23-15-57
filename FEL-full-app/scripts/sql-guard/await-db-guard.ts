#!/usr/bin/env -S npx tsx
/**
 * scripts/sql-guard/await-db-guard.ts — THE COORDINATOR'S GATE: production's schema first, then `main`.
 *
 * Owner decision 2026-10-20: the SQL a release needs is applied in the same session as the deploy, and BEFORE the
 * code that needs it goes live. `main` is the deploy branch, so the coordinator runs this before it fast-forwards
 * `main`, and fast-forwards only on GO:
 *
 *   npx tsx scripts/sql-guard/await-db-guard.ts --ref lane/finish-release --sha <the commit main will move to>
 *
 * It (1) checks that origin/<ref> is exactly <sha>, (2) dispatches .github/workflows/db-guard.yml on <ref> (mode
 * apply), (3) waits for that run, and (4) prints GO only when the run's commit is <sha>, it succeeded, and its
 * "verified" step ran — production's schema equals <sha>'s prisma/schema.prisma. It never pushes anything itself:
 * moving `main` stays the coordinator's act. Exit 0 = GO, 1 = STOP, 2 = usage. Needs `gh` signed in with
 * permission to run workflows. No deploy file, firebase.json or build step is touched (docs/DB-GUARD.md, "Ordering").
 *
 * Until the owner adds the PROD_DIRECT_URL secret, db-guard does nothing and says so; then this falls back to today's
 * rule: GO with a warning when the release changes nothing under FEL-full-app/prisma/, STOP (owner applies by hand,
 * OWNER-RUNBOOK §4–5) when it does.
 */
import { execFileSync } from 'node:child_process';

/** Step names in db-guard.yml that this reads. scripts/sql-guard-tests.ts checks the workflow still has them. */
export const STEP_VERIFIED = 'verified: production matches the schema';
export const STEP_NO_SECRET = 'no secret: nothing was read or written';
export const WORKFLOW_FILE = 'db-guard.yml';

export interface RunFacts {
  targetSha: string;
  headSha: string;
  /** The run's conclusion: success | failure | cancelled | ... */
  conclusion: string;
  /** Each step's conclusion by name: success | skipped | failure | ... */
  steps: Record<string, string | undefined>;
  /** True when the release changes anything under FEL-full-app/prisma/ relative to what `main` has. */
  prismaChanged: boolean;
}

/** When db-guard could not be dispatched at all (it is not on the default branch yet, or gh is not signed in). */
export interface Unavailable { unavailable: string; prismaChanged: boolean }

export type Verdict = { go: true; warning?: string; why: string } | { go: false; why: string };

/** Pure: may `main` move to targetSha, given what the db-guard run did? */
export function releaseVerdict(f: RunFacts | Unavailable): Verdict {
  if ('unavailable' in f) {
    // GitHub dispatches only workflows that exist on the default branch, so the release that first carries
    // db-guard.yml to main cannot be gated by it. Fall back to today's rule rather than block every release.
    return f.prismaChanged
      ? { go: false, why: `db-guard could not run (${f.unavailable}) and this release changes FEL-full-app/prisma/: the owner applies its SQL by hand first (OWNER-RUNBOOK §4–5)` }
      : { go: true, why: 'no prisma/ change in this release', warning: `db-guard could not run (${f.unavailable}), so production was not checked` };
  }
  if (f.headSha !== f.targetSha) return { go: false, why: `db-guard ran on ${f.headSha.slice(0, 8)}, not ${f.targetSha.slice(0, 8)}: the ref moved; dispatch again` };
  if (f.conclusion !== 'success') return { go: false, why: `db-guard concluded "${f.conclusion}"; its run (and the issue it opened) say why. Do not move main.` };
  if (f.steps[STEP_VERIFIED] === 'success') return { go: true, why: 'production schema verified equal to this commit\'s prisma/schema.prisma' };
  if (f.steps[STEP_NO_SECRET] === 'success') {
    return f.prismaChanged
      ? { go: false, why: 'db-guard has no PROD_DIRECT_URL secret yet, and this release changes FEL-full-app/prisma/: the owner applies its SQL by hand first (OWNER-RUNBOOK §4–5)' }
      : { go: true, why: 'no prisma/ change in this release', warning: 'db-guard has no PROD_DIRECT_URL secret yet, so production was not checked' };
  }
  return { go: false, why: 'db-guard succeeded without verifying (preview mode?); dispatch it in apply mode' };
}

function sh(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main(argv: string[]): Promise<number> {
  const get = (flag: string) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
  const ref = get('--ref');
  const sha = get('--sha');
  const base = get('--base') ?? 'origin/main';
  if (!ref || !sha || !/^[0-9a-f]{40}$/.test(sha)) {
    console.error('usage: await-db-guard.ts --ref <branch> --sha <full 40-char sha> [--base origin/main]');
    return 2;
  }
  sh('git', ['fetch', '--quiet', 'origin', ref]);
  const tip = sh('git', ['rev-parse', `origin/${ref}`]);
  if (tip !== sha) { console.log(`STOP: origin/${ref} is ${tip}, not ${sha}`); return 1; }
  const prismaChanged = sh('git', ['diff', '--name-only', `${base}...${sha}`, '--', ':(top)FEL-full-app/prisma/']) !== '';

  const say = (v: Verdict) => {
    if (v.go) {
      if (v.warning) console.log(`WARNING: ${v.warning}`);
      console.log(`GO: ${v.why}. main may move to ${sha}.`);
      return 0;
    }
    console.log(`STOP: ${v.why}`);
    return 1;
  };

  const since = Date.now() - 5_000;
  try {
    sh('gh', ['workflow', 'run', WORKFLOW_FILE, '--ref', ref, '-f', 'mode=apply']);
  } catch (e) {
    return say(releaseVerdict({ unavailable: `gh workflow run ${WORKFLOW_FILE} failed: ${String((e as Error).message).split('\n')[0]}`, prismaChanged }));
  }
  let runId: string | undefined;
  for (let i = 0; i < 40 && !runId; i++) {
    await sleep(3_000);
    const runs = JSON.parse(sh('gh', ['run', 'list', '--workflow', WORKFLOW_FILE, '--event', 'workflow_dispatch', '--branch', ref,
      '--limit', '5', '--json', 'databaseId,headSha,createdAt'])) as Array<{ databaseId: number; headSha: string; createdAt: string }>;
    const mine = runs.find(r => r.headSha === sha && Date.parse(r.createdAt) >= since);
    if (mine) runId = String(mine.databaseId);
  }
  if (!runId) { console.log('STOP: the dispatched db-guard run never appeared'); return 1; }
  console.log(`db-guard run ${runId}: waiting`);
  try { sh('gh', ['run', 'watch', runId, '--interval', '10']); } catch { /* the verdict below reads the outcome */ }
  const view = JSON.parse(sh('gh', ['run', 'view', runId, '--json', 'conclusion,headSha,jobs'])) as {
    conclusion: string; headSha: string; jobs: Array<{ steps: Array<{ name: string; conclusion: string }> }>;
  };
  const steps: Record<string, string> = {};
  for (const j of view.jobs) for (const s of j.steps) steps[s.name] = s.conclusion;
  return say(releaseVerdict({ targetSha: sha, headSha: view.headSha, conclusion: view.conclusion, steps, prismaChanged }));
}

if (require.main === module) main(process.argv.slice(2)).then(code => process.exit(code), e => { console.error(e); process.exit(1); });
