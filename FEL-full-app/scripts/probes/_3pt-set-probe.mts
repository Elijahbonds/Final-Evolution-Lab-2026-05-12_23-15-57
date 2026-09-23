// 3PT SET probe (HOOPS-DEPTH S2, 2026-09-23): what the shooter's body is doing WHILE THE BAR SWEEPS.
//
// The body smoke never starts the shootout (speed 0, idle_stand on every frame in every run) and the rim probe filters the
// console to [3PT-RIM], so neither can see a SET. This plays the shootout on the dev harness, samples the top clip on the
// rig every 100 ms while the HUD's meter is live (the 'shoot' phase), fires A every few seconds, and counts the [3PT-SET]
// lines. Before the set: 100 % idle_stand while the bar sweeps. After: the pull-up gather, parked loaded.
//   PORT=3011 SEC=24 npx tsx scripts/probes/_3pt-set-probe.mts
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const PORT = process.env.PORT ?? '3011', SEC = Number(process.env.SEC ?? 24), FIRE_EVERY = Number(process.env.FIRE_EVERY ?? 4000);
const PAD_INIT = `(() => { const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) }; window.__PAD = pad; navigator.getGamepads = () => [pad]; })()`;
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(PAD_INIT);
  const p = await ctx.newPage();
  let sets = 0, fires = 0; const lines: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (/^\[3PT-SET\]/.test(t)) sets++; if (/^\[3PT-(RIM|JUICE)\]/.test(t)) lines.push(t.slice(0, 120)); });
  await p.goto(`http://127.0.0.1:${PORT}/dev/mode/threepoint`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForSelector('canvas', { timeout: 180000 });
  await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 240000 });
  await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 120000 });
  const tap = async (i: number, ms = 90) => { await p.evaluate(`(() => { const p = window.__PAD; p.buttons[${i}].pressed = true; p.buttons[${i}].value = 1; p.timestamp = performance.now(); })()`); await p.waitForTimeout(ms); await p.evaluate(`(() => { const p = window.__PAD; p.buttons[${i}].pressed = false; p.buttons[${i}].value = 0; p.timestamp = performance.now(); })()`); };
  await tap(0);
  await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  const tally: Record<string, number> = {}; let samples = 0, meterSamples = 0; const t0 = Date.now(); let lastFire = Date.now();
  while (Date.now() - t0 < SEC * 1000) {
    const s = (await p.evaluate(`(() => { const d = window.__FEL_DEV__; const a = typeof d.anim === 'function' ? d.anim() : (d.anim && d.anim.get ? d.anim.get() : null);
      let hud = {}; try { hud = JSON.parse(document.querySelector('pre').textContent || '{}'); } catch {}
      const h = a && a.hero; const top = h && h.playing && h.playing.length ? h.playing[h.playing.length - 1].clip : ''; return { top, meter: hud.meter ?? null }; })()`)) as { top: string; meter: number | null };
    samples++;
    if (s.meter !== null) { meterSamples++; tally[s.top || '(none)'] = (tally[s.top || '(none)'] ?? 0) + 1; }
    if (Date.now() - lastFire > FIRE_EVERY) { lastFire = Date.now(); fires++; await tap(0); }
    await p.waitForTimeout(100);
  }
  await b.close();
  const rows = Object.entries(tally).sort((a, c) => c[1] - a[1]).map(([k, v]) => `${k} ${v} (${Math.round(100 * v / Math.max(1, meterSamples))} %)`);
  console.log(`3PT SET probe · ${SEC} s · samples ${samples} · while the bar swept ${meterSamples} · fires ${fires} · [3PT-SET] lines ${sets}`);
  console.log(`top clip while the bar swept: ${rows.join(' · ')}`);
  console.log(lines.slice(0, 8).join('\n'));
})();
