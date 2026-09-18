// find-uppercut — a rising punch: a wrist climbing fast from chest height to above the chin while in front of the body.
//   npx tsx scripts/mocap/find-uppercut.mts cmu:<file.bvh> ...
import { readBvhStream } from './sources.mts';
import * as rtNs from '../../lib/babylon/anim/mocapRetarget.ts';
const RT = ((rtNs as unknown as { default?: typeof rtNs }).default ?? rtNs) as typeof rtNs;
for (const spec of process.argv.slice(2)) {
  const file = spec.slice(spec.indexOf(':') + 1);
  const s = readBvhStream(file, 'cmu'); const dur = s.frames.length / s.fps;
  const r = RT.retargetToPoseKeys(s, { from: 0, to: dur, keyFps: 30, smoothSec: 0.03 });
  const out: string[] = [];
  for (const side of ['Left', 'Right'] as const) {
    let last = -99;
    for (let i = 6; i < r.keys.length - 3; i++) {
      const h = r.keys[i].hands![side]!, h0 = r.keys[i - 6].hands![side]!;
      const rise = h[1] - h0[1];
      if (h[1] > 1.5 && rise > 0.35 && h[2] > 0.15 && r.keys[i].t - last > 0.5) { last = r.keys[i].t; out.push(`${side} rise ${rise.toFixed(2)} to y ${h[1].toFixed(2)} z ${h[2].toFixed(2)} at ${r.keys[i].t.toFixed(2)}s  window ${(r.keys[i].t - 0.35).toFixed(2)}–${(r.keys[i].t + 0.25).toFixed(2)}`); }
    }
  }
  console.log(`== ${file.split('/').pop()} ${dur.toFixed(1)}s\n  ${out.join('\n  ') || '(none)'}`);
}
