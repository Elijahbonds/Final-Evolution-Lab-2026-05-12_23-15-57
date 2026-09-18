// take-events — the acrobatic EVENTS in every take of some subjects, one line each (2026-09-15, new styles): INVERT (the
// pelvis past 70° off upright: cartwheels, flips, handsprings), SPIN (≥ 200° of heading in 1.2 s while upright), KICK (a
// foot ≥ 1.1 m above its own hips-frame floor), FLOOR (hips under 0.55 m: breakdance floorwork, rolls). Windows padded
// 0.25 s. Read with take-timeline.mts for the detail.
//   npx tsx scripts/mocap/take-events.mts subjects=85,87,88,89,90,75,127
import fs from 'node:fs';
import { readBvhStream } from './sources.mts';
import * as rtNs from '../../lib/babylon/anim/mocapRetarget.ts';
const RT = ((rtNs as unknown as { default?: typeof rtNs }).default ?? rtNs) as typeof rtNs;
const args = process.argv.slice(2);
const opt = (k: string, d: string) => args.find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1) ?? d;
const ROOT = `${process.env.HOME}/Downloads/fel-mocap-sources`;
const index = new Map<string, string>();
try { for (const l of fs.readFileSync(`${ROOT}/cmu-index.txt`, 'utf8').split('\n')) { const [id, ...d] = l.split('\t'); if (id) index.set(id.trim(), d.join(' ').trim()); } } catch { /* optional */ }
for (const subj of opt('subjects', '85,87,88,89,90').split(',')) {
  const dir = `${ROOT}/cmu/${subj}`; if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.bvh')).sort()) {
    const s = readBvhStream(`${dir}/${f}`, 'cmu');
    const dur = s.frames.length / s.fps;
    if (dur > 90) continue;
    let r;
    try { r = RT.retargetToPoseKeys(s, { from: 0, to: dur, keyFps: 10, smoothSec: 0.04, rootTrack: true }); } catch { continue; }
    const n = r.keys.length, dt = dur / Math.max(1, n - 1);
    const tilt: number[] = [], yaw: number[] = []; let prev = 0, acc = 0;
    r.root!.forEach(([, x, y, z, w], i) => {
      tilt.push(Math.acos(Math.max(-1, Math.min(1, 1 - 2 * (x * x + z * z)))) * 180 / Math.PI);
      const a = Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y)) * 180 / Math.PI;
      if (i) { let d = a - prev; while (d > 180) d -= 360; while (d < -180) d += 360; acc += d; } prev = a; yaw.push(acc);
    });
    const hips = r.root!.map((k) => 0.96 + k[5]);
    const foot = r.keys.map((k) => Math.max(k.feet!.Left![1], k.feet!.Right![1]));
    const ev: string[] = [];
    const runs = (pred: (i: number) => boolean, name: string, extra: (a: number, b: number) => string) => {
      for (let i = 0; i < n; i++) {
        if (!pred(i)) continue;
        let j = i; while (j + 1 < n && pred(j + 1)) j++;
        ev.push(`${name} ${Math.max(0, i * dt - 0.25).toFixed(1)}–${Math.min(dur, j * dt + 0.25).toFixed(1)} ${extra(i, j)}`);
        i = j;
      }
    };
    runs((i) => tilt[i] > 70, 'INVERT', (a, b) => `max ${Math.max(...tilt.slice(a, b + 1)).toFixed(0)}° hipsTop ${Math.max(...hips.slice(a, b + 1)).toFixed(2)}`);
    runs((i) => hips[i] < 0.55 && tilt[i] <= 70, 'FLOOR', (a, b) => `${((b - a) * dt).toFixed(1)} s`);
    runs((i) => foot[i] > 1.1 && tilt[i] <= 70, 'KICK', (a, b) => `foot ${Math.max(...foot.slice(a, b + 1)).toFixed(2)}`);
    const k12 = Math.round(1.2 / dt);
    runs((i) => i + k12 < n && Math.abs(yaw[i + k12] - yaw[i]) >= 200 && Math.max(...tilt.slice(i, i + k12)) < 60, 'SPIN', (a, b) => `${Math.abs(yaw[Math.min(n - 1, b + k12)] - yaw[a]).toFixed(0)}°`);
    const id = f.replace('.bvh', '');
    console.log(`${id.padEnd(7)} ${dur.toFixed(1).padStart(5)}s  ${(index.get(id) ?? '').slice(0, 34).padEnd(34)}  ${ev.slice(0, 8).join(' | ') || '-'}`);
  }
}
