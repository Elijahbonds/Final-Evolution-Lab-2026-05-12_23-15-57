// ONEVONE-DEFENSE-LOGIC probe (2026-09-07) — /dev/mode/onevone through a FAKE Gamepad (installed in getGamepads slot 0
// BEFORE navigation, no gamepadconnected event — the live-pad rule from DUNK-LIVE-INPUT).
//
// Samples EVERY rendered frame for BOTH bodies (hero = __FEL_DEV__.hero(), rival = the nearest other skinned root at bind,
// bound ONCE) + the ball (parent root → possession: H / R / free), the HUD banner + hint (the dev page renders the HUD as
// JSON). An in-page DRIVER plays defence for the hero every frame (the stick is camera-relative — the driver solves the
// pad axes from the camera's flat basis exactly like OneVOneMode.camRel):
//   DENY  — chase the point 1.0 m in front of the rival on the rival→rim line (stay in front)
//   POKE  — tap X when in reach and the rival is moving laterally (the exposure read)
//   BLOCK — cue: tap A when the rival's clip set shows a gather / release clip; time: tap A 1.9 s into the possession;
//           none.
// Offence is scripted: stand still (the AI press strips), or shoot on RT (a miss → the rebound race).
//
// Reports per DEFENSIVE POSSESSION: duration, outcome banner, min hero↔rival distance, in-front fraction (hero between the
// rival and the rim), rival's distance to the rim at release, X taps / steals, A taps / blocks, plus the ANIM-READABILITY
// metrics (no-clip frames, clip fights, pops, arms-down while moving, one-shot visible durations) per body, and MISSING
// CLIP / FEL-FRAME / errors / black frames.
//
// env: BASE (http://localhost:3031) OUT (./shots) TAG CYCLES (4) DENY (1) POKE (1) POKEDELAY (0 ms — a human reads the
//      crossover ~220 ms late) BLOCK (cue|time|none) OFFENCE (still|shoot) MAXMS (90000) TIMELINE (1)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3031';
const OUT = process.env.OUT ?? './shots'; const TAG = process.env.TAG ?? 'onevone';
const CYCLES = Number(process.env.CYCLES ?? 4); const DENY = process.env.DENY !== '0'; const POKE = process.env.POKE !== '0';
const BLOCK = process.env.BLOCK ?? 'cue'; const OFFENCE = process.env.OFFENCE ?? 'still'; const MAXMS = Number(process.env.MAXMS ?? 90000);
const POKEDELAY = Number(process.env.POKEDELAY ?? 0);   // ms of human reaction between the crossover cue and the X tap (0 = a perfect reader)
const POKEON = process.env.POKEON ?? 'cue';   // cue: the rival's crossover clip appears (what a person sees) | lat: any lateral move
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const events: string[] = []; const t0 = Date.now(); let missing = 0, frame = 0, errors = 0;
p.on('console', (m) => { const x = m.text(); if (/MISSING CLIP/.test(x)) missing++; if (/FEL-FRAME/.test(x)) frame++;
  if (m.type() === 'error' && !/401 \(Unauthorized\)|FEL-FRAME/.test(x)) errors++;
  if (/MISSING CLIP|FEL-FRAME|JUICE|1V1|WATCHDOG|error/i.test(x) && !/401/.test(x)) events.push(`${((Date.now() - t0) / 1000).toFixed(2)}s ${x.slice(0, 150)}`); });
p.on('pageerror', (e) => { errors++; events.push(`PAGEERROR ${e.message.slice(0, 170)}`); });
// the pad exists before the page boots — no event is ever dispatched
await p.addInitScript(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
await p.goto(`${BASE}/dev/mode/onevone`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 240000 }); await p.waitForTimeout(9000);
const start = p.locator('text=/^START$/').first(); if (await start.count()) { await start.click(); await p.waitForTimeout(3500); }
const first = (await p.evaluate('document.body.innerText') as string).split('\n').slice(0, 3).join(' | '); console.log('page:', first.slice(0, 160));
await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene;
  const bare = (n) => n.replace(/^mixamorig:/, '').replace(/_c\\d+$/, '').replace(/_p\\d+$/, '');
  window.__BA = { rows: [], black: 0, lum: [], marks: [], clipLen: {}, taps: [] };
  window.__DRV = { deny: false, poke: false, block: 'none', defT0: 0, lastX: 0, lastA: 0, aFired: false, cueSeen: false };
  let roots = [null, null], NN = [null, null], lastLum = 0, ball = null, prevR = null, prevT = 0;
  const topOf = (n) => { let c = n; while (c.parent) c = c.parent; return c; };
  const under = (n, root) => { for (let c = n; c; c = c.parent) if (c === root) return true; return false; };
  const bindOne = (root) => { const node = (name) => s.transformNodes.find((n) => bare(n.name) === name && under(n, root));
    return { LA: node('LeftArm'), LF: node('LeftForeArm'), RA: node('RightArm'), RF: node('RightForeArm'), LH: node('LeftHand'), RH: node('RightHand'), HD: node('Head') }; };
  const bind = () => { const hero = window.__FEL_DEV__.hero(); if (!hero) return; const hr = topOf(hero);
    const hp = hr.getAbsolutePosition(); let best = null, bd = 1e9;
    for (const m of s.meshes) { if (!m.skeleton) continue; const r = topOf(m); if (r === hr) continue; const d = r.getAbsolutePosition().subtract(hp).length(); if (d < bd) { bd = d; best = r; } }
    roots = [hr, best]; NN = [bindOne(hr), best ? bindOne(best) : null]; ball = s.getMeshByName('ball');
    window.__BA.have = [Object.fromEntries(Object.entries(NN[0]).map(([k, v]) => [k, !!v])), NN[1] ? Object.fromEntries(Object.entries(NN[1]).map(([k, v]) => [k, !!v])) : null, best ? best.name : null, !!ball];
    for (const g of s.animationGroups) { if (g.targetedAnimations[0] && under(g.targetedAnimations[0].target, hr)) { const fps = g.targetedAnimations[0].animation.framePerSecond || 60; window.__BA.clipLen[g.name] = +((g.to - g.from) / fps).toFixed(2); } } };
  const wOf = (g) => { const a = g.animatables && g.animatables[0]; if (a && typeof a.weight === 'number') return a.weight < 0 ? 1 : a.weight; return g.isPlaying ? 1 : 0; };
  const sample = (root, N) => { if (!root) return null;
    const V3 = root.position.constructor; const rp = root.getAbsolutePosition();
    const fwd = root.getDirection(new V3(0, 0, 1)); fwd.y = 0; fwd.normalize(); const rx = -fwd.z, rz = fwd.x;
    const rel = (n) => { if (!n) return null; const d = n.getAbsolutePosition().subtract(rp); return [+(d.x * rx + d.z * rz).toFixed(3), +d.y.toFixed(3), +(d.x * fwd.x + d.z * fwd.z).toFixed(3)]; };
    const clips = s.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations[0] && under(g.targetedAnimations[0].target, root)).map((g) => [g.name, +wOf(g).toFixed(2)]);
    return { x: +rp.x.toFixed(3), y: +rp.y.toFixed(3), z: +rp.z.toFixed(3), yaw: +((root.rotation.y * 180) / Math.PI).toFixed(1), clips, lh: rel(N.LH), rh: rel(N.RH) }; };
  const RIM = { x: 0, z: -0.6 };
  s.onAfterRenderObservable.add(() => {
    const h = window.__FEL_DEV__.hero(); if (!h) return; if (!roots[0] || roots[0].isDisposed()) bind(); if (!roots[0]) return;
    const now = performance.now();
    if (now - lastLum > 1000) { lastLum = now; try { const e = s.getEngine(); const w = 48, hh = 27; const pr = e.readPixels(0, 0, w, hh); Promise.resolve(pr).then((buf) => { const d = new Uint8Array(buf.buffer || buf); let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; const mean = sum / (d.length / 4) / 3; window.__BA.lum.push(+mean.toFixed(1)); if (mean < 6) window.__BA.black++; }).catch(() => {}); } catch (e) {} }
    const H = sample(roots[0], NN[0]), R = sample(roots[1], NN[1]);
    let poss = 'free', bp = null;
    if (ball && !ball.isDisposed()) { const bq = ball.getAbsolutePosition(); bp = [+bq.x.toFixed(2), +bq.y.toFixed(2), +bq.z.toFixed(2)];
      if (ball.parent) { const pr = topOf(ball); poss = pr === roots[0] ? 'H' : pr === roots[1] ? 'R' : 'other'; }
      else if (!(ball.metadata && ball.metadata.felReleased) && H && R) { const dh = Math.hypot(bq.x - H.x, bq.z - H.z), dr = Math.hypot(bq.x - R.x, bq.z - R.z); if (Math.min(dh, dr) < 1.3) poss = dh <= dr ? 'H' : 'R'; } }   // the live dribble un-parents the ball (ballCarry) — nearest body owns it
    const txt = document.body.innerText; const bm = /"banner":\\s*"([^"]*)"/.exec(txt); const hm = /"hint":\\s*"([^"]*)"/.exec(txt);
    window.__BA.rows.push({ t: now, H, R, poss, bp, banner: bm ? bm[1] : '', hint: hm ? hm[1].slice(0, 40) : '' });
    // ── the driver: defence every frame ──
    const D = window.__DRV; const pad = window.__PAD;
    if (H && R && poss === 'R') {
      if (!D.defT0) { D.defT0 = now; D.aFired = false; D.cueSeen = false; }
      const V3 = roots[0].position.constructor; const cam = s.activeCamera;
      const f = cam.getDirection(new V3(0, 0, 1)); f.y = 0; f.normalize(); const r = cam.getDirection(new V3(1, 0, 0)); r.y = 0; r.normalize();
      const toRim = { x: RIM.x - R.x, z: RIM.z - R.z }; const L = Math.hypot(toRim.x, toRim.z) || 1; toRim.x /= L; toRim.z /= L;
      const deny = { x: R.x + toRim.x * 1.0, z: R.z + toRim.z * 1.0 };
      const d = { x: deny.x - H.x, z: deny.z - H.z }; const dl = Math.hypot(d.x, d.z);
      if (D.deny) { if (dl > 0.2) { const k = Math.min(1, dl / 0.6) / dl; const wx = d.x * k, wz = d.z * k; const mx = wx * r.x + wz * r.z, my = wx * f.x + wz * f.z; pad.axes[0] = Math.max(-1, Math.min(1, mx)); pad.axes[1] = Math.max(-1, Math.min(1, -my)); } else { pad.axes[0] = 0; pad.axes[1] = 0; } }
      const dist = Math.hypot(H.x - R.x, H.z - R.z);
      const dt = prevR ? (now - prevT) / 1000 : 0; const lat = prevR && dt > 0 ? Math.abs(((R.x - prevR.x) * toRim.z - (R.z - prevR.z) * toRim.x) / dt) : 0;
      const crossCue = R.clips.some((c) => /bball_crossover/.test(c[0]) && c[1] > 0.15);
      const pokeCue = D.pokeOn === 'cue' ? crossCue : lat > 1.2;
      if (D.poke && dist < 1.55 && pokeCue && now - D.lastX > 650) { D.lastX = now; setTimeout(() => { const bt = pad.buttons[2]; bt.pressed = true; bt.value = 1; setTimeout(() => { bt.pressed = false; bt.value = 0; }, 70); window.__BA.taps.push({ t: performance.now(), btn: 'X', dist: +dist.toFixed(2), lat: +lat.toFixed(2) }); }, D.pokeDelay || 0); }
      const cue = R.clips.some((c) => /gather|jumpshot|bball_shoot|layup/.test(c[0]) && c[1] > 0.2);
      if (cue) D.cueSeen = true;
      const want = D.block === 'cue' ? cue : D.block === 'time' ? now - D.defT0 > 1900 : false;
      if (want && !D.aFired && dist < 2.2) { D.aFired = true; D.lastA = now; const bt = pad.buttons[0]; bt.pressed = true; bt.value = 1; setTimeout(() => { bt.pressed = false; bt.value = 0; }, 70); window.__BA.taps.push({ t: now, btn: 'A', dist: +dist.toFixed(2), cue }); }
    } else if (D.defT0) { D.defT0 = 0; if (D.deny) { pad.axes[0] = 0; pad.axes[1] = 0; } }
    if (R) { prevR = { x: R.x, z: R.z }; prevT = now; }
  });
})()`);
const ev = (code: string) => p.evaluate(code);
const setRT = (v: number) => ev(`(() => { const bt = window.__PAD.buttons[7]; bt.value = ${v}; bt.pressed = ${v > 0.5}; })()`);
const mark = (label: string) => ev(`window.__BA.marks.push({ t: performance.now(), label: ${JSON.stringify(label)} })`);
const poss = async () => (await ev(`(() => { const r = window.__BA.rows; return r.length ? r[r.length - 1].poss : 'none'; })()`)) as string;
const banner = async () => (await ev(`(() => { const r = window.__BA.rows; return r.length ? r[r.length - 1].banner : ''; })()`)) as string;
const until = async (pred: () => Promise<boolean>, maxMs: number) => { const t = Date.now(); while (Date.now() - t < maxMs) { if (await pred()) return true; await p.waitForTimeout(60); } return false; };
await ev(`Object.assign(window.__DRV, { deny: ${DENY}, poke: ${POKE}, block: ${JSON.stringify(BLOCK)}, pokeDelay: ${POKEDELAY}, pokeOn: ${JSON.stringify(POKEON)} })`);
console.log(`driver: deny=${DENY} poke=${POKE} pokeOn=${POKEON} pokeDelay=${POKEDELAY} block=${BLOCK} offence=${OFFENCE} cycles=${CYCLES}`);
const tStart = Date.now();
for (let c = 0; c < CYCLES && Date.now() - tStart < MAXMS; c++) {
  await mark(`cycle ${c + 1}: offence (${OFFENCE})`);
  // offence: wait until I hold the ball, then give it away
  await until(async () => (await poss()) === 'H', 6000);
  if (OFFENCE === 'shoot') { await p.waitForTimeout(600); await setRT(0.8); await p.waitForTimeout(120); await setRT(0); }
  const got = await until(async () => (await poss()) === 'R', OFFENCE === 'shoot' ? 6000 : 14000);
  if (!got) { if (OFFENCE !== 'shoot') { await setRT(0.8); await p.waitForTimeout(120); await setRT(0); } if (!(await until(async () => (await poss()) === 'R', 6000))) { await mark('no defensive possession reached'); continue; } }
  await mark(`cycle ${c + 1}: DEFENCE`);
  // defence: the driver plays; wait for the possession to resolve (ball back in my hands, or a settled banner)
  if (c === 0) { await p.waitForTimeout(1100); await p.screenshot({ path: `${OUT}/${TAG}-defence.png` }); }   // mid-drive: the rival attacking, the hero set
  const done = await until(async () => (await poss()) === 'H', 12000);
  await mark(`cycle ${c + 1}: resolved=${done} banner=${await banner()}`);
  await p.waitForTimeout(400);
}
await ev(`Object.assign(window.__DRV, { deny: false, poke: false, block: 'none' }); window.__PAD.axes[0] = 0; window.__PAD.axes[1] = 0;`);
type S = { x: number; y: number; z: number; yaw: number; clips: [string, number][]; lh: number[] | null; rh: number[] | null };
type Row = { t: number; H: S | null; R: S | null; poss: string; bp: number[] | null; banner: string; hint: string };
const data = await ev(`window.__BA`) as { rows: Row[]; have: unknown; black: number; lum: number[]; marks: { t: number; label: string }[]; clipLen: Record<string, number>; taps: { t: number; btn: string; dist: number; lat?: number; cue?: boolean }[] };
fs.writeFileSync(`${OUT}/${TAG}-rows.json`, JSON.stringify(data));
const rows = data.rows; console.log(`nodes: ${JSON.stringify(data.have)} frames: ${rows.length} over ${((rows[rows.length - 1].t - rows[0].t) / 1000).toFixed(1)}s`);
console.log('clip lengths:', JSON.stringify(data.clipLen));
const T0 = rows[0].t; const fmt = (t: number) => ((t - T0) / 1000).toFixed(2);
// ── banner timeline ──
console.log('--- banners'); { let last = ''; for (const r of rows) { if (r.banner !== last) { if (r.banner) console.log(`   ${fmt(r.t)}s ${r.banner}`); last = r.banner; } } }
console.log('--- marks'); for (const m of data.marks) console.log(`   ${fmt(m.t)}s ${m.label}`);
console.log('--- taps'); for (const t of data.taps) console.log(`   ${fmt(t.t)}s ${t.btn} dist ${t.dist}${t.lat !== undefined ? ' lat ' + t.lat : ''}${t.cue !== undefined ? ' cue ' + t.cue : ''}`);
// ── defensive possessions ──
const RIM = { x: 0, z: -0.6 };
type Poss = { i0: number; i1: number };
const posses: Poss[] = []; { let cur: Poss | null = null, freeRun = 0; for (let i = 0; i < rows.length; i++) { const r = rows[i]; if (r.poss === 'R') { freeRun = 0; if (!cur) cur = { i0: i, i1: i }; else cur.i1 = i; } else if (cur && (r.poss === 'H' || ++freeRun > 20)) { posses.push(cur); cur = null; freeRun = 0; } } if (cur) posses.push(cur); }
console.log(`--- defensive possessions: ${posses.length}`);
let steals = 0, blocks = 0, theirMakes = 0, theirMisses = 0, inFrontAll = 0, frontFrames = 0;
for (const ps of posses) {
  const seg = rows.slice(ps.i0, ps.i1 + 1).filter((r) => r.H && r.R);
  if (!seg.length) continue;
  let minD = 1e9, front = 0; for (const r of seg) { const H = r.H!, R = r.R!; const d = Math.hypot(H.x - R.x, H.z - R.z); minD = Math.min(minD, d); const tr = { x: RIM.x - R.x, z: RIM.z - R.z }; const L = Math.hypot(tr.x, tr.z) || 1; const hx = H.x - R.x, hz = H.z - R.z; const along = (hx * tr.x + hz * tr.z) / L; const side = Math.abs((hx * tr.z - hz * tr.x) / L); if (along > 0 && along < 2.4 && side < 0.9) front++; }
  frontFrames += front; inFrontAll += seg.length;
  // the release: the last frame the rival held the ball → the rival's distance to the rim there
  const last = seg[seg.length - 1]; const relD = Math.hypot(last.R!.x - RIM.x, last.R!.z - RIM.z);
  // outcome = the first non-empty banner after the possession's last frame (within 2 s), else the banner at the end
  let out = ''; for (let i = ps.i1; i < rows.length && rows[i].t - rows[ps.i1].t < 2500; i++) { if (rows[i].banner && !/DEFEND|THEIR BALL|HESI|BIT ON/.test(rows[i].banner)) { out = rows[i].banner; break; } }
  if (/PICKED/.test(out)) steals++; if (/REJECTED/.test(out)) blocks++; if (/THEY SCORE/.test(out)) theirMakes++; if (/BOARD/.test(out)) theirMisses++;
  const taps = data.taps.filter((t) => t.t >= rows[ps.i0].t && t.t <= rows[ps.i1].t + 300);
  const heroClips = new Set(seg.flatMap((r) => r.H!.clips.filter((c) => c[1] > 0.5).map((c) => c[0]))); const rivalClips = new Set(seg.flatMap((r) => r.R!.clips.filter((c) => c[1] > 0.5).map((c) => c[0])));
  console.log(`   ${fmt(rows[ps.i0].t)}–${fmt(rows[ps.i1].t)}s (${((rows[ps.i1].t - rows[ps.i0].t) / 1000).toFixed(2)}s) minDist ${minD.toFixed(2)} inFront ${(front / seg.length * 100).toFixed(0)}% releaseDistToRim ${relD.toFixed(2)} taps X${taps.filter((t) => t.btn === 'X').length} A${taps.filter((t) => t.btn === 'A').length} → ${out || '(no banner)'}`);
  console.log(`      hero clips: ${[...heroClips].join(', ')} | rival clips: ${[...rivalClips].join(', ')}`);
}
console.log(`   totals: steals ${steals} blocks ${blocks} theirMakes ${theirMakes} theirMisses(board) ${theirMisses} inFront ${inFrontAll ? (frontFrames / inFrontAll * 100).toFixed(0) : 0}% of defensive frames`);
// ── anim readability per body ──
const LOOPS = new Set(['bball_dribble_idle', 'bball_dribble_run', 'run', 'walk', 'idle_stand', 'bball_defend_slide_left', 'bball_defend_slide_right', 'bball_defend_stance', 'run_forward', 'dunk_charge_gather', 'bball_shoot_jumper', 'jumpshot', 'guard', 'karate_floor_hold']);
const mean = (v: number[]) => v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN;
function report(who: 'H' | 'R', only?: (r: Row) => boolean): void {
  const rs = rows.filter((r) => r[who] && (!only || only(r))).map((r) => ({ t: r.t, s: r[who]! }));
  if (!rs.length) { console.log(`=== ${who}: no samples`); return; }
  console.log(`=== ${who === 'H' ? 'HERO' : 'RIVAL'}${only ? ' (defence only)' : ''} (${rs.length} frames)`);
  if (process.env.TIMELINE !== '0' && !only) { const tl: { t: number; set: string; dur: number; n: number }[] = [];
    for (const r of rs) { const key = r.s.clips.map((c) => c[0]).sort().join('+') || '(none)'; const last = tl[tl.length - 1]; if (last && last.set === key) { last.dur = r.t - last.t; last.n++; } else tl.push({ t: r.t, set: key, dur: 0, n: 1 }); }
    console.log('--- timeline (t, clips, dur)'); let mi = 0; for (const e of tl) { while (who === 'H' && mi < data.marks.length && data.marks[mi].t <= e.t) { console.log(`   ▶ ${fmt(data.marks[mi].t)} ${data.marks[mi].label}`); mi++; } console.log(`   ${fmt(e.t)}s ${e.set}  ${(e.dur / 1000).toFixed(2)}s (${e.n}f)`); } }
  let noClip = 0, lowW = 0; const noClipAt: string[] = []; for (const r of rs) { const tot = r.s.clips.reduce((s, c) => s + c[1], 0); if (r.s.clips.length === 0) { noClip++; if (noClipAt.length < 6) noClipAt.push(fmt(r.t)); } else if (tot < 0.05) { lowW++; if (noClipAt.length < 6) noClipAt.push(fmt(r.t) + 'w'); } }
  let fightRun = 0, fightMax = 0, fightSegs = 0; const fightAt: string[] = [];
  for (let i = 0; i < rs.length; i++) { const heavy = rs[i].s.clips.filter((c) => c[1] > 0.35); if (heavy.length >= 2) { fightRun++; if (fightRun === 19 && fightAt.length < 6) fightAt.push(`${fmt(rs[i].t)} ${heavy.map((c) => c[0]).join('+')}`); } else { if (fightRun > 18) fightSegs++; fightMax = Math.max(fightMax, fightRun); fightRun = 0; } }
  let pops = 0; const popAt: string[] = [];
  for (let i = 1; i < rs.length; i++) { const r = rs[i].s, q = rs[i - 1].s; if (!r.lh || !q.lh || !r.rh || !q.rh) continue; if (rs[i].t - rs[i - 1].t > 80) continue; const tele = Math.hypot(r.x - q.x, r.z - q.z) > 1.0 || Math.abs(r.yaw - q.yaw) > 25; if (tele) continue;
    const d = Math.max(Math.hypot(r.lh[0] - q.lh[0], r.lh[1] - q.lh[1], r.lh[2] - q.lh[2]), Math.hypot(r.rh[0] - q.rh[0], r.rh[1] - q.rh[1], r.rh[2] - q.rh[2])); if (d > 0.22) { pops++; if (popAt.length < 8) popAt.push(`${fmt(rs[i].t)} ${d.toFixed(2)}m ${q.clips.map((c) => c[0]).join('+')}→${r.clips.map((c) => c[0]).join('+')}`); } }
  const moving: S[] = []; let idleMoving = 0;
  for (let i = 1; i < rs.length; i++) { const r = rs[i].s, q = rs[i - 1].s; const sp = Math.hypot(r.x - q.x, r.z - q.z) / ((rs[i].t - rs[i - 1].t) / 1000); if (sp > 1.5 && sp < 40) { moving.push(r); if (r.clips.some((c) => c[0] === 'idle_stand' && c[1] > 0.5)) idleMoving++; } }
  const hUp = mean(moving.flatMap((r) => (r.lh && r.rh ? [r.lh[1], r.rh[1]] : [])));
  const armsDown = moving.filter((r) => r.lh && r.rh && r.lh[1] < 0.95 && r.rh[1] < 0.95 && Math.abs(r.lh[0]) < 0.35 && Math.abs(r.rh[0]) < 0.35).length;
  const shots: Record<string, number[]> = {}; let cur: { name: string; t: number } | null = null;
  for (const r of rs) { const os = r.s.clips.find((c) => !LOOPS.has(c[0]) && c[1] > 0.35); const name = os ? os[0] : null;
    if (cur && name !== cur.name) { (shots[cur.name] ??= []).push((r.t - cur.t) / 1000); cur = null; }
    if (name && !cur) cur = { name, t: r.t }; }
  if (cur) (shots[cur.name] ??= []).push((rs[rs.length - 1].t - cur.t) / 1000);
  const shotLine = Object.entries(shots).map(([n, v]) => `${n}(len ${data.clipLen[n] ?? '?'}s): ${v.slice(0, 12).map((x) => x.toFixed(2)).join(',')}`).join(' | ');
  console.log('--- readability');
  console.log(`   no-clip frames: ${noClip} (weight<0.05: ${lowW}) ${noClipAt.join(' ')}`);
  console.log(`   clip fights (≥2 clips >0.35): runs>0.3s=${fightSegs} longest=${fightMax}f  at: ${fightAt.join(' | ')}`);
  console.log(`   pops (hand jump >0.22 m/frame, non-teleport): ${pops}  ${popAt.join(' | ')}`);
  console.log(`   moving frames ${moving.length}: hands up=${hUp.toFixed(2)}  arms-down frames=${armsDown}  idle_stand while moving=${idleMoving}`);
  console.log(`   one-shots visible: ${shotLine}`);
}
report('H'); report('R'); report('H', (r) => r.poss === 'R'); report('R', (r) => r.poss === 'R');
console.log(`MISSING CLIP ${missing} · FEL-FRAME ${frame} · errors ${errors} · black frames ${data.black}/${data.lum.length} (lum ${data.lum.slice(0, 12).join(',')}…)`);
console.log('events:', JSON.stringify(events.slice(0, 40)));
await b.close();
