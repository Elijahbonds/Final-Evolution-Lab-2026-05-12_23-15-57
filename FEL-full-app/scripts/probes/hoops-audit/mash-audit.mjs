// hoops-audit-play (2026-11-12): the gameplay-clean counter (../gameplay-clean/audit.mjs) with a different PLAYER in the page — a
// naive MASHER (8 random presses a second, a random stick every 0.25 s, the run key held at random) or IDLE (hands off) — so
// the same pops / skate / input / stuck / score read compares a masher, the counter's generic scripted player and no player at
// all, on one build and one clock. audit.mjs is NOT edited: this wrapper swaps the function audit.mjs hands to page.evaluate
// under the name `installScript` for one of the players below, and runs audit.mjs unchanged.
//
//   PLAYER=mash|idle node scripts/probes/hoops-audit/mash-audit.mjs <outDir> <mode>      (+ every env audit.mjs reads)
//
// THE KEYBOARD NEVER REACHED THE 1v1 / 3v3 HERO IN THE COUNTER (found here, 2026-11-12). The rig is a production build with agent-run
// hooks allowed, so ModeHarness installs the agent bridge (window.__NEXUS_AGENT__), and both hoops modes then build the player's slot
// as `agentCtl ?? localSource` (OneVOneMode.ts:1083-1091, ThreeVThreeMode likewise): local input is bypassed by design. Measured: the
// counter's 1v1 run held W / D / A for 22 s and the hero's root moved 0 m. So every player here (NO_AGENT, default 1) traps that
// global in an init script — the bridge is never published, the slot is the local one, and the keyboard reaches the hero. PLAYER=script
// is audit.mjs's own scripted player with the trap (the counter's numbers for 1v1 / 3v3 as a player would get them).
// Run it the way gc-hold.sh runs audit.mjs (a static server on the lane's port, inside one hold of the gate lock): gc-hold.sh
// takes AUDIT=<this file> to call it instead of audit.mjs. The masher's presses are logged into the recorder exactly as the
// scripted player's are (`R.presses`), so the counter's input read (answered %, median ms) covers every masher press.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../package.json', import.meta.url).pathname);
const pw = require('playwright-core');
const PLAYER = process.env.PLAYER ?? 'mash';

// The mode's own log lines (`[1V1-RIM] ring YES`, `[3V3-DEF] ...`, `[DUNK-...]`) are tapped in the page by both players (the first
// 5000 tagged lines, with the game second each landed on) and written beside audit.mjs's JSON as <mode>-<tag>-play.json when the
// browser closes: what the counter does not read (makes, misses, calls, possessions) comes from there (summary.mjs).
function tapLog(S) {
  S.log = []; S.presses = 0;
  for (const k of ['info', 'log', 'warn']) {
    const o = console[k].bind(console);
    console[k] = (...a) => { try { const m = a.map((x) => (typeof x === 'string' ? x : String(x))).join(' '); if (/^\[[0-9A-Z][0-9A-Z-]*\]/.test(m) && S.log.length < 5000) S.log.push([S.t ?? -1, m.slice(0, 200)]); } catch (e) { /* the tap never breaks the game */ } o(...a); };
  }
}
// The page side of each player. The fields the driver polls (`__S.t`, `.done`, `.pauseState`) are kept: the pause is never
// pressed (pauseState 'skipped'), so set PAUSE_AT past PLAY_S as the other runs do.
function mashScript(cfg, tapLog) {
  const W = window; const R = W.__rec;
  const kd = (k) => { if (R.keys.has(k)) return; R.keys.add(k); W.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); };
  const ku = (k) => { if (!R.keys.has(k)) return; R.keys.delete(k); W.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })); };
  const S = W.__S = { t0: null, tapUntil: new Map(), nextTap: 0.6, nextStick: 0.6, pauseState: 'skipped', done: false, seed: 12345 };
  tapLog(S);
  const rnd = () => { S.seed = (S.seed * 1664525 + 1013904223) >>> 0; return S.seed / 4294967296; };   // its own stream: the page's Math.random is the game's
  const FACE = ['j', 'k', 'l', 'i', 'j', 'l', 'q', 'f', 'e'];   // A B X Y (A and X twice: shoot / pass weigh more), L1, L2 (F), R1
  const STICKS = ['', 'w', 's', 'a', 'd', 'wa', 'wd', 'sa', 'sd'];
  const tap = (k, t, ms) => { kd(k); S.tapUntil.set(k, t + ms); R.presses.push([t, k, R.frameNo]); S.presses++; };
  W.__onVtFrame = () => {
    const ss = W.__sessionStore ? W.__sessionStore.view() : null; const ph = ss ? ss.phase : null;
    if (S.t0 === null) { if (ph === 'playing') S.t0 = W.__gameS(); else return; }
    const t = W.__gameS() - S.t0; S.t = t;
    for (const [k, until] of [...S.tapUntil]) if (t >= until) { ku(k); S.tapUntil.delete(k); }
    if (S.done) { for (const k of ['w', 'a', 's', 'd', ' ', 'shift']) ku(k); return; }
    if (t >= S.nextStick) {
      const want = STICKS[Math.floor(rnd() * STICKS.length)];
      for (const k of ['w', 'a', 's', 'd']) (want.includes(k) ? kd : ku)(k);
      if (rnd() < 0.4) kd('shift'); else ku('shift');
      if (rnd() < 0.2) kd(' '); else ku(' ');
      S.nextStick = t + 0.25;
    }
    if (t >= S.nextTap) { tap(FACE[Math.floor(rnd() * FACE.length)], t, 0.04 + rnd() * 0.25); S.nextTap = t + 0.125; }
    if (t >= cfg.playS) { S.done = true; }
  };
}
function idleScript(cfg, tapLog) {
  const W = window;
  const S = W.__S = { t0: null, pauseState: 'skipped', done: false };
  tapLog(S);
  W.__onVtFrame = () => {
    const ss = W.__sessionStore ? W.__sessionStore.view() : null; const ph = ss ? ss.phase : null;
    if (S.t0 === null) { if (ph === 'playing') S.t0 = W.__gameS(); else return; }
    S.t = W.__gameS() - S.t0;
    if (S.t >= cfg.playS) S.done = true;
  };
}
const SWAP = { mash: mashScript, idle: idleScript, script: null }[PLAYER];
if (SWAP === undefined) { console.error(`PLAYER must be mash, idle or script (got ${PLAYER})`); process.exit(2); }
const NO_AGENT = process.env.NO_AGENT !== '0';
const TRAP = `Object.defineProperty(window, '__NEXUS_AGENT__', { configurable: true, get() { return undefined; }, set() { window.__agentTrapped = (window.__agentTrapped || 0) + 1; } });`;

import fs from 'node:fs';
import path from 'node:path';
const [OUT_DIR, MODE_ARG] = process.argv.slice(2);
let livePage = null;
const launch = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = async (...a) => {
  const browser = await launch(...a);
  hookClose(browser);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...b) => {
    const ctx = await newContext(...b);
    if (NO_AGENT) await ctx.addInitScript({ content: TRAP });
    hookClose(ctx);
    const newPage = ctx.newPage.bind(ctx);
    ctx.newPage = async (...c) => {
      const page = await newPage(...c);
      const evaluate = page.evaluate.bind(page);
      // the player goes in as one expression: a serialized function cannot reach tapLog by closure
      page.evaluate = (fn, arg) => (typeof fn === 'function' && fn.name === 'installScript'
        ? (SWAP ? evaluate(`(${SWAP.toString()})(${JSON.stringify(arg)}, ${tapLog.toString()})`)
          : evaluate(fn, arg).then((r) => evaluate(`(() => { const S = window.__S; (${tapLog.toString()})(S); })()`).then(() => r)))
        : evaluate(fn, arg));
      livePage = page; hookClose(page);
      return page;
    };
    return ctx;
  };
  return browser;
};
// before audit.mjs closes the page, its context or the browser (whichever comes first): the tapped log and the press count, beside its JSON
let dumped = false;
async function dump() {
  if (dumped || !livePage) return; dumped = true;
  try {
    const got = await livePage.evaluate(() => { const S = window.__S || {}; return { player: null, t: S.t ?? null, presses: S.presses ?? 0, agentTrapped: window.__agentTrapped ?? 0, log: S.log || [] }; });
    if (got && OUT_DIR && MODE_ARG) { got.player = PLAYER; fs.writeFileSync(path.join(OUT_DIR, `${MODE_ARG}-${process.env.TAG ?? 'base'}-play.json`), JSON.stringify(got)); }
  } catch (e) { console.error('play log not saved: ' + String(e).slice(0, 160)); }
}
const hookClose = (o) => { const c = o.close.bind(o); o.close = async (...d) => { await dump(); return c(...d); }; };
await import('../gameplay-clean/audit.mjs');
