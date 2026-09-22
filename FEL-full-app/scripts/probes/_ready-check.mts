// _ready-check — does a route reach #fel-ready[data-state=loaded]? Prints the state every 5 s and the first console errors.
//   BASE=http://localhost:3011 ROUTE=/play/golf npx tsx scripts/probes/_ready-check.mts
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://localhost:3011', ROUTE = process.env.ROUTE ?? '/play/golf', SEC = Number(process.env.SEC ?? 60);
const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1200, height: 720 } });
const errs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error' && !/favicon|40[14]/.test(m.text())) errs.push(m.text().slice(0, 200)); });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
await p.goto(`${BASE}${ROUTE}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
const lobby = p.getByRole('button', { name: /START THE NIGHT|START NIGHT|LET'S GO/i }); await p.waitForTimeout(1500); if (await lobby.count()) await lobby.first().click().catch(() => {});
const t0 = Date.now();
while (Date.now() - t0 < SEC * 1000) {
  const st = await p.evaluate(() => (document.getElementById('fel-ready')?.dataset.state ?? '') + ' | canvas ' + document.querySelectorAll('canvas').length + ' | ' + document.body.innerText.slice(0, 120).replace(/\s+/g, ' ')).catch(() => 'evaluate failed');
  console.log(`${Math.round((Date.now() - t0) / 1000)} s: ${st}`);
  if (/^loaded|^failed/.test(st)) break;
  await p.waitForTimeout(5000);
}
console.log('url: ' + p.url()); console.log('errors: ' + (errs.length ? errs.slice(0, 5).join(' || ') : 'none'));
await b.close();
