// _hoops-lab — one competent player, N possessions, and everything the mode says about each one.
//
// THE 10-PHASE PASS ON 1v1 AND 3v3 (owner, 2026-09-16) needs an instrument before it needs an opinion, exactly as the
// dunk pass did. The scorecard capture plays a verb a second and tells you whether presses were answered; it cannot
// tell you whether the shot you released on the green went in, what the defender did about it, or whether a game ever
// reaches eleven. This drives the mode the way somebody who knows it drives it — carry, attack, gather, release — and
// records, per possession:
//
//   the shot        (meter value at release, shot type, made/missed, points)
//   the defender    ([1V1-DEF] / [1V1-CONTACT]: contest, block, strip, the hand up)
//   the ball        ([1V1-BOARD] / [1V1-RIM]: the rebound, the putback, the loose ball)
//   the whistle     ([1V1-REF]: fouls, violations)
//   the score       (both ends, and whether the game ends)
//
// WHAT THE FIRST RUNS ESTABLISHED, before this could measure a single shot:
//
//   1v1 PLAYS MAKE-IT-TAKE-IT, AND IT IS MERCILESS. An idle player never touches the ball: the AI scores, keeps it
//   (`MAKE IT, TAKE IT — DEFEND!`), scores again. Twelve unanswered points in about thirty seconds against a player
//   who does nothing. That is correct behaviour and worth knowing on its own — there is no mercy rule, no reset, and
//   nothing that hands the ball over.
//
//   THE MODE'S PROBE SEAM IS DEV-ONLY. `scene.metadata.onevone` — `defend()`, `offense()`, the possession machine —
//   is built inside `if (process.env.NODE_ENV === 'development')`, so it does not exist in the production build a
//   `next start` serves. A probe cannot take a possession here; it has to EARN one by playing defence, which is the
//   honest instrument anyway and is what the next phase of this needs.
//
//   BASE=http://127.0.0.1:3096 MODE=onevone POSSESSIONS=6 RELEASE=green npx tsx scripts/probes/_hoops-lab.mts
//   RELEASE=green|early|late  — where in the meter the shot goes up (the A/B rig for shot timing)
//   MODE=onevone|threevthree
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3096';
const MODE = process.env.MODE ?? 'onevone';
const POSSESSIONS = Number(process.env.POSSESSIONS ?? 6);
const RELEASE = (process.env.RELEASE ?? 'green') as 'green' | 'early' | 'late';
/** How long to try to earn a stop before giving the possession up as lost. */
const DEFEND_MS = Number(process.env.DEFEND_MS ?? 30000);
const TAG = process.env.TAG ?? `hoops-${MODE}`;
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/hoops`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
const page = await ctx.newPage();
await page.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const log: string[] = [];
page.on('console', (m) => { const t = m.text(); if (/\[1V1|\[3V3|\[HOOPS|\[REF|\[BOARD/.test(t)) log.push(`${Date.now()} ${t.slice(0, 190)}`); });

{ // login
  const lp = await ctx.newPage();
  await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  if (/\/login/.test(lp.url())) {
    await lp.fill('input[type="email"]', process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
    await lp.fill('input[type="password"]', process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
    await lp.click('button[type="submit"]');
    const t = Date.now(); while (Date.now() - t < 30000 && /\/login/.test(lp.url())) await lp.waitForTimeout(300);
  }
  await lp.close();
}
await page.goto(`${BASE}/play/${MODE}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
{ const t = Date.now(); while (Date.now() - t < 180000) { const s = await page.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded' || s === 'playing') break; await page.waitForTimeout(400); } }

// THE PAD, AND THE RELEASE ARMED IN THE PAGE. A shot meter is a number that moves every frame; polling it from node
// costs 30–50 ms a round trip, which is most of a green window. The release is decided in the page, on the frame it
// means to be, and records the meter value it actually let go on — the same lesson the dunk lab learned about SLAM.
await page.evaluate(`(() => {
  const pad = { index: 0, id: 'fake', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  window.dispatchEvent(new Event('gamepadconnected'));
  window.__hudNow = () => { const q = window.__FEL_QA__; return q && q.rawHud ? q.rawHud() : {}; };

  window.__HUD = []; let last = '';
  setInterval(() => {
    const h = window.__hudNow();
    const s = JSON.stringify([h.score, h.foeScore, h.banner, h.shotType, h.hint]);
    if (s !== last) { last = s; window.__HUD.push({ t: Date.now(), score: h.score, foeScore: h.foeScore, banner: h.banner, shotType: h.shotType, hint: h.hint }); }
  }, 50);

  // the shot: hold the trigger to gather, let go at the target point of the meter
  window.__shotAt = null;
  window.__armRelease = (where) => {
    window.__shotAt = null;
    const t0 = performance.now();
    const trig = () => window.__PAD.buttons[7];
    const setTrig = (v) => { const b = trig(); b.pressed = v > 0.5; b.value = v; window.__PAD.timestamp = Date.now(); };
    setTrig(1);
    const want = where === 'green' ? 0.82 : where === 'early' ? 0.45 : 0.98;
    const tick = () => {
      if (performance.now() - t0 > 3500) { setTrig(0); return; }
      const h = window.__hudNow();
      const m = typeof h.shotMeterT === 'number' ? h.shotMeterT : 0;
      if (m >= want) { window.__shotAt = { meter: +m.toFixed(3), type: h.shotType || '' }; setTrig(0); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
})()`);
// ── THE DEFENDER ──────────────────────────────────────────────────────────────────────────────────────────────────
//
// The mode's own probe seam is dev-only, so on a production build a possession has to be EARNED. The mode also tells
// you exactly how, in the defence hint it puts on screen: "STAY IN FRONT — they sidestep, you slide · X: STEAL as the
// ball crosses over · A: JUMP on the gather to BLOCK · hold L1/LT: BOX OUT". This does that, on a rAF loop in the page
// because defence is a per-frame job and a 40 ms round trip from node is half a crossover.
//
// STAY IN FRONT means between the man and the rim — not next to him. Each frame it aims for the point one stride up
// the line from the attacker toward the basket, and steers there in CAMERA space, because that is the space the stick
// is read in (the codebase's own rule: up on the stick is −y, and the run follows the camera's right).
await page.evaluate(`(() => {
  const RIM = { x: 0, z: -0.6 };
  const flat = (v) => { const l = Math.hypot(v.x, v.z) || 1; return { x: v.x / l, z: v.z / l }; };
  window.__DEF = { on: false, stops: 0, contests: 0, steals: 0, lastHint: '', diag: null, frames: 0 };

  const bodies = () => {
    const q = window.__FEL_QA__; const scene = q && q.scene ? q.scene() : null;
    if (!scene) return null;
    const mine = q.hero ? q.hero() : null;
    let myRoot = mine; while (myRoot && myRoot.parent) myRoot = myRoot.parent;
    // the character roots are the parents of the skinned meshes; in 1v1 there are two of them
    const roots = [];
    for (const m of scene.meshes) {
      if (!m.skeleton) continue;
      let r = m; while (r.parent) r = r.parent;
      if (!roots.includes(r)) roots.push(r);
    }
    const foe = roots.find((r) => r !== myRoot) || null;
    return { scene, me: myRoot, foe, count: roots.length };
  };

  window.__defenceOn = () => {
    if (window.__DEF.on) return true;
    const b = bodies(); if (!b || !b.me || !b.foe) return false;
    window.__DEF.on = true;
    const pad = window.__PAD;
    const setStick = (x, y) => { pad.axes[0] = x; pad.axes[1] = y; pad.timestamp = Date.now(); };
    const tap = (i, ms) => { const btn = pad.buttons[i]; btn.pressed = true; btn.value = 1; pad.timestamp = Date.now();
      setTimeout(() => { btn.pressed = false; btn.value = 0; pad.timestamp = Date.now(); }, ms || 70); };
    let lastContest = 0, lastSteal = 0;
    const tick = () => {
      if (!window.__DEF.on) { setStick(0, 0); return; }
      const bb = bodies();
      const h = window.__hudNow();
      window.__DEF.lastHint = h.hint || '';
      window.__DEF.frames++;
      if (!bb || !bb.me || !bb.foe) { window.__DEF.diag = { err: 'no bodies', me: !!(bb && bb.me), foe: !!(bb && bb.foe), roots: bb ? bb.count : -1 }; requestAnimationFrame(tick); return; }
      const me = bb.me.position, foe = bb.foe.position;
      // the spot one stride up the line from the attacker to the rim: in front of him, not beside him
      const toRim = flat({ x: RIM.x - foe.x, z: RIM.z - foe.z });
      const want = { x: foe.x + toRim.x * 1.15, z: foe.z + toRim.z * 1.15 };
      const d = flat({ x: want.x - me.x, z: want.z - me.z });
      const dist = Math.hypot(want.x - me.x, want.z - me.z);
      const cam = bb.scene.activeCamera;
      if (cam && dist > 0.12) {
        // the camera's basis, flattened, straight off its world matrix (no Vector3 constructor needed in the page)
        const m = cam.getWorldMatrix().m;
        const right = flat({ x: m[0], z: m[2] });
        const fwd = flat({ x: m[8], z: m[10] });
        const sx = d.x * right.x + d.z * right.z;
        const sy = d.x * fwd.x + d.z * fwd.z;
        setStick(Math.max(-1, Math.min(1, sx)), Math.max(-1, Math.min(1, -sy)));
      } else setStick(0, 0);

      const now = performance.now();
      const foeToRim = Math.hypot(RIM.x - foe.x, RIM.z - foe.z);
      const gap = Math.hypot(foe.x - me.x, foe.z - me.z);
      window.__DEF.diag = { gap: +gap.toFixed(2), foeToRim: +foeToRim.toFixed(2), dist: +dist.toFixed(2),
        me: [+me.x.toFixed(2), +me.z.toFixed(2)], foe: [+foe.x.toFixed(2), +foe.z.toFixed(2)],
        stick: [+pad.axes[0].toFixed(2), +pad.axes[1].toFixed(2)] };
      // A: jump on the gather — he is at the rim and I am close enough for it to be a contest, not a foul from behind
      if (foeToRim < 2.8 && gap < 1.9 && now - lastContest > 1400) { lastContest = now; window.__DEF.contests++; tap(0, 90); }
      // X: reach as he works — the mode refuses it beyond 1.7 m, so only inside that
      else if (gap < 1.55 && now - lastSteal > 900) { lastSteal = now; window.__DEF.steals++; tap(2, 70); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  };
  window.__defenceOff = () => { window.__DEF.on = false; const p = window.__PAD; p.axes[0] = 0; p.axes[1] = 0; p.timestamp = Date.now(); };
})()`);

const startBtn = page.locator('text=/^(TAP TO START|START|PLAY)$/').first();
if (await startBtn.count()) await startBtn.first().click().catch(() => {});
await page.waitForTimeout(2500);

const stick = async (x: number, y: number) => page.evaluate(`(() => { const p = window.__PAD; p.axes[0] = ${x}; p.axes[1] = ${y}; p.timestamp = Date.now(); })()`);
const press = async (i: number, ms = 70) => {
  await page.evaluate(`(() => { const b = window.__PAD.buttons[${i}]; b.pressed = true; b.value = 1; window.__PAD.timestamp = Date.now(); })()`);
  await page.waitForTimeout(ms);
  await page.evaluate(`(() => { const b = window.__PAD.buttons[${i}]; b.pressed = false; b.value = 0; window.__PAD.timestamp = Date.now(); })()`);
};

interface Poss { n: number; defence?: { sec: number; contests: number; steals: number; earned: boolean }; meter?: number; shotType?: string; made?: boolean; scored?: number; score?: number; foeScore?: number; banners: string[]; beats: string[]; note?: string }
const rows: Poss[] = [];
let logMark = 0;

for (let n = 0; n < POSSESSIONS; n++) {
  const mark = Date.now();
  const p: Poss = { n: n + 1, banners: [], beats: [] };

  // TAKE THE POSSESSION THROUGH THE MODE'S OWN SEAM. The first two runs of this drove and pulled the trigger while on
  // DEFENCE, measured nothing, and reported it as four missed shots — with the AI scoring twelve unanswered behind it.
  // That is not a bug in the mode: 1v1 plays make-it-take-it (`MAKE IT, TAKE IT — DEFEND!`), so an idle player
  // concedes for ever and never touches the ball, which is correct and is worth knowing on its own. The mode already
  // exposes `scene.metadata.onevone.defend()` / `.offense()` for exactly this — "so a probe can reach either
  // possession deterministically".
  // EARN THE POSSESSION. The hint is the possession readout: the defence one starts "STAY IN FRONT", the offence one
  // "Drive fast at the rim". Play defence until it flips.
  const beforeScore = await page.evaluate('(window.__hudNow().score ?? 0)') as number;
  const beforeFoe = await page.evaluate('(window.__hudNow().foeScore ?? 0)') as number;
  let onOffense = await page.evaluate(`/^Drive fast/.test(window.__hudNow().hint || '')`) as boolean;
  if (!onOffense) {
    await page.evaluate('window.__defenceOn && window.__defenceOn()');
    const t0 = Date.now();
    while (Date.now() - t0 < DEFEND_MS) {
      if (await page.evaluate(`/^Drive fast/.test(window.__hudNow().hint || '')`)) { onOffense = true; break; }
      await page.waitForTimeout(150);
    }
    const def = await page.evaluate('window.__DEF') as { contests: number; steals: number; frames: number; diag: unknown };
    if (def) p.beats.push(`def diag ${def.frames} frames :: ${JSON.stringify(def.diag)}`);
    await page.evaluate('window.__defenceOff && window.__defenceOff()');
    p.defence = { sec: +((Date.now() - t0) / 1000).toFixed(1), contests: def?.contests ?? 0, steals: def?.steals ?? 0, earned: onOffense };
    p.beats.push(`defence ${p.defence.sec}s · ${p.defence.contests} contests · ${p.defence.steals} reaches · ${onOffense ? 'STOP EARNED' : 'no stop'}`);
  }
  if (!onOffense) p.note = 'could not earn a stop';
  await page.waitForTimeout(400);

  // CARRY IT AT THE RIM. Up-court is −y on the stick; a couple of seconds of drive puts a shot inside the arc.
  await stick(0, -1);
  await page.waitForTimeout(1600);
  await stick(0, 0);

  await page.evaluate(`window.__armRelease(${JSON.stringify(RELEASE)})`);
  { const t = Date.now(); while (Date.now() - t < 4000) { if (await page.evaluate('window.__shotAt !== null')) break; await page.waitForTimeout(40); } }
  const shot = await page.evaluate('window.__shotAt') as { meter: number; type: string } | null;
  if (shot) { p.meter = shot.meter; p.shotType = shot.type; }
  else p.note = p.note ?? 'the meter never reached the release point';

  await page.waitForTimeout(3200);   // the arc, the board, the whistle

  const hud = await page.evaluate('window.__HUD') as { t: number; score?: number; foeScore?: number; banner?: string }[];
  const mine = hud.filter((r) => r.t >= mark);
  p.banners = [...new Set(mine.map((r) => r.banner).filter((b): b is string => !!b))];
  p.score = mine.map((r) => r.score).filter((s): s is number => typeof s === 'number').pop();
  p.foeScore = mine.map((r) => r.foeScore).filter((s): s is number => typeof s === 'number').pop();
  const fresh = log.slice(logMark); logMark = log.length;
  p.beats = fresh.map((l) => l.replace(/^\d+ /, '')).slice(0, 12);
  // MADE means MY score went up. The first run of this matched the banner "THEY SCORE — LEFT WIDE OPEN" and reported
  // the opponent's buckets as the player's.
  const afterScore = await page.evaluate('(window.__hudNow().score ?? 0)') as number;
  p.made = afterScore > beforeScore;
  p.scored = afterScore - beforeScore;
  rows.push(p);
  console.log(`#${p.n} meter ${String(p.meter ?? '—').padEnd(6)} ${String(p.shotType ?? '').padEnd(10)} ${p.made ? 'MADE ' : 'miss '} ${p.score ?? '?'}-${p.foeScore ?? '?'}  ${p.banners.slice(0, 2).join(' / ')}`);
  if (n < 2) await page.screenshot({ path: `${OUT}/${TAG}-poss${p.n}.png` });
}

const made = rows.filter((r) => r.made).length;
const out = { tag: TAG, mode: MODE, release: RELEASE, possessions: rows.length, made, rows, log: log.slice(-160) };
fs.writeFileSync(`${OUT}/hoops-lab-${TAG}.json`, JSON.stringify(out, null, 1));
console.log(`\n${rows.length} possessions · ${made} made · release=${RELEASE} · ${OUT}/hoops-lab-${TAG}.json`);
await browser.close();
