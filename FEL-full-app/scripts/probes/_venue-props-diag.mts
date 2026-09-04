// _venue-props-diag — did the CC0 props mount? Lists prop holders, instance count, map root, failed requests, console errors.
//   URL=http://localhost:3000/dev/mode/golf npx tsx scripts/probes/_venue-props-diag.mts
import { chromium } from 'playwright-core';
const URL_ = process.env.URL ?? 'http://localhost:3000/dev/mode/golf';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs: string[] = []; const failed: string[] = [];
const infos: string[] = [];
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 200)); else if (/navmesh|NEXUS/.test(m.text())) infos.push(m.text().slice(0, 120)); });
p.on('response', (r) => { if (r.url().includes('/models/props/') && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
p.on('requestfailed', (r) => { if (r.url().includes('/models/props/')) failed.push(`FAIL ${r.url()} ${r.failure()?.errorText}`); });
await p.goto(URL_, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(Number(process.env.WAIT_MS ?? 9000));
console.log(await p.evaluate(`(() => { const d = window.__FEL_DEV__; if (!d) return 'no __FEL_DEV__'; const s = d.scene; const roots = s.transformNodes.filter((n) => /^venue_props_/.test(n.name)).map((n) => n.name + ' holders=' + n.getChildTransformNodes().length + ' meshes=' + n.getChildMeshes().length + ' visible=' + n.getChildMeshes().filter((m) => m.isVisible && m.isEnabled()).length); const inst = s.meshes.filter((m) => m.getClassName() === 'InstancedMesh').length; const mapRoot = s.transformNodes.find((n) => /nexus_venue_map/.test(n.name)); return JSON.stringify({ mode: d.modeId, roots, instances: inst, meshes: s.meshes.length, mapMeshes: mapRoot ? mapRoot.getChildMeshes().length : 0, propRequests: performance.getEntriesByType('resource').filter((e) => e.name.includes('/models/props/')).length }); })()`));
console.log('failed:', failed.slice(0, 5)); console.log('nexus:', infos.slice(0, 6)); console.log('console:', errs.filter((e) => /prop|glb|gltf|NEXUS|Venue/i.test(e)).slice(0, 8));
await b.close();
