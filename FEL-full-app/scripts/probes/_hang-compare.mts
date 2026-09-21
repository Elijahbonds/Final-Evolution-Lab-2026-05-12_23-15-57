// Which hang each body actually gets: the derived one, or the HANG_DEFAULT fallback — and what the guard says.
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
    const mesh = scene.meshes.find(m => m.skeleton && rootOf(m) === r);
    const skel = mesh && mesh.skeleton;
    if (!skel) continue;
    const bone = (n) => skel.bones.find(b => b.name === n || b.name.endsWith(':' + n) || b.name.endsWith('_' + n));
    const restPos = (n) => { const bn = bone(n); if (!bn) return null; const m = bn.getRestPose ? bn.getRestPose() : bn.getBindPose(); const t = m.getTranslation(); return [+t.x.toFixed(3), +t.y.toFixed(3), +t.z.toFixed(3)]; };
    const seg = (a, c) => { if (!a || !c) return null; return Math.hypot(c[0]-a[0], c[1]-a[1], c[2]-a[2]); };
    const sh = restPos('LeftArm'), el = restPos('LeftForeArm'), ha = restPos('LeftHand');
    const len = (seg(sh, el) ?? 0) + (seg(el, ha) ?? 0);
    lines.push({
      root: r.name, isHero: r === hero, dist: +d.toFixed(1),
      leftArmRest: sh, leftForeRest: el, leftHandRest: ha,
      armLen: +len.toFixed(3),
      guardPasses: len > 0.3 && len < 1.2,
      usesDerived: (len > 0.3 && len < 1.2),
    });
  }
  lines.sort((a,b) => a.dist - b.dist);
  return lines.slice(0, 4);
})()`);
console.log(JSON.stringify(out, null, 1));
await b.close();
