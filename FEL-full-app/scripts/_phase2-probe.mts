// Are the Phase 2 layers live on the hero? (planting targets, after-anim observers, skin subsurface)
import { chromium } from 'playwright-core';
const URL_ = process.env.URL ?? 'http://localhost:3000/dev/mode/onevone?agent=1';
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--use-gl=angle','--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const anim: string[] = [];
p.on('console', (m) => { const t = m.text(); if (t.includes('[FEL-ANIM] authored clips registered')) anim.push(t); });
await p.goto(URL_, { waitUntil: 'networkidle' }); await p.waitForSelector('canvas', { timeout: 30000 }); await p.waitForTimeout(3500);
const js = [
  "(() => {",
  "  const a = window.__NEXUS_AGENT__; const s = a && a.host && a.host.scene; if (!s) return 'no scene';",
  "  const plants = s.meshes.filter(m => m.name.startsWith('__plant')).map(m => m.name);",
  "  const skin = s.materials.find(m => m.name === 'skin' && m.getClassName() === 'PBRMaterial');",
  "  const ss = skin && skin.subSurface ? { translucency: skin.subSurface.isTranslucencyEnabled, intensity: skin.subSurface.translucencyIntensity, roughness: skin.roughness, bump: !!skin.bumpTexture } : null;",
  "  const jersey = s.materials.find(m => m.name === 'jersey' && m.getClassName() === 'PBRMaterial');",
  "  const sheen = jersey && jersey.sheen ? jersey.sheen.isEnabled : null;",
  "  const skinnedWithMorphs = s.meshes.filter(m => m.morphTargetManager && m.morphTargetManager.numTargets > 0).length;",
  "  const hair = s.meshes.filter(m => /^Hair_/.test(m.name)).map(m => m.name.replace(/_c\\d+$/, '') + (m.isVisible ? ':on' : ':off'));",
  "  return JSON.stringify({ hair, afterAnimObservers: s.onAfterAnimationsObservable.observers.length, plants, skin: ss, jerseySheen: sheen, meshesWithMorphs: skinnedWithMorphs, tier: s.metadata && s.metadata.felTier });",
  "})()",
].join(String.fromCharCode(10));
console.log(await p.evaluate(js)); console.log('bball clips registered:', anim.some((t) => t.includes('bball_dribble_idle')), '| registrations logged:', anim.length); await b.close();
