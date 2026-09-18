// THE MAP PASS, ON SCREEN. Boot each course by ?map= and record what the scene actually contains — a course
// that boots to the wrong world, or to no world, is a map pass that only happened in the data.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const r = process.env.HOME + '/Library/Caches/ms-playwright';
const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
const EXE = `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const JOBS: [string, string][] = (process.env.JOBS ?? '').split(';').filter(Boolean).map((j) => j.split(',') as [string, string]);
const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal'] });
for (const [mode, map] of JOBS) {
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs: string[] = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  try {
    await p.goto(`http://localhost:3061/dev/mode/${mode}?map=${map}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('canvas', { timeout: 240000 });
    await p.waitForTimeout(11000);
    const s0 = p.locator('text=/^START$/').first();
    if (await s0.count()) { await s0.click(); await p.waitForTimeout(3000); }
    const out = await p.evaluate(`(() => {
      const s = window.__FEL_DEV__.scene;
      const names = s.meshes.map((m) => m.name);
      const has = (re) => names.some((n) => re.test(n));
      return {
        meshes: names.length,
        draws: s.getEngine().drawCalls ?? -1,
        clear: s.clearColor ? '#' + [s.clearColor.r, s.clearColor.g, s.clearColor.b].map((v) => Math.round(v*255).toString(16).padStart(2,'0')).join('') : '-',
        sun: (s.lights.find((l) => l.getClassName() === 'DirectionalLight') || {}).intensity ?? -1,
        gates: names.filter((n) => /kart_mark_|aero_ring_|ring_/.test(n)).length,
        road: names.filter((n) => /kart_road_/.test(n)).length,
        world: { palm: has(/palm/i), slope: has(/piste|slope|snow/i), pitch: has(/pitch|goal|field/i), hoop: has(/hoop|backboard/i), stars: has(/orbit/i) },
      };
    })()`);
    console.log(`${mode}/${map}`.padEnd(30), JSON.stringify(out), 'err=' + errs.length, errs[0] ?? '');
  } catch (e) { console.log(`${mode}/${map}`.padEnd(30), 'FAILED', String(e).slice(0, 120)); }
  await p.close();
}
await b.close();
