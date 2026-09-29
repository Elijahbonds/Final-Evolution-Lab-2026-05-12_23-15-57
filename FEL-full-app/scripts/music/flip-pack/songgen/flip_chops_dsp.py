"""flip_chops_dsp — DSP helpers for the Kokoro vocal chops (flip_chops.py, SPEC.md §4.4). numpy only, no audio read
from anywhere: every function works on arrays handed in (Kokoro's renders, already resampled to 44.1 kHz).

    f0_track(x)                 autocorrelation pitch track (Boersma-normalised, parabolic peak): times, f0 (0 = unvoiced),
                                clarity
    f0_median(x)                the median f0 of the clearly voiced frames (the "what note is this ooh" estimate)
    pitch_marks(x, f0_at)       one epoch per period, walked out from the loudest period by waveform similarity
    psola(x, marks, ...)        TD-PSOLA (an OLA stretch): any output length and any output pitch contour, with the input's
                                spectral envelope (the vowel) kept; used to hold the tuned "ooh" to C5 for about 1 s
    time_map_knots(x)           attack 1:1, body stretched, release 1:1 (a natural onset and end on a long vowel)
    vibrato_f0(...)             a gentle delayed vibrato as an output pitch contour for psola
    split_at_dips(x, n)         cut a multi-syllable take at its n-1 deepest energy dips (sheets: "let's|go", "F|E|L")
    short_room(x, send)         a small synthetic room (fel_synth make_ir, seeded), much shorter than fel_synth's 'room'
    slap_echo(x, ...)           one filtered slap-back repeat (plus a faint second)
    band(x, lo, hi)             a steep zero-phase band-pass (the radio voice)
    fade_in / fade_out          raised-cosine edges
"""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import flip_pack as P  # noqa: E402

F = P.F
SR = P.SR


# ── edges ────────────────────────────────────────────────────────────────────────────────────────────────────────────

def fade_in(x: np.ndarray, ms: float) -> np.ndarray:
    y = np.array(x, dtype=np.float64, copy=True)
    n = min(len(y), max(1, int(round(ms * 1e-3 * SR))))
    y[:n] *= F._cos_ramp(n)
    return y


def fade_out(x: np.ndarray, ms: float) -> np.ndarray:
    y = np.array(x, dtype=np.float64, copy=True)
    n = min(len(y), max(1, int(round(ms * 1e-3 * SR))))
    y[-n:] *= F._cos_ramp(n)[::-1]
    y[-1] = 0.0
    return y


def env_rms(x: np.ndarray, ms: float = 5.0) -> np.ndarray:
    """Centred moving RMS (ms = half-width)."""
    return np.sqrt(np.maximum(F.moving_avg(np.asarray(x, dtype=np.float64) ** 2, max(1, int(ms * 1e-3 * SR))), 0.0))


# ── pitch ────────────────────────────────────────────────────────────────────────────────────────────────────────────

def f0_track(x: np.ndarray, sr: int = SR, fmin: float = 70.0, fmax: float = 700.0, frame_ms: float = 40.0,
             hop_ms: float = 5.0, min_clarity: float = 0.5, min_rel_rms: float = 0.08):
    """Autocorrelation pitch: per frame, the Hann-windowed autocorrelation divided by the window's own (Boersma 1993),
    the shortest lag whose peak is within 8 % of the best (no sub-harmonic picks), refined by a parabola.
    Returns (frame centre samples, f0 Hz with 0 where unvoiced, clarity)."""
    x = np.asarray(x, dtype=np.float64)
    fr = int(frame_ms * 1e-3 * sr)
    hop = int(hop_ms * 1e-3 * sr)
    w = np.hanning(fr)
    N = int(2 ** math.ceil(math.log2(2 * fr)))
    rw = np.fft.irfft(np.abs(np.fft.rfft(w, N)) ** 2, N)[:fr]
    rw = rw / rw[0]
    lo, hi = int(sr / fmax), min(fr - 2, int(sr / fmin))
    centres = np.arange(fr // 2, max(fr // 2 + 1, len(x) - fr // 2), hop)
    rms = np.array([np.sqrt(np.mean(x[c - fr // 2:c + fr // 2] ** 2)) for c in centres])
    top = rms.max() if len(rms) else 0.0
    f0 = np.zeros(len(centres))
    clar = np.zeros(len(centres))
    for j, c in enumerate(centres):
        if rms[j] < min_rel_rms * top:
            continue
        seg = x[c - fr // 2:c - fr // 2 + fr] * w
        r = np.fft.irfft(np.abs(np.fft.rfft(seg, N)) ** 2, N)[:fr]
        if r[0] <= 0:
            continue
        r = (r / r[0]) / np.maximum(rw, 1e-3)
        seg_r = r[lo:hi]
        peaks = [i for i in range(1, len(seg_r) - 1) if seg_r[i] >= seg_r[i - 1] and seg_r[i] > seg_r[i + 1]]
        if not peaks:
            continue
        best = max(seg_r[i] for i in peaks)
        k = next(i for i in peaks if seg_r[i] >= 0.92 * best)
        a, b, cc = seg_r[k - 1], seg_r[k], seg_r[k + 1]
        den = a - 2 * b + cc
        dk = 0.5 * (a - cc) / den if abs(den) > 1e-12 else 0.0
        lag = lo + k + float(np.clip(dk, -0.5, 0.5))
        clar[j] = b
        if b >= min_clarity:
            f0[j] = sr / lag
    return centres, f0, clar


def f0_median(x: np.ndarray, sr: int = SR, **kw) -> float:
    _, f0, clar = f0_track(x, sr, **kw)
    v = f0[(f0 > 0) & (clar >= 0.75)]
    if len(v) < 3:
        v = f0[f0 > 0]
    if not len(v):
        raise ValueError('no voiced frames')
    return float(np.median(v))


def f0_function(x: np.ndarray, sr: int = SR, **kw):
    """f0 at any sample: the voiced track, gaps bridged by interpolation, ends held."""
    c, f0, _ = f0_track(x, sr, **kw)
    ok = f0 > 0
    if not ok.any():
        raise ValueError('no voiced frames')
    cc, ff = c[ok], f0[ok]
    return lambda s: float(np.interp(s, cc, ff))


def pitch_marks(x: np.ndarray, f0_at, sr: int = SR, lp_hz: float = 1500.0, search: float = 0.22) -> np.ndarray:
    """One mark per period. The first mark is the highest positive peak (of the low-passed signal) inside the loudest
    period; every next mark is the position about one local period on (±search) whose period-long waveform matches
    the previous one best (normalised cross-correlation), so all marks sit at the same point of the cycle."""
    x = np.asarray(x, dtype=np.float64)
    xl = F.fft_filter(x, [('lp', lp_hz, 0.707, 4)])
    e = env_rms(xl, 5.0)
    c = int(np.argmax(e))
    T0 = int(round(sr / f0_at(c)))
    a = max(0, c - T0 // 2)
    start = a + int(np.argmax(xl[a:a + T0]))

    def step(m: int, direction: int) -> int | None:
        T = int(round(sr / f0_at(m)))
        h = T // 2
        if m - h < 0 or m + h >= len(xl):
            return None
        ref = xl[m - h:m + h]
        best, best_c = -2.0, None
        for d in range(int((1 - search) * T), int((1 + search) * T) + 1):
            cpos = m + direction * d
            if cpos - h < 0 or cpos + h >= len(xl):
                continue
            seg = xl[cpos - h:cpos + h]
            den = math.sqrt(float(np.dot(ref, ref)) * float(np.dot(seg, seg))) + 1e-12
            r = float(np.dot(ref, seg)) / den
            if r > best:
                best, best_c = r, cpos
        return best_c

    marks = [start]
    m = start
    while True:
        nxt = step(m, +1)
        if nxt is None:
            break
        marks.append(nxt)
        m = nxt
    m = start
    while True:
        prv = step(m, -1)
        if prv is None:
            break
        marks.insert(0, prv)
        m = prv
    return np.asarray(marks, dtype=np.float64)


def psola(x: np.ndarray, marks: np.ndarray, out_len: int, tmap, f_out, sr: int = SR) -> np.ndarray:
    """TD-PSOLA. Output epochs are laid down every sr / f_out(o) samples (fractional, so the pitch is exact); each
    takes the input grain at the mark nearest tmap(o), Hann-windowed over +-min(input period, output period) and
    placed with a fractional shift. With the half-window = the output period the windows sum to one (COLA), and the
    grain keeps the input's spectral envelope, so the vowel survives a pitch change (varispeed would move it)."""
    x = np.asarray(x, dtype=np.float64)
    idx = np.arange(len(x), dtype=np.float64)
    T_in = np.diff(marks)
    T_in = np.concatenate([[T_in[0]], 0.5 * (T_in[1:] + T_in[:-1]), [T_in[-1]]])
    y = np.zeros(out_len + 2048)
    o = 0.0
    while o < out_len:
        ti = float(tmap(o))
        i = int(np.clip(np.searchsorted(marks, ti), 0, len(marks) - 1))
        if i > 0 and abs(marks[i - 1] - ti) < abs(marks[i] - ti):
            i -= 1
        m = marks[i]
        T_o = sr / float(f_out(o))
        Lw = max(8.0, min(float(T_in[i]), T_o))           # the half-window (= the output period when raising pitch)
        L = int(math.ceil(Lw)) + 1
        p = int(math.floor(o))
        frac = o - p
        k = np.arange(-L, L + 1, dtype=np.float64)
        u = (k - frac) / Lw
        w = np.where(np.abs(u) < 1.0, 0.5 + 0.5 * np.cos(np.pi * u), 0.0)
        g = np.interp(m + k - frac, idx, x, left=0.0, right=0.0) * w
        a = p - L
        if a >= 0:
            y[a:a + len(g)] += g
        else:
            y[:len(g) + a] += g[-a:]
        o += T_o
    return y[:out_len]


def time_map_knots(x: np.ndarray, out_sec: float, attack_max_s: float = 0.08, release_s: float = 0.09,
                   floor_rel: float = 0.05) -> tuple[list[float], list[float]]:
    """Knots (output samples, input samples) for a stretch that keeps the vowel's onset (up to its envelope peak,
    at most attack_max_s) and its last release_s at 1:1 and stretches the body in between to fill out_sec."""
    e = env_rms(x, 5.0)
    loud = np.nonzero(e >= floor_rel * e.max())[0]
    s_on, s_off = int(loud[0]), int(loud[-1])
    pk = int(np.argmax(e))
    A = int(min(attack_max_s * SR, max(0.02 * SR, pk - s_on)))
    R = int(min(release_s * SR, (s_off - s_on - A) // 3))
    D = int(out_sec * SR)
    out_k = [0.0, float(A), float(D - R), float(D)]
    in_k = [float(s_on), float(s_on + A), float(s_off - R), float(s_off)]
    return out_k, in_k


def vibrato_f0(f_hz: float, rate_hz: float = 5.2, depth_cents: float = 18.0, delay_s: float = 0.28,
               ramp_s: float = 0.30, phase: float = 0.0):
    """An output pitch contour for psola: steady f_hz, then a vibrato that fades in after delay_s."""
    def f(o: float) -> float:
        t = o / SR
        amt = min(1.0, max(0.0, (t - delay_s) / ramp_s))
        return f_hz * 2.0 ** (depth_cents * amt * math.sin(2 * math.pi * rate_hz * t + phase) / 1200.0)
    return f


# ── cutting ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def split_at_dips(x: np.ndarray, n: int, min_part_s: float = 0.10, smooth_ms: float = 8.0,
                  floor_rel: float = 0.03) -> list[np.ndarray]:
    """Cut a take into n parts at its n-1 deepest energy dips (local minima of a smoothed RMS, inside the sounding
    part), each part at least min_part_s long. Between two words the deepest dip is the stop closure ("let's|go",
    "che|ck it") or the pause between spelled letters. Parts keep their natural edges; shape_chop / trim_oneshot
    finish them."""
    x = np.asarray(x, dtype=np.float64)
    if n <= 1:
        return [x]
    e = env_rms(x, smooth_ms)
    loud = np.nonzero(e >= floor_rel * e.max())[0]
    s_on, s_off = int(loud[0]), int(loud[-1])
    gap = int(min_part_s * SR)
    step = int(0.002 * SR)
    cand = [i for i in range(s_on + gap, s_off - gap, step)
            if e[i] <= e[max(0, i - step)] and e[i] <= e[min(len(e) - 1, i + step)]]
    cand.sort(key=lambda i: e[i])
    cuts: list[int] = []
    for i in cand:
        if all(abs(i - c) >= gap for c in cuts):
            cuts.append(i)
        if len(cuts) == n - 1:
            break
    if len(cuts) < n - 1:
        raise ValueError(f'only {len(cuts)} dips for {n} parts')
    cuts.sort()
    # centre each cut in its dip: the quietest 1 ms point within +-15 ms
    fine = []
    for c in cuts:
        a, b = max(0, c - int(0.015 * SR)), min(len(x), c + int(0.015 * SR))
        fine.append(a + int(np.argmin(env_rms(x[a:b], 0.5))))
    edges = [0] + fine + [len(x)]
    return [x[edges[i]:edges[i + 1]].copy() for i in range(n)]


# ── colour ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def short_room(x: np.ndarray, send: float, seed: int, rt60: float = 0.32, tail_s: float = 0.45) -> np.ndarray:
    """A small room: a seeded synthetic IR (fel_synth make_ir, rt60 about 0.3 s, 5 ms pre-delay) at `send`, so a chop
    keeps a little air without a long tail."""
    y = np.concatenate([np.asarray(x, dtype=np.float64), np.zeros(int(tail_s * SR))])
    if send <= 0:
        return y
    ir = F.make_ir(rt60=rt60, predelay_ms=5.0, damping=0.5, early=0.45, low_cut=250.0, seed=seed, channel=0)
    return y + F.fft_convolve(y, ir, len(y)) * send


def slap_echo(x: np.ndarray, delay_ms: float = 92.0, gain_db: float = -9.0, second_db: float = -19.0,
              eq=(('hp', 600.0, 0.707, 2), ('lp', 2600.0, 0.707, 2))) -> np.ndarray:
    """One slap-back repeat (and a faint second), each filtered a little darker and thinner than the dry."""
    x = np.asarray(x, dtype=np.float64)
    d = int(round(delay_ms * 1e-3 * SR))
    y = np.concatenate([x, np.zeros(2 * d + int(0.05 * SR))])
    wet = F.fft_filter(np.concatenate([x, np.zeros(int(0.05 * SR))]), list(eq))
    y[d:d + len(wet)] += wet * F.undb(gain_db)
    y[2 * d:2 * d + len(wet)] += F.fft_filter(wet, list(eq)) * F.undb(second_db)
    return y


def band(x: np.ndarray, lo: float, hi: float, poles: int = 4, mid_db: float = 0.0, mid_hz: float = 1400.0) -> np.ndarray:
    bands = [('hp', lo, 0.707, poles), ('lp', hi, 0.707, poles)]
    if mid_db:
        bands.append(('peak', mid_hz, mid_db, 0.9))
    return F.fft_filter(np.asarray(x, dtype=np.float64), bands, pad=int(0.2 * SR))


def even_out(x: np.ndarray, amount: float = 0.6, win_ms: float = 30.0, max_db: float = 9.0,
             floor_db: float = -30.0) -> np.ndarray:
    """A slow leveller for a held vowel: gain = (level / loudest) ** -amount (about a 2.5:1 compression at 0.6),
    at most +max_db, only where the level is within floor_db of the loudest, on a smoothed envelope."""
    x = np.asarray(x, dtype=np.float64)
    e = env_rms(x, win_ms / 2)
    ref = e.max()
    g = np.minimum(np.maximum(e / ref, 1e-9) ** -amount, F.undb(max_db))
    g[e < ref * F.undb(floor_db)] = 1.0
    g = F.moving_avg(g, int(win_ms * 1e-3 * SR / 2))
    return x * g


def declick(x: np.ndarray, at: list[int], half_ms: float = 1.2, lp_hz: float = 3500.0) -> np.ndarray:
    """Soften isolated discontinuities (a plosive burst's first edge, a vocal-fry pulse) at the given samples: a
    raised-cosine crossfade, over +-half_ms, into a low-passed copy of the neighbourhood (the classic de-click)."""
    y = np.array(x, dtype=np.float64, copy=True)
    w = max(4, int(half_ms * 1e-3 * SR))
    pad = int(0.004 * SR)
    for i in at:
        a, b = max(0, i - w - pad), min(len(y), i + w + pad)
        seg = y[a:b].copy()
        lp = F.fft_filter(seg, [('lp', lp_hz, 0.707, 2)], pad=len(seg))
        bump = np.zeros(len(seg))
        c0, c1 = max(0, i - w - a), min(len(seg), i + w - a)
        u = (np.arange(c0, c1) - (i - a)) / w
        bump[c0:c1] = 0.5 + 0.5 * np.cos(np.pi * np.clip(u, -1, 1))
        y[a:b] = seg * (1 - bump) + lp * bump
    return y


def saturate(x: np.ndarray, drive: float, level: float = 0.9) -> np.ndarray:
    """fel_synth's tanh drive at a fixed input level (so `drive` means the same thing on every chop)."""
    x = np.asarray(x, dtype=np.float64)
    pk = float(np.max(np.abs(x))) or 1.0
    return F._sat(x / pk * level, drive) * pk / level
