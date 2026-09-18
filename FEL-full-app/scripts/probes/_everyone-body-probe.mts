// EVERYONE-BODY-MOCAP-OPPONENTS probe (2026-09-14) — on a live /dev/mode page, per mode:
//   BODIES   which body files the page loaded (the player must not be the scan for a guest; no opponent may load a
//            player body), and how many skeletons are in the scene
//   CAPTURES the "[FEL-ANIM] opponent captures" log, and — sampled while the mode plays — every skeleton's playing clips
//            (weight > 0.3), so a captured clip is SEEN playing on an opponent, not just registered
//   FRAMES   screenshots at 2 s / 6 s / 10 s
//   BASE=http://127.0.0.1:3061 MODES=dunkduel,onevone OUT=… npx tsx scripts/probes/_everyone-body-probe.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const OUT = process.env.OUT ?? `${process.env.HOME}/Claude/outbox/everyone-body-mocap/probe`;
const MODES = (process.env.MODES ?? 'dunkduel,onevone,threevthree,threepoint').split(',');
const QUERY = process.env.QUERY ?? '';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const report: Record<string, unknown> = {};
for (const mode of MODES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript('globalThis.__name = (f) => f;');
  const page = await ctx.newPage();
  const glbs = new Set<string>(); const logs: string[] = []; const errors: string[] = [];
  page.on('request', (r) => { const u = r.url(); if (/\.glb(\?|$)/.test(u)) glbs.add(new URL(u).pathname); });
  page.on('console', (m) => { const t = m.text(); if (/opponent captures|REFUSED|MISSING CLIP|FEL-IDENTITY|FEL-CHAR/.test(t)) logs.push(t.slice(0, 300)); if (m.type() === 'error' && !/401|favicon|404/.test(t)) errors.push(t.slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  await page.goto(`${BASE}/dev/mode/${mode}${QUERY}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  const ok = await page.waitForFunction(() => document.getElementById('fel-ready')?.dataset.state === 'loaded' || document.getElementById('fel-ready')?.dataset.state === 'playing', undefined, { timeout: 180000 }).then(() => true).catch(() => false);
  if (!ok) { report[mode] = { error: 'never loaded', glbs: [...glbs], logs, errors }; await page.screenshot({ path: `${OUT}/${mode}-noload.png` }); await ctx.close(); continue; }
  // the /dev/mode page wakes on its START button (a key reaches the bus only once the canvas has focus)
  const start = page.getByRole('button', { name: /^START$/ });
  if (await start.count()) await start.first().click(); else await page.mouse.click(640, 400);
  await page.waitForTimeout(300);
  await page.mouse.click(640, 400);
  const samples: Record<string, string[]>[] = [];
  const t0 = Date.now();
  const N = Number(process.env.SAMPLES ?? 40);
  for (let k = 0; k < N; k++) {
    await page.waitForTimeout(500);
    samples.push(await page.evaluate(() => {
      const dev = (window as any).__FEL_DEV__; const scene = dev?.scene; if (!scene) return {};
      const out: Record<string, string[]> = {};
      // only the bodies that matter: skeletons whose clips are not all idle loops get listed; each by its mesh root
      scene.skeletons.forEach((sk: any, i: number) => {
        const nodes = new Set(sk.bones.map((b: any) => b.getTransformNode?.()).filter(Boolean));
        const playing = scene.animationGroups
          .filter((g: any) => g.isPlaying && g.targetedAnimations.some((ta: any) => nodes.has(ta.target)))
          .filter((g: any) => (g.animatables?.[0]?.weight ?? 1) > 0.3)
          .map((g: any) => g.name);
        const mesh = scene.meshes.find((m: any) => m.skeleton === sk);
        let root = mesh; while (root?.parent) root = root.parent;
        out[`${i}:${root?.name ?? 'sk'}`] = playing;
      });
      return out;
    }));
    if ([4, 12, 20].includes(k)) await page.screenshot({ path: `${OUT}/${mode}-${Math.round((Date.now() - t0) / 1000)}s.png` });
  }
  const perBody: Record<string, Record<string, number>> = {};
  for (const s of samples) for (const [b, clips] of Object.entries(s)) for (const c of clips) { perBody[b] ??= {}; perBody[b][c] = (perBody[b][c] ?? 0) + 1; }
  // drop the crowd: bodies that only ever idled
  for (const b of Object.keys(perBody)) if (Object.keys(perBody[b]).every((c) => /^idle/.test(c))) delete perBody[b];
  const bodyFiles = [...glbs].filter((u) => /models\/(elijah|candidates|athletes|fel-hero)/.test(u));
  report[mode] = { bodyFiles, logs, errors: errors.slice(0, 6), perBody };
  console.log(`\n== ${mode}\n  bodies: ${bodyFiles.join(', ')}\n  logs: ${logs.join(' | ').slice(0, 600)}\n  clips: ${JSON.stringify(perBody)}\n  errors: ${errors.length}`);
  await ctx.close();
}
fs.writeFileSync(`${OUT}/report${process.env.TAG ? '-' + process.env.TAG : ''}.json`, JSON.stringify(report, null, 1));
await browser.close();
