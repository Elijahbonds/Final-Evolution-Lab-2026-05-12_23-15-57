// BODY MATRIX probe (EVERYONE-BODY-MOCAP-OPPONENTS, 2026-09-14) — the owner's proof bar: "male/female × short/tall ×
// slim/heavy, plus the scan, per mode family: feet on the floor, no bent-backward joints, arms reading right, the
// posture layer running — measured on bones."
//
// For each (mode × body) it opens /dev/mode/<mode>?body=…&height=…&build=… (playerIdentity's dev override), wakes the
// mode, drives a few seconds of keyboard input, and samples every ACTIVE body (a skeleton playing anything but an idle):
//   foot     the lower ankle's height over that body's own floor (root y) — p50 must sit near the floor
//   knees    the knee's offset along the body's front from the hip→ankle midline — never behind it (a backward knee)
//   head     head height over the floor at the first sample (does the height scale reach the rig)
//   arms     the hero's LocoBus arms verdict from __FEL_DEV__.anim()
//   BASE=http://127.0.0.1:3061 MODES=onevone BODIES=all OUT=… npx tsx scripts/probes/_body-matrix-probe.mts
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const OUT = process.env.OUT ?? `${process.env.HOME}/Claude/outbox/everyone-body-mocap/matrix`;
const MODES = (process.env.MODES ?? 'onevone,dunk,karate_vs,skateboard,tennis').split(',');
const ALL_BODIES = [
  'male-short-slim', 'male-short-heavy', 'male-tall-slim', 'male-tall-heavy',
  'female-short-slim', 'female-short-heavy', 'female-tall-slim', 'female-tall-heavy', 'scan',
];
const BODIES = process.env.BODIES && process.env.BODIES !== 'all' ? process.env.BODIES.split(',') : ALL_BODIES;
const SAMPLES = Number(process.env.SAMPLES ?? 24);
fs.mkdirSync(OUT, { recursive: true });

function query(body: string): string {
  if (body === 'scan') return '?body=scan';
  const [sex, h, b] = body.split('-');
  return `?body=${sex}&height=${h === 'short' ? 90 : 110}&build=${b === 'slim' ? 90 : 112}&reach=100`;
}

async function drive(page: Page, k: number): Promise<void> {
  const script = ['ArrowUp', 'ArrowUp', 'ArrowLeft', 'Space', 'ArrowRight', 'ArrowDown'];
  const key = script[k % script.length];
  if (key === 'Space') { await page.keyboard.press('Space'); return; }
  await page.keyboard.down(key); await page.waitForTimeout(350); await page.keyboard.up(key);
}

type Sample = { bodies: { name: string; hero: boolean; clips: string[]; foot: number; footAbs: number; kneeBack: number; head: number }[]; arms: string | null; heroClip: string | null };

const rows: Record<string, unknown>[] = [];
const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--use-angle=metal', '--ignore-gpu-blocklist'] });
for (const mode of MODES) for (const body of BODIES) {
  const tag = `${mode}__${body}`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript('globalThis.__name = (f) => f;');
  const page = await ctx.newPage();
  const glbs = new Set<string>(); const errors: string[] = [];
  page.on('request', (r) => { const u = r.url(); if (/\.glb(\?|$)/.test(u)) glbs.add(new URL(u).pathname); });
  page.on('console', (m) => { if (m.type() === 'error' && !/401|favicon|404/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 160)));
  try {
    await page.goto(`${BASE}/dev/mode/${mode}${query(body)}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    const ok = await page.waitForFunction(() => ['loaded', 'playing'].includes(document.getElementById('fel-ready')?.dataset.state ?? ''), undefined, { timeout: 180000 }).then(() => true).catch(() => false);
    if (!ok) { rows.push({ mode, body, error: 'never loaded' }); await page.screenshot({ path: `${OUT}/${tag}-noload.png` }); await ctx.close(); continue; }
    const start = page.getByRole('button', { name: /^START$/ });
    if (await start.count()) await start.first().click();
    await page.mouse.click(640, 400);
    const samples: Sample[] = [];
    for (let k = 0; k < SAMPLES; k++) {
      await drive(page, k);
      await page.waitForTimeout(150);
      samples.push(await page.evaluate(() => {
        const dev = (window as any).__FEL_DEV__; const scene = dev?.scene; if (!scene) return { bodies: [], arms: null, heroClip: null };
        const heroRoot = dev.hero?.();
        const heroNodes = new Set(heroRoot ? heroRoot.getDescendants(false) : []);
        const find = (sk: any, n: string) => sk.bones.find((b: any) => b.name === n || b.name.endsWith(`:${n}`) || b.name.replace(/_c\d+$/, '') === n)?.getTransformNode();
        const P = (t: any) => { t.computeWorldMatrix(true); const p = t.getAbsolutePosition(); return [p.x, p.y, p.z]; };
        const seen = new Set<any>();
        const bodies: Sample['bodies'] = [];
        for (const sk of scene.skeletons) {
          const hips = find(sk, 'Hips'); if (!hips) continue;
          let root = hips; while (root.parent) root = root.parent;
          if (seen.has(root)) continue; seen.add(root);
          const nodes = new Set(sk.bones.map((b: any) => b.getTransformNode()).filter(Boolean));
          const clips = scene.animationGroups.filter((g: any) => g.isPlaying && g.targetedAnimations.some((t: any) => nodes.has(t.target))).map((g: any) => g.name);
          const hero = heroNodes.has(hips);
          if (!hero && clips.every((c: string) => /^idle/.test(c))) continue;   // the crowd
          const J = (n: string) => { const t = find(sk, n); return t ? P(t) : null; };
          const lf = J('LeftFoot'), rf = J('RightFoot'), head = J('Head');
          const floor = P(root)[1];
          const fwdM = root.computeWorldMatrix(true).m; const fwd = [fwdM[8], 0, fwdM[10]]; const fl = Math.hypot(fwd[0], fwd[2]) || 1;
          let kneeBack = 0;
          for (const side of ['Left', 'Right']) {
            const h = J(`${side}UpLeg`), k = J(`${side}Leg`), a = J(`${side}Foot`); if (!h || !k || !a) continue;
            const mid = [(h[0] + a[0]) / 2, (h[1] + a[1]) / 2, (h[2] + a[2]) / 2];
            const off = ((k[0] - mid[0]) * fwd[0] + (k[2] - mid[2]) * fwd[2]) / fl;
            kneeBack = Math.min(kneeBack, off);
          }
          bodies.push({ name: root.name, hero, clips, foot: lf && rf ? Math.min(lf[1], rf[1]) - floor : NaN, footAbs: lf && rf ? Math.min(lf[1], rf[1]) : NaN, kneeBack, head: head ? head[1] - floor : NaN });
        }
        const a = dev.anim?.()?.hero;
        return { bodies, arms: a?.arms ? JSON.stringify(a.arms).slice(0, 120) : null, heroClip: a?.playing?.[a.playing.length - 1]?.clip ?? null };
      }));
      if (k === Math.floor(SAMPLES / 2)) await page.screenshot({ path: `${OUT}/${tag}.png` });
    }
    const pct = (xs: number[], q: number) => { const s = xs.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * q))].toFixed(3) : null; };
    const hero = samples.flatMap((s) => s.bodies.filter((b) => b.hero));
    const opp = samples.flatMap((s) => s.bodies.filter((b) => !b.hero));
    const armsFails = samples.filter((s) => s.arms && /"ok":false|fail/i.test(s.arms)).length;
    const row = {
      mode, body,
      bodyFiles: [...glbs].filter((u) => /models\/(elijah|candidates|athletes)/.test(u)),
      hero: { n: hero.length, footP50: pct(hero.map((b) => b.foot), 0.5), footAbsP50: pct(hero.map((b) => b.footAbs), 0.5), footP10: pct(hero.map((b) => b.foot), 0.1), kneeBackMin: pct(hero.map((b) => b.kneeBack), 0), head: pct(hero.map((b) => b.head), 0.9), clips: [...new Set(hero.flatMap((b) => b.clips))].slice(0, 12) },
      opponents: { n: opp.length, footP50: pct(opp.map((b) => b.foot), 0.5), footAbsP50: pct(opp.map((b) => b.footAbs), 0.5), kneeBackMin: pct(opp.map((b) => b.kneeBack), 0), captures: [...new Set(opp.flatMap((b) => b.clips).filter((c) => c.includes('_mc_')))] },
      armsFails, samples: samples.length, errors: errors.slice(0, 4),
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  } catch (e) {
    rows.push({ mode, body, error: (e as Error).message.slice(0, 200) });
    console.log(JSON.stringify({ mode, body, error: (e as Error).message.slice(0, 200) }));
  }
  await ctx.close();
}
fs.writeFileSync(`${OUT}/matrix${process.env.TAG ? '-' + process.env.TAG : ''}.json`, JSON.stringify(rows, null, 1));
await browser.close();
