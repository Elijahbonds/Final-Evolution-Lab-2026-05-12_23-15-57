// Which character path is a mode actually rendering — procedural capsules or the forge GLB?
import { chromium } from 'playwright-core';
const URL_ = process.env.URL ?? 'http://localhost:3000/dev/mode/onevone?agent=1';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle','--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(URL_, { waitUntil: 'networkidle' }); await p.waitForSelector('canvas', { timeout: 30000 }); await p.waitForTimeout(3500);
const js = [
  "(() => {",
  "  const a = window.__NEXUS_AGENT__; const s = a && a.host && a.host.scene; if (!s) return 'no scene via agent';",
  "  const sk = s.meshes.filter(m => m.skeleton);",
  "  const mats = [...new Set(sk.map(m => m.material ? (m.material.name + ':' + m.material.getClassName()) : 'none'))];",
  "  const names = [...new Set(sk.map(m => m.name.replace(/_c\\d+$/, '')))].slice(0, 12);",
  "  return JSON.stringify({ skinnedMeshes: sk.length, skinnedMaterials: mats, skinnedMeshNames: names, skeletonBones: s.skeletons.map(k => k.bones.length) });",
  "})()",
].join(String.fromCharCode(10));
console.log(await p.evaluate(js)); await b.close();
