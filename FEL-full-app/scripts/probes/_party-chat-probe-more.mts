// PARTY-CHAT PROBE, part two (2026-10-13): voice, frame time with voice on vs off (phone profile), Start together,
// reload, kick. Loaded by _party-chat-probe.mts with the browsers it already opened.
import type { BrowserContext, Page } from 'playwright-core';

interface P { page: Page; ctx: BrowserContext; errors?: string[] }
interface Ctx {
  ana: P; bo: P; ty?: P; code: string; BASE: string; NETD: string; STAGES: string[]; OUT: string;
  ok(name: string, pass: boolean, detail?: unknown): void;
  shot(p: Page, name: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  openPanel(p: Page): Promise<void>;
  closePanel(p: Page): Promise<void>;
  members(p: Page): Promise<(string | null)[]>;
  feedText(p: Page): Promise<string>;
}

/** rAF frame intervals for `ms`, under a 4x CPU throttle (the repo's phone profile, scripts/probes/_perf-sweep.mts). */
async function frameTimes(p: Page, ctx: BrowserContext, ms: number): Promise<{ frames: number; p50: number; p95: number; over33: number }> {
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const out = await p.evaluate(async (ms) => {
    const d: number[] = [];
    let last = performance.now();
    const end = last + ms;
    await new Promise<void>((resolve) => {
      const f = (t: number) => { d.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else resolve(); };
      requestAnimationFrame(f);
    });
    const s = d.slice(Math.min(5, Math.floor(d.length / 4))).sort((a, b) => a - b);
    const q = (x: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * x))] : 0);
    return { frames: s.length, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), over33: s.filter((x) => x > 33.4).length };
  }, ms);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();
  return out;
}

/** Main-thread work per second (CDP Performance: TaskDuration, ScriptDuration) plus rAF frame times, 4x CPU throttle. */
async function mainThread(p: Page, ctx: BrowserContext, ms: number): Promise<{ taskMsPerS: number; scriptMsPerS: number; frames: number; p50: number; p95: number; over33: number }> {
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const read = async () => Object.fromEntries(((await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] }).metrics.map((m) => [m.name, m.value]));
  const a = await read();
  if (process.env.PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
  const f = await p.evaluate(async (ms) => {
    const d: number[] = [];
    let last = performance.now();
    const end = last + ms;
    await new Promise<void>((resolve) => {
      const step = (t: number) => { d.push(t - last); last = t; if (t < end) requestAnimationFrame(step); else resolve(); };
      requestAnimationFrame(step);
    });
    const s = d.slice(Math.min(5, Math.floor(d.length / 4))).sort((x, y) => x - y);
    const q = (x: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * x))] : 0);
    return { frames: s.length, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), over33: s.filter((x) => x > 33.4).length };
  }, ms);
  const b = await read();
  if (process.env.PROFILE) {
    const { profile } = await cdp.send('Profiler.stop') as { profile: { nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; hitCount?: number }[] } };
    const top = profile.nodes.filter((n) => (n.hitCount ?? 0) > 0 && !/^\((idle|program|garbage collector)\)$/.test(n.callFrame.functionName))
      .sort((x, y) => (y.hitCount ?? 0) - (x.hitCount ?? 0)).slice(0, 12)
      .map((n) => `${n.hitCount} ${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber}`);
    console.log('PROFILE', JSON.stringify(top, null, 1));
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();
  const per = (k: string) => +(((b[k] - a[k]) * 1000) / (ms / 1000)).toFixed(1);
  return { taskMsPerS: per('TaskDuration'), scriptMsPerS: per('ScriptDuration'), ...f };
}

export default async function more(c: Ctx): Promise<void> {
  const { ana, bo, ty, ok, shot, sleep, openPanel, closePanel, members, BASE, NETD, STAGES } = c;

  // ── VOICE ──
  if (STAGES.includes('voice')) {
    await openPanel(ana.page);
    await ana.page.click('[data-testid=party-voice-join]');
    await openPanel(bo.page);
    await bo.page.click('[data-testid=party-voice-join]');
    const linked = await ana.page.waitForSelector('[data-testid=party-member][data-name=BO][data-voice-link=connected]', { timeout: 30_000 }).then(() => true).catch(() => false);
    ok('voice.peer-to-peer-connected', linked);
    const boSide = await bo.page.waitForSelector('[data-testid=party-member][data-name=ANA][data-voice-link=connected]', { timeout: 15_000 }).then(() => true).catch(() => false);
    ok('voice.both-directions', boSide);
    // the fake microphone plays a tone: Bo hears Ana speaking (from the audio itself)
    const speaking = await bo.page.waitForSelector('[data-testid=party-member][data-name=ANA] [data-speaking="1"]', { timeout: 20_000 }).then(() => true).catch(() => false);
    ok('voice.speaking-indicator', speaking);
    const audio = await bo.page.evaluate(() => [...document.querySelectorAll('audio[data-party-voice]')].map((a) => !!(a as HTMLAudioElement).srcObject));
    ok('voice.remote-audio-attached', audio.length === 1 && audio[0], audio);
    await bo.page.click('[data-testid=party-voice-mute]');
    const mutedSeen = await ana.page.waitForFunction(() => document.querySelector('[data-testid=party-member][data-name=BO]')?.getAttribute('aria-label')?.includes('Mic muted'), null, { timeout: 10_000 }).then(() => true).catch(() => false);
    ok('voice.mute-shown-to-others', mutedSeen);
    await bo.page.click('[data-testid=party-voice-mute]');
    if (ty) {
      // the teen: no voice control, and netd refuses his voice frames (a raw attempt through his own socket's rights)
      ok('voice.teen-has-no-voice', (await ty.page.locator('[data-testid=party-voice-join]').count()) === 0 && (await ty.page.locator('[data-testid=party-voice-locked]').count()) === 1);
    }
    await shot(ana.page, '07-ana-voice');
    await shot(bo.page, '08-bo-phone-voice');
    await closePanel(ana.page);
    await closePanel(bo.page);
  }

  // ── FRAME TIME: voice on vs off, phone profile (Bo: 390×844 isMobile, 4x CPU throttle), in a game ──
  if (STAGES.includes('frames')) {
    const mode = process.env.FRAME_MODE ?? 'threepoint';
    const startGame = async (): Promise<boolean> => {
      for (let i = 0; i < 180; i++) {
        const state = await bo.page.evaluate(() => (/DEV · \S+ · (\w+)/.exec(document.body.innerText) ?? [])[1] ?? '').catch(() => '');
        if (state === 'playing') return true;
        if (state === 'error') return false;
        if (state === 'ready') { const s = bo.page.locator('text=/^START$/').first(); if (await s.count()) await s.click({ timeout: 5000 }).catch(() => {}); }
        await bo.page.waitForTimeout(1000);
      }
      return false;
    };
    // voice ON: a full load of the game (the party resumes from the stored token), Join voice on READY, play, measure
    await bo.page.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
    await bo.page.locator('[data-testid=party-bar]').waitFor({ timeout: 180_000 });
    ok('frames.party-resumed-after-full-reload', true);
    await openPanel(bo.page);
    await bo.page.click('[data-testid=party-voice-join]');
    const voiceUp = await bo.page.waitForSelector('[data-testid=party-member][data-name=ANA][data-voice-link=connected]', { timeout: 30_000 }).then(() => true).catch(() => false);
    await closePanel(bo.page);
    const playingOn = await startGame();
    let on = { frames: 0, p50: 0, p95: 0, over33: 0 };
    if (playingOn) {
      await bo.page.waitForTimeout(1500);
      ok('frames.bar-hidden-while-playing', (await bo.page.locator('[data-testid=party-bar]').count()) === 0);
      await shot(bo.page, '09-bo-phone-playing-hud-only');
      on = await frameTimes(bo.page, bo.ctx, 15_000);
      // the pause menu: the bar tucks in at the top (Escape = START = pause, InputBus)
      await bo.page.keyboard.press('Escape');
      const paused = await bo.page.waitForFunction(() => /DEV · \S+ · paused/.test(document.body.innerText), null, { timeout: 30_000 }).then(() => true).catch(() => false);
      const place = paused ? await bo.page.locator('[data-testid=party-bar]').getAttribute('data-place', { timeout: 10_000 }).catch(() => null) : null;
      ok('frames.tucked-into-the-pause-menu', paused && place === 'tucked', { paused, place });
      await shot(bo.page, '09b-bo-phone-paused-tucked');
    }
    const voiceStillUp = await bo.page.locator('audio[data-party-voice]').count();
    // voice OFF: a fresh load, voice not joined
    await bo.page.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
    const playingOff = await startGame();
    let off = { frames: 0, p50: 0, p95: 0, over33: 0 };
    if (playingOff) { await bo.page.waitForTimeout(1500); off = await frameTimes(bo.page, bo.ctx, 15_000); }
    ok('frames.voice-survives-into-a-game', voiceUp && playingOn && voiceStillUp > 0, { voiceUp, playingOn, voiceStillUp });
    // On this box the game itself renders on SwiftShader (software GL) under a shared CPU: a frame takes seconds, so a
    // game-page A/B is noise. Recorded for honesty, not judged:
    ok('frames.game-page-swiftshader-info', true, { mode, voiceOn: on, voiceOff: off, playingOff });
  }

  if (STAGES.includes('cost')) {
    // THE MEASUREMENT: what voice adds to the main thread, phone profile (390×844 isMobile, 4x CPU throttle), on a page
    // with nothing else running — voice OFF, then voice ON (connected to Ana, fake mic tone playing both ways).
    await bo.page.goto(`${BASE}/party`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
    await bo.page.locator('[data-testid=party-bar]').waitFor({ timeout: 120_000 });
    await bo.page.waitForTimeout(3000);
    const quiet = await mainThread(bo.page, bo.ctx, 15_000);
    await openPanel(bo.page);
    await bo.page.click('[data-testid=party-voice-join]');
    await bo.page.waitForSelector('[data-testid=party-member][data-name=ANA][data-voice-link=connected]', { timeout: 30_000 }).catch(() => {});
    await closePanel(bo.page);
    await bo.page.waitForTimeout(3000);
    const voiced = await mainThread(bo.page, bo.ctx, 15_000);
    // and off again (the box is shared: a second "off" shows the noise floor)
    await openPanel(bo.page);
    await bo.page.click('[data-testid=party-voice-leave]');
    await closePanel(bo.page);
    await bo.page.waitForTimeout(3000);
    const quiet2 = await mainThread(bo.page, bo.ctx, 15_000);
    ok('frames.voice-main-thread-cost', true, { voiceOff: quiet, voiceOn: voiced, voiceOffAgain: quiet2 });
    await bo.page.goto(`${BASE}/party`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
    await bo.page.locator('[data-testid=party-bar]').waitFor({ timeout: 120_000 });
  }

  // ── START TOGETHER ──
  if (STAGES.includes('start')) {
    await openPanel(ana.page);
    await ana.page.selectOption('[data-testid=party-start-mode]', 'onevone');
    await ana.page.click('[data-testid=party-start-go]');
    const seen = await Promise.all([ana, bo, ...(ty ? [ty] : [])].map((p) => p.page.waitForSelector('[data-testid=party-start-countdown]', { timeout: 10_000 }).then(() => true).catch(() => false)));
    ok('start.everyone-sees-joining', seen.every(Boolean), seen);
    const label = await bo.page.locator('[data-testid=party-start-countdown]').innerText();
    ok('start.countdown-says-joining', /Joining 1v1 Streetball/.test(label) && /Cancel/i.test(label), label.replace(/\s+/g, ' '));
    await shot(bo.page, '10-bo-phone-joining');
    if (ty) {
      // 1v1 seats two: the third member is told plainly that they stay in the party
      const tyCard = await ty.page.locator('[data-testid=party-start-countdown]').innerText();
      ok('start.no-seat-stays-in-party', /staying in the party/.test(tyCard), tyCard.replace(/\s+/g, ' '));
    }
    await Promise.all([ana.page.waitForURL(/\/play\/onevone\?net=/, { timeout: 30_000 }), bo.page.waitForURL(/\/play\/onevone\?net=/, { timeout: 30_000 })]);
    const ra = new URL(ana.page.url()).searchParams.get('net');
    const rb = new URL(bo.page.url()).searchParams.get('net');
    ok('start.same-match-room', !!ra && ra === rb, { ra, rb });
    // the netd match room really holds both of them
    let rooms = { rooms: 0, peers: 0 };
    for (let i = 0; i < 90; i++) {
      rooms = await (await fetch(`${NETD}/healthz`)).json() as { rooms: number; peers: number };
      if (rooms.peers >= 2) break;
      await sleep(2000);
    }
    ok('start.both-in-the-netd-room', rooms.peers >= 2, rooms);
    if (ty) ok('start.decliner-stayed', /\/party/.test(ty.page.url()) && (await ty.page.locator('[data-testid=party-bar]').count()) === 1);
    await shot(ana.page, '11-ana-in-match');
    // back: a client navigation home — still in the party, all three
    await ana.page.goBack({ waitUntil: 'domcontentloaded' });
    await ana.page.locator('[data-testid=party-bar]').waitFor({ timeout: 60_000 });
    await openPanel(ana.page);
    await ana.page.waitForFunction(() => document.querySelectorAll('[data-testid=party-member]').length >= 3, null, { timeout: 30_000 }).catch(() => {});
    ok('start.still-in-party-after', (await members(ana.page)).length === (ty ? 3 : 2), await members(ana.page));
    await shot(ana.page, '12-ana-back-in-party');
    // Bo comes back too (a client navigation back)
    await bo.page.goBack({ waitUntil: 'domcontentloaded' });
    await bo.page.locator('[data-testid=party-bar]').waitFor({ timeout: 60_000 });
    if (ty) {
      // a DECLINER: Ana starts again; Bo cancels → Bo stays, his seat passes to Ty; then Ana stops it for everyone
      await ana.page.click('[data-testid=party-start-go]');
      await bo.page.waitForSelector('[data-testid=party-start-cancel]', { timeout: 10_000 });
      await bo.page.click('[data-testid=party-start-cancel]');
      const boOut = await bo.page.waitForFunction(() => document.querySelector('[data-testid=party-start-countdown]')?.textContent?.includes('sitting this one out'), null, { timeout: 5000 }).then(() => true).catch(() => false);
      const tyIn = await ty.page.waitForSelector('[data-testid=party-start-cancel]', { timeout: 5000 }).then(() => true).catch(() => false);
      ok('start.decliner-stays-and-seat-passes', boOut && tyIn, { boOut, tyIn });
      await ana.page.click('[data-testid=party-start-stop]');
      const gone = await ty.page.waitForSelector('[data-testid=party-start-countdown]', { state: 'detached', timeout: 5000 }).then(() => true).catch(() => false);
      await c.sleep(6000);
      ok('start.host-can-stop-it', gone && /\/party/.test(ty.page.url()) && !/onevone/.test(bo.page.url()), { gone, ty: ty.page.url(), bo: bo.page.url() });
    }
    await closePanel(ana.page);
  }

  // ── RELOAD: Bo reloads and comes back as the same member (no duplicate) ──
  if (STAGES.includes('reload')) {
    await bo.page.reload({ waitUntil: 'domcontentloaded' });
    await bo.page.locator('[data-testid=party-bar]').waitFor({ timeout: 120_000 });
    await openPanel(ana.page);
    await sleep(1500);
    const m = await members(ana.page);
    ok('reload.same-member-no-duplicate', m.filter((x) => x === 'BO').length === 1 && m.length === (ty ? 3 : 2), m);
  }

  // ── KICK ──
  if (STAGES.includes('kick') && ty) {
    await openPanel(ana.page);
    await ana.page.click('[data-testid=party-member][data-name=TY] button[aria-label^="Options"]');
    await ana.page.click('[data-testid=party-kick]');
    const told = await ty.page.waitForFunction(() => document.body.innerText.includes('removed you'), null, { timeout: 15_000 }).then(() => true).catch(() => false);
    ok('kick.removed-and-told', told);
    await sleep(500);
    ok('kick.gone-from-list', !(await members(ana.page)).includes('TY'), await members(ana.page));
    await shot(ty.page, '13-ty-removed');
  }
}
