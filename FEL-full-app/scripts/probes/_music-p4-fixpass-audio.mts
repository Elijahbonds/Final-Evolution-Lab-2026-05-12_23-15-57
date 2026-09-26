// MUSIC-SUITE P4 FIX PASS (2026-09-25) — the desk's two audio findings, measured in headless Chromium's real Web Audio (an
// OfflineAudioContext, so the numbers are sample-exact and need no speakers). The SHIPPED lib/babylon/music/mixGraph.ts
// is bundled (esbuild) into a blank page, and the graph under test is the one buildMixGraph builds.
//   1. THE CLICKS LAND WITH THE MUSIC. A DynamicsCompressorNode delays its output by a fixed look-ahead (the review measured
//      5.99 ms for the LIMITER settings); the clicks went click → ceiling, 6 ms (12 with MASTER) AHEAD of every beat. An
//      impulse into a row's strip and an impulse into the metronome's input at the same scheduled time must now come out
//      within 1 frame of each other, MASTER off and on. The old path (click → ceiling) is measured beside it for the record.
//   2. ONE PAN LAW. A mono hit panned by the strip's panner alone keeps its power at every position; the P4 chain (a per-hit
//      StereoPanner at 0 up-mixing it to stereo, then the strip's panner acting as a BALANCE) gained +3 dB at ±1.
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p4-fixpass-audio.mts   (OUT env override)
import { chromium } from 'playwright-core';
import { buildSync } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from './_chromium.mts';

const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p4/fixes/audio';
fs.mkdirSync(OUT, { recursive: true });
const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { at: new Date().toISOString(), checks: [] as Any[], numbers: {} };
const check = (name: string, pass: boolean, got: unknown, want: unknown) => { R.checks.push({ name, pass, got, want }); console.log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(got)); };

async function main(): Promise<void> {
  const bundle = buildSync({
    entryPoints: [path.join(APP, 'lib/babylon/music/mixGraph.ts')], bundle: true, write: false, format: 'iife', globalName: 'FELMix', platform: 'browser', target: 'es2020',
  }).outputFiles[0].text;
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ARGS, headless: true });
  const page = await browser.newPage();
  await page.setContent('<html><body>mix</body></html>');
  await page.addScriptTag({ content: bundle });
  await page.evaluate('window.__name = (f) => f');   // tsx keeps function names with a __name helper the page lacks

  // 1. onset of an impulse through a row's strip vs through the metronome input, MASTER off / on; and the old click path
  const latency: Any = await page.evaluate(async () => {
    const M = (window as Any).FELMix;
    const SR = 44100, AT = 0.1;
    const onset = async (polish: boolean, into: 'strip' | 'click' | 'oldClick'): Promise<number> => {
      const ctx = new OfflineAudioContext(2, Math.round(SR * 0.4), SR);
      const g = M.buildMixGraph(ctx, { polish });
      const buf = ctx.createBuffer(1, 1, SR); buf.getChannelData(0)[0] = 0.5;
      const src = ctx.createBufferSource(); src.buffer = buf;
      if (into === 'strip') src.connect(g.channel('kick').input);
      else if (into === 'click') src.connect(g.click);
      else src.connect(g.ceiling);   // P4 as shipped: click → the ceiling, past the limiter
      src.start(AT);
      const out = (await ctx.startRendering()).getChannelData(0);
      let peak = 0, at = -1;
      for (let i = 0; i < out.length; i++) if (Math.abs(out[i]) > peak) { peak = Math.abs(out[i]); at = i; }
      return at;
    };
    const res: Any = {};
    for (const polish of [false, true]) {
      const strip = await onset(polish, 'strip'), click = await onset(polish, 'click'), old = await onset(polish, 'oldClick');
      res[polish ? 'masterOn' : 'masterOff'] = {
        scheduledFrame: Math.round(0.1 * SR), stripFrame: strip, clickFrame: click, oldClickFrame: old,
        stripLateMs: +(((strip - 0.1 * SR) / SR) * 1000).toFixed(3), clickMinusStripFrames: click - strip, oldClickAheadMs: +(((strip - old) / SR) * 1000).toFixed(3),
        graphLatencyMs: +(M.graphLatencySec(polish) * 1000).toFixed(3),
      };
    }
    return res;
  });
  R.numbers.latency = latency;
  for (const k of ['masterOff', 'masterOn'] as const) {
    const l = latency[k];
    check(`the click lands with the hit (MASTER ${k === 'masterOn' ? 'ON' : 'OFF'}): within 1 frame; the desk's delay is what graphLatencySec says (±0.1 ms)`,
      Math.abs(l.clickMinusStripFrames) <= 1 && Math.abs(l.stripLateMs - l.graphLatencyMs) <= 0.1, l, '|click − hit| ≤ 1 frame');
    check(`for the record: the old click path (→ the ceiling) was ahead of the hit by the desk's delay (MASTER ${k === 'masterOn' ? 'ON' : 'OFF'})`,
      Math.abs(l.oldClickAheadMs - l.graphLatencyMs) <= 0.1, l.oldClickAheadMs, `${l.graphLatencyMs} ms`);
  }

  // 2. the pan law: the power of a mono tone at PAN −1 / −0.5 / 0 / +0.5 / +1, relative to centre
  const pan: Any = await page.evaluate(async () => {
    const M = (window as Any).FELMix;
    const SR = 44100;
    const power = async (panValue: number, perHitPanner: boolean): Promise<number> => {
      const ctx = new OfflineAudioContext(2, SR, SR);
      const g = M.buildMixGraph(ctx, { mixer: { master: 1, channels: { kick: { pan: panValue } } } });
      const buf = ctx.createBuffer(1, SR, SR);
      const d = buf.getChannelData(0);
      for (let i = 0; i < SR; i++) d[i] = 0.1 * Math.sin((2 * Math.PI * 220 * i) / SR);   // quiet: under the limiter
      const src = ctx.createBufferSource(); src.buffer = buf;
      const gain = ctx.createGain(); gain.gain.value = 0.8;
      let node: AudioNode = src.connect(gain);
      if (perHitPanner) { const p = ctx.createStereoPanner(); p.pan.value = 0; node = node.connect(p); }   // P4 as shipped
      node.connect(g.channel('kick').input);
      src.start(0);
      const r = await ctx.startRendering();
      let e = 0;
      for (let ch = 0; ch < 2; ch++) { const x = r.getChannelData(ch); for (let i = 4410; i < 39690; i++) e += x[i] * x[i]; }
      return e;
    };
    const out: Any = { now: {}, old: {} };
    for (const which of ['now', 'old'] as const) {
      const centre = await power(0, which === 'old');
      for (const pv of [-1, -0.5, 0.5, 1]) out[which][String(pv)] = +(10 * Math.log10((await power(pv, which === 'old')) / centre)).toFixed(2);
    }
    return out;
  });
  R.numbers.panLawDbVsCentre = pan;
  check('one pan law: a mono hit panned by the strip keeps its power at every position (±0.05 dB)', Object.values(pan.now).every((v: Any) => Math.abs(v) <= 0.05), pan.now, '0 dB');
  check('for the record: the P4 chain (per-hit panner → strip panner) gained power off centre (the review: +3.01 dB at ±1)', pan.old['1'] > 2.5 && pan.old['-1'] > 2.5, pan.old, '≈ +3 dB at ±1');

  await browser.close();
}

main().catch((e) => { R.fatal = String(e?.stack ?? e); console.log('FATAL', e); }).finally(() => {
  R.passed = R.checks.filter((c: Any) => c.pass).length; R.total = R.checks.length;
  fs.writeFileSync(`${OUT}/fixpass-audio.json`, JSON.stringify(R, null, 2));
  console.log(`${R.passed}/${R.total} checks passed → ${OUT}/fixpass-audio.json`);
  process.exit(0);
});
