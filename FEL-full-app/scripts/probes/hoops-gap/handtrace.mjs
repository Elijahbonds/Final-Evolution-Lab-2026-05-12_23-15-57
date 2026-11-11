// hoops-p05b: WHICH LAYER TAKES THE PALM OFF THE BALL? Reads a driver JSON recorded with HAND_TRACE=a-b (page.js: the hero's hand bones
// after every after-animations layer, after the before-camera pass and as drawn, with the ball) and prints, per traced frame, the palm's
// gap to the ball's surface after each stage (the palm = the hand bone + 8 cm along forearm -> hand; the ball's radius 12 cm — the rig's
// own apex read), for the hand nearer the ball as drawn. A dribble top (the run's ball.apexList, or --frame N) is marked.
//   node handtrace.mjs <run.json> [--frame N] [--all]
import fs from 'node:fs';
const args = process.argv.slice(2); const R = JSON.parse(fs.readFileSync(args[0], 'utf8'));
const only = args.includes('--frame') ? Number(args[args.indexOf('--frame') + 1]) : null;
const ev = R.handEv || [];
if (!ev.length) { console.error('no handEv: record with HAND_TRACE=a-b'); process.exit(2); }
const tops = new Set(((R.analysis && R.analysis.ball && R.analysis.ball.apexList) || []).map((a) => a[0]));
const PALM = 0.08, BR = 0.12;
const palm = (h, f) => { if (!h || !f) return null; const d = [h[0] - f[0], h[1] - f[1], h[2] - f[2]]; const L = Math.hypot(...d) || 1; return [h[0] + d[0] / L * PALM, h[1] + d[1] / L * PALM, h[2] + d[2] / L * PALM]; };
const gap = (p, b) => (p && b ? Math.hypot(p[0] - b[0], p[1] - b[1], p[2] - b[2]) - BR : NaN);
const byF = new Map(); for (const e of ev) { if (!byF.has(e[0])) byF.set(e[0], []); byF.get(e[0]).push(e); }
const short = (s) => String(s).replace(/^obs(\d+) .*?(\w+(?:Carry|Layer|Glide|Legs|Steer|Dip|Planting|Look|Posture|apply|feed)\w*).*$/, 'obs$1 $2').slice(0, 52);
for (const [f, list] of [...byF.entries()].sort((a, b) => a[0] - b[0])) {
  if (only !== null && f !== only) continue;
  if (only === null && !args.includes('--all') && !tops.has(f)) continue;
  const drawn = list.find((e) => e[1] === 'drawn') || list[list.length - 1];
  const bD = drawn[3];
  const pL = palm(drawn[2][0], drawn[2][2]), pR = palm(drawn[2][1], drawn[2][3]);
  const side = gap(pL, bD) <= gap(pR, bD) ? 0 : 1;
  console.log(`frame ${f}${tops.has(f) ? ' (a dribble top)' : ''}: the ${side ? 'rig Right' : 'rig Left'} hand; ball as drawn y ${bD ? bD[1].toFixed(3) : '-'}`);
  let prev = null;
  for (const e of list) {
    const p = palm(e[2][side], e[2][side + 2]); const gStage = gap(p, e[3]); const gDrawnBall = gap(p, bD);
    const moved = prev && p ? Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]) * 100 : 0; prev = p;
    console.log(`   ${short(e[1]).padEnd(54)} palm-ball gap ${(gStage * 100).toFixed(1).padStart(6)} cm (to the drawn ball ${(gDrawnBall * 100).toFixed(1).padStart(6)})  palm moved ${moved.toFixed(1).padStart(5)} cm`);
  }
}
