#!/usr/bin/env python3
"""onsets_check.py — a line-for-line mirror of the Flip's onset finder (FEL-full-app lib/babylon/music/Flip.ts).

What the app does when a source is loaded into the Flip (FlipPad.tsx `decode` + Flip.ts `onsetSlices`):

    mono[i]  = mean of the channels (a Float32Array; FlipPad.tsx:50-51)
    window   = max(16, floor(sr * 10 / 1000))       441 samples at 44.1 kHz, 480 at 48 kHz (= 10 ms)
    minGap   = floor(sr * 80 / 1000)                3528 / 3840 samples (= 80 ms = 8 windows)
    env[w]   = RMS of mono over window w (a Float32Array; a short tail window is dropped)
    floor    = floor * 0.9 + env[w-1] * 0.1          (starts at 0; the loop starts at w = 1, so window 0 is never an onset)
    onset    at pos = w * window  if  env[w] > 0.02  and  env[w] > 2.2 * floor  and  pos - lastOnset >= minGap
    stop     after 16 onsets (PAD_COUNT); fewer than 2 onsets -> 8 equal grid slices
    slices   = [onset_i, onset_{i+1}), the last one runs to the end of the buffer; audio before the first onset is dropped

The browser decodes at the AudioContext rate (decodeAudioData resamples), so every file is checked at 44.1 kHz AND
48 kHz (a band-limited FFT resample). Two things this mirror reports that the app cannot show:

  * `uncapped` — the onset count with no 16 cap. If it is above 16 the Flip's pads stop part-way through the file and
    the last pad holds everything after onset 16.
  * `fragile` — windows whose energy/floor ratio sits in [1.9, 2.2] (an onset that a different decoder or rate could add)
    and onsets whose ratio is below 2.6 (one that could vanish). A pack loop wants none of either.

Usage (the pack's python: /Users/elijahbonds/.cache/fel-kokoro/.venv/bin/python):

    onsets_check.py FILE.mp3 [FILE ...] [--json] [--rates 44100,48000]
    onsets_check.py --self-test          # re-runs the Flip.test.ts slicing cases against this mirror
    onsets_check.py --parity FILE ...    # runs the app's real Flip.ts (tsx, read-only) on the same data: must be identical

Importable: `flip_onsets(mono, sr)`, `analyse(mono, sr)`, `load_mono(path)`, `resample(mono, sr_in, sr_out)`.
"""
from __future__ import annotations

import json
import math
import sys

import numpy as np

PAD_COUNT = 16
F32 = np.float32

# Flip.ts defaults (onsetSlices opts)
WINDOW_MS = 10
MIN_GAP_MS = 80
RATIO = 2.2
GATE = 0.02
GRID_FALLBACK = 8

# this tool's robustness bands (not in Flip.ts)
FRAGILE_LOW = 1.9       # a non-onset window this close under the ratio (1.3 dB) could flip on another decoder/rate
SOLID_ONSET = 2.6       # an onset below this ratio could vanish


# ── Flip.ts, mirrored ────────────────────────────────────────────────────────────────────────────────────────────────

def grid_slices(length: int, count: int) -> list[tuple[int, int]]:
    n = max(1, min(PAD_COUNT, int(math.floor(count))))
    if length <= 0:
        return []
    step = length / n
    return [(int(math.floor(i * step)), length if i == n - 1 else int(math.floor((i + 1) * step))) for i in range(n)]


def energy_envelope(samples: np.ndarray, window_size: int) -> np.ndarray:
    """RMS per window, float32 like the Float32Array (samples past the end count as 0 when the buffer is shorter than
    one window; otherwise the partial tail window is dropped, exactly as Flip.ts does)."""
    s = np.asarray(samples, dtype=F32).astype(np.float64)
    n = max(1, len(s) // window_size)
    if len(s) < n * window_size:
        s = np.concatenate([s, np.zeros(n * window_size - len(s))])
    s = s[:n * window_size].reshape(n, window_size)
    return np.sqrt(np.sum(s * s, axis=1) / window_size).astype(F32)


def _params(sr: int, window_ms=WINDOW_MS, min_gap_ms=MIN_GAP_MS):
    window = max(16, int(math.floor(sr * window_ms / 1000)))
    min_gap = int(math.floor(sr * min_gap_ms / 1000))
    return window, min_gap


def flip_onsets(mono: np.ndarray, sr: int, max_slices: int | None = PAD_COUNT, ratio: float = RATIO,
                gate: float = GATE) -> list[int]:
    """Onset sample positions exactly as Flip.ts finds them. max_slices=None = no cap (analysis only)."""
    window, min_gap = _params(sr)
    cap = min(PAD_COUNT, max_slices) if max_slices is not None else 10 ** 9
    env = energy_envelope(mono, window).astype(np.float64)
    onsets: list[int] = []
    floor = 0.0
    for w in range(1, len(env)):
        floor = floor * 0.9 + env[w - 1] * 0.1
        pos = w * window
        if env[w] > gate and env[w] > floor * ratio and (not onsets or pos - onsets[-1] >= min_gap):
            onsets.append(pos)
        if len(onsets) >= cap:
            break
    return onsets


def onset_slices(mono: np.ndarray, sr: int) -> list[tuple[int, int]]:
    """Flip.ts onsetSlices with its defaults: what lands on the 16 pads."""
    n = len(mono)
    on = flip_onsets(mono, sr)
    if len(on) < 2:
        return grid_slices(n, min(PAD_COUNT, GRID_FALLBACK))
    return [(s, on[i + 1] if i + 1 < len(on) else n) for i, s in enumerate(on)]


# ── analysis on top of the mirror ────────────────────────────────────────────────────────────────────────────────────

def analyse(mono: np.ndarray, sr: int) -> dict:
    window, min_gap = _params(sr)
    env = energy_envelope(mono, window).astype(np.float64)
    capped = flip_onsets(mono, sr)
    uncapped = flip_onsets(mono, sr, max_slices=None)
    slices = onset_slices(mono, sr)
    grid = len(capped) < 2
    # per-window ratio against the running floor (same recurrence as the detector)
    ratios = np.zeros(len(env))
    floor = 0.0
    for w in range(1, len(env)):
        floor = floor * 0.9 + env[w - 1] * 0.1
        ratios[w] = env[w] / floor if floor > 0 else float('inf')
    on_w = {p // window for p in uncapped}
    weak = [round(p / sr, 4) for p in uncapped if ratios[p // window] < SOLID_ONSET]
    near = []
    blocked = []
    last = None
    for w in range(1, len(env)):
        pos = w * window
        if w in on_w:
            last = pos
            continue
        if env[w] <= GATE:
            continue
        r = ratios[w]
        free = last is None or pos - last >= min_gap        # a detection here would be a new onset
        if r > RATIO and not free:
            blocked.append(round(pos / sr, 4))            # a second attack inside the 80 ms gap (a flam / strum)
        elif free and FRAGILE_LOW <= r <= RATIO:
            near.append(round(pos / sr, 4))               # an onset another decoder / rate could add
    secs = [round(p / sr, 4) for p in capped]
    gaps = np.diff([p / sr for p in uncapped]) if len(uncapped) > 1 else np.array([])
    durs = [round((b - a) / sr, 4) for a, b in slices]
    return {
        'sr': sr, 'samples': int(len(mono)), 'durationSec': round(len(mono) / sr, 4),
        'mode': 'grid-fallback' if grid else 'transient',
        'onsets': secs, 'count': len(capped), 'uncapped': len(uncapped),
        'uncappedOnsets': [round(p / sr, 4) for p in uncapped],
        'onsetRatios': [round(float(ratios[p // window]), 2) for p in uncapped],
        'slices': len(slices), 'sliceSec': durs,
        'minGapSec': round(float(gaps.min()), 4) if len(gaps) else None,
        'medianSliceSec': round(float(np.median(durs)), 4) if durs else None,
        'longestSliceSec': round(float(max(durs)), 4) if durs else None,
        'weakOnsets': weak, 'nearMisses': near, 'blockedByGap': blocked,
        'firstOnsetSec': secs[0] if secs else None,
        'peakRms': round(float(env.max()), 4) if len(env) else 0.0,
    }


# ── I/O ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

def load_mono(path: str) -> tuple[np.ndarray, int]:
    """Decode (libsndfile) and down-mix the way FlipPad.tsx does: m[i] += ch[i] / channels, in float32."""
    import soundfile as sf
    y, sr = sf.read(path, dtype='float32', always_2d=True)
    m = np.zeros(y.shape[0], dtype=F32)
    for c in range(y.shape[1]):
        m = (m.astype(np.float64) + y[:, c].astype(np.float64) / y.shape[1]).astype(F32)
    return m, int(sr)


def resample(x: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
    """Band-limited FFT resample (numpy only), zero-padded so the circular wrap stays out of the signal."""
    if sr_in == sr_out:
        return np.asarray(x, dtype=F32)
    n_in = len(x)
    pad = int(0.25 * sr_in)
    xp = np.concatenate([np.asarray(x, dtype=np.float64), np.zeros(pad)])
    N_in = len(xp)
    N_out = int(round(N_in * sr_out / sr_in))
    X = np.fft.rfft(xp)
    Y = np.zeros(N_out // 2 + 1, dtype=np.complex128)
    k = min(len(X), len(Y))
    Y[:k] = X[:k]
    y = np.fft.irfft(Y, N_out) * (N_out / N_in)
    return y[:int(round(n_in * sr_out / sr_in))].astype(F32)


def check_file(path: str, rates=(44100, 48000)) -> dict:
    mono, sr = load_mono(path)
    return {'file': path, 'rates': {str(r): analyse(resample(mono, sr, r), r) for r in rates}}


# ── self-test: the Flip.test.ts slicing cases ────────────────────────────────────────────────────────────────────────

def _burst(sr: int, hits: list[float], seconds: float) -> np.ndarray:
    out = np.zeros(int(math.floor(sr * seconds)), dtype=F32)
    L = int(math.floor(sr * 0.03))
    i = np.arange(L)
    shape = (0.8 * np.exp(-i / (sr * 0.01)) * np.sin(i * 0.3)).astype(F32)
    for t in hits:
        s = int(math.floor(t * sr))
        out[s:s + L] = shape[:max(0, min(L, len(out) - s))]
    return out


def self_test() -> bool:
    ok = True

    def expect(name, got, want):
        nonlocal ok
        good = got == want
        ok &= good
        print(f"{'ok  ' if good else 'FAIL'} {name}: {got!r}" + ('' if good else f' (want {want!r})'))

    expect('grid 1000/4', grid_slices(1000, 4), [(0, 250), (250, 500), (500, 750), (750, 1000)])
    expect('grid cap 16', len(grid_slices(100, 99)), PAD_COUNT)
    expect('grid empty', grid_slices(0, 4), [])
    sr = 8000
    sig = _burst(sr, [0.1, 0.4, 0.7, 1.0], 1.3)
    s = onset_slices(sig, sr)
    expect('four hits', len(s), 4)
    expect('four hit times', [round(a / sr * 10) / 10 for a, _ in s], [0.1, 0.4, 0.7, 1.0])
    expect('last slice to end', s[3][1], len(sig))
    expect('min gap', len(onset_slices(_burst(sr, [0.1, 0.12, 0.14, 0.5], 0.8), sr)), 2)
    tone = (0.5 * np.sin(np.arange(sr) * 0.05)).astype(F32)
    expect('steady tone -> grid 8', len(onset_slices(tone, sr)), 8)
    expect('energy envelope', energy_envelope(np.array([0, 0, 1, 1], dtype=F32), 2).tolist(), [0.0, 1.0])
    # the window-0 quirk this pack documents: a file that starts ON its transient gets its first onset at 10 ms
    sr = 44100
    hit = np.zeros(sr, dtype=F32)
    hit[:4410] = (0.5 * np.exp(-np.arange(4410) / 800.0) * np.sin(np.arange(4410) * 0.2)).astype(F32)
    hit[22050:22050 + 4410] = hit[:4410]
    expect('window-0 quirk (first onset at 441)', flip_onsets(hit, sr)[:1], [441])
    # the 48 kHz resample keeps the answer (in seconds, to a window)
    on48 = flip_onsets(resample(hit, 44100, 48000), 48000)
    expect('48k resample onsets (s)', [round(p / 48000, 2) for p in on48], [0.01, 0.5])
    print('self-test', 'PASSED' if ok else 'FAILED')
    return ok


REPO_APP = '/Users/elijahbonds/Developer/FEL-swarm/mode-lanes/wt-music/FEL-full-app'


def parity(files: list[str], rates=(44100, 48000), app: str = REPO_APP) -> bool:
    """Run the REAL Flip.ts (through tsx, read-only) on the same float32 data and compare slice starts."""
    import os
    import subprocess
    import tempfile
    tmp = tempfile.mkdtemp(prefix='flip-parity-')
    cases = []
    for i, f in enumerate(files):
        mono, sr = load_mono(f)
        for r in rates:
            x = resample(mono, sr, r)
            dump = os.path.join(tmp, f'{i}_{r}.f32')
            x.astype('<f4').tofile(dump)
            cases.append({'name': os.path.basename(f), 'f32': dump, 'sr': r, 'want': [a for a, _ in onset_slices(x, r)]})
    man = os.path.join(tmp, 'manifest.json')
    with open(man, 'w') as fh:
        json.dump({'flipTs': os.path.join(app, 'lib/babylon/music/Flip.ts'), 'cases': cases}, fh)
    here = os.path.dirname(os.path.abspath(__file__))
    r = subprocess.run([os.path.join(app, 'node_modules/.bin/tsx'), os.path.join(here, 'flip_parity.ts'), man],
                       capture_output=True, text=True, cwd=app)
    print(r.stdout.strip())
    if r.returncode not in (0, 1):
        print(r.stderr.strip()[-2000:])
    return r.returncode == 0


def main(argv: list[str]) -> int:
    if '--self-test' in argv:
        return 0 if self_test() else 1
    if '--parity' in argv:
        files = [a for a in argv if not a.startswith('--')]
        return 0 if parity(files) else 1
    as_json = '--json' in argv
    rates = (44100, 48000)
    files = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--rates':
            rates = tuple(int(r) for r in argv[i + 1].split(','))
            i += 2
            continue
        if not a.startswith('--'):
            files.append(a)
        i += 1
    if not files:
        print(__doc__)
        return 2
    results = [check_file(f, rates) for f in files]
    if as_json:
        print(json.dumps(results, indent=1))
        return 0
    for r in results:
        print(r['file'])
        for rate, a in r['rates'].items():
            print(f"  @{rate}: {a['mode']:13s} pads={a['slices']:2d} onsets={a['count']:2d} uncapped={a['uncapped']:2d} "
                  f"minGap={a['minGapSec']} medianSlice={a['medianSliceSec']} longest={a['longestSliceSec']}")
            print(f"     onsets {a['onsets']}")
            print(f"     ratios {a['onsetRatios']}")
            if a['weakOnsets'] or a['nearMisses']:
                print(f"     weak {a['weakOnsets']} near {a['nearMisses']}")
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
