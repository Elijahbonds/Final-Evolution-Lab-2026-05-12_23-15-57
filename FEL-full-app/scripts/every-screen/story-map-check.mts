// EVERY-SCREEN P10 (part B): the /story check the owner asked for — every zone marker and every zone label sits fully on
// the screen at 390 px wide, at the default text size and with 150 % text. Exits 1 when any one does not.
//
//   ES_OUT=… /home/user/wt/gate-run.sh 300 npx tsx scripts/every-screen/story-map-check.mts
//   STORY_CHECK_PLANT=1 …   the control: zones pushed off the edge on purpose; it must exit 1
//
// It reads the running rig (rig.mts serve), signed in as the rig's athlete. A zone is the map's button (aria-label
// "<zone> — open | cleared | locked: …"); its label is the button's text. "On screen" means inside the 390 px viewport and
// inside the map's own box (which clips: overflow hidden), horizontally and vertically, by more than half a pixel.
import { chromium } from 'playwright-core';
import { chromiumExe } from '../probes/_chromium.mts';
import { ORIGIN, dbUp, people as makePeople, serve, storageState } from './rig.mts';

interface Miss { size: string; zone: string; what: string; px: number }

dbUp();
const stop = await serve();
let misses: Miss[] = [];
let zones = 0;
try {
  const ppl = await makePeople();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true });
  for (const size of ['100%', '150%']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, storageState: storageState(ppl, 'solo') });
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/story`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.evaluate((s) => { document.documentElement.style.fontSize = s; }, size);
    await page.waitForTimeout(1500);   // the zones spring in (framer-motion); then they rest
    // the control (STORY_CHECK_PLANT=1): every zone pushed 60 px right, so the right-hand ones must be reported off the map;
    // a run that reports nothing then is a check that cannot see
    if (process.env.STORY_CHECK_PLANT) await page.addStyleTag({ content: 'button[aria-label*=" — "]{margin-left:60px !important}' });
    const found = await page.evaluate(() => {
      const out: { zone: string; what: string; px: number }[] = [];
      const buttons = Array.from(document.querySelectorAll('button[aria-label*=" — "]')) as HTMLElement[];
      for (const b of buttons) {
        const zone = (b.getAttribute('aria-label') ?? '').split(' — ')[0];
        let clip: DOMRect | null = null;
        for (let p = b.parentElement; p; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (s.overflowX !== 'visible' || s.overflowY !== 'visible') { clip = p.getBoundingClientRect(); break; }
        }
        const box = { left: Math.max(0, clip?.left ?? 0), right: Math.min(document.documentElement.clientWidth, clip?.right ?? Infinity), top: clip?.top ?? -Infinity, bottom: clip?.bottom ?? Infinity };
        const parts: [string, Element | null][] = [['marker', b.querySelector('span.h-12')], ['label', Array.from(b.querySelectorAll('span')).find((x) => (x.textContent ?? '').trim() === zone) ?? null]];
        for (const [what, el] of parts) {
          if (!el) { out.push({ zone, what: `${what} (not found)`, px: 0 }); continue; }
          const r = el.getBoundingClientRect();
          const over = Math.max(box.left - r.left, r.right - box.right, box.top - r.top, r.bottom - box.bottom);
          out.push({ zone, what, px: Math.round(over * 10) / 10 });
        }
      }
      return out;
    });
    zones = Math.max(zones, found.length / 2);
    misses = misses.concat(found.filter((f) => f.px > 0.5 || f.what.includes('not found')).map((f) => ({ size, ...f })));
    console.log(`${size}: ${found.length / 2} zones read; ${found.filter((f) => f.px > 0.5).length} off the screen or the map`);
    await ctx.close();
  }
  await browser.close();
} finally { stop(); }
for (const m of misses) console.log(`  MISS ${m.size} ${m.zone}: ${m.what} ${m.px} px past the edge`);
console.log(misses.length ? `STORY MAP: ${misses.length} miss(es)` : `STORY MAP OK: all ${zones} zones' markers and labels on screen at 390 px, at 100 % and 150 % text`);
process.exit(misses.length || zones === 0 ? 1 : 0);
