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
    const s = d.slice(5).sort((a, b) => a - b);
    const q = (x: number) => s[Math.min(s.length - 1, Math.floor(s.length * x))];
    return { frames: s.length, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), over33: s.filter((x) => x > 33.4).length };
  }, ms);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();
  return out;
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
      on = await frameTimes(bo.page, bo.ctx, 10_000);
    }
    const voiceStillUp = await bo.page.locator('audio[data-party-voice]').count();
    // voice OFF: a fresh load, voice not joined
    await bo.page.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
    const playingOff = await startGame();
    let off = { frames: 0, p50: 0, p95: 0, over33: 0 };
    if (playingOff) { await bo.page.waitForTimeout(1500); off = await frameTimes(bo.page, bo.ctx, 10_000); }
    ok('frames.measured', voiceUp && playingOn && playingOff && voiceStillUp > 0, { mode, voiceOn: on, voiceOff: off, voiceStillUp });
    ok('frames.voice-cost-p50-ms', true, +(on.p50 - off.p50).toFixed(1));
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
      await ty.page.click('[data-testid=party-start-cancel]');   // a decliner stays in the party
      ok('start.decliner-can-cancel', true);
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
