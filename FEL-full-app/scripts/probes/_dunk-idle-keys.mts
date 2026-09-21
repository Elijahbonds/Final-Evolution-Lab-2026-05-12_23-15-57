// Are the hero's and the rival's idle_stand clips the same clip? Every input to buildPoseClip logs identical for all
// seven bodies, so they should be — this reads the baked keys instead of trusting that.
import { chromium } from 'playwright-core';
const PORT = process.env.PORT ?? '3011';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
await p.goto(`http://localhost:${PORT}/dev/mode/dunk`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 90000 });
await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
await p.waitForTimeout(4500);
const out = await p.evaluate(`(() => {
  const dev = window.__FEL_DEV__, scene = dev.scene, hero = dev.hero(), rival = dev.dunkRival ? dev.dunkRival() : null;
  const rootOf = (n) => { while (n && n.parent) n = n.parent; return n; };
  const skOf = (root) => { const m = scene.meshes.find((x) => x.skeleton && rootOf(x) === root); return m ? m.skeleton : null; };
  const dump = (root, label) => {
    const sk = skOf(root); if (!sk) return { label, err: 'no skeleton' };
    const g = scene.animationGroups.find((gg) => gg.name === 'idle_stand' && gg.targetedAnimations.some((ta) => sk.bones.some((bb) => bb.getTransformNode && bb.getTransformNode() === ta.target)));
    if (!g) return { label, err: 'no idle_stand' };
    const named = {};
    for (const ta of g.targetedAnimations) {
      const nm = ta.target && ta.target.name ? ta.target.name : '?';
      const ks = ta.animation.getKeys().map((k) => ({ f: +k.frame.toFixed(1), v: k.value && k.value.x !== undefined ? [+k.value.x.toFixed(3), +k.value.y.toFixed(3), +k.value.z.toFixed(3), k.value.w !== undefined ? +k.value.w.toFixed(3) : null] : String(k.value) }));
      named[nm + '|' + ta.animation.targetProperty] = ks;
    }
    return { label, uid: g.uniqueId, targets: g.targetedAnimations.length, named };
  };
  return { hero: dump(hero, 'HERO'), rival: rival ? dump(rival, 'RIVAL') : { err: 'no rival' } };
})()`);
const pick = (d: any, want: string) => Object.entries(d.named ?? {}).filter(([k]) => k.includes(want));
for (const side of ['LeftArm', 'RightArm']) {
  console.log(`\n== ${side}`);
  for (const who of ['hero', 'rival'] as const) {
    for (const [k, v] of pick(out[who], side)) console.log(`  ${who.padEnd(5)} ${k}  ${JSON.stringify(v)}`);
  }
}
console.log(`\ngroup uids: hero ${out.hero.uid} rival ${out.rival.uid} | targets ${out.hero.targets} vs ${out.rival.targets}`);
console.log(`same object: ${out.hero.uid === out.rival.uid}`);
await b.close();
