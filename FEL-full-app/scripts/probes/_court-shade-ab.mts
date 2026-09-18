// Why does the scanned court read as sky under a location? Mutate the live scene step by step and frame each.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(process.env.URL ?? 'http://localhost:3000/dev/mode/dunk?location=blossom', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(12000); await p.keyboard.press('j'); await p.waitForTimeout(2500);
const state = await p.evaluate(`(() => { const sc = window.__FEL_DEV__.scene; return JSON.stringify({ fogMode: sc.fogMode, fogDensity: sc.fogDensity, fogStart: sc.fogStart, fogEnd: sc.fogEnd, fogColor: [sc.fogColor.r, sc.fogColor.g, sc.fogColor.b].map((v) => +v.toFixed(2)), lights: sc.lights.map((l) => ({ n: l.name, cls: l.getClassName(), i: +l.intensity.toFixed(2), on: l.isEnabled(), d: l.diffuse ? [l.diffuse.r, l.diffuse.g, l.diffuse.b].map((v) => +v.toFixed(2)) : null })), envInt: sc.environmentIntensity, pp: sc.postProcesses.map((x) => x.name), ipp: sc.imageProcessingConfiguration ? { exp: sc.imageProcessingConfiguration.exposure, con: sc.imageProcessingConfiguration.contrast, tm: sc.imageProcessingConfiguration.toneMappingEnabled } : null }); })()`);
console.log('state', state);
const shot = async (tag: string) => { await p.waitForTimeout(800); await p.screenshot({ path: `${process.env.OUT}/shade_${tag}.png` }); };
await shot('0_base');
await p.evaluate(`window.__FEL_DEV__.scene.fogMode = 0`); await shot('1_nofog');
await p.evaluate(`(() => { const sc = window.__FEL_DEV__.scene; for (const l of sc.lights) if (l.getClassName() === 'DirectionalLight') l.intensity *= 3; })()`); await shot('2_sun3x');
await p.evaluate(`(() => { const m = window.__FEL_DEV__.scene.getMeshByName('Mesh_0'); if (m && m.material) m.material.environmentIntensity = 0.6; })()`); await shot('3_env06');
await p.evaluate(`(() => { const m = window.__FEL_DEV__.scene.getMeshByName('Mesh_0'); if (m && m.material) { m.material.unlit = true; } })()`); await shot('4_unlit');
console.log('done');
await b.close();
