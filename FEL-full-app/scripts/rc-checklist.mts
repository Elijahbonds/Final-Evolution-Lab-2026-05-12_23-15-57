// Ship pass 4, phase 10 — the release-candidate gate table, printed from the repo state.
//
//   npx tsx scripts/rc-checklist.mts                       # tsc, vitest, texture budget, git HEAD + rc tag
//   GAUNTLET_DIR=/tmp/fel-gauntlet npx tsx scripts/rc-checklist.mts   # + the latest gauntlet run's non-clean rows
//   REQUIRE_TAG=1 …                                        # the rc tag row becomes a gate (default: informational,
//                                                          #   because the orchestrator tags AFTER this table is green)
//   SKIP_SLOW=1 …                                          # skip tsc and vitest (table from files and git only)
//
// Read-only: nothing is written, no server is contacted. Exit 1 when any gate fails.
// Every number printed is measured here and now — nothing is read from a doc.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
type Row = { gate: string; result: string; ok: boolean | null }; // null = informational
const rows: Row[] = [];
const t0 = Date.now();

const sh = (cmd: string, args: string[]) =>
  spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: process.env });
const git = (...args: string[]) => {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; }
};

// 1. tsc — the gauntlet's rule: lines from .next*/types and node_modules are not ours.
if (process.env.SKIP_SLOW !== '1') {
  const r = sh('npx', ['tsc', '--noEmit']);
  const out = `${r.stdout}${r.stderr}`;
  const errs = out.split('\n').filter((l) => /error TS\d+/.test(l) && !/\.next[^/]*\/types|node_modules/.test(l));
  rows.push({ gate: 'tsc --noEmit', result: `exit ${r.status}; ${errs.length} error line(s) outside .next*/types`, ok: r.status === 0 && errs.length === 0 });
} else rows.push({ gate: 'tsc --noEmit', result: 'skipped (SKIP_SLOW=1)', ok: null });

// 2. vitest — Test Files / Tests counts as printed by the reporter.
if (process.env.SKIP_SLOW !== '1') {
  const r = sh('npx', ['vitest', 'run']);
  const out = `${r.stdout}${r.stderr}`.replace(/\x1b\[[0-9;]*m/g, '');
  const files = out.match(/Test Files\s+(.+)/)?.[1]?.trim() ?? '?';
  const tests = out.match(/\n\s*Tests\s+(.+)/)?.[1]?.trim() ?? '?';
  const failed = /\d+ failed/.test(files) || /\d+ failed/.test(tests);
  rows.push({ gate: 'vitest run', result: `exit ${r.status}; Test Files ${files}; Tests ${tests}`, ok: r.status === 0 && !failed });
} else rows.push({ gate: 'vitest run', result: 'skipped (SKIP_SLOW=1)', ok: null });

// 3. texture budget table (contract 3): measuredAt set; mobile median and the heaviest mode; the 2× rule.
{
  const p = join(ROOT, 'lib/babylon/config/textureBudget.json');
  if (!existsSync(p)) rows.push({ gate: 'textureBudget.json', result: 'missing', ok: false });
  else {
    type Tier = { median: number | null; modes: Record<string, { totalMB: number; textures?: number }> };
    const j = JSON.parse(readFileSync(p, 'utf8')) as { measuredAt: string | null; tiers: { desktop: Tier; mobile: Tier } };
    const m = j.tiers?.mobile;
    const modes = Object.entries(m?.modes ?? {});
    const max = modes.reduce<[string, number]>((a, [k, v]) => (v.totalMB > a[1] ? [k, v.totalMB] : a), ['—', -Infinity]);
    const measured = typeof j.measuredAt === 'string' && j.measuredAt.length > 0;
    const median = typeof m?.median === 'number' ? m.median : null;
    const over = median === null ? [] : modes.filter(([, v]) => v.totalMB > 2 * median).map(([k, v]) => `${k} ${v.totalMB} MB`);
    const desktopN = Object.keys(j.tiers?.desktop?.modes ?? {}).length;
    const result = measured
      ? `measuredAt ${j.measuredAt}; mobile median ${median ?? '?'} MB over ${modes.length} mode(s), max ${max[0]} ${isFinite(max[1]) ? max[1] : '?'} MB; desktop ${desktopN} mode(s) recorded; ${over.length ? `OVER 2×: ${over.join(', ')}` : 'none over 2× median'}`
      : `measuredAt null — the perf lane's probe has not written the table (mobile ${modes.length} mode(s))`;
    rows.push({ gate: 'texture budget (mobile ≤ 2× median)', result, ok: measured && median !== null && modes.length > 0 && over.length === 0 });
  }
}

// 4. latest gauntlet run file — every row that is not 0/0/0 (or "errors: 0" for the phone rows).
{
  const g = process.env.GAUNTLET_DIR;
  if (!g) rows.push({ gate: 'gauntlet (latest run)', result: 'GAUNTLET_DIR not given', ok: null });
  else if (!existsSync(g)) rows.push({ gate: 'gauntlet (latest run)', result: `${g} does not exist`, ok: false });
  else {
    const latest = (re: RegExp) => readdirSync(g).filter((f) => re.test(f)).map((f) => join(g, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
    const judge = (label: string, file: string | undefined) => {
      if (!file) { rows.push({ gate: label, result: 'no run file', ok: null }); return; }
      const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
      const bad: string[] = [];
      let n = 0;
      for (const l of lines) {
        if (/^tsc\s*:/.test(l)) { if (!/PASS/.test(l)) bad.push(l.trim()); continue; }
        if (/^vitest\s*:/.test(l)) { if (/failed/.test(l) || !/passed/.test(l)) bad.push(l.trim()); continue; }
        if (/^WARNING/.test(l)) { bad.push(l.trim()); continue; }
        if (/^#/.test(l)) continue;                 // a run header (the prod sweep writes one)
        if (!/^\S.*:/.test(l)) continue;
        n++;
        const clean = /FEL-FRAME 0 \| MISSING CLIP 0 \| errors 0/.test(l) || /^mobile\/\S+\s*:\s*errors: 0\s*$/.test(l);
        if (!clean) bad.push(l.replace(/\s+/g, ' ').trim());
      }
      const name = file.slice(g.length + 1);
      rows.push({ gate: label, result: `${name}: ${n} row(s), ${bad.length} non-clean${bad.length ? '\n      ' + bad.join('\n      ') : ''}`, ok: bad.length === 0 });
    };
    judge('gauntlet (latest run-*.txt)', latest(/^run-.*\.txt$/));
    const play = latest(/^play-\d.*\.txt$/);
    if (play) judge('play gauntlet (latest play-*.txt)', play);
  }
}

// 5. git HEAD and whether a v*-rc* tag points at it.
{
  const head = git('rev-parse', '--short', 'HEAD');
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const dirty = git('status', '--porcelain', '--untracked-files=no').split('\n').filter(Boolean).length;
  const tags = git('tag', '--points-at', 'HEAD').split('\n').filter((t) => /^v.*-rc/.test(t));
  const require = process.env.REQUIRE_TAG === '1';
  rows.push({ gate: 'git HEAD', result: `${head} (${branch})${dirty ? `, ${dirty} tracked file(s) modified` : ', clean'}`, ok: dirty === 0 });
  rows.push({ gate: 'rc tag at HEAD', result: tags.length ? tags.join(', ') : 'none (the orchestrator tags at integration)', ok: require ? tags.length > 0 : null });
}

// Print.
const w = Math.max(...rows.map((r) => r.gate.length));
const now = new Date();
const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
console.log(`RC checklist — ${local} (local) — ${ROOT}`);
console.log('-'.repeat(w + 12));
for (const r of rows) console.log(`${r.ok === null ? 'info' : r.ok ? 'PASS' : 'FAIL'}  ${r.gate.padEnd(w)}  ${r.result}`);
console.log('-'.repeat(w + 12));
const fails = rows.filter((r) => r.ok === false);
console.log(`${fails.length} gate(s) failing; ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(fails.length ? 1 : 0);
