// jump-accuracy — prints the jump accuracy bench (lib/jump/bench.ts) for each reader as markdown.
//   npx tsx scripts/jump-accuracy.ts [--reader frames|t5|body|all] [--seeds 6] [--only <condition substring>] [--fps 60]
//   npx tsx scripts/jump-accuracy.ts --approach [--reader approach|t5|frames|all] [--seeds 4]   (lib/jump/approachBench.ts)
//   npx tsx scripts/jump-accuracy.ts --reach [--seeds 6]        the standing reach and the touch height (lib/jump/reachBench.ts)
//   npx tsx scripts/jump-accuracy.ts --drop [--seeds 4]         drop jump / RSI (lib/jump/dropBench.ts), and what the jump
//                                                               check read of the same takes before (RSI only between jumps)
// Not a test suite (no -tests suffix): tests/jump-pro pins the targets. Pure, no network, no DB.
import { auditConditions, runCondition, table, type ConditionResult, type JumpReaderFn } from '../lib/jump/bench';
import { READERS } from '../lib/jump/readers';
import { approachConditions, approachReader, runApproach } from '../lib/jump/approachBench';
import { reachConditions, reachTable, runReach, runTouch, touchConditions, touchTable } from '../lib/jump/reachBench';
import { dropConditions, dropTable, dropTakes, runDrop } from '../lib/jump/dropBench';
import { gradeT5 } from '../lib/assess/graders/t5-cmj';
import { calibrateFront } from '../lib/assess/calibration';

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const flag = (k: string) => process.argv.includes(`--${k}`);
const set = flag('approach') ? 'approach' : 'standing';
const readers: Record<string, JumpReaderFn> = set === 'approach' ? { approach: approachReader, t5: READERS.t5, frames: READERS.frames } : { ...READERS };
const which = arg('reader') ?? (set === 'approach' ? 'approach' : 'all');
const seeds = Number(arg('seeds') ?? (set === 'approach' ? 4 : 6));
const only = arg('only');
const fpsOnly = arg('fps');

const keepC = (c: { name: string; fps: number }) => (!arg('only') || c.name.includes(arg('only')!)) && (!arg('fps') || String(c.fps) === arg('fps'));
if (flag('reach')) {
  console.log('\n### the standing reach (lib/jump/reach.ts)\n');
  console.log(reachTable(reachConditions(Number(arg('seeds') ?? 6)).filter(keepC).map(runReach)));
  console.log('\n### the touch height (reach × the jump\'s own leg ruler + the vertical)\n');
  console.log(touchTable(touchConditions(Number(arg('seeds') ?? 4)).filter(keepC).map(runTouch)));
  process.exit(0);
}
if (flag('drop')) {
  const conds = dropConditions(Number(arg('seeds') ?? 4)).filter(keepC);
  console.log('\n### drop jump — reader: drop (lib/jump/drop.ts)\n');
  console.log(dropTable(conds.map(runDrop)));
  // before: the jump check on the same takes (its calibration from the stand on the box): an RSI only between two jumps
  let takes = 0, rsi = 0, jumps = 0;
  for (const c of conds) for (const { frames } of dropTakes(c)) {
    takes++;
    const c0 = calibrateFront(frames.filter((f) => f.t < 1150), 4 / 3, 1000, 0.3);
    if (!c0.ok) continue;
    const cal = { aspect: 4 / 3, front: c0.value, side: null };
    const t5 = gradeT5(frames, { calibration: cal, aspect: 4 / 3 }).t5;
    jumps += t5.jumps.filter((j) => j.valid).length;
    if (t5.rebounds?.bestRsi) rsi++;
  }
  console.log(`\nbefore (the jump check, T5): ${takes} drop takes, ${jumps} valid jumps read, ${rsi} with an RSI`);
  process.exit(0);
}
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
