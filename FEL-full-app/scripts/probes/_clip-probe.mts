// What is the hero actually playing right now, and are its arms in bind pose?
import { chromium } from 'playwright-core';
const URL_ = process.env.URL ?? 'http://localhost:3000/dev/mode/karate?agent=1';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle','--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const bad: string[] = [];
p.on('console', (m) => { const t = m.text(); if (/T-pose|bind|MISSING|unknown clip|FEL-CLIP|SkinningGuard|FEL-SKIN/i.test(t)) bad.push(t.slice(0, 200)); });
await p.goto(URL_, { waitUntil: 'networkidle' }); await p.waitForSelector('canvas', { timeout: 30000 }); await p.waitForTimeout(2500);
await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
const js = [
  "(() => {",
  "  const a = window.__NEXUS_AGENT__; const s = a && a.host && a.host.scene; if (!s) return 'no scene';",
  "  const playing = s.animationGroups.filter(g => g.isPlaying).map(g => g.name + '@' + (g.weight ?? 1).toFixed(2));",
  "  const sk = s.skeletons[0]; const arm = sk && sk.bones.find(b => b.name === 'LeftArm'); const n = arm && arm.getTransformNode();",
  "  const q = n && n.rotationQuaternion ? n.rotationQuaternion.toEulerAngles() : null;",
  "  return JSON.stringify({ playing, leftArmEulerDeg: q ? [q.x, q.y, q.z].map(v => Math.round(v * 180 / Math.PI)) : null, groups: s.animationGroups.length });",
  "})()",
].join(String.fromCharCode(10));
for (const key of ['j', 'k', 'l', 'j']) { await p.keyboard.press(key); await p.waitForTimeout(500); }
console.log('after attacks:', await p.evaluate(js));
await p.waitForTimeout(2500);
console.log('after settle :', await p.evaluate(js));
await p.screenshot({ path: (process.env.OUT ?? '/tmp') + '/clip-probe.png' });
console.log('console flags:', JSON.stringify(bad.slice(0, 8)));
await b.close();
