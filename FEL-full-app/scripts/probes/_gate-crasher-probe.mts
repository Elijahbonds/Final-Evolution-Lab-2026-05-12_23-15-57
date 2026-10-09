// GATE-CRASHER-MAJOR probe (2026-09-28) — the snowboard slalom graded per rendered frame, against what the eye can SEE.
//
//   LINE=race   the whole run, heading-steered at the gates, with an AIM OFFSET per gate (dead centre, just inside a
//               pole, just outside it, well wide) so every verdict can be checked against where the rider really crossed
//   LINE=walls  a few gates, then straight into the piste edge at speed (the slam), the stick HELD into it (the glue),
//               at a rock (the bail), through the treeline, and into the park features (a box, a wallride)
//
// Per frame: root pose, speed, grounded / grinding / bail / landing, the gate the mode is on, the clips at weight, both hands
// against their shoulders (the T), and whether the root is INSIDE a solid (a feature box, a pylon, a tree trunk, a rock)
// below its top — a body passing through scenery. Per gate crossing: the lateral offset from the gate's centre, the pole
// half-width the world drew, and the mode's verdict. Honest = credited iff the rider went between the poles.
//
//   PORT=3131 OUT=/tmp/gc LINE=race [VENUE=glacier] npx tsx scripts/probes/_gate-crasher-probe.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.env.PORT ?? '3131';
const OUT = process.env.OUT ?? '/tmp/gate-crasher';
const LINE = process.env.LINE ?? 'race';
const SHOTS = process.env.SHOTS !== '0';
const MAXMS = Number(process.env.MAXMS ?? 110000);
/** VENUE=alpine-run | night-park | glacier (the splash's picker writes ?venue=) */
const VENUE = process.env.VENUE ?? '';
fs.mkdirSync(OUT, { recursive: true });

/** The aim offsets the race line cycles through, metres from the gate centre (poles are drawn at ±POLE). */
const AIMS = (process.env.AIMS ?? '0,0,1.2,0,2.6,0,-1.35,0,-2.4,0,1.95,0,0,-1.9,0').split(',').map(Number);

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
  let missing = 0, frameErr = 0, errors = 0, spawnWarn = 0;
  p.on('console', (m) => {
    const s = m.text();
    if (/MISSING CLIP/.test(s)) missing++; if (/FEL-FRAME/.test(s)) frameErr++;
    if (/missed raycasts/.test(s)) spawnWarn++;
    if (m.type() === 'error' && !/401|FEL-FRAME/.test(s)) errors++;
    if (/SNOW-|REFUSED|PAGEERROR|MISSING CLIP|error/i.test(s) && !/401/.test(s)) logs.push({ t: (Date.now() - t00) / 1000, s: s.slice(0, 220) });
  });
  p.on('pageerror', (e) => { errors++; logs.push({ t: (Date.now() - t00) / 1000, s: 'PAGEERROR ' + String(e).slice(0, 200) }); });
  await p.goto(`http://127.0.0.1:${PORT}/dev/mode/snowboard_slalom${VENUE ? `?venue=${VENUE}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForSelector('canvas', { timeout: 300000 });
  const padSet = (lx: number, ly: number) => p.evaluate(([x, y]) => { const g = (window as any).__PAD; g.axes[0] = x; g.axes[1] = y; g.timestamp = Date.now(); }, [lx, ly]);
  const BTN: Record<string, number> = { A: 0, B: 1, X: 2, Y: 3, R1: 5, RT: 7 };
  const press = (n: string, down: boolean, value = 1) => p.evaluate(([i, d, v]) => { const g = (window as any).__PAD; g.buttons[i] = { pressed: !!d, touched: !!d, value: d ? v : 0 }; g.timestamp = Date.now(); }, [BTN[n], down ? 1 : 0, value]);
  const tap = async (n: string, ms = 70) => { await press(n, true); await p.waitForTimeout(ms); await press(n, false); };
  // the splash: what the player is told BEFORE the run (the title and the win condition)
  for (let i = 0; i < 60; i++) {
    const ready = await p.evaluate(() => /START/.test(document.body.innerText) && !!(window as any).__FEL_DEV__?.snow).catch(() => false);
    if (ready) break;
    await p.waitForTimeout(700);
  }
  const splashText = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600));
  if (SHOTS) await p.screenshot({ path: `${OUT}/00-splash.png` });
  for (let i = 0; i < 200; i++) {
    const ok = await p.evaluate(() => { const s = (window as any).__FEL_DEV__?.snow?.(); return !!s && s.elapsed > 0; }).catch(() => false);
    if (ok) break;
    const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
    await p.keyboard.press('Space').catch(() => {});
    await p.waitForTimeout(500);
  }
  const hudAtStart = await p.evaluate(() => { const s = (window as any).__FEL_DEV__.snow(); return { elapsed: s.elapsed, text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 400) }; });
  if (SHOTS) await p.screenshot({ path: `${OUT}/01-start.png` });
  await p.evaluate(() => {
    const w = window as any, dev = w.__FEL_DEV__, scene = dev.scene, root = dev.hero();
    let r0 = root; while (r0.parent) r0 = r0.parent;
    const under = new Set<any>(r0.getDescendants(false));
    const sks = scene.skeletons.filter((s: any) => s.bones.some((b: any) => under.has(b.getTransformNode())));
    const node = (n: string) => { for (const sk of sks) { const b = sk.bones.find((bb: any) => bb.name.replace(/^mixamorig:?/, '').replace(/_c\d+$/, '') === n); if (b?.getTransformNode()) return b.getTransformNode(); } return null; };
    const B: Record<string, any> = {};
    for (const n of ['Hips', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'Head']) B[n] = node(n);
    const groups = scene.animationGroups.filter((g: any) => g.targetedAnimations.some((t: any) => under.has(t.target) || under.has(t.target?.getTransformNode?.())));
    // THE SOLIDS a body must not pass through: the park's boxes / wallrides / rails (their OBBs), the lift pylons, the rocks
    // and every tree trunk (thin instances: read the instance matrices).
    const solids: { name: string; inv: any; min: any; max: any }[] = [];
    for (const m of scene.meshes) {
      if (!/^(snow_box|snow_wallride|snow_rail|pylon_|rock_)/.test(m.name) || !m.isEnabled()) continue;
      const wm = m.computeWorldMatrix(true); const bb = m.getBoundingInfo().boundingBox;
      solids.push({ name: m.name, inv: wm.clone().invert(), min: bb.minimum.clone(), max: bb.maximum.clone() });
    }
    const trunks: { x: number; z: number; y: number }[] = [];
    for (const m of scene.meshes) {
      if (!/trunk/.test(m.name)) continue;
      const data = m._thinInstanceDataStorage?.matrixData;
      if (data) for (let i = 0; i + 15 < data.length; i += 16) trunks.push({ x: data[i + 12], y: data[i + 13], z: data[i + 14] });
    }
    // the gate poles, as the world drew them (the verdict is checked against THESE, not against the mode's own threshold)
    const poles: { x: number; z: number }[] = [];
    for (const m of scene.meshes) {
      if (m.name !== 'gate') continue;
      const data = m._thinInstanceDataStorage?.matrixData;
      if (data) for (let i = 0; i + 15 < data.length; i += 16) poles.push({ x: data[i + 12], z: data[i + 14] });
    }
    w.__GC = { rows: [], marks: [], crossings: [], solids: solids.map((s) => s.name), trunks: trunks.length, poles: poles.length, t0: performance.now(), lastGate: dev.snow().nextGate, lastT: performance.now() };
    const inside = (x: number, y: number, z: number): string | null => {
      for (const s of solids) {
        const lp = w.BABYLON ? null : null; void lp;
        const m = s.inv.m;
        const lx = x * m[0] + (y + 0.6) * m[4] + z * m[8] + m[12], ly = x * m[1] + (y + 0.6) * m[5] + z * m[9] + m[13], lz = x * m[2] + (y + 0.6) * m[6] + z * m[10] + m[14];
        if (lx > s.min.x + 0.05 && lx < s.max.x - 0.05 && ly > s.min.y && ly < s.max.y && lz > s.min.z + 0.05 && lz < s.max.z - 0.05) return s.name;
      }
      for (const t of trunks) if (Math.hypot(t.x - x, t.z - z) < 0.3 && y < t.y + 0.8) return 'trunk';
      return null;
    };
    const ang = (a: any, b: any, c: any) => { const pa = a.getAbsolutePosition(), pb = b.getAbsolutePosition(), pc = c.getAbsolutePosition(); const u = pa.subtract(pb), v = pc.subtract(pb); const d = (u.x * v.x + u.y * v.y + u.z * v.z) / (u.length() * v.length() || 1); return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI; };
    scene.onAfterRenderObservable.add(() => {
      const s = dev.snow();
      const now = performance.now();
      const r: any = { t: +((now - w.__GC.t0) / 1000).toFixed(3), dt: +(now - w.__GC.lastT).toFixed(1), x: +s.pos.x.toFixed(3), y: +s.pos.y.toFixed(3), z: +s.pos.z.toFixed(3), yaw: +s.rot.y.toFixed(3), roll: +s.rot.z.toFixed(3),
        sp: +s.speed.toFixed(2), g: s.grounded, grind: s.grinding, bail: s.bailing, land: s.landing, edge: s.edge, wall: s.onWall, steer: +s.steer.toFixed(2), tuck: +s.tuck.toFixed(2),
        gate: s.nextGate, hit: s.gatesHit, score: s.score, el: +s.elapsed.toFixed(2), ended: s.ended };
      w.__GC.lastT = now;
      const m = document.body.innerText.match(/"banner":\s*"([^"]*)"/); r.banner = m ? m[1] : '';
      r.inside = inside(s.pos.x, s.pos.y, s.pos.z);
      if (B.LeftArm && B.LeftHand && B.RightArm && B.RightHand) {
        const hand = (side: string) => { const sh = B[side + 'Arm'].getAbsolutePosition(), hd = B[side + 'Hand'].getAbsolutePosition(); return { dy: +(hd.y - sh.y).toFixed(3), dh: +Math.hypot(hd.x - sh.x, hd.z - sh.z).toFixed(3), el: B[side + 'ForeArm'] ? +ang(B[side + 'Arm'], B[side + 'ForeArm'], B[side + 'Hand']).toFixed(0) : null }; };
        r.L = hand('Left'); r.R = hand('Right');
      }
      r.clips = groups.filter((g: any) => g.isPlaying && (g.weight < 0 ? 1 : g.weight) > 0.05).map((g: any) => `${g.name}@${(g.weight < 0 ? 1 : g.weight).toFixed(2)}`);
      // a gate crossing: the mode moved on to the next gate this frame — where was the rider against the one he passed?
      if (s.nextGate !== w.__GC.lastGate) {
        const prev = w.__GC.prevGate;
        if (prev) {
          const near = poles.filter((pp) => Math.abs(pp.z - prev.z) < 0.5).sort((a, b) => a.x - b.x);
          const half = near.length >= 2 ? (near[near.length - 1].x - near[0].x) / 2 : null;
          const pp = w.__GC.prevPos ?? { x: s.pos.x, z: s.pos.z };
          const k = s.pos.z > pp.z ? Math.max(0, Math.min(1, (prev.z - pp.z) / (s.pos.z - pp.z))) : 1;
          const xc = pp.x + (s.pos.x - pp.x) * k;
          w.__GC.crossings.push({ i: w.__GC.lastGate, t: r.t, dx: +(xc - prev.x).toFixed(3), half: half != null ? +half.toFixed(2) : null, verdictHit: s.gatesHit > (w.__GC.lastHits ?? 0), sp: r.sp, aim: w.__GC.aim ?? null });
        }
        w.__GC.lastGate = s.nextGate;
      }
      w.__GC.prevGate = s.gate; w.__GC.lastHits = s.gatesHit; w.__GC.prevPos = { x: s.pos.x, z: s.pos.z };
      w.__GC.rows.push(r);
    });
  });
  const meta = await p.evaluate(() => ({ solids: (window as any).__GC.solids.length, trunks: (window as any).__GC.trunks, poles: (window as any).__GC.poles }));
  console.log('meta', JSON.stringify(meta));
  const mark = (label: string) => p.evaluate((l) => { (window as any).__GC.marks.push({ t: +((performance.now() - (window as any).__GC.t0) / 1000).toFixed(3), label: l }); }, label);
  const q = () => p.evaluate(() => { const s = (window as any).__FEL_DEV__.snow(); return { ...s }; });
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const shot = (n: string) => SHOTS ? p.screenshot({ path: `${OUT}/${n}.png` }) : Promise.resolve();
  /** Hold a HEADING (yaw, radians): the snow board integrates yaw from the stick, so a held stick is a circle. */
  async function holdYaw(yaw: number, tuck = true) {
    const s = await q();
    const err = wrap(yaw - s.rot.y);
    await padSet(Math.max(-1, Math.min(1, err * 2.5)), -0.75);
    await press('RT', tuck, 1);
    return s;
  }
  /** Heading-steer at a world point (the boards pass's snow driver: steer the YAW, never a lateral error). */
  async function steerAt(tx: number, tz: number, clampYaw = 0.55, tuck = true) {
    const s = await q();
    const dz = Math.max(1, tz - s.pos.z);
    const want = Math.max(-clampYaw, Math.min(clampYaw, Math.atan2(tx - s.pos.x, dz)));
    const err = wrap(want - s.rot.y);
    await padSet(Math.max(-1, Math.min(1, err * 2.5)), -0.75);
    await press('RT', tuck, 1);
    return s;
  }

  const summary: any = { line: LINE, splashText, hudAtStart, meta };
  if (LINE === 'race') {
    await mark('race');
    const t0 = Date.now(); let shotMid = false, shotCarve = false;
    while (Date.now() - t0 < MAXMS) {
      const s = await q();
      if (s.ended) break;
      if (!s.gate) break;
      const aim = AIMS[s.nextGate % AIMS.length];
      await p.evaluate((a) => { (window as any).__GC.aim = a; }, aim);
      await steerAt(s.gate.x + aim, s.gate.z, 0.55, s.gate.z - s.pos.z > 25);
      if (!shotCarve && s.nextGate === 3 && Math.abs(s.steer) > 0.5) { shotCarve = true; await shot('02-carve'); }
      if (!shotMid && s.nextGate === 12) { shotMid = true; await shot('03-mid'); }
      await p.waitForTimeout(30);
    }
    await padSet(0, 0); await press('RT', false);
    await p.waitForTimeout(2500);
    await shot('04-end');
    summary.endText = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 700));
  } else {
    // ── the walls line ──
    // 1. three gates on the line, so the board carries real speed
    await mark('gates');
    let t0 = Date.now();
    while (Date.now() - t0 < 20000) { const s = await q(); if (s.nextGate >= 3 || !s.gate) break; await steerAt(s.gate.x, s.gate.z, 0.55, true); await p.waitForTimeout(30); }
    // 2. straight at the right edge, fast: the slam
    await mark('edge-slam');
    t0 = Date.now();
    while (Date.now() - t0 < 8000) { const s = await q(); if (s.edge || s.bailing) break; await holdYaw(1.05, true); await p.waitForTimeout(30); }
    await p.waitForTimeout(250); await shot('05-edge-slam');
    // 3. HOLD the stick into the edge for 3 s: does the board glue?
    await mark('edge-hold');
    t0 = Date.now();
    while (Date.now() - t0 < 1500) { const s = await q(); if (!s.bailing) break; await padSet(0, 0); await p.waitForTimeout(40); }
    t0 = Date.now();
    while (Date.now() - t0 < 3000) { await holdYaw(1.35, false); await p.waitForTimeout(40); }
    await shot('06-edge-hold');
    // 4. into the next lift pylon (it stands in the groom at HALF − 3.5) and the next crowd group
    for (const want of ['pylon_', 'crowd_']) {
      const s0 = await q();
      const posts = ((s0.solids ?? []) as any[]).filter((x) => x.kind === 'post' && x.tag.startsWith(want));
      const tgt = posts.filter((pp) => pp.z > s0.pos.z + 14).sort((a, b) => a.z - b.z)[0];
      if (!tgt) continue;
      await mark(`post-${tgt.tag}`);
      t0 = Date.now();
      while (Date.now() - t0 < 12000) { const s = await q(); if (s.pos.z > tgt.z + 3 || s.ended) break; await steerAt(tgt.x, tgt.z, 1.1, true); await p.waitForTimeout(30); }
      await shot(`08-${tgt.tag}`);
    }
    // 5. back to the middle, then into the next rock on the fall line
    await mark('rock');
    await press('RT', false);
    const rocks = await p.evaluate(() => (window as any).__FEL_DEV__.scene.meshes.filter((m: any) => /^rock_/.test(m.name)).map((m: any) => ({ x: m.position.x, z: m.position.z })));
    t0 = Date.now();
    let bailSeen = false;
    while (Date.now() - t0 < 12000) {
      const s = await q();
      if (s.bailing) { bailSeen = true; break; }
      const next = rocks.filter((r: any) => r.z > s.pos.z + 4).sort((a: any, b: any) => a.z - b.z)[0];
      if (!next) break;
      await steerAt(next.x, next.z, 0.7, false);
      await p.waitForTimeout(30);
    }
    if (bailSeen) { await p.waitForTimeout(200); await shot('07-rock-bail'); }
    await p.waitForTimeout(1200);
    // 5b. straight over the next kicker, dead centre from its toe: the lip should throw the board up (SNOW-KICK)
    {
      const s0 = await q();
      const k = ((s0.solids ?? []) as any[]).filter((x) => x.kind === 'box' && x.ramp && x.tag === 'snow_kicker' && x.z0 > s0.pos.z + 18).sort((a, b) => a.z0 - b.z0)[0];
      if (k) {
        await mark(`kicker-${k.z0.toFixed(0)}`);
        const cx = (k.x0 + k.x1) / 2;
        t0 = Date.now();
        while (Date.now() - t0 < 12000) { const s = await q(); if (s.pos.z > k.z1 + 10 || s.ended) break; await steerAt(cx, s.pos.z < k.z0 ? k.z0 : k.z1 + 20, 0.9, true); await p.waitForTimeout(30); }
        await shot('08b-kicker');
      }
    }
    // 6. into the park features: the next box / wallride down the hill, dead centre
    await mark('feature');
    const feats = await p.evaluate(() => (window as any).__FEL_DEV__.scene.meshes.filter((m: any) => /^snow_(box|wallride)/.test(m.name)).map((m: any) => ({ n: m.name, x: m.position.x, z: m.position.z, y: m.position.y })));
    for (let k = 0; k < 2; k++) {
      t0 = Date.now();
      const s0 = await q();
      const f = feats.filter((ff: any) => ff.z > s0.pos.z + 12).sort((a: any, b: any) => a.z - b.z)[0];
      if (!f) break;
      await mark(`feature-${f.n}`);
      while (Date.now() - t0 < 12000) { const s = await q(); if (s.pos.z > f.z + 8 || s.ended) break; await steerAt(f.x, f.z, 0.8, true); await p.waitForTimeout(30); }
      await shot(`09-feature-${k}`);
    }
  }
  const data = await p.evaluate(() => ({ rows: (window as any).__GC.rows, marks: (window as any).__GC.marks, crossings: (window as any).__GC.crossings }));
  const result = await p.evaluate(() => { try { return (window as any).__FEL_QA__?.result?.() ?? null; } catch { return null; } });
  await browser.close();

  // ── grading ──
  const rows = data.rows as any[];
  const G: any = { frames: rows.length, missing, frameErr, errors, spawnWarn, result };
  // gate honesty
  const cr = data.crossings as any[];
  const POLE = cr.find((c) => c.half != null)?.half ?? 1.7;
  G.pole = POLE;
  G.crossings = cr.length;
  // a centre that crossed within 1 cm of a pole's line is ON the pole: the probe's interpolation and the mode's cannot
  // disagree about more than that, so it is listed, not graded
  const onPole = (c: any) => Math.abs(Math.abs(c.dx) - POLE) < 0.01;
  G.onPole = cr.filter(onPole).map((c) => `${c.i}:${c.dx}${c.verdictHit ? '✓' : '✗'}`);
  G.falseHit = cr.filter((c) => !onPole(c) && c.verdictHit && Math.abs(c.dx) > POLE).map((c) => `${c.i}:${c.dx}`);
  G.falseMiss = cr.filter((c) => !onPole(c) && !c.verdictHit && Math.abs(c.dx) <= POLE).map((c) => `${c.i}:${c.dx}`);
  G.hits = cr.filter((c) => c.verdictHit).length;
  // stuck: the stick held, the board not moving
  let stuck = 0, stuckRun = 0, stuckMax = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    const moved = Math.hypot(b.x - a.x, b.z - a.z);
    if (!b.ended && Math.abs(b.steer) + 0.75 > 0.3 && moved < 0.01 && b.dt > 5) { stuck++; stuckRun++; stuckMax = Math.max(stuckMax, stuckRun); } else stuckRun = 0;
  }
  G.stuckFrames = stuck; G.stuckMaxRun = stuckMax;
  // elevator: a one-frame lift while grounded, beyond what the pitched piste can do
  G.elevator = rows.filter((b, i) => i > 0 && b.g && rows[i - 1].g && !b.grind && b.y - rows[i - 1].y > 0.35).map((b) => `${b.t}:+${(b.y - rows[rows.indexOf(b) - 1].y).toFixed(2)}`).slice(0, 12);
  // ghosts: frames with the body inside a solid
  const inside: Record<string, number> = {};
  for (const r of rows) if (r.inside) inside[r.inside.replace(/_\d+$/, '')] = (inside[r.inside.replace(/_\d+$/, '')] ?? 0) + 1;
  G.insideSolid = inside;
  // wall / edge time: frames on the wall, contacts
  G.edgeFrames = rows.filter((r) => r.edge).length;
  let edgeContacts = 0; for (let i = 1; i < rows.length; i++) if (rows[i].edge && !rows[i - 1].edge) edgeContacts++;
  G.edgeContacts = edgeContacts;
  // bail: frames flagged bailing, and the frames the bail clip was actually the top clip at weight
  const bailRows = rows.filter((r) => r.bail);
  G.bailFrames = bailRows.length;
  G.bailClipFrames = bailRows.filter((r) => (r.clips as string[]).some((c) => /bail/i.test(c) && parseFloat(c.split('@')[1]) > 0.5)).length;
  let bails = 0; for (let i = 1; i < rows.length; i++) if (rows[i].bail && !rows[i - 1].bail) bails++;
  G.bails = bails;
  // T arms: both hands at shoulder height and out
  const isT = (r: any) => r.L && r.R && Math.abs(r.L.dy) < 0.12 && Math.abs(r.R.dy) < 0.12 && r.L.dh > 0.4 && r.R.dh > 0.4;
  G.tFrames = rows.filter(isT).length;
  G.noClipFrames = rows.filter((r) => !(r.clips as string[]).length).length;
  // speed
  const sp = rows.filter((r) => !r.ended).map((r) => r.sp).sort((a, b) => a - b);
  G.speed = sp.length ? { mean: +(sp.reduce((a, b) => a + b, 0) / sp.length).toFixed(2), p90: sp[Math.floor(sp.length * 0.9)], max: sp[sp.length - 1] } : null;
  G.rollAbsMax = +Math.max(0, ...rows.map((r) => Math.abs(r.roll))).toFixed(3);
  // the longest air (seconds off the snow) and the pops the kickers gave
  let airRun = 0, airMax = 0; for (let i = 1; i < rows.length; i++) { if (!rows[i].g && !rows[i].grind) { airRun += (rows[i].t - rows[i - 1].t); airMax = Math.max(airMax, airRun); } else airRun = 0; }
  G.airMaxSec = +airMax.toFixed(2);
  G.kickPops = logs.filter((l) => /SNOW-KICK/.test(l.s)).map((l) => l.s.replace(/.*SNOW-KICK\] /, ''));
  const ride = rows.filter((r) => r.g && !r.bail && !r.ended && Math.abs(r.steer) > 0.3).map((r) => Math.abs(r.roll) * 180 / Math.PI).sort((a, b) => a - b);
  G.carveRollDeg = ride.length ? { p50: +ride[Math.floor(ride.length / 2)].toFixed(1), p90: +ride[Math.floor(ride.length * 0.9)].toFixed(1) } : null;
  G.clips = Object.entries(rows.reduce((acc: any, r) => { for (const c of r.clips) { const n = c.split('@')[0]; acc[n] = (acc[n] ?? 0) + 1; } return acc; }, {})).sort((a: any, b: any) => b[1] - a[1]).slice(0, 14);
  const last = rows[rows.length - 1];
  G.last = last ? { gate: last.gate, hit: last.hit, score: last.score, el: last.el, ended: last.ended, z: last.z } : null;
  summary.grade = G;
  summary.crossings = cr;
  summary.marks = data.marks;
  summary.logs = logs.slice(0, 120);
  fs.writeFileSync(`${OUT}/summary-${LINE}.json`, JSON.stringify(summary, null, 1));
  fs.writeFileSync(`${OUT}/rows-${LINE}.json`, JSON.stringify(rows));
  console.log(JSON.stringify(G, null, 1));
  console.log('crossings', cr.map((c) => `${c.i}${c.verdictHit ? '✓' : '✗'}${c.dx}${c.aim != null ? '(aim ' + c.aim + ')' : ''}`).join(' '));
}
main().catch((e) => { console.error(e); process.exit(1); });
