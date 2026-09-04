// Which quality tier did a mode mount, and what did it actually create?
// URL=... VIEWPORT=390x844 MOBILE=1 npx tsx scripts/_tier-probe.mts
import { chromium } from 'playwright-core';
const URL_ = process.env.URL ?? 'http://localhost:3000/dev/mode/dunk?agent=1';
const [vw, vh] = (process.env.VIEWPORT ?? '1280x800').split('x').map(Number);
const mobile = process.env.MOBILE === '1';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle','--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: vw, height: vh }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 3 : 1 });
const p = await ctx.newPage();
const tierLogs: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/FEL-TIER|FEL-CANVAS|SSAO/.test(t)) tierLogs.push(t); });
await p.goto(URL_, { waitUntil: 'networkidle' }); await p.waitForSelector('canvas', { timeout: 30000 }); await p.waitForTimeout(4000);
const js = [
  "(() => {",
  "  const a = window.__NEXUS_AGENT__; const s = a && a.host && a.host.scene; if (!s) return 'no scene via agent';",
  "  const pipes = s.postProcessRenderPipelineManager.supportedPipelines.map(x => x.getClassName() + ':' + x.name);",
  "  const shadows = s.lights.map(l => { const g = l.getShadowGenerator && l.getShadowGenerator(); return g ? (g.getClassName() + ' ' + g.mapSize + (g.numCascades ? ' cascades=' + g.numCascades : '')) : null; }).filter(Boolean);",
  "  const perf = (document.body.innerText.match(/(\\d+)\\s*fps\\s*avg\\s*([\\d.]+)ms/) || []).slice(1).join(' fps / ') + ' ms';",
  "  const draws = (document.body.innerText.match(/draws\\s*(\\d+)/) || [])[1];",
  "  return JSON.stringify({ pipelines: pipes, shadows, perf, draws, hw: s.getEngine().getHardwareScalingLevel(), canvas: [s.getEngine().getRenderWidth(), s.getEngine().getRenderHeight()] });",
  "})()",
].join(String.fromCharCode(10));
console.log(JSON.stringify({ viewport: [vw, vh], mobile, logs: tierLogs }));
console.log(await p.evaluate(js)); await b.close();
