// _stick-response — how fast the ball handler answers the left stick (H3, owner 2026-10-16: "Dribbling and gameplay still feel
// off", "slow to the stick"). The real DribbleController (its CourtMovement and gears), stepped at 60 fps in node, through the
// moments a player feels:
//   start    full stick from a standstill (jog, then with turbo): ms to 50 % / 90 % of the gear's top, and metres by then
//   stop     the stick released at a jog and at a sprint: ms to under 0.3 m/s, and the slide (m)
//   reverse  a jog, then the stick thrown 180°: ms until the body travels the new way at 50 % of the jog
//   cut      a jog, then the stick thrown 90°: ms until the travel is within 20° of the new line
// Deterministic (no randomness, no clock). Prints a table; JSON=1 prints the numbers. Used for the H3 before / after.
//   npx tsx scripts/probes/_stick-response.mts
import BC from '../../lib/babylon/core/BasketballCore';   // (a .mts importing a .ts: the CJS default holds the exports)
const { DribbleController } = BC as unknown as typeof import('../../lib/babylon/core/BasketballCore');

const DT = 1 / 60;
type Drive = (t: number) => { x: number; y: number; sprint: boolean };
interface Run { t: number; vx: number; vz: number; s: number; x: number; z: number }

function run(drive: Drive, sec: number, warm?: { drive: Drive; sec: number }): Run[] {
  const d = new DribbleController();
  let x = 0, z = 0;
  const step = (dr: Drive, t: number) => { const i = dr(t); d.update(DT, i.x, i.y, i.sprint); const v = d.vel; x += v.x * DT; z += v.z * DT; return v; };
  if (warm) for (let t = 0; t < warm.sec; t += DT) step(warm.drive, t);
  x = 0; z = 0;
  const out: Run[] = [];
  for (let t = 0; t < sec; t += DT) { const v = step(drive, t); out.push({ t, vx: v.x, vz: v.z, s: Math.hypot(v.x, v.z), x, z }); }
  return out;
}
const ms = (t: number) => Math.round(t * 1000);
const firstT = (r: Run[], ok: (p: Run) => boolean) => { const p = r.find(ok); return p ? p.t + DT : NaN; };

// the stick: y up is forward (-moveY in the modes' convention is the world +z); this probe only needs magnitudes and directions
const FWD = (sprint = false): Drive => () => ({ x: 0, y: -1, sprint });
const NONE: Drive = () => ({ x: 0, y: 0, sprint: false });
const BACK: Drive = () => ({ x: 0, y: 1, sprint: false });
const SIDE: Drive = () => ({ x: 1, y: 0, sprint: false });

const rows: Record<string, number> = {};
{ // start (jog)
  const r = run(FWD(false), 1.5); const top = Math.max(...r.map((p) => p.s));
  rows.jogTop = +top.toFixed(2);
  rows.start50ms = ms(firstT(r, (p) => p.s >= 0.5 * top)); rows.start90ms = ms(firstT(r, (p) => p.s >= 0.9 * top));
  const at = r.find((p) => p.s >= 0.9 * top); rows.start90m = at ? +Math.hypot(at.x, at.z).toFixed(2) : NaN;
}
{ // start (turbo)
  const r = run(FWD(true), 1.5); const top = Math.max(...r.map((p) => p.s));
  rows.sprintTop = +top.toFixed(2); rows.sprint90ms = ms(firstT(r, (p) => p.s >= 0.9 * top));
}
for (const [tag, sprint] of [['jog', false], ['sprint', true]] as const) { // stop
  const r = run(NONE, 1.5, { drive: FWD(sprint), sec: 1.5 });
  const t = firstT(r, (p) => p.s < 0.3); rows[`stop_${tag}_ms`] = ms(t);
  const at = r.find((p) => p.s < 0.3); rows[`stop_${tag}_m`] = at ? +Math.hypot(at.x, at.z).toFixed(2) : NaN;
}
{ // reverse at a jog
  const r = run(BACK, 1.5, { drive: FWD(false), sec: 1.5 }); const top = rows.jogTop;
  const s0 = Math.sign(r[0].vz) || 1;   // the way the warm-up ran
  rows.reverse50ms = ms(firstT(r, (p) => Math.sign(p.vz) === -s0 && p.s >= 0.5 * top));
}
{ // 90° cut at a jog
  const r = run(SIDE, 1.5, { drive: FWD(false), sec: 1.5 });
  rows.cut20ms = ms(firstT(r, (p) => p.s > 0.5 && Math.abs(Math.atan2(Math.abs(p.vz), Math.abs(p.vx))) < (20 * Math.PI) / 180));
}
{ // THE SNAPS: the largest one-frame change in acceleration (m/s^3 / 100) and the largest one-frame speed jump (m/s) over a
  // scripted session — start, jog, turbo on and off, a 90° cut, a reversal, a stop
  const script: Drive = (t) => t < 1 ? { x: 0, y: -1, sprint: false } : t < 1.8 ? { x: 0, y: -1, sprint: true } : t < 2.4 ? { x: 0, y: -1, sprint: false }
    : t < 3.0 ? { x: 1, y: 0, sprint: false } : t < 3.6 ? { x: -1, y: 0, sprint: false } : { x: 0, y: 0, sprint: false };
  const r = run(script, 4.4);
  let jerk = 0, jump = 0, prevA: [number, number] | null = null;
  for (let i = 1; i < r.length; i++) {
    const ax = (r[i].vx - r[i - 1].vx) / DT, az = (r[i].vz - r[i - 1].vz) / DT;
    jump = Math.max(jump, Math.hypot(r[i].vx - r[i - 1].vx, r[i].vz - r[i - 1].vz));
    if (prevA) jerk = Math.max(jerk, Math.hypot(ax - prevA[0], az - prevA[1]) / DT);
    prevA = [ax, az];
  }
  rows.jerkMax_x100 = +(jerk / 100).toFixed(1); rows.speedJumpMax = +jump.toFixed(2);
}
if (process.env.JSON === '1') console.log(JSON.stringify(rows));
else for (const [k, v] of Object.entries(rows)) console.log(k.padEnd(14), v);
