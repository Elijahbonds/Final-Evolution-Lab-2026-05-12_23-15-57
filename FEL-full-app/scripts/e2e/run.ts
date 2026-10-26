// The runner shared by the E2E, visual and perf gates: retries, the quarantine and the report (quality-gates, 2026-10-25).
//
// Owner, quality round 2026-10-20: the gates are BLOCKING, and "a flaky blocking E2E stalls every lane". So:
//   * RETRY BUDGET. A failed check is retried once (RETRIES), and the whole run spends at most RETRY_BUDGET retries. A
//     check that passes only on its retry is reported FLAKY in the summary — green, but named, so it is seen.
//   * QUARANTINE, never deletion. tests/e2e/quarantine.json lists checks the owner has agreed may fail without blocking:
//     each row says since when, why and who asked. A quarantined check still RUNS and its result is still printed; it
//     just cannot turn the gate red. A row with no reason, or for a check that no longer exists, fails the gate — so
//     the list cannot rot into a blanket exemption. A quarantined check that passes is printed as "can come out".
//   * Evidence: each attempt's screenshots land in OUT/<gate>/<check>/attempt-<n>/ (OUT = $E2E_OUT, else the OS temp).
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from 'playwright-core';
import { ROOT, launch, type Session } from './rig';
import { hygiene, makeContext, type Flow } from './flow';

export const RETRIES = 1;
export const RETRY_BUDGET = 2;
export const QUARANTINE_FILE = 'tests/e2e/quarantine.json';

export interface QuarantineRow { check: string; since: string; why: string; askedBy: string }
export interface Quarantine { rows: QuarantineRow[] }

export function readQuarantine(file = join(ROOT, QUARANTINE_FILE)): Quarantine {
  return JSON.parse(readFileSync(file, 'utf8')) as Quarantine;
}

/** The quarantine's own rules: every row is dated, explained and owned, and names a check that exists. */
export function checkQuarantine(q: Quarantine, known: string[]): string[] {
  const bad: string[] = [];
  for (const r of q.rows ?? []) {
    if (!known.includes(r.check)) bad.push(`quarantine row "${r.check}" names no check that exists (remove it)`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.since ?? '')) bad.push(`quarantine row "${r.check}" has no since date (YYYY-MM-DD)`);
    if (!r.why || r.why.trim().length < 20) bad.push(`quarantine row "${r.check}" has no reason (why, 20+ characters)`);
    if (!r.askedBy || !r.askedBy.trim()) bad.push(`quarantine row "${r.check}" does not say who asked (askedBy)`);
  }
  return bad;
}

export type Outcome = 'pass' | 'flaky' | 'fail';
export interface Result { check: string; title: string; outcome: Outcome; attempts: number; ms: number; errors: string[]; logs: string[]; quarantined: boolean; out: string }

export interface GateOptions { gate: string; checks: Flow[]; only?: string[]; quarantine?: Quarantine }

async function withTimeout<T>(ms: number, p: Promise<T>, what: string): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([p, new Promise<T>((_, rej) => { t = setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000} s`)), ms); })]);
  } finally { if (t) clearTimeout(t); }
}

export async function runGate(o: GateOptions): Promise<{ results: Result[]; red: boolean; lines: string[] }> {
  const q = o.quarantine ?? readQuarantine();
  const lines: string[] = [];
  const qBad = checkQuarantine(q, o.checks.map((c) => c.name));
  const quarantined = new Set((q.rows ?? []).map((r) => r.check));
  const checks = o.only?.length ? o.checks.filter((c) => o.only!.includes(c.name)) : o.checks;
  const outRoot = join(process.env.E2E_OUT || join(tmpdir(), 'fel-gates'), o.gate);
  let budget = RETRY_BUDGET;
  const results: Result[] = [];
  let browser: Browser | null = null;
  try {
    browser = await launch();
    for (const c of checks) {
      const t0 = Date.now();
      let attempt = 0;
      let errors: string[] = [];
      let logs: string[] = [];
      let out = '';
      for (;;) {
        attempt++;
        out = join(outRoot, c.name, `attempt-${attempt}`);
        mkdirSync(out, { recursive: true });
        const sessions: Session[] = [];
        logs = [];
        errors = [];
        try {
          await withTimeout(c.timeoutMs ?? 120_000, c.run(makeContext(browser, out, logs, sessions)), c.name);
          errors = hygiene(sessions);
        } catch (e) {
          errors = [String((e as Error)?.message ?? e).split('\n').slice(0, 6).join('\n'), ...hygiene(sessions)];
          for (const s of sessions) await s.page?.screenshot({ path: join(out, 'failure.png') }).catch(() => {});
        } finally {
          for (const s of sessions) await s.close();
        }
        if (!errors.length || attempt > RETRIES || budget <= 0) break;
        budget--;
        lines.push(`  ↻ ${c.name}: attempt ${attempt} failed (${errors[0].split('\n')[0]}); retrying (${budget} retr${budget === 1 ? 'y' : 'ies'} left in this run's budget)`);
      }
      const outcome: Outcome = errors.length ? 'fail' : attempt > 1 ? 'flaky' : 'pass';
      results.push({ check: c.name, title: c.title, outcome, attempts: attempt, ms: Date.now() - t0, errors, logs, quarantined: quarantined.has(c.name), out });
    }
  } finally {
    await browser?.close().catch(() => {});
  }
  for (const r of results) {
    const mark = r.outcome === 'pass' ? '✓' : r.outcome === 'flaky' ? '≈' : '✗';
    lines.push(`  ${mark} ${r.check.padEnd(22)} ${(r.ms / 1000).toFixed(1).padStart(6)} s  ${r.outcome.toUpperCase()}${r.quarantined ? ' (QUARANTINED: does not block)' : ''} — ${r.title}`);
    for (const l of r.logs) lines.push(`      ${l}`);
    for (const e of r.errors) lines.push(`      ✗ ${e.replace(/\n/g, '\n        ')}`);
    if (r.outcome !== 'pass') lines.push(`      screenshots: ${r.out}`);
    if (r.quarantined && r.outcome === 'pass') lines.push(`      ${r.check} is quarantined but passed: it can come out of ${QUARANTINE_FILE} once the owner agrees`);
  }
  const flaky = results.filter((r) => r.outcome === 'flaky');
  if (flaky.length) lines.push(`  FLAKY (passed on a retry; green, but say so in the PR): ${flaky.map((r) => r.check).join(', ')}`);
  for (const b of qBad) lines.push(`  ✗ ${b}`);
  const red = qBad.length > 0 || results.some((r) => r.outcome === 'fail' && !r.quarantined);
  return { results, red, lines };
}

/** The CLI half every gate's ci-suite entry shares: `--only a,b`, print, exit code. */
export async function gateMain(gate: string, checks: Flow[], summary: string): Promise<void> {
  const i = process.argv.indexOf('--only');
  const only = i >= 0 ? (process.argv[i + 1] ?? '').split(',').filter(Boolean) : undefined;
  if (process.argv.includes('--list')) { for (const c of checks) console.log(`${c.name}\t${c.title}`); return; }
  // once the owner adds the dedicated browser-gates CI job (docs/QUALITY-GATES-PROPOSAL.md §2), the headless-suites step
  // sets this so the same checks do not run twice; the job itself does not set it. Unset (today): the gates run here.
  if (process.env.FEL_SKIP_BROWSER_GATES === '1') { console.log(`${gate}: skipped here — the browser-gates CI job runs it (FEL_SKIP_BROWSER_GATES=1)`); return; }
  const t0 = Date.now();
  const { results, red, lines } = await runGate({ gate, checks, only });
  console.log(`${gate}: ${summary}`);
  for (const l of lines) console.log(l);
  const n = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  console.log(`${gate}: ${n('pass')} passed, ${n('flaky')} flaky, ${n('fail')} failed of ${results.length} in ${((Date.now() - t0) / 1000).toFixed(0)} s — ${red ? 'RED' : 'GREEN'}`);
  process.exit(red ? 1 : 0);
}
