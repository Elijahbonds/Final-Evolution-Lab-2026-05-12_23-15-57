// _meshy-thumbs — screenshot glbs through the scratch viewer (python http.server on :3009 serving scratchpad/viewer). Args: model basenames.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
for (const m of process.argv.slice(2)) {
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  await p.goto(`http://127.0.0.1:3009/viewer.html?m=${m}.glb`);
  try { await p.waitForFunction('window.__ready === true', null, { timeout: 90000 }); } catch { console.log(m, 'TIMEOUT'); await p.close(); continue; }
  await p.waitForTimeout(1500);
  console.log(m, JSON.stringify(await p.evaluate('window.__info')));
  await p.screenshot({ path: `/private/tmp/claude-501/-Users-elijahbonds-Developer-FEL-swarm-copilot-worktrees-final-evolution-lab-2026-05-12-23-15-57-finalevolutionus-automatic-carnival-FEL-full-app/c7c52acb-138e-43ec-9fff-aa12b30a9290/scratchpad/viewer/${m}.png` }); await p.close();
}
await b.close();
