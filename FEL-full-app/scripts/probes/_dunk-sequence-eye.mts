// DUNK-VISUAL-POLISH item 4 — the dunk SEQUENCE, frame by frame. Runs one dunk on a pad and grabs a strip of frames
// across takeoff → rise → hang → CONTACT → land → settle, plus the clip and arm-abduction reading on each of them, so
// a T-pose flash or a floaty hold can be pointed at instead of argued about.
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://localhost:3004';
const OUT = process.env.OUT ?? '/tmp/dunk-sequence';
fs.mkdirSync(OUT, { recursive: true });

async function pad(page: Page) {
  await page.evaluate(() => {
    const p: any = {
      index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard',
      axes: [0, 0, 0, 0], timestamp: Date.now(),
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    (window as any).__PAD = p;
    (navigator as any).getGamepads = () => [p];
    const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: p });
    window.dispatchEvent(ev);
  });
}
async function stick(page: Page, x: number, y: number) {
  await page.evaluate(([x, y]) => { const p = (window as any).__PAD; if (!p) return; p.axes[0] = x; p.axes[1] = y; p.timestamp = Date.now(); }, [x, y] as [number, number]);
}

/** Install an in-page recorder: one sample per RENDERED frame — the played clip, the hero's height, the ball, and each
 *  arm's abduction from the torso. Screenshots are far too slow to catch a 0.7 s flight; numbers are not. */
async function installRecorder(page: Page) {
  await page.evaluate(() => {
    const dev: any = (window as any).__FEL_DEV__;
    const scene: any = dev?.scene;
    if (!scene) return;
    const rec: any[] = []; (window as any).__REC = rec;
    const t0 = performance.now();
    scene.onAfterRenderObservable.add(() => {
      const hero: any = dev.hero?.();
      if (!hero) return;
      let sk: any = null;
      const stack: any[] = [hero];
      while (stack.length && !sk) {
        const n = stack.pop();
        if (n.skeleton) { sk = n.skeleton; break; }
        for (const c of n.getChildren ? n.getChildren() : []) stack.push(c);
      }
      const row: any = {
        t: Math.round(performance.now() - t0),
        y: +hero.position.y.toFixed(3), z: +hero.position.z.toFixed(2),
        clips: (scene.animationGroups ?? []).filter((g: any) => g.isPlaying && g.targetedAnimations?.some?.((ta: any) => {
          let p = ta.target; for (let i = 0; i < 12 && p; i++) { if (p === hero) return true; p = p.parent; } return false;
        })).map((g: any) => g.name),
      };
      if (sk) {
        for (const side of ['Left', 'Right']) {
          const arm = sk.bones.find((b: any) => b.name.indexOf(side + 'Arm') === 0 && b.name.indexOf('Fore') < 0);
          const fore = sk.bones.find((b: any) => b.name.indexOf(side + 'ForeArm') === 0);
          if (!arm || !fore) continue;
          const a = arm.getTransformNode ? arm.getTransformNode() : null;
          const f = fore.getTransformNode ? fore.getTransformNode() : null;
          if (!a || !f) continue;
          const pa = a.getAbsolutePosition(), pf = f.getAbsolutePosition();
          const dx = pf.x - pa.x, dy = pf.y - pa.y, dz = pf.z - pa.z;
          const len = Math.hypot(dx, dy, dz) || 1;
          // 0 deg = arm down the side, 90 = a T, 180 = straight overhead
          row[side[0] + 'abd'] = Math.round(Math.acos(Math.max(-1, Math.min(1, -dy / len))) * 180 / Math.PI);
          row[side[0] + 'hy'] = +pf.y.toFixed(2);
        }
      }
      rec.push(row);
      if (rec.length > 4000) rec.shift();
    });
  });
}

async function main() {
  const browser = await chromium.launch({
    headless: true, executablePath: chromiumExe(),
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  const p = await ctx.newPage();
  const log: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (/DUNK-|HANDS|JUICE|MISSING/i.test(t)) log.push(t.slice(0, 200)); });

  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(700);
  if (/\/login/.test(p.url())) {
    await p.fill('input[type="email"]', 'playtest@fel.local');
    await p.fill('input[type="password"]', 'playtest-local-only');
    await p.click('button[type="submit"]'); await p.waitForTimeout(2400);
  }
  await p.goto(`${BASE}/play/dunk?arena=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForSelector('canvas', { timeout: 180000 });
  await p.waitForFunction(() => /TAP TO START|FLIGHT NIGHT/i.test(document.body.innerText), { timeout: 180000 });
  await p.waitForTimeout(900);
  await pad(p);
  const start = p.getByRole('button', { name: /TAP TO START/i });
  if (await start.count()) await start.click({ force: true }).catch(() => {});
  for (let i = 0; i < 6; i++) {
    const t = await p.evaluate(() => document.body.innerText);
    if (!/TAP TO START/i.test(t)) break;
    await p.keyboard.press('Enter'); await p.mouse.click(500, 380); await p.waitForTimeout(400);
  }
  await pad(p);
  await installRecorder(p);
  // the 3-2-1 owns the first seconds — a stick pushed into it is swallowed (measured: the hero never left z −1.2)
  await p.waitForFunction(() => /HOLD to run/i.test(document.body.innerText), { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2500);

  // Run to the rim, then the trick + the slam. The presses are SCHEDULED IN-PAGE: a screenshot costs ~180 ms on this
  // viewport and the whole flight is ~1.4 s, so driving the pad from node between screenshots lands the slam late
  // every time (measured: the cue fired at 1.13 s against a 0.30–1.00 window — a clank, not a dunk).
  await p.evaluate(() => {
    const pd: any = (window as any).__PAD;
    // (no helper function here on purpose: the probe bundler wraps named arrows in a __name shim that does not exist
    //  inside page.evaluate — every one of these presses is written out)
    pd.axes[1] = -1; pd.buttons[7].pressed = true; pd.buttons[7].value = 1; pd.timestamp = Date.now();
    setTimeout(() => { pd.buttons[7].pressed = false; pd.buttons[7].value = 0; pd.timestamp = Date.now(); }, 1750);   // release: the plant
    setTimeout(() => { pd.buttons[12].pressed = true; pd.buttons[12].value = 1; pd.timestamp = Date.now(); }, 1980);  // d-pad up …
    setTimeout(() => { pd.buttons[0].pressed = true; pd.buttons[0].value = 1; pd.timestamp = Date.now(); }, 2020);    // … + A = the windmill
    setTimeout(() => { pd.buttons[0].pressed = false; pd.buttons[0].value = 0; pd.buttons[12].pressed = false; pd.buttons[12].value = 0; pd.timestamp = Date.now(); }, 2120);
    setTimeout(() => { pd.buttons[0].pressed = true; pd.buttons[0].value = 1; pd.timestamp = Date.now(); }, 2320);    // the SLAM, held for the rim hang
    setTimeout(() => { pd.buttons[0].pressed = false; pd.buttons[0].value = 0; pd.timestamp = Date.now(); }, 2900);
  });

  const frames: string[] = [];
  for (let i = 0; i < 12; i++) {
    const name = `f${String(i).padStart(2, '0')}`;
    await p.screenshot({ path: `${OUT}/${name}.png` });
    frames.push(name);
  }
  await p.waitForTimeout(2200);
  await stick(p, 0, 0);
  const rec = await p.evaluate(() => (window as any).__REC ?? []);
  fs.writeFileSync(`${OUT}/frames.json`, JSON.stringify({ rec, log }, null, 1));
  // print the flight: from the first frame off the floor to 0.6 s after touchdown
  const air = rec.map((r: any, i: number) => ({ ...r, i })).filter((r: any) => r.y > 0.02);
  const a0 = air.length ? air[0].i : 0, a1 = air.length ? air[air.length - 1].i : rec.length - 1;
  console.log(`recorded ${rec.length} frames; airborne ${a0}..${a1} (${air.length} frames)`);
  for (let i = Math.max(0, a0 - 6); i < Math.min(rec.length, a1 + 26); i++) {
    const r = rec[i];
    console.log(`${String(i).padStart(4)} t=${String(r.t).padStart(5)} y=${String(r.y).padStart(6)} z=${String(r.z).padStart(7)} L=${String(r.Labd ?? '-').padStart(4)} R=${String(r.Rabd ?? '-').padStart(4)} handY L${r.Lhy ?? '-'} R${r.Rhy ?? '-'} [${(r.clips ?? []).join(',')}]`);
  }
  void frames;
  console.log('---'); for (const l of log) console.log(' ', l);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
