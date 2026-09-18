// BIOMECH-HOOPS-WAVE1 probe (2026-09-08): the dunk posture probe's silhouette rows on the hoops family — /dev/mode/onevone,
// threevthree, threepoint, dunkduel — driven by a pre-boot fake DualShock. Off the live rig every rendered frame:
//   chest    — the shoulders' line vs the bearing to the objective (rim / the ball handler), sign calibrated at spawn against
//              the root's own yaw (the hero does not face the rim at every spawn — 3PT's rack faces +z)
//   eyes     — the head's forward elevation vs the elevation of the rim from the head (0 = looking at the iron)
//   hands    — the T test (wide along the shoulders' line at shoulder height, straight elbows), the ball-to-hand distance (G6)
//   foe      — the nearest defender's chest vs the bearing to the hero, and his facing·travel (G1: a slide keeps the chest on
//              the handler, so facing·travel is LOW while he moves sideways)
//   windows  — the Posture Poses layer's window (`__FEL_DEV__.hoopsPosture.me().window`), the clips on the hero, the HUD.
// Gates per mode (H1–H4): G1 facing on the shot / the flight / the slide · G2 loco arms (no T, the carry) · G3 momentum
// (no yaw snaps > 60°/frame) · G4 a readable refusal · G5 the follow-through / the land / the celebrate windows held · G6 the
// ball in the hand through the load and released from the hand.
//   MODE=onevone PORT=3004 npx tsx scripts/probes/_hoops-biomech-probe.mts     (QS=noposture=1 for the BEFORE set · TAG= · OUT_DIR= · VERBOSE=1)
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const MODE = (process.env.MODE ?? 'onevone') as 'onevone' | 'threevthree' | 'threepoint' | 'dunkduel';
const PORT = process.env.PORT ?? '3004', OUT = process.env.OUT_DIR ?? 'docs/shots/hoops-biomech', TAG = process.env.TAG ?? (process.env.QS?.includes('noposture') ? 'before' : 'after');
const VERBOSE = !!process.env.VERBOSE;
mkdirSync(OUT, { recursive: true });
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

type Row = { t: number; x: number; y: number; z: number; yaw: number; chest: number; chestRim: number; meToFoe: number; eyes: number; spread: number; lat: number; elb: number; lhy: number; rhy: number; shy: number; headY: number; ballHand: number; ballY: number; handGap: number; clips: string[]; win: string; foeWin: string; foeChest: number; foeFT: number; foeDist: number; banner: string; hint: string; meter: string; poss: string; att: string };
type Mark = { t: number; msg: string };
type Btn = 'A' | 'B' | 'X' | 'Y'; type Dir = 'up' | 'down' | 'left' | 'right';

const PAD_INIT = `(() => {
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad;
  navigator.getGamepads = () => [pad];
})()`;
const BALL_NAME: Record<typeof MODE, string> = { onevone: 'ball', threevthree: 'ball', threepoint: 'tp_ball', dunkduel: 'duel_ball' };
const RIM_OF: Record<typeof MODE, [number, number, number]> = { onevone: [0, 3.05, -0.6], threevthree: [0, 3.05, -0.6], threepoint: [0, 3.05, -0.6], dunkduel: [0, 3.05, -10.28] };

async function boot(): Promise<{ p: Page; close: () => Promise<void>; errors: string[]; frames: string[] }> {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(PAD_INIT);
  const p = await ctx.newPage();
  const errors: string[] = []; const frames: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401|favicon/.test(t)) errors.push(t.slice(0, 200)); if (/FEL-FRAME|MISSING CLIP/.test(t)) frames.push(t.slice(0, 160)); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  await p.goto(`http://localhost:${PORT}/dev/mode/${MODE}${process.env.QS ? '?' + process.env.QS : ''}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('canvas', { timeout: 90000 });
  await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
  await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 120000 });
  const rim = RIM_OF[MODE];
  await p.evaluate(`(() => {
    const dev = window.__FEL_DEV__, scene = dev.scene;
    const S = window.__smp = { rows: [], marks: [], sign: 0, foeSign: 0, foePrev: null };
    const oi = console.info.bind(console), ow = console.warn.bind(console);
    console.info = (...a) => { const s = String(a[0]); if (/^\\[(1V1-PP|3V3-PP|3PT-PP|DUEL-PP|1V1-JUICE|3V3-JUICE|3PT-JUICE|HANDS|JUICE-SOFT|FEL-DUNK|DUNK-LAUNCH)/.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 180) }); oi(...a); };
    console.warn = (...a) => { const s = String(a[0]); if (/FEL-|posture layer/.test(s)) S.marks.push({ t: performance.now(), msg: 'WARN ' + s.slice(0, 180) }); ow(...a); };
    const RIM = { x: ${rim[0]}, y: ${rim[1]}, z: ${rim[2]} };
    const R2D = 180 / Math.PI, wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));
    const rootOf = (n) => { if (n && typeof n.getTransformNode === 'function') n = n.getTransformNode() ?? n; while (n && n.parent) n = n.parent; return n; };
    const partsOf = (h) => { const d = h.getDescendants(false); const f = (nm) => d.find((n) => new RegExp('^' + nm + '(_c\\\\d+|_p\\\\d+)?$').test(n.name)) ?? null; return { LA: f('LeftArm'), RA: f('RightArm'), LE: f('LeftForeArm'), RE: f('RightForeArm'), LH: f('LeftHand'), RH: f('RightHand'), Head: f('Head') }; };
    const fresh = (h, n) => { const chain = []; for (let c = n; c && c !== h; c = c.parent) chain.push(c); for (let i = chain.length - 1; i >= 0; i--) chain[i].computeWorldMatrix(true); };
    const P = (n) => n.getAbsolutePosition();
    const BV = scene.getMeshByName('${BALL_NAME[MODE]}') ? null : null;
    /** the chest bearing off the shoulders' line, sign calibrated so it matches the ROOT's yaw at first sight */
    const chestOf = (la, ra, rootYaw, who) => { const sx = ra.x - la.x, sz = ra.z - la.z; if (!S[who]) { const a = Math.atan2(-sz, sx), b = Math.atan2(sz, -sx); S[who] = Math.abs(wrap(a - rootYaw)) <= Math.abs(wrap(b - rootYaw)) ? 1 : -1; } return Math.atan2(-sz * S[who], sx * S[who]); };
    const fwdOf = (n) => { const m = n.getWorldMatrix(); const v = new (n.position.constructor)(0, 0, 1); return (n.position.constructor).TransformNormal(v, m).normalize(); };
    let heroSeen = null, N = null, foeSeen = null, FN = null;
    scene.onBeforeRenderObservable.add(() => {
      const h = dev.hero(); if (!h) return;
      if (h !== heroSeen) { heroSeen = h; N = partsOf(h); }
      if (!N || !N.LA || !N.RA || !N.Head) return;
      h.computeWorldMatrix(true); for (const n of Object.values(N)) if (n) fresh(h, n);
      const la = P(N.LA), ra = P(N.RA), head = P(N.Head), lh = N.LH ? P(N.LH) : la, rh = N.RH ? P(N.RH) : ra;
      const rootYaw = h.rotationQuaternion ? h.rotationQuaternion.toEulerAngles().y : h.rotation.y;
      const chest = chestOf(la, ra, rootYaw, 'sign');
      const rimB = Math.atan2(RIM.x - h.position.x, RIM.z - h.position.z);
      const hf = fwdOf(N.Head); const headEl = Math.asin(Math.max(-1, Math.min(1, hf.y))) * R2D;
      const rimEl = Math.atan2(RIM.y - head.y, Math.hypot(RIM.x - head.x, RIM.z - head.z)) * R2D;
      const elbow = (a, e, hd) => { const u = { x: e.x - a.x, y: e.y - a.y, z: e.z - a.z }, v = { x: hd.x - e.x, y: hd.y - e.y, z: hd.z - e.z }; const nu = Math.hypot(u.x, u.y, u.z) || 1, nv = Math.hypot(v.x, v.y, v.z) || 1; return 180 - Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / (nu * nv)))) * R2D; };
      const elb = N.LE && N.RE ? Math.min(elbow(la, P(N.LE), lh), elbow(ra, P(N.RE), rh)) : 180;
      // the GAME ball: ballRig tags it (metadata.felReleased) — a venue placeholder may share the name (3v3's did, 6 m away)
      const ball = scene.meshes.find((m) => m.name === '${BALL_NAME[MODE]}' && m.metadata && 'felReleased' in m.metadata) ?? scene.getMeshByName('${BALL_NAME[MODE]}'); let ballHand = -1, ballY = -1;
      if (ball) { ball.computeWorldMatrix(true); const bp = ball.getAbsolutePosition(); ballY = bp.y; ballHand = Math.min(Math.hypot(bp.x - lh.x, bp.y - lh.y, bp.z - lh.z), Math.hypot(bp.x - rh.x, bp.y - rh.y, bp.z - rh.z)); }
      const clips = scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && rootOf(g.targetedAnimations[0].target) === h).map((g) => g.name);
      let hud = {}; try { const pre = document.querySelector('pre'); hud = pre ? JSON.parse(pre.textContent || '{}') : {}; } catch {}
      const hp = dev.hoopsPosture; const me = hp && hp.me ? hp.me() : null; const foeL = hp && hp.foe ? hp.foe() : null;
      // the nearest defender (1v1: the foe; 3v3: the nearest foe) — his chest vs the bearing to the hero, his facing vs his travel
      let foeChest = 0, foeFT = 0, foeDist = -1, meToFoe = 0;
      const foeRoot = (scene.metadata && scene.metadata.onevone && scene.metadata.onevone.foeRoot) || (hp && hp.nearestFoeRoot ? hp.nearestFoeRoot() : null) || (hp && hp.foeRoot) || null;
      if (foeRoot) {
        if (foeRoot !== foeSeen) { foeSeen = foeRoot; FN = partsOf(foeRoot); S.foeSign = 0; S.foePrev = null; }
        if (FN && FN.LA && FN.RA) {
          foeRoot.computeWorldMatrix(true); fresh(foeRoot, FN.LA); fresh(foeRoot, FN.RA);
          const fla = P(FN.LA), fra = P(FN.RA); const fyaw = foeRoot.rotationQuaternion ? foeRoot.rotationQuaternion.toEulerAngles().y : foeRoot.rotation.y;
          const fc = chestOf(fla, fra, fyaw, 'foeSign');
          const toHero = Math.atan2(h.position.x - foeRoot.position.x, h.position.z - foeRoot.position.z);
          foeChest = wrap(fc - toHero) * R2D; foeDist = Math.hypot(h.position.x - foeRoot.position.x, h.position.z - foeRoot.position.z);
          meToFoe = wrap(rootYaw - Math.atan2(foeRoot.position.x - h.position.x, foeRoot.position.z - h.position.z)) * R2D;
          const fp = foeRoot.position; if (S.foePrev) { const vx = fp.x - S.foePrev.x, vz = fp.z - S.foePrev.z; const sp = Math.hypot(vx, vz); foeFT = sp > 0.004 ? (Math.sin(fyaw) * vx + Math.cos(fyaw) * vz) / sp : 0; } S.foePrev = { x: fp.x, z: fp.z };
        }
      }
      const md = scene.metadata && scene.metadata.onevone;
      S.rows.push({ t: performance.now(), x: h.position.x, y: h.position.y, z: h.position.z, yaw: rootYaw, chest: wrap(chest - rootYaw) * R2D, chestRim: wrap(chest - rimB) * R2D, meToFoe, eyes: headEl - rimEl,
        spread: Math.hypot(lh.x - rh.x, lh.y - rh.y, lh.z - rh.z), lat: (() => { const ax = ra.x - la.x, az = ra.z - la.z, n = Math.hypot(ax, az) || 1; return Math.abs(((lh.x - rh.x) * ax + (lh.z - rh.z) * az) / n); })(), elb,
        lhy: lh.y - h.position.y, rhy: rh.y - h.position.y, shy: (la.y + ra.y) / 2 - h.position.y, headY: head.y, ballHand, ballY, handGap: Math.hypot(lh.x - rh.x, lh.y - rh.y, lh.z - rh.z),
        clips, win: me ? String(me.window) : '?', foeWin: foeL ? String(foeL.window) : '', foeChest, foeFT, foeDist,
        banner: String(hud.banner ?? ''), hint: String(hud.hint ?? ''), meter: hud.meter == null ? '' : String(hud.meter), poss: md ? String(md.possession()) : (hp && hp.carrier ? String(hp.carrier()) : ''), att: md ? String(md.attackPhase()) : '' });
      if (S.rows.length > 60000) S.rows.splice(0, 20000);
    });
  })()`);
  await tapBtn(p, 'A');
  await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  return { p, close: () => b.close(), errors, frames };
}

const BTN_I: Record<Btn, number> = { A: 0, B: 1, X: 2, Y: 3 }, DPAD_I: Record<Dir, number> = { up: 12, down: 13, left: 14, right: 15 };
async function padSet(p: Page, js: string): Promise<void> { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`); }
const stick = (p: Page, x: number, y: number) => padSet(p, `p.axes[0] = ${x}; p.axes[1] = ${y}`);
const rt = (p: Page, on: boolean, v = 1) => padSet(p, `p.buttons[7].pressed = ${on}; p.buttons[7].value = ${on ? v : 0}`);
const btn = (p: Page, b: Btn, on: boolean) => padSet(p, `p.buttons[${BTN_I[b]}].pressed = ${on}; p.buttons[${BTN_I[b]}].value = ${on ? 1 : 0}`);
async function tapBtn(p: Page, b: Btn, ms = 90): Promise<void> { await btn(p, b, true); await p.waitForTimeout(ms); await btn(p, b, false); }
const dpad = (p: Page, d: Dir, on: boolean) => padSet(p, `p.buttons[${DPAD_I[d]}].pressed = ${on}; p.buttons[${DPAD_I[d]}].value = ${on ? 1 : 0}`);
void dpad;
const now = async (p: Page): Promise<number> => p.evaluate('performance.now()') as Promise<number>;
const marks = async (p: Page): Promise<Mark[]> => p.evaluate('window.__smp.marks') as Promise<Mark[]>;
const rows = async (p: Page, a: number, z: number): Promise<Row[]> => (await p.evaluate('window.__smp.rows') as Row[]).filter((r) => r.t >= a && r.t <= z);
const lastRow = async (p: Page): Promise<Row> => p.evaluate('window.__smp.rows[window.__smp.rows.length - 1]') as Promise<Row>;
const text = async (p: Page): Promise<string> => p.evaluate('document.body.innerText') as Promise<string>;
/** A posture CARD: the camera overridden just before it renders for a few frames (the game keeps running — a stopped
 *  render loop starves the pad polls), a 3/4 view of the hero at chest height. */
async function card(p: Page, path: string, angleDeg = 40, dist = 3.4): Promise<void> {
  await p.evaluate(`(() => {
    const dev = window.__FEL_DEV__, scene = dev.scene; if (window.__card) { scene.onBeforeCameraRenderObservable.remove(window.__card); window.__card = null; }
    const a = ${angleDeg} * Math.PI / 180, dist = ${dist};
    window.__card = scene.onBeforeCameraRenderObservable.add((cam) => {
      const h = dev.hero(); if (!h || cam !== scene.activeCamera) return;
      const yaw = h.rotationQuaternion ? h.rotationQuaternion.toEulerAngles().y : h.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
      const dx = fx * Math.cos(a) - fz * Math.sin(a), dz = fx * Math.sin(a) + fz * Math.cos(a);
      const c = h.position.clone(); c.y += 1.05;
      cam.position.set(c.x + dx * dist, c.y + 0.3, c.z + dz * dist);
      if (cam.rotationQuaternion) cam.rotationQuaternion = null;
      cam.setTarget(c);
      cam.getViewMatrix(true);
    });
  })()`);
  await p.waitForTimeout(50);
  await p.screenshot({ path });
  await p.evaluate(`(() => { const scene = window.__FEL_DEV__.scene; if (window.__card) { scene.onBeforeCameraRenderObservable.remove(window.__card); window.__card = null; } })()`);
}
const f0 = (n: number) => n.toFixed(0), f2 = (n: number) => n.toFixed(2);
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const absMean = (a: number[]) => mean(a.map(Math.abs));
// a T = the hands WIDE along the shoulders' line at shoulder height with straight elbows (a run's arm swing is front-to-back)
const isT = (r: Row) => r.lat >= 0.95 && Math.abs(r.lhy - r.shy) < 0.22 && Math.abs(r.rhy - r.shy) < 0.22 && r.elb >= 150;
/** the largest yaw step between consecutive frames (a snap) */
const maxYawStep = (R: Row[]): number => { let m = 0; for (let i = 1; i < R.length; i++) { const d = Math.abs(Math.atan2(Math.sin(R[i].yaw - R[i - 1].yaw), Math.cos(R[i].yaw - R[i - 1].yaw))) * 180 / Math.PI; if (R[i].t - R[i - 1].t < 60) m = Math.max(m, d); } return m; };
const wins = (R: Row[]): string => { const out: string[] = []; for (const r of R) if (out[out.length - 1] !== r.win) out.push(r.win); return out.join('→'); };
const clipsIn = (R: Row[]): string => [...new Set(R.flatMap((r) => r.clips))].join(',');
const has = (ms: Mark[], re: RegExp) => ms.some((m) => re.test(m.msg));

type Lines = string[];
const say = (L: Lines, ok: boolean, what: string) => L.push(`${ok ? 'PASS' : 'FAIL'}  ${what}`);

// ── shared scenario pieces ────────────────────────────────────────────────
/** A jog toward the rim (stick up), then the meter (hold R2), then the release — the jumper. */
async function jumper(p: Page, L: Lines, slug: string, holdMs = 450, jogMs = MODE === 'threevthree' ? 350 : 550): Promise<void> {
  const tA = await now(p); const m0 = (await marks(p)).length;
  await stick(p, 0, -0.75); await p.waitForTimeout(jogMs); await stick(p, 0, 0); await p.waitForTimeout(150);
  await rt(p, true); const tLoad = await now(p);
  await p.waitForTimeout(Math.max(120, holdMs - 200)); await card(p, `${OUT}/${slug}-load.png`, 45);
  await p.waitForTimeout(150); await rt(p, false); const tRel = await now(p);
  await p.waitForTimeout(220); await card(p, `${OUT}/${slug}-follow.png`, 50);
  await p.waitForTimeout(1400); const tZ = await now(p);
  const R = await rows(p, tA, tZ), ms = (await marks(p)).slice(m0);
  const load = R.filter((r) => r.t > tLoad + 150 && r.t < tRel && r.win === 'load');
  const rel = R.filter((r) => r.t >= tRel && r.t < tRel + 260 && (r.win === 'release' || r.win === 'follow'));
  const follow = R.filter((r) => r.t >= tRel + 260 && r.win === 'follow');
  const flight = R.filter((r) => r.t >= tRel && r.t < tRel + 1200);
  const relRow = R.find((r) => r.t >= tRel + 30) ?? R[R.length - 1];
  const banner = R.map((r) => r.banner).filter(Boolean); const resolved = banner.some((b) => /GREEN|EARLY|LATE|BRICK|WAY LATE/.test(b));
  const tRows = flight.filter(isT);
  if (tRows.length) L.push(`      T frames at +${tRows.slice(0, 6).map((r) => f0(r.t - tRel)).join(', +')} ms · clips ${clipsIn(tRows)} · hands ${f2(tRows[0].lhy)}/${f2(tRows[0].rhy)} sh ${f2(tRows[0].shy)} lat ${f2(tRows[0].lat)} elb ${f0(tRows[0].elb)}`);
  say(L, load.length >= 5 && absMean(load.map((r) => r.chestRim)) <= 25 && Math.abs(relRow.chestRim) <= 30, `G1 shot faces the rim: load ${load.length} frames chest ${f0(absMean(load.map((r) => r.chestRim)))}° off the rim (≤ 25), ${f0(Math.abs(relRow.chestRim))}° at the release (≤ 30) · windows ${wins(R.filter((r) => r.t > tLoad && r.t < tRel + 1200))}`);
  say(L, load.length >= 5 && Math.max(0, ...load.map((r) => r.ballHand)) <= 0.32, `G6 ball in the hand through the load: max ball–hand ${f2(Math.max(0, ...load.map((r) => r.ballHand)))} m (≤ 0.32)`);
  say(L, follow.length >= 8 && rel.length >= 1 && !flight.some(isT) && flight.some((r) => r.clips.some((c) => /follow_through|jumpshot/.test(c))), `G5 follow-through held: release ${rel.length} frames, follow ${follow.length} frames (≥ 8), T frames ${flight.filter(isT).length}, clips ${clipsIn(flight)}`);
  say(L, load.length >= 5 && absMean(load.map((r) => r.eyes)) <= 28, `eyes on the iron through the load: ${f0(absMean(load.map((r) => r.eyes)))}° off (≤ 28)`);
  // a possession reset TELEPORTS the body (a 180° turn with a > 0.5 m jump): not a facing snap — grade the play before it
  const play = (() => { const out: Row[] = []; for (let i = 1; i < R.length; i++) { if (R[i].t <= tA + 100) continue; if (Math.hypot(R[i].x - R[i - 1].x, R[i].z - R[i - 1].z) > 0.5) break; out.push(R[i]); } return out; })();
  say(L, maxYawStep(play) < 60, `G3 no facing snap in play: max yaw step ${f0(maxYawStep(play))}°/frame over ${play.length} frames (< 60)`);
  say(L, resolved, `the shot resolved: ${banner.slice(0, 4).join(' | ') || 'no banner'}`);
  if (VERBOSE) for (const r of R.filter((_, i) => i % 6 === 0)) L.push(`        +${f0(r.t - tA)} ${r.win} chestRim ${f0(r.chestRim)} eyes ${f0(r.eyes)} bh ${f2(r.ballHand)} ${r.clips.join(',')} ${r.banner}`);
  void has(ms, /x/);
}
/** A sprint at the rim, the squeeze inside range: the drive dunk. */
async function driveDunk(p: Page, L: Lines, slug: string): Promise<void> {
  let tA = await now(p), tFire = tA, fired = false;
  // the 3v3 defenders sit in the lane and strip a straight sprint about half the time — up to three attempts, the first flight counts
  for (let attempt = 0; attempt < 3 && !fired; attempt++) {
    if (attempt > 0) { if (!(await waitOffense(p))) break; L.push(`      dunk attempt ${attempt + 1} (the last sprint was stripped)`); }
    tA = await now(p);
    await stick(p, 0, -1);
    // squeeze the trigger as soon as the body is inside 2.5 m of the rim's floor point at speed (a strip ends the attempt)
    const t0 = Date.now();
    while (Date.now() - t0 < 2500) { const r = await lastRow(p); if (/STOLEN|STRIPPED/.test(r.banner) || (MODE === 'threevthree' && r.poss !== 'me') || (MODE === 'onevone' && r.poss !== 'mine')) break; const d = Math.hypot(r.x - 0, r.z - (-0.6)); if (d < 2.5) { await rt(p, true); fired = true; break; } await p.waitForTimeout(16); }
    tFire = await now(p);
    await p.waitForTimeout(120); await rt(p, false); await stick(p, 0, 0);
    if (!fired) await p.waitForTimeout(300);
  }
  const cards: string[] = [];
  const t1 = Date.now(); const seen = new Set<string>();
  while (Date.now() - t1 < 1500) { const r = await lastRow(p); for (const w of ['hang', 'extend', 'jam', 'brace', 'land']) if (r.win === w && !seen.has(w)) { seen.add(w); await card(p, `${OUT}/${slug}-${w}.png`, 55); cards.push(w); } await p.waitForTimeout(16); }
  await p.waitForTimeout(600); const tZ = await now(p);
  const R = await rows(p, tA, tZ);
  const flight = R.filter((r) => r.t > tFire && ['rise', 'hang', 'extend', 'jam', 'brace'].includes(r.win));
  const resolve = flight.find((r) => r.win === 'jam' || r.win === 'brace');
  const land = R.filter((r) => r.win === 'land');
  const rel = (() => { let last: Row | null = null; for (const r of R) { if (r.t <= tFire) continue; if (r.ballHand >= 0 && r.ballHand <= 0.3) last = r; else if (r.ballHand > 0.45 && last) return last; } return null; })();
  const banner = R.map((r) => r.banner).filter(Boolean);
  const tF = flight.filter(isT).concat(land.filter(isT));
  if (tF.length) L.push(`      T frames at +${tF.slice(0, 8).map((r) => f0(r.t - tFire)).join(', +')} ms after the squeeze · windows ${[...new Set(tF.map((r) => r.win))].join(',')} · clips ${clipsIn(tF)} · hands ${f2(tF[0].lhy)}/${f2(tF[0].rhy)} sh ${f2(tF[0].shy)} lat ${f2(tF[0].lat)} elb ${f0(tF[0].elb)}`);
  say(L, fired && flight.length >= 8 && !!resolve, `the drive dunk flew: ${flight.length} flight frames, windows ${wins(R.filter((r) => r.t > tFire))} · ${banner.filter((b) => /THROWN|POSTER|RATTLED|STUFFED/.test(b))[0] ?? 'no verdict banner'}`);
  say(L, !!resolve && Math.abs(resolve.chestRim) <= 30 && absMean(flight.slice(-6).map((r) => r.chestRim)) <= 30, `G1 chest on the iron at the resolve: ${resolve ? f0(Math.abs(resolve.chestRim)) : '?'}° (≤ 30), last 6 flight frames ${f0(absMean(flight.slice(-6).map((r) => r.chestRim)))}°`);
  say(L, !!rel && rel.y >= 0.85 && rel.ballY >= 2.5, `G6 the ball leaves the hand at the iron: root y ${rel ? f2(rel.y) : '?'} (≥ 0.85), ball y ${rel ? f2(rel.ballY) : '?'} (≥ 2.5) at the release`);
  say(L, land.length >= 6 && land.some((r) => r.clips.some((c) => /land_crouch/.test(c))) && !flight.some(isT) && !land.some(isT), `G5 feet-down is the land crouch: land ${land.length} frames, clips ${clipsIn(land)}, T frames flight ${flight.filter(isT).length} land ${land.filter(isT).length}`);
  say(L, maxYawStep(flight) < 60, `G3 no snap through the flight: max yaw step ${f0(maxYawStep(flight))}°/frame`);
  if (VERBOSE) for (const r of R.filter((r) => r.t > tFire - 100).filter((_, i) => i % 3 === 0)) L.push(`        +${f0(r.t - tFire)} y ${f2(r.y)} ${r.win} chestRim ${f0(r.chestRim)} bh ${f2(r.ballHand)} ballY ${f2(r.ballY)} ${r.clips.join(',')} ${r.banner}`);
}
/** Back to MY possession, deterministically (the dev seams): the rival strips inside the boot wait and make-it-take-it can
 *  keep the ball for a whole run otherwise. */
async function waitOffense(p: Page, ms = 12000): Promise<boolean> {
  await p.evaluate(`(() => { const d = window.__FEL_DEV__; const md = d.scene.metadata && d.scene.metadata.onevone; if (md && md.offense) md.offense(); else if (d.hoopsPosture && d.hoopsPosture.offense) d.hoopsPosture.offense(); })()`);
  // 3v3's AI defenders poke a STANDING handler the moment they arrive (~0.7 s after a reset) — act at once there
  await p.waitForTimeout(MODE === 'threevthree' ? 120 : 700);
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const r = await lastRow(p); if ((MODE === 'onevone' ? r.poss === 'mine' : MODE === 'threevthree' ? r.poss === 'me' : !/DEFEND/.test(r.hint)) && r.ballHand >= 0 && r.ballHand < 1.2) return true; await p.waitForTimeout(60); }
  const r = await lastRow(p); console.log(`      waitOffense timed out: poss ${r.poss} ballHand ${f2(r.ballHand)} win ${r.win} hint ${r.hint.slice(0, 40)} banner ${r.banner}`);
  return false;
}

// ── per-mode runs ─────────────────────────────────────────────────────────
async function runOneVOne(p: Page, out: Lines): Promise<void> {
  out.push('\n## 1. the jumper (jog, meter, release, follow-through)');
  if (await waitOffense(p)) await jumper(p, out, `${TAG}-1v1-shot`); else out.push('FAIL  no offensive possession reached for the jumper');
  out.push('\n## 2. DEFENSE — the slide keeps the chest on the handler; a block jump at nothing is refused');
  if (await waitOffense(p)) {
    await p.evaluate('window.__FEL_DEV__.scene.metadata.onevone.defend()');
    await p.waitForTimeout(1300);
    const tA = await now(p);
    await stick(p, 0.9, 0); await p.waitForTimeout(700); await card(p, `${OUT}/${TAG}-1v1-slide.png`, 60);
    await stick(p, -0.9, 0); await p.waitForTimeout(700); await stick(p, 0, 0);
    const tZ = await now(p);
    const R = await rows(p, tA + 150, tZ);
    const slide = R.filter((r) => r.win === 'slide');
    // my chest vs the bearing to the foe: chestRim is vs the RIM — recompute vs the foe from the foe's own row (foeChest is the foe's; for me use yaw vs the foe bearing)
    const myChestToFoe = R.map((r) => { const b = Math.atan2(0, 1); void b; return r; });
    void myChestToFoe;
    say(out, slide.length >= 10 && absMean(slide.map((r) => r.chest)) <= 30, `G1 slide: ${slide.length} slide frames (windows ${wins(R)}), chest ${f0(absMean(slide.map((r) => r.chest)))}° off the root (the root faces the handler: ≤ 30) · clips ${clipsIn(slide)}`);
    const near = slide.filter((r) => r.foeDist >= 0 && r.foeDist <= 6);
    say(out, near.length >= 10 && absMean(near.map((r) => r.meToFoe)) <= 25, `G1 the root faces the HANDLER while sliding: ${f0(absMean(near.map((r) => r.meToFoe)))}° off the bearing to him over ${near.length} frames inside 6 m (≤ 25 — a slide moves sideways with the chest on the handler)`);
    say(out, !slide.some(isT) && !R.some(isT), `G2 no T while sliding: ${R.filter(isT).length} T frames`);
    // the early jump
    const r0 = await lastRow(p);
    if (r0.poss === 'defense' && r0.att !== 'gather') { await tapBtn(p, 'A'); await p.waitForTimeout(400); const R2 = await rows(p, tZ, await now(p)); say(out, R2.some((r) => /JUMPED EARLY/.test(r.banner)), `G4 a block jump outside the gather is refused: ${[...new Set(R2.map((r) => r.banner).filter(Boolean))].join(' | ') || 'no banner'} (attack phase ${r0.att})`); }
    else out.push(`      G4 not graded: possession ${r0.poss}, attack phase ${r0.att}`);
    await p.waitForTimeout(6000);
  } else out.push('FAIL  no offensive possession reached for the defense scenario');
  out.push('\n## 3. the DRIVE DUNK (sprint, squeeze in range) — resolves at the iron, lands in the crouch');
  if (await waitOffense(p)) await driveDunk(p, out, `${TAG}-1v1-dunk`); else out.push('FAIL  no offensive possession reached for the dunk');
}
async function runThreeVThree(p: Page, out: Lines): Promise<void> {
  out.push('\n## 1. the lateral dribble in front of the defenders — their chest stays on the ball');
  await waitOffense(p);
  { const tA = await now(p);
    await stick(p, 0.8, 0); await p.waitForTimeout(900); await card(p, `${OUT}/${TAG}-3v3-defenders.png`, 120, 4.5);
    await stick(p, -0.8, 0); await p.waitForTimeout(900); await stick(p, 0, 0);
    const R = (await rows(p, tA + 200, await now(p))).filter((r) => r.foeDist >= 0 && r.foeDist <= 6);
    say(out, R.length >= 20 && absMean(R.map((r) => r.foeChest)) <= 40, `G1 the nearest defender's chest on the handler: ${f0(absMean(R.map((r) => r.foeChest)))}° off over ${R.length} frames inside 6 m (≤ 40) · his windows ${[...new Set(R.map((r) => r.foeWin))].join(',')}`);
    say(out, !R.some(isT), `G2 no T on me through the lateral dribble (${R.filter(isT).length} T frames) · my windows ${wins(R)} · clips ${clipsIn(R)}`);
  }
  out.push('\n## 2. the jumper (jog, meter, release, follow-through)');
  if (await waitOffense(p)) await jumper(p, out, `${TAG}-3v3-shot`); else out.push('FAIL  no offensive possession reached for the jumper');
  out.push('\n## 3. their possession — a block jump before the release is refused');
  { const t0 = Date.now(); let onD = false; while (Date.now() - t0 < 6000) { const r = await lastRow(p); if (/DEFEND/.test(r.hint)) { onD = true; break; } await p.waitForTimeout(60); }
    if (onD) { await p.waitForTimeout(150); await tapBtn(p, 'A'); await p.waitForTimeout(500); const R = await rows(p, (await now(p)) - 700, await now(p)); say(out, R.some((r) => /JUMPED EARLY/.test(r.banner)), `G4 early block jump refused: ${[...new Set(R.map((r) => r.banner).filter(Boolean))].join(' | ') || 'no banner'}`); await p.waitForTimeout(2500); }
    else out.push('      G4 not graded: no opponent possession followed the shot'); }
  out.push('\n## 4. the DRIVE DUNK');
  if (await waitOffense(p)) await driveDunk(p, out, `${TAG}-3v3-dunk`); else out.push('FAIL  no offensive possession reached for the dunk');
}
async function runThreePoint(p: Page, out: Lines): Promise<void> {
  out.push('\n## 1. five balls of the first rack — the load, the release from the hand, the follow-through');
  for (let b = 0; b < 5; b++) {
    const t0 = Date.now(); let loaded = false;
    while (Date.now() - t0 < 6000) { const r = await lastRow(p); if (r.meter !== '' && r.win === 'load') { loaded = true; break; } await p.waitForTimeout(30); }
    if (!loaded) { out.push(`FAIL  ball ${b + 1}: never loaded`); continue; }
    await p.waitForTimeout(450);
    const tA = await now(p);
    if (b === 0) await card(p, `${OUT}/${TAG}-3pt-load.png`, 45);
    await tapBtn(p, 'A', 60); const tRel = await now(p);
    if (b === 0) { await p.waitForTimeout(330); await card(p, `${OUT}/${TAG}-3pt-follow.png`, 50); }
    await p.waitForTimeout(1300); const tZ = await now(p);
    const R = await rows(p, tA - 400, tZ);
    const load = R.filter((r) => r.t < tRel && r.win === 'load');
    // the release row = the last frame the ball was still at the hand before it climbed away (the arc starts at the hand)
    const relRow = (() => { let last: Row | null = null; for (const r of R) { if (r.t <= tRel) continue; if (r.ballHand >= 0 && r.ballHand <= 0.3) last = r; else if (r.ballHand > 0.4 && last) return last; } return null; })();
    const after = R.filter((r) => r.t > tRel && r.t < tRel + 1100);
    const follow = after.filter((r) => r.win === 'follow');
    // the base jumpshot lifts the arms through the SIDES for ~50 ms before its release frame (the forge clip's own authoring,
    // shared by every jumper in the game): counted apart from the follow-through this pass owns
    const preRel = after.filter((r) => relRow && r.t <= relRow.t), postRel = after.filter((r) => !relRow || r.t > relRow.t);
    if (preRel.some(isT)) out.push(`      note: ${preRel.filter(isT).length} T frames INSIDE the base jumpshot's rise (before the release, clips ${clipsIn(preRel.filter(isT))}) — the forge clip lifts the arms through the sides`);
    const tRows = postRel.filter(isT);
    if (tRows.length) out.push(`      T frames after the release at +${tRows.slice(0, 6).map((r) => f0(r.t - tRel)).join(', +')} ms · clips ${clipsIn(tRows)} · hands ${f2(tRows[0].lhy)}/${f2(tRows[0].rhy)} sh ${f2(tRows[0].shy)} lat ${f2(tRows[0].lat)} elb ${f0(tRows[0].elb)}`);
    say(out, load.length >= 8 && Math.max(0, ...load.map((r) => r.ballHand)) <= 0.3 && absMean(load.map((r) => r.chestRim)) <= 22 && absMean(load.map((r) => r.eyes)) <= 25,
      `ball ${b + 1} LOAD: ${load.length} frames, ball–hand max ${f2(Math.max(0, ...load.map((r) => r.ballHand)))} m (≤ 0.3, G6), chest ${f0(absMean(load.map((r) => r.chestRim)))}° off the rim (≤ 22, G1), eyes ${f0(absMean(load.map((r) => r.eyes)))}° (≤ 25)`);
    say(out, !!relRow && relRow.ballY >= relRow.headY - 0.25 && relRow.t - tRel > 120 && relRow.t - tRel < 700,
      `ball ${b + 1} RELEASE from the hand: ball y ${relRow ? f2(relRow.ballY) : '?'} vs head ${relRow ? f2(relRow.headY) : '?'} (≥ head − 0.25, G6), +${relRow ? f0(relRow.t - tRel) : '?'} ms after the press (the clip's release frame, 120–700)`);
    say(out, follow.length >= 8 && !postRel.some(isT) && after.some((r) => r.clips.some((c) => /follow_through/.test(c))),
      `ball ${b + 1} FOLLOW-THROUGH held: ${follow.length} follow frames (≥ 8), T frames after the release ${postRel.filter(isT).length}, clips ${clipsIn(after)} · windows ${wins(R.filter((r) => r.t > tRel))} · ${R.map((r) => r.banner).filter(Boolean).slice(-1)[0] ?? ''}`);
  }
  out.push('\n## 2. the jog to the next rack — faces the travel, carries the ball two-handed');
  const JOG = (w: string) => w === 'run' || w === 'dribble' || w === 'drive';
  { const t0 = Date.now(); let moving = false; while (Date.now() - t0 < 6000) { const r = await lastRow(p); if (r.meter === '' && JOG(r.win)) { moving = true; break; } await p.waitForTimeout(20); }
    if (moving) { const tA = await now(p); await p.waitForTimeout(250); await card(p, `${OUT}/${TAG}-3pt-jog.png`, 40); await p.waitForTimeout(400); const R = (await rows(p, tA + 60, await now(p))).filter((r) => JOG(r.win));
      const ft = R.map((r, i) => { if (i === 0) return 1; const prev = R[i - 1]; const vx = r.x - prev.x, vz = r.z - prev.z, sp = Math.hypot(vx, vz); return sp > 0.003 ? (Math.sin(r.yaw) * vx + Math.cos(r.yaw) * vz) / sp : 1; });
      say(out, R.length >= 10 && mean(ft) >= 0.7, `G1 the jog faces its travel: facing·travel ${f2(mean(ft))} over ${R.length} frames (≥ 0.7)`);
      say(out, R.length >= 10 && mean(R.map((r) => r.handGap)) <= 0.45 && Math.max(0, ...R.map((r) => r.ballHand)) <= 0.3 && !R.some(isT), `G2/G6 two-hand carry: hands ${f2(mean(R.map((r) => r.handGap)))} m apart (≤ 0.45), ball–hand max ${f2(Math.max(0, ...R.map((r) => r.ballHand)))} m (≤ 0.3), T frames ${R.filter(isT).length} · clips ${clipsIn(R)}`);
    } else out.push('FAIL  the jog to the second rack never came'); }
}
async function runDunkDuel(p: Page, out: Lines): Promise<void> {
  out.push('\n## 1. P1 — the plain POWER dunk: plant / rise / hang / extend / jam on the contest\'s stances, the bench body watching');
  await tapBtn(p, 'A'); await p.waitForTimeout(400);   // skip the handoff card
  const tA = await now(p); const m0 = (await marks(p)).length;
  await stick(p, 0, -1); await p.waitForTimeout(400);
  await rt(p, true); await p.waitForTimeout(350); await card(p, `${OUT}/${TAG}-duel-load.png`, 45);
  let launched = 0; const t0 = Date.now();
  while (!launched && Date.now() - t0 < 3500) { const ms = (await marks(p)).slice(m0); const l = ms.find((m) => /JUICE-SOFT\] launch/.test(m.msg)); if (l) launched = l.t; await p.waitForTimeout(30); }
  await rt(p, false); await stick(p, 0, 0);
  if (!launched) { out.push('FAIL  never launched'); return; }
  const pageNow = await now(p); const lag = Date.now() - (pageNow - launched) ; const since = () => Date.now() - lag;
  const seen = new Set<string>(); let next = 950;
  while (since() < 2600) { const el = since(); if (el >= next && el < 2300) { await tapBtn(p, 'A', 60); next = el + 85; } const r = await lastRow(p); for (const w of ['hang', 'extend', 'jam', 'brace', 'land']) if (r.win === w && !seen.has(w)) { seen.add(w); await card(p, `${OUT}/${TAG}-duel-${w}.png`, 55); } await p.waitForTimeout(15); }
  await p.waitForTimeout(800); const tZ = await now(p);
  const R = await rows(p, tA, tZ), ms = (await marks(p)).slice(m0);
  const flight = R.filter((r) => r.t > launched && ['plant', 'rise', 'hang', 'extend', 'jam', 'brace'].includes(r.win));
  const hang = flight.filter((r) => r.win === 'hang'), jam = flight.filter((r) => r.win === 'jam'), land = R.filter((r) => r.win === 'land');
  const made = has(ms, /JUICE-SFX\] impact slam|SCORES/) || R.some((r) => /SCORES/.test(r.banner));
  say(out, flight.length >= 15 && hang.length >= 3 && (jam.length >= 1 || flight.some((r) => r.win === 'brace')), `the contest's windows on the duel body: ${wins(R.filter((r) => r.t > launched - 600))} (${flight.length} flight frames) · ${made ? 'MAKE' : 'MISS'} · ${R.map((r) => r.banner).filter((b) => /SCORES|MISSED/.test(b))[0] ?? ''}`);
  say(out, hang.length >= 3 && absMean(hang.map((r) => r.eyes)) <= 28 && absMean(hang.map((r) => r.chestRim)) <= 25, `G1 hang: chest ${f0(absMean(hang.map((r) => r.chestRim)))}° off the rim (≤ 25), eyes ${f0(absMean(hang.map((r) => r.eyes)))}° (≤ 28)`);
  say(out, jam.length === 0 || (Math.abs(jam[0].chestRim) <= 25 && absMean(jam.map((r) => r.chestRim)) <= 25), `G1 jam: chest ${jam.length ? f0(absMean(jam.map((r) => r.chestRim))) : '—'}° off the rim through ${jam.length} jam frames (≤ 25)`);
  say(out, !flight.some(isT) && !land.some(isT) && land.length >= 5 && land.some((r) => r.clips.some((c) => /land_crouch/.test(c))), `G5 no T in the air or the land; land ${land.length} frames, clips ${clipsIn(land)}, T frames ${flight.filter(isT).length + land.filter(isT).length}`);
  say(out, R.some((r) => r.foeWin === 'bench'), `the bench body stands in the idle stance watching the dunker: bench windows ${[...new Set(R.map((r) => r.foeWin).filter(Boolean))].join(',') || 'none'}`);
  say(out, maxYawStep(flight) < 60, `G3 no snap through the flight: max yaw step ${f0(maxYawStep(flight))}°/frame`);
  if (VERBOSE) for (const r of R.filter((r) => r.t > launched - 200).filter((_, i) => i % 4 === 0)) L(out, `        +${f0(r.t - launched)} y ${f2(r.y)} ${r.win} chestRim ${f0(r.chestRim)} eyes ${f0(r.eyes)} bh ${f2(r.ballHand)} ${r.clips.join(',')} ${r.banner}`);
}
const L = (out: Lines, s: string) => out.push(s);

(async () => {
  const out: string[] = [`BIOMECH-HOOPS-WAVE1 probe · ${MODE} · ${TAG} · port ${PORT} · ${process.env.QS ?? ''} · ${new Date().toISOString()}`];
  const { p, close, errors, frames } = await boot();
  try {
    if (MODE === 'onevone') await runOneVOne(p, out);
    else if (MODE === 'threevthree') await runThreeVThree(p, out);
    else if (MODE === 'threepoint') await runThreePoint(p, out);
    else await runDunkDuel(p, out);
  } catch (e) { out.push(`FAIL  threw: ${String(e).slice(0, 300)}`); }
  const ms = await marks(p);
  out.push(`\nposture layer marks: ${ms.filter((m) => /-PP/.test(m.msg)).length} · warnings: ${ms.filter((m) => /^WARN/.test(m.msg)).slice(0, 4).map((m) => m.msg).join(' | ') || 'none'}`);
  await close();
  out.push(`console errors: ${errors.length}${errors.length ? '\n  ' + [...new Set(errors)].slice(0, 8).join('\n  ') : ''}`);
  out.push(`FEL-FRAME / MISSING CLIP: ${frames.length}${frames.length ? '\n  ' + [...new Set(frames)].slice(0, 6).join('\n  ') : ''}`);
  const pass = out.filter((l) => l.startsWith('PASS')).length, fail = out.filter((l) => l.startsWith('FAIL')).length;
  out.push(`\nTOTAL PASS ${pass} · FAIL ${fail}`);
  writeFileSync(`${OUT}/report-${MODE}-${TAG}.md`, out.join('\n'));
  console.log(out.join('\n'));
})();
