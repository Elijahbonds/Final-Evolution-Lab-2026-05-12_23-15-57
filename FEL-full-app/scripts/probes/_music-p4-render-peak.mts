// MUSIC-SUITE P4 (2026-09-25) — THE RENDER PEAK, MEASURED IN A REAL BROWSER. The engine tests run on fakeWebAudio, which
// makes no sound, so "renders peak ≤ −0.3 dBFS" (PHASE-4 ENGINE CONTRACT (1)) is measured here: the SHIPPED engine
// (lib/babylon/music/AudioEngine.ts + mixGraph.ts + SynthKit.ts, bundled with esbuild as they are) renders in headless
// Chromium's real OfflineAudioContext, with the real DynamicsCompressor, and every rendered sample is read. The P3 engine
// (git HEAD's AudioEngine.ts / SynthKit.ts) renders the same patterns first, for the "before".
//
// Patterns: FULL = all eight kit rows on every step (the worst case the grid can make), BUSY = a dense real beat (four on
// the floor, snare + clap on 2 and 4, eighth hats, off-beat opens, a moving bass line, a lead riff, an FX riser), TONE =
// one quiet row playing a DETERMINISTIC 440 Hz tone (the kits' noise is Math.random, so a kit row cannot be compared
// between two syntheses): below the limiter, it must come out at its P3 level less only the safety margin. EXTREME (P4
// only: P3 had no mixer) = FULL with every fader and the master at 1.5 — past anything the grid alone can reach, the case
// the ceiling is there for. Each on STREET / NEON / DUST, MASTER off and on, at 92 and 160 BPM, 2 bars (what PUBLISH renders).
//
// Run: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p4-render-peak.mts [out.json]
// No dev server needed (about:blank). Writes JSON to the path given (default: the outbox p4 folder).
import { chromium } from 'playwright-core';
import { build, type Plugin } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromiumExe } from './_chromium.mts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = process.argv[2] ?? path.join(os.homedir(), 'Claude/outbox/finish-release/musicsuite/p4/render-peak.json');
const GIT = '/Library/Developer/CommandLineTools/usr/bin/git';

/** '@/x' → <root>/x (what tsconfig's paths say), for files bundled from outside the tree. */
const atAlias: Plugin = {
  name: 'at-alias',
  setup(b) {
    b.onResolve({ filter: /^@\// }, (a) => {
      const base = path.join(ROOT, a.path.slice(2));
      for (const ext of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(base + ext)) return { path: base + ext };
      return { path: base };
    });
  },
};

async function bundle(dir: string): Promise<string> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p4-entry-'));   // never a file in the app's tree (the dev server watches it)
  const entry = path.join(tmp, 'entry.ts');
  fs.writeFileSync(entry, `
    import { AudioEngine } from ${JSON.stringify(path.join(dir, 'AudioEngine'))};
    import { synthesizeKit, KIT_SLOTS } from ${JSON.stringify(path.join(dir, 'SynthKit'))};
    (window as unknown as Record<string, unknown>).__ENGINE = { AudioEngine, synthesizeKit, KIT_SLOTS };
  `);
  try {
    const r = await build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', plugins: [atAlias], logLevel: 'silent' });
    return r.outputFiles[0].text;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/** P3's engine: HEAD's files in a scratch folder (stepTime is unchanged since P2). */
function headTree(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p4-head-'));
  for (const f of ['AudioEngine.ts', 'SynthKit.ts', 'stepTime.ts']) {
    const src = execFileSync(GIT, ['show', `HEAD:FEL-full-app/lib/babylon/music/${f}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 });
    fs.writeFileSync(path.join(dir, f), src);
  }
  return dir;
}

type Pattern = 'FULL' | 'BUSY' | 'TONE' | 'EXTREME';
interface Case { pattern: Pattern; kit: 'street' | 'neon' | 'dust'; polish: boolean; bpm: number }
interface Result extends Case { engine: 'p3' | 'p4'; peak: number; peakDb: number; atCeiling: number; overMinus03: number; samples: number; skipped?: string }

/** Runs in the page: render every case on the engine in window.__ENGINE, read every sample. */
async function inPage(cases: Case[]): Promise<Omit<Result, 'engine'>[]> {
  const E = (window as unknown as { __ENGINE: { AudioEngine: new (s: unknown) => any; synthesizeKit: (k: string) => Promise<Map<string, AudioBuffer>>; KIT_SLOTS: { id: string; name: string; category: string }[] } }).__ENGINE;
  const CEIL = Math.pow(10, -0.3 / 20);
  // catch every rendered buffer (P3's renderMixdown returns only the WAV, which clamps at ±1)
  const proto = OfflineAudioContext.prototype as unknown as { startRendering: () => Promise<AudioBuffer> };
  const orig = proto.startRendering;
  let last: AudioBuffer | null = null;
  proto.startRendering = function (this: OfflineAudioContext) { return orig.call(this).then((b: AudioBuffer) => { if (this.length > 44100 * 0.8) last = b; return b; }); };
  const on = (f: (i: number) => boolean): boolean[] => Array.from({ length: 16 }, (_, i) => f(i));
  const pat = (p: Pattern, id: string): boolean[] => {
    if (p === 'FULL' || p === 'EXTREME') return on(() => true);
    if (p === 'TONE') return id === 'lead' ? on((i) => i % 2 === 0) : on(() => false);
    return on((i) => ({
      kick: i % 4 === 0, snare: i === 4 || i === 12, clap: i === 4 || i === 12, hat: i % 2 === 0, open: i % 4 === 2,
      bass: [0, 3, 6, 8, 10, 11, 14].includes(i), lead: [0, 2, 3, 7, 8, 11, 12, 15].includes(i), fx: i === 0,
    } as Record<string, boolean>)[id] ?? false);
  };
  const notes = (id: string): number[] | undefined => (id === 'bass' ? [33, 33, 36, 36, 40, 40, 43, 45, 33, 33, 36, 38, 40, 43, 45, 45] : id === 'lead' ? [69, 72, 76, 74, 72, 69, 67, 69, 72, 76, 79, 81, 79, 76, 74, 72] : undefined);
  const kits = new Map<string, Map<string, AudioBuffer>>();
  const out: Omit<Result, 'engine'>[] = [];
  for (const c of cases) {
    if (!kits.has(c.kit)) kits.set(c.kit, await E.synthesizeKit(c.kit));
    const tone = c.pattern === 'TONE';
    const tracks = E.KIT_SLOTS.map((k) => ({ sampleId: k.id, pattern: pat(c.pattern, k.id), volume: 0.8, muted: false, pan: 0, ...(notes(k.id) && !tone ? { notes: notes(k.id) } : {}) }));
    const eng = new E.AudioEngine({ bpm: c.bpm, steps: 16, tracks, swing: 0.15 });
    for (const k of E.KIT_SLOTS) eng.loadBuffer(k.id, k.name, kits.get(c.kit)!.get(k.id)!, k.category);
    if (tone) {   // a 0.3 s, 440 Hz, 0.5-amplitude tone with a 5 ms fade in and out: the same numbers on both engines
      const sr = 44100, n = Math.round(sr * 0.3), t = new AudioBuffer({ length: n, sampleRate: sr, numberOfChannels: 1 });
      const d = t.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr) * Math.min(1, i / 220, (n - i) / 220);
      eng.loadBuffer('lead', 'Tone', t, 'melody');
    }
    if (c.pattern === 'EXTREME') {
      if (typeof eng.setMixer !== 'function') { eng.dispose(); out.push({ ...c, peak: NaN, peakDb: NaN, atCeiling: 0, overMinus03: 0, samples: 0, skipped: 'no mixer in this engine' }); continue; }
      eng.setMixer({ master: 1.5, channels: Object.fromEntries(E.KIT_SLOTS.map((k) => [k.id, { gain: 1.5 }])) });
    }
    eng.masterPolish(c.polish);
    last = null;
    await eng.renderMixdown(2);
    const b = last as AudioBuffer | null;
    eng.dispose();
    if (!b) throw new Error('no render caught');
    let peak = 0, atCeiling = 0, over = 0;
    for (let ch = 0; ch < b.numberOfChannels; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; if (a >= CEIL - 1e-6) atCeiling++; if (a > CEIL + 1e-6) over++; }
    }
    out.push({ ...c, peak, peakDb: 20 * Math.log10(Math.max(peak, 1e-9)), atCeiling, overMinus03: over, samples: b.length * b.numberOfChannels });
  }
  proto.startRendering = orig;
  return out;
}

async function main(): Promise<void> {
  const cases: Case[] = [];
  for (const pattern of ['FULL', 'BUSY', 'TONE', 'EXTREME'] as Pattern[]) for (const kit of ['street', 'neon', 'dust'] as const) for (const polish of [false, true]) for (const bpm of [92, 160]) cases.push({ pattern, kit, polish, bpm });
  const head = headTree();
  const bundles = { p3: await bundle(head), p4: await bundle(path.join(ROOT, 'lib/babylon/music')) };
  fs.rmSync(head, { recursive: true, force: true });
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const results: Result[] = [];
  try {
    for (const engine of ['p3', 'p4'] as const) {
      const page = await browser.newPage();
      await page.goto('about:blank');
      await page.evaluate('globalThis.__name = (f) => f');   // tsx's keepNames helper, for the function evaluated below
      await page.addScriptTag({ content: bundles[engine] });
      const r = await page.evaluate(inPage, cases);
      results.push(...r.map((x) => ({ ...x, engine })));
      await page.close();
    }
  } finally { await browser.close(); }
  const worst = (e: 'p3' | 'p4', only?: Pattern[]) => results.filter((r) => r.engine === e && !r.skipped && (!only || only.includes(r.pattern))).reduce((m, r) => (r.peak > m.peak ? r : m));
  const tone = (e: 'p3' | 'p4') => results.filter((r) => r.engine === e && r.pattern === 'TONE');
  const toneDelta = tone('p4').map((r, i) => r.peakDb - tone('p3')[i].peakDb);
  const summary = {
    how: 'headless Chromium (playwright chromiumExe), real OfflineAudioContext; the shipped engine bundled by esbuild; renderMixdown(2) at swing 15 %; every sample of the rendered AudioBuffer read (before the WAV encoder); P3 = git HEAD AudioEngine.ts/SynthKit.ts',
    ceilingDbfs: -0.3,
    worstP3: { ...worst('p3'), note: 'P3 has no limiter: its WAV clamps every sample past ±1' },
    worstP4Grid: { ...worst('p4', ['FULL', 'BUSY', 'TONE']), note: 'the grid at its defaults, the loudest the pattern alone can make' },
    worstP4Busy: worst('p4', ['BUSY']),
    worstP4Extreme: { ...worst('p4', ['EXTREME']), note: 'every fader and the master at 1.5 on FULL' },
    p4CasesOverCeiling: results.filter((r) => r.engine === 'p4' && r.overMinus03 > 0).length,
    p4GridSamplesAtCeiling: results.filter((r) => r.engine === 'p4' && r.pattern !== 'EXTREME').reduce((n, r) => n + r.atCeiling, 0),
    p4ExtremeSamplesAtCeiling: results.filter((r) => r.engine === 'p4' && r.pattern === 'EXTREME').reduce((n, r) => n + r.atCeiling, 0),
    p4ExtremeSamples: results.filter((r) => r.engine === 'p4' && r.pattern === 'EXTREME').reduce((n, r) => n + r.samples, 0),
    p3CasesOver0dBFS: results.filter((r) => r.engine === 'p3' && r.peak > 1).length,
    p3Cases: results.filter((r) => r.engine === 'p3' && !r.skipped).length,
    quietToneLevelChangeDb: { min: Math.min(...toneDelta), max: Math.max(...toneDelta), expected: 'the safety margin only (mixGraph SAFETY_MARGIN_DB)' },
    cases: results.length,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
