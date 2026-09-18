// _snow-crawl — why does the snowboard crawl? Position, clip and HUD news at 5 Hz under a few stick holds.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal'] });
const ctx = await b.newContext({ viewport: { width: 1000, height: 640 } });
await ctx.addInitScript({ content: `window.__name = window.__name || function (f) { return f; };
  (() => { const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0,0,0,0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    window.__PAD = pad; navigator.getGamepads = () => [pad, null, null, null]; })();` });
const p = await ctx.newPage();
p.on('console', (m) => { const t = m.text(); if (/ROCK|YETI|SNOW|FEL-SPAWN|error/i.test(t)) console.log('  [console]', t.slice(0, 160)); });
await p.goto(`${BASE}/dev/mode/snowboard_slalom?agent=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
const t0 = Date.now();
while (Date.now() - t0 < 240000) { const s = await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (s === 'loaded') break; await p.waitForTimeout(500); }
await p.waitForTimeout(1500); await p.keyboard.press('Space');
const plan = (process.env.PLAN ?? 'neutral:8,fwd:8,tuck:8').split(',').map((s) => s.split(':')) as [string, string][];
for (const [what, sec] of plan) {
  const rows = await p.evaluate(async ([what, sec]) => {
    const W = window as any; const pad = W.__PAD; const out: string[] = [];
    pad.axes[1] = what === 'fwd' ? -1 : what === 'back' ? 1 : 0; pad.buttons[7].value = what === 'tuck' ? 1 : 0; pad.buttons[7].pressed = what === 'tuck';
    let last: any = null; const t0 = performance.now();
    while (performance.now() - t0 < Number(sec) * 1000) {
      pad.timestamp = performance.now();
      await new Promise((r) => setTimeout(r, 200));
      const h = W.__FEL_DEV__?.hero?.(); if (!h) continue; const P = h.position;
      const spd = last ? Math.hypot(P.x - last.x, P.z - last.z) / 0.2 : 0; last = { x: P.x, z: P.z };
      const hud = W.__FEL_QA__?.hud?.() ?? {}; const a = W.__FEL_DEV__?.anim?.()?.hero?.playing?.map((c: any) => c.clip).join('+');
      out.push(`${what} ${((performance.now() - t0) / 1000).toFixed(1)}s z${P.z.toFixed(1)} x${P.x.toFixed(1)} y${P.y.toFixed(1)} v${spd.toFixed(1)} ${a} ${hud.banner ?? ''}`);
    }
    return out;
  }, [what, sec]);
  console.log(rows.filter((_, i) => i % 3 === 0).join('\n'));
}
await b.close();
