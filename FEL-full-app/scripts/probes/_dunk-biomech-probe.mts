// DUNK-BIOMECH probe (2026-09-08): torso facing, trick spin honesty, cue windows, momentum and end poses on /dev/mode/dunk,
// graded per rendered frame off the live rig (the chest = the shoulders' line, the hips = the thighs' line, both against the
// bearing to the rim from the root). Keyboard by default (WASD, space = RUN, jkli = A B X Y, arrows = d-pad); SRC=pad for the
// pre-boot fake DualShock.
//   B1 rim-facing torso: chest within ±45° of the rim through the carry-up and at CONTACT (make) / the clank (miss)
//   B2 trick spin honesty: a 360 sweeps the chest through ±150° and is back inside ±45° by the slam frame, no snap
//   B3 cue windows: an early press ARMS (banner) and fires on its beat; a late press is refused with a banner; the scorpion fires at the hang
//   B4 momentum: the hang slow-mo still fires with a trick in the air, a second trick is taken or refused out loud, a third is refused
//   B5 end poses: a dunk clip on the body every frame from the resolve to feet-down, no T-pose held through the fall, feet-down lands
//   PORT=3004 npx tsx scripts/probes/_dunk-biomech-probe.mts        (SRC=pad · SCEN= filters · VERBOSE=1 · GROUP=n)
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const PORT = process.env.PORT ?? '3004', SRC = (process.env.SRC ?? 'key') as 'pad' | 'key', OUT = process.env.OUT_DIR ?? 'docs/shots/dunk-biomech';
const SCEN = process.env.SCEN ?? '', VERBOSE = !!process.env.VERBOSE, GROUP = process.env.GROUP ? Number(process.env.GROUP) : null;
mkdirSync(OUT, { recursive: true });
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

type Row = { t: number; dt: number; x: number; y: number; z: number; yaw: number; rq: number; chest: number; hips: number; rimB: number; spread: number; lhy: number; rhy: number; shy: number; clips: string[]; ats: number; banner: string; hint: string; score: number };
type Mark = { t: number; msg: string };
type Btn = 'A' | 'B' | 'X' | 'Y'; type Dir = 'up' | 'down' | 'left' | 'right';
interface Scenario {
  name: string; prop: 'none' | 'car';
  hold?: number; rt?: number;
  style?: 'power' | 'flashy' | 'sig';
  air?: { at: number; dir?: Dir; btn: Btn }[];       // ms after the launch mark
  slam?: boolean;                                    // default true
  expect: { spin?: boolean; armed?: string; late?: string; tricks?: number; contactWithin?: number; missHonest?: boolean; fireAtHang?: boolean; thirdRefused?: boolean; clipped?: boolean };
  shots?: number[];
}
const S: Scenario[] = [
  { name: 'plain POWER make', prop: 'none', expect: {}, shots: [1450] },
  { name: '360 armed early (right+B at +80 ms) → fires at the rise', prop: 'none', air: [{ at: 80, dir: 'right', btn: 'B' }], expect: { spin: true, armed: '360 ARMED' }, shots: [620, 1000, 1450] },
  { name: '360 too late (right+B at +1150 ms) → refused', prop: 'none', air: [{ at: 1150, dir: 'right', btn: 'B' }], expect: { late: 'TOO LATE FOR THE 360', tricks: 0 } },
  { name: '360 → WINDMILL over the CAR (the owner\'s dunk) + a third press', prop: 'car', air: [{ at: 80, dir: 'right', btn: 'B' }, { at: 700, dir: 'up', btn: 'A' }, { at: 1000, dir: 'left', btn: 'A' }], expect: { spin: true, armed: '360 ARMED', tricks: 2, thirdRefused: true }, shots: [700, 1000, 1500] },
  { name: 'SCORPION armed early (right+Y at +100 ms) → fires at the hang', prop: 'none', air: [{ at: 100, dir: 'right', btn: 'Y' }], expect: { armed: 'SCORPION ARMED', fireAtHang: true }, shots: [1100] },
  { name: 'MISS with a 360 (no slam) — blown end pose + honest card', prop: 'none', air: [{ at: 80, dir: 'right', btn: 'B' }], slam: false, expect: { spin: true, missHonest: true }, shots: [1900, 2300] },
  { name: 'plain MISS (no slam) — the baseline card', prop: 'none', slam: false, expect: {}, shots: [2000] },
  { name: 'CAR clipped mid-360 (weak jump) — the latch settles the turn', prop: 'car', hold: SRC === 'key' ? 240 : undefined, rt: 0.3, air: [{ at: 80, dir: 'right', btn: 'B' }], slam: false, expect: { clipped: true } , shots: [900, 1600] },
  { name: 'SIG eastbay make — the clip\'s own hip turn stays inside the bar', prop: 'none', style: 'sig', expect: {} },
  { name: 'TOMAHAWK in its window (up+Y at +1000 ms)', prop: 'none', air: [{ at: 1000, dir: 'up', btn: 'Y' }], expect: { tricks: 1 } },
  { name: 'WINDMILL at the rise (up+A at +350 ms)', prop: 'none', air: [{ at: 350, dir: 'up', btn: 'A' }], expect: { tricks: 1 }, shots: [1000] },
  { name: '360 at the hang (right+B at +800 ms) — a quicker turn, still resolved', prop: 'none', air: [{ at: 800, dir: 'right', btn: 'B' }], expect: { spin: true, tricks: 1 }, shots: [1100] },
];

const PAD_INIT = `(() => {
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad;
  navigator.getGamepads = () => [pad];
})()`;
async function boot(): Promise<{ p: Page; close: () => Promise<void>; errors: string[]; frames: string[] }> {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  if (SRC === 'pad') await ctx.addInitScript(PAD_INIT);
  const p = await ctx.newPage();
  const errors: string[] = []; const frames: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401|favicon/.test(t)) errors.push(t.slice(0, 200)); if (/FEL-FRAME|MISSING CLIP/.test(t)) frames.push(t.slice(0, 160)); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  await p.goto(`http://localhost:${PORT}/dev/mode/dunk${process.env.QS ? '?' + process.env.QS : ''}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('canvas', { timeout: 90000 });
  await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
  await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 120000 });
  await p.evaluate(`(() => {
    const dev = window.__FEL_DEV__, scene = dev.scene;
    const S = window.__smp = { rows: [], marks: [], sign: 0 };
    const oi = console.info.bind(console), ow = console.warn.bind(console);
    console.info = (...a) => { const s = String(a[0]); if (/^\\[(DUNK-WIN|DUNK-LAUNCH|DUNK-CAM|LOB|DUNK-PROP|DUNK-TRICK|DUNK-CUE|HANDS|JUICE-SOFT|FEL-DUNK|PAD)/.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 180) }); oi(...a); };
    console.warn = (...a) => { const s = String(a[0]); if (/FEL-DUNK|FEL-BALL/.test(s)) S.marks.push({ t: performance.now(), msg: 'WARN ' + s.slice(0, 180) }); ow(...a); };
    const rootOf = (n) => { if (n && typeof n.getTransformNode === 'function') n = n.getTransformNode() ?? n; while (n && n.parent) n = n.parent; return n; };
    const RIM = { x: 0, z: -10.28 };
    let heroSeen = null, LA = null, RA = null, LU = null, RU = null, LH = null, RH = null;
    const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));
    const bearing = (a, b) => { const sx = b.x - a.x, sz = b.z - a.z; const f = { x: -sz * S.sign, z: sx * S.sign }; return Math.atan2(f.x, f.z); };   // forward = sign · (shoulderVec × up)
    scene.onBeforeRenderObservable.add(() => {
      const h = dev.hero(); if (!h) return;
      if (h !== heroSeen) { heroSeen = h; const d = h.getDescendants(false); const f = (re) => d.find((n) => re.test(n.name)) ?? null; LA = f(/^LeftArm/); RA = f(/^RightArm/); LU = f(/^LeftUpLeg/); RU = f(/^RightUpLeg/); LH = f(/^LeftHand/); RH = f(/^RightHand/); }
      if (!LA || !RA) return;
      // fresh world matrices top-down (a forced compute on a node reads its parent's CACHED matrix): root → … → node
      const fresh = (n) => { const chain = []; for (let c = n; c && c !== h; c = c.parent) chain.push(c); for (let i = chain.length - 1; i >= 0; i--) chain[i].computeWorldMatrix(true); };
      h.computeWorldMatrix(true); for (const n of [LA, RA, LU, RU, LH, RH]) if (n) fresh(n);
      const la = LA.getAbsolutePosition(), ra = RA.getAbsolutePosition(), lu = LU ? LU.getAbsolutePosition() : la, ru = RU ? RU.getAbsolutePosition() : ra, lh = LH ? LH.getAbsolutePosition() : la, rh = RH ? RH.getAbsolutePosition() : ra;
      if (!S.sign) { // calibrate once: at the start the hero faces the rim (−z)
        const sx = ra.x - la.x, sz = ra.z - la.z; const fz = sx; S.sign = fz < 0 ? 1 : -1;   // forward.z = sign · sx; want −z
      }
      const chest = bearing(la, ra), hips = bearing(lu, ru);
      const rimB = Math.atan2(RIM.x - h.position.x, RIM.z - h.position.z);
      const clips = scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && rootOf(g.targetedAnimations[0].target) === h).map((g) => g.name);
      let hud = {}; try { const pre = document.querySelector('pre'); hud = pre ? JSON.parse(pre.textContent || '{}') : {}; } catch {}
      S.rows.push({ t: performance.now(), dt: scene.getEngine().getDeltaTime(), x: h.position.x, y: h.position.y, z: h.position.z, yaw: h.rotation.y, rq: h.rotationQuaternion ? 1 : 0,
        chest: wrap(chest - rimB) * 180 / Math.PI, hips: wrap(hips - rimB) * 180 / Math.PI, rimB: rimB * 180 / Math.PI,
        spread: Math.hypot(lh.x - rh.x, lh.y - rh.y, lh.z - rh.z), lhy: lh.y - h.position.y, rhy: rh.y - h.position.y, shy: (la.y + ra.y) / 2 - h.position.y,
        clips, ats: scene.animationTimeScale ?? 1, banner: String(hud.banner ?? ''), hint: String(hud.hint ?? ''), score: Number(hud.score ?? 0) });
      if (S.rows.length > 40000) S.rows.splice(0, 10000);
    });
  })()`);
  await tapBtn(p, 'A');
  await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  return { p, close: () => b.close(), errors, frames };
}

const BTN_I: Record<Btn, number> = { A: 0, B: 1, X: 2, Y: 3 }, DPAD_I: Record<Dir, number> = { up: 12, down: 13, left: 14, right: 15 };
const BTN_K: Record<Btn, string> = { A: 'j', B: 'k', X: 'l', Y: 'i' }, DPAD_K: Record<Dir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
async function padSet(p: Page, js: string): Promise<void> { await p.evaluate(`(() => { const p = window.__PAD; ${js}; p.timestamp = performance.now(); })()`); }
async function stickUp(p: Page, on: boolean): Promise<void> { if (SRC === 'pad') await padSet(p, `p.axes[1] = ${on ? -1 : 0}`); else { if (on) await p.keyboard.down('w'); else await p.keyboard.up('w'); } }
async function runHold(p: Page, on: boolean, v = 1): Promise<void> { if (SRC === 'pad') await padSet(p, `p.buttons[7].pressed = ${on}; p.buttons[7].value = ${on ? v : 0}`); else { if (on) await p.keyboard.down(' '); else await p.keyboard.up(' '); } }
async function btn(p: Page, b: Btn, on: boolean): Promise<void> { if (SRC === 'pad') await padSet(p, `p.buttons[${BTN_I[b]}].pressed = ${on}; p.buttons[${BTN_I[b]}].value = ${on ? 1 : 0}`); else { if (on) await p.keyboard.down(BTN_K[b]); else await p.keyboard.up(BTN_K[b]); } }
async function tapBtn(p: Page, b: Btn, ms = 90): Promise<void> { await btn(p, b, true); await p.waitForTimeout(ms); await btn(p, b, false); }
async function dpad(p: Page, d: Dir, on: boolean): Promise<void> { if (SRC === 'pad') await padSet(p, `p.buttons[${DPAD_I[d]}].pressed = ${on}; p.buttons[${DPAD_I[d]}].value = ${on ? 1 : 0}`); else { if (on) await p.keyboard.down(DPAD_K[d]); else await p.keyboard.up(DPAD_K[d]); } }
const now = async (p: Page): Promise<number> => p.evaluate('performance.now()') as Promise<number>;
const marks = async (p: Page): Promise<Mark[]> => p.evaluate('window.__smp.marks') as Promise<Mark[]>;
const rows = async (p: Page, a: number, z: number): Promise<Row[]> => (await p.evaluate('window.__smp.rows') as Row[]).filter((r) => r.t >= a && r.t <= z);
const text = async (p: Page): Promise<string> => p.evaluate('document.body.innerText') as Promise<string>;
const hudProp = async (p: Page): Promise<string> => p.evaluate(`(() => { try { return JSON.parse(document.querySelector('pre').textContent).prop || ''; } catch { return ''; } })()`) as Promise<string>;
async function waitApproach(p: Page, ms = 30000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const t = await text(p);
    if (/HOLD to run|Pick your PROP|FINAL ROUND/.test(t) && !/SLAM!|CONFER|CARD|RIVAL ROUND/.test(t)) return true;
    if (/CONTEST|result/.test(t) && !/· playing/.test(t)) return false;
    await p.waitForTimeout(120);
  }
  return false;
}
const RING = ['none', 'alleyoop', 'selflob', 'car', 'barrier', 'crate'] as const;
let curProp: (typeof RING)[number] = 'none', curStyle: 'power' | 'flashy' | 'sig' = 'power';
async function setProp(p: Page, want: 'none' | 'car', lines: string[]): Promise<void> {
  if (SRC === 'pad') { if (want === 'none') { await dpad(p, 'up', true); await p.waitForTimeout(90); await dpad(p, 'up', false); } else { const order = ['car', 'barrier', 'crate']; const cur = order.indexOf(curProp); const n = ((order.indexOf(want) - (cur < 0 ? -1 : cur)) + 3) % 3 || (cur === order.indexOf(want) ? 0 : 3); for (let i = 0; i < n; i++) { await dpad(p, 'down', true); await p.waitForTimeout(90); await dpad(p, 'down', false); await p.waitForTimeout(140); } } }
  else { const n = (RING.indexOf(want) - RING.indexOf(curProp) + RING.length) % RING.length; for (let i = 0; i < n; i++) { await tapBtn(p, 'X'); await p.waitForTimeout(140); } }
  curProp = want;
  await p.waitForTimeout(want === 'none' ? 250 : 1300);
  const shown = await hudProp(p);
  const label = want === 'none' ? 'NO PROP' : 'CAR';
  lines.push(`${shown === label ? 'PASS' : 'FAIL'}  prop ${want} → HUD "${shown}"`);
}
function bannerRuns(R: Row[]): { text: string; ms: number; from: number }[] {
  const out: { text: string; ms: number; from: number }[] = [];
  for (const r of R) { const last = out[out.length - 1]; if (last && last.text === r.banner) last.ms += r.dt; else out.push({ text: r.banner, ms: r.dt, from: r.t }); }
  return out;
}
const f0 = (n: number) => n.toFixed(0), f2 = (n: number) => n.toFixed(2);

async function attempt(p: Page, sc: Scenario, idx: number): Promise<string[]> {
  const lines: string[] = [];
  const say = (ok: boolean, what: string) => lines.push(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!(await waitApproach(p))) { lines.push('FAIL  no approach reached'); return lines; }
  await p.waitForTimeout(400);
  const m0 = (await marks(p)).length, tA = await now(p);
  await setProp(p, sc.prop, lines);
  { const ring = ['power', 'flashy', 'sig'] as const; const want = sc.style ?? 'power'; const n = (ring.indexOf(want) - ring.indexOf(curStyle) + 3) % 3; for (let i = 0; i < n; i++) { await tapBtn(p, 'B'); await p.waitForTimeout(140); } curStyle = want; if (n) lines.push(`      style → ${want}`); }
  const tRun = await now(p);
  await stickUp(p, true); await runHold(p, true, sc.rt ?? 1);
  const holdStart = Date.now();
  let launched = false, launchPage = 0;
  const launchedYet = async () => { const ms = (await marks(p)).slice(m0); const l = ms.find((m) => /JUICE-SOFT\] launch/.test(m.msg)); if (l) { launched = true; launchPage = l.t; } return launched; };
  while (!launched && Date.now() - holdStart < 3200) { const el = Date.now() - holdStart; if (sc.hold != null && el >= sc.hold) break; await p.waitForTimeout(30); await launchedYet(); }
  await runHold(p, false); await stickUp(p, false);
  const r0 = Date.now(); while (!(await launchedYet()) && Date.now() - r0 < 2000) await p.waitForTimeout(40);
  if (!launched) { lines.push('FAIL  never launched'); return lines; }
  const pageNow = await now(p);
  const sinceLaunch = () => Date.now() - (r0 - (pageNow - launchPage));
  const air = [...(sc.air ?? [])].sort((a, b) => a.at - b.at);
  const shots = [...(sc.shots ?? [])].sort((a, b) => a - b);
  let nextSlam = 950; const slug = `${idx}-${sc.name.split(/[ (—]/)[0].toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  while (sinceLaunch() < 2700) {
    const el = sinceLaunch();
    if (air.length && el >= air[0].at) { const a = air.shift()!; if (a.dir) { await dpad(p, a.dir, true); await p.waitForTimeout(20); } await tapBtn(p, a.btn, 70); if (a.dir) await dpad(p, a.dir, false); lines.push(`      air ${a.dir ?? ''}+${a.btn} at +${el} ms`); }
    if (shots.length && el >= shots[0]) { const s = shots.shift()!; await p.screenshot({ path: `${OUT}/${SRC}-${slug}-${s}.png` }); }
    if (sc.slam !== false && el >= nextSlam && el <= 2300) { await tapBtn(p, 'A', 60); nextSlam = el + 85; }
    await p.waitForTimeout(25);
  }
  const tEnd0 = Date.now(); while (Date.now() - tEnd0 < 10000) { const t = await text(p); if (/HOLD to run|Pick your PROP|FINAL ROUND|RIVAL ROUND/.test(t) && !/SLAM!|CONFER|CARD/.test(t) && Date.now() - tEnd0 > 1500) break; await p.waitForTimeout(120); }
  const tZ = await now(p);
  const ms = (await marks(p)).slice(m0), R = await rows(p, tA, tZ);
  const has = (re: RegExp) => ms.some((m) => re.test(m.msg));
  const mark = (re: RegExp) => ms.find((m) => re.test(m.msg));
  const made = has(/DUNK-WIN\] contact/);
  const resolveM = mark(/DUNK-WIN\] contact|miss clank|\[LOB\] LOST|CLIPPED/);
  const resolveT = resolveM?.t ?? launchPage + 1700;
  const landM = mark(/HANDS\] land /);
  const clipM = mark(/CLIPPED/); const floorY = clipM && /landed on it/.test(clipM.msg) ? Number(/under ([\d.]+)/.exec(clipM.msg)?.[1] ?? 0) : 0;   // a dunker who caught the roof stands on it
  const flight = R.filter((r) => r.t > launchPage && r.t <= resolveT);
  const tricks = ms.filter((m) => /DUNK-TRICK\] air/.test(m.msg));
  lines.push(`      ${made ? 'MAKE' : 'MISS'} · resolve ${resolveM ? resolveM.msg.slice(0, 40) : 'none'} @+${f0(resolveT - launchPage)} ms · tricks ${tricks.map((m) => m.msg.slice(17)).join(' | ') || 'none'} · cues ${ms.filter((m) => /DUNK-CUE/.test(m.msg)).map((m) => m.msg.slice(11, 70)).join(' | ') || 'none'}`);
  // ── B1: the chest on the rim through the carry-up and at the resolve frame ──
  const carry = flight.filter((r) => r.t >= resolveT - 260);
  const worstCarry = carry.reduce((w, r) => Math.abs(r.chest) > Math.abs(w) ? r.chest : w, 0);
  const atResolve = flight[flight.length - 1];
  const bar = sc.expect.contactWithin ?? 45;
  if (sc.expect.clipped) lines.push(`      (a clipped flight resolves mid-turn: chest ${f0(atResolve?.chest ?? 999)}° at the prop — the latch below is the bar)`);
  else if (atResolve) say(Math.abs(worstCarry) <= bar && Math.abs(atResolve.chest) <= bar, `B1 chest on the rim: last 260 ms worst ${f0(worstCarry)}°, at ${made ? 'CONTACT' : 'the resolve'} chest ${f0(atResolve.chest)}° hips ${f0(atResolve.hips)}° (root yaw − rim bearing ${f0(((atResolve.yaw * 180 / Math.PI - atResolve.rimB + 540) % 360) - 180)}°)`);
  else say(false, 'B1 no flight frames');
  // ── B2: the 360 sweeps through and comes back; continuous ──
  const sweep = flight.reduce((w, r) => Math.max(w, Math.abs(r.chest)), 0);
  let maxStep = 0, stepAt = 0; for (let i = 1; i < flight.length; i++) { const d = Math.abs(((flight[i].chest - flight[i - 1].chest + 540) % 360) - 180); if (d > maxStep) { maxStep = d; stepAt = flight[i].t - launchPage; } }
  if (sc.expect.clipped) say(maxStep < 60, `B2 cut turn: chest sweep ${f0(sweep)}°, max step ${f0(maxStep)}°/frame (no snap through the clip)`);
  else if (sc.expect.spin) say(sweep >= 150 && maxStep < 60, `B2 360 honesty: chest sweep peak ${f0(sweep)}° (≥150 = a real turn), max step ${f0(maxStep)}°/frame at +${f0(stepAt)} ms, back to ${f0(atResolve?.chest ?? 999)}° at the resolve`);
  else say(sweep <= 70 && maxStep < 60, `B1/B2 no-spin flight: chest peak ${f0(sweep)}°, max step ${f0(maxStep)}°/frame`);
  { const back = flight.filter((r) => Math.abs(r.chest) > 135).length; lines.push(`      back-to-rim frames (>135°): ${back} of ${flight.length} in the flight${sc.expect.spin ? ' (the turn passes through)' : ''}`); }
  // ── B3: cue windows ──
  const runs = bannerRuns(R.filter((r) => r.t >= tRun)).filter((b) => b.ms > 0);
  const bannerText = runs.map((b) => b.text).join(' | ');
  if (sc.expect.armed) say(bannerText.includes(sc.expect.armed) && has(/DUNK-CUE\] armed/) && tricks.some((m) => /\(armed/.test(m.msg)), `B3 armed: banner "${sc.expect.armed}" ${bannerText.includes(sc.expect.armed) ? 'seen' : 'MISSING'}, fired on the beat: ${tricks.find((m) => /\(armed/.test(m.msg))?.msg.slice(17, 60) ?? 'no'}`);
  if (sc.expect.late) say(bannerText.includes(sc.expect.late) && has(/DUNK-CUE\] late/) && tricks.length === (sc.expect.tricks ?? 0), `B3 late: banner "${sc.expect.late}" ${bannerText.includes(sc.expect.late) ? 'seen' : 'MISSING'}, tricks fired ${tricks.length}`);
  if (sc.expect.fireAtHang) { const at = Number(/@([\d.]+)/.exec(tricks[0]?.msg ?? '')?.[1] ?? 0); say(at >= 0.68 && at <= 0.78, `B3 scorpion fired at clip ${f2(at)} (the hang = 0.70)`); }
  if (sc.expect.tricks != null && !sc.expect.late) say(tricks.length === sc.expect.tricks || (sc.expect.tricks === 2 && tricks.length === 1 && /NOT ENOUGH AIR/.test(bannerText)), `B3/B4 tricks fired ${tricks.length} (want ${sc.expect.tricks}${sc.expect.tricks === 2 ? ' or 1 + an out-loud NOT ENOUGH AIR' : ''})`);
  if (sc.expect.thirdRefused) say(/TWO TRICKS|NOT ENOUGH AIR|TOO LATE/.test(bannerText), `B4 third press refused out loud: ${/TWO TRICKS|NOT ENOUGH AIR|TOO LATE/.exec(bannerText)?.[0] ?? 'SILENT'}`);
  // ── B4: the hang slow-mo still fires; the air budget still burns ──
  const slow = flight.filter((r) => r.ats < 0.95).length;
  say(slow > 0, `B4 hang slow-mo fired with ${tricks.length} trick(s): ${slow} slowed frames (min scale ${f2(Math.min(1, ...flight.map((r) => r.ats)))})`);
  // ── B5: end pose — a dunk clip every frame from the resolve to feet-down, no T held through the fall, a land ──
  const fall = R.filter((r) => r.t > resolveT && r.t < (landM?.t ?? resolveT + 2500) && r.y > floorY + 0.05);
  const clipless = fall.filter((r) => r.clips.length === 0).length, idleFall = fall.filter((r) => r.clips.some((c) => /^(idle_stand|run|walk)$/.test(c)) && !r.clips.some((c) => /^dunk_|jumpshot/.test(c))).length;
  // the END pose: the last 150 ms before feet-down (a transient flail through the fall is a bail, not a held T)
  const endWin = fall.filter((r) => landM && r.t >= landM.t - 150);
  const tFrames = endWin.filter((r) => r.spread >= 0.95 && Math.abs(r.lhy - r.shy) < 0.22 && Math.abs(r.rhy - r.shy) < 0.22).length;
  const last = fall[fall.length - 1];
  say(!!landM && clipless === 0 && idleFall === 0 && tFrames === 0, `B5 end pose: ${fall.length} fall frames (${clipless} clip-less, ${idleFall} idle, ${tFrames} T-pose) → ${landM ? landM.msg.slice(8) : 'NO LAND'}${last ? ` · held ${[...new Set(fall.slice(-5).flatMap((r) => r.clips))].join(',')} spread ${f2(last.spread)} m hands ${f2(last.lhy)}/${f2(last.rhy)} vs shoulders ${f2(last.shy)}` : ''}`);
  if (sc.expect.spin || sc.expect.clipped) { const preLand = R.filter((r) => r.t > resolveT && r.t < (landM?.t ?? resolveT + 2500)); const endRow = preLand.length ? preLand[preLand.length - 1] : atResolve; const settled = endRow ? Math.abs(endRow.chest) : 999; say(settled <= 45, `B1 latch: chest ${f0(settled)}° at ${fall.length ? 'feet-down' : 'the resolve (no fall: came down on the prop)'}${has(/contact latch/) ? ' (the latch settled a cut turn)' : ''}`); }
  if (sc.expect.clipped) say(has(/CLIPPED/), `clipped the car: ${mark(/CLIPPED/)?.msg.slice(12, 80) ?? 'NO CLIP (the jump cleared it)'}`);
  // after the land: on the floor, upright, idle within ~1 s
  { const after = R.filter((r) => landM && r.t > landM.t + 900 && r.t < landM.t + 1400 && r.hint !== 'RIVAL ROUND'); if (after.length) { const a = after[after.length - 1]; say(a.y < floorY + 0.06 && Math.abs(a.chest) <= 50, `land settle: root y ${f2(a.y)}${floorY ? ` (on the prop at ${f2(floorY)})` : ''}, chest ${f0(a.chest)}°, clips ${a.clips.join(',')}`); } }
  // replay (makes): Euler yaw only (no quaternion), the facing matches the live flight, the tricks re-fire
  if (made) {
    const ra = mark(/HANDS\] replay air/), re = mark(/HANDS\] replay end/);
    if (ra && re) {
      const rep = R.filter((r) => r.t > ra.t && r.t < re.t);
      const rq = rep.filter((r) => r.rq).length; const worst = rep.reduce((w, r) => Math.abs(r.chest) > Math.abs(w) ? r.chest : w, 0);
      const repTricks = ms.filter((m) => /HANDS\] replay trick/.test(m.msg)).length;
      say(rq === 0 && (sc.expect.spin ? repTricks >= 1 && rep.some((r) => Math.abs(r.chest) > 150) : Math.abs(worst) <= 70), `replay: ${rep.length} frames, ${rq} with a rotationQuaternion, chest worst ${f0(worst)}°, tricks re-fired ${repTricks}${sc.expect.spin ? ' (the 360 replays)' : ''}`);
    } else lines.push(`      replay marks: air ${!!ra} end ${!!re}`);
  }
  const judged = /JUDGES (\d+)/.exec(bannerText)?.[1];
  lines.push(`      banners: ${runs.map((b) => `${b.text ? `"${b.text}"` : '∅'} ${Math.round(b.ms)}ms`).join(' → ')}`);
  if (judged) lines.push(`      MISS card: JUDGES ${judged}`);
  lines.push(`      marks: ${ms.filter((m) => !/DUNK-WIN\] (run)/.test(m.msg)).map((m) => `+${f0(m.t - launchPage)} ${m.msg.replace(/^\[[A-Z-]+\] /, '')}`).join(' · ').slice(0, 900)}`);
  if (VERBOSE) { const step = Math.max(1, Math.floor(flight.length / 40)); for (let i = 0; i < flight.length; i += step) { const r = flight[i]; lines.push(`        +${f0(r.t - launchPage)} y ${f2(r.y)} chest ${f0(r.chest)} hips ${f0(r.hips)} yaw-rim ${f0(((r.yaw * 180 / Math.PI - r.rimB + 540) % 360) - 180)} ats ${f2(r.ats)} ${r.clips.join(',')}`); } }
  return lines;
}

(async () => {
  const picked = S.filter((s) => !SCEN || new RegExp(SCEN, 'i').test(s.name));
  const groups: Scenario[][] = []; for (let i = 0; i < picked.length; i += 4) groups.push(picked.slice(i, i + 4));
  const out: string[] = [`DUNK-BIOMECH probe · ${SRC} · port ${PORT} · ${new Date().toISOString()}`];
  let allErrors: string[] = [], allFrames: string[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    if (GROUP != null && gi !== GROUP) continue;
    const { p, close, errors, frames } = await boot();
    curProp = 'none'; curStyle = 'power';
    for (const [k, sc] of groups[gi].entries()) {
      const idx = gi * 4 + k;
      out.push(`\n## ${idx + 1}. ${sc.name}`);
      try { out.push(...await attempt(p, sc, idx)); } catch (e) { out.push(`FAIL  threw: ${String(e).slice(0, 200)}`); }
      console.log(out.slice(-14).join('\n'));
    }
    allErrors = allErrors.concat(errors); allFrames = allFrames.concat(frames);
    await close();
  }
  out.push(`\nconsole errors: ${allErrors.length}${allErrors.length ? '\n  ' + [...new Set(allErrors)].slice(0, 8).join('\n  ') : ''}`);
  out.push(`FEL-FRAME / MISSING CLIP: ${allFrames.length}${allFrames.length ? '\n  ' + [...new Set(allFrames)].slice(0, 6).join('\n  ') : ''}`);
  const pass = out.filter((l) => l.startsWith('PASS')).length, fail = out.filter((l) => l.startsWith('FAIL')).length;
  out.push(`\nTOTAL PASS ${pass} · FAIL ${fail}`);
  writeFileSync(`${OUT}/report-${SRC}.md`, out.join('\n'));
  console.log(out.slice(-4).join('\n'));
})();
