// move-feel / stick-feel — the ball handler's answer to the stick, headless (lane/move-feel, 2026-11-12; the owner: "Find out why the
// movement still feels off?"). The real DribbleController (its CourtMovement, GEARS_HANDLER, CUT_COST_HOOPS) stepped at a fixed 60 fps in
// node, through the moments a player feels — the rows _stick-response.mts has, plus the ones it does not:
//   turn     a jog / a sprint, the stick thrown 45° / 90°: the heading's turn rate in the first 100 ms (°/s) and the frames until the
//            travel is within 10° of the stick; the speed it dips to
//   kick     the turbo pressed at a jog: the largest one-frame acceleration (m/s²) and the frames to 90 % of the sprint
//   cut      a sprint, the stick thrown 90°: the largest one-frame deceleration (m/s²) — the cut cost paid in one frame or spread
//   gears    the stick's magnitude → the speed the body settles at: the walk / jog cliff at the 0.45 walk line
//   (and the start / stop / reversal rows of _stick-response, so one table holds everything)
// Deterministic (no randomness, no clock). It never changes a number: the values it plays come from the feel panel's own feel(), as a
// playtest run would.
//   npx tsx scripts/probes/move-feel/stick-feel.mts                       the defaults (what everyone plays)
//   PRESET=h3a|try npx tsx …                                              #311's H3a set, or this lane's "try these" set (TRY below)
//   FEEL='{"hoops.turnTrueArc":1}' npx tsx …                              any knob values (applied after the preset)
//   JSON=1 …                                                              one JSON line instead of the table
//   SELFTEST=1 …                                                          the control: a turn through the plain lerp is the closed form
import BC from '../../../lib/babylon/core/BasketballCore';   // (a .mts importing a .ts: the CJS default holds the exports)
import FP from '../../../lib/feel-panel/feel';
import HS from '../../../lib/babylon/core/HoopsStick';
const { DribbleController } = BC as unknown as typeof import('../../../lib/babylon/core/BasketballCore');
const { setFeelUser, setFeelSession, setFeelOverride } = FP as unknown as typeof import('../../../lib/feel-panel/feel');
const { H3A_STICK_PRESET, turnToward } = HS as unknown as typeof import('../../../lib/babylon/core/HoopsStick');

/** This lane's "try these" set (docs/MOVE-FEEL-DIAGNOSIS.md §5): the three H3a switches that change no speed or distance, only how a
 *  change arrives — a turn as a real arc, the turbo's kick and the cut cost spread over a few frames. Every other number stays as shipped. */
export const TRY: Readonly<Record<string, number>> = { 'hoops.turnTrueArc': 1, 'hoops.kickSec': 0.1, 'hoops.cutSec': 0.08 };

const apply = (o: Record<string, number>) => {
  setFeelUser(true); setFeelSession(null);
  for (const [id, v] of Object.entries(o)) if (setFeelOverride(id, v) !== v) throw new Error(`knob ${id} refused ${v}`);
};
if (process.env.PRESET === 'h3a') apply({ ...H3A_STICK_PRESET });
if (process.env.PRESET === 'try') apply({ ...TRY });
if (process.env.FEEL) apply(JSON.parse(process.env.FEEL));

if (process.env.SELFTEST === '1') {   // the control: turnToward(trueArc 0) is Lerp().normalize(); a 90° wish at share k turns atan(k/(1-k))
  const mk = (x: number, z: number) => ({ x, y: 0, z, set(a: number, b: number, c: number) { this.x = a; this.y = b; this.z = c; return this; }, normalize() { const L = Math.hypot(this.x, this.y, this.z) || 1; this.x /= L; this.y /= L; this.z /= L; return this; } });
  let bad = 0;
  for (const k of [0.1, 0.25, 0.5]) {
    const d = mk(0, 1), w = mk(1, 0);
    turnToward(d as never, w as never, Math.PI / 2, k, false);
    const got = Math.atan2(d.x, d.z) * 180 / Math.PI, want = Math.atan(k / (1 - k)) * 180 / Math.PI;
    const d2 = mk(0, 1); turnToward(d2 as never, w as never, Math.PI / 2, k, true);
    const got2 = Math.atan2(d2.x, d2.z) * 180 / Math.PI;
    const ok = Math.abs(got - want) < 1e-6 && Math.abs(got2 - 90 * k) < 1e-6; if (!ok) bad++;
    console.log(`k ${k}: lerp ${got.toFixed(3)}° (closed form ${want.toFixed(3)}°), slerp ${got2.toFixed(3)}° (want ${(90 * k).toFixed(3)}°) ${ok ? 'OK' : 'BAD'}`);
  }
  process.exit(bad ? 1 : 0);
}

const DT = 1 / 60, D2R = Math.PI / 180;
type Stick = { x: number; y: number; sprint: boolean };
type Drive = (t: number) => Stick;
interface P { t: number; vx: number; vz: number; s: number; x: number; z: number; hd: number }
/** The warm-up's last frame (the pace the change was thrown at), set by run(). */
let PRE: P | null = null;

/** Run the controller: `warm` first (not recorded; position zeroed after), then `drive` for `sec`. hd = the travel heading (°, atan2(x, z)). */
function run(drive: Drive, sec: number, warm?: { drive: Drive; sec: number }): P[] {
  const d = new DribbleController();
  let x = 0, z = 0;
  const step = (dr: Drive, t: number) => { const i = dr(t); d.update(DT, i.x, i.y, i.sprint); const v = d.vel; x += v.x * DT; z += v.z * DT; return v; };
  let last: P | null = null;
  if (warm) for (let t = 0; t < warm.sec - 1e-9; t += DT) { const v = step(warm.drive, t); last = { t: -DT, vx: v.x, vz: v.z, s: Math.hypot(v.x, v.z), x: 0, z: 0, hd: Math.atan2(v.x, v.z) / D2R }; }
  x = 0; z = 0;
  const out: P[] = [];
  PRE = last;
  for (let t = 0; t < sec - 1e-9; t += DT) { const v = step(drive, t); const s = Math.hypot(v.x, v.z); out.push({ t, vx: v.x, vz: v.z, s, x, z, hd: Math.atan2(v.x, v.z) / D2R }); }
  return out;
}
const ms = (t: number) => Math.round(t * 1000);
const firstT = (r: P[], ok: (p: P) => boolean) => { const p = r.find(ok); return p ? p.t + DT : NaN; };
const wrap = (a: number) => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };
const r2 = (v: number) => Math.round(v * 100) / 100;

// stick space: +y down (the modes' convention: -moveY is world +z). A stick at `deg` from straight up (forward), clockwise.
const AT = (deg: number, mag = 1, sprint = false): Drive => () => ({ x: Math.sin(deg * D2R) * mag, y: -Math.cos(deg * D2R) * mag, sprint });
const NONE: Drive = () => ({ x: 0, y: 0, sprint: false });

const rows: Record<string, number | string> = {};
{ // start / pace (jog, sprint), onset
  const j = run(AT(0), 1.5); const jt = Math.max(...j.map((p) => p.s));
  rows.jogTopMps = r2(jt); rows.jog90ms = ms(firstT(j, (p) => p.s >= 0.9 * jt));
  rows.onsetFrames = Math.round(firstT(j, (p) => Math.hypot(p.x, p.z) > 0.02) / DT);
  const s = run(AT(0, 1, true), 1.5); const st = Math.max(...s.map((p) => p.s));
  rows.sprintTopMps = r2(st); rows.sprint90ms = ms(firstT(s, (p) => p.s >= 0.9 * st));
}
{ // gears: the speed the stick's magnitude settles at (the walk line is 0.45)
  for (const m of [0.15, 0.3, 0.44, 0.46, 0.7, 1]) { const r = run(AT(0, m), 1.5); rows[`speedAtMag${m}`] = r2(r[r.length - 1].s); }
}
for (const [tag, sprint] of [['jog', false], ['sprint', true]] as const) { // stop
  const r = run(NONE, 1.5, { drive: AT(0, 1, sprint), sec: 1.5 });
  const t = firstT(r, (p) => p.s < 0.3); rows[`stop_${tag}_ms`] = ms(t);
  const at = r.find((p) => p.s < 0.3); rows[`stop_${tag}_m`] = at ? r2(Math.hypot(at.x, at.z)) : NaN;
}
for (const [tag, sprint] of [['jog', false], ['sprint', true]] as const) { // turns: 45° and 90° thrown at pace
  for (const deg of [45, 90]) {
    const r = run(AT(deg, 1, sprint), 1.2, { drive: AT(0, 1, sprint), sec: 1.5 });
    const k = Math.round(0.1 / DT) - 1;   // the heading after 100 ms
    rows[`turn${deg}_${tag}_degS_first100ms`] = Math.round(wrap(r[k].hd - 0) / 0.1);
    rows[`turn${deg}_${tag}_within10_ms`] = ms(firstT(r, (p) => Math.abs(wrap(p.hd - deg)) < 10));
    rows[`turn${deg}_${tag}_minSpeed`] = r2(Math.min(...r.slice(0, 40).map((p) => p.s)));
    const rr = [PRE!, ...r]; let maxDecel = 0; for (let i = 1; i < rr.length; i++) maxDecel = Math.max(maxDecel, (rr[i - 1].s - rr[i].s) / DT);
    rows[`turn${deg}_${tag}_maxDecel`] = Math.round(maxDecel);
  }
}
{ // the turbo pressed at a jog: the kick
  const r = run(AT(0, 1, true), 1.2, { drive: AT(0), sec: 1.5 });
  const rr = [PRE!, ...r]; let a = 0; for (let i = 1; i < rr.length; i++) a = Math.max(a, (rr[i].s - rr[i - 1].s) / DT);
  rows.kickMaxAccel = Math.round(a);
  rows.kickTo90ms = ms(firstT(r, (p) => p.s >= 0.9 * rows.sprintTopMps as number));
}
{ // reversal at a jog (180°): ms until the body travels the new way at half the jog
  const r = run(AT(180), 1.5, { drive: AT(0), sec: 1.5 });
  rows.reverse50ms = ms(firstT(r, (p) => p.vz < 0 && p.s >= 0.5 * (rows.jogTopMps as number)));
}
{ // weave: the stick swung 90° every 0.5 s at a jog (left-forward ↔ right-forward) — the speed lost and the heading lag
  const W: Drive = (t) => AT(Math.floor(t / 0.5) % 2 ? -45 : 45)(t);
  const r = run(W, 3, { drive: AT(45), sec: 1.5 });
  rows.weaveMinSpeed = r2(Math.min(...r.map((p) => p.s)));
  const lags: number[] = []; for (let k = 1; k < 6; k++) { const t0 = k * 0.5; const want = k % 2 ? -45 : 45; const seg = r.filter((p) => p.t >= t0 && p.t < t0 + 0.5); const p = seg.find((q) => Math.abs(wrap(q.hd - want)) < 10); lags.push(p ? p.t - t0 + DT : 0.5); }
  rows.weaveSettleMs = ms(lags.reduce((a, b) => a + b, 0) / lags.length);
}
{ // the snaps over one scripted session (start, turbo on and off, a 90° cut, a reversal, a stop): the largest one-frame speed jump
  const script: Drive = (t) => t < 1 ? AT(0)(t) : t < 1.8 ? AT(0, 1, true)(t) : t < 2.4 ? AT(0)(t) : t < 3.0 ? AT(90)(t) : t < 3.6 ? AT(-90)(t) : NONE(t);
  const r = run(script, 4.4);
  let jump = 0; for (let i = 1; i < r.length; i++) jump = Math.max(jump, Math.hypot(r[i].vx - r[i - 1].vx, r[i].vz - r[i - 1].vz));
  rows.speedJumpMaxMps = r2(jump);
}
if (process.env.JSON === '1') console.log(JSON.stringify(rows));
else for (const [k, v] of Object.entries(rows)) console.log(k.padEnd(34), v);
