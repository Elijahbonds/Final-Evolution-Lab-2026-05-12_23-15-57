// FEL Kitchens — the Fuel floor renders logged in: Your Build scan input, leak chip, load band, day plan, grocery list,
// fulfilment paths. BASE=http://localhost:3005 points it at a lane port (default 3000).
import { chromium, request } from 'playwright-core';
const BASE = (process.env.BASE ?? 'http://localhost:3000').replace(/\/$/, '');
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const rc = await request.newContext({ baseURL: BASE });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', json: 'true' } });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); await p.context().addCookies((await rc.storageState()).cookies); await rc.dispose();
const errors: string[] = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
await p.goto(`${BASE}/kitchens/fuel`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
const bodyText = async () => (await p.evaluate('document.body.innerText')) as string;
const text = await bodyText();
const has = (s: string) => text.toLowerCase().includes(s.toLowerCase());
const chip = async (id: string) => (await p.locator(`[data-testid="${id}"]`).innerText().catch(() => '?')).trim();
const plan = async () => (await p.evaluate(`Array.from(document.querySelectorAll('[data-testid="day-plan"] li')).map(li => li.dataset.slot + ':' + li.dataset.recipe)`)) as string[];
const metricsStored = async () => (await p.evaluate(`localStorage.getItem('fel-kitchen-metrics')`)) as string | null;

console.log(`base ${BASE} · url ${p.url()}`);
console.log(`leak chip: ${has('LEAK ·')} · load band: ${/EASY DAY|TRAIN DAY|HARD DAY/.test(text)} · day plan: ${has('Day plan')} · grocery: ${has('Grocery list')} · get it: ${has('Instacart list') && has('DoorDash Drive')} · disclaimer: ${has('not medical advice')}`);

// Your Build — the scan input. Seven sliders with the defaults pre-filled; the derived leak and the plan update live;
// the metrics persist under fel-kitchen-metrics; Defaults clears them.
const sliders = await p.locator('[data-testid="your-build"] input[type="range"]').count();
const before = await plan();
console.log(`your build: ${has('Your Build')} · sliders: ${sliders} · derived: ${await chip('derived-leak')} / ${await chip('derived-band')} · rx: ${await chip('rx-leak')} / ${await chip('rx-band')} · stored metrics before: ${await metricsStored()}`);
console.log(`plan before: ${before.join(' ')}`);
await p.evaluate(`(() => { const el = document.querySelector('[data-testid="your-build"] input[aria-label="Valgus L"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '0.8'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await p.waitForTimeout(400);
const after = await plan();
const stored = await metricsStored();
console.log(`valgus L → 0.8: derived ${await chip('derived-leak')} · rx ${await chip('rx-leak')} · stored valgusL: ${stored ? JSON.parse(stored).valgusL : null} · plan changed: ${before.join() !== after.join()}`);
console.log(`plan after: ${after.join(' ')} · no recipe twice: ${new Set(after.map((s) => s.split(':')[1])).size === after.length} · pre/post: ${after.some((s) => s.startsWith('pre:'))}/${after.some((s) => s.startsWith('post:'))}`);
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
console.log(`after reload: derived ${await chip('derived-leak')} · slider value ${await p.locator('[data-testid="your-build"] input[aria-label="Valgus L"]').inputValue()} · rx ${await chip('rx-leak')}`);
await p.getByRole('button', { name: /Defaults/ }).click();
await p.waitForTimeout(400);
console.log(`defaults: derived ${await chip('derived-leak')} · rx ${await chip('rx-leak')} · metrics key after reset: ${await metricsStored()} · plan restored: ${(await plan()).join() === before.join()}`);

const items = await p.evaluate(`Array.from(document.querySelectorAll('section ul li button')).length`);
console.log(`grocery rows: ${items}`);
await p.locator('section ul li button').first().click().catch(() => {});
await p.waitForTimeout(300);
console.log(`basket after one tap: ${(await bodyText()).match(/(\d+) \/ (\d+) in the basket/)?.[0] ?? '?'}`);
const store = await p.evaluate(`localStorage.getItem('fel-kitchen-store-v1')?.slice(0, 160)`);
console.log(`store: ${store}`);
await p.screenshot({ path: process.env.OUT ?? 'docs/shots/kitchens-fuel.png', fullPage: true });
console.log(`errors: ${errors.length}${errors.length ? ' · ' + errors.slice(0, 3).join(' | ') : ''}`);
await p.goto(`${BASE}/kitchens`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
const hub = (await p.evaluate('document.body.innerText')) as string;
console.log(`hub link to fuel: ${hub.toLowerCase().includes("today's fuel")} · hub floors: ${/EAT/.test(hub) && /COOK/.test(hub)}`);
await b.close();
