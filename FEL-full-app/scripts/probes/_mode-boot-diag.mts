// _mode-boot-diag — does a dev-mode harness reach 'playing'? Console errors + phase after N seconds; exits on its own timer.
//   MODE=skateboard WAIT=15 npx tsx scripts/probes/_mode-boot-diag.mts
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'skateboard'; const wait = Number(process.env.WAIT ?? 15) * 1000;
const kill = setTimeout(() => { console.log('DIAG timed out'); process.exit(2); }, wait + 45000);
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs: string[] = []; p.on('console', (m) => { if (m.type() === 'error' || /FEL-SKY|MISSING|uncaught/i.test(m.text())) errs.push(m.text().slice(0, 220)); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e).slice(0, 220)));
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(wait);
const state = await p.evaluate(`(() => { const d = window.__FEL_DEV__; const s = d?.scene; return JSON.stringify({ hasDev: !!d, modeId: d?.modeId, meshes: s?.meshes?.length, sky: !!s?.getMeshByName('fel_sky_dome'), text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 160) }); })()`).catch((e) => 'eval failed ' + e);
console.log('STATE', state);
if (process.env.PLAY) {
  await p.keyboard.press('j'); await p.waitForTimeout(1200); await p.keyboard.press('j');
  const t0 = Date.now(); let alive = 'frozen';
  for (let i = 0; i < 5; i++) { await p.waitForTimeout(2000); const r = await Promise.race([p.evaluate('performance.now()'), new Promise((res) => setTimeout(() => res('HUNG'), 4000))]); if (r === 'HUNG') { alive = `frozen after ${i * 2}s`; break; } alive = `responsive at ${Math.round((Date.now() - t0) / 1000)}s`; }
  const st2 = await Promise.race([p.evaluate(`document.body.innerText.replace(/\\s+/g, ' ').slice(0, 120)`), new Promise((res) => setTimeout(() => res('HUNG'), 4000))]);
  console.log('PLAY', alive, '|', st2);
}
console.log('ERRORS', errs.length, errs.slice(0, 8).join(' | '));
await b.close(); clearTimeout(kill);
