// _grade-diag — the post-process grade on a mode: exposure, contrast, tone mapping, bloom, vignette, and the camera's chain.
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'skateboard';
setTimeout(() => { console.log('DIAG timed out'); process.exit(2); }, 70000);
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(9000); await p.keyboard.press('j'); await p.waitForTimeout(3000);
console.log(mode, await p.evaluate(`(() => { const s = window.__FEL_DEV__?.scene; if (!s) return 'no scene'; const ipc = s.imageProcessingConfiguration; const cam = s.activeCamera;
  const pipes = (s.postProcessRenderPipelineManager?.supportedPipelines ?? []).map(pl => { const o = { name: pl.name, cls: pl.getClassName() }; for (const k of ['bloomEnabled','bloomWeight','bloomThreshold','bloomScale','fxaaEnabled','imageProcessingEnabled','sharpenEnabled','grainEnabled','chromaticAberrationEnabled','depthOfFieldEnabled']) if (k in pl) o[k] = pl[k]; return o; });
  return JSON.stringify({ exposure: ipc.exposure, contrast: ipc.contrast, toneMapping: ipc.toneMappingEnabled, toneType: ipc.toneMappingType, vignette: ipc.vignetteEnabled, vigWeight: ipc.vignetteWeight, colorCurves: ipc.colorCurvesEnabled, colorGrading: ipc.colorGradingEnabled, camPP: (cam?._postProcesses ?? []).filter(Boolean).map(x => x.getClassName()), pipes, envIntensity: s.environmentIntensity, lights: s.lights.map(l => l.name + ':' + l.getClassName().slice(0, 6) + ':' + (+l.intensity.toFixed(2))) }); })()`));
await b.close(); process.exit(0);
