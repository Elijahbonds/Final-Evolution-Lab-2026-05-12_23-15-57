#!/usr/bin/env -S npx tsx
// File-size guard: a giant source file may shrink, never grow (QG-04, quality-gates lane, 2026-10-25).
//
// Owner, quality round 2026-10-20: "a file-size guard so giant files don't grow further, plus a 'split when touched' rule
// in LANES.md. No big-bang refactor." DunkMode.ts is 5,218 lines, ThreeVThreeMode.ts 4,302, OneVOneMode.ts 4,000, and
// every lane that touched them added to them. This holds the line where it is today.
//
// The rules, over every tracked or new source file (.ts .tsx .mts .js .mjs .cjs) outside public/ and lib/generated/:
//   * GIANT = more than LIMIT lines. Every giant file is listed in scripts/file-size-baseline.json with its line count.
//   * A listed file may not grow past its recorded count. Split it instead: move the new logic into a new file and keep
//     the giant file's diff to the wiring ("split when touched", docs/LANES.md section 3).
//   * A file that is not listed may not cross LIMIT. A new giant file is a finding, not a baseline row.
//   * A listed file that SHRANK is printed with the new, lower number to write back (`--write` does it). The ratchet only
//     goes down; the run stays green.
//   * The one way up is a raise row, `raises["<path>"] = { lines, why }`, which the owner sees in the PR diff. A raise
//     with no reason, or one that no longer covers anything, fails.
//   * A listed file that no longer exists is stale and fails, so the list cannot rot.
// Not counted: tests (*.test.* and tests/**: test counts only go up, and a regression test belongs beside its peers) and
// the one-off diagnostics in scripts/probes/**.
//
//   npx tsx scripts/file-size-guard-tests.ts            # check (CI runs this through scripts/ci-suite.ts)
//   npx tsx scripts/file-size-guard-tests.ts --write    # rewrite the baseline at today's counts (lowers only; a raise is
//                                                       # never written for you)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const LIMIT = 1000;
const ROOT = resolve(__dirname, '..');
const BASELINE = join(ROOT, 'scripts/file-size-baseline.json');

export interface Baseline {
  limit: number;
  measuredAt: string;
  files: Record<string, number>;
  raises: Record<string, { lines: number; why: string }>;
}

const SOURCE = /\.(ts|tsx|mts|mjs|js|cjs)$/;
export function counted(path: string): boolean {
  if (!SOURCE.test(path)) return false;
  if (path.startsWith('public/') || path.startsWith('lib/generated/') || path.includes('node_modules/')) return false;
  if (/\.test\.[a-z]+$/.test(path) || path.startsWith('tests/') || path.startsWith('scripts/probes/')) return false;
  return true;
}

export function lineCount(text: string): number {
  // wc -l: newlines. A last line with no newline still counts as a line.
  if (!text) return 0;
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return text.endsWith('\n') ? n : n + 1;
}

export interface Verdict { fail: string[]; shrank: Array<{ path: string; was: number; now: number }>; checks: number }

/** Pure check: the measured counts of every counted file against the baseline. */
export function check(base: Baseline, sizes: Record<string, number>): Verdict {
  const fail: string[] = [];
  const shrank: Verdict['shrank'] = [];
  let checks = 0;
  const ok = (c: boolean, msg: string) => { checks++; if (!c) fail.push(msg); };
  ok(base.limit === LIMIT, `the baseline's limit ${base.limit} is not the guard's ${LIMIT}`);
  for (const [path, lines] of Object.entries(sizes)) {
    const listed = base.files[path];
    const raise = base.raises[path];
    const cap = Math.max(listed ?? LIMIT, raise?.lines ?? 0);
    if (listed === undefined && !raise) {
      ok(lines <= LIMIT, `${path}: ${lines} lines — a new file over ${LIMIT} lines. Split it into smaller files (docs/LANES.md section 3, "split when touched").`);
      continue;
    }
    ok(lines <= cap, `${path}: ${lines} lines, up from ${cap}. A giant file may not grow: move the new logic into a new file and keep this file's diff to the wiring (docs/LANES.md section 3). If the owner agrees it must grow, add a raise row with the reason to scripts/file-size-baseline.json.`);
    if (listed !== undefined && lines < listed && !raise) shrank.push({ path, was: listed, now: lines });
  }
  for (const path of Object.keys(base.files)) {
    ok(path in sizes, `${path} is in the baseline but no longer exists (or is no longer counted): remove its row`);
  }
  for (const [path, r] of Object.entries(base.raises)) {
    ok(typeof r.why === 'string' && r.why.trim().length >= 10, `raise ${path}: a raise needs its reason (why)`);
    ok(path in sizes, `raise ${path}: the file no longer exists; remove the raise`);
    ok(!(path in sizes) || sizes[path] > (base.files[path] ?? LIMIT), `raise ${path}: the file is back within ${base.files[path] ?? LIMIT} lines; remove the raise`);
  }
  return { fail, shrank, checks };
}

function listFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\n').filter(Boolean).filter(counted).filter((p) => existsSync(join(ROOT, p)));
}

export function measure(files: string[] = listFiles()): Record<string, number> {
  const sizes: Record<string, number> = {};
  for (const p of files) sizes[p] = lineCount(readFileSync(join(ROOT, p), 'utf8'));
  return sizes;
}

/** Fixture checks: the guard must catch each of these, or a green run means nothing. */
function selfTest(): string[] {
  const base: Baseline = { limit: LIMIT, measuredAt: '2026-10-25', files: { 'big.ts': 1500 }, raises: {} };
  const errs: string[] = [];
  const expect = (name: string, v: Verdict, wantFail: boolean) => { if ((v.fail.length > 0) !== wantFail) errs.push(`self-test "${name}": expected ${wantFail ? 'a failure' : 'green'}, got ${JSON.stringify(v.fail)}`); };
  expect('unchanged', check(base, { 'big.ts': 1500, 'small.ts': 10 }), false);
  expect('giant grew by one line', check(base, { 'big.ts': 1501 }), true);
  expect('new file over the limit', check(base, { 'big.ts': 1500, 'new.ts': LIMIT + 1 }), true);
  expect('new file at the limit', check(base, { 'big.ts': 1500, 'new.ts': LIMIT }), false);
  expect('stale row', check(base, {}), true);
  expect('shrank is green', check(base, { 'big.ts': 1400 }), false);
  expect('raise with a reason', check({ ...base, raises: { 'big.ts': { lines: 1510, why: 'owner approved 2026-10-25: the X table' } } }, { 'big.ts': 1505 }), false);
  expect('raise without a reason', check({ ...base, raises: { 'big.ts': { lines: 1510, why: '' } } }, { 'big.ts': 1505 }), true);
  expect('raise past its number', check({ ...base, raises: { 'big.ts': { lines: 1510, why: 'owner approved 2026-10-25: the X table' } } }, { 'big.ts': 1511 }), true);
  expect('raise no longer needed', check({ ...base, raises: { 'big.ts': { lines: 1510, why: 'owner approved 2026-10-25: the X table' } } }, { 'big.ts': 1490 }), true);
  if (counted('lib/x.test.ts') || counted('tests/a.ts') || counted('scripts/probes/_p.mts') || counted('public/a.js') || counted('lib/generated/prisma/index.js')) errs.push('self-test: an excluded path is counted');
  if (!counted('lib/babylon/modes/DunkMode.ts') || !counted('scripts/ci-suite.ts') || !counted('app/page.tsx')) errs.push('self-test: a source path is not counted');
  if (lineCount('a\nb\n') !== 2 || lineCount('a\nb') !== 2 || lineCount('') !== 0) errs.push('self-test: lineCount does not match wc -l');
  return errs;
}

const isMain = (() => { try { return resolve(process.argv[1] ?? '') === resolve(__filename); } catch { return false; } })();
if (isMain) {
  const self = selfTest();
  if (self.length) { for (const e of self) console.error('  ✗ ' + e); process.exit(1); }
  const sizes = measure();
  const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;
  if (process.argv.includes('--write')) {
    const files: Record<string, number> = {};
    for (const [p, n] of Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b))) {
      if (n > LIMIT) files[p] = base.files[p] !== undefined ? Math.min(base.files[p], n) : n;   // lowers only; a growth stays red
    }
    const next: Baseline = { ...base, measuredAt: new Date().toISOString().slice(0, 10), files };
    writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
    console.log(`file-size-guard: wrote ${Object.keys(files).length} giant files to ${BASELINE}`);
  }
  const v = check(JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline, sizes);
  const giants = Object.entries(sizes).filter(([, n]) => n > LIMIT).sort((a, b) => b[1] - a[1]);
  console.log(`file-size-guard: ${Object.keys(sizes).length} source files counted, ${giants.length} over ${LIMIT} lines (largest: ${giants.slice(0, 3).map(([p, n]) => `${p} ${n}`).join(', ')})`);
  for (const s of v.shrank) console.log(`  ↓ ${s.path} shrank ${s.was} → ${s.now}: lower its row (npx tsx scripts/file-size-guard-tests.ts --write)`);
  if (v.fail.length) {
    console.error(`file-size-guard: ${v.fail.length} FAILED of ${v.checks}`);
    for (const f of v.fail) console.error('  ✗ ' + f);
    process.exit(1);
  }
  console.log(`file-size-guard: ${v.checks} checks green, plus the self-test cases`);
}
