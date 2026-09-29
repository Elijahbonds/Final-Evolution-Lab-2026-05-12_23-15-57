// _walkout-loop-eye-p7 — MUSIC-SUITE P7 (2026-09-29): proves the walk-out's loop render in a REAL browser Web Audio
// context, not fakeWebAudio.ts's schedule-only stand-in (AudioEngine.baseline.test.ts's own header explains why that
// fake cannot render real PCM). No dev server involved: lib/babylon/music/loopRender.ts is esbuild-bundled straight
// from its shipped source (no reimplementation) and run on a blank page.
//
// Two things this checks that the node vitest suite (loopRender.test.ts) cannot, because it has no real AudioContext:
//   1. tailWrapLoop, fed REAL Float32Array data out of a REAL OfflineAudioContext render (getChannelData()), still
//      produces an exact-length, seam-matched loop — not just on hand-built Node arrays.
//   2. renderWalkOutLoopBuffer (the full adapter: buildMixGraph + SynthKit.synthesizeKit + OfflineAudioContext +
//      tailWrapLoop) runs end-to-end without throwing, on a real browser's Web Audio implementation, and the loop it
//      hands back still meets the same seam bar after going through mixGraph's own room/slap sends.
// Self-bundling: esbuild's JS API packages the SHIPPED loopRender.ts straight off disk (no reimplementation, no
// separately-checked-in bundle to go stale) into one IIFE, run on a blank page below.
import * as esbuild from 'esbuild';
import { chromium } from 'playwright-core';
import { chromiumExe } from './probes/_chromium.mts';
import { writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const ENTRY = `
  import { WALKOUT_LOOP_BARS, LOOP_TAIL_SEC, loopSamplesFor, tailWrapLoop, renderWalkOutLoopBuffer } from ${JSON.stringify(`${ROOT}/lib/babylon/music/loopRender.ts`)};
  window.__LOOP_RENDER_PROBE__ = { WALKOUT_LOOP_BARS, LOOP_TAIL_SEC, loopSamplesFor, tailWrapLoop, renderWalkOutLoopBuffer };
`;
const built = await esbuild.build({
  stdin: { contents: ENTRY, resolveDir: ROOT, loader: 'ts' },
  bundle: true, format: 'iife', platform: 'browser', target: 'es2022',
  write: false, absWorkingDir: ROOT, alias: { '@': ROOT },
});
const bundle = built.outputFiles[0].text;
const OUT_DIR = process.env.WALKOUT_PROOF_DIR ?? ROOT;

const browser = await chromium.launch({
  executablePath: chromiumExe(),
  headless: true,
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setContent('<!doctype html><title>walkout-loop-proof</title>');
await page.addScriptTag({ content: bundle });

const result = await page.evaluate(async () => {
  const api = (window as unknown as { __LOOP_RENDER_PROBE__: {
    WALKOUT_LOOP_BARS: number; LOOP_TAIL_SEC: number;
    loopSamplesFor: (bars: number, bpm: number, sr: number, steps?: number) => number;
    tailWrapLoop: (channels: Float32Array[], sr: number, loopSamples: number) => Float32Array[];
    renderWalkOutLoopBuffer: (input: unknown, opts?: { sampleRate?: number }) => Promise<{ buffer: AudioBuffer; bars: number; loopSec: number }>;
  } }).__LOOP_RENDER_PROBE__;

  const out: Record<string, unknown> = {};

  // ── 1. tailWrapLoop on REAL OfflineAudioContext output ──────────────────────────────────────────────────────────
  {
    const sr = 44100;
    const bpm = 128;
    const bars = 8;
    const loopSamples = api.loopSamplesFor(bars, bpm, sr);
    const loopSec = loopSamples / sr;
    const tailSec = 1.2;
    const offline = new OfflineAudioContext(2, Math.ceil(sr * (loopSec + tailSec)), sr);
    // a tone that does NOT complete a whole number of cycles over the loop (guarantees a raw click without the fix),
    // plus a real exponential-decay envelope carried PAST the loop point — the reverb-tail case tailWrapLoop exists for
    const osc = offline.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 233;   // 233 Hz: loopSec * 233 is nowhere near an integer
    const env = offline.createGain();
    env.gain.setValueAtTime(0.7, 0);
    env.gain.setValueAtTime(0.7, loopSec - 0.05);
    env.gain.exponentialRampToValueAtTime(0.0005, loopSec + 0.6);   // rings on for 0.6 s past the loop point
    osc.connect(env).connect(offline.destination);
    osc.start(0); osc.stop(loopSec + tailSec);
    const rendered = await offline.startRendering();
    const channels = [rendered.getChannelData(0).slice(), rendered.getChannelData(1).slice()];
    const rawSeam = Math.abs(channels[0][0] - channels[0][loopSamples - 1]);
    const wrapped = api.tailWrapLoop(channels, sr, loopSamples);
    const fixedSeam = Math.abs(wrapped[0][0] - wrapped[0][loopSamples - 1]);
    out.pureOnRealAudioContext = {
      loopSamples, exactLength: wrapped[0].length === loopSamples && wrapped[1].length === loopSamples,
      rawSeamDelta: rawSeam, fixedSeamDelta: fixedSeam, improvedBy: rawSeam > 0 ? rawSeam / Math.max(fixedSeam, 1e-12) : null,
      // the wrapped tail's own energy should have landed on the start: louder there than the dry tone alone would be
      startEnergyAboveDry: Math.abs(wrapped[0][100]) >= Math.abs(channels[0][100]) - 1e-9,
    };
  }

  // ── 2. the full adapter, end to end, through the real desk (mixGraph via buildMixGraph inside it) ────────────────
  {
    const steps = 16;
    const bpm = 120;
    const bars = 2;   // short, for a fast probe — the algorithm's bar-count independence is loopRender.test.ts's job
    const kick = { sampleId: 'kick', volume: 1, muted: false, pan: 0, pattern: Array.from({ length: steps }, (_, i) => i % 4 === 0) };
    const t0 = performance.now();
    const { buffer, bars: gotBars, loopSec } = await api.renderWalkOutLoopBuffer(
      { tracks: [kick], kit: 'street', bpm, swing: 0, steps, bars },
      { sampleRate: 44100 },
    );
    const ms = performance.now() - t0;
    const expectedSamples = api.loopSamplesFor(bars, bpm, buffer.sampleRate, steps);
    const ch0 = buffer.getChannelData(0);
    const seam = Math.abs(ch0[0] - ch0[buffer.length - 1]);
    out.fullAdapter = {
      ranWithoutThrowing: true, ms, gotBars, loopSec,
      lengthExact: buffer.length === expectedSamples, length: buffer.length, expectedSamples,
      numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate,
      seamDelta: seam, seamBelowThreshold: seam < 1e-4,
      // a real kick was actually placed and rendered — not a silent buffer
      hasAudibleContent: Math.max(...Array.from(ch0.slice(0, 4000)).map(Math.abs)) > 0.01,
    };
  }

  return out;
});

writeFileSync(`${OUT_DIR}/walkout-loop-proof.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
