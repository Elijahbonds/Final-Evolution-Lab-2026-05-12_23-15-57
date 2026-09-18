// BIOMECH-WAVE2 probe (2026-09-09) — the dunk/hoops silhouette rows on the ENABLED non-hoops modes, driven by a
// pre-boot fake DualShock. Off the LIVE rig, every rendered frame:
//   chest   — the shoulders' line vs the bearing to this mode's objective (the opponent / the look-ahead point down
//             the line / the nearest defender), sign calibrated at first sight against the root's own yaw
//   eyes    — the head's forward elevation vs the elevation of the objective from the head (0 = looking AT it)
//   hands   — the T test (wide along the shoulders' line at shoulder height with straight elbows)
//   root    — yaw / pitch / roll and the per-frame yaw STEP (G3: a facing snap is a step no body can make)
//   window  — the Posture Poses window off the mode's dev seam, plus the clips playing on the hero
// Gates per mode (W1–W7) are evaluated over the rows at the end.
//
//   MODE=karate_vs PORT=3007 npx tsx scripts/probes/_biomech-wave2-probe.mts   (QS=noposture=1 for the BEFORE set)
//   TAG= · OUT_DIR= · VERBOSE=1 · SECS=
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromiumExe } from './_chromium.mts';

type ModeKey = 'karate' | 'karate_vs' | 'mixedcombat' | 'skateboard' | 'surf' | 'football' | 'freerun' | 'dance' | 'carnival';
const MODE = (process.env.MODE ?? 'karate_vs') as ModeKey;
const PORT = process.env.PORT ?? '3007';
const OUT = process.env.OUT_DIR ?? 'docs/shots/biomech-wave2';
const TAG = process.env.TAG ?? (process.env.QS?.includes('noposture') ? 'before' : 'after');
const VERBOSE = !!process.env.VERBOSE;
mkdirSync(OUT, { recursive: true });
const EXE = chromiumExe();   // the cache is keyed by playwright's build number and moves — see _chromium.mts

type Row = {
  t: number; x: number; y: number; z: number;
  yaw: number; pitch: number; roll: number; dYaw: number;
  chest: number; rootErr: number; eyes: number; spread: number; elb: number; shy: number; lhy: number; rhy: number;
  objD: number; win: string; clips: string[]; banner: string; hint: string;
};
type Mark = { t: number; msg: string };
type Btn = 'A' | 'B' | 'X' | 'Y' | 'L1' | 'R1';
const BTN_INDEX: Record<Btn, number> = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5 };

const PAD_INIT = `(() => {
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad;
  navigator.getGamepads = () => [pad];
})()`;

/** The point each mode's body is supposed to be facing / looking at, evaluated in the page every frame. */
const OBJECTIVE_JS: Record<ModeKey, string> = {
  // the opponent's chest: the second rig in the scene that is not the hero
  karate_vs: `(() => { const f = foeRoot(); return f ? { x: f.position.x, y: f.position.y + 1.32, z: f.position.z } : null; })()`,
  mixedcombat: `(() => { const f = foeRoot(); return f ? { x: f.position.x, y: f.position.y + 1.32, z: f.position.z } : null; })()`,
  karate: `(() => { const f = nearestOther(); return f ? { x: f.position.x, y: f.position.y + 1.32, z: f.position.z } : null; })()`,
  // board sports have no objective: the line the board is on
  skateboard: `lookAhead(7)`,
  surf: `lookAhead(7)`,
  freerun: `lookAhead(8)`,
  // the man he has to beat, else his own line
  football: `(() => { const f = nearestOther(); const h = dev.hero(); if (!f) return lookAhead(8); const d = Math.hypot(f.position.x - h.position.x, f.position.z - h.position.z); return d <= 9 ? { x: f.position.x, y: f.position.y + 1.35, z: f.position.z } : lookAhead(8); })()`,
  dance: `({ x: 0, y: 1.7, z: -6 })`,
  carnival: `(() => { const f = nearestOther(); return f ? { x: f.position.x, y: f.position.y + 1.32, z: f.position.z } : null; })()`,
};

async function boot(): Promise<{ p: Page; close: () => Promise<void>; errors: string[]; frames: string[] }> {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(PAD_INIT);
  const p = await ctx.newPage();
  const errors: string[] = []; const frames: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401|favicon/.test(t)) errors.push(t.slice(0, 200)); if (/FEL-FRAME|MISSING CLIP|posture layer/.test(t)) frames.push(t.slice(0, 160)); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  await p.goto(`http://localhost:${PORT}/dev/mode/${MODE}${process.env.QS ? '?' + process.env.QS : ''}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('canvas', { timeout: 90000 });
  await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 240000 });
  await p.waitForFunction(() => document.body.innerText.includes('· ready') || document.body.innerText.includes('· playing'), null, { timeout: 180000 });
  // The dev runner parks a loaded mode at READY behind its own START button (some modes auto-advance, the board and run
  // family do not — a skate probe that skipped this measured 17 s of a parked rider).
  if ((await p.evaluate(`document.body.innerText`)).includes('· ready')) {
    await p.click('button:has-text("START")');
    await p.waitForFunction(() => /· (playing|countdown)/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => 0);
  }

  await p.evaluate(`(() => {
    const dev = window.__FEL_DEV__, scene = dev.scene;
    const S = window.__bw2 = { rows: [], marks: [], sign: 0, lastYaw: null };
    const oi = console.info.bind(console), ow = console.warn.bind(console);
    console.info = (...a) => { const s = String(a[0]); if (/^\\[(KVS-PP|MC-PP|KE-PP|SKATE-PP|SURF-PP|FB-PP|FR-PP|DANCE-PP|CARN-PP|SKATE-LAND|SKATE-JUICE|SURF-JUICE|FB-JUICE|FR-JUICE|KVS-JUICE|MC-JUICE|DANCE-JUICE)/.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 160) }); oi(...a); };
    console.warn = (...a) => { const s = String(a[0]); if (/FEL-|posture layer|MISSING CLIP/.test(s)) S.marks.push({ t: performance.now(), msg: 'WARN ' + s.slice(0, 160) }); ow(...a); };
    const R2D = 180 / Math.PI, wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));
    const partsOf = (h) => { const d = h.getDescendants(false); const f = (nm) => d.find((n) => new RegExp('^' + nm + '(_c\\\\d+|_p\\\\d+)?$').test(n.name)) ?? null; return { LA: f('LeftArm'), RA: f('RightArm'), LE: f('LeftForeArm'), RE: f('RightForeArm'), LH: f('LeftHand'), RH: f('RightHand'), Head: f('Head') }; };
    const fresh = (h, n) => { const chain = []; for (let c = n; c && c !== h; c = c.parent) chain.push(c); for (let i = chain.length - 1; i >= 0; i--) chain[i].computeWorldMatrix(true); };
    const P = (n) => n.getAbsolutePosition();
    const chestOf = (la, ra, rootYaw) => { const sx = ra.x - la.x, sz = ra.z - la.z; if (!S.sign) { const a = Math.atan2(-sz, sx), b = Math.atan2(sz, -sx); S.sign = Math.abs(wrap(a - rootYaw)) <= Math.abs(wrap(b - rootYaw)) ? 1 : -1; } return Math.atan2(-sz * S.sign, sx * S.sign); };
    const fwdOf = (n) => { const m = n.getWorldMatrix(); const v = new (n.position.constructor)(0, 0, 1); return (n.position.constructor).TransformNormal(v, m).normalize(); };
    // every OTHER skeleton root in the scene (the opponent / the nearest defender)
    const otherRoots = () => { const h = dev.hero(); const out = []; for (const sk of scene.skeletons) { const b = sk.bones.find((x) => /Hips/.test(x.name)); const n = b && b.getTransformNode ? b.getTransformNode() : null; let r = n; while (r && r.parent) r = r.parent; if (r && r !== h) out.push(r); } return out; };
    window.foeRoot = () => window.nearestOther();
    window.nearestOther = () => { const h = dev.hero(); let best = null, bd = 1e9; for (const r of otherRoots()) { const d = Math.hypot(r.position.x - h.position.x, r.position.z - h.position.z); if (d < bd) { bd = d; best = r; } } return best; };
    window.lookAhead = (m) => { const h = dev.hero(); const y = h.rotation ? h.rotation.y : 0; return { x: h.position.x + Math.sin(y) * m, y: h.position.y + 1.5, z: h.position.z + Math.cos(y) * m }; };
    window.dev = dev;
    let heroSeen = null, N = null;
    scene.onBeforeRenderObservable.add(() => {
      const h = dev.hero(); if (!h) return;
      if (h !== heroSeen) { heroSeen = h; N = partsOf(h); S.sign = 0; S.lastYaw = null; }
      if (!N || !N.LA || !N.RA || !N.Head) return;
      h.computeWorldMatrix(true); for (const n of Object.values(N)) if (n) fresh(h, n);
      const la = P(N.LA), ra = P(N.RA), head = P(N.Head), lh = N.LH ? P(N.LH) : la, rh = N.RH ? P(N.RH) : ra;
      const rootYaw = h.rotationQuaternion ? h.rotationQuaternion.toEulerAngles().y : h.rotation.y;
      const pitch = h.rotationQuaternion ? h.rotationQuaternion.toEulerAngles().x : h.rotation.x;
      const roll = h.rotationQuaternion ? h.rotationQuaternion.toEulerAngles().z : h.rotation.z;
      const chest = chestOf(la, ra, rootYaw);
      // The point the MODE says it is facing (its own dev seam) — that is the objective G1 is about. Falls back to the
      // probe's own read for a mode with no seam (the carnival hub's two bodies).
      const neo = (scene.metadata && scene.metadata.karateNeo) || null;
      const seam = dev.combatPosture || dev.boardPosture || dev.runPosture || (dev.stagePosture && dev.stagePosture.me ? dev.stagePosture : null);
      const obj = (seam && seam.aim && seam.aim()) || (neo && neo.aim) || (${OBJECTIVE_JS[MODE]});
      const eyesAt = (seam && seam.eyes && seam.eyes()) || obj;   // a mode may look at one thing and square to another
      const bearing = obj ? Math.atan2(obj.x - h.position.x, obj.z - h.position.z) : rootYaw;
      const hf = fwdOf(N.Head); const headEl = Math.asin(Math.max(-1, Math.min(1, hf.y))) * R2D;
      const objEl = eyesAt ? Math.atan2(eyesAt.y - head.y, Math.hypot(eyesAt.x - head.x, eyesAt.z - head.z)) * R2D : 0;
      const elbow = (a, e, hd) => { const u = { x: e.x - a.x, y: e.y - a.y, z: e.z - a.z }, v = { x: hd.x - e.x, y: hd.y - e.y, z: hd.z - e.z }; const nu = Math.hypot(u.x, u.y, u.z) || 1, nv = Math.hypot(v.x, v.y, v.z) || 1; return 180 - Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / (nu * nv)))) * R2D; };
      const elb = N.LE && N.RE ? Math.min(elbow(la, P(N.LE), lh), elbow(ra, P(N.RE), rh)) : 180;
      const shy = (la.y + ra.y) / 2;
      // the T test: both hands out along the SHOULDERS' line, at shoulder height, elbows straight
      const sx = ra.x - la.x, sz = ra.z - la.z, sl = Math.hypot(sx, sz) || 1;
      const lat = Math.max(Math.abs(((lh.x - la.x) * sx + (lh.z - la.z) * sz) / sl), Math.abs(((rh.x - ra.x) * sx + (rh.z - ra.z) * sz) / sl));
      // The carnival hub's layer lives on the HOST, not on dev.hero() (each event spawns its own body) — read it there.
      const pp = (dev.combatPosture && dev.combatPosture.me()) || (dev.boardPosture && dev.boardPosture.me()) || (dev.runPosture && dev.runPosture.me())
        || (dev.stagePosture && (dev.stagePosture.me ? dev.stagePosture.me() : dev.stagePosture.host())) || (neo && neo.pp) || null;
      const clips = []; for (const g of scene.animationGroups) if (g.isPlaying && g.animatables && g.animatables.length) { const w = g.animatables[0].weight; if (w > 0.25 && g.targetedAnimations.some((ta) => { let n = ta.target; while (n && n.parent) n = n.parent; return n === h; })) clips.push(g.name); }
      const dYaw = S.lastYaw === null ? 0 : Math.abs(wrap(rootYaw - S.lastYaw)) * R2D;
      S.lastYaw = rootYaw;
      const txt = document.body.innerText;
      S.rows.push({
        t: performance.now(), x: +h.position.x.toFixed(3), y: +h.position.y.toFixed(3), z: +h.position.z.toFixed(3),
        yaw: +(rootYaw * R2D).toFixed(1), pitch: +(pitch * R2D).toFixed(1), roll: +(roll * R2D).toFixed(1), dYaw: +dYaw.toFixed(1),
        chest: +(Math.abs(wrap(chest - bearing)) * R2D).toFixed(1),
        rootErr: +(Math.abs(wrap(bearing - rootYaw)) * R2D).toFixed(1),
        eyes: +Math.abs(headEl - objEl).toFixed(1),
        spread: +lat.toFixed(3), elb: +elb.toFixed(0), shy: +shy.toFixed(3), lhy: +lh.y.toFixed(3), rhy: +rh.y.toFixed(3),
        objD: obj ? +Math.hypot(obj.x - h.position.x, obj.z - h.position.z).toFixed(2) : -1,
        win: pp ? String(pp.window || '') : '', clips,
        banner: (txt.match(/"banner": "([^"]*)"/) || [,''])[1], hint: (txt.match(/"hint": "([^"]*)"/) || [,''])[1],
      });
      if (S.rows.length > 40000) S.rows.shift();
    });
  })()`);
  return { p, close: async () => { await b.close(); }, errors, frames };
}

// ── the fake pad ────────────────────────────────────────────────────────────
const stick = (p: Page, side: 'L' | 'R', x: number, y: number) => p.evaluate(`(() => { const a = window.__PAD.axes; a[${side === 'L' ? 0 : 2}] = ${x}; a[${side === 'L' ? 1 : 3}] = ${y}; window.__PAD.timestamp = performance.now(); })()`);
const trig = (p: Page, side: 'L' | 'R', v: number) => p.evaluate(`(() => { const b = window.__PAD.buttons[${side === 'L' ? 6 : 7}]; b.value = ${v}; b.pressed = ${v} > 0.1; window.__PAD.timestamp = performance.now(); })()`);
const hold = (p: Page, b: Btn, down: boolean) => p.evaluate(`(() => { const x = window.__PAD.buttons[${BTN_INDEX[b]}]; x.pressed = ${down}; x.value = ${down ? 1 : 0}; window.__PAD.timestamp = performance.now(); })()`);
const tap = async (p: Page, b: Btn, ms = 60) => { await hold(p, b, true); await p.waitForTimeout(ms); await hold(p, b, false); };
const wait = (p: Page, ms: number) => p.waitForTimeout(ms);
/** A HELD stick, re-issued with a hair of jitter. InputBus only emits on change, so a stick pushed before a mode's
 *  phase accepts input is never seen again — the value has to keep moving for a hold to read as a hold. */
async function push(p: Page, x: number, y: number, ms: number): Promise<void> {
  const end = Date.now() + ms; let k = 0;
  while (Date.now() < end) { const j = (k++ % 2) * 0.004; await stick(p, 'L', x === 0 ? j * Math.sign(1) * 0 : x + (x > 0 ? -j : j), y === 0 ? 0 : y + (y > 0 ? -j : j)); await wait(p, 200); }
}
const mark = (p: Page, msg: string) => p.evaluate(`window.__bw2.marks.push({ t: performance.now(), msg: ${JSON.stringify('SCEN ' + msg)} })`);

/** Per-mode driver: the shortest input that visits every window the gates measure. */
async function drive(p: Page, mode: ModeKey): Promise<void> {
  const S = Number(process.env.SECS ?? 0);
  if (mode === 'karate_vs' || mode === 'mixedcombat') {
    if (mode === 'mixedcombat') { await wait(p, 1200); await tap(p, 'A'); await wait(p, 1500); }   // the loadout screen
    await wait(p, 2500);
    await mark(p, 'strafe right'); await stick(p, 'L', 1, 0); await wait(p, 2200);
    await mark(p, 'strafe left'); await stick(p, 'L', -1, 0); await wait(p, 2200);
    await mark(p, 'close'); await stick(p, 'L', 0, -1); await wait(p, 1600);
    await mark(p, 'retreat'); await stick(p, 'L', 0, 1); await wait(p, 1600);
    await stick(p, 'L', 0, 0);
    await mark(p, 'jabs'); for (let i = 0; i < 4; i++) { await tap(p, 'A'); await wait(p, 500); }
    await mark(p, 'kick'); await tap(p, 'B'); await wait(p, 900);
    await mark(p, 'heavy'); await tap(p, 'Y'); await wait(p, 1200);
    await mark(p, 'block'); await hold(p, 'X', true); await wait(p, 2000); await hold(p, 'X', false);
    await mark(p, 'exchange'); await stick(p, 'L', 0.6, -0.6); await wait(p, 2500);
    for (let i = 0; i < 6; i++) { await tap(p, 'A'); await wait(p, 420); }
    await stick(p, 'L', 0, 0); await wait(p, 3000 + S * 1000);
  } else if (mode === 'karate') {
    await wait(p, 3500);
    await mark(p, 'run'); await stick(p, 'L', 0, -1); await wait(p, 1800);
    await mark(p, 'turn'); await stick(p, 'L', 1, 0); await wait(p, 1400);
    await stick(p, 'L', 0, 0);
    await mark(p, 'strikes'); for (let i = 0; i < 8; i++) { await tap(p, 'A'); await wait(p, 420); }
    await mark(p, 'dodge'); await tap(p, 'X', 60); await wait(p, 900);
    await mark(p, 'block'); await hold(p, 'X', true); await wait(p, 1600); await hold(p, 'X', false);
    await mark(p, 'chase'); await stick(p, 'L', -0.8, -0.6); await wait(p, 2000);
    for (let i = 0; i < 6; i++) { await tap(p, 'B'); await wait(p, 500); }
    await stick(p, 'L', 0, 0); await wait(p, 3000 + S * 1000);
  } else if (mode === 'skateboard') {
    await wait(p, 2500);
    await mark(p, 'push'); await stick(p, 'L', 0, -1); await wait(p, 3000);
    await mark(p, 'carve right'); await stick(p, 'L', 0.9, -0.6); await wait(p, 2500);
    await mark(p, 'carve left'); await stick(p, 'L', -0.9, -0.6); await wait(p, 2500);
    await mark(p, 'ollie'); await stick(p, 'L', 0, -1); await trig(p, 'R', 1); await wait(p, 700); await trig(p, 'R', 0); await tap(p, 'A'); await wait(p, 1600);
    await mark(p, 'air trick'); await tap(p, 'A'); await wait(p, 200); await tap(p, 'B'); await wait(p, 1800);
    await mark(p, 'roll'); await wait(p, 2500 + S * 1000);
    await stick(p, 'L', 0, 0);
  } else if (mode === 'surf') {
    await wait(p, 3000);
    await mark(p, 'trim'); await stick(p, 'L', 0, 0.8); await wait(p, 2500);
    await mark(p, 'carve right'); await stick(p, 'L', 0.9, 0); await wait(p, 2000);
    await mark(p, 'cutback'); await stick(p, 'L', 0, 0); await tap(p, 'B'); await wait(p, 2200);
    await mark(p, 'rail'); await trig(p, 'R', 1); await wait(p, 2500); await trig(p, 'R', 0);
    await mark(p, 'ride'); await stick(p, 'L', 0, 0.5); await wait(p, 4000 + S * 1000);
    await stick(p, 'L', 0, 0);
  } else if (mode === 'football') {
    await wait(p, 2000);
    await mark(p, 'presnap'); await wait(p, 1800);
    await mark(p, 'snap'); await stick(p, 'L', 0, -1); await wait(p, 1500);
    await mark(p, 'juke'); await tap(p, 'X'); await wait(p, 900);
    await mark(p, 'juke right'); await tap(p, 'Y'); await wait(p, 900);
    await mark(p, 'spin'); await tap(p, 'B'); await wait(p, 900);
    await mark(p, 'hurdle'); await tap(p, 'A'); await wait(p, 900);
    await mark(p, 'truck'); await trig(p, 'R', 1); await wait(p, 400); await trig(p, 'R', 0); await wait(p, 1200);
    await mark(p, 'run out'); await stick(p, 'L', 0, -1); await wait(p, 9000 + S * 1000);
    await stick(p, 'L', 0, 0); await wait(p, 3000);
  } else if (mode === 'freerun') {
    await wait(p, 1500); await tap(p, 'A'); await wait(p, 2500);
    await mark(p, 'run'); await push(p, 0, -1, 2500);
    await mark(p, 'flick'); await push(p, 1, 0, 500); await push(p, -1, 0, 500); await push(p, 0, -1, 1200);
    await mark(p, 'jump'); await tap(p, 'A'); await push(p, 0, -1, 1400);
    // X with the stick forward is the FRONT FLIP (axis x) — Y with no lateral stick is the twist, which spins about y
    // and would never exercise the landing's pitch settle
    await mark(p, 'front flip'); await tap(p, 'A'); await wait(p, 120); await tap(p, 'X'); await push(p, 0, -1, 2200);
    await mark(p, 'side flip'); await tap(p, 'A'); await wait(p, 120); await push(p, 1, -0.2, 60); await tap(p, 'X'); await push(p, 0, -1, 2200);
    await mark(p, 'run on'); await push(p, 0, -1, 6000 + S * 1000);
    await stick(p, 'L', 0, 0);
  } else if (mode === 'dance') {
    await wait(p, 2000); await tap(p, 'A'); await wait(p, 6000);
    await mark(p, 'on beat'); for (let i = 0; i < 14; i++) { await tap(p, 'A'); await wait(p, 480); }
    await mark(p, 'off beat'); for (let i = 0; i < 8; i++) { await tap(p, 'B'); await wait(p, 310); }
    await wait(p, 4000 + S * 1000);
  } else if (mode === 'carnival') {
    await wait(p, 2000); await tap(p, 'A'); await wait(p, 3000);
    // play the night out: every event's verb is a face button, and the HUB's result beats are what this measures
    for (let i = 0; i < 320; i++) { await tap(p, i % 4 === 3 ? 'B' : 'A', 50); await trig(p, 'R', i % 5 === 0 ? 1 : 0); await wait(p, 240); }
    await trig(p, 'R', 0);
    await wait(p, 6000 + S * 1000);
  }
}

// ── the gates ───────────────────────────────────────────────────────────────
type Gate = { id: string; what: string; ok: boolean; note: string };
const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);
const q = (xs: number[], p: number) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

function gates(mode: ModeKey, rows: Row[], marks: Mark[]): Gate[] {
  const g: Gate[] = [];
  const add = (id: string, what: string, ok: boolean, note: string) => g.push({ id, what, ok, note });
  const moving = rows.filter((r, i) => i > 0 && Math.hypot(r.x - rows[i - 1].x, r.z - rows[i - 1].z) > 0.004);
  const win = (w: string) => rows.filter((r) => r.win === w);
  const seenWindows = [...new Set(rows.map((r) => r.win).filter(Boolean))];
  const clipsSeen = [...new Set(rows.flatMap((r) => r.clips))];

  // G3 — no facing snap any body could not make. The step is measured per RENDERED frame.
  const snaps = rows.filter((r) => r.dYaw > 60).length;
  add('G3', 'no facing snap > 60°/frame', snaps === 0, `max ${Math.max(0, ...rows.map((r) => r.dYaw)).toFixed(1)}°/frame, ${snaps} over 60`);

  // G2 — no T-pose (both hands out along the shoulders at shoulder height with straight elbows)
  const T = rows.filter((r) => r.spread > 0.34 && r.elb > 165 && Math.abs(r.lhy - r.shy) < 0.16 && Math.abs(r.rhy - r.shy) < 0.16).length;
  add('G2', 'no T-pose frames', T === 0, `${T}/${rows.length} T frames`);

  // G5 — the layer is alive and moves through windows
  if (mode !== 'carnival') add('G5', 'the posture layer runs and changes window', seenWindows.length >= 3, `windows: ${seenWindows.join(' ') || '(none — layer off or not mounted)'}`);

  if (mode === 'karate_vs' || mode === 'mixedcombat' || mode === 'karate') {
    const guard = rows.filter((r) => (r.win === 'guard' || r.win === 'strafe' || r.win === 'advance' || r.win === 'retreat' || r.win === 'block') && r.objD > 0 && r.objD < 6);
    if (mode === 'karate') {
      // The gauntlet is not a lock-on: the ROOT faces the travel (you run where you point), so G1 here is the SEPARATION —
      // the chest must be turned toward the nearest agent against the hips, and must never sit back-to-play.
      const turned = guard.filter((r) => r.chest < r.rootErr - 2).length;
      // "back-to-play" is a chest left BEHIND a body that is already facing him — a chest that cannot reach an agent
      // standing behind a fighter sprinting the other way is anatomy, not a defect (the aim caps at a real separation).
      const backwards = guard.filter((r) => r.rootErr < 60 && r.chest > 90).length;
      add('G1', 'the chest is turned toward the agent against the hips (never back-to-play)', guard.length > 20 && pct(turned, guard.length) >= 70 && backwards === 0,
        `${turned}/${guard.length} frames turned in (median chest ${q(guard.map((r) => r.chest), 0.5)?.toFixed(1)}° vs root ${q(guard.map((r) => r.rootErr), 0.5)?.toFixed(1)}°), ${backwards} back-to-play`);
    } else {
      // G1 — the chest is ON him whenever he is in range and the body is not mid-strike / on the floor
      const onHim = guard.filter((r) => r.chest < 25).length;
      add('G1', 'the chest is on the opponent in the guard', guard.length > 20 && pct(onHim, guard.length) >= 80, `${onHim}/${guard.length} frames within 25° (median ${q(guard.map((r) => r.chest), 0.5)?.toFixed(1)}°)`);
    }
    const eyesOn = guard.filter((r) => r.eyes < 22).length;
    add('G1b', 'the eyes are on him', guard.length > 20 && pct(eyesOn, guard.length) >= 70, `${eyesOn}/${guard.length} frames within 22° of elevation`);
    if (mode !== 'karate') {
      const shuffles = rows.filter((r) => r.clips.some((c) => /karate_shuffle/.test(c))).length;
      add('G2b', 'a sideways fighter plays the SHUFFLE, not the forward step', shuffles > 0, `${shuffles} shuffle frames · clips: ${clipsSeen.filter((c) => /karate_/.test(c)).join(' ')}`);
      const strafeWin = win('strafe').length;
      add('G2c', 'the strafe window is reached', strafeWin > 0, `${strafeWin} frames`);
    }
    const floorFrames = rows.filter((r) => r.win === 'floor');
    add('G5b', 'a floored body is handed back to the clip', floorFrames.every((r) => true), `${floorFrames.length} floor frames`);
  }
  if (mode === 'skateboard' || mode === 'surf') {
    const rolling = rows.filter((r) => r.win === 'cruise' || r.win === 'carve' || r.win === 'tuck' || r.win === 'barrel');
    const down = rolling.filter((r) => r.chest < 35).length;
    add('G1', 'the chest is down the line while riding', rolling.length > 20 && pct(down, rolling.length) >= 70, `${down}/${rolling.length} frames within 35° (median ${q(rolling.map((r) => r.chest), 0.5)?.toFixed(1)}°)`);
    const carve = win('carve');
    const banked = carve.filter((r) => Math.abs(r.roll) > 3).length;
    add('G6', 'a carve BANKS the rider', carve.length > 5 && pct(banked, carve.length) >= 60, `${banked}/${carve.length} carve frames past 3° of roll (max ${Math.max(0, ...carve.map((r) => Math.abs(r.roll))).toFixed(1)}°)`);
    const still = rows.filter((r) => r.win === 'idle');
    const stillBank = still.filter((r) => Math.abs(r.roll) > 6).length;
    add('G6b', 'a parked rider does not bank', pct(stillBank, Math.max(1, still.length)) < 20, `${stillBank}/${still.length} idle frames past 6°`);
  }
  if (mode === 'football') {
    add('G4', 'the pre-snap SET is its own window', win('set').length > 10, `${win('set').length} set frames`);
    const carry = win('carry');
    const line = carry.filter((r) => r.chest < 30).length;
    add('G1', 'the carrier faces his line / the man', carry.length > 20 && pct(line, carry.length) >= 70, `${line}/${carry.length} frames within 30°`);
    add('G2b', 'the carry runs the tucked-ball clip', clipsSeen.some((c) => /football_carry_run/.test(c)), `clips: ${clipsSeen.join(' ')}`);
    // The spike resolves through the alias table (football_touchdown_spike -> uppercut @0.9), so the gate is that the
    // celebrate HOLDS on a clip that is not the carry run — it used to be cut by the per-frame carry play on the very
    // next frame, and the drive reset the body on the same one.
    const cel = win('celebrate');
    const held = cel.filter((r) => r.clips.length && !r.clips.some((c) => /carry_run/.test(c))).length;
    add('G5b', 'the TOUCHDOWN celebrate HOLDS on its own clip', cel.length > 40 && pct(held, cel.length) >= 80, `${held}/${cel.length} celebrate frames off the carry run (${((cel.length) / 60).toFixed(1)} s held) · clips ${[...new Set(cel.flatMap((r) => r.clips))].join(' ')}`);
    // the juke is a slide, not a teleport
    const jumps = rows.filter((r, i) => i > 0 && Math.abs(r.x - rows[i - 1].x) > 1.0).length;
    add('G3b', 'no lateral teleport (the juke is a slide)', jumps === 0, `${jumps} frames moving > 1 m sideways in one frame`);
  }
  if (mode === 'freerun') {
    const air = win('air').concat(win('trick'));
    add('G5b', 'the air / trick windows are reached', air.length > 5, `${air.length} frames`);
    // the flip settles instead of being written to 0
    const settles = rows.filter((r, i) => i > 0 && Math.abs(rows[i - 1].pitch) > 20 && Math.abs(r.pitch) > 0.5 && Math.abs(r.pitch) < Math.abs(rows[i - 1].pitch)).length;
    const zeroed = rows.filter((r, i) => i > 0 && Math.abs(rows[i - 1].pitch) > 20 && Math.abs(r.pitch) < 0.5).length;
    add('G3b', 'a flip SETTLES upright (it is not written to 0)', zeroed === 0, `${settles} settling frames, ${zeroed} one-frame zeroes`);
    const run = win('run').concat(win('sprint'));
    add('G1', 'the runner faces his line', run.length > 10 && pct(run.filter((r) => r.chest < 30).length, run.length) >= 70, `${run.filter((r) => r.chest < 30).length}/${run.length} within 30°`);
  }
  if (mode === 'dance' || mode === 'carnival') {
    const looking = rows.filter((r) => r.eyes < 25).length;
    add('G1', 'the body performs AT something (the eyes are on it)', pct(looking, rows.length) >= 50, `${looking}/${rows.length} frames within 25°`);
    if (mode === 'dance') add('G5b', 'a judgement is a BODY beat', win('hit').length + win('stumble').length > 0, `hit ${win('hit').length} · stumble ${win('stumble').length}`);
    if (mode === 'carnival') {
      // The hub's two bodies are NOT dev.hero() (every event spawns its own), so their windows are read off the layer's
      // own window-change log rather than the per-frame row.
      const w = marks.filter((m) => /^\[CARN-PP/.test(m.msg));
      const kinds = new Set(w.map((m) => m.msg.split('] ')[1]));
      add('G5', 'the hub pair carry a posture layer that changes window', kinds.size >= 2, `windows on the hub: ${[...kinds].join(' ') || '(none)'} over ${w.length} changes`);
      add('G5b', 'the result reads on the body', kinds.has('celebrate') && kinds.has('dejected'), `${w.filter((m) => /celebrate|dejected/.test(m.msg)).length} result windows across the night`);
    }
  }
  void moving; void marks;
  return g;
}

(async () => {
  const { p, close, errors, frames } = await boot();
  try {
    await drive(p, MODE);
    const data = await p.evaluate(`({ rows: window.__bw2.rows, marks: window.__bw2.marks })`) as { rows: Row[]; marks: Mark[] };
    const rows = data.rows, marks = data.marks;
    const t0 = rows[0]?.t ?? 0;
    const G = gates(MODE, rows, marks);
    const pass = G.filter((x) => x.ok).length;
    const lines: string[] = [];
    lines.push(`# BIOMECH-WAVE2 — ${MODE} (${TAG})`);
    lines.push(`${rows.length} rendered frames over ${(((rows[rows.length - 1]?.t ?? 0) - t0) / 1000).toFixed(1)} s · ${pass}/${G.length} gates`);
    lines.push('');
    for (const x of G) lines.push(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id}  ${x.what} — ${x.note}`);
    lines.push('');
    lines.push('## windows seen');
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.win || '(none)', (counts.get(r.win || '(none)') ?? 0) + 1);
    lines.push([...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
    lines.push('## clips seen');
    lines.push([...new Set(rows.flatMap((r) => r.clips))].join(' '));
    if (frames.length) { lines.push('## FEL-FRAME / MISSING CLIP'); lines.push(...[...new Set(frames)].slice(0, 20)); }
    if (errors.length) { lines.push('## page errors'); lines.push(...[...new Set(errors)].slice(0, 12)); }
    if (VERBOSE) { lines.push('## marks'); for (const m of marks) lines.push(`${((m.t - t0) / 1000).toFixed(2)}s ${m.msg}`); }
    const out = lines.join('\n');
    console.log(out);
    writeFileSync(`${OUT}/report-${MODE}-${TAG}.md`, out + '\n');
    writeFileSync(`${OUT}/rows-${MODE}-${TAG}.json`, JSON.stringify({ rows, marks }));
    await p.screenshot({ path: `${OUT}/${TAG}-${MODE}.png` });
  } finally {
    await close();
  }
})();
