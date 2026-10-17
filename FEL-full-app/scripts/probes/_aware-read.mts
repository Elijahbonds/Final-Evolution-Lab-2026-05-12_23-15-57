// _aware-read — how aware the bodies off the ball look, read off motion-probe records (H3c, owner 2026-10-16: "situational awareness":
// the AI teammates and defenders react to the play, and the players' eyes and bodies track the ball, their man and the rim). HOOPS
// MOTION plan phase 9's look gate, for every body that is not the ball handler, grouped by the job the mode gave it that frame (the
// record's `s.jb`: handler / space / cut / screen / roll / crash for the offence, onball / closeout / deny / help / recover / boxout /
// navigate / chase for the defence):
//   headBall  the head's forward against the ball (deg, p50 / p90)
//   inView    the share of frames the ball is inside 60° of the head (a player keeps the ball in view)
//   chestBall the chest's facing against the ball, flat (deg, p50)
//   hips      the hips' height while still (m, median) and the share of still frames in a DEEP crouch (hips under 0.80 m)
//   rim       the root's median distance to the rim, on the floor (m); paint = the share of STILL frames inside PAINT_M of it
//             (a spacer parked in the paint is no spacing)
//   bodies    how many body-frames the group holds
// and, per record frame, DOUBLE: the share of frames with two or more defenders on the ball at once (onball / closeout) while one
// man has it (a second one left his own man).
// Run it over a tag dir of 3v3 (or 1v1) records: every frame of every record counts once per body (records overlap; it is a read, not
// a census). JSON=1 prints the numbers.
//   npx tsx scripts/probes/_aware-read.mts ~/Claude/outbox/finish-release/hoopsmotion/<tag> [more dirs]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

type V3 = [number, number, number];
interface Body { rp: V3; rr?: V3; j?: V3[]; hf?: V3 }
interface Frame { t: number; ball: V3; B: Record<string, Body>; s?: { cr?: string; jb?: string } }
interface Rec { action: string; frames: Frame[] }
const JN = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
const J = Object.fromEntries(JN.map((n, i) => [n, i])) as Record<string, number>;
const DEEP_HIPS = 0.80, PAINT_M = 2.5;
const RIM_FLOOR: V3 = [0, 0, -0.6];
const recsOf = (p: string): string[] => statSync(p).isDirectory() ? readdirSync(p).filter((f) => /^rec-.*\.json$/.test(f)).map((f) => join(p, f)) : [p];
const pct = (a: number[], q: number) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const ang = (a: V3, b: V3) => { const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b) || 1); return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI; };
const team = (id: string) => (id.startsWith('foe') ? 'foe' : 'us');

interface G { head: number[]; chest: number[]; hipsStill: number[]; rim: number[]; paintStill: number; still: number; n: number }
const groups: Record<string, G> = {};
const g = (k: string) => (groups[k] ??= { head: [], chest: [], hipsStill: [], rim: [], paintStill: 0, still: 0, n: 0 });
let recs = 0, framesWithBall = 0, doubled = 0;
for (const arg of process.argv.slice(2)) for (const file of recsOf(arg)) {
  const rec = JSON.parse(readFileSync(file, 'utf8')) as Rec; recs++;
  const fr = rec.frames;
  fr.forEach((f, i) => {
    const jobs = Object.fromEntries((f.s?.jb ?? '').split(' ').filter(Boolean).map((p) => p.split(':') as [string, string]));
    const cr = f.s?.cr ?? '';
    const prev = fr[Math.max(0, i - 1)], next = fr[Math.min(fr.length - 1, i + 1)], dt = (next.t - prev.t) / 1000;
    if (cr) { framesWithBall++; if (Object.entries(jobs).filter(([id, j]) => team(id) !== team(cr) && (j === 'onball' || j === 'closeout')).length >= 2) doubled++; }
    for (const [id, b] of Object.entries(f.B)) {
      if (id === cr || !b.j || !b.hf) continue;
      const job = jobs[id] ?? (cr ? (team(id) === team(cr) ? 'off?' : 'def?') : 'loose');
      const side = cr ? (team(id) === team(cr) ? 'O' : 'D') : '-';
      const G1 = g(`${side} ${job}`); G1.n++;
      const head = b.j[J.Head]; if (!head) continue;
      G1.head.push(ang(b.hf, [f.ball[0] - head[0], f.ball[1] - head[1], f.ball[2] - head[2]]));
      const L = b.j[J.LeftShoulder], R = b.j[J.RightShoulder];
      if (L && R) {   // the chest's facing, flat: up × (the shoulder line), signed to the head's side
        const sx = R[0] - L[0], sz = R[2] - L[2]; let nx = -sz, nz = sx;
        if (nx * b.hf[0] + nz * b.hf[2] < 0) { nx = -nx; nz = -nz; }
        const mid: V3 = [(L[0] + R[0]) / 2, 0, (L[2] + R[2]) / 2];
        G1.chest.push(ang([nx, 0, nz], [f.ball[0] - mid[0], 0, f.ball[2] - mid[2]]));
      }
      const pb = prev.B[id], nb = next.B[id];
      const still = pb && nb && dt > 0 && Math.hypot(nb.rp[0] - pb.rp[0], nb.rp[2] - pb.rp[2]) / dt < 0.5;
      if (still && b.j[J.Hips]) G1.hipsStill.push(b.j[J.Hips][1]);
      const rd = Math.hypot(b.rp[0] - RIM_FLOOR[0], b.rp[2] - RIM_FLOOR[2]); G1.rim.push(rd);
      if (still) { G1.still++; if (rd < PAINT_M) G1.paintStill++; }
    }
  });
}
const out: Record<string, Record<string, number>> = {};
for (const [k, v] of Object.entries(groups).sort((a, b) => b[1].n - a[1].n)) {
  out[k] = {
    bodies: v.n, headBallP50: Math.round(pct(v.head, 0.5)), headBallP90: Math.round(pct(v.head, 0.9)),
    inView: Math.round((v.head.filter((a) => a < 60).length / Math.max(1, v.head.length)) * 100) / 100,
    chestBallP50: Math.round(pct(v.chest, 0.5)), hipsStill: Math.round(pct(v.hipsStill, 0.5) * 100) / 100,
    deep: Math.round((v.hipsStill.filter((y) => y < DEEP_HIPS).length / Math.max(1, v.hipsStill.length)) * 100) / 100,
    rimM: Math.round(pct(v.rim, 0.5) * 10) / 10, paint: Math.round((v.paintStill / Math.max(1, v.still)) * 100) / 100,
  };
}
const double = Math.round((doubled / Math.max(1, framesWithBall)) * 100) / 100;
if (process.env.JSON === '1') console.log(JSON.stringify({ recs, double, groups: out }));
else {
  console.log(`${recs} records · groups by side (O offence / D defence) and job · head/chest vs the ball (deg) · hips while still (m), deep = under ${DEEP_HIPS}`);
  console.log('group'.padEnd(16) + 'frames'.padStart(7) + 'head p50'.padStart(10) + 'p90'.padStart(6) + 'inView'.padStart(8) + 'chest p50'.padStart(11) + 'hips'.padStart(7) + 'deep'.padStart(7) + 'rim m'.padStart(7) + 'paint'.padStart(7));
  for (const [k, v] of Object.entries(out)) console.log(k.padEnd(16) + String(v.bodies).padStart(7) + String(v.headBallP50).padStart(10) + String(v.headBallP90).padStart(6) + String(v.inView).padStart(8) + String(v.chestBallP50).padStart(11) + String(v.hipsStill).padStart(7) + String(v.deep).padStart(7) + String(v.rimM).padStart(7) + String(v.paint).padStart(7));
  console.log(`two or more defenders on the ball at once: ${Math.round(double * 100)} % of the frames someone has it`);
}
