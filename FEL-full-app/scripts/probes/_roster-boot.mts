// EVERY MODE, BOOTED (Phase 0). Loads / crashes, 3D or not, measured FPS after settle, draw calls, meshes,
// skeletons, console errors. This is the half of the baseline that cannot be read out of the source.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const r = process.env.HOME + '/Library/Caches/ms-playwright';
const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
const EXE = `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const MODES = (process.env.MODES ?? '').split(',').filter(Boolean);
const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal'] });
const out: Record<string, unknown>[] = [];
for (const key of MODES) {
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs: string[] = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  // /api/profile 401s on every unauthenticated dev route — expected, and not a mode defect
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/401|Unauthorized/.test(t)) errs.push(t.slice(0, 120)); });
  await p.addInitScript(`(() => {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    window.__FEL_AUDIO_STATE__ = 'none';
    const Orig = C;
    window.AudioContext = function (...a) {
      const c = new Orig(...a);
      window.__FEL_AUDIO_STATE__ = 'ctx';
      const osc = c.createOscillator.bind(c), buf = c.createBufferSource.bind(c);
      c.createOscillator = () => { window.__FEL_AUDIO_STATE__ = 'playing'; return osc(); };
      c.createBufferSource = () => { window.__FEL_AUDIO_STATE__ = 'playing'; return buf(); };
      return c;
    };
    window.AudioContext.prototype = Orig.prototype;
  })()`);
  const row: Record<string, unknown> = { mode: key };
  try {
    await p.goto(`http://localhost:3061/dev/mode/${key}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('canvas', { timeout: 90000 });
    await p.waitForTimeout(9000);
    const s0 = p.locator('text=/^START$/').first();
    if (await s0.count()) { await s0.click(); }
    // 5 s was not enough: the party modes spawn their contestants AFTER a pick screen resolves, and a
    // measurement taken too early recorded "0 skeletons" for a mode that spawns one at t+8 s.
    await p.waitForTimeout(11000);                      // settle, then measure
    Object.assign(row, await p.evaluate(`(() => {
      const s = window.__FEL_DEV__ && window.__FEL_DEV__.scene;
      if (!s) return { loads: 'NO SCENE' };
      const e = s.getEngine();
      return {
        loads: 'y', fps: Math.round(e.getFps()), draws: e.drawCalls ?? -1,
        meshes: s.meshes.filter((m) => m.isEnabled() && m.isVisible).length,
        skeletons: s.skeletons.length,
        clips: s.animationGroups.filter((g) => g.isPlaying).length,
        // SoundKit is raw WebAudio (AudioContext + oscillators), NOT Babylon Sound — counting soundTracks
        // read 0 on every mode and would have recorded a silent roster that is not silent.
        audio: (window.__FEL_AUDIO_STATE__ || 'unknown'),
      };
    })()`) as object);
  } catch (e) { row.loads = 'FAIL: ' + String(e).slice(0, 70); }
  row.errs = errs.length; row.err1 = errs[0] ?? '';
  out.push(row);
  console.log(JSON.stringify(row));
  await p.close();
}
fs.writeFileSync('./shots/roster-boot.json', JSON.stringify(out, null, 1));
await b.close();
