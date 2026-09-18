import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://localhost:3004';
const OUT = process.env.OUT ?? '/tmp/dunk-shots';
const EMAIL = 'playtest@fel.local';
const PASS = 'playtest-local-only';
fs.mkdirSync(OUT, { recursive: true });

async function injectPad(page: Page) {
  await page.evaluate(() => {
    const pad: any = {
      index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard',
      axes: [0, 0, 0, 0], timestamp: Date.now(),
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    (window as any).__PAD = pad;
    (navigator as any).getGamepads = () => [pad];
    const ev = new Event('gamepadconnected');
    Object.defineProperty(ev, 'gamepad', { value: pad });
    window.dispatchEvent(ev);
  });
}
async function setBtn(page: Page, i: number, on: boolean, value?: number) {
  await page.evaluate(([i, on, value]) => {
    const p = (window as any).__PAD; if (!p) return;
    p.buttons[i].pressed = on; p.buttons[i].value = value ?? (on ? 1 : 0); p.timestamp = Date.now();
  }, [i, on, value] as [number, boolean, number | undefined]);
}
async function setStick(page: Page, x: number, y: number) {
  await page.evaluate(([x, y]) => {
    const p = (window as any).__PAD; if (!p) return;
    p.axes[0] = x; p.axes[1] = y; p.timestamp = Date.now();
  }, [x, y] as [number, number]);
}
async function tap(page: Page, i: number, ms = 140) {
  await setBtn(page, i, true); await page.waitForTimeout(ms); await setBtn(page, i, false);
}
async function hud(page: Page) {
  return page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 1000));
}
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const text = await hud(page);
  fs.writeFileSync(`${OUT}/${name}.txt`, text);
  console.log('SHOT', name, text.slice(0, 200));
  return text;
}

async function main() {
  const CHROME = chromiumExe();
  console.log('using', CHROME);
  const browser = await chromium.launch({
    headless: true, executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const logs: string[] = [];
  p.on('console', (m) => {
    const t = m.text();
    if (/FEL-|DUNK-|VENICE|SPAWN|MISSING|PROP|HANDS|LAUNCH|PLACE|texture|mesh/i.test(t)) {
      logs.push(t.slice(0, 240));
      console.log('CON', t.slice(0, 180));
    }
  });

  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(600);
  if (/\/login/.test(p.url())) {
    await p.fill('input[type="email"]', EMAIL);
    await p.fill('input[type="password"]', PASS);
    await p.click('button[type="submit"]');
    await p.waitForTimeout(2200);
  }
  await p.goto(`${BASE}/play/dunk?arena=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForSelector('canvas', { timeout: 90000 });
  await p.waitForFunction(() => /TAP TO START|PRESS ANY|FLIGHT NIGHT/i.test(document.body.innerText), { timeout: 120000 });
  await p.waitForTimeout(800);
  await injectPad(p);
  await shot(p, '00-boot');

  const btn = p.getByRole('button', { name: /TAP TO START/i });
  if (await btn.count()) await btn.click({ force: true });
  else await p.locator('text=TAP TO START').first().click({ force: true }).catch(() => {});
  await p.waitForTimeout(1200);
  for (let i = 0; i < 6; i++) {
    if (!/TAP TO START/i.test(await hud(p))) break;
    await p.keyboard.press('Enter');
    await p.mouse.click(640, 480);
    await p.waitForTimeout(400);
  }
  await injectPad(p);
  await shot(p, '01-court-wide'); // PLACE: floor + sides + right court

  // look right (R stick) toward right-court black object
  await page_look(p, 0.85, 0);
  await p.waitForTimeout(500);
  await shot(p, '02-look-right');
  await page_look(p, -0.85, 0);
  await p.waitForTimeout(500);
  await shot(p, '03-look-left');
  await page_look(p, 0, 0.4);
  await p.waitForTimeout(400);
  await shot(p, '04-look-down-floor');
  await page_look(p, 0, 0);

  // arm CAR for dunk-over-obstacle readability
  for (let i = 0; i < 8; i++) {
    const t = await hud(p);
    if (/\bCAR\b/.test(t)) break;
    await tap(p, 2, 120);
    await p.waitForTimeout(400);
  }
  await shot(p, '05-car-armed');

  // run + dunk
  await setStick(p, 0, -1);
  await setBtn(p, 7, true, 1);
  await p.waitForTimeout(900);
  await shot(p, '06-runway-approach');
  await p.waitForTimeout(900);
  await shot(p, '07-near-rim');
  await setBtn(p, 7, false, 0);
  await p.waitForTimeout(250);
  // windmill-ish: up + A
  await setBtn(p, 12, true);
  await p.waitForTimeout(40);
  await tap(p, 0, 100);
  await setBtn(p, 12, false);
  await p.waitForTimeout(200);
  await shot(p, '08-air-trick');
  await tap(p, 0, 100); // slam
  await p.waitForTimeout(350);
  await shot(p, '09-slam-contact');
  await p.waitForTimeout(1200);
  await shot(p, '10-land-endpose');
  await setStick(p, 0, 0);
  await p.waitForTimeout(800);
  await shot(p, '11-settle');

  fs.writeFileSync(`${OUT}/console-hits.json`, JSON.stringify(logs, null, 2));
  console.log('WROTE visual polish', logs.length);
  await browser.close();
}
async function page_look(page: Page, x: number, y: number) {
  await page.evaluate(([x, y]) => {
    const p = (window as any).__PAD; if (!p) return;
    p.axes[2] = x; p.axes[3] = y; p.timestamp = Date.now();
  }, [x, y] as [number, number]);
}
main().catch((e) => { console.error(e); process.exit(1); });
