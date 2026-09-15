// take-timeline — what a whole capture does, every 0.1 s, in the terms a window is chosen by (2026-09-15, new styles):
// pelvis orientation as turn / tilt (the angle away from upright) / heading change, hips height over the floor, both feet
// and hands heights. An acrobatic take (a cartwheel, a backflip, a breakdance run) reads straight off it: the tilt passes
// 90–180°, the feet go up, the hands go down.
//   npx tsx scripts/mocap/take-timeline.mts cmu/90/90_02.bvh [step=0.1] [from=0] [to=end]
import { readBvhStream } from './sources.mts';
import * as rtNs from '../../lib/babylon/anim/mocapRetarget.ts';
const RT = ((rtNs as unknown as { default?: typeof rtNs }).default ?? rtNs) as typeof rtNs;
const args = process.argv.slice(2);
const opt = (k: string, d: string) => args.find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1) ?? d;
const ROOT = `${process.env.HOME}/Downloads/fel-mocap-sources`;
for (const f of args.filter((a) => a.endsWith('.bvh'))) {
  const s = readBvhStream(`${ROOT}/${f}`, 'cmu');
  const dur = s.frames.length / s.fps;
  const from = Number(opt('from', '0')), to = Math.min(dur, Number(opt('to', String(dur))));
  const step = Number(opt('step', '0.1'));
  const r = RT.retargetToPoseKeys(s, { from, to, keyFps: 1 / step, smoothSec: 0.04, rootTrack: true });
  console.log(`== ${f} ${dur.toFixed(1)} s (window ${from}–${to.toFixed(1)})   t  tilt°  yaw°  roll°  hipsH  footL footR  handL handR`);
  let prevYaw = 0, accYaw = 0;
  r.keys.forEach((k, i) => {
    const [, x, y, z, w, h] = r.root![i];
    // tilt = angle of the pelvis's up away from world up; yaw = heading of its front; roll sign from the up's x
    const upY = 1 - 2 * (x * x + z * z);
    const tilt = Math.acos(Math.max(-1, Math.min(1, upY))) * 180 / Math.PI;
    const fx = 2 * (x * z + w * y), fz = 1 - 2 * (x * x + y * y);
    const yaw = Math.atan2(fx, fz) * 180 / Math.PI;
    if (i) { let d = yaw - prevYaw; while (d > 180) d -= 360; while (d < -180) d += 360; accYaw += d; }
    prevYaw = yaw;
    const upX = 2 * (x * y - w * z);
    const lift = (v?: number[]) => (v ? v[1] : 0);
    // body-frame heights are relative to the pelvis; add the root height for a rough world height when upright
    console.log(`   ${(from + k.t).toFixed(1).padStart(5)}  ${tilt.toFixed(0).padStart(4)}  ${accYaw.toFixed(0).padStart(5)}  ${(upX * 90).toFixed(0).padStart(4)}  ${(0.96 + h).toFixed(2)}   ${lift(k.feet?.Left).toFixed(2)}  ${lift(k.feet?.Right).toFixed(2)}   ${lift(k.hands?.Left).toFixed(2)}  ${lift(k.hands?.Right).toFixed(2)}`);
  });
}
