// _hoops-lab — one competent player, N possessions, and everything the mode says about each one.
//
// THE 10-PHASE PASS ON 1v1 AND 3v3 (owner, 2026-09-16). Like the dunk pass, the instrument comes before the opinion.
//
// IT DRIVES THROUGH THE AGENT BRIDGE, AND NOT KNOWING THAT COST A DAY. These modes build their player slot as
//
//     const agentCtl = agentBridge() ? new AgentControlSource() : null;
//     meSlot = new PlayerSlot('me', agentCtl ?? localSource, true);
//
// so the moment the agent bridge is on — and every probe here turns it on, via `sessionStorage.NEXUS_AGENT` — LOCAL
// INPUT IS DELIBERATELY BYPASSED. A synthetic gamepad is adopted by InputBus, logs `[PAD] P1 adopted slot 0`, and
// reaches nothing: measured by holding the left trigger and watching the mode's own `post().brace` stay false. Dunk
// never showed this because DunkMode reads the raw input stream; 1v1 and 3v3 read the slot.
//
// So the pad is not the instrument here. `window.__NEXUS_AGENT__` is, and it is the designed one — its own comment
// says the intent it pushes is "the SAME Intent shape the human input path produces, so agent play exercises real game
// code". `do('shoot', { charge })` holds `actionHeld` for 600·charge ms and releases with `action`, which means CHARGE
// IS THE RELEASE POINT and is the A/B rig this pass needs.
//
// WHAT IT PLAYS. Each possession is a named PLAY, so a mechanic can be aimed at rather than hoped for:
//
//   jumper   shoot from where the reset puts me (outside the floater band)
//   layup    drive in, release inside 2.2 m — classifyShot's layup band
//   dunk     drive in WITH SPRINT so turbo, speed and range satisfy checkDriveDunk
//   defence  mirror the driver, hand up, and BLOCK ON HIS GATHER — the mode's own `attackPhase()` says when
//
// The defensive brain runs IN THE PAGE, on a 16 ms interval, because a block has to be thrown inside the gather and a
// round trip to node is most of that window. It reads the dev seam (`scene.metadata.onevone` / `.threevthree`), which
// only exists under `next dev` — hence BASE pointing at the dev server for this pass.
//
//   BASE=http://127.0.0.1:3098 MODE=onevone POSSESSIONS=8 PLAY=mix CHARGE=0.8 npx tsx scripts/probes/_hoops-lab.mts
//   PLAY=jumper|layup|dunk|mix    CHARGE=0.45|0.8|1.0 (early / green / late)    MODE=onevone|threevthree
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const MODE = process.env.MODE ?? 'onevone';
const POSSESSIONS = Number(process.env.POSSESSIONS ?? 8);
const CHARGE = Number(process.env.CHARGE ?? 0.8);
const PLAY = process.env.PLAY ?? 'mix';
const TAG = process.env.TAG ?? `${MODE}-${PLAY}-c${CHARGE}`;
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/hoops`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch {}" });
const page = await ctx.newPage();
const log: string[] = [];
page.on('console', (m) => { const t = m.text(); if (/\[1V1|\[3V3|\[REF|\[LAB/.test(t)) log.push(`${Date.now()} ${t.slice(0, 200)}`); });

{ // LOGIN, AND CHECK IT TOOK (a click before hydration makes no POST and every /play answers 307 for the whole run)
  const lp = await ctx.newPage();
  for (let attempt = 0; attempt < 3; attempt++) {
    await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    if (await lp.evaluate(`fetch('/api/auth/session').then((r) => r.json()).then((j) => !!(j && j.user)).catch(() => false)`)) break;
    // …and an already-authed session is BOUNCED OFF /login to the hub, where `button[type=submit]` is some other
    // page's control sitting under a venue image — which is how this timed out for 60 s on a session that was fine.
    if (!/\/login/.test(lp.url())) break;
    await lp.waitForSelector('button[type="submit"]', { timeout: 120000 });
    await lp.waitForTimeout(1200);   // dev: a click before hydration makes no POST at all
    await lp.fill('input[type="email"]', process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
    await lp.fill('input[type="password"]', process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
    await Promise.all([
      lp.waitForResponse((r) => /\/api\/auth\/(callback|signin)/.test(r.url()), { timeout: 60000 }).catch(() => null),
      // ENTER, not a click: the login page's own venue collage sits over the submit button often enough that a
      // normal click retries for its whole timeout ("<img src=/venues/surfbreak.jpg> intercepts pointer events").
      lp.press('input[type="password"]', 'Enter'),
    ]);
    const t = Date.now();
    while (Date.now() - t < 45000) {
      if (await lp.evaluate(`fetch('/api/auth/session').then((r) => r.json()).then((j) => !!(j && j.user)).catch(() => false)`)) break;
      await lp.waitForTimeout(400);
    }
  }
  await lp.close();
}
await page.goto(`${BASE}/play/${MODE}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 300000 });
{ const t = Date.now(); let st = '';
  while (Date.now() - t < 300000) { st = await page.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => '') as string; if (st === 'loaded' || st === 'playing') break; await page.waitForTimeout(500); }
  if (st !== 'loaded' && st !== 'playing') console.log(`[LAB] the mode never became ready (state "${st}", url ${page.url()})`); }

// THE HUD TAP, THE METER SAMPLER, AND THE DEFENSIVE BRAIN.
await page.evaluate(`(() => {
  const MODE = ${JSON.stringify(MODE)};
  window.__hudNow = () => { const q = window.__FEL_QA__; return q && q.rawHud ? q.rawHud() : {}; };
  window.__dev = () => { const q = window.__FEL_QA__; const s = q && q.scene ? q.scene() : null; return (s && s.metadata && s.metadata[MODE]) || null; };
  window.__meter = { peak: 0, frames: 0 };
  window.__def = { jumps: 0, gathers: 0, lastPhase: '' };
  setInterval(() => {
    const m = window.__hudNow().shotMeterT;
    if (typeof m === 'number' && m > 0) { window.__meter.frames++; if (m > window.__meter.peak) window.__meter.peak = m; }
  }, 16);

  // THE DEFENSIVE BRAIN, in the page because a block lives inside the gather and a round trip to node is most of it.
  // It does the three things the mode's own hint asks for: stay in front, hand up, and go on the gather.
  const d = window.__def;
  setInterval(() => {
    const dev = window.__dev(); const a = window.__NEXUS_AGENT__;
    if (!dev || !a) return;
    const onD = MODE === 'onevone' ? dev.possession && dev.possession() === 'defense' : dev.carrier && dev.carrier() === 'foeTeam';
    if (!onD) { d.lastPhase = ''; return; }
    const phase = dev.attackPhase ? dev.attackPhase() : '';
    if (phase === 'gather' && d.lastPhase !== 'gather') { d.gathers++; d.jumps++; a.do('block'); }
    d.lastPhase = phase;
  }, 16);
})()`);

const agent = async (expr: string) => page.evaluate(`(async () => { const a = window.__NEXUS_AGENT__; if (!a) return 'no bridge'; return await (${expr}); })()`);
const hud = async () => page.evaluate('window.__hudNow()') as Promise<Record<string, unknown>>;

const started = await agent('a.start(30000)');
console.log('[LAB] bridge start →', JSON.stringify(started));
await page.waitForTimeout(1500);

interface Poss {
  n: number; possession: string; play: string; charge: number;
  meterPeak: number; shotType?: string; scored: number; conceded: number;
  beats: string[];
}
const rows: Poss[] = [];
let logMark = 0;
const PLAYS = ['jumper', 'layup', 'dunk'];

for (let n = 0; n < POSSESSIONS; n++) {
  const before = await hud();
  await page.evaluate('(() => { window.__meter = { peak: 0, frames: 0 }; })()');

  const onOffence = /^Drive fast|HOLD SHOOT|Work the court/.test(String(before.hint ?? ''));
  const play = onOffence ? (PLAY === 'mix' ? PLAYS[n % PLAYS.length] : PLAY) : 'defence';
  if (onOffence) {
    // THE THREE FINISHES, aimed rather than hoped for. Distance is bought with drive time: classifyShot's layup band
    // is 2.2 m planar, the floater band runs to FLOATER_RANGE, and checkDriveDunk additionally wants speed and turbo —
    // which is what `sprint` buys, and why the dunk play never releases the stick before the squeeze.
    if (play === 'jumper') { /* shoot from the reset spot */ }
    else if (play === 'layup') await agent(`a.do('move', { x: 0, y: 1, ms: 1200 })`);
    else await agent(`a.do('sprint', { ms: 1500 })`);
    await agent(`a.do('shoot', { charge: ${CHARGE} })`);
  } else {
    // the brain above is already mirroring and blocking; hold the grounded hand-up under it
    await agent(`a.do('contest', { ms: 1400 })`);
  }
  await page.waitForTimeout(2600);   // the arc, the board, the whistle

  const after = await hud();
  const meter = await page.evaluate('window.__meter') as { peak: number; frames: number };
  const fresh = log.slice(logMark); logMark = log.length;
  const p: Poss = {
    n: n + 1,
    possession: onOffence ? 'offence' : 'defence',
    play,
    charge: CHARGE,
    meterPeak: +(meter?.peak ?? 0).toFixed(3),
    shotType: String(after.shotType ?? '') || undefined,
    scored: Number(after.score ?? 0) - Number(before.score ?? 0),
    conceded: Number(after.foeScore ?? 0) - Number(before.foeScore ?? 0),
    beats: fresh.map((l) => l.replace(/^\d+ /, '')).slice(0, 10),
  };
  rows.push(p);
  const shot = p.beats.find((b) => /\[1V1-MOVE\] (finish|gather)|\[1V1-RIM\]|\[3V3/.test(b)) ?? '';
  console.log(`#${String(p.n).padStart(2)} ${p.play.padEnd(8)} meter ${p.meterPeak.toFixed(2)} +${p.scored}/-${p.conceded}  ${String(after.score ?? '?')}-${String(after.foeScore ?? '?')}  ${shot.slice(0, 96)}`);
  if (n < 3) await page.screenshot({ path: `${OUT}/${TAG}-p${p.n}.png` });
}

const def = await page.evaluate('window.__def') as { jumps: number; gathers: number };
const off = rows.filter((r) => r.possession === 'offence');
const made = off.filter((r) => r.scored > 0).length;
const defence = rows.filter((r) => r.possession === 'defence');
const stops = defence.filter((r) => r.conceded === 0).length;
const byPlay = PLAYS.map((k) => { const s = off.filter((r) => r.play === k); return { play: k, n: s.length, made: s.filter((r) => r.scored > 0).length }; });
const final = await hud();
const out = {
  tag: TAG, mode: MODE, charge: CHARGE, play: PLAY,
  possessions: rows.length,
  offence: off.length, made, makePct: off.length ? Math.round((made / off.length) * 100) : null,
  byPlay,
  defence: defence.length, stops, stopPct: defence.length ? Math.round((stops / defence.length) * 100) : null,
  blockJumps: def?.jumps ?? 0, gathersSeen: def?.gathers ?? 0,
  finalScore: [final.score ?? null, final.foeScore ?? null], target: final.target ?? null,
  rows, log: log.slice(-200),
};
fs.writeFileSync(`${OUT}/hoops-lab-${TAG}.json`, JSON.stringify(out, null, 1));
console.log(`\n${MODE} charge ${CHARGE} · offence ${made}/${off.length}${out.makePct !== null ? ` (${out.makePct}%)` : ''} · ${byPlay.map((b) => `${b.play} ${b.made}/${b.n}`).join(' · ')}`);
console.log(`defence: stops ${stops}/${defence.length} · block jumps ${out.blockJumps} on ${out.gathersSeen} gathers · score ${String(final.score)}-${String(final.foeScore)} to ${String(final.target)}`);
console.log(`→ ${OUT}/hoops-lab-${TAG}.json`);
await browser.close();
