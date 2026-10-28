// STUDIO-EASY (2026-10-28): the Studio's nine creator tasks, measured on the rig at a phone (390 × 844) and a desktop
// (1280 × 800), plus the accessibility passes. No server, no new dependency: the real /studio page module is bundled with
// esbuild through the a11y rig (scripts/a11y/rig.mts, Babylon bundled, so the viewport is the mode's own engine path),
// served over http from a throwaway server, and driven with playwright-core. The APIs the Studio asks are answered per page
// with page.route: the AI switch (off, as production ships it, or on), CELL's venue answer, the Closet's saved look.
//
// Per task and width: taps (clicks), keys, typed characters, the rig's wall time, a keystroke-level estimate of a person's
// time (KLM: each tap = think 1.35 s + point 1.1 s + press 0.2 s; each shortcut = think 1.35 s + 0.28 s; each typed
// character 0.28 s; rig waits added as measured), the words on screen, whether the next step is on screen, a dead end if the
// task cannot be finished, and a jpg. The a11y pass: the audit's static scan (names, contrast, target size, landmarks) per
// track, a Tab pass, 200 % zoom, reduced motion.
//
//   npx tsx scripts/probes/_studio-easy-probe.mts <outDir> <label> --build-only
//   flock /home/user/wt/gate-queue.lock timeout 900 npx tsx scripts/probes/_studio-easy-probe.mts <outDir> <label> [--widths=phone,desktop] [--tasks=new,place,…] [--a11y]
// Reads/writes <outDir>/.build-<label>; writes <outDir>/<label>/{tasks-<width>.json,a11y.json} and the jpgs.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
import { buildRig } from '../a11y/rig.mts';
import * as wcagNs from '../../lib/a11y/wcag.ts';
import type { Violation } from '../../lib/a11y/wcag.ts';
import * as castNs from '../../tests/helpers/studioCast.ts';

const wcag = ((wcagNs as { default?: unknown }).default ?? wcagNs) as typeof wcagNs;
const cast = ((castNs as { default?: unknown }).default ?? castNs) as typeof castNs;

const ROOT = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const pos = args.filter((a) => !a.startsWith('--'));
const OUT_ROOT = resolve(pos[0] ?? join(ROOT, '.studio-easy'));
const LABEL = pos[1] ?? 'now';
const BUILD = join(OUT_ROOT, `.build-${LABEL}`);
const OUT = join(OUT_ROOT, LABEL);
mkdirSync(OUT, { recursive: true });

if (args.includes('--build-only') || !existsSync(join(BUILD, 'index.html'))) {
  await buildRig(BUILD, { entry: join(ROOT, 'scripts/probes/_studio-easy-entry.tsx'), fontBase: '/__fonts', external: ['@mediapipe/tasks-vision'] });
  console.log(`built → ${BUILD}`);
  if (args.includes('--build-only')) process.exit(0);
}

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2', '.env': 'application/octet-stream', '.hdr': 'application/octet-stream', '.webp': 'image/webp' };
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (p.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not_found"}'); return; }
  const file = p.startsWith('/__fonts/') ? join(ROOT, 'app/fonts', p.slice(9)) : existsSync(join(BUILD, p)) && p !== '/' ? join(BUILD, p) : join(ROOT, 'public', p);
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const WIDTHS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } } as const;
type Width = keyof typeof WIDTHS;
const widths = (flag('widths')?.split(',') ?? ['desktop', 'phone']) as Width[];
const ALL_TASKS = ['new', 'firstcourt', 'place', 'ai', 'character', 'script', 'playtest', 'save', 'reopen', 'publish'] as const;
type Task = (typeof ALL_TASKS)[number];
const tasks = (flag('tasks')?.split(',') ?? [...ALL_TASKS]) as Task[];

const CODE = await cast.castCode();
// CELL's answer for the canned prompt: a night court, four floods, a far stand (the vocabulary of lib/nexus-studio/aiEdits.ts)
const CELL_ANSWER = { edits: [
  { op: 'venue', set: { mood: 'nightGame' } },
  { op: 'row', item: 'fixture:flood', from: [-12, -16], to: [12, -16], count: 4 },
  { op: 'place', item: 'crowd:bleacher', at: [0, 0, -22], yaw: 0 },
], dropped: 0 };

async function stub(page: Page, ai: 'off' | 'on') {
  await page.route('**/api/ai/status', (r) => r.fulfill({ json: ai === 'on' ? { coach: 'available', studio: 'available' } : { coach: 'coming_soon', studio: 'coming_soon' } }));
  await page.route('**/api/cell/venue', async (r) => {
    const body = JSON.parse(r.request().postData() ?? '{}');
    if (ai !== 'on') return r.fulfill({ status: 503, json: { status: 'coming_soon', feature: 'studio', message: 'x' } });
    await new Promise((res) => setTimeout(res, 1500));   // a model's answer is not instant
    return body.mode === 'explain' ? r.fulfill({ json: { summary: 'A golden-hour tennis court with nothing placed yet.' } }) : r.fulfill({ json: CELL_ANSWER });
  });
  await page.route('**/api/v1/closet', (r) => r.fulfill({ json: { look: { face: { creatorSlots: [cast.CAST_SLOT] } } } }));
  await page.route('**/api/profile', (r) => r.fulfill({ status: 404, json: {} }));
}

// ── counting ─────────────────────────────────────────────────────────────────────────────────────────────────────────
interface Count { taps: number; keys: number; chars: number; waitMs: number; steps: string[] }
const K = { think: 1.35, point: 1.1, press: 0.2, key: 0.28 };
const klm = (c: Count) => Math.round((c.taps * (K.think + K.point + K.press) + c.keys * (K.think + K.key) + c.chars * K.key + c.waitMs / 1000) * 10) / 10;

class Driver {
  c: Count = { taps: 0, keys: 0, chars: 0, waitMs: 0, steps: [] };
  constructor(public page: Page, public width: Width) {}
  reset() { this.c = { taps: 0, keys: 0, chars: 0, waitMs: 0, steps: [] }; }
  /** a tap on the first VISIBLE match; returns false (and records it) when there is none or it is off screen */
  async tap(sel: string, what: string): Promise<boolean> {
    const loc = this.page.locator(sel).filter({ visible: true }).first();
    if (!(await loc.count())) { this.c.steps.push(`✗ ${what}: not on screen`); return false; }
    const box = await loc.boundingBox();
    const vw = WIDTHS[this.width].width;
    const off = !box || box.x + box.width / 2 > vw || box.x + box.width / 2 < 0;
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 });
      await loc.click({ timeout: 5000 });
    } catch (e) { this.c.steps.push(`✗ ${what}: ${String(e).split('\n')[0].slice(0, 90)}`); return false; }
    this.c.taps++; this.c.steps.push(`${what}${off ? ' (was off screen: needed a sideways scroll)' : ''}`);
    return true;
  }
  async key(k: string, what: string) { await this.page.keyboard.press(k); this.c.keys++; this.c.steps.push(`${k} (${what})`); }
  async type(sel: string, text: string, what: string) { const l = this.page.locator(sel).filter({ visible: true }).first(); await l.click(); this.c.taps++; await l.fill(text); this.c.chars += text.length; this.c.steps.push(`type ${what}`); }
  async waitFor(fn: string, ms: number, what: string): Promise<boolean> {
    const t0 = Date.now();
    const ok = await this.page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
    this.c.waitMs += Date.now() - t0; this.c.steps.push(`${ok ? 'wait' : '✗ wait'} ${what} ${Date.now() - t0} ms`);
    return ok;
  }
}

const SCREEN = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
  // words a person sees: text runs inside the window (a long list scrolled out of its panel is not on screen)
  let words = 0;
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const el = n.parentElement; if (!el || !n.textContent.trim() || !vis(el)) continue;
    const range = document.createRange(); range.selectNodeContents(n); const r = range.getBoundingClientRect();
    let clip = el.parentElement, shown = r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    for (; shown && clip; clip = clip.parentElement) { const cs = getComputedStyle(clip); if (/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflowX)) { const cr = clip.getBoundingClientRect(); if (r.top > cr.bottom || r.bottom < cr.top || r.left > cr.right || r.right < cr.left) shown = false; } }
    if (shown) words += n.textContent.split(/\\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  }
  const sizes = new Set(); let tiny = 0, runs = 0;
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e)) continue;
    if (Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) { const fs = parseFloat(getComputedStyle(e).fontSize); sizes.add(fs); runs++; if (fs < 12) tiny++; }
  }
  let smallTargets = 0, targets = 0;
  for (const e of document.querySelectorAll('button, a[href], input, select, textarea, [role=tab], [role=switch]')) {
    if (!vis(e)) continue; targets++; const r = e.getBoundingClientRect(); if (r.width < 24 || r.height < 24) smallTargets++;
  }
  return { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, innerWidth, innerHeight,
    words, fontSizes: [...sizes].sort((a, b) => a - b), tinyTextRuns: tiny, textRuns: runs, targets, smallTargets };
})()`;

const objects = `(() => { try { const p = JSON.parse(localStorage.getItem('fel.nexusStudio.v1') || 'null'); const v = p && (p.venues || []).find((x) => x.id === p.activeVenueId); return v ? v.objects.length : -1; } catch { return -2; } })()`;
const saveText = `(document.querySelector('[data-testid=save-state]')?.textContent || '').trim()`;
const viewportReady = `!!window.__NEXUS_STUDIO__ && !Array.from(document.querySelectorAll('[data-testid=studio-canvas] ~ div')).some((d) => /Building the venue/.test(d.textContent || ''))`;

async function open(page: Page, fresh: boolean) {
  await page.goto(`${ORIGIN}/index.html${fresh ? '?fresh=1' : ''}`);
  await page.waitForFunction('document.body.dataset.a11yReady || document.body.dataset.a11yError', null, { timeout: 60000 });
  await page.waitForTimeout(500);
}

async function shot(page: Page, name: string) { await page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 72 }); }

interface TaskResult { task: Task; width: Width; done: boolean; deadEnd?: string; taps: number; keys: number; chars: number; rigS: number; klmS: number; steps: string[]; screen: unknown; undo?: string; notes: string[] }

async function runTask(browser: Browser, width: Width, task: Task): Promise<TaskResult> {
  const ctx = await browser.newContext({ viewport: WIDTHS[width], deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await stub(page, task === 'ai' ? 'on' : 'off');
  await open(page, true);
  const d = new Driver(page, width);
  const notes: string[] = [];
  let done = false; let deadEnd: string | undefined; let undo: string | undefined;
  const tLoad = Date.now();
  const ready = await d.waitFor(viewportReady, 150000, 'the viewport');
  notes.push(ready ? `viewport ready in ${((Date.now() - tLoad) / 1000).toFixed(1)} s` : 'the viewport did not finish loading on the rig');
  d.reset();   // the first load is not part of any task's taps (it is reported apart as the viewport's load time)
  const t0 = Date.now();
  const btn = (re: string) => `button:text-matches("${re}", "i"), [role=tab]:text-matches("${re}", "i")`;
  const aria = (re: string) => `button[aria-label*="${re}" i], button[title*="${re}" i]`;
  const before = await page.evaluate(objects);

  switch (task) {
    case 'new': {
      // a first visit: is there a project, and is the next step said? then: start a second, new project
      const welcome = await page.locator('text=/make your first|start here|step 1/i').count();
      notes.push(welcome ? 'a first-visit guide is on screen' : 'no first-visit guide: the editor opens on an empty venue with no hint of a first step');
      const newBtn = page.locator(`${btn('new project')}, ${aria('new project')}`).filter({ visible: true });
      if (await newBtn.count()) {
        await d.tap(`${btn('new project')}, ${aria('new project')}`, 'New project');
        const confirm = page.locator(btn('^(start|create|make)')).filter({ visible: true });
        if (await confirm.count()) await d.tap(btn('^(start|create|make)'), 'confirm');
        done = true;
      } else { deadEnd = 'no "new project": a device keeps one project; the only ways out are Import or clearing site data'; }
      break;
    }
    case 'firstcourt': {
      // a first court that looks like something: a night light, floods round it, the walk-in intro played
      const guide = page.locator('[data-testid=first-court]').filter({ visible: true });
      if (await guide.count()) {
        notes.push('the guide is open on arrival');
        await d.tap('[data-testid=guide-light-nightGame]', 'Night game');
        await d.tap('[data-testid=guide-add-floods]', 'Floodlights');
        await d.tap('[data-testid=guide-watch]', 'Watch it');
        await page.waitForTimeout(1500);
        await shot(page, `${width}-firstcourt-watch`);
        await d.tap('[data-testid=guide-finish]', 'Keep building');
      } else {
        notes.push('no guide: by hand, from four places (the Mood list, the Stamps tab, the Intro list, the preview button)');
        const mood = page.locator('select[aria-label="Mood"]').filter({ visible: true }).first();
        if (!(await mood.count())) { deadEnd = 'the Mood list is not on screen'; break; }
        await mood.scrollIntoViewIfNeeded(); await mood.selectOption('nightGame'); d.c.taps += 2; d.c.steps.push('Mood list: open + Night game');
        await d.tap('[role=tab]:text-matches("^\\s*stamps\\s*$", "i")', 'Stamps');
        await d.tap('button[aria-label="Place Flood corner set"]', 'Flood corner set');
        const intro = page.locator('select[aria-label="Intro"]').filter({ visible: true }).first();
        if (await intro.count()) { await intro.scrollIntoViewIfNeeded(); await intro.selectOption('walkIn'); d.c.taps += 2; d.c.steps.push('Intro list: open + walk-in'); }
        await d.tap('button[aria-label="Preview the intro"]', 'Preview the intro');
        await page.waitForTimeout(1500);
      }
      await d.waitFor(`(() => { const p = JSON.parse(localStorage.getItem('fel.nexusStudio.v1') || 'null'); const v = p && p.venues.find((x) => x.id === p.activeVenueId); return !!v && v.mood === 'nightGame' && v.objects.filter((o) => o.type === 'fixture').length >= 4; })()`, 6000, 'the court saved: night light, four floods');
      done = d.c.steps[d.c.steps.length - 1].startsWith('wait');
      break;
    }
    case 'place': {
      // place a floodlight from Assets and change its colour, then undo the colour
      const sheet = page.locator(btn('^(assets|add)$')).filter({ visible: true });
      if (await sheet.count() && (await sheet.first().getAttribute('aria-selected')) !== 'true') await d.tap(btn('^(assets|add)$'), 'Assets');
      const placed = await d.tap('[data-testid=asset-list] button:has-text("Floodlight")', 'Floodlight');
      if (!placed) { deadEnd = 'the asset list is not reachable'; break; }
      await page.waitForTimeout(300);
      const insp = page.locator('[data-testid=inspector] input[type=color]').filter({ visible: true }).first();
      if (!(await insp.count())) {
        const tab = page.locator(btn('^inspect')).filter({ visible: true });
        if (await tab.count()) await d.tap(btn('^inspect'), 'Inspect');
      }
      const colour = page.locator('[data-testid=inspector] input[type=color]').filter({ visible: true }).first();
      if (await colour.count()) {
        const box = await colour.boundingBox();
        if (!box || box.x > WIDTHS[width].width) notes.push('the inspector is off screen to the right');
        await colour.fill('#ff3366'); d.c.taps += 2; d.c.steps.push('colour picker: open + pick');
        done = true;
      } else { deadEnd = 'the inspector (colour) is not reachable'; }
      await d.waitFor(`${objects} >= ${Math.max(0, before as number) + 1}`, 5000, 'autosave of the new light');
      await d.key('Control+z', 'undo the colour');
      await page.waitForTimeout(200);
      const lightColour = await page.evaluate(`(() => { const p = JSON.parse(localStorage.getItem('fel.nexusStudio.v1') || 'null'); return null; })()`);
      void lightColour;
      undo = (await page.locator('button[aria-label^="Redo"]').first().isEnabled().catch(() => false)) ? 'Ctrl+Z took the colour back; Redo is lit' : 'Ctrl+Z did nothing visible';
      break;
    }
    case 'ai': {
      await d.tap(btn('^ai builder$'), 'AI builder');
      await page.waitForTimeout(400);
      const off = await page.locator('text=/coming soon/i').count();
      if (off) notes.push('with the switch off (production default) the track says the AI builder is coming soon');
      const chip = page.locator('[data-testid=ai-venue-panel] button.rounded-full, [data-testid=ai-example]').filter({ visible: true }).first();
      if (await chip.count()) { await chip.click(); d.c.taps++; d.c.steps.push('an example'); }
      else await d.type('textarea[aria-label="Describe the venue"]', 'a night court with floodlights and a far stand', 'a description');
      if (!(await d.tap('[data-testid=ai-venue-panel] button:text-matches("^\\\\s*Build", "i"), [data-testid=ai-build]', 'Build'))) { deadEnd = 'Build is not reachable'; break; }
      if (!(await d.waitFor(`!!document.querySelector('[data-testid=ai-venue-review]')`, 10000, 'CELL’s answer'))) { deadEnd = 'no review list came back'; break; }
      await shot(page, `${width}-ai-review`);
      if (!(await d.tap('[data-testid=ai-venue-review] button:text-matches("apply", "i")', 'Apply'))) { deadEnd = 'Apply is not reachable'; break; }
      await d.waitFor(`${objects} > ${before}`, 4000, 'the edits saved');
      done = true;
      await d.key('Control+z', 'undo the whole build');
      await page.waitForTimeout(400);
      undo = await page.evaluate(`(() => { const t = document.querySelector('button[aria-label^="Redo"]'); return t && !t.disabled ? 'one Ctrl+Z took the whole build back' : 'Ctrl+Z did nothing visible'; })()`) as string;
      break;
    }
    case 'character': {
      await d.tap(btn('^characters$'), 'Characters');
      if (!(await d.tap(btn('from my closet'), 'From my Closet'))) { deadEnd = 'no way in from the Closet'; break; }
      await d.waitFor(`!!document.querySelector('[data-testid=closet-looks] button')`, 6000, 'the Closet’s looks');
      if (!(await d.tap('[data-testid=closet-looks] button', 'a saved look'))) { deadEnd = 'no saved look to pick'; break; }
      if (!(await d.tap('[data-testid=character-row] button:text-matches("^cast in", "i")', 'Cast in the venue'))) { deadEnd = 'no cast button'; break; }
      done = true;
      await page.waitForTimeout(300);
      notes.push(`after casting the Studio is on the ${await page.evaluate(`document.querySelector('[role=tab][aria-selected=true]')?.textContent?.trim()`)} track`);
      break;
    }
    case 'script': {
      await d.tap(btn('^scripts$'), 'Scripts');
      if (!(await d.tap(btn('point won'), '“Point won → cheer”'))) { deadEnd = 'no starter script'; break; }
      await page.waitForTimeout(300);
      done = (await page.locator('[data-testid=script-canvas] g').count()) > 0;
      // keyboard: can a node be reached and changed without a mouse?
      const focusableNodes = await page.locator('[data-testid=script-canvas] [tabindex]').count();
      notes.push(focusableNodes ? `${focusableNodes} graph nodes take focus` : 'no graph node takes keyboard focus (mouse only)');
      break;
    }
    case 'playtest': {
      const popup = page.waitForEvent('popup', { timeout: 4000 }).catch(() => null);
      if (!(await d.tap(btn('play-test|play test|^play'), 'Play-test'))) { deadEnd = 'no Play-test button on screen'; break; }
      const pop = await popup;
      if (pop) { notes.push(`opens a new tab: ${new URL(pop.url()).pathname}${new URL(pop.url()).search.slice(0, 40)}…  (development builds only: production says “Play-test runs in a development build only”)`); await pop.close(); done = true; }
      else { const msg = await page.locator('[role=status]').first().textContent().catch(() => ''); deadEnd = `no tab opened: ${msg}`; }
      break;
    }
    case 'save': {
      await d.tap('[data-testid=asset-list] button:has-text("Floodlight")', 'Floodlight (an edit)');
      const tEdit = Date.now();
      const seen: string[] = [];
      for (let i = 0; i < 20 && !/saved on/i.test(seen[seen.length - 1] ?? ''); i++) { await page.waitForTimeout(150); const t = await page.evaluate(saveText) as string; if (seen[seen.length - 1] !== t) seen.push(t); }
      notes.push(`save state after an edit: ${seen.join(' → ')} (${Date.now() - tEdit} ms, no tap)`);
      done = /saved/i.test(seen[seen.length - 1] ?? '');
      break;
    }
    case 'reopen': {
      await d.tap('[data-testid=asset-list] button:has-text("Floodlight")', 'Floodlight (an edit)');
      await page.waitForTimeout(2200);
      const n = await page.evaluate(objects);
      await page.reload(); await page.waitForFunction('document.body.dataset.a11yReady', null, { timeout: 60000 });
      d.c.steps.push('reload (the creator comes back)');
      await d.waitFor(viewportReady, 150000, 'the viewport again');
      const after = await page.evaluate(objects);
      done = after === n;
      notes.push(`objects before ${n}, after reopening ${after}; the project list: ${await page.locator('text=/my projects|recent projects|open project/i').count() ? 'shown' : 'none (one project per device)'}`);
      undo = (await page.locator('button[aria-label^="Undo"]').first().isEnabled().catch(() => false)) ? 'undo history survives a reopen' : 'undo history is gone after a reopen (expected: it is per session)';
      break;
    }
    case 'publish': {
      const pub = page.locator(`${btn('publish|share')}, ${aria('publish')}, ${aria('share')}`).filter({ visible: true });
      if (await pub.count()) { await d.tap(`${btn('publish|share')}, ${aria('publish')}, ${aria('share')}`, 'Publish / Share'); done = true; }
      else {
        deadEnd = 'no publish or share on this base: Export (.nexus.json) is the only way to hand a project on';
        const dl = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
        await d.tap(aria('export'), 'Export');
        const f = await dl; if (f) notes.push(`Export downloads ${f.suggestedFilename()}`);
      }
      break;
    }
  }
  const rigS = Math.round((Date.now() - t0) / 100) / 10;
  await page.waitForTimeout(250);
  const screen = await page.evaluate(SCREEN);
  await shot(page, `${width}-${task}`);
  if (errors.length) notes.push(`page errors: ${errors.slice(0, 2).join(' | ')}`);
  await ctx.close();
  return { task, width, done, deadEnd, taps: d.c.taps, keys: d.c.keys, chars: d.c.chars, rigS, klmS: klm(d.c), steps: d.c.steps, screen, undo, notes };
}

// ── the accessibility pass ───────────────────────────────────────────────────────────────────────────────────────────
async function a11y(browser: Browser) {
  const out: Record<string, unknown> = {};
  for (const width of widths) {
    const ctx = await browser.newContext({ viewport: WIDTHS[width] });
    const page = await ctx.newPage(); await stub(page, 'off'); await open(page, true);
    await page.waitForFunction(viewportReady, null, { timeout: 150000 }).catch(() => {});
    const perTrack: Record<string, unknown> = {};
    for (const t of ['Venues', 'AI builder', 'Characters', 'Scripts']) {
      const tab = page.locator(`[role=tab]:text-matches("^\\\\s*${t}\\\\s*$", "i")`).filter({ visible: true }).first();
      if (await tab.count()) { await tab.click().catch(() => {}); await page.waitForTimeout(400); }
      const st = await page.evaluate('window.__a11y.staticScan()') as { violations: Violation[]; interactive: number };
      const v = wcag.dedupe(st.violations);
      perTrack[t] = { interactive: st.interactive, ...wcag.tally(v), sample: v.filter((x) => x.severity !== 'moderate').slice(0, 6).map((x) => `${x.rule} ${x.target}${x.detail ? ` ${x.detail}` : ''}`) };
    }
    // the Tab pass on the venue editor, from the top: where focus goes, whether it shows, how many Tabs reach the first asset
    const vt = page.locator('[role=tab]:text-matches("^\\\\s*Venues\\\\s*$", "i")').filter({ visible: true }).first();
    if (await vt.count()) await vt.click().catch(() => {});
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await page.evaluate('window.__a11y.prepareFocus()');
    const stops: Array<{ target: string; body: boolean }> = [];
    let toAsset = -1, toCanvas = -1;
    for (let i = 0; i < 120; i++) {
      await page.keyboard.press('Tab');
      const s = await page.evaluate('window.__a11y.focusStop()') as { target: string; body: boolean };
      if (s.body && i > 0) break;
      stops.push(s);
      const inAssets = await page.evaluate(`!!document.activeElement?.closest('[data-testid=asset-list]')`);
      if (inAssets && toAsset < 0) toAsset = i + 1;
      const onCanvas = await page.evaluate(`document.activeElement?.getAttribute('data-testid') === 'studio-canvas'`);
      if (onCanvas && toCanvas < 0) toCanvas = i + 1;
    }
    const fv = await page.evaluate(`window.__a11y.judgeFocus(${JSON.stringify(stops)})`) as Violation[];
    const ft = wcag.tally(wcag.dedupe(fv));
    out[width] = { perTrack, tab: { stops: stops.length, tabsToFirstAsset: toAsset, tabsToViewport: toCanvas, ...ft, sample: wcag.dedupe(fv).slice(0, 6).map((x) => `${x.rule} ${x.target}`) } };
    await ctx.close();
  }
  // 200 % zoom of the desktop, and reduced motion
  {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage(); await stub(page, 'off'); await open(page, true);
    out.zoom200 = await page.evaluate(SCREEN);
    await shot(page, 'zoom200');
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: WIDTHS.desktop, reducedMotion: 'reduce' });
    const page = await ctx.newPage(); await stub(page, 'off'); await open(page, true);
    await page.waitForTimeout(1200);
    out.reducedMotion = await page.evaluate(`(() => document.getAnimations().filter((a) => a.playState === 'running').length)()`);
    await ctx.close();
  }
  return out;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  if (args.includes('--a11y')) {
    const r = await a11y(browser);
    writeFileSync(join(OUT, 'a11y.json'), JSON.stringify(r, null, 1));
    console.log(JSON.stringify(r, null, 1));
  } else {
    for (const width of widths) {
      const rows: TaskResult[] = [];
      for (const t of tasks) {
        const r = await runTask(browser, width, t);
        rows.push(r);
        console.log(`${width.padEnd(7)} ${t.padEnd(9)} ${r.done ? 'done' : 'DEAD END'} taps ${r.taps} keys ${r.keys} rig ${r.rigS}s klm ${r.klmS}s ${r.deadEnd ? `· ${r.deadEnd}` : ''} ${r.notes.join(' · ')}`);
      }
      const file = join(OUT, `tasks-${width}${flag('tasks') ? `-${tasks.join('_')}` : ''}.json`);
      writeFileSync(file, JSON.stringify({ label: LABEL, width, when: new Date().toISOString(), rows }, null, 1));
    }
  }
} finally {
  await browser.close();
  server.close();
}
