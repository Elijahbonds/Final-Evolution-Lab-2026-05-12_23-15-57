// hoops-sound (phase 11a, 2026-11-12): THE HOOPS FOLEY SET, built from CC0 recordings.
//
// The owner's decision (2026-11-12): basketball sounds come from free CC0 recordings. This script is the whole pipeline, so the set
// can be rebuilt and audited:
//
//   node scripts/audio/hoops-foley/build.mjs fetch <srcDir>     download the source recordings (public player files) into <srcDir>
//   node scripts/audio/hoops-foley/build.mjs build <srcDir>     slice, fade, normalise, loop and encode into public/audio/hoops/
//
// <srcDir> must be a fresh, empty folder outside the repo: downloads are untrusted data and only the encoded audio is written into
// the repo. Every source is CC0 (public domain), checked on its own page, and recorded in public/audio/hoops/CREDITS.md and
// sources.json (with each source's and each output's sha256). Sources: BigSoundBank (Joseph Sardin, CC0: each page says
// "License CC0 (public domain)"). The page's own player file (/UPLOAD/mp3/<id>.mp3, 320 kbps MP3) is the source: the WAV download sits
// behind a timed form, and the set is re-encoded to small mono MP3 anyway.
//
// Processing (pure arithmetic on decoded float samples; ffmpeg only decodes and encodes): mono mix, 44.1 kHz; a slice per hit (from
// the measured onset), leading silence cut so the hit lands on the first sample (a dribble's sound must not lag the ball), a short fade
// in and out, a high-pass where a source carries rumble, normalised (one-shots: peak -1 dBFS; the long crowd sounds: RMS -20 dBFS,
// peak capped at -1), MP3 mono (one-shots 80 kbps, crowd 64 kbps). The crowd bed is a seamless loop (a 1.5 s crossfade of its end
// into its start). Nothing else in the audio is changed.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'public/audio/hoops');
const SR = 44100;
const BSB = (id, title, page) => ({
  id: `bsb-${id}`, file: `bsb-${id}.mp3`, title, author: 'Joseph Sardin (BigSoundBank)', licence: 'CC0 1.0 (public domain)',
  page: `https://bigsoundbank.com/${page}.html`, download: `https://bigsoundbank.com/UPLOAD/mp3/${id}.mp3?v=d`,
});
export const SOURCES = [
  BSB('1045', 'Ball Rebounds ("three different rebounds of a ball")', 'ball-rebounds-s1045'),
  BSB('1825', 'Ball against wall #1 ("ball bouncing off a wall")', 'balloon-against-wall-1-s1825'),
  BSB('0938', 'Gnashing basketball ("squeaking shoes, as you hear during a basketball or handball tournament indoors")', 'gnashing-basketball-s0938'),
  BSB('1771', 'Falling steel bar #1', 'falling-sheet-steel-bar-1-s1771'),
  BSB('1772', 'Falling steel bar #2', 'falling-sheet-steel-bar-2-s1772'),
  BSB('1773', 'Falling steel bar #3', 'falling-sheet-steel-bar-3-s1773'),
  BSB('0399', 'Rubbing tent canvas or shower curtain', 'tent-or-curtain-shower-s0399'),
  BSB('0560', 'Djembe: hand flat in the center', 'djembe-hand-flat-in-the-center-s0560'),
  BSB('0236', 'Shouts and applauses of teens #1 ("teens who shout Yeah and applaud")', 'shouts-and-applauses-of-teens-1-s0236'),
  BSB('0237', 'Shouts and applauses of teens #2', 'shouts-and-applauses-of-teens-2-s0237'),
  BSB('3515', 'Crowd of 50-60 people #1 ("discussions among a small crowd of about 50 to 60 people")', 'crowd-of-50-60-people-1-s3515'),
];

// One row per output file. `at` is the measured onset (s, scripts/audio/hoops-foley/README: the analyser); `dur` the slice length.
const HIT = { lead: 0.03, fadeIn: 0.003, norm: 'peak', kbps: 80, gate: -45 };
export const OUTPUTS = [
  // the dribble: a ball's rebounds (five hits of different strength) and a ball off a wall
  ...[0.175, 1.095, 3.110, 3.940, 6.790].map((at, i) => ({ out: `bounce_${i + 1}.mp3`, src: 'bsb-1045', at, dur: 0.32, fadeOut: 0.12, hp: 40, ...HIT })),
  { out: 'bounce_6.mp3', src: 'bsb-1825', at: 0.06, dur: 0.3, fadeOut: 0.12, hp: 40, ...HIT },
  // sneakers on a hardwood court
  ...[0.295, 0.775, 1.790, 2.930, 4.985].map((at, i) => ({ out: `squeak_${i + 1}.mp3`, src: 'bsb-0938', at, dur: 0.3, fadeOut: 0.08, hp: 300, ...HIT, gate: -30 })),
  // the iron: steel ringing (a single clank twice, and a three-hit rattle)
  { out: 'rim_1.mp3', src: 'bsb-1771', at: 0.045, dur: 0.7, fadeOut: 0.35, hp: 200, ...HIT },
  { out: 'rim_2.mp3', src: 'bsb-1773', at: 0.055, dur: 0.75, fadeOut: 0.35, hp: 200, ...HIT },
  { out: 'rim_3.mp3', src: 'bsb-1772', at: 0.085, dur: 1.0, fadeOut: 0.4, hp: 200, ...HIT },
  // the net: short nylon rustles (a stand-in: no CC0 net recording was found)
  ...[16.565, 22.175, 20.265, 17.560].map((at, i) => ({ out: `net_${i + 1}.mp3`, src: 'bsb-0399', at, dur: 0.3, fadeOut: 0.14, hp: 500, ...HIT, gate: -30 })),
  // the catch: a flat hand on a skin, cut to the slap (the drum's ring faded out)
  ...[0.110, 1.535, 3.265].map((at, i) => ({ out: `catch_${i + 1}.mp3`, src: 'bsb-0560', at, dur: 0.13, fadeOut: 0.07, hp: 120, ...HIT })),
  // the crowd: a cheer (shouts and applause) twice, and the murmur bed (a loop)
  { out: 'cheer_1.mp3', src: 'bsb-0236', at: 0.035, dur: 3.2, fadeOut: 1.0, hp: 80, lead: 0.02, fadeIn: 0.01, norm: 'rms', kbps: 64 },
  { out: 'cheer_2.mp3', src: 'bsb-0237', at: 0.035, dur: 3.6, fadeOut: 1.2, hp: 80, lead: 0.02, fadeIn: 0.01, norm: 'rms', kbps: 64 },
  { out: 'crowd_bed.mp3', src: 'bsb-3515', loop: { len: 14, xfade: 1.5 }, hp: 80, norm: 'rms', kbps: 64 },
];

const sha = (b) => createHash('sha256').update(b).digest('hex');
function decode(file) {
  const b = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return Float32Array.from(new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4));
}
function encode(x, kbps, file) {
  const raw = Buffer.from(x.buffer, x.byteOffset, x.byteLength);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, '-map_metadata', '-1', '-id3v2_version', '0', '-write_xing', '1', file], { input: raw });
}
/** One-pole high-pass (removes rumble below `hz`). */
function highpass(x, hz) {
  if (!hz) return x;
  const rc = 1 / (2 * Math.PI * hz), dt = 1 / SR, a = rc / (rc + dt), y = new Float32Array(x.length);
  let px = 0, py = 0; for (let i = 0; i < x.length; i++) { py = a * (py + x[i] - px); px = x[i]; y[i] = py; } return y;
}
const peakOf = (x) => { let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return p; };
const rmsOf = (x) => { let s = 0; for (const v of x) s += v * v; return Math.sqrt(s / Math.max(1, x.length)); };
function normalise(x, how) {
  const peak = peakOf(x); if (!(peak > 0)) return x;
  let g = how === 'rms' ? 10 ** (-20 / 20) / rmsOf(x) : 10 ** (-1 / 20) / peak;
  g = Math.min(g, 10 ** (-1 / 20) / peak);   // never past -1 dBFS
  return x.map((v) => v * g);
}
/** Cut leading samples quieter than `gateDb` (default -45 dB) under the slice's peak (a noisy source: -30) (the hit on the first sample), then fade in / out. */
function shape(x, fadeIn, fadeOut, gateDb = -45) {
  const thr = peakOf(x) * 10 ** (gateDb / 20); let s = 0; while (s < x.length && Math.abs(x[s]) < thr) s++;
  const y = x.slice(Math.max(0, s - Math.round(0.001 * SR)));
  const fi = Math.round(fadeIn * SR), fo = Math.round(fadeOut * SR);
  for (let i = 0; i < Math.min(fi, y.length); i++) y[i] *= i / fi;
  for (let i = 0; i < Math.min(fo, y.length); i++) { const k = y.length - 1 - i; y[k] *= Math.sin((i / fo) * Math.PI / 2); }
  return y;
}
/** A seamless loop: the steadiest `len` s of the source, its next `xfade` s crossfaded (equal power) into its start. */
function loopOf(x, len, xfade) {
  const win = Math.round((len + xfade) * SR), hop = SR, n = Math.round(len * SR), f = Math.round(xfade * SR);
  let best = 0, bestVar = Infinity;
  for (let s = SR * 2; s + win < x.length - SR * 2; s += hop) {   // the steadiest window: least spread of its 0.5 s loudness
    const levels = []; for (let k = s; k + SR / 2 <= s + win; k += SR / 2) levels.push(20 * Math.log10(rmsOf(x.subarray(k, k + SR / 2)) + 1e-9));
    const m = levels.reduce((a, b) => a + b, 0) / levels.length, v = levels.reduce((a, b) => a + (b - m) ** 2, 0) / levels.length;
    if (v < bestVar) { bestVar = v; best = s; }
  }
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = x[best + i];
  for (let i = 0; i < f; i++) { const t = i / f; y[i] = x[best + n + i] * Math.cos(t * Math.PI / 2) + x[best + i] * Math.sin(t * Math.PI / 2); }
  return { y, from: best / SR, spreadDb: Math.sqrt(bestVar) };
}

const [cmd, srcDir] = process.argv.slice(2);
if (!cmd || !srcDir) { console.error('usage: build.mjs fetch|build <srcDir>'); process.exit(2); }
if (path.resolve(srcDir).startsWith(ROOT)) { console.error('the source folder must be outside the repo'); process.exit(2); }
if (cmd === 'fetch') {
  fs.mkdirSync(srcDir, { recursive: true });
  for (const s of SOURCES) execFileSync('curl', ['-sS', '-f', '-m', '120', '-o', path.join(srcDir, s.file), s.download], { stdio: 'inherit' });
  console.log(`fetched ${SOURCES.length} sources into ${srcDir}`);
} else if (cmd === 'build') {
  fs.mkdirSync(OUT, { recursive: true });
  const decoded = new Map(), manifest = { set: 'hoops-foley', version: 1, date: '2026-11-12', sources: [], files: [] };
  for (const s of SOURCES) {
    const f = path.join(srcDir, s.file); const b = fs.readFileSync(f);
    manifest.sources.push({ ...s, sha256: sha(b), bytes: b.length });
  }
  for (const o of OUTPUTS) {
    const src = SOURCES.find((s) => s.id === o.src);
    if (!decoded.has(o.src)) decoded.set(o.src, decode(path.join(srcDir, src.file)));
    const x = decoded.get(o.src);
    let y, note = {};
    if (o.loop) { const l = loopOf(highpass(x, o.hp), o.loop.len, o.loop.xfade); y = l.y; note = { loopFrom: +l.from.toFixed(2), loopLen: o.loop.len, steadinessDb: +l.spreadDb.toFixed(2) }; }
    else {
      const a = Math.max(0, Math.round((o.at - o.lead) * SR)), b = Math.min(x.length, a + Math.round((o.dur + o.lead) * SR));
      y = shape(highpass(x.slice(a, b), o.hp), o.fadeIn, o.fadeOut, o.gate);
    }
    y = normalise(y, o.norm);
    const file = path.join(OUT, o.out); encode(y, o.kbps, file);
    const b = fs.readFileSync(file);
    manifest.files.push({ file: o.out, source: o.src, sourceAt: o.at ?? null, seconds: +(y.length / SR).toFixed(3), kbps: o.kbps, bytes: b.length, sha256: sha(b), ...note });
    console.log(`${o.out}  ${(y.length / SR).toFixed(2)} s  ${(b.length / 1024).toFixed(1)} KB`);
  }
  fs.writeFileSync(path.join(OUT, 'sources.json'), JSON.stringify(manifest, null, 2) + '\n');
  const total = manifest.files.reduce((a, f) => a + f.bytes, 0);
  console.log(`total ${(total / 1024).toFixed(1)} KB in ${manifest.files.length} files`);
} else { console.error('usage: build.mjs fetch|build <srcDir>'); process.exit(2); }
