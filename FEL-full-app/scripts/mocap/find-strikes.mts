// find-strikes — where the punches, kicks and blocks ARE in a long capture (EVERYONE-BODY-MOCAP-OPPONENTS, 2026-09-14).
// A "boxing" trial is a minute of shadow-boxing; a karate form is a dozen techniques. Picking windows by eye off a
// contact sheet is slow and imprecise, so this reads the retargeted body-local keys (lib/babylon/anim/mocapRetarget.ts)
// at 30 fps and reports peaks:
//   punch  a wrist's forward reach (+z) beyond its guard, per side
//   kick   an ankle's height over the floor (keyed ankle + hipsY), per side
// Each peak prints a suggested window [peak − lead, peak + tail] and the peak value, so opponent-clips.json can cite it.
//
//   npx tsx scripts/mocap/find-strikes.mts cmu:<file.bvh> [kind=punch|kick] [min=0.35]
import { readBvhStream, type JointStream } from './sources.mts';
import * as rtNs from '../../lib/babylon/anim/mocapRetarget.ts';
const RT = ((rtNs as unknown as { default?: typeof rtNs }).default ?? rtNs) as typeof rtNs;

const args = process.argv.slice(2);
const opt = (k: string, d: string) => args.find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1) ?? d;
const kind = opt('kind', 'punch') as 'punch' | 'kick';
const min = Number(opt('min', kind === 'punch' ? '0.35' : '0.45'));
for (const spec of args.filter((a) => /^(cmu|deepmotion):/.test(a))) {
  const file = spec.slice(spec.indexOf(':') + 1);
  const s: JointStream = readBvhStream(file, spec.startsWith('cmu') ? 'cmu' : 'deepmotion');
  const dur = s.frames.length / s.fps;
  const r = RT.retargetToPoseKeys(s, { from: 0, to: dur, keyFps: 30, smoothSec: 0.03 });
  const series = (side: 'Left' | 'Right') => r.keys.map((k) => kind === 'punch' ? k.hands![side]![2] : k.feet![side]![1] + (k.hipsY ?? 0));
  const out: string[] = [];
  for (const side of ['Left', 'Right'] as const) {
    const v = series(side);
    const base = [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];            // the guard / standing level
    let lastPeak = -1;
    for (let i = 3; i < v.length - 3; i++) {
      if (v[i] < Math.max(min, base + 0.12)) continue;
      if (v.slice(i - 3, i + 4).some((x, k) => k !== 3 && x > v[i])) continue;       // a local maximum over ±0.1 s
      if (lastPeak >= 0 && i - lastPeak < 6) continue;                               // one peak per strike (a held pose plateaus)
      lastPeak = i;
      const t = r.keys[i].t;
      out.push(`${side.padEnd(5)} peak ${t.toFixed(2)}s  ${kind === 'punch' ? 'reach' : 'foot'} ${v[i].toFixed(2)} m   window ${(Math.max(0, t - 0.3)).toFixed(2)}–${Math.min(dur, t + 0.3).toFixed(2)}`);
    }
  }
  console.log(`== ${file.split('/').pop()} (${dur.toFixed(1)} s, ${kind}, facing ${r.baseYawDeg}°)\n  ${out.sort((a, b) => parseFloat(a.split('peak ')[1]) - parseFloat(b.split('peak ')[1])).join('\n  ') || '(no peaks over ' + min + ')'}`);
}
