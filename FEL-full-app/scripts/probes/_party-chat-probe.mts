// PARTY-CHAT PROBE (2026-10-13) — the PSN-style party, two (and three) real browsers against a real netd.
//
//   Ana (adult) starts a party → Bo (adult) joins by CODE → typed chat both ways → quick chat + emote captions →
//   Ty (a TEEN account) joins by LINK, knocks, is let in; his composer is locked AND a raw socket with his real ticket
//   cannot put typed text in the room → Ana and Bo join VOICE (fake mic) and connect peer-to-peer → frame time with voice
//   on vs off (phone profile) → Ana "Start together" 1v1 → both land in the SAME netd match room → back, still in the
//   party → Bo reloads and comes back as the same member → Ana removes Ty.
//
// Servers (stop by PID after):
//   server/netd:  PORT=8090 PARTY_TICKET_SECRET=<s> npx tsx src/index.ts
//   app:          NEXT_DIST_DIR=.next-party NEXT_PUBLIC_NETD_URL=ws://localhost:8090 PARTY_TICKET_SECRET=<s>
//                 NEXTAUTH_SECRET=<n> DATABASE_URL=<a throwaway db whose "User" rows carry dobYear> npx next dev -p 3290
//   probe:        NEXTAUTH_SECRET=<n> OUT=<dir> npx tsx scripts/probes/_party-chat-probe.mts
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { encode } from 'next-auth/jwt';

const BASE = `http://localhost:${process.env.PORT ?? '3290'}`;
const NETD = process.env.NETD_HTTP ?? 'http://localhost:8090';
const OUT = process.env.OUT ?? './party-chat-probe';
const SECRET = process.env.NEXTAUTH_SECRET ?? 'fel-party-local-probe';
const STAGES = (process.env.STAGES ?? 'core,chat,teen,voice,frames,start,reload,kick').split(',');
fs.mkdirSync(OUT, { recursive: true });

const results: Record<string, { pass: boolean; detail?: unknown }> = {};
const ok = (name: string, pass: boolean, detail?: unknown) => {
  results[name] = { pass, detail };
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
};
const shot = async (p: Page, name: string) => {
  try { await p.screenshot({ path: path.join(OUT, `${name}.png`), timeout: 60_000 }); } catch (e) { console.log(`(no shot ${name}: ${String(e).split('\n')[0]})`); }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser: Browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXE ?? '/opt/pw-browsers/chromium',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function person(sub: string, name: string, phone = false): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const token = await encode({ token: { sub, name, role: 'player', roleAt: Date.now(), profileId: null }, secret: SECRET });
  const ctx = await browser.newContext(phone
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['microphone'] }
    : { viewport: { width: 1280, height: 800 }, permissions: ['microphone'] });
  await ctx.addCookies([{ name: '__session', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });   // tsx's helper, inside page.evaluate bodies
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message.slice(0, 200)}`));
  return { ctx, page, errors };
}

const openPanel = async (p: Page) => {
  if (await p.locator('[data-testid=party-panel]').count()) return;
  await p.locator('[data-testid=party-bar] button').first().click();
  await p.locator('[data-testid=party-panel]').waitFor({ timeout: 15_000 });
};
const closePanel = async (p: Page) => {
  if (await p.locator('[data-testid=party-panel]').count()) await p.keyboard.press('Escape');
};
const members = (p: Page) => p.locator('[data-testid=party-member]').evaluateAll((els) => els.map((e) => e.getAttribute('data-name')));
const feedText = (p: Page) => p.locator('[data-testid=party-feed]').innerText().catch(() => '');

const ana = await person('party-adult-a', 'Ana');
const bo = await person('party-adult-b', 'Bo', true);
const t0 = Date.now();
let code = '';

try {
  // ── CORE: create, join by code, presence, host ──
  await ana.page.goto(`${BASE}/party`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  await ana.page.locator('main[data-live="1"]').waitFor({ timeout: 240_000 });
  await ana.page.fill('[data-testid=party-name]', 'Ana');
  await ana.page.click('[data-testid=party-create]');
  code = (await ana.page.locator('[data-testid=party-code]').first().innerText({ timeout: 30_000 })).trim();
  ok('core.create', /^[2-9A-HJKMNP-Z]{6}$/.test(code), { code, ms: Date.now() - t0 });
  await shot(ana.page, '01-ana-created');

  await bo.page.goto(`${BASE}/party`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  await bo.page.locator('main[data-live="1"]').waitFor({ timeout: 240_000 });
  await bo.page.fill('[data-testid=party-name]', 'Bo');
  await bo.page.fill('[data-testid=party-join-code]', code.toLowerCase().slice(0, 3) + '-' + code.slice(3));
  await bo.page.click('[data-testid=party-join]');
  await bo.page.locator('[data-testid=party-code]').first().waitFor({ timeout: 30_000 });
  await openPanel(ana.page);
  await ana.page.waitForFunction(() => document.querySelectorAll('[data-testid=party-member]').length === 2, null, { timeout: 15_000 });
  ok('core.join-by-code', JSON.stringify(await members(ana.page)) === JSON.stringify(['ANA', 'BO']), await members(ana.page));
  await openPanel(bo.page);
  const crown = await bo.page.locator('[data-testid=party-member][data-name=ANA] [aria-label=Host]').count();
  ok('core.host-shown', crown === 1);
  await shot(bo.page, '02-bo-phone-panel');

  // persists across client navigation: Ana goes to /play via a link, the bar is still there, same party
  await closePanel(ana.page);
  await ana.page.evaluate(() => { (window as unknown as { next?: { router?: { push(u: string): void } } }).next?.router?.push('/play'); });
  await ana.page.waitForURL(/\/play$/, { timeout: 120_000 });
  await ana.page.locator('[data-testid=party-bar]').waitFor({ timeout: 60_000 });
  ok('core.persists-across-navigation', (await ana.page.locator('[data-testid=party-bar]').innerText()).includes('2 in party'));
  await shot(ana.page, '03-ana-play-with-bar');

  // ── CHAT: typed (adults), quick chat, emotes ──
  if (STAGES.includes('chat')) {
    await openPanel(ana.page);
    await ana.page.fill('[data-testid=party-chat-input]', 'hello bo, what the fuck');
    await ana.page.click('[data-testid=party-chat-send]');
    await bo.page.waitForFunction(() => document.querySelector('[data-testid=party-feed]')?.textContent?.includes('hello bo'), null, { timeout: 10_000 });
    const boFeed = await feedText(bo.page);
    ok('chat.text-delivered', boFeed.includes('hello bo'));
    ok('chat.profanity-masked', boFeed.includes('what the ****') && !boFeed.includes('fuck'), boFeed.split('\n').slice(-1));
    await bo.page.click('[data-testid=party-quick-gg]');
    await bo.page.click('[data-testid=party-emote-fire]');
    await ana.page.waitForFunction(() => document.querySelector('[data-testid=party-feed]')?.textContent?.includes('Fire'), null, { timeout: 10_000 });
    const sr = await ana.page.locator('[data-testid=party-caption-sr]').innerText();
    ok('chat.quick-and-emote', (await feedText(ana.page)).includes('GG!') && sr.includes('BO'), { sr });
    await shot(ana.page, '04-ana-chat');
    await shot(bo.page, '05-bo-phone-chat');
  }

  // ── TEEN: knocks, let in, presets only; his typed text never reaches the room (real ticket, real DB age) ──
  if (STAGES.includes('teen')) {
    const ty = await person('party-teen', 'Ty', true);
    await ty.page.goto(`${BASE}/party`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
    await ty.page.locator('main[data-live="1"]').waitFor({ timeout: 240_000 });
    await ty.page.fill('[data-testid=party-name]', 'Ty');
    await ty.page.goto(`${BASE}/party/${code}`, { waitUntil: 'domcontentloaded' });   // the invite link (what the QR opens)
    await ty.page.locator('main[data-live="1"]').waitFor({ timeout: 120_000 });
    ok('teen.invite-link-fills-code', (await ty.page.inputValue('[data-testid=party-join-code]')) === code);
    await ty.page.fill('[data-testid=party-name]', 'Ty');
    await ty.page.click('[data-testid=party-join]');
    await ty.page.locator('[data-testid=party-waiting]').waitFor({ timeout: 60_000 });
    ok('teen.knocks', true);
    await openPanel(ana.page);
    await ana.page.locator('[data-testid=party-knock] button').first().click();
    await ty.page.locator('[data-testid=party-code]').first().waitFor({ timeout: 15_000 });
    await openPanel(ty.page);
    ok('teen.text-locked-in-ui', (await ty.page.locator('[data-testid=party-text-locked]').count()) === 1 && (await ty.page.locator('[data-testid=party-chat-input]').count()) === 0);
    ok('teen.no-voice-button', (await ty.page.locator('[data-testid=party-voice-join]').count()) === 0);
    // a modified client: Ty's own ticket from the real route, a raw socket, let in by Ana, then a typed line
    await ty.page.evaluate(async ({ code, netd }) => {
      const w = window as unknown as { __raw: { adult?: boolean; frames: string[]; err?: string } };
      w.__raw = { frames: [] };
      const t = await (await fetch('/api/party/ticket?name=ty2')).json();
      w.__raw.adult = t.adult;
      const ws = new WebSocket(netd.replace('http', 'ws') + '/party');
      ws.onopen = () => ws.send(JSON.stringify({ t: 'p_hello', v: 1, code, ticket: t.ticket, name: 'ty2' }));
      ws.onmessage = (e) => {
        const f = JSON.parse(e.data); w.__raw.frames.push(f.t);
        if (f.t === 'p_state' && !w.__raw.frames.includes('sent')) { w.__raw.frames.push('sent'); ws.send(JSON.stringify({ t: 'p_chat', text: 'TEEN-RAW-LINE meet me' })); }
        if (f.t === 'p_error') { w.__raw.err = f.code; ws.send(JSON.stringify({ t: 'p_leave' })); }
      };
    }, { code, netd: NETD });
    await ana.page.locator('[data-testid=party-knock] button').first().click({ timeout: 15_000 });
    await ty.page.waitForFunction(() => !!(window as unknown as { __raw: { err?: string } }).__raw.err, null, { timeout: 15_000 });
    const raw = await ty.page.evaluate(() => (window as unknown as { __raw: unknown }).__raw) as { adult: boolean; err: string };
    await sleep(800);
    const leaked = (await feedText(ana.page)).includes('TEEN-RAW-LINE') || (await feedText(bo.page)).includes('TEEN-RAW-LINE');
    ok('teen.ticket-from-db-says-teen', raw.adult === false, raw);
    ok('teen.server-refuses-typed-text', raw.err === 'text_adults_only', raw.err);
    ok('teen.raw-text-never-reaches-room', !leaked);
    await ty.page.click('[data-testid=party-quick-hi]');
    await ana.page.waitForFunction(() => document.querySelector('[data-testid=party-feed]')?.textContent?.includes('Hey!'), null, { timeout: 10_000 });
    ok('teen.quick-chat-works', true);
    await shot(ty.page, '06-teen-phone-panel');
    (globalThis as { __ty?: typeof ty }).__ty = ty;
  }

  const extra = await import(path.resolve(path.dirname(new URL(import.meta.url).pathname), '_party-chat-probe-more.mts')).catch(() => null);
  if (extra) await extra.default({ ana, bo, ty: (globalThis as { __ty?: { page: Page; ctx: BrowserContext } }).__ty, code, ok, shot, sleep, BASE, NETD, STAGES, openPanel, closePanel, members, feedText, OUT });
} catch (e) {
  ok('probe.no-exception', false, String(e).split('\n').slice(0, 3).join(' | '));
  await shot(ana.page, 'zz-ana-at-failure');
  await shot(bo.page, 'zz-bo-at-failure');
}

const errs = [...ana.errors, ...bo.errors];
ok('probe.no-page-errors', errs.length === 0, errs.slice(0, 5));
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
const failed = Object.entries(results).filter(([, r]) => !r.pass).map(([k]) => k);
console.log(failed.length ? `FAILED: ${failed.join(', ')}` : `ALL ${Object.keys(results).length} PASS`);
await browser.close();
process.exit(failed.length ? 1 : 0);
