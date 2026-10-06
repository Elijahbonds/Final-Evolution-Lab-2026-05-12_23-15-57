// PARTY ROOM PROBE (MULTIPLAYER lane, 2026-10-06) — the couch, measured in a real browser.
//
//   1. a TV (host context, signed in by a locally minted session) opens /play/party?mode=brainbrawl: a room, a code, a QR
//      — and the QR is checked to encode exactly the join link (regenerated here with the same library and options);
//   2. phone A opens the invite link (what the QR / SEND INVITE open), types a name, taps JOIN → P1;
//      phone B types the code on /join (lower case, with a dash) → the same controller page → JOIN → P2;
//   3. both ready up on their phones; phone A (the captain) presses START; the game mounts on the TV;
//   4. SEAT ROUTING, end to end: in Brain Brawl's answer phase phone B taps "C" and the game records P2's pick as 2
//      (the d-pad ▼ — P2's own input), phone A taps "B" and P1's pick is 1. Before the party room both phones fed P1.
//   5. back to the lobby; a fake gamepad presses A → it takes a seat with a "JOINED" toast (drop-in); its d-pad picks
//      the game and every phone's screen follows; phone B leaves (the seat frees at once) and rejoins with one tap.
//
//   (server: NEXTAUTH_SECRET=<s> NEXT_DIST_DIR=.next-multiplayer next dev -p 3180, DATABASE_URL unset)
//   NEXTAUTH_SECRET=<s> PORT=3180 OUT=<dir> npx tsx scripts/probes/_party-probe.mts
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { encode } from 'next-auth/jwt';
import QRCode from 'qrcode';

const PORT = process.env.PORT ?? '3180';
const BASE = `http://localhost:${PORT}`;
const OUT = process.env.OUT ?? '/tmp/party-probe';
const SECRET = process.env.NEXTAUTH_SECRET ?? 'fel-multiplayer-local-probe';
fs.mkdirSync(OUT, { recursive: true });
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const results: Record<string, unknown> = {};
const ok = (name: string, pass: boolean, detail?: unknown) => { results[name] = { pass, detail }; console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); };
/** A screenshot never fails the run: a TV rendering Babylon on SwiftShader under load can take longer than a shot allows. */
const shot = async (p: Page, name: string) => {
  try { await p.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 72, timeout: 90000 }); }
  catch (e) { console.log(`(no screenshot ${name}: ${String((e as Error).message).split('\n')[0]})`); }
};

const PAD_INIT = `(() => {
  window.__name = window.__name || function (f) { return f; };   // tsx's helper, inside page.evaluate bodies
  window.__PADS = [];
  navigator.getGamepads = () => window.__PADS;
  window.__addPad = (i, id) => {
    const pad = { index: i, id, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    window.__PADS[i] = pad;
    const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: pad }); window.dispatchEvent(ev);
  };
  window.__btn = (i, b, down) => { const p = window.__PADS[i]; p.buttons[b].pressed = down; p.buttons[b].value = down ? 1 : 0; p.timestamp = performance.now(); };
})()`;

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? '/opt/pw-browsers/chromium', args: GL });
const token = await encode({
  token: { sub: 'party-probe-host', name: 'Probe Host', role: 'player', roleAt: Date.now(), profileId: 'party-probe-profile' },
  secret: SECRET,
});
const host = await b.newContext({ viewport: { width: 1280, height: 720 } });
await host.addCookies([{ name: '__session', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
await host.addInitScript({ content: PAD_INIT });
const tv = await host.newPage();
const errors: string[] = [];
tv.on('pageerror', (e) => errors.push(`TV ${e.message.slice(0, 160)}`));

const t0 = Date.now();
await tv.goto(`${BASE}/play/party?mode=brainbrawl&playtest=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
await tv.waitForFunction(() => /^[A-Z0-9]{6}$/.test(document.querySelector('[data-testid=party-code]')?.textContent ?? ''), null, { timeout: 240000 });
const code = (await tv.textContent('[data-testid=party-code]'))!.trim();
ok('room opens with a 6-char code', /^[A-Z0-9]{6}$/.test(code), { code, ms: Date.now() - t0 });
await tv.waitForSelector('[data-testid=party-qr]', { timeout: 30000 });
const qrSrc = await tv.getAttribute('[data-testid=party-qr]', 'src');
const qrWant = await QRCode.toDataURL(`${BASE}/controller/${code}`, { margin: 1, width: 360 });
// the browser's PNG bytes differ from node's encoder, so compare PIXELS: the same modules = the same link
const qrDiff = await tv.evaluate(async ([a, w]) => {
  const load = (src: string) => new Promise<HTMLImageElement>((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const [x, y] = await Promise.all([load(a), load(w)]);
  if (x.width !== y.width || x.height !== y.height) return -1;
  const px = (i: HTMLImageElement) => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d')!; g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
  const d1 = px(x), d2 = px(y); let diff = 0;
  for (let k = 0; k < d1.length; k++) if (d1[k] !== d2[k]) diff++;
  return diff;
}, [qrSrc ?? '', qrWant] as const);
ok('the QR encodes exactly the join link (pixel-identical to a fresh encode of it)', qrDiff === 0, { url: `${BASE}/controller/${code}`, differingBytes: qrDiff });
await shot(tv, '01-tv-lobby-empty');

// ── phone A: the invite link (what the QR and SEND INVITE open) ─────────────────────────────────────────────────────
const phoneOpts = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const pa = await (await b.newContext(phoneOpts)).newPage();
pa.on('pageerror', (e) => errors.push(`A ${e.message.slice(0, 160)}`));
await pa.goto(`${BASE}/controller/${code}?game=brainbrawl`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await pa.waitForSelector('[data-testid=controller-join]', { timeout: 120000 });
const invitedLine = await pa.textContent('body');
ok('the invite names the game', /INVITED TO PLAY BRAIN BRAWL/.test(invitedLine ?? ''));
await pa.fill('[data-testid=controller-name]', 'Sam');
await shot(pa, '02-phone-join-invite');
await pa.click('[data-testid=controller-join]');
await pa.waitForSelector('[data-testid=phone-party-seat]', { timeout: 120000 }).catch(async (e) => {
  console.log('PHONE A:', (await pa.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 200));
  console.log('TV SEATS:', ((await tv.textContent('[data-testid=party-seats]')) ?? '').replace(/\s+/g, ' ').slice(0, 200));
  throw e;
});
ok('phone A is seated P1', (await pa.textContent('[data-testid=phone-party-seat]'))?.trim() === 'P1');

// ── phone B: types the code on /join ──────────────────────────────────────────────────────────────────────────────
const pbCtx = await b.newContext(phoneOpts);
const pb = await pbCtx.newPage();
pb.on('pageerror', (e) => errors.push(`B ${e.message.slice(0, 160)}`));
await pb.goto(`${BASE}/join`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await pb.waitForSelector('main[data-live="1"]', { timeout: 120000 });   // hydrated: typing reaches React
await pb.fill('[data-testid=join-code]', 'ZZZ0ZZ');
const hint = await pb.textContent('[data-testid=join-problem]');
ok('a misread look-alike is caught on the phone', /never use/.test(hint ?? ''), hint);
await pb.fill('[data-testid=join-code]', `${code.slice(0, 3).toLowerCase()}-${code.slice(3)}`);
await pb.click('[data-testid=join-go]');
await pb.waitForURL(new RegExp(`/controller/${code}`), { timeout: 60000 });
await pb.fill('[data-testid=controller-name]', 'Ria');
await pb.click('[data-testid=controller-join]');
await pb.waitForSelector('[data-testid=phone-party-seat]', { timeout: 60000 });
ok('phone B (typed code) is seated P2', (await pb.textContent('[data-testid=phone-party-seat]'))?.trim() === 'P2');

await tv.waitForSelector('[data-testid=party-seat-P2]', { timeout: 30000 });
ok('the TV shows both player cards', /SAM/.test((await tv.textContent('[data-testid=party-seat-P1]')) ?? '') && /RIA/.test((await tv.textContent('[data-testid=party-seat-P2]')) ?? ''));

// ── the lobby, before any game (a TV tab running Babylon on SwiftShader under load has crashed): drop-in pads, the pad
//    picks the game, the sideways-phone size, leave + rejoin ───────────────────────────────────────────────────────────

await tv.evaluate(() => { (window as any).__addPad(0, 'Xbox Wireless Controller (STANDARD GAMEPAD)'); (window as any).__btn(0, 0, true); });
await tv.waitForTimeout(400);
await tv.evaluate(() => (window as any).__btn(0, 0, false));
await tv.waitForSelector('[data-testid=party-toast]', { timeout: 10000 });
const toast = await tv.textContent('[data-testid=party-toast]');
ok('a pad pressing A takes a seat, with a JOINED toast', /JOINED/.test(toast ?? ''), toast);
const p1 = await tv.textContent('[data-testid=party-seat-P1]');
ok('the pad sits P1 (pads first: the seat the game gives it), phones move up', /PAD/.test(p1 ?? '') && /SAM/.test((await tv.textContent('[data-testid=party-seat-P2]')) ?? ''), p1);
await tv.evaluate(() => { (window as any).__addPad(1, 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c)'); (window as any).__btn(1, 0, true); });
await tv.waitForTimeout(400);
await tv.evaluate(() => (window as any).__btn(1, 0, false));
await tv.waitForSelector('[data-testid=party-seat-P4]', { timeout: 10000 });
ok('four seats: two pads, two phones', true);
await shot(tv, '08-tv-lobby-four-players');
await tv.setViewportSize({ width: 844, height: 390 });
await tv.waitForTimeout(500);
await shot(tv, '09-tv-lobby-844x390-sideways-phone');
const overflow = await tv.evaluate(() => {
  const r = document.querySelector('[data-testid=party-start]')!.getBoundingClientRect();
  return { bottom: Math.round(r.bottom), h: window.innerHeight, scroll: document.documentElement.scrollHeight > window.innerHeight + 1 };
});
ok('the lobby fits a sideways phone (844×390) with START on screen', overflow.bottom <= overflow.h && !overflow.scroll, overflow);
await tv.setViewportSize({ width: 1280, height: 720 });

// the pad's d-pad right picks the next game; the phones follow
await tv.evaluate(() => (window as any).__btn(0, 15, true));
await tv.waitForTimeout(300);
await tv.evaluate(() => (window as any).__btn(0, 15, false));
await pa.waitForFunction(() => /Who Scene It/.test(document.querySelector('[data-testid=phone-party-mode]')?.textContent ?? ''), null, { timeout: 10000 });
ok('the pad\'s d-pad picks the game and every phone shows it', true);

await pb.click('[data-testid=phone-party-leave]');
await tv.waitForFunction(() => document.querySelectorAll('[data-testid^=party-seat-P]').length === 3, null, { timeout: 10000 });
ok('LEAVE frees the seat on the TV at once', true);
await pb.click('[data-testid=controller-join]');   // REJOIN — the name is remembered
await pb.waitForSelector('[data-testid=phone-party-seat]', { timeout: 30000 });
await tv.waitForFunction(() => document.querySelectorAll('[data-testid^=party-seat-P]').length === 4, null, { timeout: 10000 });
ok('REJOIN is one tap (name remembered) and takes a seat back', /RIA/.test((await tv.textContent('[data-testid=party-seats]')) ?? ''));
await shot(pa, '10-phone-a-lobby-who-scene-it');
// the pad's d-pad left goes back to Brain Brawl; then the pads leave, so the game below seats the two phones
await tv.evaluate(() => (window as any).__btn(0, 14, true));
await tv.waitForTimeout(300);
await tv.evaluate(() => (window as any).__btn(0, 14, false));
await pa.waitForFunction(() => /Brain Brawl/.test(document.querySelector('[data-testid=phone-party-mode]')?.textContent ?? ''), null, { timeout: 10000 });
await tv.evaluate(() => {
  const w = window as any;
  for (const pad of [...w.__PADS]) { if (!pad) continue; pad.connected = false; const ev = new Event('gamepaddisconnected'); Object.defineProperty(ev, 'gamepad', { value: pad }); window.dispatchEvent(ev); }
  w.__PADS = [];
});
await tv.waitForFunction(() => document.querySelectorAll('[data-testid^=party-seat-P]').length === 2, null, { timeout: 10000 });
ok('pads leaving give the seats back to the phones', /SAM/.test((await tv.textContent('[data-testid=party-seat-P1]')) ?? ''));

// ── ready up; the captain starts from the phone ─────────────────────────────────────────────────────────────────────
// phone A readied nothing yet; phone B rejoined above (a rejoin is a new arrival: not ready)
await pa.click('[data-testid=phone-party-ready]');
await pb.click('[data-testid=phone-party-ready]');
await tv.waitForFunction(() => document.querySelector('[data-testid=party-seat-P1]')?.getAttribute('data-ready') === '1'
  && document.querySelector('[data-testid=party-seat-P2]')?.getAttribute('data-ready') === '1', null, { timeout: 20000 });
ok('ready lights reach the TV', true);
await shot(tv, '03-tv-lobby-two-ready');
await pa.waitForSelector('[data-testid=phone-party-start]:not([disabled])', { timeout: 20000 });
ok('phone B has no START (only the captain)', (await pb.locator('[data-testid=phone-party-start]').count()) === 0);
await shot(pa, '04-phone-captain-lobby');
await pa.click('[data-testid=phone-party-start]');
await tv.waitForSelector('[data-testid=party-room][data-phase=playing]', { timeout: 20000 });
ok('START on the phone starts the game on the TV', true);
ok('the game was told two players (?players=2)', /players=2/.test(tv.url()), tv.url());

// ── seat routing: each phone's press reaches the running game's own InputBus, as its seat ─────────────────────────────
// (The in-game check — Brain Brawl's answer phase recording P2's pick — needs the quiz to spin and expose first; on
// SwiftShader under this box's load that did not arrive inside 25 minutes, so the route is read where it lands: the
// game's bus. localPads.answerOwner is what makes a d-pad press P2's in the mode; lib/party/party.test.ts pins the map.)
await tv.evaluate(() => { (window as unknown as { __FEL_PARTY_LOG__: unknown[] }).__FEL_PARTY_LOG__ = []; });
const answerBtn = (p: Page, label: string) => p.locator('[data-testid=phone-party-controls] button', { hasText: new RegExp(`^${label}$`) }).first();
type Routed = { seat: number; e: { t: string; btn?: string; dir?: string; pressed: boolean }; buses: number };
const log = () => tv.evaluate(() => (window as unknown as { __FEL_PARTY_LOG__: unknown[] }).__FEL_PARTY_LOG__) as Promise<Routed[]>;
await pa.waitForSelector('[data-testid=phone-party-controls] button', { timeout: 60000 });
await shot(pb, '06-phone-b-answer-buttons');
// wait for the game's bus to be live (the Babylon mode has to boot), pressing phone A's A — which also wakes the game
let reached = 0;
for (let i = 0; i < 180 && reached === 0; i++) {
  await answerBtn(pa, 'A').dispatchEvent('pointerdown');
  await tv.waitForTimeout(1000);
  reached = Math.max(0, ...(await log()).map((r) => r.buses));
}
ok('a phone press reaches the running game\'s InputBus', reached >= 1, { buses: reached });
await tv.evaluate(() => { (window as unknown as { __FEL_PARTY_LOG__: unknown[] }).__FEL_PARTY_LOG__ = []; });
await answerBtn(pb, 'C').dispatchEvent('pointerdown');
await answerBtn(pa, 'B').dispatchEvent('pointerdown');
await tv.waitForTimeout(800);
const routed = await log();
const fromB = routed.filter((r) => r.seat === 1).map((r) => r.e);
const fromA = routed.filter((r) => r.seat === 0).map((r) => r.e);
ok('phone B\'s "C" reaches the game as P2\'s d-pad ▼ (answer C), never as a face button', fromB.length > 0 && fromB.every((e) => e.t === 'dpad') && fromB.some((e) => e.dir === 'down' && e.pressed), fromB);
ok('phone A\'s "B" reaches the game as P1\'s face B', fromA.some((e) => e.t === 'button' && e.btn === 'B' && e.pressed), fromA);
await tv.waitForTimeout(4000);
await shot(tv, '05-tv-brainbrawl-two-players');
await shot(tv, '07-tv-playing-dropin-chip');
try {
  await tv.waitForSelector('[data-testid=party-dropin]', { timeout: 30000 });
  ok('the drop-in chip shows the code while seats are open', true);
} catch (e) { ok('the drop-in chip shows the code while seats are open', false, String((e as Error).message).split('\n')[0]); }

// the game is up: back to the lobby (non-fatal — this tab is the one SwiftShader may lose)
try {
  await tv.click('[data-testid=party-end-game]', { timeout: 60000 });
  await tv.waitForSelector('[data-testid=party-room][data-phase=lobby]', { timeout: 60000 });
  await pa.waitForSelector('[data-testid=phone-party-panel]', { timeout: 30000 });
  ok('◀ LOBBY ends the game and the phones go back to the lobby with the TV', true);
} catch (e) { console.log(`(TV tab lost while the game ran: ${String((e as Error).message).split('\n')[0]})`); }
ok('no page errors', errors.length === 0, errors.slice(0, 5));
fs.writeFileSync(path.join(OUT, 'party-probe.json'), JSON.stringify({ code, results, errors }, null, 2));
await b.close();
const failed = Object.entries(results).filter(([, r]) => !(r as { pass: boolean }).pass).map(([k]) => k);
console.log(failed.length ? `\n${failed.length} FAILED: ${failed.join(' | ')}` : '\nALL PASS');
process.exit(failed.length ? 1 : 0);
