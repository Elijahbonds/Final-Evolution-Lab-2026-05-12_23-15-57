// VENICE-SKATE-THPS probe — grades the Venice skate line per RENDERED FRAME.
//
// Drives /play/skateboard with a fake pad (the pre-boot injection: a pad that is already there when the page loads is
// the only thing InputBus adopts reliably) and records, every frame the scene renders:
//   - the ride state off __FEL_DEV__.skate() (speed, push stroke, air, rail distance, grind/manual needles, slow-mo)
//   - the elbow angles, measured off the LIVE rig (shoulder->elbow->wrist): 180 deg = a locked, straight arm (the T)
//   - the hero/board separation (H2: the rider must never leave his deck)
//   - the root's pitch and roll (H2: a rider is never inverted)
//   - which clips are actually playing, with weights
//
// Usage: npx tsx scripts/probes/_venice-skate-thps.mts <port> <outdir> [label]

import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.argv[2] ?? '3009';
const OUT = process.argv[3] ?? '/tmp/venice-skate';
const LABEL = process.argv[4] ?? 'run';
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 'playtest@fel.local';
const PASS = 'playtest-local-only';
fs.mkdirSync(OUT, { recursive: true });

// DualShock/standard mapping: 0=A(cross) 1=B(circle) 2=X(square) 3=Y(triangle) 6=L2 7=R2
const A = 0, B = 1, X = 2, Y = 3, R2 = 7;

async function setBtn(p: Page, i: number, on: boolean, value?: number) {
  await p.evaluate(([i, on, value]) => {
    const pad = (window as any).__PAD; if (!pad) return;
    pad.buttons[i].pressed = on; pad.buttons[i].value = value ?? (on ? 1 : 0); pad.timestamp = Date.now();
  }, [i, on, value] as [number, boolean, number | undefined]);
}
async function setStick(p: Page, lx: number, ly: number, rx = 0, ry = 0) {
  await p.evaluate(([lx, ly, rx, ry]) => {
    const pad = (window as any).__PAD; if (!pad) return;
    pad.axes[0] = lx; pad.axes[1] = ly; pad.axes[2] = rx; pad.axes[3] = ry; pad.timestamp = Date.now();
  }, [lx, ly, rx, ry] as [number, number, number, number]);
}
async function tap(p: Page, i: number, ms = 120) { await setBtn(p, i, true); await p.waitForTimeout(ms); await setBtn(p, i, false); }
async function shot(p: Page, name: string) { await p.screenshot({ path: `${OUT}/${name}.png` }); }
async function mark(p: Page, tag: string) { await p.evaluate((t) => { (window as any).__SK_MARK = t; }, tag); }

async function main() {
  const logs: string[] = [];
  const browser = await chromium.launch({
    headless: true, executablePath: chromiumExe(),
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.on('console', (m) => {
    const t = m.text();
    if (/SKATE|GRIND|MANUAL|BAIL|LAND|TRICK|JUICE|SLOW|OLLIE|REVERT|GOAL|GAP|ERROR|MISSING|Error/i.test(t)) logs.push(t.slice(0, 600));
  });
  p.on('pageerror', (e) => logs.push('PAGEERROR ' + String(e).slice(0, 300)));

  // the pad has to exist BEFORE the app boots (DUNK-LIVE-INPUT: a pad that connects later is the case InputBus
  // already handles; a pad that is already in is the one that used to be missed, and it is what a player has)
  // esbuild's keepNames wraps every named function the probe injects in a `__name(fn, 'x')` helper that only exists in
  // the bundle, not in the page — so any in-page helper throws ReferenceError. Define the identity it expects first.
  await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  await p.addInitScript(() => {
    const pad: any = {
      index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard',
      axes: [0, 0, 0, 0], timestamp: Date.now(),
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    (window as any).__PAD = pad;
    (navigator as any).getGamepads = () => [pad];
  });

  await p.goto(`${BASE}/dev/mode/skateboard`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForSelector('canvas', { timeout: 240000 });
  // wait for the harness to reach 'playing' (the runner shows the phase in its dev chip)
  for (let i = 0; i < 120; i++) {
    const txt = await p.evaluate(() => document.body.innerText);
    if (/playing/i.test(txt)) break;
    if (/ready/i.test(txt)) { await p.keyboard.press('Space'); }
    await p.waitForTimeout(1000);
  }
  await p.waitForTimeout(1500);
  await shot(p, `${LABEL}-00-start`);

  // ── the per-frame recorder ──
  await p.evaluate(() => {
    const w = window as any;
    const dev = w.__FEL_DEV__;
    if (!dev?.scene) { w.__SK = { err: 'no __FEL_DEV__.scene' }; return; }
    const scene = dev.scene;
    const rows: any[] = [];
    w.__SK = { rows };
    // The park holds 31 copies of this rig (the Onlookers crowd) and every bone node carries an importer suffix
    // (`LeftArm_c47`), so the hero's own bones are the ones UNDER dev.hero()'s root — never a name lookup across the scene.
    const heroRoot = dev.hero ? dev.hero() : null;
    const under: any[] = heroRoot ? heroRoot.getDescendants(false) : [];
    const nodeBy = (base: string) => under.find((n: any) => n.name === base || new RegExp('(^|[:_])' + base + '(_c\\d+)?$').test(n.name));
    const bones = {
      LS: nodeBy('LeftArm'), LE: nodeBy('LeftForeArm'), LH: nodeBy('LeftHand'),
      RS: nodeBy('RightArm'), RE: nodeBy('RightForeArm'), RH: nodeBy('RightHand'),
      hips: nodeBy('Hips'), head: nodeBy('Head'), chest: nodeBy('Spine2'),
      LF: nodeBy('LeftFoot'), RF: nodeBy('RightFoot'),
    };
    w.__SK.bones = Object.fromEntries(Object.entries(bones).map(([k, v]: any) => [k, v?.name ?? null]));
    const board = scene.meshes.find((m: any) => m.name === 'board');
    const ang = (a: any, b: any, c: any) => {
      if (!a || !b || !c) return null;
      const p1 = a.getAbsolutePosition(), p2 = b.getAbsolutePosition(), p3 = c.getAbsolutePosition();
      const u = p1.subtract(p2), v = p3.subtract(p2);
      const d = u.length() * v.length();
      if (d < 1e-6) return null;
      return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / d))) * 180 / Math.PI;
    };
    scene.onAfterRenderObservable.add(() => {
      const s = dev.skate ? dev.skate() : null;
      const hero = dev.hero ? dev.hero() : null;
      // Babylon reports weight -1 for a group played without weight blending — that is FULL weight, not none.
      const wt = (g: any) => (g.weight === undefined || g.weight < 0 ? 1 : g.weight);
      const playing = scene.animationGroups.filter((g: any) => g.isPlaying && wt(g) > 0.02)
        .map((g: any) => g.name + '@' + wt(g).toFixed(2));
      rows.push({
        t: +(performance.now() / 1000).toFixed(3),
        mark: w.__SK_MARK ?? '',
        s,
        elbowL: ang(bones.LS, bones.LE, bones.LH),
        elbowR: ang(bones.RS, bones.RE, bones.RH),
        hipsY: bones.hips ? +bones.hips.getAbsolutePosition().y.toFixed(3) : null,
        headY: bones.head ? +bones.head.getAbsolutePosition().y.toFixed(3) : null,
        footY: bones.LF ? +bones.LF.getAbsolutePosition().y.toFixed(3) : null,
        chestY: bones.chest ? +bones.chest.getAbsolutePosition().y.toFixed(3) : null,
        // the hero's own bones can drift from his root if a solver writes world-space targets: the reach of the rig
        spanHips: bones.hips && heroRoot ? +bones.hips.getAbsolutePosition().subtract(heroRoot.getAbsolutePosition()).length().toFixed(3) : null,
        pp: dev.boardPosture ? dev.boardPosture.me()?.window ?? null : null,
        rootY: hero ? +hero.position.y.toFixed(3) : null,
        boardGap: board && hero ? +board.getAbsolutePosition().subtract(hero.getAbsolutePosition()).length().toFixed(3) : null,
        clips: playing,
      });
      if (rows.length > 40000) rows.shift();
    });
  });

  const info = await p.evaluate(() => ({ err: (window as any).__SK?.err ?? null, bones: (window as any).__SK?.bones ?? null }));
  console.log('RECORDER', JSON.stringify(info));

  // ── the line ──
  // 1. PUSH: hold forward for 6 s from a standstill.
  await mark(p, 'push');
  await setStick(p, 0, -1);
  await p.waitForTimeout(6000);
  await shot(p, `${LABEL}-01-push`);

  // 2. CARVE left then right, still rolling forward.
  await mark(p, 'carve');
  await setStick(p, -0.9, -1); await p.waitForTimeout(1500);
  await setStick(p, 0.9, -1); await p.waitForTimeout(1500);
  await setStick(p, 0, -1); await p.waitForTimeout(600);
  await shot(p, `${LABEL}-02-carve`);

  // 3. OLLIE: charge the pump (R2), release, pop.
  await mark(p, 'ollie');
  await setBtn(p, R2, true, 1); await p.waitForTimeout(700);
  await setBtn(p, R2, false, 0);
  await tap(p, A, 90);
  await p.waitForTimeout(260);
  await shot(p, `${LABEL}-03-ollie-air`);
  await p.waitForTimeout(900);

  // 4. KICKFLIP in the air.
  await mark(p, 'kickflip');
  await tap(p, A, 90); await p.waitForTimeout(140);
  await tap(p, B, 90);
  await p.waitForTimeout(250);
  await shot(p, `${LABEL}-04-kickflip`);
  await p.waitForTimeout(1200);

  // 4b. CROUCH SCALES POP. Two ollies off the same roll: a stab at the button and a held crouch. A keyboard's space
  // emits a 0.01 sentinel, so before this tip every ollie on a keyboard popped at the floor of the curve.
  await mark(p, 'pop-short');
  await setStick(p, 0, -1); await p.waitForTimeout(900);
  await setBtn(p, R2, true, 0.01); await p.waitForTimeout(110); await setBtn(p, R2, false, 0);
  await tap(p, A, 80); await p.waitForTimeout(1100);
  await mark(p, 'pop-long');
  await p.waitForTimeout(600);
  await setBtn(p, R2, true, 0.01); await p.waitForTimeout(620); await setBtn(p, R2, false, 0);
  await tap(p, A, 80); await p.waitForTimeout(1300);

  // 5. MANUAL: the THPS link — stick back then forward on the ground, RIDE it (a manual is a balance act: the needle
  // has to be worked, exactly as a player works it), then flick OUT of it. That exit is the REVERT.
  await mark(p, 'manual');
  // settle to neutral first: a stick already held one way makes its own pair with the first tap, and then the run
  // reads as "entered a NOSE manual and reverted out of it" in one motion
  await setStick(p, 0, 0); await p.waitForTimeout(500);
  await setStick(p, 0, 1); await p.waitForTimeout(140);
  await setStick(p, 0, -1); await p.waitForTimeout(140);
  await setStick(p, 0, 0);
  for (let i = 0; i < 26; i++) {
    const n = await p.evaluate(() => (window as any).__FEL_DEV__?.skate?.()?.manualNeedle ?? null);
    if (n == null) break;                                  // slipped or never started
    await setStick(p, Math.max(-1, Math.min(1, -n * 1.4)), 0);
    await p.waitForTimeout(60);
  }
  await shot(p, `${LABEL}-05-manual`);
  await mark(p, 'revert');
  await setStick(p, 0, 1); await p.waitForTimeout(140);
  await setStick(p, 0, -1); await p.waitForTimeout(140);
  await setStick(p, 0, 0); await p.waitForTimeout(700);
  await shot(p, `${LABEL}-05b-revert`);

  // 6. GRIND: drive at the patrol rail (it patrols x -2..2 at z -8..8, y 0.5) and pop onto it.
  await mark(p, 'grind-approach');
  await p.evaluate(() => { (window as any).__SK_TGT = null; });
  // steer toward the rail using the live positions, then ollie at it
  for (let i = 0; i < 60; i++) {
    const st = await p.evaluate(() => {
      const dev = (window as any).__FEL_DEV__;
      const s = dev?.skate?.(); if (!s) return null;
      return { x: s.pos.x, z: s.pos.z, yaw: s.rot.y, railD: s.railD, grinding: s.grinding, grounded: s.grounded };
    });
    if (!st) break;
    if (st.grinding) break;
    // aim at the origin-ish plaza where the patrol rail lives
    const want = Math.atan2(0 - st.x, 0 - st.z);
    let d = want - st.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    await setStick(p, Math.max(-1, Math.min(1, d * 1.6)), -1);
    if (st.railD < 3.2 && st.grounded) { await mark(p, 'grind-pop'); await tap(p, A, 80); }
    if (st.railD < 2.4 && !st.grounded) { await tap(p, A, 80); }
    await p.waitForTimeout(120);
  }
  await mark(p, 'grind-hold');
  await setStick(p, 0, 0);
  await p.waitForTimeout(2500);
  await shot(p, `${LABEL}-06-grind`);

  // 7. THE PATROL RAIL (H3's own goal). The golden rail lies along X and patrols along Z, so the line a player rides at
  // it — straight at the plaza's middle — CROSSES it, which is exactly the approach the magnet refuses on purpose. The
  // goal is reachable from the side: drive out along -X, turn back down the rail's own axis and pop at it.
  await mark(p, 'patrol-setup');
  for (let i = 0; i < 90; i++) {
    const st = await p.evaluate(() => {
      const s = (window as any).__FEL_DEV__?.skate?.(); if (!s) return null;
      return { x: s.pos.x, z: s.pos.z, yaw: s.rot.y, railD: s.railD, grinding: s.grinding, grounded: s.grounded,
        onPatrol: s.onPatrol, cx: (s.patrol.a.x + s.patrol.b.x) / 2, cz: (s.patrol.a.z + s.patrol.b.z) / 2 };
    });
    if (!st) break;
    if (st.onPatrol) break;
    // stage 1: get out to the rail's own line, 9 m off its left end; stage 2: run straight down it (+x)
    const staged = Math.abs(st.z - st.cz) < 2.6 && st.x < st.cx - 2.5;
    const tx = staged ? st.cx + 8 : st.cx - 9, tz = st.cz;
    const want = Math.atan2(tx - st.x, tz - st.z);
    let d = want - st.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    await setStick(p, Math.max(-1, Math.min(1, d * 1.6)), -1);
    if (staged) { await mark(p, 'patrol-run'); if (st.railD < 4.0 && st.grounded) await tap(p, A, 80); }
    await p.waitForTimeout(120);
  }
  await mark(p, 'patrol-hold');
  await setStick(p, 0, 0);
  await p.waitForTimeout(2200);
  await shot(p, `${LABEL}-06b-patrol`);

  await mark(p, 'after');
  await setStick(p, 0, -1);
  await p.waitForTimeout(4000);
  await shot(p, `${LABEL}-07-late`);
  await setStick(p, 0, 0);

  const rows = await p.evaluate(() => (window as any).__SK?.rows ?? []);
  fs.writeFileSync(`${OUT}/${LABEL}-rows.json`, JSON.stringify(rows));
  fs.writeFileSync(`${OUT}/${LABEL}-console.txt`, logs.join('\n'));
  console.log(`FRAMES ${rows.length}  CONSOLE ${logs.length}  -> ${OUT}/${LABEL}-rows.json`);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
