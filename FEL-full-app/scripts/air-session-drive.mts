// Drive an air-session mode (gymnastics vault / snowboard big air) like a
// person: ALTERNATING strides on the cadence, flip in the air, stick the
// landing. A cadence bot that taps one side — or taps both out of rhythm —
// reports a broken mode either way; the core grades stride TIMING.
//
//   URL=http://localhost:3001/dev/mode/gymnastics npx tsx scripts/air-session-drive.mts
//   URL=…/dev/mode/bigair CADENCE_MS=260 npx tsx scripts/air-session-drive.mts

import { chromium } from 'playwright-core';

// NB: not named URL — that would shadow the global URL constructor.
const MODE_URL = process.env.URL ?? 'http://localhost:3000/dev/mode/gymnastics';
const CADENCE_MS = Number(process.env.CADENCE_MS ?? 230);

const b = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const logs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error' || /FEL-FRAME|MISSING CLIP/.test(m.text())) logs.push(`[${m.type()}] ${m.text().slice(0, 170)}`); });
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 170)}`));

await p.goto(MODE_URL, { waitUntil: 'networkidle' });
if (/\/login/.test(p.url())) {
  await p.locator('input[type="email"]').fill(process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
  await p.locator('input[type="password"]').fill(process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
  await p.locator('input[type="password"]').press('Enter');
  await p.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 30_000 }).catch(() => {});
  await p.goto(MODE_URL, { waitUntil: 'networkidle' });
}
console.log('route :', new URL(p.url()).pathname);
await p.waitForSelector('canvas', { timeout: 30_000 });
await p.waitForTimeout(2500);
const bodyNow = await p.evaluate<string>('document.body.innerText');
if (/TAP TO START/i.test(bodyNow)) {
  await p.getByText(/TAP TO START/i).first().click({ force: true }).catch(() => {});
} else if (/·\s*(ready|loading)/i.test(bodyNow.split('\n')[0])) {
  await p.getByText(/^START$/).first().click({ force: true }).catch(() => {});
}
await p.evaluate('document.activeElement && document.activeElement.blur()');
await p.waitForTimeout(3500);

/** The dev route's HUD dump is pretty-printed JSON — parse, never regex. */
const hud = async (): Promise<Record<string, unknown>> => {
  const t = await p.evaluate<string>('document.body.innerText');
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch { /* mid-write */ } }
  return {};
};

const found = { strides: 0, air: false, tricked: false, landed: false, grades: [] as string[], score: 0 };
let lastAttempt = '';

const deadline = Date.now() + 150_000;
let foot: 'left' | 'right' = 'left';
let lastStride = 0;
while (Date.now() < deadline) {
  const h = await hud();
  const phase = String(h.phase ?? '');
  if (/Done|finished/i.test(phase)) break;
  const now = Date.now();

  if (phase === 'Run' && now - lastStride >= CADENCE_MS) {
    // the mode tells you the foot — drive what it says, like a person reads it
    const want = h.nextFoot === 'R' ? 'right' : 'left';
    foot = want;
    await p.keyboard.press(foot === 'left' ? 'ArrowLeft' : 'ArrowRight');
    lastStride = now;
    found.strides++;
  } else if (phase === 'Air') {
    found.air = true;
    if (!found.tricked) { await p.keyboard.press('j'); found.tricked = true; }
    // stick when the height is coming down
    const height = Number(h.height ?? 99);
    if (height < 0.6) { await p.keyboard.press('k'); }
  }
  // count a landing once per ATTEMPT, not once per poll — the banner holds
  // 1.6s and a 40ms poll would otherwise report forty grades per landing
  const banner = String(h.banner ?? '');
  const attempt = String(h.attempt ?? '');
  if (/STUCK IT|CLEAN|SKETCHY|CRASH/.test(banner) && attempt !== lastAttempt) {
    lastAttempt = attempt;
    found.grades.push(banner.split('  ')[0]);
    found.landed = true;
  }
  found.score = Number(h.score ?? found.score);
  await p.waitForTimeout(40);
}

console.log(`strides ${found.strides} · air ${found.air} · tricked ${found.tricked} · landed ${found.landed}`);
console.log('grades:', found.grades.join(', ') || 'none', '· score:', found.score);
const frame = logs.filter((l) => /FEL-FRAME/.test(l));
const miss = logs.filter((l) => /MISSING CLIP/.test(l));
const errs = logs.filter((l) => (l.startsWith('[error]') || l.startsWith('[pageerror]'))
  && !/401 \(Unauthorized\)/.test(l) && !/FEL-FRAME/.test(l));
console.log(`air-drive FEL-FRAME ${frame.length} | MISSING CLIP ${miss.length} | errors ${errs.length}`);
for (const l of [...new Set([...frame, ...miss, ...errs])].slice(0, 4)) console.log('   ·', l);
await b.close();
if (!found.air || !found.landed || found.strides < 6) process.exit(1);
