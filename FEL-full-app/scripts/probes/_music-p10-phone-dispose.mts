// MUSIC-SUITE P10 (2026-09-29) — OOM / DISPOSE: THE PHONE ROOM. A phone paired to each room (the Academy's PERFORM, the
// Cypher's dance pad), then the room LEFT the way a player leaves it inside the app (window.next.router to a route that
// mounts nothing) — what the room left open: every RTCPeerConnection the host page made (connectionState / signaling
// state, by WeakRef), every RTCDataChannel's readyState, the controller-link requests the host sent on the way out, what
// the PHONE shows after (its header), and the host's AudioContexts / WebGL contexts (_p10-lib CONTEXTS).
import fs from 'node:fs';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { BASE, assertDisk, launch, newPage, openAcademy, openDance, leaveRoom, writeJson, sleep, CONTEXTS, OUT_ROOT, DESKTOP, type Any } from './_p10-lib.mts';

const OUT = `${OUT_ROOT}/perf`;
fs.mkdirSync(OUT, { recursive: true });
const R: Any = { at: new Date().toISOString(), rooms: {}, errors: [] as string[] };
const RTC_INIT = `(() => {
  window.__RTC = []; window.__DC = [];
  const O = window.RTCPeerConnection;
  if (O && !O.__p10) {
    const W = class extends O {
      constructor(...a) { super(...a); window.__RTC.push(new WeakRef(this)); this.addEventListener('datachannel', (e) => window.__DC.push(new WeakRef(e.channel))); }
      createDataChannel(...a) { const c = super.createDataChannel(...a); window.__DC.push(new WeakRef(c)); return c; }
    };
    W.__p10 = true; window.RTCPeerConnection = W;
  }
})()`;
const RTC_NOW = `(() => ({
  pcs: (window.__RTC || []).map((r) => { const c = r.deref(); return c ? c.connectionState + '/' + c.signalingState : 'collected'; }),
  dcs: (window.__DC || []).map((r) => { const c = r.deref(); return c ? c.readyState : 'collected'; }),
}))()`;

async function pairPhone(b: Browser, host: Page, badgeRe: RegExp, ready: string): Promise<{ ctx: BrowserContext; phone: Page }> {
  await host.waitForFunction((src) => new RegExp(src).test((document.querySelector('[data-testid="host-lobby-badge"]')?.textContent ?? '').trim()), badgeRe.source, { timeout: 60000 });
  const code = new RegExp(badgeRe.source).exec(((await host.locator('[data-testid="host-lobby-badge"]').first().textContent()) ?? '').trim())?.[1] ?? '';
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const phone = await ctx.newPage();
  await phone.goto(`${BASE}/controller/${code}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await phone.getByRole('button', { name: 'JOIN' }).click({ timeout: 120000 });
  await phone.waitForFunction(() => /Connected/.test(document.querySelector('header')?.textContent ?? ''), undefined, { timeout: 60000 });
  await phone.getByRole('button', { name: ready, exact: true }).waitFor({ timeout: 30000 });
  return { ctx, phone };
}

async function room(which: 'academy' | 'cypher'): Promise<Any> {
  const out: Any = { disk: assertDisk(which) };
  const b = await launch();
  try {
    const ctx = await b.newContext(DESKTOP);
    await ctx.addInitScript({ content: RTC_INIT });
    const host = await newPage(ctx, R.errors, which);
    const reqs: { t: number; r: string }[] = [];
    host.on('request', (r) => { if (r.url().includes('/api/controller-link')) reqs.push({ t: Date.now(), r: `${r.method()} ${r.url().replace(BASE, '')}` }); });
    let pair: { ctx: BrowserContext; phone: Page };
    if (which === 'academy') {
      await openAcademy(host, '/dev/music?stage=studio&player=p10phone');
      await host.getByRole('button', { name: 'PERFORM', exact: true }).click();
      await host.locator('[data-qa="perform-pair-phone"]').click();
      pair = await pairPhone(b, host, /^([A-Z0-9]{4,8}) ·/, '16');
    } else {
      await openDance(host, '');
      await host.locator('[data-testid="host-lobby-badge"]').first().click();
      await host.waitForSelector('[data-testid="host-lobby-panel"]', { timeout: 30000 });
      await host.getByRole('button', { name: 'Close controller link' }).click();
      pair = await pairPhone(b, host, /· ([A-Z0-9]{4,8})$/, 'SPIN');
    }
    await sleep(1500);
    out.paired = { host: await host.evaluate(RTC_NOW), phoneHeader: await pair.phone.evaluate(() => document.querySelector('header')?.textContent ?? '') };
    const n0 = reqs.length;
    await leaveRoom(host);
    const left = Date.now();   // the new route is on screen and 1.5 s have passed (leaveRoom)
    await sleep(4000);
    out.afterLeave = { host: await host.evaluate(RTC_NOW), contexts: await host.evaluate(CONTEXTS).then((c: Any) => ({ liveAudio: c.acs.filter((a: Any) => a.state !== 'closed' && a.state !== 'collected').map((a: Any) => ({ state: a.state, who: a.who })), liveGl: c.liveGl })),
      requestsDuringLeave: reqs.slice(n0).filter((x) => x.t < left).map((x) => x.r),
      requestsAfterLeft: reqs.filter((x) => x.t >= left).map((x) => `+${x.t - left}ms ${x.r}`), phoneHeader: await pair.phone.evaluate(() => document.querySelector('header')?.textContent ?? '') };
    // MUSIC-SUITE P10 FIX (2026-09-29): HOW LONG THE PHONE SAYS "Connected" after the host left. The first run saw it
    // still Connected 5.5 s after the host's peer connection closed and stopped looking. Now its header is polled every
    // 500 ms for POLL_SEC more (from the moment the new route was on screen): the first time it stops saying
    // Connected, and what it says then — or that it never did inside the window.
    const POLL_SEC = Number(process.env.POLL_SEC ?? 30);
    const polls: { ms: number; header: string }[] = [];
    let droppedAtMs: number | null = null;
    while (Date.now() - left < POLL_SEC * 1000) {
      const header = await pair.phone.evaluate(() => document.querySelector('header')?.textContent ?? '');
      const ms = Date.now() - left;
      if (!polls.length || polls[polls.length - 1].header !== header) polls.push({ ms, header });
      if (droppedAtMs === null && !/Connected/.test(header)) { droppedAtMs = ms; break; }
      await sleep(500);
    }
    out.phoneAfterHostLeft = { pollSec: POLL_SEC, droppedAtMs, headerChanges: polls, verdict: droppedAtMs === null ? `still "Connected" ${POLL_SEC} s after the host left` : `showed "${polls[polls.length - 1].header}" ${(droppedAtMs / 1000).toFixed(1)} s after the host left` };
    await pair.phone.screenshot({ path: `${OUT}/phone-after-leave-${which}.png` });
    await pair.ctx.close();
    await ctx.close();
  } catch (e) { out.fatal = String((e as Error)?.stack ?? e).slice(0, 1200); }
  finally { await b.close(); }
  return out;
}

R.rooms.academy = await room('academy');
console.log('academy', JSON.stringify(R.rooms.academy).slice(0, 1200));
R.rooms.cypher = await room('cypher');
console.log('cypher', JSON.stringify(R.rooms.cypher).slice(0, 1200));
writeJson(`${OUT}/phone-dispose-proof.json`, R);
console.log('errors', R.errors);
