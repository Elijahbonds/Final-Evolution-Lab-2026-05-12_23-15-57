// jump-accuracy — prints the jump accuracy bench (lib/jump/bench.ts) for each reader as markdown.
//   npx tsx scripts/jump-accuracy.ts [--reader frames|t5|body|all] [--seeds 6] [--only <condition substring>] [--fps 60]
//   npx tsx scripts/jump-accuracy.ts --approach [--reader approach|t5|frames|all] [--seeds 4]   (lib/jump/approachBench.ts)
// Not a test suite (no -tests suffix): tests/jump-pro pins the targets. Pure, no network, no DB.
import { auditConditions, runCondition, table, type ConditionResult, type JumpReaderFn } from '../lib/jump/bench';
import { READERS } from '../lib/jump/readers';
import { approachConditions, approachReader, runApproach } from '../lib/jump/approachBench';

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const flag = (k: string) => process.argv.includes(`--${k}`);
const set = flag('approach') ? 'approach' : 'standing';
const readers: Record<string, JumpReaderFn> = set === 'approach' ? { approach: approachReader, t5: READERS.t5, frames: READERS.frames } : { ...READERS };
const which = arg('reader') ?? (set === 'approach' ? 'approach' : 'all');
const seeds = Number(arg('seeds') ?? (set === 'approach' ? 4 : 6));
const only = arg('only');
const fpsOnly = arg('fps');

const names = which === 'all' ? Object.keys(readers) : which.split(',');
for (const n of names) {
  const reader = readers[n];
  if (!reader) throw new Error(`unknown reader ${n} (this set: ${Object.keys(readers).join(', ')})`);
  const keep = (c: { name: string; fps: number }) => (!only || c.name.includes(only)) && (!fpsOnly || String(c.fps) === fpsOnly);
  const t0 = Date.now();
  const rs: ConditionResult[] = set === 'approach'
    ? approachConditions(seeds).filter(keep).map((c) => runApproach(c, reader))
    : auditConditions(seeds).filter(keep).map((c) => runCondition(c, reader));
  console.log(`\n### ${set} — reader: ${n} (${((Date.now() - t0) / 1000).toFixed(1)} s)\n`);
  console.log(table(rs));
  const why: Record<string, number> = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.reasons)) why[k] = (why[k] ?? 0) + v;
  console.log(`\nmissed, by reason: ${JSON.stringify(why)}`);
}
