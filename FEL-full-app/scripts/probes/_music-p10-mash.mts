// MUSIC-SUITE P10 (2026-09-29) — MASH TESTS: every music / dance input mashed for 60 s, live on the lane's :3121.
//
// Rooms × inputs (60 s each, ~8 presses a second with random gaps, random choice of the room's own inputs):
//   PERFORM (/dev/music, a 14-cell beat laid, PERFORM → PLAY): keys (H J K L ← ↓ ↑ →, real CDP key events), pad (a fake
//     standard pad's X A Y B and the D-pad), pointer (CDP mouse on the four PERFORM pads), phone (a paired /controller
//     page, CDP touches on its 16 pads — a row is a lane);
//   FLIP (the FEL theme on the pads, the groovebox running): keys (the Flip pad keys 1-4 q-r a-f z-v), pointer (the pads);
//   THE CYPHER (/dev/mode/dance?track=warmup): keys (J K L I), pad (A B X Y and RT), pointer (the touch overlay's TOP ROCK /
//     TWO STEP / ARM WAVE / SPIN), phone (the paired dance pad's four move buttons).
// After each: STUCK NOTES — the audio sources still sounding 3 s after the input stops and the room is paused / stopped
// (every AudioScheduledSourceNode.start is watched to its 'ended'; a looping source is named apart); RUNAWAY TAPS — what
// the judge took (PerformSet.tap / DancePerformance.hit calls, observed through the webpack cache) against the presses
// sent (a press can only ever be one tap); PAGE ERRORS; MEMORY — the JS heap (CDP GC ×3) before and after the 60 s, on
// the same page.
// Usage: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p10-mash.mts  (ONLY=perform-keys,…  MASH_MS=60000)
import fs from 'node:fs';
import type { Browser, BrowserContext, CDPSession, Page } from 'playwright-core';
import { BASE, assertDisk, launch, newPage, cdpOf, heap, openAcademy, openDance, danceStart, hud, writeJson, sleep, OUT_ROOT, DESKTOP, DANCE_HOOK, type Any } from './_p10-lib.mts';

const OUT = `${OUT_ROOT}/mash`;
fs.mkdirSync(OUT, { recursive: true });
const MASH_MS = Number(process.env.MASH_MS ?? 60000);
const ALL = ['perform-keys', 'perform-pad', 'perform-pointer', 'perform-phone', 'flip-keys', 'flip-pointer', 'dance-keys', 'dance-pad', 'dance-pointer', 'dance-phone', 'perform-touchphone', 'dance-touchphone'];
// '-touchphone' (the scorecard's phone-controls line, which only a headed, signed-in release run wrote before): the room
// itself on a 390×844 touch phone, its on-screen controls tapped with real CDP touches for TOUCH_MS — the PERFORM pads,
// the Cypher's touch overlay (TOP ROCK / TWO STEP / ARM WAVE / SPIN). Pass = every control reached the judge.
const TOUCH_MS = Number(process.env.TOUCH_MS ?? 20000);
const PHONE_VIEW = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : ALL;
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p10-mash +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const R: Any = { at: new Date().toISOString(), mashMs: MASH_MS, runs: {}, errors: [] as string[] };
const STUDIO_TIER = `try { if (!localStorage.getItem('fel-music-progress')) localStorage.setItem('fel-music-progress', '{"patternsMade":1,"sectionsSaved":2,"chainEntries":2}'); } catch (e) {}`;
const CAL = `try { localStorage.setItem('fel.audioOffsetMs', '0'); localStorage.setItem('fel.audioOffsetMeasuredAt', String(Date.now())); } catch (e) {}`;
/** Every audio source started, watched to its 'ended'. */
const SOURCES = `(() => {
  const S = window.__SRC = { started: 0, ended: 0, live: new Set() };
  // AudioBufferSourceNode has its OWN start() (when, offset, duration) — wrapping only the base class caught the
  // oscillators and missed every sample the Academy's engine and the Flip pads play (first mash run: 14 sources in 60 s)
  for (const C of [AudioScheduledSourceNode, AudioBufferSourceNode, OscillatorNode, ConstantSourceNode]) {
    // the marker is checked OWN-property: AudioBufferSourceNode.prototype inherits from AudioScheduledSourceNode.prototype,
    // so an inherited __p10src marker skipped the subclass's own start (the second run still counted 14 sources in 60 s)
    const P = C.prototype; if (!Object.prototype.hasOwnProperty.call(P, 'start') || Object.prototype.hasOwnProperty.call(P, '__p10src')) continue; P.__p10src = true;
    const o = P.start;
    P.start = function (...a) { if (!this.__p10s) { this.__p10s = true; S.started++; S.live.add(this); this.addEventListener('ended', () => { S.ended++; S.live.delete(this); }, { once: true }); } return o.apply(this, a); };
  }
})()`;
const SRC_NOW = `(() => { const S = window.__SRC; const live = [...S.live]; return { started: S.started, ended: S.ended, live: live.length, liveLooping: live.filter((s) => s.loop === true).length, liveKinds: live.reduce((m, s) => { const k = s.constructor.name + (s.loop ? '(loop)' : ''); m[k] = (m[k] || 0) + 1; return m; }, {}) }; })()`;
/** PerformSet.tap on the ROOM's set (a rejudge builds its own), counted. */
const HOOK_PERFORM = `(() => {
  const m = window.__MOD('lib/babylon/music/performSet\\\\.ts$'); if (!m) return false;
  const P = m.PerformSet.prototype; if (P.__p10mash) return true; P.__p10mash = true;
  window.__TAPS = 0; window.__STEPS = 0;
  const ot = P.tap; P.tap = function (...a) { if (!this.__judge) window.__TAPS++; return ot.apply(this, a); };
  return true;
})()`;

/** What the speakers get for `ms`: a ScriptProcessor on `nodeExpr` (page JS), RMS and peak in dBFS. The honest stuck-note
 *  test — a source can be started-and-not-ended inside a SUSPENDED context and make no sound at all. */
async function level(p: Page, nodeExpr: string, ms = 1000): Promise<Any> {
  return p.evaluate(`(async () => {
    let node = null; try { node = ${nodeExpr}; } catch (e) {}
    if (!node) return { err: 'no node' };
    const ctx = node.context; const sp = ctx.createScriptProcessor(2048, 2, 2); let s = 0, n = 0, pk = 0;
    sp.onaudioprocess = (e) => { const a = e.inputBuffer.getChannelData(0); for (let i = 0; i < a.length; i++) { s += a[i] * a[i]; n++; pk = Math.max(pk, Math.abs(a[i])); } };
    node.connect(sp); sp.connect(ctx.destination);
    await new Promise((r) => setTimeout(r, ${ms}));
    node.disconnect(sp); sp.disconnect();
    const db = (x) => x > 0 ? Math.round(20 * Math.log10(x) * 10) / 10 : -Infinity;
    return { ctxState: ctx.state, rmsDb: n ? db(Math.sqrt(s / n)) : null, peakDb: db(pk), samples: n };
  })()`);
}
const SK_OUT = "window.__MOD('lib/babylon/audio/SoundKit\\\\.ts$').SoundKit.graph().out";
const ENGINE_OUT = "window.__engM.deviceVol";
const HOOK_ENGINE = `(() => {
  const m = window.__MOD('lib/babylon/music/AudioEngine\\\\.ts$'); if (!m) return false;
  const P = m.AudioEngine.prototype; if (P.__p10mashE) return true; P.__p10mashE = true;
  const o = P.scheduleStep; P.scheduleStep = function (...a) { window.__engM = this; return o.apply(this, a); };
  return true;
})()`;

async function heapNow(p: Page): Promise<Any> { const c = await cdpOf(p); const h = await heap(c); await c.detach().catch(() => undefined); return h; }

/** A /controller phone page paired to the host's room (the P6 / P9 probes' pairing). */
async function pairPhone(b: Browser, host: Page, badgeRe: RegExp, ready: string): Promise<{ ctx: BrowserContext; phone: Page; cdp: CDPSession }> {
  await host.waitForFunction((src) => new RegExp(src).test((document.querySelector('[data-testid="host-lobby-badge"]')?.textContent ?? '').trim()), badgeRe.source, { timeout: 60000 });
  const code = new RegExp(badgeRe.source).exec(((await host.locator('[data-testid="host-lobby-badge"]').first().textContent()) ?? '').trim())?.[1] ?? '';
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const phone = await ctx.newPage();
  phone.on('pageerror', (e) => R.errors.push(`phone pageerror ${String(e).slice(0, 200)}`));
  await phone.goto(`${BASE}/controller/${code}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await phone.getByRole('button', { name: 'JOIN' }).waitFor({ timeout: 120000 });
  await phone.getByRole('button', { name: 'JOIN' }).click();
  await phone.waitForFunction(() => /Connected/.test(document.querySelector('header')?.textContent ?? ''), undefined, { timeout: 60000 });
  await phone.getByRole('button', { name: ready, exact: true }).waitFor({ timeout: 30000 });
  return { ctx, phone, cdp: await ctx.newCDPSession(phone) };
}
async function touchCentre(cdp: CDPSession, box: { x: number; y: number; width: number; height: number }): Promise<void> {
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, force: 0.5, radiusX: 8, radiusY: 8, id: 1 }] });
  await sleep(20 + Math.random() * 40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const gap = () => sleep(60 + Math.random() * 130);   // ~8 a second, the P1 masher's rhythm

async function mashLoop(ms: number, press: () => Promise<void>): Promise<number> {
  const end = Date.now() + ms; let n = 0;
  while (Date.now() < end) { await press(); n++; await gap(); }
  return n;
}
/** The fake pad masher, run IN the page (a CDP round trip per press would slow it below 8 a second). */
const PAD_MASH = `async ({ ms, buttons }) => {
  const end = performance.now() + ms; let n = 0;
  while (performance.now() < end) {
    const b = buttons[Math.floor(Math.random() * buttons.length)];
    window.__padBtn(b, 1); await new Promise((r) => setTimeout(r, 30 + Math.random() * 30)); window.__padBtn(b, 0); n++;
    await new Promise((r) => setTimeout(r, 60 + Math.random() * 110));
  }
  return n;
}`;

async function academy(kind: string, b: Browser): Promise<Any> {
  const out: Any = { disk: assertDisk(kind) };
  const touch = kind.endsWith('-touchphone');
  const ctx = await b.newContext(touch ? PHONE_VIEW : { ...DESKTOP, viewport: { width: 1280, height: 1000 } });
  for (const s of [STUDIO_TIER, CAL]) await ctx.addInitScript({ content: s });
  await ctx.addInitScript({ content: SOURCES });
  const p = await newPage(ctx, R.errors, kind);
  const errs0 = R.errors.length;
  let phone: { ctx: BrowserContext; phone: Page; cdp: CDPSession } | null = null;
  try {
    await openAcademy(p, '/dev/music?stage=studio&player=p10mash');
    await p.waitForFunction(() => !!document.querySelector('[data-qa="cell"]'), undefined, { timeout: 60000 });
    out.hooked = await p.evaluate(HOOK_PERFORM);
    out.hookedEngine = await p.evaluate(HOOK_ENGINE);
    for (const [row, steps] of [['kick', [0, 4, 8, 12]], ['snare', [4, 12]], ['hat', [0, 2, 4, 6, 8, 10, 12, 14]]] as [string, number[]][]) {
      for (const s of steps) { const c = p.locator(`[data-qa="cell"][data-row="${row}"][data-step="${s}"]`); if (await c.count() && (await c.getAttribute('data-on')) !== '1') await c.click(); }
    }
    const flip = kind.startsWith('flip');
    if (flip) {
      await p.getByRole('button', { name: 'FLIP', exact: true }).click();
      await p.waitForFunction(() => { const f = (window as Any).__FEL_FLIP__; return f && f.decoded && f.slices > 0; }, undefined, { timeout: 90000 });
      await p.getByRole('button', { name: 'PLAY', exact: true }).first().click();
    } else {
      await p.getByRole('button', { name: 'PERFORM', exact: true }).click();
      await p.waitForSelector('[data-qa="perform-play"]', { timeout: 30000 });
      if (kind === 'perform-phone') {
        await p.locator('[data-qa="perform-pair-phone"]').click();
        phone = await pairPhone(b, p, /^([A-Z0-9]{4,8}) ·/, '16');
        await p.waitForFunction(() => Number(document.querySelector('[data-qa="phone-room"]')?.getAttribute('data-phones') ?? 0) === 1, undefined, { timeout: 30000 });
      }
      await p.locator('[data-qa="perform-play"]').click();
    }
    await p.waitForFunction(() => !!(window as Any).__FEL_STUDIO__?.engine()?.running, undefined, { timeout: 20000 });
    await sleep(1000);
    out.heapBefore = await heapNow(p);
    const taps0 = await p.evaluate(() => (window as Any).__TAPS ?? 0);
    const src0 = await p.evaluate(SRC_NOW);
    let presses = 0;
    if (kind === 'perform-keys') {
      const K = ['h', 'j', 'k', 'l', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];
      presses = await mashLoop(MASH_MS, async () => { const k = K[Math.floor(Math.random() * K.length)]; await p.keyboard.down(k); await sleep(25 + Math.random() * 30); await p.keyboard.up(k); });
    } else if (kind === 'perform-pad') {
      presses = await p.evaluate(`(${PAD_MASH})(${JSON.stringify({ ms: MASH_MS, buttons: [0, 1, 2, 3, 12, 13, 14, 15] })})`) as number;
    } else if (kind === 'perform-pointer') {
      const boxes = await Promise.all([0, 1, 2, 3].map((l) => p.locator(`[data-qa="perform-pad"][data-lane="${l}"]`).boundingBox()));
      presses = await mashLoop(MASH_MS, async () => { const bx = boxes[Math.floor(Math.random() * 4)]!; await p.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2, { delay: 20 + Math.random() * 30 }); });
    } else if (kind === 'perform-phone' && phone) {
      const boxes = await Promise.all(Array.from({ length: 16 }, (_, i) => phone!.phone.getByRole('button', { name: String(i + 1), exact: true }).first().boundingBox()));
      presses = await mashLoop(MASH_MS, async () => { await touchCentre(phone!.cdp, boxes[Math.floor(Math.random() * 16)]!); });
    } else if (kind === 'perform-touchphone') {
      const cdp = await cdpOf(p);
      const perLane = [0, 0, 0, 0]; const tapsBy = [0, 0, 0, 0];
      presses = await mashLoop(TOUCH_MS, async () => {
        const l = Math.floor(Math.random() * 4);
        const loc = p.locator(`[data-qa="perform-pad"][data-lane="${l}"]`); await loc.scrollIntoViewIfNeeded().catch(() => undefined);
        const bx = await loc.boundingBox(); if (!bx) return;
        const t0 = await p.evaluate(() => (window as Any).__TAPS ?? 0);
        await touchCentre(cdp, bx); perLane[l]++; await sleep(20);
        if ((await p.evaluate(() => (window as Any).__TAPS ?? 0)) > t0) tapsBy[l]++;
      });
      out.touch = { perLane, judgedBy: tapsBy };
    } else if (kind === 'flip-keys') {
      const K = ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];
      presses = await mashLoop(MASH_MS, async () => { const k = K[Math.floor(Math.random() * K.length)]; await p.keyboard.down(k); await sleep(25 + Math.random() * 30); await p.keyboard.up(k); });
    } else if (kind === 'flip-pointer') {
      const boxes = await Promise.all(Array.from({ length: 16 }, (_, i) => p.getByRole('button', { name: `pad ${i + 1}`, exact: true }).first().boundingBox()));
      const live = boxes.filter(Boolean) as { x: number; y: number; width: number; height: number }[];
      out.padsOnScreen = live.length;
      presses = await mashLoop(MASH_MS, async () => { const bx = live[Math.floor(Math.random() * live.length)]; await p.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2, { delay: 20 + Math.random() * 30 }); });
    }
    const taps = (await p.evaluate(() => (window as Any).__TAPS ?? 0)) - taps0;
    const src1 = await p.evaluate(SRC_NOW);
    out.presses = presses; out.judgeTaps = flip ? null : taps; out.sourcesStartedDuringMash = src1.started - src0.started;
    out.status = await p.evaluate(() => (document.querySelector('[data-qa="perform-status"]')?.textContent ?? '').slice(0, 80));
    // stop: PAUSE / STOP, then 3 s — anything still sounding is stuck
    if (flip) await p.getByRole('button', { name: 'STOP', exact: true }).first().click().catch(() => undefined);
    else await p.locator('[data-qa="perform-play"]').click().catch(() => undefined);
    await sleep(3000);
    out.afterStop = await p.evaluate(SRC_NOW);
    out.afterStopLevel = { engineOut: await level(p, ENGINE_OUT), soundKitOut: await level(p, SK_OUT) };
    out.engineRunning = await p.evaluate(() => !!(window as Any).__FEL_STUDIO__?.engine()?.running);
    out.heapAfter = await heapNow(p);
    out.heapDeltaMB = Math.round((out.heapAfter.usedMB - out.heapBefore.usedMB) * 10) / 10;
    await p.screenshot({ path: `${OUT}/${kind}.png` });
    if (phone) { await phone.phone.screenshot({ path: `${OUT}/${kind}-phone.png` }); }
  } catch (e) { out.fatal = String((e as Error)?.stack ?? e).slice(0, 1200); }
  finally { if (phone) await phone.ctx.close().catch(() => undefined); await ctx.close().catch(() => undefined); }
  out.pageErrors = R.errors.slice(errs0);
  return out;
}

async function dance(kind: string, b: Browser): Promise<Any> {
  const out: Any = { disk: assertDisk(kind) };
  const touch = kind.endsWith('-touchphone');
  const ctx = await b.newContext(touch ? PHONE_VIEW : DESKTOP);
  await ctx.addInitScript({ content: CAL });
  await ctx.addInitScript({ content: SOURCES });
  const p = await newPage(ctx, R.errors, kind);
  // THE TOUCH RIG HIDES WHILE A PAD IS LIVE (TouchOverlay.tsx: `if (!props.visible || props.bus.gamepadActive) return
  // null`) — the first touchphone run had INIT's fake pad connected and found 0 of the 4 move buttons. A phone has no
  // pad: take it away (registered after INIT, so it runs after it on every navigation).
  if (touch) await ctx.addInitScript({ content: "Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [null, null, null, null] });" });
  const errs0 = R.errors.length;
  let phone: { ctx: BrowserContext; phone: Page; cdp: CDPSession } | null = null;
  try {
    if (touch) {
      // no pad to wake the harness with: the runner's own START button (the phone player's first tap), then ?track= counts in
      await openDance(p, '?track=warmup');
      for (let i = 0; i < 100; i++) { const h = await p.evaluate(DANCE_HOOK); if ((h as Any).ok) break; await sleep(200); }
      await p.getByRole('button', { name: 'START', exact: true }).first().tap().catch(async () => p.getByRole('button', { name: 'START', exact: true }).first().click());
      for (let i = 0; i < 300; i++) { if (await p.evaluate(() => !!(window as Any).__DPERF?.running)) break; await sleep(100); }
      await p.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === 'TOP ROCK'), undefined, { timeout: 30000 }).catch(() => undefined);
    } else if (kind === 'dance-phone') {
      // pair on the pick screen (the P9 pad probe's order), then start the song from the phone's TOP ROCK
      await p.goto(`${BASE}/dev/mode/dance`, { waitUntil: 'domcontentloaded', timeout: 300000 });
      await p.waitForFunction(() => /· ready|· playing/.test(document.querySelector('pre')?.previousElementSibling?.textContent ?? ''), undefined, { timeout: 240000 });
      await p.locator('[data-testid="host-lobby-badge"]').first().click();
      await p.waitForSelector('[data-testid="host-lobby-panel"]', { timeout: 30000 });
      await p.getByRole('button', { name: 'Close controller link' }).click();
      phone = await pairPhone(b, p, /· ([A-Z0-9]{4,8})$/, 'SPIN');
      for (let i = 0; i < 100; i++) { const h = await p.evaluate(DANCE_HOOK); if ((h as Any).ok) break; await sleep(200); }
      await p.evaluate(() => (window as Any).__padBtn(9, 1)); await sleep(100); await p.evaluate(() => (window as Any).__padBtn(9, 0));
      await sleep(600);
      await phone.phone.getByRole('button', { name: 'TOP ROCK', exact: true }).tap();
      for (let i = 0; i < 300; i++) { if (await p.evaluate(() => !!(window as Any).__DPERF?.running)) break; await sleep(100); }
    } else {
      await danceStart(p, '?track=warmup', null);   // no intent driver: the masher is the only player
    }
    await sleep(1500);
    out.heapBefore = await heapNow(p);
    const hits0 = await p.evaluate(() => (window as Any).__HITS ?? 0);
    const src0 = await p.evaluate(SRC_NOW);
    let presses = 0;
    if (kind === 'dance-keys') {
      const K = ['j', 'k', 'l', 'i'];
      presses = await mashLoop(MASH_MS, async () => { const k = K[Math.floor(Math.random() * 4)]; await p.keyboard.down(k); await sleep(25 + Math.random() * 30); await p.keyboard.up(k); });
    } else if (kind === 'dance-pad') {
      presses = await p.evaluate(`(${PAD_MASH})(${JSON.stringify({ ms: MASH_MS, buttons: [0, 1, 2, 3, 7] })})`) as number;
    } else if (kind === 'dance-pointer') {
      const boxes = (await Promise.all(['TOP ROCK', 'TWO STEP', 'ARM WAVE', 'SPIN'].map((n) => p.getByRole('button', { name: n, exact: true }).first().boundingBox().catch(() => null)))).filter(Boolean) as { x: number; y: number; width: number; height: number }[];
      out.overlayButtons = boxes.length;
      // 0 of 4 on 1280×800 here: INIT's fake pad is connected, and the touch overlay hides while a pad is live
      // (TouchOverlay.tsx `props.bus.gamepadActive`) — the pointer / touch case for the Cypher is dance-touchphone (no pad)
      if (!boxes.length) out.note = 'the touch overlay is hidden while a pad is connected (INIT fake pad): the Cypher pointer/touch path is measured by dance-touchphone';
      else presses = await mashLoop(MASH_MS, async () => { const bx = boxes[Math.floor(Math.random() * boxes.length)]; await p.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2, { delay: 20 + Math.random() * 30 }); });
    } else if (kind === 'dance-phone' && phone) {
      const boxes = await Promise.all(['TOP ROCK', 'TWO STEP', 'ARM WAVE', 'SPIN'].map((n) => phone!.phone.getByRole('button', { name: n, exact: true }).first().boundingBox()));
      presses = await mashLoop(MASH_MS, async () => { await touchCentre(phone!.cdp, boxes[Math.floor(Math.random() * 4)]!); });
    } else if (kind === 'dance-touchphone') {
      const cdp = await cdpOf(p);
      const names = ['TOP ROCK', 'TWO STEP', 'ARM WAVE', 'SPIN']; const per = [0, 0, 0, 0]; const judged = [0, 0, 0, 0];
      const boxes = await Promise.all(names.map((n) => p.getByRole('button', { name: n, exact: true }).first().boundingBox().catch(() => null)));
      out.overlayButtons = boxes.filter(Boolean).length;
      presses = await mashLoop(TOUCH_MS, async () => {
        const i = Math.floor(Math.random() * 4); const bx = boxes[i]; if (!bx) return;
        const h0 = await p.evaluate(() => (window as Any).__HITS ?? 0);
        await touchCentre(cdp, bx); per[i]++; await sleep(40);   // the bus hands a touch to the mode on its next frame
        if ((await p.evaluate(() => (window as Any).__HITS ?? 0)) > h0) judged[i]++;
      });
      out.touch = { per, judgedBy: judged, names };
    }
    const hits = (await p.evaluate(() => (window as Any).__HITS ?? 0)) - hits0;
    out.presses = presses; out.judgeHits = hits;
    out.judge = await p.evaluate(() => { const d = (window as Any).__DPERF; return d ? { score: d.score, combo: d.combo, maxCombo: d.maxCombo, counts: d.counts } : null; });
    out.hud = await hud(p).then((h: Any) => ({ banner: h.banner, round: h.round, score: h.score })).catch(() => null);
    const src1 = await p.evaluate(SRC_NOW);
    out.sourcesStartedDuringMash = src1.started - src0.started;
    // stop: the harness's pause (pad START) — the song clock stops and the band must go quiet — then 3 s
    await p.evaluate(() => (window as Any).__padBtn(9, 1)); await sleep(100); await p.evaluate(() => (window as Any).__padBtn(9, 0));
    await sleep(3000);
    out.afterPause = await p.evaluate(SRC_NOW);
    out.afterPauseLevel = { out: await level(p, SK_OUT), musicBus: await level(p, SK_OUT.replace(/\.out$/, '.music')), sfxBus: await level(p, SK_OUT.replace(/\.out$/, '.sfx')) };
    out.pausedState = await p.evaluate(() => { try { return (window as Any).__FEL_DEV__.danceClock.state(); } catch { return null; } });
    out.heapAfter = await heapNow(p);
    out.heapDeltaMB = Math.round((out.heapAfter.usedMB - out.heapBefore.usedMB) * 10) / 10;
    await p.screenshot({ path: `${OUT}/${kind}.png` });
    if (phone) await phone.phone.screenshot({ path: `${OUT}/${kind}-phone.png` });
  } catch (e) { out.fatal = String((e as Error)?.stack ?? e).slice(0, 1200); }
  finally { if (phone) await phone.ctx.close().catch(() => undefined); await ctx.close().catch(() => undefined); }
  out.pageErrors = R.errors.slice(errs0);
  return out;
}

for (const kind of ONLY) {
  const b = await launch();
  try {
    log('mash', kind);
    R.runs[kind] = kind.startsWith('dance') ? await dance(kind, b) : await academy(kind, b);
    const r = R.runs[kind];
    log(kind, JSON.stringify({ presses: r.presses, judge: r.judgeTaps ?? r.judgeHits, srcDuring: r.sourcesStartedDuringMash, stop: r.afterStop ?? r.afterPause, level: r.afterStopLevel ?? r.afterPauseLevel, heapDeltaMB: r.heapDeltaMB, errors: r.pageErrors?.length, fatal: r.fatal?.slice(0, 300) }));
  } finally { await b.close(); }
  writeJson(`${OUT}/mash-proof.json`, R);
}
R.runtimeSec = Math.round((Date.now() - t0) / 1000);
writeJson(`${OUT}/mash-proof.json`, R);
log('wrote', `${OUT}/mash-proof.json`);
