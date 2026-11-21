// STORY rig (lane/story, 2026-11-21; docs/STORY-FINISH-PLAN.md): the story PLAYED as a guest on the real stage, start to finish.
// Bundles ./story-entry.tsx with esbuild (production; never next dev / build), compiles the page's Tailwind from the app's config,
// serves both with the hoops-gap static server (the app's public/ behind it) on this lane's port (3861), and drives a phone-sized
// tab (390×844, touch). DPR 1: this rig checks the flow, not the frame rate (the phone rigs measure that).
//
// The walk (each step checked, a JPG of each screen):
//   1. a fresh device: the partner picker → pick → the start screen → START → the first scene's dialogue box;
//   2. the chapter played by the page's own ?demo=1 script (AdventureMode: createPlaythroughDriver, the same driver as
//      story/playthrough.test.ts), fast-forwarded through the probe seam — session.tick() runs the host, the script's input, the
//      story runtime and the chapter runner exactly as a frame does — with a picture at every beat;
//   3. the chapter's end: what the player sees (the end card when it exists, else the hub), the save on the device;
//   4. CONTINUE: a reload mid-chapter (a second device saved at a checkpoint) starts where it stopped;
//   5. the way out: every link on the page at each screen (a page with none is a dead end).
// Prints one JSON verdict and writes story-rig.json + the pictures into OUT. Run under the shared browser gate:
//   /home/user/wt/gate-run.sh 1200 npx tsx scripts/probes/story/story-rig.mts      (OUT=<dir>, PORT=3861)
import { chromium, type Page } from 'playwright-core';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExe } from '../_chromium.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../../..');
const OUT = process.env.OUT ?? '/tmp/story-rig';
const PORT = Number(process.env.PORT ?? 3861);
const SITE = path.join(OUT, 'site');
const PAGE_DIR = path.join(SITE, 'play/adventure');
fs.mkdirSync(PAGE_DIR, { recursive: true });
const esbuild = createRequire(path.join(APP, 'package.json'))('esbuild');
await esbuild.build({
  absWorkingDir: APP, entryPoints: [path.join(HERE, 'story-entry.tsx')], bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'es2020',
  tsconfig: path.join(APP, 'tsconfig.json'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: 'window.process=window.process||{env:{NODE_ENV:"production"}};' },
  loader: { '.glb': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.wasm': 'dataurl' }, logLevel: 'error', outfile: path.join(SITE, 'story.js'),
});
execFileSync(path.join(APP, 'node_modules/.bin/tailwindcss'), ['-c', path.join(APP, 'tailwind.config.ts'), '-i', path.join(APP, 'app/globals.css'), '-o', path.join(SITE, 'story.css')], { cwd: APP, stdio: 'ignore' });
fs.writeFileSync(path.join(PAGE_DIR, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/story.css"><style>html,body,#root{margin:0;height:100%;overflow:hidden;background:#000}</style></head><body><div id="root"></div><script src="/story.js"></script></body></html>`);
console.log('bundle', (fs.statSync(path.join(SITE, 'story.js')).size / 1e6).toFixed(1), 'MB');
// VENICE=1 (lane/story's own tree only): the Venice hub's side of the story gate, bundled the same way
const VENICE = process.env.VENICE === '1';
if (VENICE) {
  fs.mkdirSync(path.join(SITE, 'play/venice'), { recursive: true });
  await esbuild.build({
    absWorkingDir: APP, entryPoints: [path.join(HERE, 'venice-entry.ts')], bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'es2020',
    tsconfig: path.join(APP, 'tsconfig.json'), define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: 'window.process=window.process||{env:{NODE_ENV:"production"}};' },
    loader: { '.glb': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.wasm': 'dataurl' }, logLevel: 'error', outfile: path.join(SITE, 'venice.js'),
  });
  fs.writeFileSync(path.join(SITE, 'play/venice/index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden;background:#000}canvas{width:100%;height:100%;display:block}#card{display:none;position:fixed;left:16px;right:16px;top:16px;padding:12px;border-radius:16px;background:rgba(0,0,0,.75);color:#fff;font:600 16px system-ui}#card .btn{display:block;margin-top:8px;padding:12px;border-radius:12px;background:#facc15;color:#000;text-align:center;font-weight:800;text-decoration:none}</style></head><body><canvas id="c"></canvas><div id="card"></div><script src="/venice.js"></script></body></html>`);
}

const server = spawn(process.execPath, [path.join(APP, 'scripts/probes/hoops-gap/serve.mjs'), SITE, String(PORT)], { stdio: 'ignore' });
const stopServer = () => { try { server.kill(); } catch { /* gone */ } };
process.on('exit', stopServer);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const URL0 = `${ORIGIN}/play/adventure/index.html`;
for (let i = 0; i < 40; i++) { try { if ((await fetch(URL0)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 250)); }

const verdict: Record<string, unknown> = { ok: true, failures: [] as string[], screens: {} as Record<string, unknown>, beats: [] as unknown[] };
const fail = (why: string) => { verdict.ok = false; (verdict.failures as string[]).push(why); console.log('FAIL', why); };
const screens = verdict.screens as Record<string, unknown>;

const SEAM = 'window.__FEL_DEV__ && window.__FEL_DEV__.scene && window.__FEL_DEV__.scene.metadata && window.__FEL_DEV__.scene.metadata.adventure';
async function until<T>(page: Page, fn: string, ok: (v: T) => boolean, sec: number): Promise<T | null> {
  for (let k = 0; k < sec * 4; k++) {
    const v = await page.evaluate(fn).catch(() => null) as T | null;
    if (v !== null && v !== undefined && ok(v)) return v;
    await page.waitForTimeout(250);
  }
  return null;
}
/** What a player can see and press: the visible text, every link (a way out), every button, the test ids on screen. */
async function screen(page: Page, name: string): Promise<Record<string, unknown>> {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 70 });
  const s = await page.evaluate(() => {
    const vis = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); const cs = getComputedStyle(el as HTMLElement); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    return {
      links: [...document.querySelectorAll('a[href]')].filter(vis).map((a) => ({ text: (a.textContent ?? '').trim().slice(0, 60), href: a.getAttribute('href') })),
      buttons: [...document.querySelectorAll('button')].filter(vis).map((b) => (b.textContent ?? '').trim().slice(0, 50)),
      ids: [...document.querySelectorAll('[data-testid]')].filter(vis).map((e) => e.getAttribute('data-testid')),
      text: (document.body.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 600),
      placeholders: ((document.body.innerText ?? '').match(/\[(PLACEHOLDER|DRAFT)\]|PLACEHOLDER|DRAFT/g) ?? []).length,
    };
  });
  const st = await page.evaluate(`(${SEAM}) ? window.__FEL_DEV__.scene.metadata.adventure.state() : null`).catch(() => null);
  const out = { ...s, state: st };
  screens[name] = out;
  console.log('screen', name, JSON.stringify({ links: s.links, buttons: s.buttons, ids: s.ids }).slice(0, 400));
  return out;
}
/** Run the page's own demo script `n` fixed steps (the same thing a rendered frame does, without waiting for the frame). */
const ff = (page: Page, n: number) => page.evaluate(`(() => { const a = ${SEAM}; if (!a) return null; for (let i = 0; i < ${n}; i++) { if (a.session.runner.done) break; if (a.session.paused && a.drive) a.drive(); a.session.tick(); } return a.state(); })()`);
const saved = (page: Page) => page.evaluate(() => { try { const r = localStorage.getItem('fel.adventure.save.v1'); if (!r) return null; const d = JSON.parse(r); const s = d.doc ?? d; return { chapterId: s.story?.chapterId ?? null, beatId: s.story?.beatId ?? null, checkpoint: s.story?.checkpoint ?? null, done: Object.keys(s.story?.flags ?? {}).filter((k) => k.endsWith('.done')), level: s.player?.level ?? null, xp: s.player?.xp ?? null, partner: s.partner?.kind ?? null }; } catch (e) { return { err: String(e) }; } });

const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors: string[] = [];
// tsx keeps function names (esbuild keepNames): a function handed to page.evaluate carries `__name(...)` calls the page lacks
const newCtx = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }); await c.addInitScript('window.__name = (f) => f'); return c; };
try {
  // ── 1. a fresh device: picker → start → the first scene ──
  const ctx = await newCtx();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await page.goto(`${URL0}?demo=1`, { waitUntil: 'load' });
  if (!(await page.getByTestId('adventure-partner-picker').waitFor({ timeout: 60000 }).then(() => true).catch(() => false))) fail('a fresh device shows no partner picker');
  await screen(page, '01-partner-picker');
  await page.getByTestId('adventure-partner-confirm').click();
  const ready = await until<string>(page, `(document.body.innerText.match(/START|CONTINUE|NEW GAME/) || [null])[0]`, (v) => !!v && !/LOADING/.test(v), 240);
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /^(START|CONTINUE)/.test((b.textContent ?? '').trim()) && !(b as HTMLButtonElement).disabled), null, { timeout: 240000 }).catch(() => fail('the start button never enabled'));
  verdict.startLabel = ready;
  await screen(page, '02-start-screen');
  await page.locator('button', { hasText: /^(START|CONTINUE)/ }).first().click();
  if (!(await until(page, `(${SEAM}) ? window.__FEL_DEV__.scene.metadata.adventure.state().beat : null`, (v) => !!v, 60))) fail('START did not start the chapter');
  await page.getByTestId('adventure-dialogue').waitFor({ timeout: 30000 }).catch(() => fail('the first scene shows no dialogue box'));
  await screen(page, '03-first-scene');

  // ── 2. the chapter, every beat ──
  let last = '';
  const t0 = Date.now();
  for (let k = 0; k < 2000; k++) {
    const st = await ff(page, 480) as { beat: string | null; done: boolean; doing: string | null; errors: number } | null;
    if (!st) { fail('the probe seam went away mid-chapter'); break; }
    if (st.beat && st.beat !== last) {
      last = st.beat;
      await page.waitForTimeout(600);   // a couple of rendered frames: the views catch up with the sim
      const sc = await screen(page, `10-beat-${st.beat}`);
      (verdict.beats as unknown[]).push({ beat: st.beat, doing: st.doing, objective: (sc.ids as string[]).includes('adventure-objective'), dialogue: (sc.ids as string[]).includes('adventure-dialogue'), save: await saved(page) });
    }
    if (st.done) break;
    if (Date.now() - t0 > 1200000) { fail('the chapter did not finish inside 20 minutes of fast-forward'); break; }
  }
  const end = await page.evaluate(`(${SEAM}).state()`).catch(() => null) as { done: boolean; flight: boolean } | null;
  verdict.chapterDone = end?.done ?? false;
  if (!end?.done) fail('the chapter did not finish');
  // a few real frames after the last beat, then what the player sees
  await page.waitForTimeout(2500);
  await screen(page, '20-chapter-end');
  verdict.saveAtEnd = await saved(page);
  // the end card's own buttons (lane/story): keep exploring returns to the hub
  if (await page.getByTestId('story-end-card').isVisible().catch(() => false)) {
    verdict.endCard = true;
    await page.getByTestId('story-end-explore').click().catch(() => fail('the end card has no Keep exploring button'));
    await page.waitForTimeout(1200);
    await screen(page, '21-after-end-card');
  } else verdict.endCard = false;
  // the pause screen: is there a way out?
  await page.evaluate(`(() => { const d = window.__FEL_DEV__; if (d && d.input) d.input.emit({ t: 'button', btn: 'START', pressed: true }); })()`).catch(() => {});
  await page.waitForTimeout(1500);
  await screen(page, '22-pause');

  // ── 3. the same device again: what a returning player sees after the chapter ──
  await page.goto(URL0, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /^(START|CONTINUE|EXPLORE)/.test((b.textContent ?? '').trim()) && !(b as HTMLButtonElement).disabled), null, { timeout: 240000 }).catch(() => fail('a returning player\'s start button never enabled'));
  await screen(page, '30-return-start');
  await ctx.close();

  // ── 4. CONTINUE: a second device stops at a checkpoint mid-chapter and comes back ──
  const ctx2 = await newCtx();
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await p2.goto(`${URL0}?demo=1`, { waitUntil: 'load' });
  await p2.getByTestId('adventure-partner-confirm').click({ timeout: 60000 });
  await p2.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /^(START|CONTINUE)/.test((b.textContent ?? '').trim()) && !(b as HTMLButtonElement).disabled), null, { timeout: 240000 });
  await p2.locator('button', { hasText: /^(START|CONTINUE)/ }).first().click();
  await until(p2, `(${SEAM}) ? window.__FEL_DEV__.scene.metadata.adventure.state().beat : null`, (v) => !!v, 60);
  const STOP_AT = 'b08-camp1';
  for (let k = 0; k < 300; k++) { const st = await ff(p2, 60) as { beat: string } | null; if (!st || st.beat === STOP_AT) break; }
  await p2.waitForTimeout(1500);
  const before = await saved(p2);
  verdict.continueSavedAt = before;
  await p2.goto(URL0, { waitUntil: 'load' });
  await p2.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /^(START|CONTINUE)/.test((b.textContent ?? '').trim()) && !(b as HTMLButtonElement).disabled), null, { timeout: 240000 }).catch(() => fail('continue: the start button never enabled'));
  await screen(p2, '40-continue-start');
  await p2.locator('button', { hasText: /^(START|CONTINUE)/ }).first().click();
  const resumed = await until<{ beat: string; pos: unknown }>(p2, `(${SEAM}) ? window.__FEL_DEV__.scene.metadata.adventure.state() : null`, (v) => !!v.beat, 60);
  verdict.continueResumedAt = resumed;
  if (resumed?.beat !== before?.beatId) fail(`continue: saved at ${before?.beatId}, resumed at ${resumed?.beat}`);
  await screen(p2, '41-continue-resumed');
  await ctx2.close();

  // ── 6. Venice: the story gate's card, its button into the story (told it came from Venice), and the way back to the gate ──
  if (VENICE) {
    const ctx3 = await newCtx();
    const p3 = await ctx3.newPage();
    p3.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    await p3.goto(`${ORIGIN}/play/venice/index.html`, { waitUntil: 'load' });
    if (!(await until(p3, `window.__phase === 'playing' && !!window.__VENICE__`, (v) => v === true, 240))) fail('venice: the hub never started');
    const walked = await p3.evaluate(`window.__VENICE__.walkTo('story.gate')`);
    verdict.veniceWalk = walked;
    const at = await until<string>(p3, 'window.__spot', (v) => v === 'story.gate', 240);
    if (at !== 'story.gate') fail(`venice: the walk to the story gate brought no card (spot ${at})`);
    verdict.veniceGateAt = await p3.evaluate(`window.__VENICE__.state()`);
    await screen(p3, '60-venice-story-gate');
    const href = await p3.getByTestId('venice-story').getAttribute('href').catch(() => null);
    verdict.veniceStoryHref = href;
    if (href !== '/play/adventure?from=venice') fail(`venice: the gate's button opens ${href}`);
    // the story opened from Venice: its way out names Venice
    await p3.goto(`${ORIGIN}/play/adventure/index.html?from=venice`, { waitUntil: 'load' });
    await p3.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /^(START|CONTINUE|EXPLORE)/.test((b.textContent ?? '').trim()) || !!document.querySelector('[data-testid=adventure-partner-picker]')), null, { timeout: 240000 }).catch(() => {});
    if (await p3.getByTestId('adventure-partner-confirm').isVisible().catch(() => false)) await p3.getByTestId('adventure-partner-confirm').click();
    await p3.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /^(START|CONTINUE|EXPLORE)/.test((b.textContent ?? '').trim()) && !(b as HTMLButtonElement).disabled), null, { timeout: 240000 }).catch(() => fail('venice→story: the start button never enabled'));
    const sc = await screen(p3, '61-story-from-venice');
    const back = (sc.links as { href: string; text: string }[]).find((l) => /venice/i.test(l.text));
    verdict.storyBackFromVenice = back ?? null;
    if (back?.href !== '/play/venice?spot=story.gate') fail(`story from Venice: its way back is ${back?.href}`);
    // the way back lands beside the gate, facing it
    await p3.goto(`${ORIGIN}/play/venice/index.html?spot=story.gate`, { waitUntil: 'load' });
    if (!(await until(p3, `window.__phase === 'playing' && !!window.__VENICE__`, (v) => v === true, 240))) fail('venice back: the hub never started');
    const landed = await p3.evaluate(`window.__VENICE__.state()`) as { x: number; z: number };
    verdict.veniceBackAt = landed;
    if (!(Math.hypot(landed.x - 42, landed.z + 69) < 8)) fail(`venice back: landed at ${landed.x},${landed.z}, not beside the gate`);
    await screen(p3, '62-venice-back-at-gate');
    await ctx3.close();
  }
} catch (e) {
  fail(`rig: ${String(e).slice(0, 800)}`);
} finally {
  await browser.close();
  stopServer();
}
verdict.pageErrors = errors;
if (errors.length) fail(`page errors: ${errors.length}`);
fs.writeFileSync(path.join(OUT, 'story-rig.json'), JSON.stringify(verdict, null, 2));
console.log(JSON.stringify({ ok: verdict.ok, failures: verdict.failures, chapterDone: verdict.chapterDone, endCard: verdict.endCard, continue: [verdict.continueSavedAt, verdict.continueResumedAt] }));
process.exit(0);
