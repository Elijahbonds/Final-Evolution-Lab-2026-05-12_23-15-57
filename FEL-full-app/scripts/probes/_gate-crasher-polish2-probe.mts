// GATE-CRASHER-POLISH-2 probe (2026-09-28) — the eye's run on 46a8dc6a, replayed view for view, plus the numbers its
// findings name. Built on _gate-crasher-probe.mts (same fake pad, same heading driver, same __FEL_DEV__.snow() readout).
//
//   LINE=eye    the eye's order: gates from the start (straight at gate 1's centre — GC-1's rock), a carve shot at gate 2,
//               the two FLAT-GROUND trick attempts (A, then B, X held 0.25 s, then Y inside the air — GC-2) at gates 3 and
//               6, the edge slam (the fall, GC-4 bail), a kicker with an Indy grab (the side view, GC-3), a mid-run shot,
//               then the gates to the finish and the end card (GC-9)
//   LINE=rock   straight into the first rocks off the line at walking pace (no tuck, GC-1's stumble) and then at speed
//
// Per frame: pose, speed, roll, grounded / grind / bail, clips at weight, and THE CONTACT: both toe bones and the board's
// underside measured against the PISTE MESH ONLY (Ray.intersectsMesh on the one 'piste' ground — never a tent, a prop, the
// contact disc or an edge band, which is what the eye's scene pick mostly hit), on frames that are grounded, not grinding,
// not bailing and not over a park feature's footprint.
//
//   PORT=3100 OUT=<dir> LINE=eye npx tsx scripts/probes/_gate-crasher-polish2-probe.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.env.PORT ?? '3100';
const OUT = process.env.OUT ?? '/tmp/gc2';
const LINE = process.env.LINE ?? 'eye';
const MAXMS = Number(process.env.MAXMS ?? 120000);
const VENUE = process.env.VENUE ?? '';
fs.mkdirSync(OUT, { recursive: true });

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
    if (/SNOW-|BOARD-LAND|FEL-SKY|REFUSED|\[IN\]|PAGEERROR|MISSING CLIP|error/i.test(s) && !/401/.test(s)) logs.push({ t: (Date.now() - t00) / 1000, s: s.slice(0, 220) });
  });
  p.on('pageerror', (e) => { errors++; logs.push({ t: (Date.now() - t00) / 1000, s: 'PAGEERROR ' + String(e).slice(0, 200) }); });
  await p.goto(`http://127.0.0.1:${PORT}/dev/mode/snowboard_slalom${VENUE ? `?venue=${VENUE}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForSelector('canvas', { timeout: 300000 });
  const padSet = (lx: number, ly: number) => p.evaluate(([x, y]) => { const g = (window as any).__PAD; g.axes[0] = x; g.axes[1] = y; g.timestamp = Date.now(); }, [lx, ly]);
  const BTN: Record<string, number> = { A: 0, B: 1, X: 2, Y: 3, R1: 5, RT: 7, START: 9 };
  const press = (n: string, down: boolean, value = 1) => p.evaluate(([i, d, v]) => { const g = (window as any).__PAD; g.buttons[i] = { pressed: !!d, touched: !!d, value: d ? v : 0 }; g.timestamp = Date.now(); }, [BTN[n], down ? 1 : 0, value]);
  const tap = async (n: string, ms = 70) => { await press(n, true); await p.waitForTimeout(ms); await press(n, false); };
  for (let i = 0; i < 80; i++) {
    const ready = await p.evaluate(() => /START/.test(document.body.innerText) && !!(window as any).__FEL_DEV__?.snow).catch(() => false);
    if (ready) break;
    await p.waitForTimeout(700);
  }
  await p.waitForTimeout(1500);
  const splashText = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600));
  await p.screenshot({ path: `${OUT}/00-splash.png` });
  for (let i = 0; i < 200; i++) {
    const ok = await p.evaluate(() => { const s = (window as any).__FEL_DEV__?.snow?.(); return !!s && s.elapsed > 0; }).catch(() => false);
    if (ok) break;
    const start = p.locator('text=/^START$/').first(); if (await start.count()) await start.click().catch(() => {});
    await p.keyboard.press('Space').catch(() => {});
    await p.waitForTimeout(500);
  }
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/01-start.png` });
  const hudStart = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 500));
  // every face button the mode is handed, with the board's state at that moment (a press the game ate is visible here)
  await p.evaluate(() => { const w = window as any; w.__FEL_DEV__.input.on((e: any) => { if (e.t === 'button' && /^[ABXY]$/.test(e.btn) && e.pressed) console.info('[IN]', e.btn, 'grounded', w.__FEL_DEV__.snow().grounded); }); });
  await p.evaluate(() => {
    const w = window as any, dev = w.__FEL_DEV__, scene = dev.scene, root = dev.hero();
    let r0 = root; while (r0.parent) r0 = r0.parent;
    const under = new Set<any>(r0.getDescendants(false));
    const sks = scene.skeletons.filter((s: any) => s.bones.some((b: any) => under.has(b.getTransformNode())));
    const node = (n: string) => { for (const sk of sks) { const b = sk.bones.find((bb: any) => bb.name.replace(/^mixamorig:?/, '').replace(/_c\d+$/, '') === n); if (b?.getTransformNode()) return b.getTransformNode(); } return null; };
    const toes = [node('LeftToeBase') ?? node('LeftFoot'), node('RightToeBase') ?? node('RightFoot')].filter(Boolean);
    const headB = node('Head'), hipsB = node('Hips');
    const piste = scene.getMeshByName('piste');
    const board = scene.meshes.find((m: any) => m.name === 'board' && m.isDescendantOf?.(root)) ?? scene.getMeshByName('board');
    const groups = scene.animationGroups.filter((g: any) => g.targetedAnimations.some((t: any) => under.has(t.target) || under.has(t.target?.getTransformNode?.())));
    // the piste is ONE flat rotated ground: its surface height under (x, z) is the plane through its origin, normal = its up
    piste.computeWorldMatrix(true);
    const wm = piste.getWorldMatrix().m;
    const n = { x: wm[4], y: wm[5], z: wm[6] }; const nl = Math.hypot(n.x, n.y, n.z); n.x /= nl; n.y /= nl; n.z /= nl;
    const o = { x: wm[12], y: wm[13], z: wm[14] };
    const pisteY = (x: number, z: number) => o.y - (n.x * (x - o.x) + n.z * (z - o.z)) / n.y;
    // …and checked against a real ray on the mesh alone (never the scene pick): Ray.intersectsMesh ignores isPickable
    const Ray = scene.constructor && (w.__FEL_DEV__.Ray ?? null);
    void Ray;
    const overSolid = (x: number, z: number, solids: any[]) => solids.some((s) => s.kind === 'box' && x > s.x0 - 0.5 && x < s.x1 + 0.5 && z > s.z0 - 0.5 && z < s.z1 + 1.5);
    w.__GC2 = { rows: [], marks: [], t0: performance.now(), lastT: performance.now(), pisteCheck: null };
    scene.onAfterRenderObservable.add(() => {
      const s = dev.snow();
      const now = performance.now();
      const r: any = { t: +((now - w.__GC2.t0) / 1000).toFixed(3), dt: +(now - w.__GC2.lastT).toFixed(1), x: +s.pos.x.toFixed(3), y: +s.pos.y.toFixed(3), z: +s.pos.z.toFixed(3), roll: +s.rot.z.toFixed(3), yaw: +s.rot.y.toFixed(3),
        sp: +s.speed.toFixed(2), g: s.grounded, grind: s.grinding, bail: s.bailing, land: s.landing, steer: +s.steer.toFixed(2), tuck: +s.tuck.toFixed(2), lean: +(s.lean ?? 0).toFixed(3),
        gate: s.nextGate, hit: s.gatesHit, score: s.score, el: +s.elapsed.toFixed(2), ended: s.ended, wipe: s.wipe, airLeft: s.airLeft ?? null };
      w.__GC2.lastT = now;
      if (s.grounded && !s.grinding && !s.bailing && !overSolid(s.pos.x, s.pos.z, s.solids ?? [])) {
        const py = pisteY(s.pos.x, s.pos.z);
        r.rootGap = +(s.pos.y - py).toFixed(4);
        r.toeGap = toes.map((t: any) => { const q = t.getAbsolutePosition(); return +(q.y - pisteY(q.x, q.z)).toFixed(4); });
        if (board) { board.computeWorldMatrix(true); const bb = board.getBoundingInfo().boundingBox; let lo = Infinity; for (const v of bb.vectorsWorld) lo = Math.min(lo, v.y - pisteY(v.x, v.z)); r.boardGap = +lo.toFixed(4); }
      }
      // the fall: how far the head and the hips are above the snow (the piste plane) while the mode says he is down
      if (s.bailing && headB && hipsB) { const hq = headB.getAbsolutePosition(), pq = hipsB.getAbsolutePosition(); r.headGap = +(hq.y - pisteY(hq.x, hq.z)).toFixed(3); r.hipsGap = +(pq.y - pisteY(pq.x, pq.z)).toFixed(3); }
      else if (headB && s.grounded && !s.bailing) { const hq = headB.getAbsolutePosition(); r.headRide = +(hq.y - pisteY(hq.x, hq.z)).toFixed(3); }
      r.clips = groups.filter((g: any) => g.isPlaying && (g.weight < 0 ? 1 : g.weight) > 0.05).map((g: any) => `${g.name}@${(g.weight < 0 ? 1 : g.weight).toFixed(2)}`);
      w.__GC2.rows.push(r);
    });
    // a spot check that the plane IS the mesh: a real ray against the piste alone at the rider's x/z
    try {
      const ray = new (w.__FEL_RAY__ ?? (scene.activeCamera.getForwardRay().constructor))(new root.position.constructor(root.position.x, root.position.y + 5, root.position.z), new root.position.constructor(0, -1, 0), 50);
      const hit = ray.intersectsMesh(piste, false);
      w.__GC2.pisteCheck = hit?.hit ? { ray: +hit.pickedPoint.y.toFixed(4), plane: +pisteY(root.position.x, root.position.z).toFixed(4) } : null;
    } catch (e) { w.__GC2.pisteCheck = String(e).slice(0, 80); }
  });
  const q = () => p.evaluate(() => ({ ...(window as any).__FEL_DEV__.snow() }));
  const mark = (label: string) => p.evaluate((l) => { (window as any).__GC2.marks.push({ t: +((performance.now() - (window as any).__GC2.t0) / 1000).toFixed(3), label: l }); }, label);
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const shot = (n: string) => p.screenshot({ path: `${OUT}/${n}.png` });
  async function holdYaw(yaw: number, tuck = true) {
    const s = await q();
    await padSet(Math.max(-1, Math.min(1, wrap(yaw - s.rot.y) * 2.5)), -0.75);
    await press('RT', tuck, 1);
    return s;
  }
  async function steerAt(tx: number, tz: number, clampYaw = 0.55, tuck = true) {
    const s = await q();
    const want = Math.max(-clampYaw, Math.min(clampYaw, Math.atan2(tx - s.pos.x, Math.max(1, tz - s.pos.z))));
    await padSet(Math.max(-1, Math.min(1, wrap(want - s.rot.y) * 2.5)), -0.75);
    await press('RT', tuck, 1);
    return s;
  }
  /** GC-2's repro, from the eye: A on flat snow, then B, X held 0.25 s, then Y with a direction LATE in the air (the eye's Y
   *  came with ~0.2 s of air left: `bail 720 0.23`, `bail RODEO 540 0.25`). `yDir` is the stick at the Y press: right = the
   *  720, down = the RODEO 540; `yAt` is the air time (s) the Y waits for. */
  async function flatTrick(tag: string, yDir: [number, number], yAt = Number(process.env.Y_AT ?? 0.95)) {
    await mark(`flat-${tag}`);
    await padSet(0, -0.3); await press('RT', false);
    for (let i = 0; i < 40; i++) { const s = await q(); if (s.grounded && !s.bailing) break; await p.waitForTimeout(30); }
    await tap('A', 60);
    await p.waitForTimeout(110); await tap('B', 60);
    await p.waitForTimeout(90); await press('X', true); await p.waitForTimeout(250); await press('X', false);
    let airAtY = -1;
    for (let i = 0; i < 80; i++) { const s = await q(); if (s.grounded) break; if (s.airT >= yAt) { airAtY = s.airT; break; } await p.waitForTimeout(15); }
    await padSet(yDir[0], yDir[1]); await tap('Y', 60);
    await mark(`flat-${tag}-Y@${airAtY.toFixed(2)}`);
    await p.waitForTimeout(90); await shot(`trick-${tag}`);
    await padSet(0, -0.3);
    for (let i = 0; i < 80; i++) { const s = await q(); if (s.grounded) break; await p.waitForTimeout(25); }
    await p.waitForTimeout(500);
  }
  /** GC-2's other half: A, then Y + stick right with ~0.8 s of air LEFT — too little for the 720 (0.97 s of motion), enough
   *  for a shorter spin: the mode throws the biggest one that fits (SSX) and it lands. */
  async function shortTrick(tag: string, left = 0.8) {
    await mark(`short-${tag}`);
    await padSet(0, -0.3); await press('RT', false);
    for (let i = 0; i < 40; i++) { const s = await q(); if (s.grounded && !s.bailing) break; await p.waitForTimeout(30); }
    await tap('A', 60);
    let at = -1;
    for (let i = 0; i < 90; i++) { const s = await q(); if (s.grounded && i > 3) break; if (!s.grounded && (s.airLeft ?? 9) <= left) { at = s.airLeft; break; } await p.waitForTimeout(12); }
    await padSet(0.9, 0); await tap('Y', 60); await padSet(0, -0.3);
    await mark(`short-${tag}-Y@left${at.toFixed(2)}`);
    await p.waitForTimeout(150); await shot(`trick-${tag}`);
    for (let i = 0; i < 80; i++) { const s = await q(); if (s.grounded) break; await p.waitForTimeout(25); }
    await p.waitForTimeout(500);
  }
  /** The next kicker a heading of ≤ 0.5 rad can still reach from here. */
  const reachableKicker = (s0: any) => ((s0.solids ?? []) as any[])
    .filter((x) => x.kind === 'box' && x.ramp && /kicker/.test(x.tag) && x.z0 > s0.pos.z + 12 && (x.z0 - s0.pos.z) > 2.2 * Math.abs((x.x0 + x.x1) / 2 - s0.pos.x))
    .sort((a, b) => a.z0 - b.z0)[0];

  const summary: any = { line: LINE, splashText, hudStart };
  if (LINE === 'eye') {
    const t0 = Date.now();
    const did: Record<string, boolean> = {};
    while (Date.now() - t0 < MAXMS) {
      const s = await q();
      if (s.ended || !s.gate) break;
      if (!did.carve && s.nextGate === 2 && Math.abs(s.steer) > 0.35 && s.speed > 6) { did.carve = true; await shot('02-carve'); }
      if (!did.g3 && s.nextGate === 3 && s.gate.z - s.pos.z > 12) { did.g3 = true; await flatTrick('g3', [0.9, 0]); continue; }
      if (!did.g6 && s.nextGate === 6 && s.gate.z - s.pos.z > 12) { did.g6 = true; await flatTrick('g6', [0, 0.9]); continue; }
      if (!did.g9 && did.g3 && s.nextGate === 5 && s.gate.z - s.pos.z > 12 && process.env.SHORT !== '0') { did.g9 = true; await shortTrick('g5'); continue; }
      if (!did.crash && did.g6 && s.nextGate >= 7 && s.gate.z - s.pos.z > 6) {
        did.crash = true; await mark('crash');
        const tc = Date.now();
        while (Date.now() - tc < 8000) { const r = await q(); if (r.bailing) break; await holdYaw(1.05, true); await p.waitForTimeout(25); }
        await p.waitForTimeout(90); await shot('03-crash');
        await p.waitForTimeout(260); await shot('03b-crash-down');
        await padSet(0, 0); await press('RT', false);
        for (let i = 0; i < 80; i++) { const r = await q(); if (!r.bailing && r.wipe < 0) break; await p.waitForTimeout(30); }
        await p.waitForTimeout(300); await shot('04-recovered');
        // the next kicker, dead centre, with an Indy grab over its lip (the side view the eye shot as 05-kicker-air)
        const s0 = await q();
        const k = reachableKicker(s0);
        if (k) {
          await mark(`kicker-${k.z0.toFixed(0)}`);
          const cx = (k.x0 + k.x1) / 2; const tk = Date.now(); let grabbed = false, shotAir = false;
          while (Date.now() - tk < 14000) {
            const r = await q();
            if (r.pos.z > k.z1 + 14 || r.ended) break;
            if (!r.grounded && r.pos.z > k.z1 - 1 && !grabbed) { grabbed = true; await padSet(0, -0.9); await press('B', true); await p.waitForTimeout(60); await press('B', false); await press('X', true); }
            if (grabbed && !shotAir && !r.grounded && (r.airT ?? 0) > 0.35) { shotAir = true; await shot('05-kicker-air'); }
            if (grabbed && r.grounded) { await press('X', false); break; }
            if (!grabbed) await steerAt(cx, r.pos.z < k.z0 ? k.z0 : k.z1 + 20, 0.9, true);
            await p.waitForTimeout(25);
          }
          await press('X', false);
          await p.waitForTimeout(400); await shot('05b-kicker-after');
        }
        continue;
      }
      if (!did.mid && s.nextGate >= 10 && Math.abs(s.steer) > 0.3) { did.mid = true; await shot('06-mid'); }
      await steerAt(s.gate.x, s.gate.z, 0.55, s.gate.z - s.pos.z > 22);
      await p.waitForTimeout(28);
    }
    await padSet(0, 0);
    for (let i = 0; i < 200; i++) { const s = await q(); if (s.ended) break; await press('RT', true, 1); await p.waitForTimeout(50); }
    await press('RT', false);
    await p.waitForTimeout(700); await shot('07-finish');
    await p.waitForTimeout(3500); await shot('08-endcard');
    summary.endText = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 700));
  } else if (LINE === 'rock') {
    // walking pace into the first rock on the course (no tuck, the stick only steering), then at speed into a later one
    const rocks = await p.evaluate(() => (window as any).__FEL_DEV__.scene.meshes.filter((m: any) => /^rock_\d+$/.test(m.name)).map((m: any) => ({ n: m.name, x: m.position.x, z: m.position.z })).sort((a: any, b: any) => a.z - b.z));
    summary.rocks = rocks;
    for (const [i, fast] of [[0, false], [3, true]] as const) {
      const r = rocks[i]; if (!r) continue;
      await mark(`rock-${r.n}-${fast ? 'fast' : 'slow'}`);
      const tr = Date.now();
      while (Date.now() - tr < 20000) {
        const s = await q();
        if (s.pos.z > r.z + 4 || s.ended) break;
        if (!fast && s.speed > 3.2) { await padSet(0, 0); await press('RT', false); await p.evaluate(() => (window as any).__FEL_DEV__.snowBrake?.()); }
        await steerAt(r.x, r.z, 1.0, fast);
        await p.waitForTimeout(25);
      }
      await p.waitForTimeout(600); await shot(`rock-${fast ? 'fast' : 'slow'}`);
      await p.waitForTimeout(1200);
    }
  }
  const data = await p.evaluate(() => ({ rows: (window as any).__GC2.rows, marks: (window as any).__GC2.marks, pisteCheck: (window as any).__GC2.pisteCheck }));
  const result = await p.evaluate(() => { try { return (window as any).__FEL_QA__?.result?.() ?? null; } catch { return null; } });
  await browser.close();

  const rows = data.rows as any[];
  const G: any = { frames: rows.length, missing, frameErr, errors, result, pisteCheck: data.pisteCheck };
  const pct = (a: number[], k: number) => a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * k))].toFixed(4) : null;
  const toe = rows.filter((r) => r.toeGap).flatMap((r) => r.toeGap as number[]).sort((a, b) => a - b);
  // the LOWER toe of each frame is the one on the board's edge — the contact the eye reads
  const toeLow = rows.filter((r) => r.toeGap).map((r) => Math.min(...(r.toeGap as number[]))).sort((a, b) => a - b);
  const board = rows.filter((r) => r.boardGap != null).map((r) => r.boardGap as number).sort((a, b) => a - b);
  const root = rows.filter((r) => r.rootGap != null).map((r) => r.rootGap as number).sort((a, b) => a - b);
  G.contactPisteOnly = {
    n: toeLow.length,
    toeLow_m: { p10: pct(toeLow, 0.1), p50: pct(toeLow, 0.5), p90: pct(toeLow, 0.9), max: toeLow.length ? +toeLow[toeLow.length - 1].toFixed(4) : null },
    toeAll_m: { p10: pct(toe, 0.1), p50: pct(toe, 0.5), p90: pct(toe, 0.9), max: toe.length ? +toe[toe.length - 1].toFixed(4) : null },
    boardUnderside_m: { p10: pct(board, 0.1), p50: pct(board, 0.5), p90: pct(board, 0.9), max: board.length ? +board[board.length - 1].toFixed(4) : null },
    root_m: { p10: pct(root, 0.1), p50: pct(root, 0.5), p90: pct(root, 0.9) },
  };
  // carve roll AT SPEED: grounded, not bailing, stick past 0.3, 10–14 m/s (the eye's band)
  const band = (lo: number, hi: number) => rows.filter((r) => r.g && !r.bail && !r.ended && r.wipe < 0 && Math.abs(r.steer) > 0.3 && r.sp >= lo && r.sp <= hi).map((r) => Math.abs(r.roll) * 180 / Math.PI).sort((a, b) => a - b);
  const b1 = band(10, 14), b0 = band(0, 99);
  G.carveRollDeg_10to14 = b1.length ? { n: b1.length, p50: +b1[Math.floor(b1.length / 2)].toFixed(1), p90: +b1[Math.floor(b1.length * 0.9)].toFixed(1) } : null;
  G.carveRollDeg_all = b0.length ? { n: b0.length, p50: +b0[Math.floor(b0.length / 2)].toFixed(1), p90: +b0[Math.floor(b0.length * 0.9)].toFixed(1) } : null;
  const sp = rows.filter((r) => !r.ended).map((r) => r.sp).sort((a, b) => a - b);
  G.speed = sp.length ? { mean: +(sp.reduce((a, b) => a + b, 0) / sp.length).toFixed(2), p90: sp[Math.floor(sp.length * 0.9)], max: sp[sp.length - 1] } : null;
  let bails = 0; for (let i = 1; i < rows.length; i++) if (rows[i].bail && !rows[i - 1].bail) bails++;
  G.bails = bails;
  G.lands = logs.filter((l) => /BOARD-LAND/.test(l.s)).map((l) => l.s.replace(/.*BOARD-LAND\] /, ''));
  G.rocks = logs.filter((l) => /SNOW-ROCK/.test(l.s)).map((l) => `${l.t.toFixed(1)}s ${l.s.replace(/.*SNOW-ROCK\] /, '')}`);
  G.refusals = logs.filter((l) => /REFUSED|NO AIR|SHORT/i.test(l.s)).map((l) => l.s.slice(0, 120)).slice(0, 20);
  G.clips = Object.entries(rows.reduce((acc: any, r) => { for (const c of r.clips) { const nm = c.split('@')[0]; acc[nm] = (acc[nm] ?? 0) + 1; } return acc; }, {})).sort((a: any, b: any) => b[1] - a[1]).slice(0, 16);
  G.noClipFrames = rows.filter((r) => !(r.clips as string[]).length).length;
  const bailRows = rows.filter((r) => r.bail);
  const hg = rows.filter((r) => r.headGap != null).map((r) => r.headGap as number).sort((a, b) => a - b);
  const pg = rows.filter((r) => r.hipsGap != null).map((r) => r.hipsGap as number).sort((a, b) => a - b);
  const hr = rows.filter((r) => r.headRide != null).map((r) => r.headRide as number).sort((a, b) => a - b);
  G.bailDown = { frames: hg.length, headMin: hg[0] ?? null, headP50: pct(hg, 0.5), hipsMin: pg[0] ?? null, headUnder06: hg.filter((v) => v < 0.6).length, headRidingP50: pct(hr, 0.5) };
  G.trickNotes = logs.filter((l) => /SNOW-TRICK/.test(l.s)).map((l) => l.s.replace(/.*SNOW-TRICK\] /, ''));
  G.stall = logs.filter((l) => /SNOW-STALL|SNOW-END/.test(l.s)).map((l) => l.s.replace(/.*\] /, '')).slice(0, 6);
  G.bailClip = Object.entries(bailRows.reduce((acc: any, r) => { for (const c of r.clips) { const nm = c.split('@')[0]; acc[nm] = (acc[nm] ?? 0) + 1; } return acc; }, {})).sort((a: any, b: any) => b[1] - a[1]).slice(0, 6);
  let airRun = 0, airMax = 0; for (let i = 1; i < rows.length; i++) { if (!rows[i].g && !rows[i].grind) { airRun += rows[i].t - rows[i - 1].t; airMax = Math.max(airMax, airRun); } else airRun = 0; }
  G.airMaxSec = +airMax.toFixed(2);
  const dts = rows.map((r) => r.dt).filter((d) => d > 0).sort((a, b) => a - b);
  G.frameMs = dts.length ? { p50: dts[Math.floor(dts.length / 2)], p99: dts[Math.floor(dts.length * 0.99)], over50: dts.filter((d) => d > 50).length } : null;
  const last = rows[rows.length - 1];
  G.last = last ? { gate: last.gate, hit: last.hit, score: last.score, el: last.el, ended: last.ended, z: last.z } : null;
  summary.grade = G;
  summary.marks = data.marks;
  summary.logs = logs.slice(0, 160);
  fs.writeFileSync(`${OUT}/summary-${LINE}.json`, JSON.stringify(summary, null, 1));
  fs.writeFileSync(`${OUT}/rows-${LINE}.json`, JSON.stringify(rows));
  console.log(JSON.stringify(G, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
