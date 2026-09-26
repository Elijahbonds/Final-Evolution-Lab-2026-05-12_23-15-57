// MUSIC-SUITE P3 FIX PASS (2026-09-25) — the review's findings, measured in a browser on the dev-only /dev/music route
// (the real StudioMode, no GameShell, database offline). Each block is a finding the review reproduced in the code:
//   1. TWO TABS, ONE PROJECT — a tab with nothing unsaved takes the other tab's save (BroadcastChannel + re-check); two
//      edits at once: the later tab's save is REFUSED (never an overwrite), the room says so, RELOAD / SAVE AS A COPY work.
//   2. A REFUSED SAVE BLOCKS A SWITCH — a full device, then + NEW: the switch is refused with SWITCH ANYWAY / STAY and the
//      work stays on screen; once there is room, the refused save goes through on the next flush.
//   3. PER PLAYER — Ana builds a beat; Ben on the same browser opens a fresh project and lists none of hers.
//   4. REMIX IS HELD WHILE A TAKE RECORDS — REMIX refuses with the line; the take's STOP shows on the LIBRARY tab; the take
//      lands in the project it was recorded in.
//   5. A TAKE'S × ASKS, and UNDO brings the take back (with its audio).
//   6. A NEW FLIP SOURCE OVER YOUR OWN RECORDING ASKS, and UNDO brings the recording back.
//   7. SONG MODE HOLDS SAVE GRID AS SECTION (it saved the hidden grid).
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p3-fixpass.mts   (BASE, OUT env override)
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p3/fixpass';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p3fix +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), route: '/dev/music', frames: {}, pageErrors: [] as string[], checks: [] as Any[] };
const check = (name: string, pass: boolean, got: unknown, want: unknown) => { R.checks.push({ name, pass, got, want }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(got)); };
const frame = async (p: Page, name: string) => { const path = `${OUT}/p3fix-${name}.png`; await p.screenshot({ path, fullPage: true }); R.frames[name] = path; };

const GRID_EL = `[...document.querySelectorAll('div')].find((d) => (d.style.gridTemplateColumns || '').includes('repeat(16'))`;
const lit = (p: Page) => p.evaluate(`(() => { const g = ${GRID_EL}; return g ? [...g.children].filter((c) => getComputedStyle(c).backgroundColor === 'rgb(255, 179, 71)').length : -1; })()`) as Promise<number>;
const cellOn = (p: Page, row: number, step: number) => p.evaluate(`(() => { const g = ${GRID_EL}; return getComputedStyle(g.children[${row} * 17 + 1 + ${step}]).backgroundColor === 'rgb(255, 179, 71)'; })()`) as Promise<boolean>;
const clickCell = (p: Page, row: number, step: number) => p.evaluate(`(() => { const g = ${GRID_EL}; g.children[${row} * 17 + 1 + ${step}].click(); })()`);
const proj = (p: Page) => p.evaluate(() => (window as Any).__FEL_PROJECT__ ?? null);
const song = (p: Page) => p.evaluate(() => (window as Any).__FEL_SONG__ ?? null);
const flip = (p: Page) => p.evaluate(() => (window as Any).__FEL_FLIP__ ?? null);
const btn = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).first();
const qa = (p: Page, id: string) => p.locator(`[data-qa="${id}"]`);
const statusLine = (p: Page) => qa(p, 'save-status').textContent();
const toastText = (p: Page) => p.evaluate(() => [...document.querySelectorAll('div')].filter((d) => d.style.position === 'sticky').map((d) => d.textContent ?? '').pop() ?? null);
const STUDIO_TIER = `try { if (!localStorage.getItem('fel-music-progress')) localStorage.setItem('fel-music-progress', '{"patternsMade":1,"sectionsSaved":2,"chainEntries":2}'); } catch {}`;

async function startRoom(p: Page): Promise<void> {
  const start = p.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 240000 });
  await start.click();
  await p.waitForFunction(`(${GRID_EL}) != null`, undefined, { timeout: 60000 });
  await p.waitForTimeout(400);
}
async function openRoom(p: Page, path = '/dev/music?stage=studio'): Promise<void> {
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await startRoom(p);
}
async function saved(p: Page, ms = 4000): Promise<string> {
  await p.waitForFunction(() => /Saved on this device ·/.test(document.querySelector('[data-qa="save-status"]')?.textContent ?? ''), undefined, { timeout: ms }).catch(() => undefined);
  return (await statusLine(p)) ?? '';
}
function watch(p: Page, name: string): void { p.on('pageerror', (e) => R.pageErrors.push(`${name}: ${e.message}`)); }
async function newCtx(browser: Browser, init?: string): Promise<{ ctx: BrowserContext; p: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, permissions: ['microphone'] });
  if (init) await ctx.addInitScript(init);
  return { ctx, p: await ctx.newPage() };
}
/** The stored record of a project, read straight from IndexedDB (what a reload would open). */
const stored = (p: Page, id: string) => p.evaluate((pid) => new Promise<Any>((res) => {
  const r = indexedDB.open('fel-studio', 1);
  r.onsuccess = () => { const db = r.result; const q = db.transaction('projects', 'readonly').objectStore('projects').get(pid); q.onsuccess = () => { db.close(); res(q.result ?? null); }; };
  r.onerror = () => res(null);
}), id);
const storedHits = async (p: Page, id: string): Promise<number | null> => {
  const rec = await stored(p, id);
  return rec ? (rec.body.tracks as Any[]).reduce((n: number, t: Any) => n + t.pattern.filter(Boolean).length, 0) : null;
};

// ── 1. two tabs ──────────────────────────────────────────────────────────────────────────────────────────────────────
async function twoTabs(browser: Browser): Promise<void> {
  const { ctx, p: A } = await newCtx(browser);
  watch(A, 'tabA');
  await openRoom(A);
  for (const s of [0, 4, 8, 12]) await clickCell(A, 0, s);
  await saved(A);
  const id = (await proj(A)).id as string;
  const B = await ctx.newPage();
  watch(B, 'tabB');
  await openRoom(B);
  check('tab B opens the same project (the remembered open id)', (await proj(B)).id === id && (await lit(B)) === 4, { idB: (await proj(B)).id, lit: await lit(B) }, `${id}, 4 lit`);

  // B saves; A has nothing unsaved → A takes B's version and says so
  await clickCell(B, 1, 4); await clickCell(B, 1, 12);
  await saved(B);
  await A.waitForFunction(() => /saved in another tab/.test(document.querySelector('[data-qa="project-notice"]')?.textContent ?? ''), undefined, { timeout: 5000 }).catch(() => undefined);
  const aNotice = await qa(A, 'project-notice').textContent().catch(() => null);
  check('a tab with nothing unsaved takes the other tab\'s save, and says so', (await lit(A)) === 6 && /saved in another tab/.test(aNotice ?? ''), { litA: await lit(A), notice: aNotice }, '6 lit + the notice');

  // round 1: A edits, B edits 60 ms later → A saves first; B's save is refused (never an overwrite) → RELOAD
  await clickCell(A, 2, 1);
  await A.waitForTimeout(60);
  await clickCell(B, 2, 3);
  await B.waitForTimeout(1600);
  const bConflict = await qa(B, 'project-conflict').isVisible().catch(() => false);
  const bLine = await statusLine(B);
  const hits1 = await storedHits(A, id);
  const aCell = await (async () => { const rec = await stored(A, id); return rec?.body.tracks[2].pattern[1] === true && rec?.body.tracks[2].pattern[3] !== true; })();
  await frame(B, 'conflict');
  check('two edits at once: the later tab is REFUSED and says so — the store keeps the first tab\'s edit, not a blend, not an overwrite',
    bConflict && /changed in another tab/.test(bLine ?? '') && hits1 === 7 && aCell, { bConflict, bLine, storedHits: hits1, aCellOnly: aCell }, 'conflict line + RELOAD / SAVE AS A COPY; 7 stored, A\'s cell');
  await qa(B, 'project-reload').click();
  await B.waitForTimeout(500);
  check('RELOAD opens the saved version (A\'s edit), and the conflict clears', (await cellOn(B, 2, 1)) && !(await cellOn(B, 2, 3)) && !(await qa(B, 'project-conflict').isVisible().catch(() => false)),
    { a1: await cellOn(B, 2, 1), b3: await cellOn(B, 2, 3), status: await statusLine(B) }, 'A\'s cell on, B\'s off');

  // round 2: B first, then A → A refused → SAVE AS A COPY keeps A's screen as a new project; the original keeps B's
  await clickCell(B, 2, 5);
  await B.waitForTimeout(60);
  await clickCell(A, 2, 7);
  await A.waitForTimeout(1600);
  const aConflict = await qa(A, 'project-conflict').isVisible().catch(() => false);
  await qa(A, 'project-save-copy').click();
  await A.waitForTimeout(700);
  const copy = await proj(A);
  const orig = await stored(A, id);
  const copyRec = await stored(A, copy.id);
  check('SAVE AS A COPY keeps the refused tab\'s work as its own project; the original keeps the other tab\'s',
    aConflict && copy.id !== id && /\(copy\)$/.test(copy.title) && copyRec?.body.tracks[2].pattern[7] === true && orig?.body.tracks[2].pattern[5] === true && orig?.body.tracks[2].pattern[7] !== true,
    { aConflict, copy: { id: copy.id, title: copy.title }, copyHas7: copyRec?.body.tracks[2].pattern[7], origHas5: orig?.body.tracks[2].pattern[5], origHas7: orig?.body.tracks[2].pattern[7] ?? false }, 'copy has A\'s cell; original has B\'s only');
  await ctx.close();
}

// ── 2. a refused save blocks a switch ────────────────────────────────────────────────────────────────────────────────
async function blockedSwitch(browser: Browser): Promise<void> {
  const { ctx, p } = await newCtx(browser, `(() => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...a) { if (window.__P3_FULL__) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return put.apply(this, a); }; })();`);
  watch(p, 'blocked');
  await openRoom(p);
  await clickCell(p, 0, 0);
  await saved(p);
  const id = (await proj(p)).id;
  await p.evaluate(() => { (window as Any).__P3_FULL__ = true; });
  await clickCell(p, 0, 8); await clickCell(p, 1, 4);
  await p.waitForTimeout(900);
  const line = await statusLine(p);
  await qa(p, 'projects-toggle').click();
  await qa(p, 'project-new').click();
  await p.waitForTimeout(600);
  const blocked = await qa(p, 'switch-blocked').textContent().catch(() => null);
  const stayed = { id: (await proj(p)).id, lit: await lit(p) };
  await frame(p, 'switch-blocked');
  check('a full device, then + NEW: the switch is REFUSED (SWITCH ANYWAY / STAY) and the unsaved work stays on screen',
    /out of space/.test(line ?? '') && /NOT saved/.test(blocked ?? '') && /SWITCH ANYWAY/.test(blocked ?? '') && stayed.id === id && stayed.lit === 3,
    { line, blocked, stayed }, 'refused; same project, 3 lit');
  await qa(p, 'switch-stay').click();
  await p.evaluate(() => { (window as Any).__P3_FULL__ = false; });   // room made
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // (visible: a re-check; no flush)
  await qa(p, 'project-new').click();                                // the switch flushes the refused save first — it goes through now
  await p.waitForTimeout(800);
  const after = await proj(p);
  check('once there is room the refused save goes through on the switch, and the switch happens', after.id !== id && (await storedHits(p, id)) === 3,
    { newId: after.id, storedHitsOfOld: await storedHits(p, id) }, 'a new project; the old one stored with 3 hits');
  await ctx.close();
}

// ── 3. per player ────────────────────────────────────────────────────────────────────────────────────────────────────
async function perPlayer(browser: Browser): Promise<void> {
  const { ctx, p } = await newCtx(browser);
  watch(p, 'players');
  await openRoom(p, '/dev/music?stage=studio&player=ana');
  for (const s of [0, 4, 8, 12]) await clickCell(p, 0, s);
  await saved(p);
  const ana = await proj(p);
  await openRoom(p, '/dev/music?stage=studio&player=ben');
  const ben = await proj(p);
  await qa(p, 'projects-toggle').click();
  const benRows = await p.locator('[data-qa="project-row"][data-id]').count();
  await openRoom(p, '/dev/music?stage=studio&player=ana');
  const ana2 = await proj(p);
  check('Ben on Ana\'s device opens a fresh project and lists none of hers; Ana gets hers back',
    ben.id !== ana.id && ben.player === 'ben' && benRows === 0 && ana2.id === ana.id && (await lit(p)) === 4,
    { ana: ana.id, ben: ben.id, benRows, ana2: ana2.id }, 'different ids; Ben lists 0; Ana 4 lit');
  await ctx.close();
}

// ── 4–7. the studio tier: REMIX held while a take records, take ×, the Flip replace ask, song mode hold ─────────────
async function studio(browser: Browser): Promise<void> {
  const { ctx, p } = await newCtx(browser, STUDIO_TIER);
  watch(p, 'studio');
  await openRoom(p);
  for (const s of [0, 4, 8, 12]) await clickCell(p, 0, s);
  await saved(p);
  // a song in the library to REMIX
  await p.getByPlaceholder('track title…').fill('fixpass song');
  await btn(p, 'PUBLISH TO LIBRARY').click();
  await p.waitForFunction(() => ![...document.querySelectorAll('button')].some((b) => b.textContent === 'RENDERING…'), undefined, { timeout: 20000 });
  await p.waitForTimeout(400);
  const id = (await proj(p)).id;

  // 4. a take recording → LIBRARY → REMIX: held; STOP on the LIBRARY tab; the take lands here
  await btn(p, 'PLAY').click();
  await btn(p, '● RECORD TAKE').click();
  await p.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === '■ STOP TAKE'), undefined, { timeout: 8000 });
  await btn(p, 'LIBRARY').click();
  await p.waitForTimeout(300);
  await btn(p, 'REMIX').click();
  await p.waitForTimeout(300);
  const remixToast = await toastText(p);
  const chip = await qa(p, 'take-recording-chip').isVisible().catch(() => false);
  await frame(p, 'remix-held');
  check('REMIX while a take records: refused with the line, the project unchanged, and the take\'s STOP is on this tab',
    /REMIX opens a new project — stop the recording first/.test(remixToast ?? '') && (await proj(p)).id === id && chip, { remixToast, chip, id: (await proj(p)).id }, 'refused; same project; chip');
  await qa(p, 'take-recording-chip').getByRole('button').click();
  await p.waitForFunction(() => ((window as Any).__FEL_SONG__?.takes ?? 0) >= 1, undefined, { timeout: 8000 }).catch(() => undefined);
  await btn(p, 'STUDIO').click();
  await btn(p, 'STOP').click().catch(() => undefined);
  const s1 = await song(p);
  check('the take landed in the project it was recorded in', s1?.takes === 1 && s1?.songId === id, { takes: s1?.takes, songId: s1?.songId }, `1 take in ${id}`);

  // 5. a take's × asks; REMOVE; UNDO brings it back with its audio
  await qa(p, 'take-remove').click();
  const ask = await qa(p, 'take-remove-confirm').textContent().catch(() => null);
  const stillThere = (await song(p))?.takes;
  await qa(p, 'take-remove-yes').click();
  await p.waitForTimeout(200);
  const removed = (await song(p))?.takes;
  await qa(p, 'undo').click();
  await p.waitForTimeout(500);
  const back = await song(p);
  check('a take\'s × asks first (naming it); REMOVE takes it out; UNDO brings it back, playable',
    /Remove take 1 \(bar \d+, \d+\.\d s\)\?/.test(ask ?? '') && stillThere === 1 && removed === 0 && back?.takes === 1 && back?.takesLoaded === 1,
    { ask, stillThere, removed, back: { takes: back?.takes, loaded: back?.takesLoaded } }, 'asked; 1 → 0 → 1 (loaded)');

  // 6. an own recording on the FLIP; a FEL stem tap asks; KEEP keeps it; REPLACE replaces; UNDO brings it back
  await btn(p, 'FLIP').click();
  await btn(p, '● MIC TAKE').click();
  await p.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === '■ STOP'), undefined, { timeout: 8000 });
  await p.waitForTimeout(1200);
  await btn(p, '■ STOP').click();
  await p.waitForFunction(() => /^mic_/.test((window as Any).__FEL_FLIP__?.source ?? '') && (window as Any).__FEL_FLIP__?.decoded, undefined, { timeout: 10000 }).catch(() => undefined);
  const mic = (await flip(p))?.source;
  await btn(p, '808 bass').click();
  const replaceAsk = await qa(p, 'flip-replace-confirm').textContent().catch(() => null);
  await btn(p, 'KEEP').click();
  const kept = (await flip(p))?.source;
  await btn(p, '808 bass').click();
  await qa(p, 'flip-replace-yes').click();
  await p.waitForFunction(() => (window as Any).__FEL_FLIP__?.source === 'fel_808_bass', undefined, { timeout: 10000 }).catch(() => undefined);
  const replaced = (await flip(p))?.source;
  await btn(p, 'STUDIO').click();
  await qa(p, 'undo').click();
  await btn(p, 'FLIP').click();
  await p.waitForFunction(() => /^mic_/.test((window as Any).__FEL_FLIP__?.source ?? ''), undefined, { timeout: 10000 }).catch(() => undefined);
  const undone = await flip(p);
  check('a FEL stem over YOUR mic take asks first; KEEP keeps it; REPLACE replaces; UNDO brings the mic take back',
    /^mic_/.test(mic ?? '') && /Replace your mic take with 808 bass\?/.test(replaceAsk ?? '') && kept === mic && replaced === 'fel_808_bass' && undone?.source === mic,
    { mic, replaceAsk, kept, replaced, undone: undone?.source }, 'asked; kept; replaced; back');
  await btn(p, 'STUDIO').click();

  // 7. song mode holds SAVE GRID AS SECTION (it snapshotted the hidden grid)
  await btn(p, 'SAVE GRID AS SECTION').click(); await p.waitForTimeout(150);
  const before = (await song(p))?.sections;
  await qa(p, 'song-mode').click(); await p.waitForTimeout(300);
  await btn(p, 'SAVE GRID AS SECTION').click();
  await p.waitForFunction(() => [...document.querySelectorAll('div')].some((d) => d.style.position === 'sticky' && /Turn SONG MODE off first/.test(d.textContent ?? '')), undefined, { timeout: 1500 }).catch(() => undefined);
  const held = await toastText(p);
  const after = (await song(p))?.sections;
  await qa(p, 'song-mode').click();
  check('song mode on: SAVE GRID AS SECTION is held and says why (it saved the grid hidden under the section)',
    after === before && /Turn SONG MODE off first/.test(held ?? ''), { before, after, held }, 'unchanged + the line');
  await ctx.close();
}

async function run(): Promise<void> {
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: ARGS });
  try {
    for (const [name, fn] of [['two tabs', twoTabs], ['blocked switch', blockedSwitch], ['per player', perPlayer], ['studio', studio]] as const) {
      try { await fn(browser); } catch (e) { check(`${name}: ran to the end`, false, String((e as Error)?.stack ?? e).slice(0, 400), 'no throw'); }
    }
  } finally { await browser.close(); }
  check('no page errors', R.pageErrors.length === 0, R.pageErrors, []);
  R.passed = R.checks.filter((c: Any) => c.pass).length;
  R.failed = R.checks.filter((c: Any) => !c.pass).map((c: Any) => c.name);
  fs.writeFileSync(`${OUT}/fixpass-proof.json`, JSON.stringify(R, null, 2));
  log(`done: ${R.passed} passed, ${R.failed.length} failed → ${OUT}/fixpass-proof.json`);
  if (R.failed.length) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exitCode = 2; });
