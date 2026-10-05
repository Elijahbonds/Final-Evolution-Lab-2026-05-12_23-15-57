// REACH-FREEZE probe (2026-09-29) — the play frame on the RUNNING rig, not an import.
//
// For each mode it opens /dev/mode/<mode> twice through playerIdentity's dev body override: once as the standard body
// (`?body=male`) and once as the biggest body the old creator could save (`&height=110&build=112&reach=112`). It reads the
// hero's root off `__FEL_DEV__.hero()` after the spawn: its scaling, the play scale applyProportions recorded on it, the right
// arm's shoulder-to-wrist length and the head's height over the root. Expected:
//   dunk, dunkduel, onevone (STANDARD_FRAME_MODES) — the big body spawns EXACTLY like the standard one (ratios 1.000);
//   tennis (casual) — height clamped to 1.04 and girth to 1.04 × 1.08; the arm's joints at their bind offsets in every mode
//   (armLocalRatio 1.000 — the saved reach is never applied), so the arm is longer only by the root's own scale.
//   BASE=http://127.0.0.1:3291 MODES=dunk,dunkduel,onevone,tennis npx tsx scripts/probes/_reach-freeze-probe.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3291';
const OUT = process.env.OUT ?? `${process.env.HOME}/Claude/outbox/REACH-FREEZE-shots`;
const MODES = (process.env.MODES ?? 'dunk,dunkduel,onevone,tennis').split(',');
const BODIES: Record<string, string> = { standard: '?body=male', oldBig: '?body=male&height=110&build=112&reach=112' };
fs.mkdirSync(OUT, { recursive: true });

type Read = { ok: boolean; scaling?: number[]; playScale?: unknown; arm?: number; armLocal?: number; armNodeScale?: number[]; head?: number; modeId?: string; error?: string };
const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1280,860'] });
const rows: Record<string, unknown>[] = [];
for (const mode of MODES) {
  const got: Record<string, Read> = {};
  for (const [name, q] of Object.entries(BODIES)) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript('globalThis.__name = (f) => f;');
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
    try {
      await page.goto(`${BASE}/dev/mode/${mode}${q}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
      await page.waitForFunction(() => ['loaded', 'playing'].includes(document.getElementById('fel-ready')?.dataset.state ?? ''), undefined, { timeout: 240000 });
      const start = page.getByRole('button', { name: /^START$/ });
      if (await start.count()) await start.first().click().catch(() => {});
      await page.waitForFunction(() => !!(window as any).__FEL_DEV__?.hero?.(), undefined, { timeout: 60000 });
      await page.waitForTimeout(1500);
      got[name] = await page.evaluate(() => {
        const dev = (window as any).__FEL_DEV__; const root = dev.hero();
        const nodes = new Set(root.getDescendants(false));
        const sk = dev.scene.skeletons.find((s: any) => s.bones.some((b: any) => nodes.has(b.getTransformNode())));
        const find = (n: string) => sk?.bones.find((b: any) => b.name === n || b.name.endsWith(`:${n}`) || b.name.replace(/_c\d+$/, '') === n)?.getTransformNode();
        const P = (t: any) => { t.computeWorldMatrix(true); return t.getAbsolutePosition().clone(); };
        root.computeWorldMatrix(true);
        const sh = find('RightArm'), el = find('RightForeArm'), wr = find('RightHand'), hd = find('Head');
        const arm = sh && el && wr ? P(sh).subtract(P(el)).length() + P(el).subtract(P(wr)).length() : undefined;
        // the joints' LOCAL offsets — what the old reach stretched; rotations (the pose) cannot change them
        const armLocal = el && wr ? el.position.length() + wr.position.length() : undefined;
        const armNodeScale = [sh, el, wr].map((n: any) => (n ? +n.scaling.x.toFixed(4) : NaN));
        return {
          ok: true, modeId: dev.modeId, scaling: [root.scaling.x, root.scaling.y, root.scaling.z],
          playScale: root.metadata?.felPlayScale ?? null, arm, armLocal, armNodeScale, head: hd ? P(hd).y - root.getAbsolutePosition().y : undefined,
        };
      });
      await page.screenshot({ path: `${OUT}/${mode}-${name}.png` });
    } catch (e) {
      got[name] = { ok: false, error: String((e as Error).message).slice(0, 200) + (errors.length ? ` | ${errors.join(' | ')}` : '') };
    }
    await ctx.close();
  }
  const a = got.standard, b = got.oldBig;
  const ratio = (x?: number, y?: number) => (x && y ? +(y / x).toFixed(4) : null);
  rows.push({
    mode, modeId: b?.modeId,
    scaleRatio: a?.scaling && b?.scaling ? b.scaling.map((v, i) => +(v / a.scaling![i]).toFixed(4)) : null,
    armRatio: ratio(a?.arm, b?.arm), armLocalRatio: ratio(a?.armLocal, b?.armLocal), armNodeScale: { standard: a?.armNodeScale, oldBig: b?.armNodeScale }, headRatio: ratio(a?.head, b?.head),
    playScale: { standard: a?.playScale, oldBig: b?.playScale },
    errors: [a?.error, b?.error].filter(Boolean),
  });
  console.log(JSON.stringify(rows[rows.length - 1]));
}
await browser.close();
fs.writeFileSync(`${OUT}/reach-freeze-probe.json`, JSON.stringify(rows, null, 2));
