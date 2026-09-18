// VENICE-SKATE-THPS grader — reads a probe's rows.json and prints the measured verdict per T-gate.
import fs from 'node:fs';
const f = process.argv[2];
const rows: any[] = JSON.parse(fs.readFileSync(f, 'utf8'));
const seg = (m: string) => rows.filter((r) => r.mark === m && r.s);
const all = rows.filter((r) => r.s);
const num = (xs: number[]) => xs.length ? { n: xs.length, min: +Math.min(...xs).toFixed(2), max: +Math.max(...xs).toFixed(2), avg: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) } : null;
const P = (s: string) => console.log(s);

P(`FRAMES ${rows.length}  marks: ${[...new Set(rows.map((r) => r.mark))].join(' · ')}`);
P('');
// PUSH
const push = seg('push');
P(`PUSH  frames ${push.length}  speed ${JSON.stringify(num(push.map((r) => r.s.speed)))}`);
const stopped = push.filter((r) => r.s.speed < 0.5).length;
P(`      speed<0.5 frames ${stopped}/${push.length}   stroking frames ${push.filter((r) => r.s.stroking).length}`);
let longest = 0, cur = 0;
for (const r of push) { if (r.s.speed < 0.5) { cur++; longest = Math.max(longest, cur); } else cur = 0; }
const dur = push.length > 1 ? (push[push.length - 1].t - push[0].t) / push.length : 0;
P(`      longest stalled run ${longest} frames (~${(longest * dur).toFixed(2)} s)   distance ${push.length ? Math.hypot(push[push.length - 1].s.pos.x - push[0].s.pos.x, push[push.length - 1].s.pos.z - push[0].s.pos.z).toFixed(2) : 0} m`);
P('');
// ARMS
for (const m of ['push', 'carve', 'ollie', 'kickflip', 'manual', 'grind-hold', 'patrol-hold', 'after']) {
  const g = seg(m).filter((r) => r.elbowL != null);
  if (!g.length) { P(`ARMS  ${m}: no frames`); continue; }
  const L = g.map((r) => r.elbowL), R = g.map((r) => r.elbowR);
  const tee = g.filter((r) => r.elbowL > 160 && r.elbowR > 160).length;
  P(`ARMS  ${m.padEnd(12)} elbowL ${JSON.stringify(num(L))}  elbowR ${JSON.stringify(num(R))}  BOTH>160 (T) ${tee}/${g.length}`);
}
const gAll = all.filter((r) => r.elbowL != null);
P(`ARMS  ALL          BOTH>160 (T) ${gAll.filter((r) => r.elbowL > 160 && r.elbowR > 160).length}/${gAll.length}`);
P('');
// RIDER GLUE (H2)
const gap = all.filter((r) => r.boardGap != null).map((r) => r.boardGap);
P(`GLUE  boardGap ${JSON.stringify(num(gap))}   frames > 0.4 m: ${gap.filter((g) => g > 0.4).length}`);
const pitch = all.map((r) => Math.abs(r.s.rot.x) * 180 / Math.PI), roll = all.map((r) => Math.abs(r.s.rot.z) * 180 / Math.PI);
P(`GLUE  |pitch| ${JSON.stringify(num(pitch))}  |roll| ${JSON.stringify(num(roll))}   inverted frames (>90 either) ${all.filter((r) => Math.abs(r.s.rot.x) > Math.PI / 2 || Math.abs(r.s.rot.z) > Math.PI / 2).length}`);
const hipOff = all.filter((r) => r.hipsY != null && r.rootY != null).map((r) => r.hipsY - r.rootY);
P(`GLUE  hips-above-root ${JSON.stringify(num(hipOff))}`);
P('');
// GRIND (H3)
const grindF = all.filter((r) => r.s.grinding).length;
P(`GRIND frames grinding ${grindF}/${all.length}   closest rail approach ${Math.min(...all.map((r) => r.s.railD ?? Infinity)).toFixed(2)} m`);
P(`      grind needle samples ${all.filter((r) => r.s.grindNeedle != null).length}   max held ${Math.max(0, ...all.map((r) => r.s.grindHeld ?? 0)).toFixed(2)} s   goals ${Math.max(...all.map((r) => r.s.goals ?? 0))}`);
P(`      PATROL RAIL frames grinding ${all.filter((r) => r.s.onPatrol).length}`);
P('');
// MANUAL
P(`MANUAL frames ${all.filter((r) => r.s.manual).length}   max held ${Math.max(0, ...all.map((r) => r.s.manualHeld ?? 0)).toFixed(2)} s`);
P('');
// POP HEIGHT (crouch scales the ollie)
for (const m of ['pop-short', 'pop-long']) {
  const g = seg(m).filter((r) => r.s.height != null);
  if (!g.length) { P(`POP   ${m}: no frames`); continue; }
  P(`POP   ${m.padEnd(10)} peak height ${Math.max(...g.map((r) => r.s.height)).toFixed(2)} m   max airtime ${Math.max(...g.map((r) => r.s.airtime ?? 0)).toFixed(2)} s`);
}
P('');
// AIR + SLOW-MO
P(`AIR   airborne frames ${all.filter((r) => !r.s.grounded).length}   max airtime ${Math.max(0, ...all.map((r) => r.s.airtime ?? 0)).toFixed(2)} s`);
P(`SLOW  frames with slow-mo ${all.filter((r) => (r.s.slow ?? 0) > 0).length}`);
P('');
// CLIPS
const clipCount: Record<string, number> = {};
for (const r of rows) for (const c of r.clips ?? []) { const n = c.split('@')[0]; clipCount[n] = (clipCount[n] ?? 0) + 1; }
P('CLIPS ' + Object.entries(clipCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));
