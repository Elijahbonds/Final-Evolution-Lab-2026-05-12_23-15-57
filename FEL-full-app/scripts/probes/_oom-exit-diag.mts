// OOM-HYGIENE exit diagnostic — enter a /play mode, play a few seconds, leave through the shell's Home link and report exactly what
// the teardown did: whether scene.dispose ran (onDisposeObservable), whether the engine stopped rendering, every console line and
// page error around the exit. PORT=3047 MODE=skateboard npx tsx scripts/probes/_oom-exit-diag.mts
import { chromium, request } from 'playwright-core';
const PORT = process.env.PORT ?? '3047', BASE = `http://localhost:${PORT}`, MODE = process.env.MODE ?? 'skateboard';
const ROUTE: Record<string, string> = { karate: '/play/karate', karate_vs: '/play/karate-vs', skateboard: '/play/skateboard', tennis: '/play/tennis', snowboard: '/play/snowboard', surf: '/play/surf' };
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const rc = await request.newContext({ baseURL: BASE });
const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', callbackUrl: `${BASE}/`, json: 'true' } });
const context = await b.newContext({ viewport: { width: 1280, height: 800 }, storageState: await rc.storageState() }); await rc.dispose();
const p = await context.newPage();
const lines: string[] = []; const t0 = Date.now();
p.on('console', (m) => lines.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${m.type()} ${m.text().slice(0, 220)}`));
p.on('pageerror', (e) => lines.push(`${((Date.now() - t0) / 1000).toFixed(1)}s PAGEERROR ${e.message.slice(0, 300)}\n${(e.stack ?? '').split('\n').slice(0, 6).join('\n')}`));
const readyState = (): Promise<string> => p.evaluate('(document.getElementById("fel-ready") || {}).dataset ? (document.getElementById("fel-ready").dataset.state || "") : ""') as Promise<string>;
await p.goto(`${BASE}${ROUTE[MODE]}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 90000 });
for (let i = 0; i < 480; i++) { const s = await readyState(); if (s === 'loaded' || s === 'playing') break; await p.waitForTimeout(250); }
await p.waitForTimeout(800);
await p.evaluate(`(() => { const d = window.__FEL_DEV__; const s = d.scene; window.__exit = { disposed: false, frames: 0, engineDisposed: () => s.getEngine().isDisposed, sceneDisposed: () => s.isDisposed, renders: 0 };
  s.onDisposeObservable.add(() => { window.__exit.disposed = true; console.info('[EXIT-DIAG] scene.onDispose fired'); });
  s.onAfterRenderObservable.add(() => { window.__exit.renders++; }); })()`);
const btn = p.locator('button', { hasText: /TAP TO START/i }).first(); if (await btn.count()) await btn.click(); else await p.keyboard.press('Space');
await p.waitForTimeout(4000);
for (let i = 0; i < 5; i++) { await p.keyboard.down(' '); await p.waitForTimeout(500); await p.keyboard.up(' '); await p.keyboard.press('j'); await p.waitForTimeout(300); }
const mark = lines.length;
const home = p.locator('a[href="/"]', { hasText: /Home/ }).first();
console.log('home link count', await home.count(), 'url before', p.url());
await home.dispatchEvent('click');
await p.waitForURL((u) => u.pathname === '/', { timeout: 30000 }).catch((e) => console.log('waitForURL:', String(e).slice(0, 100)));
await p.waitForTimeout(2500);
const r1 = await p.evaluate('JSON.stringify({ url: location.pathname, disposed: window.__exit.disposed, sceneDisposed: window.__exit.sceneDisposed(), engineDisposed: window.__exit.engineDisposed(), renders: window.__exit.renders, devHandle: !!window.__FEL_DEV__, canvases: document.querySelectorAll("canvas").length })');
await p.waitForTimeout(2000);
const r2 = await p.evaluate('JSON.stringify({ renders: window.__exit.renders })');
console.log('after exit:', r1, '→ 2 s later', r2);
console.log('--- console from the exit on:'); for (const l of lines.slice(mark)) console.log('  ' + l);
await b.close();
