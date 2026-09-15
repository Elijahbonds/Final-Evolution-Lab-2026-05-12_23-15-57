// _move-sheet — can you name the move from a still? (owner 2026-09-15: "The animations need to be recognizable on sight",
// extended to board tricks, dunks, fighting moves and every mode's signature moves).
//
// Per mode (dev build, before the run starts so no mode logic fights the pose): find every AnimationGroup bound to the
// hero's skeleton, and for each clip matching CLIPS (regex) freeze it at three moments — wind-up (0.25), peak (0.5),
// follow-through (0.8) — photographed from a side camera framed on the hips, HUD hidden. The frames are tiled into ONE
// contact sheet per mode with the clip name under each row, so a reviewer can grade "would a player name this move?".
//   BASE=http://127.0.0.1:3098 MODES=dunk,karate SIDE=1 TAG=v1 npx tsx scripts/probes/_move-sheet.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const TAG = process.env.TAG ?? 'run';
const MODES = (process.env.MODES ?? 'dunk').split(',');
const CLIPS = new RegExp(process.env.CLIPS ?? '.');
const SKIP = /idle|stand|walk|run$|strafe|breath|seated|ride_idle|_loop$/i;
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/moves/${TAG}`;
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal', '--window-size=900,760'] });
for (const mode of MODES) {
  const ctx = await b.newContext({ viewport: { width: 520, height: 620 } });
  await ctx.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/dev/mode/${mode}?agent=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) { const s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded' || s === 'failed') break; await p.waitForTimeout(500); }
  await p.waitForTimeout(2500);
  // hide every DOM overlay over the canvas
  await p.addStyleTag({ content: 'body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important}' });
  const clips: string[] = await p.evaluate(`(() => {
    const W = window; const s = W.__FEL_DEV__.scene; const hero = W.__FEL_DEV__.hero();
    const under = new Set(hero.getDescendants(false));
    const sk = s.skeletons.find((k) => k.bones.some((b) => { const n = b.getTransformNode(); return n && under.has(n); }));
    const targets = new Set(sk.bones.map((b) => b.getTransformNode()).filter(Boolean));
    const groups = s.animationGroups.filter((g) => g.targetedAnimations.some((t) => targets.has(t.target)));
    W.__SHEET = { s, hero, sk, groups };
    // the sheet camera: a side view on the hips
    const B = s.activeCamera.constructor; // any camera class works for position/target via ArcRotate below
    return [...new Set(groups.map((g) => g.name))];
  })()`);
  const wanted = clips.filter((c) => CLIPS.test(c) && !SKIP.test(c)).sort();
  console.log(`${mode}: ${clips.length} clips on the hero, ${wanted.length} in the sheet`);
  const rows: { clip: string; frames: string[]; len: number }[] = [];
  for (const clip of wanted) {
    const frames: string[] = [];
    let len = 0;
    for (const k of [0.25, 0.5, 0.8]) {
      len = await p.evaluate(`(async () => {
        const W = window; const { s, hero, sk, groups } = W.__SHEET;
        for (const g of groups) { g.pause(); g.setWeightForAllAnimatables(0); }
        const g = groups.find((x) => x.name === ${JSON.stringify(clip)});
        const span = g.to - g.from;
        g.start(false, 1, g.from, g.to, false);
        g.setWeightForAllAnimatables(1);
        g.goToFrame(g.from + span * ${k});
        g.pause();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const hips = sk.bones.find((b) => /hips$/i.test(b.name))?.getTransformNode() ?? hero;
        hips.computeWorldMatrix(true);
        const c = hips.getAbsolutePosition();
        const cam = s.activeCamera;
        const m = hero.computeWorldMatrix(true).m;
        const fwd = { x: m[8], z: m[10] }; const l = Math.hypot(fwd.x, fwd.z) || 1;
        // SIDE view: the camera stands off the hero's right, 4.6 m out, a little above the hips
        const side = ${process.env.SIDE === '0' ? 0 : 1};
        const rx = side ? fwd.z / l : -fwd.x / l, rz = side ? -fwd.x / l : -fwd.z / l;
        cam.position.set(c.x + rx * 4.6, c.y + 0.6, c.z + rz * 4.6);
        if (cam.setTarget) cam.setTarget(c.clone ? c.clone() : c);
        W.__SHEET_FREEZE = true;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return span / (g.targetedAnimations[0]?.animation.framePerSecond || 60);
      })()`) as number;
      const file = `${OUT}/${mode}__${clip}__${Math.round(k * 100)}.png`;
      await p.locator('canvas').first().screenshot({ path: file });
      frames.push(file);
    }
    rows.push({ clip, frames, len });
  }
  await ctx.close();
  // contact sheet: rows of three frames, clip name + seconds under each row
  if (rows.length) {
    const sheet = await b.newPage({ viewport: { width: 1200, height: 400 } });
    const img = (f: string) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
    const html = `<body style="margin:0;background:#111;color:#eee;font:14px monospace">${rows.map((r) => `<div style="display:flex;gap:4px;align-items:flex-end;padding:4px">${r.frames.map((f) => `<img src="${img(f)}" style="width:260px;height:310px;object-fit:cover">`).join('')}<div style="padding:8px;width:300px">${r.clip}<br><span style="color:#999">${r.len.toFixed(2)} s · 25% · 50% · 80%</span></div></div>`).join('')}</body>`;
    await sheet.setContent(html);
    const perPage = 6;
    for (let i = 0; i < rows.length; i += perPage) {
      await sheet.setContent(`<body style="margin:0;background:#111;color:#eee;font:14px monospace">${rows.slice(i, i + perPage).map((r) => `<div style="display:flex;gap:4px;align-items:flex-end;padding:4px">${r.frames.map((f) => `<img src="${img(f)}" style="width:220px;height:262px;object-fit:cover">`).join('')}<div style="padding:8px;width:300px">${r.clip}<br><span style="color:#999">${r.len.toFixed(2)} s · 25/50/80%</span></div></div>`).join('')}</body>`);
      await sheet.setViewportSize({ width: 1000, height: Math.min(rows.length - i, perPage) * 272 });
      await sheet.screenshot({ path: `${OUT}/SHEET-${mode}-${Math.floor(i / perPage) + 1}.png` });
    }
    await sheet.close();
    for (const r of rows) for (const f of r.frames) fs.unlinkSync(f);
  }
  fs.writeFileSync(`${OUT}/${mode}.json`, JSON.stringify({ mode, all: clips, sheet: rows.map((r) => ({ clip: r.clip, sec: +r.len.toFixed(2) })) }, null, 1));
}
await b.close();
