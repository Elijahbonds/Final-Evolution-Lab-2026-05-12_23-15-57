// GATE 0 (Phase 0, both briefs). The rig is the floor everything else stands on, so it is verified rather
// than assumed: 22 bones, UNPREFIXED, a real T-pose at bind, and three authored clips playing end to end
// without a bone snapping, inverting or drifting.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const r = process.env.HOME + '/Library/Caches/ms-playwright';
const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
const b = await chromium.launch({ executablePath: `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-gl=angle','--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 120)));
await p.goto('http://localhost:3061/dev/mode/dunk', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 120000 });
await p.waitForTimeout(14000);

console.log(await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene;
  const sk = s.skeletons[0];
  if (!sk) return 'NO SKELETON';
  const names = sk.bones.map((x) => x.name);
  const mesh = s.meshes.find((m) => m.skeleton === sk && m.getTotalVertices() > 0);
  const pos = (n) => { const bo = sk.bones.find((x) => x.name === n); if (!bo || !mesh) return null; const v = bo.getAbsolutePosition(mesh); return [v.x, v.y, v.z].map((q) => +q.toFixed(3)); };
  return JSON.stringify({
    boneCount: names.length,
    prefixed: names.filter((n) => /mixamorig/i.test(n)).length,
    names: names.join(' '),
    clips: s.animationGroups.length,
    landmarks: { Hips: pos('Hips'), LeftHand: pos('LeftHand'), RightHand: pos('RightHand'), Head: pos('Head'), LeftFoot: pos('LeftFoot') },
  }, null, 1);
})()`));

// three clips, played end to end, watching for a frame where a bone jumps
const CLIPS = (process.env.CLIPS ?? 'idle_stand,run,jab').split(',');
for (const clip of CLIPS) {
  const res = await p.evaluate(`(async () => {
    const s = window.__FEL_DEV__.scene;
    const sk = s.skeletons[0];
    const mesh = s.meshes.find((m) => m.skeleton === sk && m.getTotalVertices() > 0);
    const g = s.animationGroups.find((x) => x.name === ${JSON.stringify('CLIP')}.replace('CLIP', ${JSON.stringify(clip)}));
    if (!g) return { clip: ${JSON.stringify(clip)}, err: 'not in library' };
    s.animationGroups.forEach((x) => x.stop());
    g.start(false, 1, g.from, g.to, false);
    const watch = ['LeftHand','RightHand','LeftFoot','RightFoot','Head'];
    let prev = null, maxJump = 0, frames = 0, nan = 0;
    await new Promise((done) => {
      const obs = s.onAfterRenderObservable.add(() => {
        const now = watch.map((n) => { const bo = sk.bones.find((x) => x.name === n); const v = bo.getAbsolutePosition(mesh); return [v.x, v.y, v.z]; });
        if (now.flat().some((q) => !Number.isFinite(q))) nan++;
        if (prev) for (let i = 0; i < now.length; i++) {
          const dx = now[i][0]-prev[i][0], dy = now[i][1]-prev[i][1], dz = now[i][2]-prev[i][2];
          maxJump = Math.max(maxJump, Math.hypot(dx, dy, dz));
        }
        prev = now; frames++;
        if (!g.isPlaying || frames > 400) { s.onAfterRenderObservable.remove(obs); done(); }
      });
    });
    return { clip: ${JSON.stringify(clip)}, frames, maxJumpM: +maxJump.toFixed(4), nanFrames: nan };
  })()`);
  console.log('CLIP', JSON.stringify(res));
}
await b.close();
