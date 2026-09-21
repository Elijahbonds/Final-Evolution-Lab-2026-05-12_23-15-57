import { chromium } from 'playwright-core';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await p.goto('http://localhost:3011/dev/mode/dunk', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 90000 });
await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
await p.waitForTimeout(3500);
const out = await p.evaluate(`(() => {
  const dev = window.__FEL_DEV__, scene = dev.scene, hero = dev.hero();
  const rootOf = (n) => { while (n && n.parent) n = n.parent; return n; };
  const roots = [...new Set(scene.meshes.filter(m => m.skeleton && m.isEnabled() && m.isVisible).map(m => rootOf(m)))];
  const hp = hero.getAbsolutePosition();
  const lines = [];
  for (const r of roots) {
    const rp = r.getAbsolutePosition();
    const d = Math.hypot(rp.x - hp.x, rp.z - hp.z);
    if (d > 14) continue;   // the stands are full of idle_stand bodies; only the floor matters
    const mesh = scene.meshes.find(m => m.skeleton && rootOf(m) === r);
    const skel = mesh && mesh.skeleton;
    // which animation groups are running and target this skeleton
    const running = scene.animationGroups.filter(g => g.isPlaying && g.targetedAnimations.some(ta => {
      const t = ta.target; const nm = t && t.name; return skel && skel.bones.some(bn => bn.name === nm || (bn.getTransformNode && bn.getTransformNode() === t));
    })).map(g => g.name + '@' + g.animatables.length);
    lines.push({
      root: r.name,
      isHero: r === hero,
      pos: [ +rp.x.toFixed(1), +rp.y.toFixed(1), +rp.z.toFixed(1) ],
      distFromHero: +d.toFixed(1),
      meta: r.metadata ? JSON.stringify(r.metadata).slice(0, 180) : null,
      bones: skel ? skel.bones.length : 0,
      running,
    });
  }
  lines.sort((a, b) => a.distFromHero - b.distFromHero);
  return { onFloor: lines.length, allSkinned: roots.length, roots: lines.slice(0, 8), totalGroups: scene.animationGroups.length, playing: scene.animationGroups.filter(g=>g.isPlaying).map(g=>g.name).slice(0,12) };
})()`);
console.log(JSON.stringify(out, null, 1));
await b.close();
