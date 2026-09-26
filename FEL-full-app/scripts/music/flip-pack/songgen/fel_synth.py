"""fel_synth — FEL's numpy-only song synthesiser for The Cypher's six house songs.

Everything here is generated from code: no samples, no third-party audio, no recorded voices. A song script builds a
`Song` (tempo, key, sections, events), calls `render(song, ...)`, and gets the contract's files:

    songs/<id>/stems/{bed,drums,bass,keys,perc,horns,lead,fx}.mp3   mono 44.1 kHz VBR, sample-aligned, equal length
    songs/<id>/preview.mp3                                           16-bar stereo preview from the hook
    songs/<id>/map.json                                              sections, onsets, breaks, provenance

See CONTRACT.md for the exact rules and SONGS.md for the six specs. Quick tour of the API:

    from fel_synth import Song, Section, render, Key, voicing, midi
    song = Song(id='warmup', title='Morning Boardwalk', style='lo-fi boom-bap', bpm=88, key='F major', bars=36,
                seed=0xF1, difficulty=1, target_taps_per_min=28, swing=0.58, hook_stem='keys',
                sections=[Section('intro', 1, 4, 1, ('bed', 'keys', 'fx')), ...], break_bars=[21, 22],
                preview_start_bar=13)
    song.pattern('bed', 'kick', range(1, 37), 'x...............')           # 16 chars = one bar of sixteenths
    song.note('bass', 'pluck_bass', bar=5, six=0, pitch='F2', dur16=3, vel=0.9)
    song.chord('keys', 'ep', 5, 0, voicing('Gm9', center=62), dur16=14, vel=0.7)
    song.phrase('lead', 'whistle', [(13, 0, 'C5', 2, 0.8), (13, 2, 'D5', 6, 0.8)], glide=0.08)
    song.fx('fx', 'riser', 12, 0, dur16=16)
    render(song, out_root='.../songs', script_path=__file__)

Bars are 1-based everywhere (bar 1 beat 1 = t 0). A sixteenth is 0..15 within the bar. Swing delays odd sixteenths.
"""
from __future__ import annotations

import datetime
import hashlib
import json
import math
import os
import platform
import re
import sys
import time
from dataclasses import dataclass, field
from typing import Callable, Iterable, Sequence

import numpy as np
import soundfile as sf

LIB_VERSION = '1.0.0'
SR = 44100
DATE = '2026-09-25'
STEMS: tuple[str, ...] = ('bed', 'drums', 'bass', 'keys', 'perc', 'horns', 'lead', 'fx')
EARNED_STEMS: tuple[str, ...] = STEMS[1:]
# DanceCore move family -> stem (StemBand.ts CATEGORY_STEM, lower-cased)
EARNED: dict[str, str] = {
    'bounce': 'drums', 'footwork': 'bass', 'wave': 'keys', 'toprock': 'perc',
    'freeze': 'horns', 'power': 'lead', 'transition': 'fx',
}
SECTION_NAMES: tuple[str, ...] = ('intro', 'verse', 'build', 'hook', 'break', 'bridge', 'outro')

# Level targets (pre-encode; the validator checks the decoded MP3s against -3 / -1 / -14).
TARGET_LUFS = -14.0
STEM_CEILING_DB = -3.6
SUM_CEILING_DB = -1.7
END_FADE_MS = 25.0
# MP3: VBR via libsndfile's compression_level (LAME V = level*10). 0.85 is the floor before LAME's lowpass collapses.
MP3_LEVEL_START = 0.55
MP3_LEVEL_MAX = 0.85
SONG_BYTES_MAX = 6_500_000
PREVIEW_BYTES_MAX = 600_000
PREVIEW_KBPS = 96


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# small utilities
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def db(x: float) -> float:
    return 20.0 * math.log10(max(float(x), 1e-12))


def undb(d: float) -> float:
    return 10.0 ** (d / 20.0)


def next_fast_len(n: int) -> int:
    """Smallest 2^a 3^b 5^c >= n (fast sizes for numpy's pocketfft)."""
    best = 1 << max(0, int(n - 1).bit_length())
    f5 = 1
    while f5 < best:
        f35 = f5
        while f35 < best:
            f = f35
            while f < n:
                f *= 2
            best = min(best, f)
            f35 *= 3
        f5 *= 5
    return best


def _h64(*keys) -> int:
    return int.from_bytes(hashlib.blake2b(repr(keys).encode(), digest_size=8).digest(), 'little')


def hrand(*keys) -> float:
    """Deterministic uniform [0,1) from any hashable keys (stable across runs and event order)."""
    return (_h64(*keys) >> 11) / float(1 << 53)


def rng_for(*keys) -> np.random.Generator:
    return np.random.default_rng(_h64(*keys))


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def _cos_ramp(n: int) -> np.ndarray:
    """0 -> 1 raised-cosine ramp of n samples (first sample 0)."""
    if n <= 0:
        return np.ones(0)
    return 0.5 - 0.5 * np.cos(np.pi * np.arange(n) / n)


def edge_fade(x: np.ndarray, in_ms: float = 2.0, out_ms: float = 3.0) -> np.ndarray:
    """Raised-cosine fades at both edges. Every rendered note passes through this (the no-click rule: >= 2 ms)."""
    x = np.array(x, dtype=np.float64, copy=True)
    n = len(x)
    a = min(n // 2, max(1, int(round(in_ms * 1e-3 * SR))))
    b = min(n // 2, max(1, int(round(out_ms * 1e-3 * SR))))
    if n >= 2:
        x[:a] *= _cos_ramp(a)
        x[n - b:] *= _cos_ramp(b)[::-1]
        x[-1] = 0.0
    return x


def t_axis(n: int) -> np.ndarray:
    return np.arange(n) / SR


def env_adsr(n: int, a: float, d: float, s: float, r: float, gate: float, curve: str = 'exp') -> np.ndarray:
    """ADSR over n samples. a = attack (s, sin^2 ramp), d = decay time-constant (s) toward sustain s (0..1),
    gate = seconds held, r = release time-constant (s) after the gate."""
    t = t_axis(n)
    env = np.empty(n)
    a = max(a, 1e-4)
    att = t < a
    env[att] = np.sin(0.5 * np.pi * t[att] / a) ** 2
    held = ~att
    env[held] = s + (1.0 - s) * np.exp(-(t[held] - a) / max(d, 1e-4))
    g = max(gate, 0.0)
    if n and g < t[-1]:
        gi = int(g * SR)
        level = env[min(gi, n - 1)]
        tt = t[gi:] - g
        env[gi:] = level * np.exp(-tt / max(r, 1e-4))
    return env


def moving_avg(x: np.ndarray, half: int) -> np.ndarray:
    """Centered moving average of width 2*half+1 (edges use the available samples)."""
    if half <= 0:
        return x.copy()
    c = np.concatenate([[0.0], np.cumsum(x)])
    n = len(x)
    i = np.arange(n)
    lo = np.maximum(0, i - half)
    hi = np.minimum(n, i + half + 1)
    return (c[hi] - c[lo]) / (hi - lo)


def sliding_min(a: np.ndarray, w: int) -> np.ndarray:
    """Trailing sliding minimum over windows of w samples (van Herk / Gil-Werman, vectorised)."""
    n = len(a)
    if w <= 1 or n == 0:
        return a.copy()
    pad = (-n) % w
    b = np.concatenate([a, np.full(pad, np.inf)]).reshape(-1, w)
    pre = np.minimum.accumulate(b, axis=1).ravel()
    suf = np.minimum.accumulate(b[:, ::-1], axis=1)[:, ::-1].ravel()
    out = np.empty(n)
    if n >= w:
        out[w - 1:] = np.minimum(suf[:n - w + 1], pre[w - 1:n])
    k = min(w - 1, n)
    out[:k] = np.minimum.accumulate(a[:k])
    return out


def centered_min(a: np.ndarray, half: int, pad_value: float = 1.0) -> np.ndarray:
    if half <= 0:
        return a.copy()
    p = np.concatenate([np.full(half, pad_value), a, np.full(half, pad_value)])
    m = sliding_min(p, 2 * half + 1)
    return m[2 * half:]


def limiter_gain(x: np.ndarray, ceiling: float, attack_ms: float = 2.5, release_ms: float = 40.0) -> np.ndarray:
    """Zero-latency-offline peak limiter gain curve g <= 1 with |x*g| <= ceiling everywhere (x mono or (n,c)).
    Two stages of centred-min + moving-average (each provably stays under the needed gain)."""
    mag = np.abs(x) if x.ndim == 1 else np.abs(x).max(axis=1)
    need = np.minimum(1.0, ceiling / np.maximum(mag, 1e-12))
    if need.min() >= 1.0:
        return np.ones(len(mag))
    ha = max(1, int(attack_ms * 1e-3 * SR))
    hr = max(1, int(release_ms * 1e-3 * SR))
    g = moving_avg(centered_min(need, ha), ha)
    g = moving_avg(centered_min(g, hr), hr)
    return np.minimum(g, need)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# pitch, keys and chords
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def _norm_acc(s: str) -> str:
    return s.replace('♭', 'b').replace('♯', '#')


def pitch_class(name: str) -> int:
    name = _norm_acc(name)
    pc = _PC[name[0].upper()]
    for ch in name[1:]:
        if ch == '#':
            pc += 1
        elif ch == 'b':
            pc -= 1
    return pc % 12


def midi(p) -> float:
    """'E2' -> 40, 'Bb3' -> 58, 'F#4' -> 66; numbers pass through."""
    if isinstance(p, (int, float, np.integer, np.floating)):
        return float(p)
    s = _norm_acc(str(p).strip())
    m = re.fullmatch(r'([A-Ga-g])([#b]*)(-?\d+)', s)
    if not m:
        raise ValueError(f'bad note name {p!r}')
    pc = _PC[m.group(1).upper()] + m.group(2).count('#') - m.group(2).count('b')
    return float(12 * (int(m.group(3)) + 1) + pc)


def hz(m: float) -> float:
    return 440.0 * 2.0 ** ((float(m) - 69.0) / 12.0)


def hz_arr(m: np.ndarray) -> np.ndarray:
    return 440.0 * 2.0 ** ((m - 69.0) / 12.0)


SCALES: dict[str, tuple[int, ...]] = {
    'major': (0, 2, 4, 5, 7, 9, 11), 'ionian': (0, 2, 4, 5, 7, 9, 11),
    'minor': (0, 2, 3, 5, 7, 8, 10), 'aeolian': (0, 2, 3, 5, 7, 8, 10),
    'dorian': (0, 2, 3, 5, 7, 9, 10), 'mixolydian': (0, 2, 4, 5, 7, 9, 10),
    'phrygian': (0, 1, 3, 5, 7, 8, 10), 'lydian': (0, 2, 4, 6, 7, 9, 11),
    'harmonic_minor': (0, 2, 3, 5, 7, 8, 11),
    'minor_pentatonic': (0, 3, 5, 7, 10), 'major_pentatonic': (0, 2, 4, 7, 9),
    'blues': (0, 3, 5, 6, 7, 10),
}


class Key:
    """Key('F major'), Key('E dorian'), Key('Bb minor'), Key('F# minor')."""

    def __init__(self, spec: str):
        parts = _norm_acc(spec).split()
        self.spec = spec
        self.tonic = pitch_class(parts[0])
        self.mode = parts[1].lower() if len(parts) > 1 else 'major'
        if self.mode not in SCALES:
            raise ValueError(f'unknown mode {self.mode}')
        self.steps = SCALES[self.mode]

    def degree(self, d, octave: int = 4) -> float:
        """Scale degree -> midi. d is 1-based (1 = tonic); 8 = tonic an octave up; 0/-1 go below. Strings may carry
        accidentals: 'b3', '#4'. octave is the octave of degree 1."""
        acc = 0
        if isinstance(d, str):
            s = _norm_acc(d)
            acc = s.count('#') - s.count('b')
            d = int(s.replace('#', '').replace('b', ''))
        idx = d - 1
        n = len(self.steps)
        octs, pos = divmod(idx, n)
        return float(12 * (octave + 1) + self.tonic + self.steps[pos] + 12 * octs + acc)

    def notes(self, lo, hi) -> list[float]:
        lo, hi = midi(lo), midi(hi)
        pcs = {(self.tonic + s) % 12 for s in self.steps}
        return [float(m) for m in range(int(math.ceil(lo)), int(hi) + 1) if m % 12 in pcs]

    def snap(self, m) -> float:
        m = midi(m)
        pcs = [(self.tonic + s) % 12 for s in self.steps]
        best = min(range(-6, 7), key=lambda o: (0 if (int(round(m)) + o) % 12 in pcs else 99, abs(o)))
        return float(int(round(m)) + best)

    def in_key(self, m) -> bool:
        return int(round(midi(m))) % 12 in {(self.tonic + s) % 12 for s in self.steps}


CHORD_QUALITIES: dict[str, tuple[int, ...]] = {
    '': (0, 4, 7), 'maj': (0, 4, 7), 'm': (0, 3, 7), 'min': (0, 3, 7), '5': (0, 7),
    '6': (0, 4, 7, 9), 'm6': (0, 3, 7, 9), '69': (0, 4, 7, 9, 14),
    '7': (0, 4, 7, 10), 'maj7': (0, 4, 7, 11), 'm7': (0, 3, 7, 10), 'mmaj7': (0, 3, 7, 11),
    '9': (0, 4, 7, 10, 14), 'maj9': (0, 4, 7, 11, 14), 'm9': (0, 3, 7, 10, 14), 'add9': (0, 4, 7, 14),
    'madd9': (0, 3, 7, 14), '11': (0, 7, 10, 14, 17), 'm11': (0, 3, 7, 10, 14, 17),
    '13': (0, 4, 10, 14, 21), 'maj13': (0, 4, 11, 14, 21), 'm13': (0, 3, 10, 14, 21),
    'sus2': (0, 2, 7), 'sus4': (0, 5, 7), '7sus4': (0, 5, 7, 10), '9sus4': (0, 5, 7, 10, 14),
    'dim': (0, 3, 6), 'dim7': (0, 3, 6, 9), 'm7b5': (0, 3, 6, 10), 'aug': (0, 4, 8),
    '7#9': (0, 4, 7, 10, 15), '7b9': (0, 4, 7, 10, 13), '7#11': (0, 4, 7, 10, 18), 'maj7#11': (0, 4, 7, 11, 18),
}


def parse_chord(symbol: str) -> tuple[int, tuple[int, ...], int | None]:
    """'Gm9' -> (root pc 7, intervals, bass pc or None). Slash chords: 'C/E'."""
    s = _norm_acc(symbol.strip())
    bass = None
    if '/' in s:
        s, b = s.split('/', 1)
        bass = pitch_class(b)
    m = re.fullmatch(r'([A-G][#b]?)(.*)', s)
    if not m:
        raise ValueError(f'bad chord {symbol!r}')
    q = m.group(2)
    if q not in CHORD_QUALITIES:
        raise ValueError(f'unknown chord quality {q!r} in {symbol!r}; known: {sorted(CHORD_QUALITIES)}')
    return pitch_class(m.group(1)), CHORD_QUALITIES[q], bass


def chord_root(symbol: str, octave: int = 2) -> float:
    """Root (or slash bass) of a chord as midi in the given octave: chord_root('Gm9', 2) -> G2."""
    root, _, bass = parse_chord(symbol)
    pc = bass if bass is not None else root
    return float(12 * (octave + 1) + pc)


def voicing(symbol: str, center=62, n: int | None = None, prev: Sequence[float] | None = None,
            rootless: bool = False, spread: bool = False) -> list[float]:
    """A close-position voicing near `center` (midi or name). n = how many tones (drops the 5th, then the root, first).
    rootless = leave the root to the bass. prev = the previous voicing (picks the smoothest voice-leading).
    spread = open the voicing (drop-2)."""
    center = midi(center)
    root, ivs, _ = parse_chord(symbol)
    tones = [(root + i) % 12 for i in ivs]
    order = list(dict.fromkeys(tones))
    prio = []
    ivmod = [i % 12 for i in ivs]
    for i, pc in zip(ivmod, tones):
        rank = {0: 5 if rootless else 3, 7: 4}.get(i, 0)
        prio.append((rank, pc))
    keep = order
    if rootless and len(keep) > 3:
        keep = [pc for pc in keep if pc != root]
    if n is not None and len(keep) > n:
        ranked = sorted(set(keep), key=lambda pc: max(r for r, p in prio if p == pc))
        keep = [pc for pc in keep if pc in ranked[:n]]
    best, best_cost = None, 1e9
    for inv in range(len(keep)):
        seq = keep[inv:] + keep[:inv]
        for start in range(int(center) - 10, int(center) + 4):
            notes = []
            cur = start
            for pc in seq:
                m = cur + ((pc - cur) % 12)
                notes.append(m)
                cur = m + 1
            if spread and len(notes) >= 4:
                notes[-2] -= 12
                notes.sort()
            mean = sum(notes) / len(notes)
            cost = abs(mean - center) * 0.6 + (notes[-1] - notes[0]) * 0.05
            if prev:
                p = sorted(prev)
                q = sorted(notes)
                k = min(len(p), len(q))
                cost = sum(abs(a - b) for a, b in zip(p[:k], q[:k])) + abs(mean - center) * 0.25
            if cost < best_cost:
                best, best_cost = notes, cost
    return [float(m) for m in sorted(best)]


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# filters (magnitude responses, applied in the frequency domain) and FFT helpers
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def lp_gain(f, fc, q: float = 0.707, poles: int = 2):
    r = np.asarray(f, dtype=np.float64) / np.maximum(fc, 1e-6)
    g = 1.0 / np.sqrt((1.0 - r * r) ** 2 + (r / q) ** 2)
    if poles == 4:
        g = g * (1.0 / np.sqrt((1.0 - r * r) ** 2 + (r / 0.541) ** 2))
    return g


def hp_gain(f, fc, q: float = 0.707, poles: int = 2):
    r = np.asarray(f, dtype=np.float64) / np.maximum(fc, 1e-6)
    g = (r * r) / np.sqrt((1.0 - r * r) ** 2 + (r / q) ** 2)
    if poles == 4:
        g = g * (r * r) / np.sqrt((1.0 - r * r) ** 2 + (r / 0.541) ** 2)
    return g


def bp_gain(f, fc, q: float = 1.0):
    r = np.asarray(f, dtype=np.float64) / np.maximum(fc, 1e-6)
    return (r / q) / np.sqrt((1.0 - r * r) ** 2 + (r / q) ** 2)


def peak_gain(f, fc, gain_db: float, q: float = 1.0):
    r = np.asarray(f, dtype=np.float64) / fc
    A = 10 ** (gain_db / 40.0)
    num = (1 - r * r) ** 2 + (r * A / q) ** 2
    den = (1 - r * r) ** 2 + (r / (A * q)) ** 2
    return np.sqrt(num / den)


def lowshelf_gain(f, fc, gain_db: float, q: float = 0.707):
    r = np.asarray(f, dtype=np.float64) / fc
    A = 10 ** (gain_db / 40.0)
    k = r * math.sqrt(A) / q
    return A * np.sqrt((A - r * r) ** 2 + k ** 2) / np.sqrt((1 - A * r * r) ** 2 + k ** 2)


def highshelf_gain(f, fc, gain_db: float, q: float = 0.707):
    r = np.asarray(f, dtype=np.float64) / fc
    A = 10 ** (gain_db / 40.0)
    k = r * math.sqrt(A) / q
    return A * np.sqrt((1 - A * r * r) ** 2 + k ** 2) / np.sqrt((A - r * r) ** 2 + k ** 2)


def eq_curve(freqs: np.ndarray, bands: Iterable[tuple]) -> np.ndarray:
    """Product of EQ bands: ('hp', fc[, q, poles]), ('lp', fc[, q, poles]), ('bp', fc, q), ('peak', fc, db[, q]),
    ('lowshelf', fc, db), ('highshelf', fc, db), ('tilt', db_per_octave, pivot_hz)."""
    g = np.ones_like(freqs, dtype=np.float64)
    for b in bands:
        kind = b[0]
        if kind == 'hp':
            g *= hp_gain(freqs, b[1], b[2] if len(b) > 2 else 0.707, b[3] if len(b) > 3 else 2)
        elif kind == 'lp':
            g *= lp_gain(freqs, b[1], b[2] if len(b) > 2 else 0.707, b[3] if len(b) > 3 else 2)
        elif kind == 'bp':
            g *= bp_gain(freqs, b[1], b[2] if len(b) > 2 else 1.0)
        elif kind == 'peak':
            g *= peak_gain(freqs, b[1], b[2], b[3] if len(b) > 3 else 1.0)
        elif kind == 'lowshelf':
            g *= lowshelf_gain(freqs, b[1], b[2], b[3] if len(b) > 3 else 0.707)
        elif kind == 'highshelf':
            g *= highshelf_gain(freqs, b[1], b[2], b[3] if len(b) > 3 else 0.707)
        elif kind == 'tilt':
            slope, pivot = b[1], b[2]
            g *= 10 ** (slope * np.log2(np.maximum(freqs, 10.0) / pivot) / 20.0)
        else:
            raise ValueError(f'unknown eq band {b}')
    return g


def fft_filter(x: np.ndarray, gain_fn: Callable[[np.ndarray], np.ndarray] | np.ndarray | list,
               pad: int | None = None) -> np.ndarray:
    """Zero-phase static filter. gain_fn(freqs) -> gains, or a list of eq bands. Output has len(x)."""
    n = len(x)
    if n == 0:
        return x.copy()
    pad = pad if pad is not None else min(16384, max(2048, n // 4))
    N = next_fast_len(n + pad)
    X = np.fft.rfft(x, N)
    f = np.fft.rfftfreq(N, 1.0 / SR)
    g = eq_curve(f, gain_fn) if isinstance(gain_fn, (list, tuple)) else (gain_fn(f) if callable(gain_fn) else gain_fn)
    return np.fft.irfft(X * g, N)[:n]


def fft_convolve(x: np.ndarray, h: np.ndarray, n_out: int | None = None) -> np.ndarray:
    n_out = n_out if n_out is not None else len(x) + len(h) - 1
    N = next_fast_len(len(x) + len(h) - 1)
    y = np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(h, N), N)
    return y[:n_out]


def stft_noise(n: int, rng: np.random.Generator, gain_fn: Callable[[np.ndarray, np.ndarray], np.ndarray],
               nfft: int = 1024, normalize: bool = True) -> np.ndarray:
    """Time-varying filtered noise, generated in the STFT domain. gain_fn(freqs[None,:], times[:,None]) -> (F,B)
    gains. With normalize each frame carries unit power, so the amplitude envelope is applied separately."""
    hop = nfft // 4
    F = n // hop + 5
    freqs = np.fft.rfftfreq(nfft, 1.0 / SR)
    times = (np.arange(F) * hop - nfft // 2) / SR
    G = np.asarray(gain_fn(freqs[None, :], times[:, None]), dtype=np.float64)
    G = np.broadcast_to(G, (F, len(freqs))).copy()
    if normalize:
        G /= np.sqrt(np.maximum((G * G).mean(axis=1, keepdims=True), 1e-18))
    spec = (rng.standard_normal(G.shape) + 1j * rng.standard_normal(G.shape)) * G
    frames = np.fft.irfft(spec, nfft, axis=1) * np.hanning(nfft + 1)[:nfft][None, :]
    frames *= math.sqrt(nfft / 2.0) / 1.0
    total = (F + 4) * hop + nfft
    buf = np.zeros(total)
    for r in range(4):
        blk = frames[r::4]
        if len(blk) == 0:
            continue
        seg = blk.ravel()
        buf[r * hop:r * hop + len(seg)] += seg
    out = buf[nfft // 2: nfft // 2 + n]
    rms = np.sqrt(np.mean(out ** 2)) if normalize else 1.0
    return out / max(rms, 1e-12)


def white(n: int, rng: np.random.Generator) -> np.ndarray:
    return rng.standard_normal(n)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# oscillators: band-limited wavetables (one cycle per filter level) and an additive engine for glides
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

TABLE_N = 4096


def harmonic_amps(shape: str, K: int, width: float = 0.5) -> np.ndarray:
    """Sine-series amplitudes (signed) for k = 1..K."""
    k = np.arange(1, K + 1, dtype=np.float64)
    if shape == 'saw':
        return ((-1.0) ** (k + 1)) / k
    if shape == 'square':
        return np.where(k % 2 == 1, 1.0 / k, 0.0)
    if shape == 'pulse':
        return 2.0 * np.sin(np.pi * k * width) / (np.pi * k) * np.pi / 2
    if shape == 'tri':
        ki = np.arange(1, K + 1)
        sign = np.where(((ki - 1) // 2) % 2 == 0, 1.0, -1.0)
        return np.where(ki % 2 == 1, sign / (k * k), 0.0)
    if shape == 'sine':
        return (k == 1).astype(np.float64)
    if shape == 'glottal':           # a voice-like source, -9 dB/oct
        return 1.0 / k ** 1.5
    if shape == 'warm':              # saw rolled off: a softer synth source
        return ((-1.0) ** (k + 1)) / k ** 1.25
    raise ValueError(f'unknown shape {shape}')


def bandlimit_taper(freqs):
    """1 below 0.40*SR, 0 above 0.46*SR, cosine in between (no harmonics popping in during glides)."""
    lo, hi = 0.40 * SR, 0.46 * SR
    x = np.clip((np.asarray(freqs) - lo) / (hi - lo), 0.0, 1.0)
    return 0.5 + 0.5 * np.cos(np.pi * x)


def build_tables(f0: float, amps: np.ndarray, gains: np.ndarray | None = None) -> np.ndarray:
    """Wavetables (M, N+1) for fundamental f0. amps (K,), gains (M, K) per level (None = one unfiltered table)."""
    K = min(len(amps), TABLE_N // 2 - 1, int(0.46 * SR / max(f0, 1.0)))
    amps = amps[:K]
    k = np.arange(1, K + 1)
    tap = bandlimit_taper(k * f0)
    if gains is None:
        gains = np.ones((1, K))
    gains = gains[:, :K]
    X = np.zeros((gains.shape[0], TABLE_N // 2 + 1), dtype=np.complex128)
    X[:, 1:K + 1] = -0.5j * TABLE_N * (amps * tap)[None, :] * gains
    T = np.fft.irfft(X, TABLE_N, axis=1)
    return np.concatenate([T, T[:, :1]], axis=1)


def table_play(T: np.ndarray, phase_cycles: np.ndarray, level: np.ndarray | None = None) -> np.ndarray:
    N = T.shape[1] - 1
    pos = np.mod(phase_cycles, 1.0) * N
    i0 = pos.astype(np.int64)
    np.minimum(i0, N - 1, out=i0)
    w = pos - i0
    if T.shape[0] == 1 or level is None:
        row = T[0]
        return row[i0] * (1.0 - w) + row[i0 + 1] * w
    M = T.shape[0]
    lv = np.clip(level, 0.0, M - 1 - 1e-9)
    l0 = lv.astype(np.int64)
    lw = lv - l0
    l1 = np.minimum(l0 + 1, M - 1)
    flat = T.ravel()
    s = N + 1
    a = flat[l0 * s + i0] * (1.0 - w) + flat[l0 * s + i0 + 1] * w
    b = flat[l1 * s + i0] * (1.0 - w) + flat[l1 * s + i0 + 1] * w
    return a * (1.0 - lw) + b * lw


def phase_of(f_inst: np.ndarray, phase0: float = 0.0) -> np.ndarray:
    """Cycles (not radians): cumulative sum of f/SR, starting at phase0."""
    ph = np.cumsum(f_inst) / SR
    return ph - ph[0] + phase0 if len(ph) else ph


def filtered_osc(f_inst: np.ndarray, shape: str, cutoff: np.ndarray | float, q: float = 0.707, poles: int = 2,
                 width: float = 0.5, hp: float | None = None, phase0: float = 0.0, f_ref: float | None = None,
                 levels_per_octave: float = 6.0) -> np.ndarray:
    """A band-limited oscillator through a (time-varying) low-pass: cutoff may be an array (Hz) per sample.
    Pitch should stay near f_ref (vibrato, scoops, falls are fine); use `additive` for wide glides."""
    n = len(f_inst)
    f0 = float(f_ref if f_ref is not None else np.median(f_inst))
    K = int(0.46 * SR / max(f0 * 1.02, 1.0))
    K = max(1, min(K, TABLE_N // 2 - 1))
    amps = harmonic_amps(shape, K, width)
    kf = np.arange(1, K + 1) * f0
    extra = hp_gain(kf, hp, 0.707, 2) if hp else 1.0
    c = np.broadcast_to(np.asarray(cutoff, dtype=np.float64), (n,))
    c = np.clip(c, 20.0, 0.49 * SR)
    lo, hi = float(c.min()), float(c.max())
    if hi / lo < 1.005:
        T = build_tables(f0, amps, (lp_gain(kf, lo, q, poles) * extra)[None, :])
        return table_play(T, phase_of(f_inst, phase0))
    M = int(np.clip(math.ceil(math.log2(hi / lo) * levels_per_octave) + 1, 2, 72))
    cs = np.geomspace(lo, hi, M)
    gains = lp_gain(kf[None, :], cs[:, None], q, poles) * extra
    T = build_tables(f0, amps, gains)
    level = np.log(c / lo) / math.log(hi / lo) * (M - 1)
    return table_play(T, phase_of(f_inst, phase0), level)


def additive(f_inst: np.ndarray, amps: np.ndarray,
             gain_fn: Callable[[np.ndarray, np.ndarray], np.ndarray] | None = None,
             phase0: np.ndarray | None = None, chunk: int = 16384, ctrl: int = 32, floor: float = 1e-3) -> np.ndarray:
    """Exact-pitch additive synthesis for any pitch curve (glides, scrubs). amps (K,) signed sine amplitudes.
    gain_fn(freqs (K, C), idx (C,)) returns per-harmonic gains at control points idx (sample indices, every `ctrl`
    samples; linearly interpolated between) — a filter or formant that may move in time. Harmonics whose amplitude
    x gain stays under floor x the loudest are skipped. Band-limited by construction."""
    n = len(f_inst)
    out = np.zeros(n)
    if n == 0:
        return out
    ph = 2.0 * np.pi * phase_of(f_inst)
    K = len(amps)
    if phase0 is None:
        phase0 = np.zeros(K)
    chunk = max(ctrl, (chunk // ctrl) * ctrl)
    for s in range(0, n, chunk):
        e = min(n, s + chunk)
        m = e - s
        idx = np.minimum(np.arange(s, s + m + ctrl, ctrl), n - 1)
        C = len(idx)
        fmax = float(f_inst[s:e].max())
        Ke = max(1, min(K, int(0.46 * SR / max(fmax, 1.0))))
        k = np.arange(1, Ke + 1, dtype=np.float64)[:, None]
        fk = k * f_inst[None, idx]
        A = amps[:Ke, None] * bandlimit_taper(fk)
        if gain_fn is not None:
            A = A * gain_fn(fk, idx)
        mag = np.abs(A).max(axis=1)
        live = np.nonzero(mag >= floor * max(mag.max(), 1e-12))[0]
        if len(live) == 0:
            continue
        Ke = int(live[-1]) + 1
        A = A[:Ke]
        # linear interpolation of the control-rate gains to audio rate
        nseg = C - 1
        w = (np.arange(ctrl) / ctrl)[None, None, :]
        Au = (A[:, :-1, None] * (1.0 - w) + A[:, 1:, None] * w).reshape(Ke, nseg * ctrl)[:, :m]
        kk = np.arange(1, Ke + 1, dtype=np.float64)[:, None]
        S = np.sin(kk * ph[None, s:e] + phase0[:Ke, None])
        out[s:e] = np.einsum('km,km->m', Au, S)
    return out


# formants (generic phonetics values for a mid-range voice): (freq, bandwidth, level dB)
VOWELS: dict[str, tuple[tuple[float, float, float], ...]] = {
    'a': ((800, 80, 0), (1150, 90, -4), (2800, 120, -20), (3500, 130, -36)),
    'o': ((450, 70, 0), (800, 80, -9), (2830, 100, -16), (3500, 130, -28)),
    'u': ((325, 50, 0), (700, 60, -12), (2530, 170, -30), (3500, 180, -40)),
    'e': ((400, 60, 0), (1600, 80, -24), (2700, 120, -30), (3300, 150, -35)),
    'i': ((350, 50, 0), (1700, 100, -20), (2700, 120, -30), (3700, 150, -36)),
    'm': ((250, 60, 0), (1200, 200, -30), (2500, 250, -40), (3500, 300, -50)),   # a hum
}


def formant_gain(f, vowel: str, floor_db: float = -42.0):
    f = np.asarray(f, dtype=np.float64)
    g = np.full_like(f, undb(floor_db))
    for F, bw, lvl in VOWELS[vowel]:
        Q = F / bw
        r = f / F
        g = g + undb(lvl) * (r / Q) / np.sqrt((1 - r * r) ** 2 + (r / Q) ** 2 + 1e-12)
    return g


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# reverb / delay
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

REVERBS: dict[str, dict] = {
    'room': dict(rt60=0.75, predelay_ms=8.0, damping=0.55, early=0.35, low_cut=220.0),
    'plate': dict(rt60=1.5, predelay_ms=14.0, damping=0.35, early=0.15, low_cut=300.0),
    'hall': dict(rt60=2.6, predelay_ms=24.0, damping=0.5, early=0.25, low_cut=250.0),
    'spring': dict(rt60=1.1, predelay_ms=5.0, damping=0.7, early=0.5, low_cut=400.0),
}
_IR_CACHE: dict = {}


def make_ir(rt60: float = 1.2, predelay_ms: float = 12.0, damping: float = 0.5, early: float = 0.3,
            low_cut: float = 200.0, seed: int = 1, channel: int = 0) -> np.ndarray:
    """A synthetic impulse response: frequency-dependent exponential decay of noise + sparse early reflections.
    Energy-normalised (sum of squares = 1)."""
    key = (rt60, predelay_ms, damping, early, low_cut, seed, channel)
    if key in _IR_CACHE:
        return _IR_CACHE[key]
    rng = rng_for('ir', seed, channel)
    L = int((rt60 * 1.1 + predelay_ms * 1e-3) * SR) + 256
    pre = int(predelay_ms * 1e-3 * SR)
    n = L - pre
    t = t_axis(n)
    N = next_fast_len(n)
    noise_spec = np.fft.rfft(rng.standard_normal(N))
    f = np.fft.rfftfreq(N, 1.0 / SR)
    edges = [0, 250, 1000, 4000, 1e9]
    rts = [rt60 * 0.9, rt60, rt60 * (1 - 0.35 * damping), rt60 * (1 - 0.7 * damping)]
    tail = np.zeros(n)
    for (lo, hi), rt in zip(zip(edges[:-1], edges[1:]), rts):
        # smooth band masks (cosine crossovers, 1 octave wide)
        m = np.ones_like(f)
        if lo > 0:
            m *= np.clip(0.5 + np.log2(np.maximum(f, 1.0) / lo), 0, 1)
        if hi < 1e8:
            m *= np.clip(0.5 - np.log2(np.maximum(f, 1.0) / hi), 0, 1)
        band = np.fft.irfft(noise_spec * m, N)[:n]
        tail += band * np.exp(-6.91 * t / max(rt, 0.05))
    tail *= _cos_ramp_len(n, int(0.012 * SR))
    tail = fft_filter(tail, [('hp', low_cut, 0.6), ('lp', 12000, 0.7)])
    er = np.zeros(n)
    for i in range(10):
        d = int((0.004 + 0.055 * rng.random()) * SR)
        if d < n:
            er[d] += (rng.random() - 0.5) * 2 * (1.0 - i / 12.0)
    er = fft_filter(er, [('hp', 300), ('lp', 7000)])
    tail /= max(np.sqrt(np.sum(tail ** 2)), 1e-12)
    er /= max(np.sqrt(np.sum(er ** 2)), 1e-12)
    ir = np.concatenate([np.zeros(pre), tail * math.sqrt(1 - early) + er * math.sqrt(early)])
    fade_out = int(0.1 * SR)
    ir[-fade_out:] *= _cos_ramp(fade_out)[::-1]
    ir /= max(np.sqrt(np.sum(ir ** 2)), 1e-12)
    _IR_CACHE[key] = ir
    return ir


def _cos_ramp_len(n: int, ramp: int) -> np.ndarray:
    out = np.ones(n)
    r = min(ramp, n)
    out[:r] = _cos_ramp(r)
    return out


def delay_response(freqs: np.ndarray, delay_s: float, feedback: float, damp_hz: float = 3500.0,
                   taps: int | None = None) -> np.ndarray:
    """Frequency response of a feedback echo (first repeat at delay_s, each later repeat * feedback, low-passed)."""
    taps = taps or max(1, int(math.ceil(math.log(1e-3) / math.log(max(feedback, 1e-3)))))
    step = lp_gain(freqs, damp_hz, 0.6) * np.exp(-2j * np.pi * freqs * delay_s)
    H = np.zeros_like(freqs, dtype=np.complex128)
    P = step.copy()
    for i in range(1, taps + 1):
        H += (feedback ** (i - 1)) * P
        P *= step
    return H


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# voices
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

@dataclass
class VoiceCall:
    f: float | None          # Hz (None for unpitched hits)
    midi: float | None
    dur: float               # gate seconds
    vel: float               # quantised velocity 0..1 (timbre); amplitude is applied by the renderer
    p: dict
    rng: np.random.Generator


@dataclass
class VoiceSpec:
    name: str
    fn: Callable[[VoiceCall], np.ndarray]
    kind: str                # 'drum' | 'tonal' | 'lead' | 'fx'
    variants: int            # drum round-robin variants (noise seeds)
    about: str


VOICES: dict[str, VoiceSpec] = {}


def voice(name: str, kind: str = 'tonal', variants: int = 1, about: str = ''):
    def deco(fn):
        VOICES[name] = VoiceSpec(name, fn, kind, variants, about or (fn.__doc__ or '').strip().split('\n')[0])
        return fn
    return deco


def _norm_peak(x: np.ndarray, peak: float = 1.0) -> np.ndarray:
    m = np.max(np.abs(x)) if len(x) else 0.0
    return x * (peak / m) if m > 1e-12 else x


def _sat(x: np.ndarray, drive: float) -> np.ndarray:
    if drive <= 0:
        return x
    k = 1.0 + 6.0 * drive
    return np.tanh(k * x) / math.tanh(k)


def _pitched_sine(f_curve: np.ndarray, phase0: float = 0.0) -> np.ndarray:
    return np.sin(2 * np.pi * phase_of(f_curve, phase0))


# ── drums ───────────────────────────────────────────────────────────────────────────────────────────────────────────

@voice('kick', 'drum', 3, 'sine kick with pitch drop + beater click. p: tune, punch, decay, click, drive, pitch_tau')
def v_kick(v: VoiceCall) -> np.ndarray:
    p = v.p
    decay = p.get('decay', 0.30)
    f_end = p.get('tune', 52.0)
    f_start = p.get('punch', 170.0) * (0.9 + 0.2 * v.vel)
    ptau = p.get('pitch_tau', 0.032)
    n = int(SR * min(3.0, decay * 5.0 + 0.03))
    t = t_axis(n)
    f = f_end + (f_start - f_end) * np.exp(-t / ptau)
    hold = p.get('hold', 0.02)
    amp = np.where(t < hold, 1.0, np.exp(-(t - hold) / decay))
    body = np.sin(2 * np.pi * phase_of(f)) * amp
    nc = int(0.02 * SR)
    click = fft_filter(v.rng.standard_normal(nc) * np.exp(-t_axis(nc) / 0.0022), [('hp', 1200), ('lp', 7000)])
    click = _norm_peak(click, 1.0)
    x = body.copy()
    x[:nc] += p.get('click', 0.3) * (0.5 + 0.5 * v.vel) * click
    x = _sat(x, p.get('drive', 0.25))
    return _norm_peak(x)


@voice('snare', 'drum', 4, 'tone + noise snare. p: tune, decay, snappy, body, tone (brightness), lofi')
def v_snare(v: VoiceCall) -> np.ndarray:
    p = v.p
    tune = p.get('tune', 185.0)
    decay = p.get('decay', 0.17)
    tone = p.get('tone', 0.5)
    n = int(SR * (decay * 5.0 + 0.04))
    t = t_axis(n)
    f = tune * (1.0 + 0.4 * np.exp(-t / 0.010))
    body = (np.sin(2 * np.pi * phase_of(f)) + 0.45 * np.sin(2 * np.pi * phase_of(f * 1.62) + 0.3)) * np.exp(-t / 0.055)
    nz = v.rng.standard_normal(n) * np.exp(-t / (decay / 2.3))
    nz = fft_filter(nz, [('hp', 900 + 900 * tone, 0.7), ('lp', 6500 + 6000 * tone, 0.7), ('peak', 4200, 3.0, 0.8),
                         ('peak', 230, 2.0, 1.0)])
    x = p.get('body', 0.55) * _norm_peak(body) + p.get('snappy', 0.75) * _norm_peak(nz) * (0.7 + 0.3 * v.vel)
    if p.get('lofi', 0.0) > 0:
        x = fft_filter(_sat(x, 0.35 * p['lofi']), [('lp', 9000 - 4000 * p['lofi'], 0.7)])
    return _norm_peak(x)


@voice('clap', 'drum', 4, 'multi-burst clap. p: tone (Hz), decay, spread (s)')
def v_clap(v: VoiceCall) -> np.ndarray:
    p = v.p
    decay = p.get('decay', 0.15)
    spread = p.get('spread', 0.0095)
    n = int(SR * (decay * 5.0 + 0.06))
    t = t_axis(n)
    env = np.zeros(n)
    starts = [0.0, spread, spread * 1.9, spread * 2.8]
    for i, s in enumerate(starts):
        tt = t - s
        on = tt >= 0
        a = np.minimum(1.0, np.maximum(tt, 0) / 0.0006)
        env += on * a * np.exp(-np.maximum(tt, 0) / (0.0035 if i < 3 else decay)) * (1.0 if i < 3 else 0.85)
    x = v.rng.standard_normal(n) * env
    x = fft_filter(x, [('bp', p.get('tone', 1250.0), 1.1), ('hp', 600), ('highshelf', 5000, 2.0)])
    return _norm_peak(x)


def _metal(n: int, rng: np.random.Generator, base: float = 1.0) -> np.ndarray:
    """Six band-limited square partials at inharmonic ratios: the classic metallic core."""
    out = np.zeros(n)
    for fr in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0):
        f = fr * 1.9 * base
        T = build_tables(f, harmonic_amps('square', 200))
        out += table_play(T, np.full(1, rng.random()) + np.arange(n) * f / SR)
    return out


@voice('hat', 'drum', 4, 'closed hat. p: decay, tone, metal (0..1 metallic vs noise)')
def v_hat(v: VoiceCall) -> np.ndarray:
    p = v.p
    decay = p.get('decay', 0.045)
    n = int(SR * (decay * 6.0 + 0.01))
    t = t_axis(n)
    mt = p.get('metal', 0.45)
    x = mt * _norm_peak(_metal(n, v.rng, p.get('base', 1.0))) + (1 - mt) * _norm_peak(v.rng.standard_normal(n))
    x *= np.exp(-t / decay)
    tone = p.get('tone', 0.5)
    x = fft_filter(x, [('hp', 6500 + 2500 * tone, 0.707, 4), ('peak', 10500, 3.0, 0.9), ('lp', 16000, 0.7)])
    return _norm_peak(x)


@voice('openhat', 'drum', 3, 'open hat. p: decay, tone')
def v_openhat(v: VoiceCall) -> np.ndarray:
    p = dict(v.p)
    p.setdefault('decay', 0.30)
    p.setdefault('tone', 0.4)
    return v_hat(VoiceCall(v.f, v.midi, v.dur, v.vel, p, v.rng))


@voice('pedalhat', 'drum', 3, 'pedal/foot hat: short and dull')
def v_pedalhat(v: VoiceCall) -> np.ndarray:
    p = dict(v.p)
    p.setdefault('decay', 0.022)
    p.setdefault('tone', 0.1)
    p.setdefault('metal', 0.6)
    return v_hat(VoiceCall(v.f, v.midi, v.dur, v.vel, p, v.rng))


@voice('ride', 'drum', 3, 'ride cymbal with bell. p: decay, bell')
def v_ride(v: VoiceCall) -> np.ndarray:
    p = v.p
    decay = p.get('decay', 0.9)
    n = int(SR * (decay * 4.0))
    t = t_axis(n)
    x = 0.6 * _norm_peak(_metal(n, v.rng, 1.35)) + 0.4 * _norm_peak(v.rng.standard_normal(n))
    x *= np.exp(-t / decay)
    bell = (np.sin(2 * np.pi * 3150 * t) + 0.5 * np.sin(2 * np.pi * 4730 * t + 1.0)) * np.exp(-t / 0.35)
    x = fft_filter(x, [('hp', 4200, 0.707, 4), ('peak', 8000, 3.0, 0.8)]) + p.get('bell', 0.12) * bell
    return _norm_peak(x)


@voice('crash', 'drum', 2, 'crash cymbal. p: decay')
def v_crash(v: VoiceCall) -> np.ndarray:
    p = v.p
    decay = p.get('decay', 1.3)
    n = int(SR * (decay * 4.0))
    t = t_axis(n)
    x = 0.5 * _norm_peak(_metal(n, v.rng, 1.12)) + 0.5 * _norm_peak(v.rng.standard_normal(n))
    env = np.exp(-t / decay) * (1 - 0.5 * np.exp(-t / 0.02))
    x = fft_filter(x * env, [('hp', 3200, 0.707, 4), ('peak', 6500, 2.0, 0.7), ('lp', 15000)])
    return _norm_peak(x)


@voice('tom', 'drum', 2, 'tom. p: size low|mid|high or pitch (Hz), decay')
def v_tom(v: VoiceCall) -> np.ndarray:
    p = v.p
    pitch = p.get('pitch', {'low': 92.0, 'mid': 130.0, 'high': 182.0}[p.get('size', 'mid')])
    if v.f:
        pitch = v.f
    decay = p.get('decay', 0.28)
    n = int(SR * (decay * 5 + 0.03))
    t = t_axis(n)
    f = pitch * (1 + 0.45 * np.exp(-t / 0.045))
    body = (np.sin(2 * np.pi * phase_of(f)) + 0.25 * np.sin(2 * np.pi * phase_of(f * 1.5))) * np.exp(-t / decay)
    nz = fft_filter(v.rng.standard_normal(n) * np.exp(-t / 0.018), [('bp', 2200, 0.8)])
    return _norm_peak(_sat(_norm_peak(body) + 0.18 * _norm_peak(nz), 0.2))


@voice('conga', 'drum', 3, 'conga. p: size low|mid|high or pitch, stroke open|mute|slap')
def v_conga(v: VoiceCall) -> np.ndarray:
    p = v.p
    pitch = p.get('pitch', {'low': 175.0, 'mid': 225.0, 'high': 310.0}[p.get('size', 'mid')])
    if v.f:
        pitch = v.f
    stroke = p.get('stroke', 'open')
    decay = {'open': 0.17, 'mute': 0.05, 'slap': 0.06}[stroke]
    n = int(SR * (decay * 5 + 0.03))
    t = t_axis(n)
    f = pitch * (1 + 0.12 * np.exp(-t / 0.008))
    body = (np.sin(2 * np.pi * phase_of(f)) + 0.3 * np.sin(2 * np.pi * phase_of(f * 1.52)) * np.exp(-t / 0.03))
    body *= np.exp(-t / decay)
    slap = fft_filter(v.rng.standard_normal(n) * np.exp(-t / 0.007), [('bp', 3000, 1.0)])
    x = _norm_peak(body) + (0.6 if stroke == 'slap' else 0.12) * _norm_peak(slap)
    return _norm_peak(x)


@voice('shaker', 'drum', 4, 'shaker (swell + decay). p: length (s), tone')
def v_shaker(v: VoiceCall) -> np.ndarray:
    p = v.p
    L = p.get('length', 0.07)
    n = int(SR * (L + 0.08))
    t = t_axis(n)
    att = 0.35 * L
    env = np.where(t < att, np.sin(0.5 * np.pi * t / att) ** 2, np.exp(-(t - att) / (0.4 * L)))
    x = v.rng.standard_normal(n) * env
    x = fft_filter(x, [('hp', 4500 + 2000 * p.get('tone', 0.5), 0.707, 4), ('lp', 13000), ('peak', 8500, 3, 1.0)])
    return _norm_peak(x)


@voice('tamb', 'drum', 3, 'tambourine jingles. p: decay')
def v_tamb(v: VoiceCall) -> np.ndarray:
    p = v.p
    decay = p.get('decay', 0.12)
    n = int(SR * (decay * 5 + 0.03))
    t = t_axis(n)
    x = np.zeros(n)
    for i in range(12):
        f = 5000 + 6500 * v.rng.random()
        x += np.sin(2 * np.pi * f * t + v.rng.random() * 6.28) * (0.5 + v.rng.random())
    grit = v.rng.standard_normal(n)
    x = (0.6 * _norm_peak(x) + 0.4 * _norm_peak(grit)) * np.exp(-t / decay)
    x = fft_filter(x, [('hp', 5000, 0.707, 4)])
    return _norm_peak(x)


@voice('rim', 'drum', 3, 'rim / side-stick click. p: tone')
def v_rim(v: VoiceCall) -> np.ndarray:
    n = int(SR * 0.09)
    t = t_axis(n)
    tone = v.p.get('tone', 1.0)
    x = (np.sin(2 * np.pi * 520 * tone * t) * np.exp(-t / 0.010) +
         0.8 * np.sin(2 * np.pi * 1720 * tone * t) * np.exp(-t / 0.014))
    click = fft_filter(v.rng.standard_normal(n) * np.exp(-t / 0.0025), [('bp', 3200, 1.0)])
    return _norm_peak(_norm_peak(x) + 0.35 * _norm_peak(click))


@voice('cowbell', 'drum', 1, 'two-square cowbell. p: decay')
def v_cowbell(v: VoiceCall) -> np.ndarray:
    decay = v.p.get('decay', 0.22)
    n = int(SR * (decay * 5))
    t = t_axis(n)
    x = np.zeros(n)
    for f in (540.0, 800.0):
        T = build_tables(f, harmonic_amps('square', 60))
        x += table_play(T, t * f)
    env = 0.6 * np.exp(-t / 0.02) + 0.4 * np.exp(-t / decay)
    x = fft_filter(x * env, [('bp', 900, 0.8), ('highshelf', 2500, 3)])
    return _norm_peak(x)


@voice('snap', 'drum', 3, 'finger snap')
def v_snap(v: VoiceCall) -> np.ndarray:
    n = int(SR * 0.12)
    t = t_axis(n)
    x = v.rng.standard_normal(n) * np.exp(-t / 0.012)
    x = fft_filter(x, [('bp', 2300, 1.8), ('hp', 900)])
    return _norm_peak(x)


# ── bass ────────────────────────────────────────────────────────────────────────────────────────────────────────────

def _glide_curve(n: int, f: float, p: dict) -> np.ndarray:
    """Pitch curve with an optional slide-in from p['from'] (midi) over p['glide'] seconds."""
    t = t_axis(n)
    if 'from' in p and p['from'] is not None:
        m0 = midi(p['from'])
        m1 = 69 + 12 * math.log2(f / 440.0)
        tau = max(p.get('glide', 0.05), 1e-3)
        m = m1 + (m0 - m1) * np.exp(-t / tau)
        return hz_arr(m)
    return np.full(n, f)


@voice('sub', 'tonal', 1, 'sine sub bass with a touch of 2nd harmonic. p: drive, decay, from, glide')
def v_sub(v: VoiceCall) -> np.ndarray:
    p = v.p
    rel = p.get('release', 0.06)
    n = int(SR * (v.dur + rel * 6))
    f = _glide_curve(n, v.f, p)
    ph = 2 * np.pi * phase_of(f)
    x = np.sin(ph) + p.get('harm', 0.12) * np.sin(2 * ph)
    env = env_adsr(n, 0.006, p.get('decay', 0.35), p.get('sustain', 0.8), rel, v.dur)
    return _norm_peak(_sat(x * env, p.get('drive', 0.2)), 0.8)


@voice('pluck_bass', 'tonal', 1, 'saw/square bass through a 4-pole filter envelope. p: shape, cutoff, env, decay, q')
def v_pluck_bass(v: VoiceCall) -> np.ndarray:
    p = v.p
    rel = p.get('release', 0.05)
    n = int(SR * (v.dur + rel * 6))
    t = t_axis(n)
    f = _glide_curve(n, v.f, p)
    base = p.get('cutoff', 220.0) + v.f * 1.2
    amt = p.get('env', 1800.0) * (0.45 + 0.55 * v.vel)
    cut = base + amt * np.exp(-t / p.get('fdecay', 0.09))
    shape = p.get('shape', 'saw')
    x = filtered_osc(f, shape, cut, q=p.get('q', 1.1), poles=4, f_ref=v.f)
    if p.get('sub', 0.35) > 0:
        x = _norm_peak(x) + p.get('sub', 0.35) * np.sin(2 * np.pi * phase_of(f))
    env = env_adsr(n, 0.004, p.get('decay', 0.25), p.get('sustain', 0.55), rel, v.dur)
    return _norm_peak(_sat(x * env, p.get('drive', 0.15)), 0.8)


@voice('slap', 'tonal', 1, 'FM slap-ish bass with a pop. p: bright, pop, decay')
def v_slap(v: VoiceCall) -> np.ndarray:
    p = v.p
    rel = p.get('release', 0.05)
    n = int(SR * (v.dur + rel * 6))
    t = t_axis(n)
    f = _glide_curve(n, v.f, p)
    ph = 2 * np.pi * phase_of(f)
    bright = p.get('bright', 0.6)
    idx = 0.7 + (1.5 + 3.0 * bright) * v.vel * np.exp(-t / 0.035)
    x = np.sin(ph + idx * np.sin(ph)) + 0.3 * np.sin(ph)
    pop = fft_filter(v.rng.standard_normal(n) * np.exp(-t / 0.004), [('bp', 2400, 1.2)])
    env = env_adsr(n, 0.003, p.get('decay', 0.3), p.get('sustain', 0.35), rel, v.dur)
    x = _norm_peak(x * env) + p.get('pop', 0.18) * v.vel * _norm_peak(pop)
    return _norm_peak(_sat(x, 0.15), 0.8)


@voice('bass808', 'tonal', 1, 'long 808-style sine bass with a pitch punch. p: decay, drive, punch (semitones)')
def v_bass808(v: VoiceCall) -> np.ndarray:
    p = v.p
    rel = p.get('release', 0.07)
    n = int(SR * (v.dur + rel * 6))
    t = t_axis(n)
    f = _glide_curve(n, v.f, p) * 2 ** (p.get('punch', 7.0) / 12 * np.exp(-t / 0.018))
    x = np.sin(2 * np.pi * phase_of(f))
    env = env_adsr(n, 0.004, p.get('decay', 0.9), p.get('sustain', 0.0), rel, v.dur)
    return _norm_peak(_sat(x * env, p.get('drive', 0.35)), 0.85)


# ── keys ────────────────────────────────────────────────────────────────────────────────────────────────────────────

@voice('ep', 'tonal', 1, 'FM electric piano (tine + bark). p: bright, decay, tine')
def v_ep(v: VoiceCall) -> np.ndarray:
    p = v.p
    rel = p.get('release', 0.14)
    n = int(SR * (v.dur + rel * 6))
    t = t_axis(n)
    f = v.f
    ph = 2 * np.pi * f * t
    bright = p.get('bright', 0.5)
    idx = (0.35 + 2.2 * bright * v.vel) * np.exp(-t / 0.22) + 0.18
    x = np.sin(ph + idx * np.sin(ph)) + 0.1 * np.sin(2 * ph)
    tr = 7.0 if f < 700 else 3.0
    if f * tr < 16000:
        x += p.get('tine', 0.22) * v.vel * np.sin(2 * np.pi * f * tr * t) * np.exp(-t / 0.025)
    dec = p.get('decay', 1.4) * (220.0 / max(f, 60.0)) ** 0.35
    env = env_adsr(n, 0.003, dec, 0.0, rel, v.dur)
    return _norm_peak(x * env, 0.5)


DRAWBARS = {
    'full': (8, 8, 8, 6, 0, 4, 0, 0, 3),
    'jazz': (8, 8, 8, 0, 0, 0, 0, 0, 0),
    'gospel': (8, 8, 6, 8, 0, 0, 0, 0, 0),
    'house': (0, 0, 8, 8, 8, 0, 0, 0, 0),
    'soft': (6, 8, 4, 0, 0, 0, 0, 0, 0),
}
_DRAWBAR_RATIOS = (0.5, 1.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0)


@voice('organ', 'tonal', 1, 'drawbar organ with key click, percussion and vibrato. p: drawbars, perc, click')
def v_organ(v: VoiceCall) -> np.ndarray:
    p = v.p
    rel = p.get('release', 0.03)
    n = int(SR * (v.dur + rel * 6))
    t = t_axis(n)
    bars = p.get('drawbars', 'gospel')
    levels = DRAWBARS[bars] if isinstance(bars, str) else bars
    f0 = v.f
    vib = 1.0 + 0.0025 * np.sin(2 * np.pi * 6.7 * t + v.rng.random() * 6.28)
    x = np.zeros(n)
    for r, lv in zip(_DRAWBAR_RATIOS, levels):
        if lv <= 0 or f0 * r > 0.45 * SR:
            continue
        x += (lv / 8.0) ** 1.6 * np.sin(2 * np.pi * phase_of(f0 * r * vib, v.rng.random()))
    if p.get('perc', 0.25) > 0:
        x += p.get('perc', 0.25) * 2 * np.sin(2 * np.pi * phase_of(f0 * 3 * vib)) * np.exp(-t / 0.18)
    env = env_adsr(n, 0.005, 0.2, 1.0, rel, v.dur)
    x = _norm_peak(x * env, 0.5)
    ck = p.get('click', 0.08)
    if ck > 0:
        m = int(0.008 * SR)
        c = fft_filter(v.rng.standard_normal(m) * np.exp(-t_axis(m) / 0.0015), [('bp', 3000, 0.8)])
        c = edge_fade(_norm_peak(c), 1.0, 2.0)
        x[:m] += ck * c
    return x


@voice('stab', 'tonal', 1, 'detuned saw chord stab through a fast filter envelope. p: cutoff, env, decay, q')
def v_stab(v: VoiceCall) -> np.ndarray:
    p = v.p
    rel = p.get('release', 0.06)
    n = int(SR * (v.dur + rel * 6))
    t = t_axis(n)
    cut = p.get('cutoff', 500.0) + (p.get('env', 5000.0) * (0.4 + 0.6 * v.vel)) * np.exp(-t / p.get('fdecay', 0.07))
    x = np.zeros(n)
    for cents in (-8.0, 0.0, 8.0):
        fr = v.f * 2 ** (cents / 1200)
        x += filtered_osc(np.full(n, fr), p.get('shape', 'saw'), cut, q=p.get('q', 1.0), poles=2, f_ref=fr,
                          phase0=v.rng.random())
    env = env_adsr(n, 0.002, p.get('decay', 0.16), p.get('sustain', 0.25), rel, v.dur)
    return _norm_peak(x * env, 0.5)


@voice('clav', 'tonal', 1, 'clav-like pulse with a bright, quick filter. p: width, cutoff, env')
def v_clav(v: VoiceCall) -> np.ndarray:
    p = v.p
    rel = p.get('release', 0.02)
    n = int(SR * (v.dur + rel * 6))
    t = t_axis(n)
    cut = p.get('cutoff', 900.0) + p.get('env', 4800.0) * v.vel * np.exp(-t / 0.05)
    x = filtered_osc(np.full(n, v.f), 'pulse', cut, q=1.4, poles=2, width=p.get('width', 0.22), hp=280.0,
                     f_ref=v.f)
    env = env_adsr(n, 0.002, 0.18, p.get('sustain', 0.15), rel, v.dur)
    return _norm_peak(x * env, 0.5)


@voice('pad', 'tonal', 1, 'warm detuned pad. p: shape, cutoff, attack, release, detune (cents)')
def v_pad(v: VoiceCall) -> np.ndarray:
    p = v.p
    rel = p.get('release', 0.8)
    n = int(SR * (v.dur + rel * 5))
    t = t_axis(n)
    x = np.zeros(n)
    det = p.get('detune', 7.0)
    cut = p.get('cutoff', 1800.0)
    for cents in (-det, 0.0, det):
        fr = v.f * 2 ** (cents / 1200)
        drift = 1.0 + 0.0012 * np.sin(2 * np.pi * (0.25 + 0.2 * v.rng.random()) * t + v.rng.random() * 6.28)
        x += filtered_osc(fr * drift, p.get('shape', 'warm'), cut, q=0.8, poles=2, f_ref=fr, phase0=v.rng.random())
    env = env_adsr(n, p.get('attack', 0.45), 1.0, 1.0, rel, v.dur)
    return _norm_peak(x * env, 0.4)


@voice('pluck', 'tonal', 1, 'synth pluck for arps (keys or lead). p: shape, cutoff, env, decay')
def v_pluck(v: VoiceCall) -> np.ndarray:
    p = v.p
    rel = p.get('release', 0.05)
    n = int(SR * (v.dur + rel * 6 + 0.1))
    t = t_axis(n)
    cut = p.get('cutoff', 700.0) + p.get('env', 6000.0) * (0.3 + 0.7 * v.vel) * np.exp(-t / p.get('fdecay', 0.06))
    x = filtered_osc(np.full(n, v.f), p.get('shape', 'square'), cut, q=p.get('q', 1.2), poles=2, f_ref=v.f)
    env = env_adsr(n, 0.002, p.get('decay', 0.22), 0.0, rel, v.dur)
    return _norm_peak(x * env, 0.5)


@voice('bell', 'tonal', 1, 'FM bell. p: ratio, index, decay')
def v_bell(v: VoiceCall) -> np.ndarray:
    p = v.p
    decay = p.get('decay', 1.2)
    n = int(SR * (max(v.dur, 0.1) + decay * 4))
    t = t_axis(n)
    ph = 2 * np.pi * v.f * t
    idx = p.get('index', 2.2) * v.vel * np.exp(-t / (decay * 0.5))
    x = np.sin(ph + idx * np.sin(ph * p.get('ratio', 3.5)))
    env = np.exp(-t / decay)
    return _norm_peak(x * env, 0.45)


# ── horns ───────────────────────────────────────────────────────────────────────────────────────────────────────────

@voice('brass', 'tonal', 1, 'synth brass section: detuned saws, filter "blat", scoop, delayed vibrato, optional fall. '
       'p: voices, spread, bright, fall (semitones), scoop (cents), vib')
def v_brass(v: VoiceCall) -> np.ndarray:
    p = v.p
    rel = p.get('release', 0.09)
    fall = p.get('fall', 0.0)
    fall_t = p.get('fall_time', 0.16)
    n = int(SR * (v.dur + rel * 6 + (fall_t if fall else 0)))
    t = t_axis(n)
    f0 = v.f
    bright = p.get('bright', 0.6)
    blat = (1 - np.exp(-t / 0.028)) * np.exp(-t / 0.32)
    cut = f0 * (2.2 + 3.5 * bright * v.vel) + f0 * 14 * bright * v.vel * blat
    cut = np.minimum(cut, 16000.0)
    scoop = p.get('scoop', -35.0) * np.exp(-t / 0.045)
    vib_d = p.get('vib', 14.0) * np.clip((t - 0.28) / 0.25, 0, 1)
    fall_c = np.zeros(n)
    if fall:
        tf = np.maximum(t - v.dur, 0) / fall_t
        fall_c = -100.0 * fall * np.clip(tf, 0, 1) ** 1.6
    x = np.zeros(n)
    nv = int(p.get('voices', 3))
    spread = p.get('spread', 9.0)
    for i in range(nv):
        c = (i - (nv - 1) / 2) * (2 * spread / max(nv - 1, 1))
        vib = vib_d * np.sin(2 * np.pi * (5.2 + 0.35 * i) * t + v.rng.random() * 6.28)
        f = f0 * 2 ** ((c + scoop + vib + fall_c) / 1200)
        x += filtered_osc(f, 'saw', cut, q=0.9, poles=2, f_ref=f0, phase0=v.rng.random())
    a = p.get('attack', 0.02)
    gate = v.dur + (fall_t if fall else 0)
    env = env_adsr(n, a, 0.3, p.get('sustain', 0.85), rel, gate)
    if fall:
        env *= np.where(t > v.dur, np.exp(-np.maximum(t - v.dur, 0) / (fall_t * 0.8)), 1.0)
    return _norm_peak(x * env, 0.5)


# ── leads & vox (phrase voices: pitch curves with glide, rendered additively) ─────────────────────────────────────────

LEAD_VOICES = {
    # shape, unison cents, cutoff (Hz, relative to key tracking), q, env amount, vibrato (semitones), vib rate
    'saw_lead': dict(shape='saw', unison=6.0, cutoff=3200.0, q=0.9, env=2.5, vib=0.18, rate=5.4, attack=0.012),
    'square_lead': dict(shape='square', unison=0.0, cutoff=2600.0, q=1.1, env=2.0, vib=0.15, rate=5.8, attack=0.01),
    'whistle': dict(shape='sine', unison=0.0, cutoff=9000.0, q=0.7, env=0.0, vib=0.28, rate=5.0, attack=0.04,
                    harm2=0.06, harm3=0.03),
    'soft_lead': dict(shape='tri', unison=4.0, cutoff=4000.0, q=0.7, env=0.5, vib=0.2, rate=5.2, attack=0.02),
    'vox_lead': dict(shape='glottal', unison=5.0, vowel='a', vib=0.25, rate=5.3, attack=0.05),
}


for _lv, _cfg in LEAD_VOICES.items():
    VOICES[_lv] = VoiceSpec(_lv, None, 'lead', 1, f"lead ({_cfg.get('shape', 'glottal')}) with glide + delayed vibrato; "
                                                   "use Song.phrase(). p: glide, vib, rate, cutoff, env, attack, release")


@dataclass
class PhraseNote:
    start: int      # sample
    end: int        # sample (gate end)
    m: float        # midi
    vel: float


def render_lead_phrase(voice_name: str, notes: list[PhraseNote], p: dict, rng: np.random.Generator) -> tuple[int, np.ndarray]:
    """Render legato segments of a lead phrase. Returns (start sample, audio)."""
    cfg = dict(LEAD_VOICES[voice_name])
    cfg.update(p)
    glide = cfg.get('glide', 0.05)
    rel = cfg.get('release', 0.09)
    legato_gap = int(cfg.get('legato_gap', 0.025) * SR)
    notes = sorted(notes, key=lambda nn: nn.start)
    segs: list[list[PhraseNote]] = []
    for nn in notes:
        if segs and nn.start - segs[-1][-1].end <= legato_gap:
            segs[-1].append(nn)
        else:
            segs.append([nn])
    s0 = notes[0].start
    total_end = max(nn.end for nn in notes) + int(rel * 6 * SR)
    out = np.zeros(total_end - s0)
    for seg in segs:
        a0 = seg[0].start
        n = seg[-1].end + int(rel * 6 * SR) - a0
        t = t_axis(n)
        pitch = np.empty(n)
        velc = np.empty(n)
        prev_m = seg[0].m + cfg.get('scoop', -0.3)
        vib = np.zeros(n)
        for j, nn in enumerate(seg):
            b = nn.start - a0
            e = (seg[j + 1].start - a0) if j + 1 < len(seg) else n
            tt = t[b:e] - t[b]
            pitch[b:e] = nn.m + (prev_m - nn.m) * np.exp(-tt / max(glide, 1e-3))
            velc[b:e] = nn.vel
            depth = cfg.get('vib', 0.2) * np.clip((tt - cfg.get('vib_delay', 0.22)) / 0.25, 0, 1)
            vib[b:e] = depth
            prev_m = pitch[e - 1] if e > b else nn.m
        velc = moving_avg(velc, int(0.006 * SR))
        vib = vib * np.sin(2 * np.pi * cfg.get('rate', 5.4) * t + rng.random() * 6.28)
        mcurve = pitch + vib
        gate = (seg[-1].end - a0) / SR
        env = env_adsr(n, cfg.get('attack', 0.012), cfg.get('decay', 0.4), cfg.get('sustain', 0.85), rel, gate)
        # small re-articulation dip at each legato note start
        for nn in seg[1:]:
            b = nn.start - a0
            m = min(int(0.03 * SR), n - b)
            env[b:b + m] *= 1.0 - 0.18 * np.sin(np.pi * np.arange(m) / m)
        f = hz_arr(mcurve)
        x = np.zeros(n)
        if voice_name == 'vox_lead':
            K = 60
            amps = harmonic_amps('glottal', K)
            vowel = cfg.get('vowel', 'a')
            gfn = lambda fk, idx: formant_gain(fk, vowel)
            for c in ((-cfg['unison'], cfg['unison']) if cfg.get('unison') else (0.0,)):
                x += additive(f * 2 ** (c / 1200), amps, gfn, phase0=rng.random(K) * 6.28)
        else:
            K = 80
            amps = harmonic_amps(cfg['shape'], K)
            if cfg['shape'] == 'sine':
                amps = amps.copy()
                amps[1] = cfg.get('harm2', 0.0)
                amps[2] = cfg.get('harm3', 0.0)
            base_cut = cfg['cutoff']
            env_amt = cfg.get('env', 0.0)
            # per-note brightness envelope (re-triggered on every note start)
            since = np.zeros(n)
            for nn in seg:
                b = nn.start - a0
                since[b:] = t[b:] - t[b]
            cutc = base_cut * (1 + env_amt * np.exp(-since / cfg.get('fdecay', 0.12))) * (0.6 + 0.4 * velc)
            cutc = np.minimum(cutc, 18000.0)
            q = cfg.get('q', 0.8)
            gfn = lambda fk, idx: lp_gain(fk, cutc[None, idx], q, 2)
            dets = (-cfg['unison'], cfg['unison']) if cfg.get('unison') else (0.0,)
            for c in dets:
                x += additive(f * 2 ** (c / 1200), amps, gfn, phase0=rng.random(K) * 6.28)
        x = edge_fade(x * env * velc, 2.0, 4.0)
        a = a0 - s0
        out[a:a + n] += x
    return s0, _norm_peak(out, 0.5)


def _vox_tables(f0: float, vowels: tuple[str, str], M: int = 8) -> np.ndarray:
    K = int(0.46 * SR / f0)
    K = min(K, TABLE_N // 2 - 1)
    amps = harmonic_amps('glottal', K)
    kf = np.arange(1, K + 1) * f0
    ga = formant_gain(kf, vowels[0])
    gb = formant_gain(kf, vowels[1])
    w = np.linspace(0, 1, M)[:, None]
    return build_tables(f0, amps, ga[None, :] * (1 - w) + gb[None, :] * w)


@voice('vox', 'tonal', 1, 'wordless synth choir pad ("ooh"/"aah" morph, no words). p: vowels, attack, release, voices')
def v_vox(v: VoiceCall) -> np.ndarray:
    p = v.p
    rel = p.get('release', 0.6)
    n = int(SR * (v.dur + rel * 5))
    t = t_axis(n)
    vw = p.get('vowels', ('o', 'a'))
    T = _vox_tables(v.f, tuple(vw))
    morph = np.clip(t / max(v.dur, 0.2), 0, 1)
    if p.get('morph', 'rise') == 'swell':
        morph = np.sin(np.pi * morph)
    level = morph * (T.shape[0] - 1)
    x = np.zeros(n)
    nv = int(p.get('voices', 4))
    for i in range(nv):
        c = (i - (nv - 1) / 2) * 7.0
        vib = 0.1 * np.sin(2 * np.pi * (4.8 + 0.3 * i) * t + v.rng.random() * 6.28) * np.clip((t - 0.2) / 0.4, 0, 1)
        f = v.f * 2 ** ((c + 100 * vib) / 1200)
        x += table_play(T, phase_of(f, v.rng.random()), level)
    breath = stft_noise(n, v.rng, lambda fr, tt: formant_gain(fr, vw[0]) * hp_gain(fr, 700))
    x = _norm_peak(x) + p.get('breath', 0.04) * breath / max(np.max(np.abs(breath)), 1e-9)
    env = env_adsr(n, p.get('attack', 0.3), 1.0, 1.0, rel, v.dur)
    return _norm_peak(x * env, 0.4)


# ── fx ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

@voice('riser', 'fx', 1, 'noise riser into a downbeat (+ optional rising tone). p: lo, hi, q, tone (midi or None)')
def v_riser(v: VoiceCall) -> np.ndarray:
    p = v.p
    n = int(SR * v.dur)
    t = t_axis(n)
    u = t / max(v.dur, 1e-3)
    lo, hi = p.get('lo', 300.0), p.get('hi', 9000.0)
    q = p.get('q', 1.6)
    dur = v.dur
    x = stft_noise(n, v.rng, lambda f, tt: bp_gain(f, lo * (hi / lo) ** np.clip(tt / dur, 0, 1) ** 1.3, q))
    amp = np.clip(u, 0, 1) ** 2.2
    x = x * amp
    if p.get('tone') is not None:
        m0 = midi(p['tone'])
        mc = m0 + 24 * u ** 1.5
        tone = additive(hz_arr(mc), harmonic_amps('saw', 40),
                        lambda fk, idx: lp_gain(fk, 600 + 5000 * u[None, idx], 0.8, 2))
        x = _norm_peak(x) + p.get('tone_level', 0.35) * _norm_peak(tone) * amp
    x = edge_fade(x, 5.0, p.get('end_ms', 12.0))
    return _norm_peak(x, 0.6)


@voice('downsweep', 'fx', 1, 'falling filtered-noise sweep. p: lo, hi, q')
def v_downsweep(v: VoiceCall) -> np.ndarray:
    p = v.p
    n = int(SR * v.dur)
    t = t_axis(n)
    lo, hi = p.get('lo', 200.0), p.get('hi', 8000.0)
    dur = v.dur
    x = stft_noise(n, v.rng, lambda f, tt: bp_gain(f, hi * (lo / hi) ** np.clip(tt / dur, 0, 1) ** 0.7,
                                                    p.get('q', 1.4)))
    amp = (1 - np.clip(t / dur, 0, 1)) ** 1.6
    return _norm_peak(edge_fade(x * amp, 4.0, 10.0), 0.5)


@voice('sweep', 'fx', 1, 'filtered noise sweep up then down (a whoosh). p: lo, hi, q')
def v_sweep(v: VoiceCall) -> np.ndarray:
    p = v.p
    n = int(SR * v.dur)
    t = t_axis(n)
    dur = v.dur
    lo, hi = p.get('lo', 400.0), p.get('hi', 6000.0)

    def g(f, tt):
        u = np.clip(tt / dur, 0, 1)
        c = lo * (hi / lo) ** np.sin(np.pi * u)
        return bp_gain(f, c, p.get('q', 2.0))
    x = stft_noise(n, v.rng, g)
    amp = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    return _norm_peak(edge_fade(x * amp, 4, 8), 0.5)


@voice('impact', 'fx', 1, 'sub boom + noise burst on a downbeat. p: tune, decay')
def v_impact(v: VoiceCall) -> np.ndarray:
    p = v.p
    decay = p.get('decay', 1.1)
    n = int(SR * decay * 4)
    t = t_axis(n)
    f = p.get('tune', 38.0) + 40.0 * np.exp(-t / 0.08)
    boom = np.sin(2 * np.pi * phase_of(f)) * np.exp(-t / decay)
    nz = fft_filter(v.rng.standard_normal(n) * np.exp(-t / 0.3), [('lp', 2500, 0.7), ('hp', 80)])
    crack = fft_filter(v.rng.standard_normal(n) * np.exp(-t / 0.02), [('hp', 2000)])
    x = _norm_peak(boom) + 0.35 * _norm_peak(nz) + 0.25 * _norm_peak(crack)
    return _norm_peak(_sat(x, 0.2), 0.8)


@voice('reverse', 'fx', 1, 'reverse swell ending at the event end (place it with Song.fx_into). p: pitches, rt60')
def v_reverse(v: VoiceCall) -> np.ndarray:
    p = v.p
    n = int(SR * v.dur)
    src_n = int(0.5 * SR)
    ts = t_axis(src_n)
    pitches = p.get('pitches')
    if pitches:
        src = np.zeros(src_n)
        for m in pitches:
            fr = hz(midi(m))
            src += filtered_osc(np.full(src_n, fr), 'saw', 3500.0, 0.7, 2, f_ref=fr, phase0=v.rng.random())
        src *= np.exp(-ts / 0.15)
    else:
        src = fft_filter(v.rng.standard_normal(src_n) * np.exp(-ts / 0.06), [('lp', 5000), ('hp', 200)])
    src = edge_fade(src, 2, 5)
    ir = make_ir(rt60=p.get('rt60', 2.4), predelay_ms=0, damping=0.4, early=0.1, low_cut=150, seed=int(v.rng.integers(1e9)))
    wet = fft_convolve(src, ir)
    wet = wet[:n] if len(wet) >= n else np.concatenate([wet, np.zeros(n - len(wet))])
    x = wet[::-1]
    return _norm_peak(edge_fade(x, 30.0, 6.0), 0.55)


@voice('zap', 'fx', 2, 'electro zap: fast falling sine. p: top, bottom, decay')
def v_zap(v: VoiceCall) -> np.ndarray:
    p = v.p
    decay = p.get('decay', 0.12)
    n = int(SR * decay * 5)
    t = t_axis(n)
    f = p.get('bottom', 160.0) + p.get('top', 3200.0) * np.exp(-t / 0.018)
    x = np.sin(2 * np.pi * phase_of(f))
    x = _sat(x, 0.4) * np.exp(-t / decay)
    return _norm_peak(x, 0.5)


@voice('scrub', 'fx', 1, 'a synthetic scratch-like scrub gesture (tone whose speed swings back and forth). '
       'p: rate (swings per second), vowel')
def v_scrub(v: VoiceCall) -> np.ndarray:
    p = v.p
    n = int(SR * v.dur)
    t = t_axis(n)
    rate = p.get('rate', 6.0)
    s = np.sin(2 * np.pi * rate * t)
    f0 = v.f or 180.0
    fi = f0 * (0.08 + 1.9 * np.abs(s))
    x = additive(fi, harmonic_amps('glottal', 40), lambda fk, idx: formant_gain(fk, p.get('vowel', 'a')))
    x *= np.abs(s) ** 0.7
    x += 0.15 * stft_noise(n, v.rng, lambda fr, tt: hp_gain(fr, 1500)) * np.abs(s)
    return _norm_peak(edge_fade(x, 3, 5), 0.5)


@voice('wash', 'fx', 1, 'a slowly moving filtered-air texture (keeps an fx bed alive). p: lo, hi, rate, q')
def v_wash(v: VoiceCall) -> np.ndarray:
    p = v.p
    n = int(SR * (v.dur + 1.0))
    t = t_axis(n)
    lo, hi = p.get('lo', 500.0), p.get('hi', 3000.0)
    rate = p.get('rate', 0.12)
    ph = v.rng.random() * 6.28
    x = stft_noise(n, v.rng, lambda f, tt: bp_gain(f, lo * (hi / lo) ** (0.5 + 0.5 * np.sin(2 * np.pi * rate * tt + ph)),
                                                    p.get('q', 1.2)), nfft=2048)
    env = env_adsr(n, p.get('attack', 0.6), 1.0, 1.0, p.get('release', 0.25), v.dur)
    return _norm_peak(x * env, 0.35)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# the song model and sequencer
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

@dataclass
class Section:
    name: str
    start_bar: int
    bars: int
    energy: int
    stems: tuple = STEMS
    label: str | None = None

    @property
    def end_bar(self) -> int:           # inclusive
        return self.start_bar + self.bars - 1

    def bar_range(self) -> range:
        return range(self.start_bar, self.start_bar + self.bars)


@dataclass
class Event:
    stem: str
    voice: str
    bar: int
    six: float
    vel: float
    midi: float | None
    dur16: float
    params: dict
    human: bool = True
    onset: bool = True
    chord_id: int | None = None


@dataclass
class Phrase:
    stem: str
    voice: str
    notes: list          # (bar, six, midi, dur16, vel)
    params: dict


@dataclass
class StemMix:
    gain_db: float = 0.0
    eq: list = field(default_factory=lambda: [('hp', 30.0, 0.707)])
    drive: float = 0.0                  # tanh saturation 0..1 (before EQ)
    reverb: float = 0.0                 # send level (linear)
    reverb_type: str = 'room'
    delay: float = 0.0                  # echo send level
    delay_16ths: float = 3.0            # echo time in sixteenths (3 = dotted eighth)
    delay_fb: float = 0.35
    delay_damp: float = 3500.0
    duck: float = 0.0                   # sidechain depth 0..1 keyed by kick events (bed + drums)
    duck_release: float = 0.12          # s
    tremolo: tuple | None = None        # (rate_hz_or_'16th'/'8th', depth 0..1)
    pan: float = 0.0                    # preview only: -1 left .. +1 right
    width: float = 0.5                  # preview only: stereo reverb width 0..1


def default_mix() -> dict[str, StemMix]:
    return {
        'bed': StemMix(gain_db=-2.0, eq=[('hp', 32.0)], reverb=0.05, reverb_type='room', pan=0.0),
        'drums': StemMix(gain_db=0.0, eq=[('hp', 32.0)], drive=0.1, reverb=0.10, reverb_type='room', pan=0.0),
        'bass': StemMix(gain_db=-1.0, eq=[('hp', 30.0), ('lp', 5500.0, 0.7)], drive=0.15, pan=0.0),
        'keys': StemMix(gain_db=-4.0, eq=[('hp', 120.0), ('lowshelf', 300.0, -2.0)], reverb=0.22,
                        reverb_type='plate', pan=-0.25),
        'perc': StemMix(gain_db=-7.0, eq=[('hp', 180.0)], reverb=0.16, reverb_type='room', pan=0.3),
        'horns': StemMix(gain_db=-4.0, eq=[('hp', 150.0), ('peak', 2500.0, 1.5, 0.8)], reverb=0.2,
                         reverb_type='plate', pan=0.2),
        'lead': StemMix(gain_db=-4.0, eq=[('hp', 200.0)], reverb=0.16, reverb_type='plate', delay=0.14, pan=0.05),
        'fx': StemMix(gain_db=-7.0, eq=[('hp', 60.0)], reverb=0.3, reverb_type='hall', pan=-0.1, width=0.9),
    }


class Song:
    """A song: tempo, key, sections, events. All bar numbers are 1-based; sixteenths are 0..15 within a bar."""

    def __init__(self, *, id: str, title: str, style: str, bpm: float, key: str, bars: int, sections: list,
                 seed: int, difficulty: int, target_taps_per_min: float, swing: float = 0.5,
                 break_bars: Iterable[int] = (), preview_start_bar: int | None = None, preview_bars: int = 16,
                 hook_stem: str | None = None, human_ms: float = 4.0, human_vel: float = 0.05,
                 progression: dict | None = None, notes: str = ''):
        if not re.fullmatch(r'[a-z_]+', id):
            raise ValueError('song id must match [a-z_]+ (the ?track= deep link regex)')
        self.id, self.title, self.style = id, title, style
        self.bpm = float(bpm)
        self.key = key
        self.key_obj = Key(key)
        self.bars = int(bars)
        self.sections = [s if isinstance(s, Section) else Section(*s) for s in sections]
        self.seed = int(seed)
        self.difficulty = int(difficulty)
        self.target_taps_per_min = float(target_taps_per_min)
        self.swing = float(swing)
        self.break_bars = sorted(int(b) for b in break_bars)
        self.preview_start_bar = int(preview_start_bar or next((s.start_bar for s in self.sections if s.name == 'hook'), 1))
        self.preview_bars = int(preview_bars)
        self.hook_stem = hook_stem
        self.human_ms = float(human_ms)
        self.human_vel = float(human_vel)
        self.progression = progression or {}
        self.notes = notes
        self.events: list[Event] = []
        self.phrases: list[Phrase] = []
        self.mix: dict[str, StemMix] = default_mix()
        self._chord_seq = 0

    # ── time ──
    @property
    def d16(self) -> float:
        return 15.0 / self.bpm

    @property
    def bar_sec(self) -> float:
        return 16 * self.d16

    @property
    def duration(self) -> float:
        return self.bars * self.bar_sec

    @property
    def n_samples(self) -> int:
        return int(round(self.duration * SR))

    def time(self, bar: float, six: float = 0.0) -> float:
        """Seconds of (bar, sixteenth) incl. swing (odd integer sixteenths are delayed by 2*(swing-0.5) of a 16th)."""
        s = float(six)
        sw = 2.0 * (self.swing - 0.5) if (abs(s - round(s)) < 1e-9 and int(round(s)) % 2 == 1) else 0.0
        return ((bar - 1) * 16 + s + sw) * self.d16

    def section_at(self, bar: int) -> Section | None:
        for s in self.sections:
            if s.start_bar <= bar <= s.end_bar:
                return s
        return None

    def energy(self, bar: int) -> int:
        s = self.section_at(bar)
        return s.energy if s else 1

    def bars_of(self, *names: str) -> list[int]:
        """All bars of the sections with these names, e.g. song.bars_of('verse', 'hook')."""
        out = []
        for s in self.sections:
            if s.name in names or (s.label and s.label in names):
                out.extend(s.bar_range())
        return out

    def plays(self, stem: str, bar: int) -> bool:
        s = self.section_at(bar)
        return bool(s and stem in s.stems)

    # ── events ──
    def _check(self, stem: str, voice: str, bar, six):
        if stem not in STEMS:
            raise ValueError(f'unknown stem {stem}')
        if voice not in VOICES:
            raise ValueError(f'unknown voice {voice}; known: {sorted(VOICES)}')
        if not (1 <= bar <= self.bars):
            raise ValueError(f'bar {bar} outside 1..{self.bars}')
        if not (0 <= six < 16):
            raise ValueError(f'sixteenth {six} outside 0..16')

    def hit(self, stem: str, voice: str, bar: int, six: float, vel: float = 0.9, human: bool = True, **params):
        """An unpitched hit (drums, perc, fx one-shots). Toms/congas may take pitch=<Hz> in params."""
        self._check(stem, voice, bar, six)
        self.events.append(Event(stem, voice, int(bar), float(six), float(vel), None, 1.0, params, human))

    def note(self, stem: str, voice: str, bar: int, six: float, pitch, dur16: float, vel: float = 0.8,
             human: bool = True, **params):
        """A pitched note. pitch: midi number or name ('F2'). dur16: gate length in sixteenths.
        A lead voice (LEAD_VOICES) becomes a one-note phrase."""
        self._check(stem, voice, bar, six)
        if voice in LEAD_VOICES:
            self.phrase(stem, voice, [(bar, six, pitch, dur16, vel)], **params)
            return
        self.events.append(Event(stem, voice, int(bar), float(six), float(vel), midi(pitch), float(dur16), params,
                                 human))

    def chord(self, stem: str, voice: str, bar: int, six: float, pitches: Sequence, dur16: float,
              vel: float = 0.75, strum_ms: float = 0.0, human: bool = True, **params):
        """Several notes that start together (one onset in the map). strum_ms spreads them upward."""
        self._chord_seq += 1
        for i, pch in enumerate(sorted(midi(x) for x in pitches)):
            self._check(stem, voice, bar, six)
            p = dict(params)
            if strum_ms:
                p['_offset_ms'] = i * strum_ms
            self.events.append(Event(stem, voice, int(bar), float(six), float(vel), pch, float(dur16), p, human,
                                     onset=True, chord_id=self._chord_seq))

    def phrase(self, stem: str, voice: str, notes: Sequence[tuple], **params):
        """A lead line: notes = [(bar, six, pitch, dur16, vel), ...]. Notes that touch are legato (glide)."""
        if voice not in LEAD_VOICES:
            raise ValueError(f'phrase voice must be one of {sorted(LEAD_VOICES)}')
        if stem not in STEMS:
            raise ValueError(f'unknown stem {stem}')
        if not notes:
            raise ValueError('empty phrase')
        clean = []
        for (bar, six, pitch, dur16, vel) in notes:
            if not (1 <= bar <= self.bars) or not (0 <= six < 16):
                raise ValueError(f'phrase note outside the song: {(bar, six)}')
            clean.append((int(bar), float(six), midi(pitch), float(dur16), float(vel)))
        self.phrases.append(Phrase(stem, voice, clean, params))

    def fx(self, stem: str, voice: str, bar: int, six: float, dur16: float, vel: float = 0.9, pitch=None, **params):
        """An fx event with a length (riser, sweep, wash, reverse, scrub...)."""
        self._check(stem, voice, bar, six)
        self.events.append(Event(stem, voice, int(bar), float(six), float(vel),
                                 midi(pitch) if pitch is not None else None, float(dur16), params, human=False))

    def fx_into(self, stem: str, voice: str, bar: int, six: float, dur16: float, vel: float = 0.9, **params):
        """An fx event that ENDS at (bar, six): risers and reverse swells into a downbeat."""
        start = (bar - 1) * 16 + six - dur16
        b, s = int(start // 16) + 1, start % 16
        self.fx(stem, voice, b, s, dur16, vel, **params)

    def pattern(self, stem: str, voice: str, bars: Iterable[int], steps: str, vel: float = 0.85,
                accent: float = 1.0, ghost: float = 0.4, human: bool = True, **params):
        """Step pattern. steps: 16 chars per bar (spaces and | ignored), repeating over `bars`.
        'X' accent, 'x' normal, 'o' ghost, 'g' soft ghost, '1'-'9' vel/9, '.'/'-' rest."""
        s = steps.replace(' ', '').replace('|', '')
        if len(s) % 16:
            raise ValueError(f'pattern length {len(s)} is not a multiple of 16')
        nb = len(s) // 16
        for i, bar in enumerate(bars):
            chunk = s[(i % nb) * 16:(i % nb + 1) * 16]
            for six, ch in enumerate(chunk):
                v = {'X': accent, 'x': vel, 'o': ghost, 'g': ghost * 0.6}.get(ch)
                if v is None and ch.isdigit() and ch != '0':
                    v = int(ch) / 9.0
                if v is None:
                    continue
                self.hit(stem, voice, bar, six, v, human=human, **params)

    def roll(self, stem: str, voice: str, bar: int, bars: int = 1, steps: Sequence[float] = (2, 1, 1, 0.5),
             vel: tuple[float, float] = (0.35, 0.95), human: bool = True, **params):
        """A build-up roll from (bar, 0) over `bars` bars: the roll is cut into len(steps) equal parts, part i hits
        every steps[i] sixteenths (0.5 = 32nds), and the velocity ramps vel[0] -> vel[1]."""
        total = 16 * bars
        part = total / len(steps)
        pos = 0.0
        while pos < total - 1e-9:
            i = min(len(steps) - 1, int(pos // part))
            u = pos / total
            b = bar + int(pos // 16)
            self.hit(stem, voice, b, round(pos % 16, 3), vel[0] + (vel[1] - vel[0]) * u, human=human, **params)
            pos += steps[i]

    def notes_pattern(self, stem: str, voice: str, bars: Iterable[int], steps: str, pitches, dur16: float = 1.0,
                      vel: float = 0.85, accent: float = 1.0, ghost: float = 0.5, **params):
        """Like pattern() for pitched voices: each hit takes the next pitch from `pitches` (cycled),
        or pitches may be a callable (bar, six, index) -> midi."""
        s = steps.replace(' ', '').replace('|', '')
        nb = len(s) // 16
        idx = 0
        for i, bar in enumerate(bars):
            chunk = s[(i % nb) * 16:(i % nb + 1) * 16]
            for six, ch in enumerate(chunk):
                v = {'X': accent, 'x': vel, 'o': ghost, 'g': ghost * 0.6}.get(ch)
                if v is None and ch.isdigit() and ch != '0':
                    v = int(ch) / 9.0
                if v is None:
                    continue
                pch = pitches(bar, six, idx) if callable(pitches) else pitches[idx % len(pitches)]
                self.note(stem, voice, bar, six, pch, dur16, v, **params)
                idx += 1

    # ── checks ──
    def check(self, profile: str = 'song') -> list[str]:
        errs = []
        if abs(self.duration - self.bars * 240.0 / self.bpm) > 1e-9:
            errs.append('duration mismatch')
        b = 1
        for s in self.sections:
            if s.name not in SECTION_NAMES:
                errs.append(f'section name {s.name} not in {SECTION_NAMES}')
            if s.start_bar != b:
                errs.append(f'section {s.name} starts at bar {s.start_bar}, expected {b}')
            if not 1 <= s.energy <= 5:
                errs.append(f'section {s.name} energy {s.energy} outside 1..5')
            if 'bed' not in s.stems:
                errs.append(f'section {s.name} must list the bed')
            for st in s.stems:
                if st not in STEMS:
                    errs.append(f'section {s.name}: unknown stem {st}')
            b = s.start_bar + s.bars
        if b != self.bars + 1:
            errs.append(f'sections cover bars 1..{b - 1}, song has {self.bars}')
        for bb in self.break_bars:
            if not 1 <= bb <= self.bars:
                errs.append(f'break bar {bb} outside the song')
        if profile == 'song':
            if not 90.0 <= self.duration <= 120.0:
                errs.append(f'duration {self.duration:.1f}s outside 90..120')
            if self.preview_start_bar + self.preview_bars - 1 > self.bars:
                errs.append('preview runs past the end')
        if not 1 <= self.difficulty <= 6:
            errs.append('difficulty outside 1..6')
        if not any(e.stem == 'bed' and e.bar == 1 and e.six == 0 for e in self.events):
            errs.append('the bed must hit bar 1 sixteenth 0 (the t=0 anchor)')
        return errs


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# rendering
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def _freeze(p: dict):
    return tuple(sorted((k, tuple(v) if isinstance(v, list) else v) for k, v in p.items() if not k.startswith('_')))


class _Renderer:
    def __init__(self, song: Song):
        self.song = song
        self.cache: dict = {}
        self.stats = {'renders': 0, 'cache_hits': 0}

    def jitter(self, *keys) -> float:
        return (hrand(self.song.seed, *keys) - 0.5) * 2.0

    def event_start(self, e: Event) -> int:
        t = self.song.time(e.bar, e.six)
        if e.human and self.song.human_ms > 0:
            scale = 0.6 if VOICES[e.voice].kind == 'drum' else 1.0
            t += self.jitter('t', e.stem, e.voice, e.bar, e.six, e.midi) * self.song.human_ms * 1e-3 * scale
        t += e.params.get('_offset_ms', 0.0) * 1e-3
        return max(0, int(round(t * SR)))

    def event_vel(self, e: Event) -> float:
        v = e.vel
        if e.human and self.song.human_vel > 0:
            v *= 1.0 + self.jitter('v', e.stem, e.voice, e.bar, e.six, e.midi) * self.song.human_vel
        return float(np.clip(v, 0.0, 1.0))

    def render_event(self, e: Event) -> np.ndarray:
        spec = VOICES[e.voice]
        vel = self.event_vel(e)
        vq = round(max(vel, 0.05) * 10) / 10.0
        variant = int(hrand(self.song.seed, 'var', e.stem, e.voice, e.bar, e.six) * spec.variants) if spec.variants > 1 else 0
        dur = e.dur16 * self.song.d16 * (e.params.get('gate', 1.0))
        dq = round(dur, 3)
        key = (e.voice, e.midi, dq, vq, _freeze(e.params), variant)
        if key in self.cache:
            self.stats['cache_hits'] += 1
            base = self.cache[key]
        else:
            call = VoiceCall(hz(e.midi) if e.midi is not None else None,
                             e.midi, dq, vq, dict(e.params),
                             rng_for(self.song.seed, 'voice', e.voice, variant, _freeze(e.params), e.midi))
            base = spec.fn(call)
            base = edge_fade(base, 2.0, 3.0)
            if not np.all(np.isfinite(base)):
                raise RuntimeError(f'voice {e.voice} produced non-finite samples')
            self.cache[key] = base
            self.stats['renders'] += 1
        return base * (vel ** 1.3)

    def render_phrase(self, ph: Phrase) -> tuple[int, np.ndarray]:
        song = self.song
        notes = []
        for (bar, six, m, dur16, vel) in ph.notes:
            t = song.time(bar, six) + self.jitter('pt', ph.stem, bar, six) * song.human_ms * 0.5e-3
            s = max(0, int(round(t * SR)))
            e = s + int(round(dur16 * song.d16 * SR))
            notes.append(PhraseNote(s, e, m, vel))
        rng = rng_for(song.seed, 'phrase', ph.stem, ph.voice, ph.notes[0][0], ph.notes[0][1])
        s0, audio = render_lead_phrase(ph.voice, notes, dict(ph.params), rng)
        return s0, audio

    def render_stem_dry(self, stem: str, total: int) -> np.ndarray:
        buf = np.zeros(total)
        for e in self.song.events:
            if e.stem != stem:
                continue
            s = self.event_start(e)
            if s >= total:
                continue
            x = self.render_event(e)
            m = min(len(x), total - s)
            buf[s:s + m] += x[:m]
        for ph in self.song.phrases:
            if ph.stem != stem:
                continue
            s, x = self.render_phrase(ph)
            m = min(len(x), total - s)
            if m > 0:
                buf[s:s + m] += x[:m]
        self.cache.clear()
        return buf


def kick_positions(song: Song, rend: _Renderer) -> list[int]:
    return [rend.event_start(e) for e in song.events if e.voice == 'kick' and e.stem in ('bed', 'drums')]


def duck_envelope(n: int, starts: list[int], depth: float, release_s: float) -> np.ndarray:
    if depth <= 0 or not starts:
        return np.ones(n)
    imp = np.zeros(n)
    for s in starts:
        if 0 <= s < n:
            imp[s] = 1.0
    att = int(0.004 * SR)
    L = int(release_s * 6 * SR) + att
    k = np.empty(L)
    k[:att] = _cos_ramp(att)
    k[att:] = np.exp(-t_axis(L - att) / release_s)
    # the kernel starts slightly BEFORE the kick so the duck is in place on the hit
    conv = fft_convolve(imp, k, n + att)[att // 2: att // 2 + n]
    return 1.0 - depth * np.clip(conv, 0.0, 1.0)


def tremolo_envelope(song: Song, n: int, rate, depth: float) -> np.ndarray:
    if rate == '16th':
        hzr = 1.0 / song.d16
    elif rate == '8th':
        hzr = 0.5 / song.d16
    elif rate == 'quarter':
        hzr = 0.25 / song.d16
    else:
        hzr = float(rate)
    t = t_axis(n)
    return 1.0 - depth * 0.5 * (1.0 - np.cos(2 * np.pi * hzr * t))


@dataclass
class StemParts:
    pre: np.ndarray       # dry after EQ/duck/tremolo + delay echoes (mono)
    wet: np.ndarray       # mono reverb return
    send: np.ndarray      # what went into the reverb (for the stereo preview)


def process_stem(song: Song, stem: str, dry: np.ndarray, n: int, kicks: list[int]) -> StemParts:
    mx = song.mix[stem]
    x = _sat(dry, mx.drive) if mx.drive > 0 else dry
    x = fft_filter(x, list(mx.eq) + [('hp', 20.0, 0.707)], pad=int(0.5 * SR))
    x = x[:n] if len(x) >= n else np.concatenate([x, np.zeros(n - len(x))])
    if mx.duck > 0:
        x = x * duck_envelope(n, kicks, mx.duck, mx.duck_release)
    if mx.tremolo:
        x = x * tremolo_envelope(song, n, mx.tremolo[0], mx.tremolo[1])
    N = next_fast_len(n + int(4 * SR))
    f = np.fft.rfftfreq(N, 1.0 / SR)
    X = np.fft.rfft(x, N)
    pre = x
    if mx.delay > 0:
        H = delay_response(f, mx.delay_16ths * song.d16, mx.delay_fb, mx.delay_damp)
        echo = np.fft.irfft(X * H * mx.delay, N)[:n]
        pre = x + echo
        X = np.fft.rfft(pre, N)
    wet = np.zeros(n)
    send = pre * mx.reverb
    if mx.reverb > 0:
        cfg = REVERBS[mx.reverb_type]
        irL = make_ir(seed=song.seed, channel=0, **cfg)
        irR = make_ir(seed=song.seed, channel=1, **cfg)
        L = max(len(irL), len(irR))
        irM = np.zeros(L)
        irM[:len(irL)] += irL
        irM[:len(irR)] += irR
        irM /= max(np.sqrt(np.sum(irM ** 2)), 1e-12)
        wet = np.fft.irfft(X * np.fft.rfft(irM, N), N)[:n] * mx.reverb
    return StemParts(pre=pre, wet=wet, send=send)


def lufs(x: np.ndarray, sr: int = SR) -> float:
    """Integrated loudness (ITU-R BS.1770-4 style: K-weighting, 400 ms blocks, -70 LUFS and -10 LU gates).
    x: (n,) mono or (n, c). The K-weighting is applied as a zero-phase magnitude response."""
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1:
        x = x[:, None]
    n = x.shape[0]
    if n < int(0.4 * sr):
        x = np.concatenate([x, np.zeros((int(0.4 * sr) - n, x.shape[1]))])
        n = x.shape[0]
    N = next_fast_len(n + 4096)
    f = np.fft.rfftfreq(N, 1.0 / sr)
    g = k_weight_mag(f, sr)
    y = np.fft.irfft(np.fft.rfft(x, N, axis=0) * g[:, None], N, axis=0)[:n]
    blk = int(0.4 * sr)
    hop = int(0.1 * sr)
    c = np.concatenate([np.zeros((1, y.shape[1])), np.cumsum(y * y, axis=0)])
    starts = np.arange(0, n - blk + 1, hop)
    z = (c[starts + blk] - c[starts]) / blk
    zs = z.sum(axis=1)
    lk = -0.691 + 10 * np.log10(np.maximum(zs, 1e-20))
    keep = lk > -70.0
    if not keep.any():
        return -120.0
    rel = -0.691 + 10 * np.log10(zs[keep].mean()) - 10.0
    keep2 = keep & (lk > rel)
    return float(-0.691 + 10 * np.log10(zs[keep2].mean()))


def _biquad_mag(b, a, f, sr):
    w = 2 * np.pi * f / sr
    z = np.exp(-1j * w)
    num = b[0] + b[1] * z + b[2] * z * z
    den = a[0] + a[1] * z + a[2] * z * z
    return np.abs(num / den)


def k_weight_mag(f: np.ndarray, sr: int = SR) -> np.ndarray:
    G, Q, fc = 3.999843853973347, 0.7071752369554196, 1681.974450955533
    A = 10 ** (G / 40)
    w0 = 2 * np.pi * fc / sr
    al = np.sin(w0) / (2 * Q)
    cw = np.cos(w0)
    sa = np.sqrt(A)
    b = [A * ((A + 1) + (A - 1) * cw + 2 * sa * al), -2 * A * ((A - 1) + (A + 1) * cw),
         A * ((A + 1) + (A - 1) * cw - 2 * sa * al)]
    a = [(A + 1) - (A - 1) * cw + 2 * sa * al, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - 2 * sa * al]
    h1 = _biquad_mag(b, a, f, sr)
    Q2, fc2 = 0.5003270373238773, 38.13547087602444
    w0 = 2 * np.pi * fc2 / sr
    al = np.sin(w0) / (2 * Q2)
    cw = np.cos(w0)
    b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
    a = [1 + al, -2 * cw, 1 - al]
    return h1 * _biquad_mag(b, a, f, sr)


# ── encoders ────────────────────────────────────────────────────────────────────────────────────────────────────────

def write_mp3(path: str, x: np.ndarray, level: float | None = None, cbr_kbps: int | None = None) -> None:
    """Mono (n,) or stereo (n,2) MP3 at 44.1 kHz. VBR by LAME quality (level = V/10), or CBR at cbr_kbps."""
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    data = np.clip(np.asarray(x, dtype=np.float64), -1.0, 1.0)
    if cbr_kbps:
        sf.write(path, data, SR, format='MP3', subtype='MPEG_LAYER_III', bitrate_mode='CONSTANT',
                 compression_level=(320.0 - cbr_kbps) / 288.0)
    else:
        sf.write(path, data, SR, format='MP3', subtype='MPEG_LAYER_III', bitrate_mode='VARIABLE',
                 compression_level=float(level if level is not None else MP3_LEVEL_START))


def lame_tag(path: str) -> dict | None:
    """The LAME/Xing gapless header of an MP3: {tag, frames, encoder, encoderDelay, padding}. A gapless-aware decoder
    returns frames*1152 - encoderDelay - padding samples (= map.samples); a naive one returns extra priming
    (encoderDelay + 529 decoder delay) at the start."""
    with open(path, 'rb') as fh:
        b = fh.read(8192)
    i = 0
    if b[:3] == b'ID3':
        i = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9])
        with open(path, 'rb') as fh:
            b = fh.read(i + 8192)
    j, tag = -1, None
    for t in (b'Xing', b'Info'):
        j = b.find(t, i, i + 200)
        if j >= 0:
            tag = t
            break
    if j < 0:
        return None
    flags = int.from_bytes(b[j + 4:j + 8], 'big')
    k = j + 8
    frames = None
    if flags & 1:
        frames = int.from_bytes(b[k:k + 4], 'big')
        k += 4
    if flags & 2:
        k += 4
    if flags & 4:
        k += 100
    if flags & 8:
        k += 4
    lt = b[k:k + 36]
    d = lt[21:24]
    return {'tag': tag.decode(), 'frames': frames, 'encoder': lt[:9].decode('latin1').strip('\x00 '),
            'encoderDelay': (d[0] << 4) | (d[1] >> 4), 'padding': ((d[1] & 0x0F) << 8) | d[2]}


def read_audio(path: str) -> tuple[np.ndarray, int]:
    y, sr = sf.read(path, dtype='float64', always_2d=True)
    return y, sr


# ── onsets ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def onsets_for(song: Song, stem: str) -> tuple[list, dict]:
    """[[bar, sixteenth, velocity], ...] for note/hit starts on the grid (humanise not included), merged per position;
    plus per-voice lists (drums/perc/bed only)."""
    pos: dict = {}
    by_voice: dict = {}
    for e in song.events:
        if e.stem != stem or not e.onset:
            continue
        k = (e.bar, round(e.six, 3))
        pos[k] = max(pos.get(k, 0.0), e.vel)
        if stem in ('bed', 'drums', 'perc'):
            bv = by_voice.setdefault(e.voice, {})
            bv[k] = max(bv.get(k, 0.0), e.vel)
    for ph in song.phrases:
        if ph.stem != stem:
            continue
        for (bar, six, m, dur16, vel) in ph.notes:
            k = (bar, round(six, 3))
            pos[k] = max(pos.get(k, 0.0), vel)
    fmt = lambda d: [[b, (int(s) if float(s).is_integer() else s), round(min(1.0, max(0.01, v)), 2)]
                     for (b, s), v in sorted(d.items())]
    return fmt(pos), {vname: fmt(d) for vname, d in sorted(by_voice.items())}


# ── the pipeline ────────────────────────────────────────────────────────────────────────────────────────────────────

def _log(*a):
    print('[fel_synth]', *a, flush=True)


GUARD_MAX_DB = 3.0           # the shared peak guard may take at most this much off the loudest downbeats ...
LUFS_FLOOR = -15.0           # ... beyond that the loudness target slides down (never below this)


def level_stems(stems: dict[str, np.ndarray]) -> tuple[dict[str, np.ndarray], dict]:
    """Loudness to TARGET_LUFS, each stem under STEM_CEILING_DB, the 8-stem sum under SUM_CEILING_DB.

    No master compression: the only thing that acts on the sum is the shared peak guard, ONE transparent limiter
    gain curve (2.5 ms / 40 ms, zero-phase) multiplied identically into every stem, so the stems still sum to the
    mix exactly. It only moves on the loudest coincident downbeats; if it would need more than GUARD_MAX_DB, the
    loudness target is lowered instead (down to LUFS_FLOOR). A stem that alone exceeds its ceiling is limited on
    its own (its own peaks only)."""
    ceil_sum = undb(SUM_CEILING_DB)
    ceil_stem = undb(STEM_CEILING_DB)
    target = TARGET_LUFS
    limited: dict[str, float] = {}
    for _ in range(6):
        st = {k: v.copy() for k, v in stems.items()}
        limited = {}
        gain_db = 0.0
        for _i in range(3):
            g = target - lufs(sum(st.values()))
            gain_db += g
            for k in st:
                st[k] *= undb(g)
                pk = float(np.max(np.abs(st[k])))
                if pk > ceil_stem:
                    st[k] *= limiter_gain(st[k], ceil_stem)
                    limited[k] = round(max(limited.get(k, 0.0), db(pk / ceil_stem)), 2)
            if abs(g) < 0.05:
                break
        mix = sum(st.values())
        pk = float(np.max(np.abs(mix)))
        need = db(pk / ceil_sum) if pk > ceil_sum else 0.0
        if need <= GUARD_MAX_DB or target <= LUFS_FLOOR + 1e-9:
            break
        target = max(LUFS_FLOOR, target - (need - GUARD_MAX_DB) - 0.05)
    guard = 0.0
    if pk > ceil_sum:
        G = limiter_gain(mix, ceil_sum)
        guard = db(float(G.min()))
        for k in st:
            st[k] *= G
    return st, {'gainDb': gain_db, 'targetLufs': round(target, 2), 'sharedPeakGuardDb': round(guard, 2),
                'stemLimitDb': limited, 'lufs': round(lufs(sum(st.values())), 2)}


def render(song: Song, out_root: str, script_path: str, profile: str = 'song', keep_wav: bool = False,
           validate: bool = True) -> dict:
    """Render every contract file for `song` into <out_root>/<id>/. Returns a summary dict."""
    t_start = time.time()
    errs = song.check(profile)
    if errs:
        raise ValueError('song check failed:\n  ' + '\n  '.join(errs))
    out_dir = os.path.join(out_root, song.id)
    os.makedirs(os.path.join(out_dir, 'stems'), exist_ok=True)
    n = song.n_samples
    tail = int(4.0 * SR)
    rend = _Renderer(song)
    kicks = kick_positions(song, rend)

    parts: dict[str, StemParts] = {}
    for stem in STEMS:
        t0 = time.time()
        dry = rend.render_stem_dry(stem, n + tail)
        parts[stem] = process_stem(song, stem, dry, n, kicks)
        _log(f'{song.id}: {stem:5s} rendered in {time.time() - t0:5.1f}s')

    stems = {s: parts[s].pre + parts[s].wet for s in STEMS}

    # ── levels: loudness to target, per-stem ceilings, per-stem peak control, then a shared guard for any rest ──
    stems, level_report = level_stems(stems)
    guard_db = level_report['sharedPeakGuardDb']
    total_gain_db = level_report['gainDb']
    fade = int(END_FADE_MS * 1e-3 * SR)
    for s in STEMS:
        stems[s][-fade:] *= _cos_ramp(fade)[::-1]
        stems[s][-1] = 0.0          # (no DC by construction: every stem is high-passed at >= 20 Hz)

    # ── encode stems (VBR level search for the size budget, closed loop on decoded peaks) ──
    budget = SONG_BYTES_MAX * (1.0 if profile == 'song' else 1e9)
    level = MP3_LEVEL_START
    trims = {s: 0.0 for s in STEMS}
    for attempt in range(8):
        paths = {}
        for s in STEMS:
            p = os.path.join(out_dir, 'stems', f'{s}.mp3')
            write_mp3(p, stems[s] * undb(trims[s]), level=level)
            paths[s] = p
        size = sum(os.path.getsize(p) for p in paths.values())
        dec = {s: read_audio(paths[s])[0][:, 0] for s in STEMS}
        lens = {len(d) for d in dec.values()}
        if lens != {n}:
            raise RuntimeError(f'decoded lengths {lens} != {n}')
        over = False
        for s in STEMS:
            pk = db(np.max(np.abs(dec[s])))
            if pk > -3.05:
                trims[s] -= (pk + 3.05) + 0.15
                over = True
        spk = db(np.max(np.abs(sum(dec.values()))))
        if spk > -1.05:
            for s in STEMS:
                trims[s] -= (spk + 1.05) + 0.15
            over = True
        if size > budget:
            if level >= MP3_LEVEL_MAX - 1e-9:
                raise RuntimeError(f'stems {size} bytes > budget even at level {level}')
            level = min(MP3_LEVEL_MAX, level + 0.1)
            over = True
        if not over:
            break
    else:
        raise RuntimeError('could not meet the peak/size contract after 8 encodes')
    stems = {s: stems[s] * undb(trims[s]) for s in STEMS}
    dec_mix = sum(dec.values())

    # ── preview: stereo, from the hook ──
    pv_bars = min(song.preview_bars, song.bars - song.preview_start_bar + 1)
    a = int(round(song.time(song.preview_start_bar, 0) * SR))
    end_bar = song.preview_start_bar + pv_bars
    b = n if end_bar > song.bars else min(n, int(round(song.time(end_bar, 0) * SR)))
    pre_roll = min(a, int(3.0 * SR))
    Lp = np.zeros(b - a)
    Rp = np.zeros(b - a)
    lvl_gain_total = undb(total_gain_db)
    for s in STEMS:
        mx = song.mix[s]
        seg = stems[s][a:b]
        th = (mx.pan + 1) * np.pi / 4
        Lp += seg * math.cos(th) * math.sqrt(2)
        Rp += seg * math.sin(th) * math.sqrt(2)
        if mx.reverb > 0 and mx.width > 0:
            cfg = REVERBS[mx.reverb_type]
            irL = make_ir(seed=song.seed, channel=0, **cfg)
            irR = make_ir(seed=song.seed, channel=1, **cfg)
            snd = parts[s].send[a - pre_roll:b] * lvl_gain_total * undb(trims[s])
            side = fft_convolve(snd, irL - irR, len(snd))[pre_roll:] * 0.5 * mx.width
            Lp += side
            Rp -= side
    pv = np.stack([Lp, Rp], axis=1)
    fi, fo = int(0.01 * SR), int(min(1.5, (b - a) / SR / 4) * SR)
    pv[:fi] *= _cos_ramp(fi)[:, None]
    pv[-fo:] *= _cos_ramp(fo)[::-1][:, None]
    for _ in range(3):                  # the preview is its own master: loudness + a bus limiter
        pv *= undb(TARGET_LUFS - lufs(pv))
        pv *= limiter_gain(pv, undb(-1.6))[:, None]
    pv_path = os.path.join(out_dir, 'preview.mp3')
    write_mp3(pv_path, pv, cbr_kbps=PREVIEW_KBPS)
    if os.path.getsize(pv_path) > PREVIEW_BYTES_MAX and profile == 'song':
        write_mp3(pv_path, pv, cbr_kbps=80)
    if keep_wav:
        for s in STEMS:
            sf.write(os.path.join(out_dir, 'stems', f'{s}.flac'), stems[s], SR, subtype='PCM_24')

    # ── map.json ──
    files = [f'stems/{s}.mp3' for s in STEMS] + ['preview.mp3']
    script_abs = os.path.abspath(script_path)
    lib_abs = os.path.abspath(__file__)
    stem_maps = {}
    for s in STEMS:
        ons, byv = onsets_for(song, s)
        entry = {'onsets': ons}
        if byv:
            entry['voices'] = byv
        stem_maps[s] = entry
    m = {
        'id': song.id,
        'title': song.title,
        'style': song.style,
        'bpm': song.bpm if not float(song.bpm).is_integer() else int(song.bpm),
        'key': song.key,
        'timeSig': '4/4',
        'bars': song.bars,
        'durationSec': round(song.duration, 6),
        'sampleRate': SR,
        'samples': n,
        'swing': song.swing,
        'sections': [{'name': s.name, 'startBar': s.start_bar, 'bars': s.bars, 'energy': s.energy,
                      'stems': [x for x in STEMS if x in s.stems], **({'label': s.label} if s.label else {})}
                     for s in song.sections],
        'breakBars': song.break_bars,
        'difficulty': song.difficulty,
        'targetTapsPerMin': song.target_taps_per_min,
        'hookStem': song.hook_stem,
        'earned': dict(EARNED),
        'progression': song.progression,
        'preview': {'file': 'preview.mp3', 'startBar': song.preview_start_bar, 'bars': pv_bars},
        'stems': stem_maps,
        'encoding': {
            'format': 'MP3 (MPEG-1 Layer III), LAME VBR via libsndfile; preview CBR stereo',
            'stemVbrLevel': round(level, 2),
            'lame': lame_tag(os.path.join(out_dir, 'stems', 'bed.mp3')),
            'decoderDelayConvention': 529,
        },
        'mix': {
            'sumLufs': round(lufs(dec_mix), 2),
            'sumPeakDb': round(db(np.max(np.abs(dec_mix))), 2),
            'stemPeakDb': {s: round(db(np.max(np.abs(dec[s]))), 2) for s in STEMS},
            'sharedPeakGuardDb': round(guard_db, 2),
            'stemLimitDb': level_report['stemLimitDb'],
            'targetLufs': level_report['targetLufs'],
            'mp3VbrLevel': round(level, 2),
            'stemBytes': {s: os.path.getsize(os.path.join(out_dir, 'stems', f'{s}.mp3')) for s in STEMS},
        },
        'provenance': {
            'statement': '100% original, generated from code by FEL (fel_synth). No samples, no third-party audio, '
                         'no vocals (wordless synth vox only).',
            'script': script_abs,
            'scriptSha256': sha256_file(script_abs),
            'library': lib_abs,
            'librarySha256': sha256_file(lib_abs),
            'libraryVersion': LIB_VERSION,
            'seed': song.seed,
            'seedDerivation': 'every random draw = numpy PCG64(blake2b(seed, stem/voice/variant/params...))',
            'date': DATE,
            'tools': {'python': platform.python_version(), 'numpy': np.__version__, 'soundfile': sf.__version__,
                      'libsndfile': sf.__libsndfile_version__},
            'sha256': {f: sha256_file(os.path.join(out_dir, f)) for f in files},
        },
    }
    if song.notes:
        m['notes'] = song.notes
    with open(os.path.join(out_dir, 'map.json'), 'w') as fh:
        json.dump(m, fh, indent=1)
        fh.write('\n')
    summary = {'id': song.id, 'out': out_dir, 'seconds': round(time.time() - t_start, 1), **m['mix'],
               'renders': rend.stats}
    _log(json.dumps(summary))
    if validate:
        import validate as _v   # same directory
        verdict = _v.validate_song(out_dir, profile=profile)
        summary['valid'] = verdict['ok']
        if not verdict['ok']:
            _log('VALIDATION FAILED: ' + json.dumps([c for c in verdict['checks'] if not c['ok']], indent=1))
    return summary


def main(build: Callable[[], Song], script_path: str):
    """Entry point for a song script: python songs_x.py [--out DIR] [--profile song|smoke] [--no-validate]."""
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'songs'))
    ap.add_argument('--profile', default='song')
    ap.add_argument('--no-validate', action='store_true')
    ap.add_argument('--keep-wav', action='store_true')
    a = ap.parse_args()
    song = build()
    res = render(song, a.out, script_path, profile=a.profile, keep_wav=a.keep_wav, validate=not a.no_validate)
    if res.get('valid') is False:
        sys.exit(1)


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
