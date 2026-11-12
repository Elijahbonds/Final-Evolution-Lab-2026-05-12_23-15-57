// EVERY-SCREEN phase 1: walk the real app by hand, inside ONE gate-lock hold.
//
// The gate queue is long, so a walk cannot be "run, read, fix, run again". This starts the rig (scripts/every-screen/
// rig.mts) and a phone-sized browser for each of the rig's people, then takes commands from files until its time is up:
//
//   /home/user/wt/gate-run.sh 900 npx tsx scripts/every-screen/explore.mts [--seconds=840]
//   echo '{"as":"solo","goto":"/train"}'            > $ES_OUT/cmd/001.json     → $ES_OUT/cmd/001.out.json
//   echo '{"as":"solo","tap":"Start today"}'        > $ES_OUT/cmd/002.json
//   echo '{"as":"coach","fill":["input[name=email]","x@y.z"]}' > $ES_OUT/cmd/003.json
//   echo '{"as":"solo","shot":"train"}'             > $ES_OUT/cmd/004.json     (a JPG beside the answers)
//   echo '{"as":"coach","api":["POST","/api/coach/invite",{"use":"many"}]}' > …  (a fetch as that person)
//   echo '{"sql":"select count(*) from \"User\""}'  > …                          (the throwaway database only)
//   echo '{"quit":true}'                            > …
//
// Every answer carries the address, the first 1,800 characters of what the screen says, and the labels of what can be
// tapped, so the next command can be written from it. Commands run in file-name order.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import sharp from 'sharp';
import { chromiumExe } from '../probes/_chromium.mts';
import { ORIGIN, STATE, dbUp, people as makePeople, seedCoaching, serve, sql, storageState, type Person } from './rig.mts';

const args = process.argv.slice(2);
const SECONDS = Number(args.find((a) => a.startsWith('--seconds='))?.slice(10) ?? 840);
const CMD = join(STATE, 'cmd');
mkdirSync(CMD, { recursive: true });
const T0 = Date.now();

/** What the screen says and what can be tapped, in reading order. */
export const LOOK = `(() => {
  const shown = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false; } return true; };
  const label = (el) => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.value || el.getAttribute('title') || '').replace(/\\s+/g, ' ').trim().slice(0, 70);
  const acts = [];
  for (const el of document.querySelectorAll('a[href],button,[role=button],[role=tab],input:not([type=hidden]),select,textarea,summary')) {
    if (!shown(el)) continue; const r = el.getBoundingClientRect();
    acts.push((el.closest('nav,[role=navigation]') || (el.closest('header,footer') && !el.closest('main')) ? '~' : '') + el.tagName.toLowerCase() + (el.disabled ? '(off)' : '') + ':' + label(el) + (el.tagName === 'A' ? ' → ' + el.getAttribute('href') : '') + (r.top > innerHeight ? ' ↓' : ''));
  }
  return { path: location.pathname + location.search, title: document.title, text: document.body.innerText.replace(/\\n{2,}/g, '\\n').slice(0, 1800), actions: acts.slice(0, 70) };
})()`;

/** Tap the first visible thing whose label matches (exact first, then contains), the way a finger would. */
export async function tapLabel(page: Page, label: string): Promise<boolean> {
  const tries = [
    page.getByRole('button', { name: label, exact: true }), page.getByRole('link', { name: label, exact: true }),
    page.getByRole('button', { name: label }), page.getByRole('link', { name: label }), page.getByRole('tab', { name: label }),
    page.getByText(label, { exact: true }), page.getByText(label),
  ];
  for (const loc of tries) {
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < Math.min(n, 4); i++) {
      const one = loc.nth(i);
      if (!(await one.isVisible().catch(() => false))) continue;
      await one.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
      if (await one.tap({ timeout: 4000 }).then(() => true).catch(() => false)) return true;
    }
  }
  return false;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  dbUp();
  const stop = await serve(join(STATE, 'server.log'));
  const ppl = await makePeople();
  console.log(await seedCoaching(ppl).catch((e) => `coached pair: failed (${String(e).slice(0, 160)})`));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pages = new Map<Person, { ctx: BrowserContext; page: Page; errors: string[] }>();
  const pageFor = async (who: Person) => {
    if (!pages.has(who)) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, storageState: storageState(ppl, who), permissions: ['camera', 'microphone'] });
      const page = await ctx.newPage(); const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
      page.on('dialog', (d) => { errors.push(`dialog: ${d.message().slice(0, 100)}`); void d.accept().catch(() => {}); });
      pages.set(who, { ctx, page, errors });
    }
    return pages.get(who)!;
  };
  console.log(`REPL ready at ${new Date().toISOString()} for ${SECONDS} s; commands in ${CMD}`);
  const done = new Set<string>();
  let quit = false;
  while (!quit && (Date.now() - T0) / 1000 < SECONDS) {
    const next = readdirSync(CMD).filter((f) => /^\d+.*\.json$/.test(f) && !f.endsWith('.out.json') && !done.has(f)).sort()[0];
    if (!next) { await new Promise((r) => setTimeout(r, 250)); continue; }
    done.add(next);
    const outFile = join(CMD, next.replace(/\.json$/, '.out.json'));
    if (existsSync(outFile)) continue;
    let out: Record<string, unknown> = {};
    try {
      const c = JSON.parse(readFileSync(join(CMD, next), 'utf8')) as { as?: Person; goto?: string; tap?: string; css?: string; fill?: [string, string]; press?: string; shot?: string; wait?: number; loop?: [string, string, number]; api?: [string, string, unknown?]; sql?: string; quit?: boolean; eval?: string; back?: boolean };
      if (c.quit) { quit = true; out = { quit: true }; }
      else if (c.sql) out = { sql: sql(c.sql) };
      else if (c.api) {
        const who = c.as ?? 'solo';
        const r = await fetch(ORIGIN + c.api[1], { method: c.api[0], headers: { 'content-type': 'application/json', ...(ppl.cookies[who] ? { cookie: ppl.cookies[who] } : {}) }, body: c.api[2] === undefined ? undefined : JSON.stringify(c.api[2]) });
        out = { status: r.status, body: (await r.text()).slice(0, 3000) };
      } else {
        const who = c.as ?? 'solo';
        const P = await pageFor(who);
        const t = Date.now();
        let did: unknown = true;
        if (c.goto) await P.page.goto(ORIGIN + c.goto, { waitUntil: 'load', timeout: 45000 });
        if (c.back) await P.page.goBack({ timeout: 15000 }).catch(() => null);
        if (c.tap) did = await tapLabel(P.page, c.tap);
        if (c.css) did = await P.page.locator(c.css).first().tap({ timeout: 4000 }).then(() => true).catch((e) => String(e).slice(0, 120));
        if (c.fill) did = await P.page.locator(c.fill[0]).first().fill(c.fill[1], { timeout: 4000 }).then(() => true).catch((e) => String(e).slice(0, 120));
        if (c.press) await P.page.keyboard.press(c.press);
        if (c.loop) {
          // tap `css` until `until` shows (a session player's primary button until its finish screen): how many taps it took
          let n = 0; const seen: string[] = [];
          while (n < c.loop[2] && !(await P.page.locator(c.loop[1]).count())) {
            const label = await P.page.locator(c.loop[0]).first().innerText({ timeout: 3000 }).catch(() => '?');
            if (!(await P.page.locator(c.loop[0]).first().tap({ timeout: 4000 }).then(() => true).catch(() => false))) { seen.push('(tap failed)'); break; }
            n++; seen.push(label.replace(/\s+/g, ' ').slice(0, 24));
            await P.page.waitForTimeout(350);
          }
          did = { taps: n, labels: seen, reached: (await P.page.locator(c.loop[1]).count()) > 0 };
        }
        if (c.eval) did = await P.page.evaluate(c.eval).catch((e) => String(e).slice(0, 200));
        await P.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        await P.page.waitForTimeout(c.wait ?? 500);
        { const png = await P.page.screenshot(); await sharp(png).jpeg({ quality: 60 }).toFile(join(CMD, `${c.shot ?? next.replace(/\.json$/, '')}.jpg`)); }
        out = { did, ms: Date.now() - t, errors: P.errors.splice(0), ...(await P.page.evaluate(LOOK) as object) };
      }
    } catch (e) { out = { error: String(e).slice(0, 400) }; }
    writeFileSync(outFile, JSON.stringify(out, null, 1));
  }
  await browser.close();
  stop();
  console.log(`REPL closed at ${new Date().toISOString()}`);
  process.exit(0);
}
