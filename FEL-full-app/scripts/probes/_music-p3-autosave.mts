// MUSIC-SUITE P3 (2026-09-25) — "Keep my work", measured in a browser on the dev-only /dev/music route (the real
// StudioMode, no GameShell, database offline). The P1 baseline's work-survival matrix again (BASELINE.md 2b:
// REPLAY / reload 14 → 0 lit cells, any tab switch 1 → 0 sections and the Flip sample gone), plus what P3 adds:
//   1. WORK SURVIVAL — build the 14-cell beat, save a section at 30 % swing, load a Flip source and edit two chops, send a
//      pad to the grid, record a take (fake mic), then: FLIP and back, END SET + REPLAY (the shell's remount), reload.
//   2. DANCE EXPORT — the exported chart's id and name before and after a reload (was 'My Track' + a fresh id per mount).
//   3. MY PROJECTS — rename, new, open, duplicate, delete (asked first); newest first; the open id remembered on reload.
//   4. A CORRUPT OPEN RECORD — the room opens a fresh project, says so, and the record is still there.
//   5. NO INDEXEDDB — the memory fallback: the line, REPLAY keeps the work, a reload does not (as the line says).
//   6. QUOTA — every put refused with QuotaExceededError: the line in the room.
//   7. THE STREAK POST — /dev/music is outside the signed-in shell: no POST /api/sessions, ever.
//
// MUSIC-SUITE P4 FIX PASS (2026-09-25): P4 replaced SongPanel's RECORD TAKE with the recording booth (ui/RecordBooth), so
// this probe crashed at "● RECORD TAKE" on the P4 tree (p4/grid/regress/p3-autosave: 9/10, the survival matrix never ran).
// The take is now recorded THROUGH THE BOOTH — ARM (the fake mic), RECORD over the playing song, a FLIP tab switch while it
// records, ■ STOP TAKE, the room's STOP, CLOSE MIC — and the matrix measures what it always did.
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p3-autosave.mts   (BASE, OUT env override)
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p3';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p3 +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), route: '/dev/music', frames: {}, pageErrors: [] as string[], sessionPosts: [] as string[], checks: [] as Any[] };
const check = (name: string, pass: boolean, got: unknown, want: unknown) => { R.checks.push({ name, pass, got, want }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(got)); };
const frame = async (p: Page, name: string) => { const path = `${OUT}/p3-${name}.png`; await p.screenshot({ path, fullPage: true }); R.frames[name] = path; };

const GRID = `(() => {
  const grid = [...document.querySelectorAll('div')].find((d) => (d.style.gridTemplateColumns || '').includes('repeat(16'));
  if (!grid || !grid.offsetParent) return null;
  const kids = [...grid.children]; const rows = [];
  for (let i = 0; i + 16 < kids.length; i += 17) {
    const cells = kids.slice(i + 1, i + 17);
    rows.push({ label: kids[i].textContent, lit: cells.map((c, j) => getComputedStyle(c).backgroundColor === 'rgb(255, 179, 71)' ? j : -1).filter((j) => j >= 0) });
  }
  return { rows: rows.length, labels: rows.map((r) => r.label), lit: rows.reduce((n, r) => n + r.lit.length, 0) };
})()`;
const grid = (p: Page) => p.evaluate(GRID) as Promise<Any>;
const song = (p: Page) => p.evaluate(() => (window as Any).__FEL_SONG__ ?? null);
const flip = (p: Page) => p.evaluate(() => (window as Any).__FEL_FLIP__ ?? null);
const proj = (p: Page) => p.evaluate(() => (window as Any).__FEL_PROJECT__ ?? null);
const btn = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).first();
const statusLine = (p: Page) => p.locator('[data-qa="save-status"]').textContent();

/** A React-controlled range input: the prototype's value setter (past React's value tracker), then an input event. */
async function setRange(p: Page, selector: string, v: number): Promise<void> {
  await p.locator(selector).first().evaluate((el, val) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(el, String(val));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);
  await p.waitForTimeout(80);
}
async function clickCell(p: Page, row: number, step: number): Promise<void> {
  await p.evaluate(([r, s]) => {
    const g = [...document.querySelectorAll('div')].find((d) => (d.style.gridTemplateColumns || '').includes('repeat(16')) as HTMLElement;
    (g.children[r * 17 + 1 + s] as HTMLElement).click();
  }, [row, step]);
}
async function buildPattern(p: Page): Promise<void> {
  for (const s of [0, 4, 8, 12]) await clickCell(p, 0, s);
  for (const s of [4, 12]) await clickCell(p, 1, s);
  for (let s = 0; s < 16; s += 2) await clickCell(p, 2, s);
  await p.waitForTimeout(150);
  // MUSIC-SUITE P3 (tier-honesty-editing): the chain opens on a pattern PLAYED, as the ladder's words say ("Play a
  // pattern with at least one hit in it") — a lit cell alone opened it before. Play it once so SAVE GRID AS SECTION shows.
  await p.getByRole('button', { name: 'PLAY', exact: true }).first().click();
  await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'STOP', exact: true }).first().click();
}
async function startRoom(p: Page): Promise<void> {
  const start = p.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 240000 });
  await start.click();
  await p.waitForFunction(`${GRID} !== null`, undefined, { timeout: 60000 });
  await p.waitForTimeout(400);
}
async function openRoom(p: Page, path = '/dev/music?stage=studio'): Promise<void> {
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await startRoom(p);
}
/** Wait for the autosave to write (status "Saved on this device · HH:MM"). */
async function saved(p: Page, ms = 4000): Promise<string> {
  await p.waitForFunction(() => /Saved on this device ·/.test(document.querySelector('[data-qa="save-status"]')?.textContent ?? ''), undefined, { timeout: ms }).catch(() => undefined);
  return (await statusLine(p)) ?? '';
}
/** What survives: lit cells, sections, chain bars, section swings, takes (and loaded), Flip source/slices/edited chops, rows. */
async function survey(p: Page): Promise<Any> {
  const g = await grid(p); const s = await song(p); const pr = await proj(p);
  const swings = await p.evaluate(() => (window as Any).__P3_SECTION_SWINGS__?.() ?? null);
  return { lit: g?.lit ?? null, rows: g?.labels ?? null, sections: s?.sections ?? null, chainBars: s?.bars ?? null, takes: s?.takes ?? null, takesLoaded: s?.takesLoaded ?? null, projectId: pr?.id ?? null, title: pr?.title ?? null, swings };
}
async function flipSurvey(p: Page): Promise<Any> {
  await btn(p, 'FLIP').click();
  await p.waitForFunction(() => (window as Any).__FEL_FLIP__?.decoded === true || (window as Any).__FEL_FLIP__?.source === null, undefined, { timeout: 15000 }).catch(() => undefined);
  const f = await flip(p);
  await btn(p, 'STUDIO').click();
  await p.waitForTimeout(200);
  return f;
}
async function idbWrite(p: Page, table: string, key: string, value: unknown): Promise<void> {
  await p.evaluate(([t, k, v]) => new Promise<void>((res, rej) => {
    const r = indexedDB.open('fel-studio', 1);
    r.onsuccess = () => { const db = r.result; const tx = db.transaction(t as string, 'readwrite'); tx.objectStore(t as string).put(v, k as string); tx.oncomplete = () => { db.close(); res(); }; tx.onabort = () => { db.close(); rej(tx.error); }; };
    r.onerror = () => rej(r.error);
  }), [table, key, value] as const);
}
async function idbKeys(p: Page, table: string): Promise<string[]> {
  return p.evaluate((t) => new Promise<string[]>((res, rej) => {
    const r = indexedDB.open('fel-studio', 1);
    r.onsuccess = () => { const db = r.result; const q = db.transaction(t, 'readonly').objectStore(t).getAllKeys(); q.onsuccess = () => { db.close(); res((q.result as IDBValidKey[]).map(String)); }; q.onerror = () => { db.close(); rej(q.error); }; };
    r.onerror = () => rej(r.error);
  }), table);
}

function watch(p: Page, ctxName: string): void {
  p.on('pageerror', (e) => R.pageErrors.push(`${ctxName}: ${e.message}`));
  p.on('request', (req) => { if (req.url().includes('/api/sessions')) R.sessionPosts.push(`${ctxName}: ${req.method()} ${req.url()}`); });
}
async function newCtx(browser: Browser, init?: string): Promise<{ ctx: BrowserContext; p: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  return { ctx, p };
}

/**
 * MUSIC-SUITE P3 (tier-honesty-editing): RECORD TAKE is a STUDIO feature (MusicTiers `takes`) and is no longer on screen
 * at THE CHAIN, so the work-survival run (which records a take after one section) starts on a device already at THE
 * STUDIO. The tier only changes what is offered; what survives a tab switch / REPLAY / reload is measured the same.
 */
const STUDIO_TIER = `try { if (!localStorage.getItem('fel-music-progress')) localStorage.setItem('fel-music-progress', '{"patternsMade":1,"sectionsSaved":2,"chainEntries":2}'); } catch {}`;

async function survival(browser: Browser): Promise<void> {
  const { ctx, p } = await newCtx(browser, STUDIO_TIER);
  watch(p, 'survival');
  await openRoom(p);
  const first = await proj(p);
  check('fresh device: IndexedDB store, a new project, says it saves itself', first?.store === 'indexeddb' && /New project/.test(first?.status ?? ''), { store: first?.store, status: first?.status }, 'indexeddb + "New project — it saves itself…"');
  check('opening wrote nothing (no project listed before the first edit)', first?.projects === 0, first?.projects, 0);
  await buildPattern(p);
  const s1 = await saved(p);
  check('the 14-cell beat autosaves', /Saved on this device ·/.test(s1), s1, 'Saved on this device · HH:MM');
  // a section at 30 % swing (the P2 deferred item: its swing must persist)
  await setRange(p, 'label:has-text("SWING") input[type=range]', 30);
  await btn(p, 'SAVE GRID AS SECTION').waitFor({ timeout: 10000 });
  await btn(p, 'SAVE GRID AS SECTION').click();
  await setRange(p, 'label:has-text("SWING") input[type=range]', 15);
  // Flip: the 808 bass, pad 2 pitched −5, pad 3 reversed, pad 2 sent to the grid
  await btn(p, 'FLIP').click();
  await btn(p, '808 bass').click();
  await p.waitForFunction(() => ((window as Any).__FEL_FLIP__?.slices ?? 0) > 2 && (window as Any).__FEL_FLIP__?.decoded, undefined, { timeout: 20000 });
  await p.getByRole('button', { name: 'pad 3' }).click();
  await btn(p, 'REVERSE').click();
  await p.getByRole('button', { name: 'pad 2' }).click();
  await setRange(p, 'label:has-text("pitch") input[type=range]', -5);
  await btn(p, 'SEND TO TRACK').click();
  await p.waitForTimeout(300);
  const flipBuilt = await flip(p);
  await btn(p, 'STUDIO').click();
  // a take on the fake mic, THROUGH THE BOOTH (P4): PLAY, ARM, RECORD (it counts in and starts on a bar line); switch to
  // FLIP mid-take and back; ■ STOP TAKE; the room's STOP; CLOSE MIC
  await btn(p, 'PLAY').click();
  await p.locator('[data-qa="booth-arm"]').click();
  await p.locator('[data-qa="mic-on"]').waitFor({ timeout: 15000 });
  await p.locator('[data-qa="booth-record"]').click();
  await p.waitForFunction(() => (window as Any).__FEL_BOOTH__?.phase === 'recording', undefined, { timeout: 20000 });
  await p.waitForTimeout(600);
  await btn(p, 'FLIP').click(); await p.waitForTimeout(900);
  await btn(p, 'STUDIO').click(); await p.waitForTimeout(300);
  const stillRecording = await p.evaluate(() => (window as Any).__FEL_BOOTH__?.phase === 'recording');
  await p.locator('[data-qa="booth-stop"]').click();
  await p.waitForFunction(() => ((window as Any).__FEL_SONG__?.takes ?? 0) >= 1, undefined, { timeout: 8000 }).catch(() => undefined);
  await p.locator('[data-qa="transport"] button').first().click();          // the room's STOP
  await p.locator('[data-qa="booth-close"]').click().catch(() => undefined);
  check('a take keeps recording across a tab switch (the song panel stays mounted)', stillRecording, stillRecording, true);
  await saved(p);
  // a dev read of the section swings, from the store's own record (what a reload will read)
  await p.evaluate(() => {
    (window as Any).__P3_SECTION_SWINGS__ = () => new Promise((res) => {
      const r = indexedDB.open('fel-studio', 1);
      r.onsuccess = () => { const db = r.result; const tx = db.transaction(['projects', 'meta'], 'readonly');
        const m = tx.objectStore('meta').get('openProject:dev-player');   // MUSIC-SUITE P3 FIX PASS: the open project is per player
        m.onsuccess = () => { const q = tx.objectStore('projects').get(m.result); q.onsuccess = () => { db.close(); res(q.result?.body?.sections?.map((s: Any) => s.swing) ?? null); }; }; };
    });
  });
  const built = await survey(p);
  R.built = { ...built, flip: flipBuilt };
  log('built', JSON.stringify(R.built));
  check('built: 14 lit kit cells + the Flip row (2 rows drawn? tier decides), 1 section, 2 chain bars, 1 take', built.sections === 1 && built.chainBars === 2 && built.takes === 1, built, '{sections 1, chainBars 2, takes 1}');
  check('the section kept its 30 % swing in the stored record', JSON.stringify(built.swings) === '[0.3]', built.swings, [0.3]);
  await frame(p, 'studio-built');

  const m: Any[] = [];
  // FLIP and back
  const f1 = await flipSurvey(p);
  const afterFlip = await survey(p);
  m.push({ step: 'FLIP tab and back', ...afterFlip, flip: f1 });
  // END SET + REPLAY (the shell's remount)
  await btn(p, 'PERFORM').click(); await p.waitForTimeout(200);
  await btn(p, 'END SET').click();
  await p.locator('[data-dev="replay"]').click();
  await startRoom(p);
  await p.waitForFunction(() => ((window as Any).__FEL_SONG__?.takesLoaded ?? 0) >= 1, undefined, { timeout: 10000 }).catch(() => undefined);
  const afterReplay = await survey(p);
  const f2 = await flipSurvey(p);
  m.push({ step: 'END SET + REPLAY (remount)', ...afterReplay, flip: f2 });
  // the dance export, then reload, then export again
  await btn(p, '♪ SEND TO THE DANCE FLOOR').click(); await p.waitForTimeout(200);
  const exp1 = await p.evaluate(() => { const v = JSON.parse(localStorage.getItem('fel-dance-exported') ?? 'null'); return v ? { id: v.track.id, name: v.track.name, seed: v.track.seed, steps: v.steps.length } : null; });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await startRoom(p);
  await p.waitForFunction(() => ((window as Any).__FEL_SONG__?.takesLoaded ?? 0) >= 1, undefined, { timeout: 10000 }).catch(() => undefined);
  const afterReload = await survey(p);
  const f3 = await flipSurvey(p);
  m.push({ step: 'page reload', ...afterReload, flip: f3 });
  await btn(p, '♪ SEND TO THE DANCE FLOOR').click(); await p.waitForTimeout(200);
  const exp2 = await p.evaluate(() => { const v = JSON.parse(localStorage.getItem('fel-dance-exported') ?? 'null'); return v ? { id: v.track.id, name: v.track.name, seed: v.track.seed, steps: v.steps.length } : null; });
  R.workSurvival = m;
  R.danceExport = { beforeReload: exp1, afterReload: exp2, projectId: afterReload.projectId, title: afterReload.title };
  for (const row of m) {
    check(`${row.step}: 14 lit kit cells + 2 Flip-row hits? (lit ≥ 14), 1 section, 2 chain bars, 1 take loaded`,
      row.lit >= 14 && row.sections === 1 && row.chainBars === 2 && row.takes === 1 && (row.step === 'FLIP tab and back' || row.takesLoaded === 1),
      { lit: row.lit, sections: row.sections, chainBars: row.chainBars, takes: row.takes, takesLoaded: row.takesLoaded }, '14+ / 1 / 2 / 1');
    check(`${row.step}: the Flip source and its two edited chops`, row.flip?.source === 'fel_808_bass' && row.flip?.edited === 2 && row.flip?.decoded === true, row.flip, 'fel_808_bass, edited 2, decoded');
    check(`${row.step}: same project`, row.projectId === built.projectId, row.projectId, built.projectId);
  }
  check('dance export: the project id and title, the same chart after a reload', !!exp1 && exp1.id === `song_${String(built.projectId).replace(/[^a-z0-9_]/gi, '').slice(0, 24).toLowerCase()}` && exp1.name === String(built.title).toUpperCase().slice(0, 24) && JSON.stringify(exp1) === JSON.stringify(exp2), { exp1, exp2 }, 'song_<project id>, the title, identical');
  await frame(p, 'studio-after-reload');

  // INSIDE THE DEBOUNCE: an edit, then at once END SET + REPLAY (the unmount flushes it), and an edit, then at once reload
  // (pagehide / visibilitychange flush it — best effort: the browser may unload before IndexedDB commits)
  const litBefore = (await grid(p))?.lit;
  await clickCell(p, 3, 15);
  await btn(p, 'PERFORM').click();
  await btn(p, 'END SET').click();
  await p.locator('[data-dev="replay"]').click();
  await startRoom(p);
  const quickReplay = (await grid(p))?.lit;
  await clickCell(p, 3, 13);
  const t = Date.now();
  await p.reload({ waitUntil: 'domcontentloaded' });
  const reloadAfterMs = Date.now() - t;
  await startRoom(p);
  const quickReload = (await grid(p))?.lit;
  R.insideDebounce = { litBefore, afterEditThenReplay: quickReplay, afterEditThenReload: quickReload, reloadIssuedWithinMs: reloadAfterMs };
  check('an edit then an immediate END SET + REPLAY keeps the edit (the unmount flushes it)', quickReplay === (litBefore ?? 0) + 1, R.insideDebounce, `${(litBefore ?? 0) + 1}`);
  check('an edit then an immediate reload keeps the edit (the unload rescue)', quickReload === (litBefore ?? 0) + 2, R.insideDebounce, `${(litBefore ?? 0) + 2}`);
  await clickCell(p, 3, 15); await clickCell(p, 3, 13);   // back to the 14-cell beat
  await saved(p);

  // MY PROJECTS
  const P: Any = {};
  await p.locator('[data-qa="projects-toggle"]').click();
  await p.locator('[data-qa="project-rename"]').first().click();
  await p.locator('[data-qa="project-rename-input"]').fill('Probe Beat');
  await p.locator('[data-qa="project-rename-save"]').click();
  await saved(p);
  P.renamed = (await proj(p))?.title;
  await p.locator('[data-qa="project-new"]').click(); await p.waitForTimeout(500);
  P.newGrid = (await grid(p))?.lit;
  P.newStatus = await statusLine(p);
  P.listAfterNewUnedited = await p.locator('[data-qa="project-row"][data-id]').count();
  await clickCell(p, 0, 0);
  await saved(p);
  P.listAfterNewEdited = await p.locator('[data-qa="project-row"][data-id]').count();
  P.listOrder = await p.locator('[data-qa="project-row"][data-id]').evaluateAll((els) => els.map((e) => e.querySelector('b')?.textContent ?? null));
  await p.locator('[data-qa="project-row"][data-id]:not([data-current]) [data-qa="project-open"]').first().click(); await p.waitForTimeout(700);
  P.reopened = { title: (await proj(p))?.title, lit: (await grid(p))?.lit, sections: (await song(p))?.sections };
  await p.locator('[data-qa="project-row"][data-current] [data-qa="project-dup"]').click(); await p.waitForTimeout(800);
  P.duplicate = { title: (await proj(p))?.title, lit: (await grid(p))?.lit, list: await p.locator('[data-qa="project-row"][data-id]').count() };
  await frame(p, 'my-projects');
  await p.locator('[data-qa="project-row"][data-current] [data-qa="project-delete"]').click();
  P.confirmShown = await p.locator('[data-qa="project-delete-confirm"]').count();
  P.confirmText = await p.locator('[data-qa="project-delete-confirm"]').textContent();
  await p.locator('[data-qa="project-delete-yes"]').click(); await p.waitForTimeout(800);
  P.afterDelete = { title: (await proj(p))?.title, list: await p.locator('[data-qa="project-row"][data-id]').count() };
  await p.reload({ waitUntil: 'domcontentloaded' });
  await startRoom(p);
  P.afterReloadOpen = (await proj(p))?.title;
  R.myProjects = P;
  check('rename', P.renamed === 'Probe Beat', P.renamed, 'Probe Beat');
  check('NEW is blank and not saved until edited', P.newGrid === 0 && P.listAfterNewUnedited === 1 && P.listAfterNewEdited === 2, P, 'lit 0; list 1 → 2 after an edit');
  check('newest first', /^Beat · /.test(P.listOrder?.[0] ?? '') && P.listOrder?.[1] === 'Probe Beat', P.listOrder, '[new beat, Probe Beat]');
  check('OPEN brings the beat back', P.reopened.title === 'Probe Beat' && P.reopened.lit >= 14 && P.reopened.sections === 1, P.reopened, 'Probe Beat, 14+ lit, 1 section');
  check('DUPLICATE opens a copy', P.duplicate.title === 'Probe Beat (copy)' && P.duplicate.lit >= 14 && P.duplicate.list === 3, P.duplicate, 'Probe Beat (copy), 3 listed');
  check('DELETE asks first, then opens the next newest', P.confirmShown === 1 && P.afterDelete.list === 2 && P.afterDelete.title !== 'Probe Beat (copy)', P.afterDelete, '2 listed, not the copy');
  check('the open project is remembered across a reload', P.afterReloadOpen === P.afterDelete.title, P.afterReloadOpen, P.afterDelete.title);

  // A CORRUPT OPEN RECORD
  const before = await idbKeys(p, 'projects');
  // MUSIC-SUITE P3 FIX PASS (2026-09-25): records carry their owner and the open project is per player (/dev/music: dev-player)
  await idbWrite(p, 'projects', 'prj_corrupt', { id: 'prj_corrupt', title: 'Broken beat', createdAt: 1, updatedAt: Date.now() + 1e7, v: 1, owner: 'dev-player', body: { v: 1, tracks: 'nope' } });
  await idbWrite(p, 'meta', 'openProject:dev-player', 'prj_corrupt');
  await p.reload({ waitUntil: 'domcontentloaded' });
  await startRoom(p);
  const notice = await p.locator('[data-qa="project-notice"]').textContent().catch(() => null);
  const corruptProj = await proj(p);
  await clickCell(p, 0, 3);
  await saved(p);
  const keysAfter = await idbKeys(p, 'projects');
  await frame(p, 'corrupt-record');
  R.corrupt = { notice, openedId: corruptProj?.id, keysBefore: before.length, keysAfter };
  check('a corrupt open record: a fresh project, said, the record kept', /"Broken beat" couldn't be opened — it is damaged/.test(notice ?? '') && corruptProj?.id !== 'prj_corrupt' && keysAfter.includes('prj_corrupt'), R.corrupt, 'notice + new id + prj_corrupt still stored');
  await ctx.close();
}

async function memoryFallback(browser: Browser): Promise<void> {
  const { ctx, p } = await newCtx(browser, `Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('blocked', 'SecurityError'); }, configurable: true });`);
  watch(p, 'memory');
  await openRoom(p);
  const line = await statusLine(p);
  await buildPattern(p);
  await p.waitForTimeout(700);
  await btn(p, 'PERFORM').click(); await p.waitForTimeout(150);
  await btn(p, 'END SET').click();
  await p.locator('[data-dev="replay"]').click();
  await startRoom(p);
  const afterReplay = (await grid(p))?.lit;
  await frame(p, 'memory-mode');
  await p.reload({ waitUntil: 'domcontentloaded' });
  await startRoom(p);
  const afterReload = (await grid(p))?.lit;
  // another tab (same browser profile): the tab's rescue is sessionStorage, so the work is NOT there — "until you close the tab"
  const p2 = await ctx.newPage();
  watch(p2, 'memory-tab2');
  await openRoom(p2);
  const otherTab = (await grid(p2))?.lit;
  R.memoryFallback = { line, afterReplay, afterReload, otherTab, store: (await proj(p))?.store };
  check('no IndexedDB: the memory line; REPLAY and a reload keep the beat (this tab\'s rescue); another tab starts clean',
    /Saving in this tab only/.test(line ?? '') && afterReplay === 14 && afterReload === 14 && otherTab === 0 && R.memoryFallback.store === 'memory', R.memoryFallback, 'memory line, 14 / 14 / 0');
  await ctx.close();
}

async function quota(browser: Browser): Promise<void> {
  const { ctx, p } = await newCtx(browser, `(() => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...a) { if (window.__P3_FULL__) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return put.apply(this, a); }; })();`);
  watch(p, 'quota');
  await openRoom(p);
  await p.evaluate(() => { (window as Any).__P3_FULL__ = true; });
  await buildPattern(p);
  await p.waitForTimeout(900);
  const line = await statusLine(p);
  await frame(p, 'quota-line');
  await p.evaluate(() => { (window as Any).__P3_FULL__ = false; });
  await clickCell(p, 3, 1);
  const recovered = await saved(p);
  R.quota = { line, recovered };
  check('a full device: the room says NOT saved, out of space, what to do; the next edit saves once there is room',
    /NOT saved — this device is out of space for FEL/.test(line ?? '') && /Saved on this device ·/.test(recovered), R.quota, 'the out-of-space line, then Saved');
  await ctx.close();
}

/** The player's OWN Flip source (a mic take on the fake device): its bytes kept, a tab switch mid-take, a reload. */
async function flipMic(browser: Browser): Promise<void> {
  const { ctx, p } = await newCtx(browser);
  watch(p, 'flip-mic');
  await openRoom(p);
  await btn(p, 'FLIP').click();
  await btn(p, '● MIC TAKE').click();
  await p.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === '■ STOP'), undefined, { timeout: 8000 });
  await p.locator('[data-qa="projects-toggle"]').click();
  const heldWhileRecording = await p.locator('[data-qa="project-new"]').isDisabled();
  await p.waitForTimeout(1200);
  await btn(p, 'STUDIO').click();                                  // FlipPad unmounts mid-take: the take is stopped and kept
  await p.waitForTimeout(1500);
  const heldAfter = await p.locator('[data-qa="project-new"]').isDisabled();
  const f1 = await flipSurvey(p);
  await saved(p);
  const audioKeys = await idbKeys(p, 'audio');
  await p.reload({ waitUntil: 'domcontentloaded' });
  await startRoom(p);
  const f2 = await flipSurvey(p);
  R.flipMic = { heldWhileRecording, heldAfter, beforeReload: f1, afterReload: f2, audioKeys: audioKeys.filter((k) => k.startsWith('aud_')).length };
  check('a Flip mic take: MY PROJECTS held while it records, released when a tab switch stops it', heldWhileRecording && !heldAfter, { heldWhileRecording, heldAfter }, 'true, false');
  check('a Flip mic take survives the tab switch and a reload (its bytes decoded from the device store)',
    /^mic_/.test(f1?.source ?? '') && f1?.decoded === true && f2?.source === f1?.source && f2?.decoded === true && f2?.slices === f1?.slices && R.flipMic.audioKeys >= 1, R.flipMic, 'mic_*, decoded, same slices, 1+ audio record');
  await ctx.close();
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: ARGS });
  try {
    for (const [name, fn] of [['survival', survival], ['flip-mic', flipMic], ['memory', memoryFallback], ['quota', quota]] as const) {
      try { await fn(browser); } catch (e) { R.checks.push({ name: `${name} crashed`, pass: false, got: String(e), want: 'no crash' }); log('CRASH', name, e); }
    }
  } finally { await browser.close(); }
  check('no page errors', R.pageErrors.length === 0, R.pageErrors, []);
  check('the dev route posts no creation session (no /api/sessions request at all)', R.sessionPosts.length === 0, R.sessionPosts, []);
  R.passed = R.checks.filter((c: Any) => c.pass).length;
  R.failed = R.checks.filter((c: Any) => !c.pass).length;
  fs.writeFileSync(`${OUT}/autosave-proof.json`, JSON.stringify(R, null, 2));
  log(`done: ${R.passed} passed, ${R.failed} failed → ${OUT}/autosave-proof.json`);
}
void main();
