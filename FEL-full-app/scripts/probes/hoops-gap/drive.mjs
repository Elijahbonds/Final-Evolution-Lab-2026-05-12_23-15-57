// hoops-audit driver (lane/hoops-audit, 2026-10-27). The real 1v1 / 3v3 in the esbuild rig (./build.mjs --dev, served
// statically), Chromium on SwiftShader, the page on a VIRTUAL clock (1/60 s of game time per rendered frame) with Math.random
// seeded — so what a run measures is a function of frames, not of machine load. ./page.js does the recording, the bot and
// the tests in the page.
//
//   node drive.mjs <mode> <scenario> <outDir>       mode: onevone | threevthree
//     scenario game  — a scripted human plays GAME_S seconds of game time (natural flow, no seams forcing possessions);
//                      every log line, HUD update and input is kept; motion / ball / camera metrics per body
//     scenario input — the input -> response tests (seams set the possession): stick (walk + turbo), shot, the 8 flicks
//                      from a standing dribble and from a jog, pass (3v3), poke, block; frame strips of a move, a shot and
//                      a defensive possession
//   env: PORT (3647) PAGE (dev) TIER (pro) SEED (7) GAME_S (180) VIEW (640x360) SHOTS (outDir/shots)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../../..');
const require = createRequire(path.join(APP, 'package.json'));
const { chromium } = require('playwright-core');
const [MODE, SCEN, OUT] = process.argv.slice(2);
if (!MODE || !SCEN || !OUT) { console.error('usage: node drive.mjs <mode> <game|input> <outDir>'); process.exit(2); }
const PORT = process.env.PORT ?? '3647';
const PAGE = process.env.PAGE ?? 'dev';
const TIER = process.env.TIER ?? 'pro';
const SEED = Number(process.env.SEED ?? 7);
const GAME_S = Number(process.env.GAME_S ?? 180);
const [VW, VH] = (process.env.VIEW ?? '480x270').split('x').map(Number);
const SHOTS = process.env.SHOTS ?? path.join(OUT, 'shots');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
const T0 = Date.now(); const say = (m) => console.log(`[${MODE} ${SCEN} ${TIER} ${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
const exe = process.env.CHROMIUM_EXE ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const INIT = `(() => {
  window.__name = window.__name || ((f) => f);
  const realNow = performance.now.bind(performance); window.__realNow = realNow;
  let vt = realNow(); const raf = window.requestAnimationFrame.bind(window);
  performance.now = () => vt;
  let lastTs = -1;
  window.requestAnimationFrame = (cb) => raf((ts) => { if (ts !== lastTs) { lastTs = ts; vt += 1000 / 60; } cb(vt); });
  { let t = ${SEED} >>> 0; Math.random = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
  const st = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...a) => st(fn, ms === 20000 ? 300000 : ms, ...a);
  { const si = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...a) => { let last = performance.now(); const want = Math.max(1, Number(ms) || 0); return si(() => { const n = performance.now(); if (n - last >= want) { last = n; fn(...a); } }, Math.min(want, 50)); }; }
  window.__LOG = [];
  for (const k of ['info', 'log', 'warn']) { const o = console[k].bind(console); console[k] = (...a) => { try { const m = a.map((x) => (typeof x === 'string' ? x : String(x))).join(' '); if (/^\\[[0-9A-Z][0-9A-Z-]*\\]/.test(m) && window.__LOG.length < 40000) window.__LOG.push({ f: window.__frameNo || 0, t: performance.now(), m: m.slice(0, 240) }); } catch (e) {} o(...a); }; }
})()`;

const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const pageErrs = []; page.on('pageerror', (e) => pageErrs.push(String(e).slice(0, 300)));
await page.addInitScript(INIT);
const ev = (fn, arg) => page.evaluate(fn, arg);
const gameNow = () => ev(() => performance.now());
const waitGame = async (ms) => { const t0 = await gameNow(); for (;;) { if ((await gameNow()) - t0 >= ms) return; await new Promise((r) => setTimeout(r, 200)); } };
const start = () => ev(() => { window.__bus?.emit({ t: 'button', btn: 'START', pressed: true }); window.__bus?.emit({ t: 'button', btn: 'START', pressed: false }); });
const seamOk = () => ev((m) => !!window.__FEL_DEV__?.scene?.metadata?.[m], MODE).catch(() => false);
const FEELQ = process.env.FEEL ? `&feel=${encodeURIComponent(process.env.FEEL)}` : '';   // hoops-p01: feel-panel values for the run
await page.goto(`http://127.0.0.1:${PORT}/${PAGE}.html?mode=${MODE}&tier=${TIER}&perf=off${FEELQ}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
for (let i = 0; i < 900 && !(await seamOk()); i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (i % 10 === 9) { const ph = await ev(() => [window.__phase, window.__err]).catch(() => null); if (ph && ph[1]) { say('error ' + ph[1]); break; } if (ph && (ph[0] === 'ready')) await start().catch(() => {}); }
}
if (!(await seamOk())) { say('no seam ' + JSON.stringify(await ev(() => [window.__phase, window.__err]))); say(pageErrs.join('\n')); await browser.close(); process.exit(2); }
for (let i = 0; i < 300; i++) { const ph = await ev(() => window.__phase); if (ph === 'playing') break; if (ph === 'ready' || ph === 'paused') await start(); await new Promise((r) => setTimeout(r, 400)); }
const loadWallS = (Date.now() - T0) / 1000;
say('playing after ' + loadWallS.toFixed(0) + ' s wall; page.js: ' + await ev(fs.readFileSync(path.join(HERE, 'page.js'), 'utf8')));
const shot = async (name) => { const f = path.join(SHOTS, `${MODE}-${name}.png`); await page.screenshot({ path: f }).catch(() => {}); return f; };
const saveStrip = async (name) => { const urls = await ev((n) => window.__hg.strips[n] || [], name); const dir = path.join(SHOTS, `strip-${MODE}-${name}`); fs.mkdirSync(dir, { recursive: true }); urls.forEach((u, i) => { if (u) fs.writeFileSync(path.join(dir, `${String(i).padStart(2, '0')}.jpg`), Buffer.from(u.split(',')[1], 'base64')); }); return urls.length; };

const result = { mode: MODE, scen: SCEN, tier: TIER, seed: SEED, view: `${VW}x${VH}`, loadWallS };
const outFile = path.join(OUT, `${SCEN}-${MODE}-${TIER}-s${SEED}${process.env.TAG ? '-' + process.env.TAG : ''}.json`);
// hoops-p01: the input run writes what it has after every test group (a timeout on the shared box keeps the finished groups)
const checkpoint = async (what) => { try { result.partial = what; result.log = await ev(() => window.__LOG); result.wallS = (Date.now() - T0) / 1000; fs.writeFileSync(outFile, JSON.stringify(result)); say('checkpoint ' + what); } catch (e) { say('checkpoint failed ' + e); } };
// hoops-p02: THE POSSESSION LOOP — POSS defensive and POSS offensive possessions, each set by the seams (defend / offense) and played by
// the bot (on defence: shadow the driver, poke, jump 220 ms after the gather; on the ball: drive, move, shoot or pass), each ended by
// the possession changing or a shot going up (+ POSS_TAIL_MS to see it land), capped at POSS_CAP_MS of game time. Every possession
// keeps its log lines and HUD banners — analyze-defense.mjs reads blocks, stops and contests per possession.
const POSS = Number(process.env.POSS ?? 0);
async function possLoop() {
  const out = [];
  const tag = MODE === 'onevone' ? '1V1' : '3V3';
  const CAP = Number(process.env.POSS_CAP_MS ?? 7000), TAIL = Number(process.env.POSS_TAIL_MS ?? 1500);
  for (let k = 0; k < POSS * 2; k++) {
    const side = k % 2 === 0 ? 'def' : 'off';
    await ev(() => { window.__hg.bot.on = false; });
    await ev((a) => { const s = window.__FEL_DEV__.scene.metadata[a[0]]; if (a[1] === 'def') s.defend(); else s.offense(); }, [MODE, side]);
    await waitGame(side === 'def' ? 200 : 600);
    const f0 = await ev(() => window.__hg.frame); const t0 = await gameNow();
    await ev(() => { window.__hg.bot.on = true; window.__hg.autoStrip = true; });
    let endAt = null;
    for (;;) {
      await new Promise((r) => setTimeout(r, 1500));
      const st = await ev((a) => { const L = window.__LOG || []; const since = L.filter((l) => l.f >= a[0]); const pc = window.__hg.possCode(); return { pc, shot: since.some((l) => new RegExp(a[1] === 'def' ? 'rival release|rival dunk|swat at k|my block read' : 'my release|blocked at the release|drive contest|mate shot').test(l.m)), over: since.some((l) => /strip by the ai|ai reach resolve strip|STOLEN|resetPossession|charge|REF\]/.test(l.m)) }; }, [f0, side]);
      const g = (await gameNow()) - t0;
      if (endAt === null && (st.shot || st.over || (side === 'def' ? st.pc === 1 : st.pc === 2))) endAt = g + TAIL;
      if ((endAt !== null && g >= endAt) || g >= CAP) break;
    }
    await ev(() => { window.__hg.bot.on = false; });
    const f1 = await ev(() => window.__hg.frame);
    const rec = await ev((a) => ({ log: (window.__LOG || []).filter((l) => l.f >= a[0] && l.f <= a[1]).map((l) => l.m), banners: (window.__hud || []).filter((h) => h.f >= a[0] && h.f <= a[1] && h.banner).map((h) => String(h.banner)) }), [f0, f1]);
    out.push({ side, f0, f1, sec: +((f1 - f0) / 60).toFixed(2), ...rec });
    say(`poss ${k} ${side} ${out[out.length - 1].sec} s ${rec.banners.slice(0, 4).join(' | ')}`);
    if (k % 2 === 1) { result.poss = out; await checkpoint('poss ' + k); }
  }
  return out;
}
if (SCEN === 'game') {
  await waitGame(800);
  await ev(() => { window.__hg.start(); window.__hg.bot.on = true; window.__hg.autoStrip = true; });   // hoops-p02: auto-strips on block / strip events
  const t0 = await gameNow(); let nextShot = 0; let k = 0;
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    const g = ((await gameNow()) - t0) / 1000;
    const st = await ev((m) => { const s = window.__FEL_DEV__.scene.metadata[m]; return { ended: !!(s.ended && s.ended()), ph: window.__phase, hud: window.__hudNow }; }, MODE);
    if (g >= nextShot) { await shot(`game-${String(k++).padStart(2, '0')}`); nextShot += GAME_S / 8; }
    if (st.ended || g >= GAME_S || st.ph === 'ended') { result.endedBy = st.ended ? 'game over' : 'time'; result.gameS = g; result.hudEnd = st.hud; break; }
    if (Math.floor(g) % 30 === 0) say(`game ${g.toFixed(0)} s  score ${st.hud.score ?? '-'}-${st.hud.foeScore ?? '-'}  frames ${await ev(() => window.__hg.frame)}`);
  }
  await ev(() => { window.__hg.bot.on = false; window.__hg.stop(); });
  result.analysis = await ev(() => window.__hg.analyse());
  result.bot = await ev(() => { const b = window.__hg.bot; return { moves: b.moves, shots: b.shots, passes: b.passes, pokes: b.pokes, blocks: b.blocks, tally: b.tally }; });
  result.log = await ev(() => window.__LOG);
  result.hud = await ev(() => window.__hud);
  result.inputs = await ev(() => window.__hg.inputs);
  result.snaps = await ev(() => window.__hg.snaps || []);   // hoops-p02: the defence snapshots
  { const names = await ev(() => Object.keys(window.__hg.strips).filter((k) => k.startsWith('auto-'))); for (const nm of names) await saveStrip(nm); result.autoStrips = names; }
} else if (SCEN === 'poss') {   // hoops-p02: the possession loop alone
  result.poss = await possLoop(); result.log = await ev(() => window.__LOG); result.hud = await ev(() => window.__hud); result.snaps = await ev(() => window.__hg.snaps || []);
  { const names = await ev(() => Object.keys(window.__hg.strips).filter((k) => k.startsWith('auto-'))); for (const nm of names) await saveStrip(nm); result.autoStrips = names; }
} else if (SCEN === 'input') {
  const S = (fn, arg) => ev(fn, arg);
  const setOff = () => S((m) => { const s = window.__FEL_DEV__.scene.metadata[m]; s.offense(); }, MODE);
  const setDef = () => S((m) => { const s = window.__FEL_DEV__.scene.metadata[m]; s.defend(); }, MODE);
  const T = (name, arg) => ev(([n, a]) => window.__hg.test[n](a), [name, arg]);
  // hoops-p01: a big play (an ankle break) cuts to a REPLAY on the next dead ball, and a press made during it has no game to land in
  // (the before run lost two jog flicks to one) — wait it out before a press
  const noReplay = async () => { for (let i = 0; i < 20; i++) { const busy = await ev(() => { const L = window.__LOG || []; const f = window.__frameNo || 0; return L.some((l) => /\[HOOPS-REPLAY\]/.test(l.m) && f - l.f < 360); }); if (!busy) return; await waitGame(500); } };
  const R = result.tests = { stick: [], stickTurbo: [], shot: [], flickStand: [], flickJog: [], pass: [], poke: [], block: [] };
  // hoops-p01: TESTS=stick,stop,shot,buffer,flick,pass,poke,block (default: all) — the shared lock is the scarce thing
  const ON = new Set((process.env.TESTS ?? 'stick,stop,shot,buffer,flick,pass,poke,block').split(','));
  await ev(() => window.__hg.start());
  // hoops-p01: the first of each takes a strip from the stop's first frame (stop-jog / stop-sprint)
  if (ON.has('stick')) for (let k = 0; k < 2; k++) { await setOff(); await waitGame(1200); R.stick.push(await T('stick', false)); }
  if (ON.has('stick')) for (let k = 0; k < 2; k++) { await setOff(); await waitGame(1200); R.stickTurbo.push(await T('stick', true)); }
  if (ON.has('stick')) await checkpoint('stick');
  R.stopJog = []; R.stopSprint = [];
  if (ON.has('stop')) for (let k = 0; k < 2; k++) { await setOff(); await waitGame(1200); R.stopJog.push(await T('stopLine', { turbo: false, strip: k === 0 ? 'stop-jog' : null })); if (k === 0) { await waitGame(300); await saveStrip('stop-jog'); } }
  if (ON.has('stop')) for (let k = 0; k < 2; k++) { await setOff(); await waitGame(1200); R.stopSprint.push(await T('stopLine', { turbo: true, sec: 1.1, strip: k === 0 ? 'stop-sprint' : null })); if (k === 0) { await waitGame(300); await saveStrip('stop-sprint'); } }
  if (ON.has('shot')) for (let k = 0; k < 3; k++) { await setOff(); await waitGame(1200); if (k === 0) { ev(() => window.__hg.strip('jumper', 16, 3)); } R.shot.push(await T('shot')); if (k === 0) { await waitGame(300); await saveStrip('jumper'); } await waitGame(2500); }
  if (ON.has('stop') || ON.has('shot')) await checkpoint('stop+shot');
  // hoops-p01: the input buffer — Square tapped mid-spin and mid-crossover
  R.buffer = [];
  if (ON.has('buffer')) for (const kind of ['spin', 'spin', 'cross', 'cross']) { await setOff(); await waitGame(1200); R.buffer.push(await T('buffer', kind)); await waitGame(2500); }
  if (ON.has('buffer')) await checkpoint('buffer');
  const REPS = Number(process.env.REPS ?? 1);
  const dirs = ['left', 'right', 'up', 'down', 'upleft', 'upright', 'downleft', 'downright'];
  if (ON.has('flick')) for (const d of dirs) for (let k = 0; k < REPS; k++) {
    await setOff(); await waitGame(1200); await noReplay();
    if (d === 'left' && k === 0) ev(() => window.__hg.strip('crossover-stand', 16, 3));
    R.flickStand.push(await T('flick', d));
    if (d === 'left' && k === 0) await saveStrip('crossover-stand');
  }
  if (ON.has('flick')) for (const d of dirs) for (let k = 0; k < REPS; k++) {
    await setOff(); await waitGame(900); await noReplay(); await setOff(); await waitGame(400);
    await ev(() => { const h = window.__hg; const me = window.__FEL_DEV__.hero(); let r = me; while (r.parent) r = r.parent; const p = r.getAbsolutePosition(); h.steer(0 - p.x, -0.6 - p.z, 0.7); });
    await waitGame(500);
    if (d === 'right' && k === 0) ev(() => window.__hg.strip('crossover-jog', 16, 3));
    R.flickJog.push(await T('flick', d));
    if (d === 'right' && k === 0) await saveStrip('crossover-jog');
    await ev(() => window.__hg.stick(0, 0));
  }
  if (ON.has('flick')) await checkpoint('flick');
  if (MODE === 'threevthree' && ON.has('pass')) for (let k = 0; k < 3; k++) { await setOff(); await waitGame(1200); R.pass.push(await T('pass')); await waitGame(1500); }
  if (ON.has('poke')) for (let k = 0; k < 3; k++) {
    await setDef(); await waitGame(1400 + k * 250);
    if (k === 0) ev(() => window.__hg.strip('defense', 16, 4));
    R.poke.push(await T('poke'));
    if (k === 0) { await waitGame(600); await saveStrip('defense'); }
    await waitGame(1500);
  }
  if (ON.has('block')) for (let k = 0; k < 3; k++) { await setDef(); await waitGame(1600); R.block.push(await T('block')); await waitGame(1500); }
  await shot('input-end');
  if (POSS > 0) { await ev(() => window.__hg.stop()); result.poss = await possLoop(); const names = await ev(() => Object.keys(window.__hg.strips).filter((k) => k.startsWith('auto-'))); for (const nm of names) await saveStrip(nm); result.autoStrips = names; }   // hoops-p02
  await ev(() => window.__hg.stop());
  // hoops-p01: the hero's pops in the 0.75 s from each stop's first frame (a stop / launch touch must not add pops)
  const an = await ev(() => window.__hg.analyse({ popFrames: true }));
  const popAt = (an.perBody.me && an.perBody.me.popAt) || []; const hf0 = an.f0 || 0;
  const popsAfter = (s0) => popAt.filter((i) => i >= s0 - hf0 && i <= s0 - hf0 + 45).length;
  result.stopPops = { afterReversal: [...R.stick, ...R.stickTurbo].map((x) => popsAfter(x.frames.s0)), jog: R.stopJog.map((x) => popsAfter(x.frames.s0)), sprint: R.stopSprint.map((x) => popsAfter(x.frames.s0)) };
  result.heroMotion = an.perBody.me ? { ...an.perBody.me, popAt: undefined } : null;
  result.snaps = await ev(() => window.__hg.snaps || []);   // hoops-p02
  result.log = await ev(() => window.__LOG);
}
result.pageErrors = pageErrs.slice(0, 10); result.hgErrors = await ev(() => window.__hg.errors).catch(() => []);
result.wallS = (Date.now() - T0) / 1000;
result.feel = process.env.FEEL ? JSON.parse(process.env.FEEL) : null; delete result.partial;
fs.writeFileSync(outFile, JSON.stringify(result));
say('wrote ' + outFile + ' wall ' + result.wallS.toFixed(0) + ' s');
await browser.close();
process.exit(0);
