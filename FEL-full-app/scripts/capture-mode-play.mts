// Drive a mode through the dev runner and report what the HUD and console say.
//
//   URL=http://localhost:3000/dev/mode/onevone HOLD=390 npx tsx scripts/capture-mode-play.mts
//
// HOLD is the shoot-charge hold in ms. Modes with a release window (basketball's
// ShotMeter greens at t=0.62 over ~0.72s) need it aimed, or every shot misses.

import { chromium } from 'playwright-core';
import { chromiumExe } from './probes/_chromium.mts';
import { mkdirSync } from 'node:fs';

// NB: not named URL — that would shadow the global URL constructor.
const MODE_URL = process.env.URL ?? 'http://localhost:3000/dev/mode/onevone';
const HOLD = Number(process.env.HOLD ?? 390);
const REPS = Number(process.env.REPS ?? 10);
/**
 * Keys to tap each rep, comma separated. Defaults to the basketball pattern
 * (hold space = charge/shoot). A mode whose verbs are face buttons needs its
 * own: Karate VS is JAB(j) KICK(k) BLOCK(l) HEAVY(i), and driving it with the
 * basketball pattern just stands there being hit — which is exactly what the
 * first run showed, at hp 22 to 100.
 */
/** ms to hold forward before acting — how long the mode needs to close range. */
const APPROACH = Number(process.env.APPROACH ?? 900);
const KEYS = (process.env.KEYS ?? '').split(',').map((k) => k.trim()).filter(Boolean);
/** Hold the analog pump/charge before the trick keys (board sports). */
const PUMP = process.env.PUMP === '1';
/** Alternate left/right carve each rep (slalom / carving modes). */
const STEER = process.env.STEER === '1';
/** ms between trick keys. Air windows are short -- a board trick must be
 *  pressed while the rider is still off the ground. */
const GAP = Number(process.env.GAP ?? 260);
const OUT = process.env.OUT_DIR ?? 'docs/shots/play';
const NAME = process.env.NAME ?? 'play';
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: chromiumExe(),
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
// TIER=mobile: a phone-shaped, touch-capable context so detectQualityTier picks
// the mobile tier (touch points + coarse pointer + viewport) while the same
// keyboard drive runs. Phase 1's gate wants every mode measured on both tiers.
const MOBILE_TIER = process.env.TIER === 'mobile';
const p = MOBILE_TIER
  ? await (await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36' })).newPage()
  : await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
// LOGIN=1: carry a real session INTO /dev/mode/<key>, which never shows the
// login form. Only a logged-in hero runs applyIdentity (tint clones, morphs,
// hair style, jersey plate) on top of the spawn layers — the Closet caught a
// never-ready skin material that 21 anonymous captures could not see.
if (process.env.LOGIN === '1') {
  const { request } = await import('playwright-core');
  const rc = await request.newContext({ baseURL: new URL(MODE_URL).origin });
  const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
  await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local', password: process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only', json: 'true' } });
  await p.context().addCookies((await rc.storageState()).cookies);
  await rc.dispose();
}
// THROTTLE=4: CPU throttling through CDP — the weak-hardware proxy (Phase 6 of
// ship pass 2). Frame time under throttle stands in for a mid-range phone.
const THROTTLE = Number(process.env.THROTTLE ?? 0);
if (THROTTLE > 1) {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
}
// time-to-playing (ship pass 2, Phase 3): from navigation to the harness's
// "→ playing" line, cold or warm depending on the server's state.
// ttl = time-to-LOADED (assets in, before the START gate the script presses
// later); ttp = time-to-playing. Measured 2026-09-03: ttp sat at ~13 s for every
// mode, throttled or not — the script's own start delay, not the load.
const t0 = Date.now(); let ttp = -1, ttl = -1;
p.on('console', (m) => { const x = m.text(); if (ttl < 0 && /FEL-READY\] \w+ → loaded/.test(x)) ttl = Date.now() - t0; if (ttp < 0 && /FEL-READY\] \w+ → playing/.test(x)) ttp = Date.now() - t0; });
const logs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error' || /FEL-FRAME|MISSING CLIP|FEL-IDENT|FEL-CAM/.test(m.text())) logs.push(`[${m.type()}] ${m.text().slice(0, Number(process.env.LOG_CHARS ?? 170))}`); });
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, Number(process.env.LOG_CHARS ?? 170))}`));

// PHASE 9 WANTS THE SHIPPING ROUTE. /play/* calls getServerSession and
// redirects to /login without one, which is why 1v1 and 3v3 had only ever been
// playtested through /dev/mode/[key] — a DIFFERENT host component from the one
// that ships. Log in as an ordinary player through the real form instead of
// routing around the gate. scripts/ensure-playtest-user.ts creates the account.
// networkidle never settles on hosts that long-poll (the Controller Link /
// carnival hub lobby heartbeats) — /play/carnival timed out on exactly that.
// domcontentloaded + the canvas wait below is the real requirement. The login
// FORM (not the URL) decides: the /play→/login redirect is client-side and
// lands after hydration, so a URL check races it; and the SSR'd form needs
// networkidle before Enter does anything. Both measured, same day.
await p.goto(MODE_URL, { waitUntil: 'domcontentloaded' });
const emailInput = p.locator('input[type="email"]');
const onLogin = await emailInput.waitFor({ timeout: 8_000 }).then(() => true).catch(() => false);
if (onLogin) {
  await p.waitForLoadState('networkidle').catch(() => {});   // hydrate the SSR'd form first
  await emailInput.fill(process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
  await p.locator('input[type="password"]').fill(process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
  await p.locator('input[type="password"]').press('Enter');   // submit; the button can be overlay-blocked
  await p.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 30_000 }).catch(() => {});
  await p.waitForLoadState('networkidle').catch(() => {});   // let the session cookie commit
  await p.goto(MODE_URL, { waitUntil: 'domcontentloaded' });
}
console.log(`${NAME} route :`, new URL(p.url()).pathname);
// Party-night hubs (carnival) gate the canvas behind a START THE NIGHT
// briefing that renders AFTER a client-side shuffle — a single isVisible
// check races it (measured). Loop: canvas wins, hub button starts the night.
const startNight = p.getByText(/START THE NIGHT/i).first();
for (let i = 0; i < 12; i++) {
  if (await p.$('canvas')) break;
  if (await startNight.isVisible().catch(() => false)) {
    await startNight.click().catch(() => {});
    console.log(`${NAME} hub   : started the night`);
  }
  await p.waitForTimeout(1500);
}
await p.waitForSelector('canvas', { timeout: 30_000 });
await p.waitForTimeout(2500);
const head = async () => (await p.evaluate<string>('document.body.innerText')).split('\n')[0];
// Clear the ready gate on EITHER route. The dev runner shows a bare START; the
// shipping page shows BootSplash's "TAP TO START". START is a TOGGLE — pressing
// it while already playing PAUSES the mode, which silently ruined an entire
// investigation once, so only press it at an actual gate.
const bodyNow = await p.evaluate<string>('document.body.innerText');
if (/TAP TO START/i.test(bodyNow)) {
  await p.getByText(/TAP TO START/i).first().click({ force: true }).catch(() => {});
} else if (/·\s*(ready|loading)/i.test(await head())) {
  await p.getByText(/^START$/).first().click({ force: true }).catch(() => {});
}
// Blur: space activates a focused button, and space is the shoot key.
await p.evaluate('document.activeElement && document.activeElement.blur()');
await p.waitForTimeout(2500);
/**
 * The two routes report state differently: /dev/mode dumps the raw HUD object as
 * JSON, the shipping page renders a real scoreboard. Read whichever is there, so
 * one harness can prove a mode on the route that actually ships.
 */
const hud = async (): Promise<Record<string, unknown>> => {
  const t = await p.evaluate<string>('document.body.innerText');
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) {
    try { return JSON.parse(t.slice(i, j + 1)) as Record<string, unknown>; } catch { /* fall through */ }
  }
  // Shipping scoreboard: "0 – 0" (en dash) with a "TO 11" / "RD 1/2" beside it.
  const score = /(\d+)\s*[–-]\s*(\d+)/.exec(t.replace(/\n/g, ' '));
  const target = /TO\s+(\d+)/i.exec(t);
  const out: Record<string, unknown> = {};
  if (score) { out.score = Number(score[1]); out.foeScore = Number(score[2]); }
  if (target) out.target = Number(target[1]);
  const banner = /(GOOD!|SPLASH!|RIMS OUT|YOUR BOARD|THEIR BOARD|REJECTED!|BOXED OUT[^|]*)/i.exec(t);
  if (banner) out.banner = banner[1].trim();
  return out;
};
console.log(`${NAME} start :`, JSON.stringify(await hud()));

for (let i = 0; i < REPS; i++) {
  await p.keyboard.down('w');
  if (STEER) {
    // A slalom needs LATERAL input. Holding only forward, the bot rides the
    // fall line straight past every gate, which reads as "the gates are
    // unreachable" when it only means nobody steered. Alternate the carve.
    const lean = i % 2 === 0 ? 'a' : 'd';
    await p.keyboard.down(lean); await p.waitForTimeout(APPROACH); await p.keyboard.up(lean);
  } else {
    await p.waitForTimeout(APPROACH);
  }
  await p.keyboard.up('w');
  // A board sport needs BOTH: space is the analog pump/charge (and its release
  // is the ollie), while the face keys are the tricks. Driving skate with KEYS
  // alone never held space, so it never pumped -- the run ended at momentum 0
  // and score 0, which looked exactly like a broken mode and was not.
  if (KEYS.length && PUMP) {
    await p.keyboard.down(' '); await p.waitForTimeout(HOLD); await p.keyboard.up(' ');
    await p.waitForTimeout(GAP);
  }
  if (KEYS.length) {
    for (const k of KEYS) { await p.keyboard.press(k); await p.waitForTimeout(GAP); }
  } else {
    await p.keyboard.down(' '); await p.waitForTimeout(HOLD); await p.keyboard.up(' ');
  }
  await p.waitForTimeout(1400);
  if (i === Math.floor(REPS / 3)) await p.screenshot({ path: `${OUT}/${NAME}.png` });
}
console.log(`${NAME} end   :`, JSON.stringify(await hud()));
console.log(`${NAME} phase :`, await head());
// The dev page's PerfMonitor overlay is in the body text: "60 fps avg 16.7ms ... draws 61 meshes 61".
// Surface it so a sweep doubles as a frame-budget survey.
{
  const body = await p.evaluate<string>('document.body.innerText');
  const fps = /(\d+)\s*fps\s*avg\s*([\d.]+)ms/.exec(body);
  const dm = /draws\s*(\d+)\s*meshes\s*(\d+)/.exec(body);
  console.log(`${NAME} perf  : ${fps ? `${fps[1]}fps ${fps[2]}ms` : 'n/a'} ${dm ? `draws ${dm[1]} meshes ${dm[2]}` : ''}`);
}
const frame = logs.filter((l) => /FEL-FRAME/.test(l));
const miss = logs.filter((l) => /MISSING CLIP/.test(l));
const ident = logs.filter((l) => /FEL-IDENT/.test(l));
const cam = logs.filter((l) => /FEL-CAM/.test(l));
if (cam.length) console.log(`${NAME} cam   : overhead fallback x${cam.length} (designed degradation, not counted)`);
const errs = logs.filter((l) => ((l.startsWith('[error]') || l.startsWith('[pageerror]'))
  && !/401 \(Unauthorized\)/.test(l) && !/FEL-FRAME/.test(l)) || /FEL-IDENT.*never ready/.test(l));
console.log(`${NAME} ttl   : ${ttl >= 0 ? (ttl / 1000).toFixed(1) + ' s' : 'n/a'} (loaded) · ttp ${ttp >= 0 ? (ttp / 1000).toFixed(1) + ' s' : 'n/a'} (playing)`);
console.log(`${NAME} FEL-FRAME ${frame.length} | MISSING CLIP ${miss.length} | errors ${errs.length}${MOBILE_TIER ? ' | tier mobile' : ''}${THROTTLE > 1 ? ` | cpu x${THROTTLE}` : ''}`);
if (process.env.LOGIN === '1') console.log(`${NAME} ident : ${ident.length ? ident.map((l) => l.replace(/^\[\w+\] /, '')).join(' | ') : 'no FEL-IDENT line (identity did not run?)'}`);
for (const l of [...new Set([...frame, ...miss, ...errs])].slice(0, 4)) console.log('   ·', l);
await b.close();
