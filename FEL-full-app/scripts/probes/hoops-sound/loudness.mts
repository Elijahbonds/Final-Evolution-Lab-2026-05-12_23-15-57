// hoops-sound (phase 11a, 2026-11-12): HOW LOUD IS EACH RECORDING AGAINST THE SYNTH IT REPLACES? Measured, not guessed.
//   node scripts/probes/hoops-sound/loudness.mts build <outDir>          bundle ./loudness-entry.ts (esbuild) into <outDir>/loud.html
//   /home/user/wt/gate-run.sh 300 npx tsx scripts/probes/hoops-sound/loudness.mts run <outDir> <port>   (serves <outDir> + public/)
// Renders each cue at volume 1 through SoundKit's own graph (the SFX/crowd buses, the glue compressor, the limiter) in an
// OfflineAudioContext in Chromium: the synth once, each recording six times (the round-robin). Prints the loudest 50 ms RMS and the
// peak at the limiter's output, and the gain each recording would need to land on its synth.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';

const APP = path.resolve(import.meta.dirname, '../../..');
const [cmd, outDir, port = '3356'] = process.argv.slice(2);
if (cmd === 'build') {
  const esbuild = createRequire(import.meta.url)('esbuild');
  fs.mkdirSync(outDir, { recursive: true });
  await esbuild.build({
    absWorkingDir: APP, entryPoints: [path.join(import.meta.dirname, 'loudness-entry.ts')], bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
    tsconfig: path.join(APP, 'tsconfig.json'), define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'error', outfile: path.join(outDir, 'loud.js'),
  });
  fs.writeFileSync(path.join(outDir, 'loud.html'), '<!doctype html><meta charset="utf-8"><script src="loud.js"></script>');
  console.log('built', outDir);
} else if (cmd === 'run') {
  const srv = spawn('node', [path.join(APP, 'scripts/probes/hoops-gap/serve.mjs'), outDir, port], { stdio: 'ignore' });
  try {
    await new Promise((r) => setTimeout(r, 1500));
    const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    const p = await b.newPage();
    await p.goto(`http://127.0.0.1:${port}/loud.html`);
    const r = await p.evaluate(() => (window as unknown as { __RUN: () => Promise<Record<string, unknown>> }).__RUN()) as Record<string, unknown>;
    await b.close();
    const rows: string[] = [];
    for (const c of ['swish', 'rattle', 'squeak', 'crowdCheer', 'bounce', 'catch', 'impact', 'thud']) {
      const s = r[`${c}:synth`] as { st50: number; peak: number; sec: number };
      const v = r[`${c}:sample`] as { st50: number; peak: number; sec: number }[];
      const mean = v.reduce((a, x) => a + x.st50, 0) / v.length;
      rows.push(`${c.padEnd(11)} synth ${s.st50} dB (peak ${s.peak}, ${s.sec} s) | recording ${mean.toFixed(1)} dB [${v.map((x) => x.st50).join(' ')}] peak max ${Math.max(...v.map((x) => x.peak))} | to match: ${(s.st50 - mean).toFixed(1)} dB`);
    }
    console.log(rows.join('\n'));
    console.log(`crowd bed   synth ${r['bed:synth']} dB | recording ${r['bed:sample']} dB (mean RMS over 3 s) | to match: ${((r['bed:synth'] as number) - (r['bed:sample'] as number)).toFixed(1)} dB`);
    console.log('bank', JSON.stringify(r.bank), 'bed decoded', r.bedDecodedSec, 's');
    fs.writeFileSync(path.join(outDir, 'loudness.json'), JSON.stringify(r, null, 1));
  } finally { srv.kill(); }
} else { console.error('usage: loudness.mts build|run <outDir> [port]'); process.exit(2); }
