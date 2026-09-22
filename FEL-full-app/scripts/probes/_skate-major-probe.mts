// SKATE-MAJOR probe (2026-09-21) — one scripted line through everything the P0 names, graded per rendered frame.
//
//   push / cruise / carve → grind the patrol rail → charged ollie → ollie + kickflip → a thrown bail → ride INTO the
//   picnic table (the interior-solid "elevator") → ride into the fence at speed (the slam) → the wallride
//
// Per frame: root pose, grounded / grinding / air, speed, the clips at weight, both hands against their SHOULDERS (height
// and reach — a "T" is both hands at shoulder height and out), both elbows, both feet in the DECK's frame (detach), and
// the banner. Grades: one-frame Y steps while grounded (the elevator), T frames, detached feet in the air, still frames
// with the stick held, teleports, pops, and whether every readable state showed its own clip.
//
//   PORT=3098 OUT=/tmp/skate-major npx tsx scripts/probes/_skate-major-probe.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.env.PORT ?? '3098';
const OUT = process.env.OUT ?? '/tmp/skate-major';
const BOUND = 56;
fs.mkdirSync(OUT, { recursive: true });

type Q = { x: number; y: number; z: number; yaw: number; speed: number; grounded: boolean; grinding: boolean; height: number; banner: string };

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  await p.addInitScript(() => {
    const pad: any = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    (window as any).__PAD = pad; (navigator as any).getGamepads = () => [pad];
  });
  const logs: { t: number; s: string }[] = [];
  const t00 = Date.now();
  let missing = 0, frameErr = 0, errors = 0;
  p.on('console', (m) => {
    const s = m.text();
    if (/MISSING CLIP/.test(s)) missing++; if (/FEL-FRAME/.test(s)) frameErr++;
    if (m.type() === 'error' && !/401|FEL-FRAME/.test(s)) errors++;
    if (/SKATE-(MANUAL|LAND|GRIND|NAN|WALL|LIP|JUICE|SLOWMO|SOLID)|REFUSED|PAGEERROR|MISSING CLIP|FEL-SPAWN|error/i.test(s) && !/401/.test(s)) logs.push({ t: (Date.now() - t00) / 1000, s: s.slice(0, 220) });
  });
  p.on('pageerror', (e) => { errors++; logs.push({ t: (Date.now() - t00) / 1000, s: 'PAGEERROR ' + String(e).slice(0, 200) }); });
  await p.goto(`http://127.0.0.1:${PORT}/dev/mode/skateboard`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForSelector('canvas', { timeout: 300000 });
  const padSet = (lx: number, ly: number) => p.evaluate(([x, y]) => { const g = (window as any).__PAD; g.axes[0] = x; g.axes[1] = y; g.timestamp = Date.now(); }, [lx, ly]);
  const BTN: Record<string, number> = { A: 0, B: 1, X: 2, Y: 3, R1: 5, RT: 7 };
  const press = (n: string, down: boolean, value = 1) => p.evaluate(([i, d, v]) => { const g = (window as any).__PAD; g.buttons[i] = { pressed: !!d, touched: !!d, value: d ? v : 0 }; g.timestamp = Date.now(); }, [BTN[n], down ? 1 : 0, value]);
  const tap = async (n: string, ms = 70) => { await press(n, true); await p.waitForTimeout(ms); await press(n, false); };
  for (let i = 0; i < 200; i++) {
    const ok = await p.evaluate(() => !!(window as any).__FEL_DEV__?.skate && /playing/i.test(document.body.innerText)).catch(() => false);
    if (ok) break;
    const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
    await p.keyboard.press('Space').catch(() => {});
    await p.waitForTimeout(700);
  }
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    const w = window as any, dev = w.__FEL_DEV__, scene = dev.scene, root = dev.hero();
    const under = new Set<any>(root.getDescendants(false));
    const sks = scene.skeletons.filter((s: any) => s.bones.some((b: any) => under.has(b.getTransformNode())));
    const node = (n: string) => { for (const sk of sks) { const b = sk.bones.find((bb: any) => bb.name.replace(/^mixamorig:?/, '').replace(/_c\d+$/, '') === n); if (b?.getTransformNode()) return b.getTransformNode(); } return null; };
    const B: Record<string, any> = {};
    for (const n of ['Hips', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'Head']) B[n] = node(n);
    const board = scene.meshes.find((m: any) => m.name === 'board' && m.parent === root);
    const groups = scene.animationGroups.filter((g: any) => g.targetedAnimations.some((t: any) => under.has(t.target) || under.has(t.target?.getTransformNode?.())));
    w.__SM = { rows: [], marks: [], missing: Object.entries(B).filter(([, v]) => !v).map(([k]) => k), board: !!board, t0: performance.now() };
    const ang = (a: any, b: any, c: any) => { const pa = a.getAbsolutePosition(), pb = b.getAbsolutePosition(), pc = c.getAbsolutePosition(); const u = pa.subtract(pb), v = pc.subtract(pb); const d = (u.x * v.x + u.y * v.y + u.z * v.z) / (u.length() * v.length() || 1); return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI; };
    scene.onAfterRenderObservable.add(() => {
      const s = dev.skate();
      const r: any = { t: +((performance.now() - w.__SM.t0) / 1000).toFixed(3), x: +s.pos.x.toFixed(3), y: +s.pos.y.toFixed(3), z: +s.pos.z.toFixed(3), yaw: +s.rot.y.toFixed(3), roll: +s.rot.z.toFixed(3),
        g: s.grounded, grind: s.grinding, air: +s.airtime.toFixed(2), h: +s.height.toFixed(2), sp: +s.speed.toFixed(2), man: s.manual, pop: s.pop, grab: s.grab ?? null, stroking: s.stroking, drive: s.drive, steer: s.steer,
        bail: !!s.bailing, wall: !!s.wall, dt: +(performance.now() - (w.__SM.lastT ?? performance.now())).toFixed(1) };
      w.__SM.lastT = performance.now();
      const m = document.body.innerText.match(/"banner":\s*"([^"]*)"/); r.banner = m ? m[1] : '';
      if (B.LeftArm && B.LeftHand && B.RightArm && B.RightHand) {
        const hand = (side: string) => { const sh = B[side + 'Arm'].getAbsolutePosition(), hd = B[side + 'Hand'].getAbsolutePosition(); return { dy: +(hd.y - sh.y).toFixed(3), dh: +Math.hypot(hd.x - sh.x, hd.z - sh.z).toFixed(3), el: B[side + 'ForeArm'] ? +ang(B[side + 'Arm'], B[side + 'ForeArm'], B[side + 'Hand']).toFixed(0) : null }; };
        r.L = hand('Left'); r.R = hand('Right');
      }
      if (board && B.LeftFoot && B.RightFoot) {
        const inv = board.computeWorldMatrix(true).clone().invert();
        const loc = (n: any) => { const q = n.getAbsolutePosition(); const mm = inv.m; return [+(q.x * mm[0] + q.y * mm[4] + q.z * mm[8] + mm[12]).toFixed(2), +(q.x * mm[1] + q.y * mm[5] + q.z * mm[9] + mm[13]).toFixed(2), +(q.x * mm[2] + q.y * mm[6] + q.z * mm[10] + mm[14]).toFixed(2)]; };
        r.fL = loc(B.LeftFoot); r.fR = loc(B.RightFoot);
      }
      r.clips = groups.filter((g: any) => g.isPlaying && (g.weight < 0 ? 1 : g.weight) > 0.05).map((g: any) => `${g.name}@${(g.weight < 0 ? 1 : g.weight).toFixed(2)}`);
      w.__SM.rows.push(r);
    });
  });
  const meta = await p.evaluate(() => ({ missing: (window as any).__SM.missing, board: (window as any).__SM.board }));
  console.log('meta', JSON.stringify(meta));
  const mark = (label: string) => p.evaluate((l) => { (window as any).__SM.marks.push({ t: +((performance.now() - (window as any).__SM.t0) / 1000).toFixed(3), label: l }); }, label);
  const q = async (): Promise<Q> => p.evaluate(() => { const s = (window as any).__FEL_DEV__.skate(); const m = document.body.innerText.match(/"banner":\s*"([^"]*)"/); return { x: s.pos.x, y: s.pos.y, z: s.pos.z, yaw: s.rot.y, speed: s.speed, grounded: s.grounded, grinding: s.grinding, height: s.height, banner: m ? m[1] : '' }; });
  const wrap = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const shot = (n: string) => p.screenshot({ path: `${OUT}/${n}.png` });
  /** Steer at (tx, tz) holding forward until `until` says stop or time runs out. The heading is the TRAVEL direction. */
  async function driveTo(tx: number, tz: number, until: (r: Q) => boolean, maxMs: number): Promise<Q> {
    const t0 = Date.now(); let r = await q(); let prev = r; let travel = r.yaw;
    while (Date.now() - t0 < maxMs) {
      r = await q();
      if (until(r)) break;
      const dx = r.x - prev.x, dz = r.z - prev.z; if (Math.hypot(dx, dz) > 0.05) travel = Math.atan2(dx, dz); prev = r;
      const want = Math.atan2(tx - r.x, tz - r.z);
      const err = wrap(want - travel);
      await padSet(Math.max(-1, Math.min(1, err * 1.4)), -1);
      await p.waitForTimeout(40);
    }
    return r;
  }
  const waitUntil = async (f: (r: Q) => boolean, maxMs: number) => { const t0 = Date.now(); let r = await q(); while (Date.now() - t0 < maxMs && !f(r)) { await p.waitForTimeout(40); r = await q(); } return r; };

  // ── 1. push / cruise, then the patrol rail (it runs down +z from z −12 to −7, x patrolling ±1.6) ──
  await mark('push');
  await padSet(0, -1);
  let r = await waitUntil((s) => s.z > -14.2, 6000);
  await mark('grind-pop');
  await tap('A');
  await shot('01-pop');
  r = await waitUntil((s) => s.grinding, 1500);
  if (r.grinding) { await shot('02-grind'); }
  await waitUntil((s) => !s.grinding && s.grounded, 4000);
  await p.waitForTimeout(400);
  // ── 2. carve left / right ──
  await mark('carve-left');
  await padSet(-1, -1); await p.waitForTimeout(700); await shot('03-carve-left'); await p.waitForTimeout(500);
  await mark('carve-right');
  await padSet(1, -1); await p.waitForTimeout(700); await shot('04-carve-right'); await p.waitForTimeout(500);
  await padSet(0, -1);
  await p.waitForTimeout(400);
  // ── 3. a charged ollie, then an ollie + kickflip ──
  await mark('ollie-charged');
  await press('RT', true, 1); await p.waitForTimeout(500); await press('RT', false); await tap('A');
  await p.waitForTimeout(260); await shot('05-air');
  await waitUntil((s) => s.grounded, 2500); await p.waitForTimeout(500);
  // the grammar (BoardTricks): a held DIRECTION plus a button. Stick LEFT + A = KICKFLIP; stick UP (forward) + B = INDY.
  await mark('kickflip');
  await tap('A'); await p.waitForTimeout(140); await padSet(-1, 0); await tap('A'); await padSet(0, -1); await p.waitForTimeout(160); await shot('06-kickflip');
  await waitUntil((s) => s.grounded, 2500); await p.waitForTimeout(600);
  // ── 3b. B in the air (SKATE-MAJOR: B used to be swallowed as a manual request) ──
  await mark('b-indy');
  await tap('A'); await p.waitForTimeout(160); await tap('B'); await p.waitForTimeout(200); await shot('06b-indy');
  await waitUntil((s) => s.grounded, 2500); await p.waitForTimeout(600);
  // ── 4. a thrown bail: a kickflip started too late in a short air lands mid-flip ──
  await mark('bail');
  await tap('A'); await p.waitForTimeout(600); await padSet(-1, 0); await tap('A'); await padSet(0, -1);
  r = await waitUntil((s) => /BAIL|SKETCHY/.test(s.banner), 2500); await p.waitForTimeout(350); await shot('07-bail');
  r = await waitUntil((s) => /BAIL/.test(s.banner), 1500);
  await p.waitForTimeout(1200);
  // ── 5. the picnic table (0.62, −0.3 · 2.4 × 4.6 × 0.78) — ride straight into its long side from the west ──
  const TX = 0.62 * BOUND, TZ = -0.3 * BOUND;
  await mark('to-table');
  await driveTo(TX - 9, TZ, (s) => Math.hypot(s.x - (TX - 9), s.z - TZ) < 2.5, 25000);
  await mark('table-hit');
  r = await driveTo(TX, TZ, (s) => s.x > TX - 1.8 || s.y > 0.3 || /SLAM|EDGE|BAIL/.test(s.banner), 6000);
  await shot('08-table');
  console.log(`table: reached (${r.x.toFixed(1)}, ${r.y.toFixed(2)}, ${r.z.toFixed(1)}) banner "${r.banner}"`);
  await p.waitForTimeout(1500);
  // ── 6. the east fence at speed (a slam) ──
  await mark('to-fence');
  await driveTo(TX + 6, TZ + 12, (s) => Math.hypot(s.x - (TX + 6), s.z - (TZ + 12)) < 3, 12000);
  await mark('fence-slam');
  r = await driveTo(BOUND + 5, TZ + 12, (s) => s.x > BOUND - 0.6 || /SLAM|EDGE/.test(s.banner), 8000);
  await padSet(0, -1);
  await p.waitForTimeout(300); await shot('09-fence');
  console.log(`fence: (${r.x.toFixed(1)}, ${r.z.toFixed(1)}) speed ${r.speed.toFixed(1)} banner "${r.banner}"`);
  await p.waitForTimeout(1500);
  // ── 7. the wallride (fx 0.2, fz 0.82, 11 wide, 0.5 deep): pop at the face, hold the grind button ──
  const faceZ = 0.82 * BOUND - 0.25, faceX = 0.2 * BOUND;
  await mark('to-wall');
  await driveTo(faceX, faceZ - 16, (s) => Math.hypot(s.x - faceX, s.z - (faceZ - 16)) < 3, 30000);
  await mark('wallride');
  r = await driveTo(faceX, faceZ + 2, (s) => s.z > faceZ - 3.8, 12000);
  await tap('A'); await p.waitForTimeout(230); await press('X', true); await p.waitForTimeout(400); await shot('10-wall');
  await p.waitForTimeout(500); await press('X', false); await padSet(0, -1);
  r = await waitUntil((s) => s.grounded && s.height < 0.2, 3000);
  await mark('wall-exit');
  await p.waitForTimeout(1500); await shot('11-after-wall');
  await padSet(0, 0);
  await mark('end');

  const data = await p.evaluate(() => (window as any).__SM) as { rows: any[]; marks: { t: number; label: string }[] };
  fs.writeFileSync(`${OUT}/rows.json`, JSON.stringify(data));
  fs.writeFileSync(`${OUT}/logs.json`, JSON.stringify(logs, null, 1));
  const rows = data.rows;
  // ── grade ──
  const segOf = (t: number) => { let l = ''; for (const m of data.marks) if (m.t <= t) l = m.label; return l; };
  const DECK = 0.03, SOLE = 0.07;
  const off = (f: number[]) => Math.abs(f[1] - SOLE - DECK) > 0.14 || Math.abs(f[0]) > 0.30 || Math.abs(f[2]) > 0.55;
  const air = rows.filter((r) => r.fL && !r.g && r.h > 0.1 && !r.grind && !r.bail);   // a falling rider's feet are off the deck by design
  const detached = air.filter((r) => off(r.fL) || off(r.fR));
  const wallDetached = rows.filter((r) => r.fL && r.wall && (off(r.fL) || off(r.fR))).length, wallFrames = rows.filter((r) => r.wall).length;
  // a T: both hands at shoulder height (within 0.14 m) and reaching out 0.32 m or more, elbows over 95°
  const isT = (r: any) => r.L && r.R && Math.abs(r.L.dy) < 0.14 && Math.abs(r.R.dy) < 0.14 && r.L.dh > 0.32 && r.R.dh > 0.32;
  const tFrames = rows.filter(isT);
  const tBy: Record<string, number> = {}; for (const r of tFrames) { const k = r.clips.map((c: string) => c.split('@')[0]).join('+'); tBy[k] = (tBy[k] ?? 0) + 1; }
  // the elevator: a grounded frame whose y rose > 0.4 over the previous grounded frame
  const steps: string[] = [];
  for (let i = 1; i < rows.length; i++) { const a = rows[i - 1], b = rows[i]; if (a.g && b.g && b.y - a.y > 0.4) steps.push(`${b.t}s +${(b.y - a.y).toFixed(2)} at (${b.x},${b.z}) [${segOf(b.t)}]`); }
  // stalls: stick held forward (drive > 0.3), grounded, not bailing, and the BODY not moving (< 0.02 m a frame) for a run
  let still = 0, longestStill = 0, stillAt = '';
  for (let i = 1; i < rows.length; i++) { const r = rows[i], q = rows[i - 1]; const d = Math.hypot(r.x - q.x, r.z - q.z); if (r.drive > 0.3 && r.g && !r.bail && d < 0.02) { still++; if (still > longestStill) { longestStill = still; stillAt = `${r.t}s at (${r.x},${r.z}) [${segOf(r.t)}]`; } } else still = 0; }
  // teleports / pops (a frame longer than 80 ms is a hitch, not a teleport — counted apart)
  let jumps = 0; const jumpAt: string[] = []; let pops = 0; const popAt: string[] = []; let hitches = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i]; const d = Math.hypot(b.x - a.x, b.z - a.z); const dy = Math.abs(wrap(b.yaw - a.yaw)) * 180 / Math.PI;
    if (b.dt > 80) { hitches++; continue; }
    if (d > 0.6 || (dy > 30 && a.g && b.g)) { jumps++; if (jumpAt.length < 8) jumpAt.push(`${b.t}s d=${d.toFixed(2)} yawΔ=${dy.toFixed(0)} [${segOf(b.t)}]`); }
    if (a.L && b.L) { const dl = Math.hypot(b.L.dy - a.L.dy, b.L.dh - a.L.dh), dr = Math.hypot(b.R.dy - a.R.dy, b.R.dh - a.R.dh); if (Math.max(dl, dr) > 0.22) { pops++; if (popAt.length < 8) popAt.push(`${b.t}s ${Math.max(dl, dr).toFixed(2)} ${a.clips.join('+')}→${b.clips.join('+')}`); } }
  }
  // clip timeline per segment
  const bySeg: Record<string, Record<string, number>> = {};
  for (const r of rows) { const s = segOf(r.t); bySeg[s] ??= {}; for (const c of r.clips) { const n = c.split('@')[0]; if (Number(c.split('@')[1]) > 0.5) bySeg[s][n] = (bySeg[s][n] ?? 0) + 1; } }
  const summary = {
    meta, frames: rows.length, seconds: rows.length ? rows[rows.length - 1].t : 0,
    elevatorSteps: steps, tFrames: tFrames.length, tBy, airFrames: air.length, detachedAir: detached.length,
    worstDetach: detached.slice().sort((a, b) => Math.max(Math.abs(b.fL[1]), Math.abs(b.fR[1])) - Math.max(Math.abs(a.fL[1]), Math.abs(a.fR[1])))[0] ?? null,
    wallFrames, wallDetached, longestStillFrames: longestStill, stillAt, teleports: jumps, jumpAt, hitches, pops, popAt,
    grindFrames: rows.filter((r) => r.grind).length, manualFrames: rows.filter((r) => r.man).length,
    banners: [...new Set(rows.map((r) => r.banner).filter(Boolean))],
    lands: logs.filter((l) => /SKATE-LAND/.test(l.s)).map((l) => l.s.replace(/^.*SKATE-LAND\] /, '')),
    grinds: logs.filter((l) => /SKATE-GRIND/.test(l.s)).map((l) => l.s.replace(/^.*SKATE-GRIND\] /, '')),
    walls: logs.filter((l) => /SKATE-(WALL|SOLID)/.test(l.s)).map((l) => l.s.replace(/^.*\] /, '')),
    errors: logs.filter((l) => /PAGEERROR|NAN/.test(l.s)), missing, frameErr, consoleErrors: errors, clipsBySegment: bySeg,
  };
  fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
