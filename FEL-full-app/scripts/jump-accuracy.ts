// jump-accuracy — prints the jump accuracy bench (lib/jump/bench.ts) for each reader as markdown.
//   npx tsx scripts/jump-accuracy.ts [--reader frames|t5|body|all] [--seeds 6] [--only <condition substring>]
// Not a test suite (no -tests suffix): tests/jump-pro pins the targets. Pure, no network, no DB.
import { auditConditions, runCondition, table, type JumpReaderFn } from '../lib/jump/bench';
import { READERS } from '../lib/jump/readers';

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const which = arg('reader') ?? 'all';
const seeds = Number(arg('seeds') ?? 6);
const only = arg('only');
const fpsOnly = arg('fps');

const names = which === 'all' ? Object.keys(READERS) : which.split(',');
for (const n of names) {
  const reader = (READERS as Record<string, JumpReaderFn>)[n];
  if (!reader) throw new Error(`unknown reader ${n}`);
  const conds = auditConditions(seeds).filter((c) => (!only || c.name.includes(only)) && (!fpsOnly || String(c.fps) === fpsOnly));
  const t0 = Date.now();
  const rs = conds.map((c) => runCondition(c, reader));
  console.log(`\n### reader: ${n} (${((Date.now() - t0) / 1000).toFixed(1)} s)\n`);
  console.log(table(rs));
  const why: Record<string, number> = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.reasons)) why[k] = (why[k] ?? 0) + v;
  console.log(`\nmissed, by reason: ${JSON.stringify(why)}`);
}
