// The jump tests' bench (JUMP-TESTS, 2026-10-25): each protocol's honest and refused takes (lib/jump/protocolBench.ts)
// through the protocol reader, at 30/60/120/240 fps × 6 seeds. Prints, per cell: jumps counted / refused, the height's
// bias / SD against the take-off-velocity truth, and for the CMJ and the squat jump the take-off velocity, push-off
// and time to take-off against theirs. Synthetic ground truth, not people: docs/JUMP-PRO.md §10 quotes it, and nothing
// here is an accuracy claim.
//   npx tsx scripts/jump-tests-bench.ts [--seeds 6]
import { protocolTake } from '@/lib/jump/protocolBench';
import { PROTOCOL_IDS, readProtocolClip } from '@/lib/jump/protocols';
import { jumpKinematics, G } from '@/lib/jump/velocity';
import { posed } from '@/lib/jump/ballistic';

const seeds = Number(process.argv[process.argv.indexOf('--seeds') + 1]) || 6;
const stat = (v: number[]) => { if (!v.length) return '—'; const m = v.reduce((a, b) => a + b, 0) / v.length; const sd = v.length > 1 ? Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)) : 0; return `${m >= 0 ? '+' : ''}${m.toFixed(2)}/${sd.toFixed(2)}`; };
const hpoTrue = (posed({ d: 0, toeDeg: 25 }).LeftUpLeg[1] - posed({ d: 0.55, toeDeg: 0 }).LeftUpLeg[1]) * 100;
console.log('| test | fps | honest: counted / jumps | refused take: refused / jumps | height bias/SD (cm) | v0 bias/SD (m/s) | push-off bias/SD (cm) | time to take-off bias/SD (ms) |');
console.log('|---|---|---|---|---|---|---|---|');
for (const id of PROTOCOL_IDS) for (const fps of [30, 60, 120, 240]) {
  let n = 0, counted = 0, cn = 0, refused = 0;
  const dh: number[] = [], dv: number[] = [], dp: number[] = [], dt: number[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const { frames, truth } = protocolTake(id, { fps, seed });
    const r = readProtocolClip(frames, 4 / 3, id);
    n += truth.length;
    if (r.ok) for (const j of r.t5.jumps) {
      if (!j.valid) continue;
      const tr = truth.find((x) => Math.abs(x.takeoffT - j.takeoffT) < 100);
      if (!tr) continue;
      counted++;
      dh.push(j.heightCm - tr.heightV0Cm);
      if (id === 'cmjHips' || id === 'sj') {
        const k = jumpKinematics(j, { frames: r.frames, front: r.front, countermovement: id === 'cmjHips' });
        dv.push(k.v0Mps - Math.sqrt((2 * G * tr.heightV0Cm) / 100));
        if (k.pushOffCm !== null) dp.push(k.pushOffCm - hpoTrue);
        if (k.timeToTakeoffMs !== null) dt.push(k.timeToTakeoffMs - 650);
      }
    }
    const c = readProtocolClip(protocolTake(id, { fps, seed, kind: 'cheat' }).frames, 4 / 3, id);
    if (c.ok) {
      if (id === 'rj105') { cn += c.rj!.rebounds.length; refused += c.rj!.rebounds.filter((x) => !x.counted).length; }
      else { cn += c.t5.jumps.length; refused += c.t5.jumps.filter((j) => !j.valid).length; }
    }
  }
  console.log(`| ${id} | ${fps} | ${counted} / ${n} | ${refused} / ${cn}${id === 'rj105' ? ' rebounds' : ''} | ${stat(dh)} | ${stat(dv)} | ${stat(dp)} | ${stat(dt)} |`);
}
