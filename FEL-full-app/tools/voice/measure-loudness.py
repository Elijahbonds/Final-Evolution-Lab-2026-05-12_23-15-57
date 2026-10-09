#!/usr/bin/env python3
"""Measure every rendered voice line's loudness and write it into the bank indexes (VOICEOVER, 2026-10-06).

The game trims each clip back to TARGET_LUFS (lib/babylon/audio/voice/loudness.ts) when its index line carries `lufs`. The
clips are AAC; the cloud machine that built the voice mix had no AAC decoder, so the numbers are measured here, on a Mac,
with the same afconvert render-mic.py already uses, and the same venv (numpy, soundfile):

    ~/.cache/fel-kokoro/.venv/bin/python tools/voice/measure-loudness.py public/audio/voice/v1 [--dry-run] [--only <voice,voice>]

IMPROVE (2026-10-06), for tools/voice/import-voices.mts (the provider import): `--files a.wav b.wav ...` measures WAV files
instead and prints one JSON object per file ({"file", "lufs", "peak", "sec"}); `--only` limits the bank pass to some voices.
Where afconvert is missing (not a Mac), ffmpeg decodes the AAC instead.

Per line: decode to 24 kHz mono PCM, ITU-R BS.1770-4 integrated loudness (K-weighting, 400 ms blocks with 75% overlap,
-70 LUFS absolute and -10 LU relative gates) and sample peak. It rewrites only the index .json files (adds/updates `lufs` and
`peak` on each line); the .bin banks and their hashes are untouched, so nothing else changes. Prints the spread per voice.
"""
import json, math, os, shutil, subprocess, sys, tempfile
import numpy as np
import soundfile as sf


def k_weight(x: np.ndarray, sr: int) -> np.ndarray:
    """BS.1770 pre-filter (high shelf) and RLB high-pass, designed for `sr` (the published 48 kHz coefficients re-derived)."""
    def biquad(b, a, x):
        y = np.zeros_like(x); x1 = x2 = y1 = y2 = 0.0
        for i, v in enumerate(x):
            o = b[0] * v + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
            x2, x1, y2, y1 = x1, v, y1, o
            y[i] = o
        return y
    # stage 1: shelf (f0 1681.97 Hz, G +3.9998 dB, Q 0.7072)
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = math.tan(math.pi * f0 / sr); Vh = 10 ** (G / 20); Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    x = biquad(b, a, x)
    # stage 2: high-pass (f0 38.135 Hz, Q 0.5003)
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = math.tan(math.pi * f0 / sr)
    a0 = 1 + K / Q + K * K
    return biquad([1, -2, 1], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0], x)


def integrated_lufs(x: np.ndarray, sr: int) -> float:
    y = k_weight(x.astype(np.float64), sr)
    blk, hop = int(0.4 * sr), int(0.1 * sr)
    if len(y) < blk:
        y = np.pad(y, (0, blk - len(y)))
    z = np.array([np.mean(y[s:s + blk] ** 2) for s in range(0, len(y) - blk + 1, hop)])
    L = -0.691 + 10 * np.log10(np.maximum(z, 1e-12))
    z = z[L > -70]
    if not len(z):
        return -70.0
    rel = -0.691 + 10 * math.log10(np.mean(z)) - 10
    z = z[(-0.691 + 10 * np.log10(z)) > rel]
    return round(-0.691 + 10 * math.log10(np.mean(z)), 2)


def decode(src: str, dst: str) -> None:
    """AAC (or anything) to 24 kHz mono float WAV: afconvert on a Mac, else ffmpeg."""
    if shutil.which('afconvert'):
        subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEF32@24000', '-c', '1', src, dst], check=True)
    elif shutil.which('ffmpeg'):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_f32le', dst], check=True)
    else:
        sys.exit('measure-loudness: needs afconvert (macOS) or ffmpeg to decode AAC')


def measure_files(paths: list) -> None:
    for p in paths:
        pcm, sr = sf.read(p, dtype='float32', always_2d=True)
        pcm = pcm.mean(axis=1)
        peak = round(20 * math.log10(max(float(np.abs(pcm).max()) if pcm.size else 0.0, 1e-9)), 2)
        print(json.dumps({'file': p, 'lufs': integrated_lufs(pcm, sr), 'peak': peak, 'sec': round(len(pcm) / sr, 3)}), flush=True)


def main() -> None:
    if '--files' in sys.argv:
        measure_files(sys.argv[sys.argv.index('--files') + 1:])
        return
    root, dry = sys.argv[1], '--dry-run' in sys.argv
    only = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else None
    for cast in sorted(os.listdir(root)):
        if only is not None and cast not in only:
            continue
        cdir = os.path.join(root, cast)
        vals = []
        for g in sorted(f for f in os.listdir(cdir) if f.endswith('.json')):
            path = os.path.join(cdir, g)
            idx = json.load(open(path))
            if not idx.get('bank'):
                continue
            blob = open(os.path.join(cdir, idx['bank']), 'rb').read()
            for line in idx['lines']:
                with tempfile.NamedTemporaryFile(suffix='.m4a', delete=False) as m4a, tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as wav:
                    m4a.write(blob[line['off']:line['off'] + line['len']]); m4a.flush()
                    decode(m4a.name, wav.name)
                    pcm, sr = sf.read(wav.name, dtype='float32')
                os.unlink(m4a.name); os.unlink(wav.name)
                line['lufs'] = integrated_lufs(pcm, sr)
                line['peak'] = round(20 * math.log10(max(float(np.abs(pcm).max()), 1e-9)), 2)
                vals.append(line['lufs'])
            if not dry:
                json.dump(idx, open(path, 'w'), separators=(',', ':'))
        if vals:
            v = np.array(vals)
            print(f'{cast:10s} {len(v):4d} lines  median {np.median(v):6.1f} LUFS  p5 {np.percentile(v, 5):6.1f}  p95 {np.percentile(v, 95):6.1f}', flush=True)


if __name__ == '__main__':
    main()
