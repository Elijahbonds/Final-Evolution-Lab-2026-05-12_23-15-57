// hoops-timeline — read a basketball capture as numbers every 0.1 s, to cut move windows (MECHANICS/HOOPS pass, 2026-09-15).
// CMU bone names don't draw in bvh-sheet (it reads DeepMotion names), so this prints the body-local story instead:
//   hipsY (m, retargeted) · hips travel since the window start (x across / z along the capture's facing) · yaw (deg, the
//   hips' turn — a spin) · L/R hand height and forward reach (body frame) · lowest foot height (a jump shows as > 0.1)
//   npx tsx scripts/mocap/hoops-timeline.mts cmu:<file.bvh> [from=0] [to=end] [step=0.1]
import { readBvhStream } from './sources.mts';
import * as rtNs from '../../lib/babylon/anim/mocapRetarget.ts';
const RT = ((rtNs as unknown as { default?: typeof rtNs }).default ?? rtNs) as typeof rtNs;
const args = process.argv.slice(2);
const opt = (k: string, d: string) => args.find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1) ?? d;
for (const spec of args.filter((a) => /^(cmu|deepmotion):/.test(a))) {
  const file = spec.slice(spec.indexOf(':') + 1);
  const s = readBvhStream(file, spec.startsWith('cmu') ? 'cmu' : 'deepmotion');
  const dur = s.frames.length / s.fps;
  const from = Number(opt('from', '0')), to = Math.min(dur, Number(opt('to', String(dur)))), step = Number(opt('step', '0.1'));
  const r = RT.retargetToPoseKeys(s, { from: 0, to: dur, keyFps: 30, smoothSec: 0.03 });
  // raw hips for travel + yaw (the keys are body-local)
  const H = (t: number) => s.frames[Math.min(s.frames.length - 1, Math.round(t * s.fps))];
  const yawAt = (t: number) => { const f = H(t); const a = f.LeftUpLeg, b = f.RightUpLeg; return Math.atan2(b[2] - a[2], b[0] - a[0]) * 180 / Math.PI; };
  const h0 = H(from).Hips, y0 = yawAt(from);
  const unit = (() => { const f = H(0); return Math.hypot(f.Hips[0] - f.LeftFoot[0], f.Hips[1] - f.LeftFoot[1], f.Hips[2] - f.LeftFoot[2]); })();
  console.log(`== ${file.split('/').pop()} ${dur.toFixed(1)}s  (travel in leg lengths; hands/feet from keys, m)`);
  console.log(' t     hipsY  trvX  trvZ   yaw   Lhand(y,z)   Rhand(y,z)   footMin');
  for (let t = from; t <= to + 1e-6; t += step) {
    const k = r.keys[Math.min(r.keys.length - 1, Math.round(t * 30))];
    const f = H(t);
    let dy = yawAt(t) - y0; while (dy > 180) dy -= 360; while (dy < -180) dy += 360;
    const hand = (side: 'Left' | 'Right') => `${k.hands![side]![1].toFixed(2)},${k.hands![side]![2].toFixed(2)}`.padEnd(12);
    const footMin = Math.min(k.feet!.Left![1], k.feet!.Right![1]) + (k.hipsY ?? 0);
    console.log(`${t.toFixed(1).padStart(4)}  ${(k.hipsY ?? 0).toFixed(2)}  ${((f.Hips[0] - h0[0]) / unit).toFixed(2).padStart(5)} ${((f.Hips[2] - h0[2]) / unit).toFixed(2).padStart(5)}  ${dy.toFixed(0).padStart(4)}  ${hand('Left')} ${hand('Right')} ${footMin.toFixed(2)}`);
  }
}
