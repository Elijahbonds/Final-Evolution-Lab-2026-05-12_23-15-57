// VENICE BACK LINK, OVER TIME (lane/venice-v2, 2026-11-18): every-screen once read /play/venice as a dead end (no action on screen)
// while its own picture showed the "Play" back link. This opens the page as the scorer's anonymous visitor on the REAL app
// (rig.mts production build) and, every 250 ms for 8 s, records whether the back link is "shown" by the scorer's own rule
// (scripts/every-screen/inpage.ts shown(): a size, and no ancestor with display none, visibility hidden or opacity 0) and, if not,
// which ancestor hides it. RUNS loads.
//
//   ES_OUT=<dir> OUT=<dir> /home/user/wt/gate-run.sh 900 npx tsx scripts/probes/venice-hub/backlink.mts     (RUNS=3)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, dbUp, serve } from '../../every-screen/rig.mts';

const OUT = process.env.OUT ?? '/tmp/venice-backlink';
fs.mkdirSync(OUT, { recursive: true });
const RUNS = Number(process.env.RUNS ?? 3);
const PROBE = `(() => { const a = document.querySelector('[data-testid="venice-back"]'); if (!a) return { found: false };
  const r = a.getBoundingClientRect(); let hider = null;
  for (let e = a; e && e !== document.documentElement; e = e.parentElement) { const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) { hider = (e.tagName + '.' + String(e.className).slice(0, 80) + ' opacity ' + cs.opacity + ' vis ' + cs.visibility + ' disp ' + cs.display); break; } }
  return { found: true, w: Math.round(r.width), h: Math.round(r.height), shown: r.width >= 1 && r.height >= 1 && !hider, hider }; })()`;
dbUp();
const stop = await serve(path.join(OUT, 'server.log'));
const rows: unknown[] = [];
try {
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (let run = 1; run <= RUNS; run++) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      const t0 = Date.now();
      await page.goto(`${ORIGIN}/play/venice`, { waitUntil: 'commit' });
      const seen: string[] = [];
      for (let i = 0; i < 32; i++) {
        const s = await page.evaluate(PROBE) as { found: boolean; shown?: boolean; hider?: string | null; w?: number; h?: number };
        const k = !s.found ? 'absent' : s.shown ? 'shown' : `hidden by ${s.hider ?? `size ${s.w}x${s.h}`}`;
        if (seen.at(-1)?.split(' @')[0] !== k) seen.push(`${k} @${((Date.now() - t0) / 1000).toFixed(1)}s`);
        await page.waitForTimeout(250);
      }
      rows.push({ run, timeline: seen });
      console.log(`run ${run}: ${seen.join(' -> ')}`);
      await ctx.close();
    }
  } finally { await browser.close(); }
} finally { stop(); }
fs.writeFileSync(path.join(OUT, 'backlink.json'), JSON.stringify(rows, null, 1));
