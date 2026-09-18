// DOES THE RIVAL DUNK DIFFERENTLY EACH TIME? Watch which clips play on the rival rig across a whole contest.
// Before this pass the answer was no: launch -> hang -> celebrate, identically, whether it posted a 48 or
// blew it. The player has had finish variety since M111.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const r = process.env.HOME + '/Library/Caches/ms-playwright';
const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
const b = await chromium.launch({ executablePath: `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-gl=angle','--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
const errs: string[] = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
await p.goto('http://localhost:3061/dev/mode/dunk', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(13000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(2000); }
// watch every clip that plays on the RIVAL's skeleton
await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene;
  window.__RIVAL_LOG__ = [];
  // the rival's groups are the ones NOT on the first skeleton; tag by checking which mesh root they target
  s.onBeforeRenderObservable.add(() => {
    for (const g of s.animationGroups) {
      if (!g.isPlaying) continue;
      // WHOSE BODY IS THIS CLIP ON? Walk the target bone up to its top transform: the player and the rival
      // are separate spawns with separate roots, and without this the log cannot tell the rival's finish
      // variety (the thing being verified) from the player's, which has had variety since M111.
      const t = g.targetedAnimations[0];
      let node = t && t.target;
      let guard = 0;
      while (node && node.parent && guard++ < 24) node = node.parent;
      const rootName = node && node.name ? node.name : '?';
      const rec = g.name + '|' + rootName;
      // record every DISTINCT clip, not only changes from the previous frame — with several groups playing
      // per frame a last-element comparison thrashes and records almost nothing
      if (!window.__RIVAL_LOG__.includes(rec)) window.__RIVAL_LOG__.push(rec);
    }
  });
})()`);
// DRIVE THE PLAYER with the KEYBOARD, which is the recipe that actually works on this mode
// (scripts/_dunk-contest-eye.mts). Emitting onto the InputBus from __FEL_DEV__ drove nothing — the first two
// runs of this probe measured "idle_stand, forever" and I read that as the rival being broken when it was
// the probe never leaving the player's turn.
for (let attempt = 0; attempt < 7; attempt++) {
  // SPACE IS HOLD-TO-CHARGE, RELEASE-TO-LAUNCH: down emits the R trigger, UP emits button A (InputBus:91).
  // Tapping it only ever produced the A, which the mode ignores outside the charge phase — which is why two
  // runs of this probe saw `run` and nothing else.
  await p.keyboard.down('w');
  await p.waitForTimeout(900);
  await p.keyboard.down(' ');           // charge
  await p.waitForTimeout(850);
  await p.keyboard.up(' ');             // release = launch
  await p.waitForTimeout(430);
  await p.keyboard.down(' ');
  await p.keyboard.up(' ');             // slam
  await p.keyboard.up('w');
  await p.waitForTimeout(6000);         // judges reveal, then the rival's round
  await p.keyboard.press(' ');          // clear a card if one is up
  await p.waitForTimeout(3000);
  const seen = await p.evaluate(`(() => [...new Set((window.__RIVAL_LOG__||[]).map((x)=>String(x).split('|')[0]))].join(','))()`);
  console.log('attempt', attempt, 'clips so far:', seen);
}
const log = await p.evaluate(`(() => (window.__RIVAL_LOG__ || []))()`) as string[];
const byRig: Record<string, string[]> = {};
for (const rec of log) {
  const [clip, rig] = String(rec).split('|');
  (byRig[rig] ??= []).push(clip);
}
console.log('\nCLIPS PER RIG:');
for (const [rig, clips] of Object.entries(byRig)) console.log(' ', rig, '->', [...new Set(clips)].join(', '));
console.log('errors:', errs.length, errs[0] ?? '');
await b.close();
