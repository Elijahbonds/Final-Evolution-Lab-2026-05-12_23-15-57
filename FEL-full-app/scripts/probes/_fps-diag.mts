// _fps-diag — where does a mode's frame time go? engine fps: baseline → kit packs hidden → SSAO detached → shadows off.  MODE=football
import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3000'; const mode = process.env.MODE ?? 'football';
setTimeout(() => { console.log('DIAG timed out'); process.exit(2); }, 120000);
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(9000);
await p.keyboard.press('j'); await p.waitForTimeout(1500); await p.keyboard.press('j'); await p.waitForTimeout(4000);
const fps = async (label: string) => { const v = await p.evaluate(`(async () => { const s = window.__FEL_DEV__.scene; const e = s.getEngine(); const t0 = performance.now(); let n = 0; await new Promise(r => { const o = s.onAfterRenderObservable.add(() => { n++; if (performance.now() - t0 > 2500) { s.onAfterRenderObservable.remove(o); r(); } }); }); return { fps: Math.round(n / ((performance.now() - t0) / 1000)), meshes: s.getActiveMeshes().length, verts: s.getActiveIndices() / 3 | 0 }; })()`); console.log(label, JSON.stringify(v)); };
await fps('baseline        ');
await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; for (const m of s.meshes) if (/Kit_tops_top_(football|baseball)/.test(m.name)) m.setEnabled(false); })()`); await fps('packs hidden    ');
await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; for (const m of s.meshes) if (/^Kit_|^Body/.test(m.name) && !/Kit_tops_top_(football|baseball)/.test(m.name)) m.setEnabled(false); })()`); await fps('+bodies hidden  ');
await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; s.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('felSsao', s.activeCamera); })()`); await fps('+ssao off       ');
await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; for (const l of s.lights) { const g = l.getShadowGenerator?.(); if (g) g.getShadowMap().renderList = []; } })()`); await fps('+shadows off    ');
await p.evaluate(`(() => { const s = window.__FEL_DEV__.scene; s.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('fel_pipeline', s.activeCamera); })()`); await fps('+grade off      ');
await b.close(); process.exit(0);
