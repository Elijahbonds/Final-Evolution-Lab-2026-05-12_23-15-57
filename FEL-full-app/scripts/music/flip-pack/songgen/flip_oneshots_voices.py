"""flip_oneshots_voices — extra instruments for the Flip pack's one-shots and textures (musicsuite/flippack;
producer script songgen/flip_oneshots.py). ADDS to fel_synth's registry, changes nothing in fel_synth.py,
flip_voices.py or voices_cypher.py. Everything is synthesised from sines and seeded noise: no samples, no recordings,
no impulse responses read from anywhere.

    woodknock  a struck wood block: three damped inharmonic bar modes + a band-passed noise knock.
               p: tone (Hz of the lowest mode), decay (s), noise (0..1), q
    kickskin   the batter-head "thump" of an acoustic kick: a low band of noise and a damped shell mode, meant to be
               layered under kickx so the kick reads as a played drum, not a sine boom. p: tone, decay, shell

Texture generators (plain functions; the producer shapes, loops and levels them):

    crackle_pops(n, rng, rate, loud_prob, ...)   (n, 2) vinyl pops: Hann-windowed 0.1-1 ms noise bursts at Poisson
                                                 times, each with a short cartridge ring (0.5-2.5 ms), lognormal
                                                 sizes with rare loud ones, each panned near centre
    tape_hiss(n, rng, ...)                       (n,) tape-spectrum hiss (HP 300, a 4-6 kHz lift, LP 12 kHz) whose
                                                 low-pass wobbles with a slow "wow"
    rumble(n, rng, rate, ...)                    (n,) turntable rumble: 18-70 Hz noise with a swell at the platter
                                                 rate (33 1/3 rpm = 0.5556 Hz)

Import this module to register the voices: `import flip_oneshots_voices`.
"""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fel_synth as F  # noqa: E402
from fel_synth import (SR, VoiceCall, voice, t_axis, fft_filter, stft_noise, bp_gain, hp_gain, lp_gain,  # noqa: E402
                       peak_gain, _norm_peak, _cos_ramp)


def _head_ramp(n: int, ms: float) -> np.ndarray:
    r = min(n, max(1, int(ms * 1e-3 * SR)))
    out = np.ones(n)
    out[:r] = _cos_ramp(r)
    return out


# ── drums ───────────────────────────────────────────────────────────────────────────────────────────────────────────

_WOOD_MODES = ((1.0, 1.0, 1.0), (2.71, 0.42, 0.55), (4.93, 0.18, 0.35))    # ratio, level, decay scale (a hard-wood bar)


@voice('woodknock', 'drum', 3, 'struck wood block: damped inharmonic modes + band-passed noise knock. p: tone, decay, '
       'noise, q')
def v_woodknock(v: VoiceCall) -> np.ndarray:
    p = v.p
    f0 = float(p.get('tone', 820.0))
    decay = float(p.get('decay', 0.035))
    n = int(SR * (decay * 7.0 + 0.02))
    t = t_axis(n)
    body = np.zeros(n)
    for r, lvl, ds in _WOOD_MODES:
        fr = f0 * r
        if fr > 0.45 * SR:
            continue
        body += lvl * np.sin(2 * np.pi * fr * t + v.rng.random() * 0.4) * np.exp(-t / (decay * ds))
    q = float(p.get('q', 3.5))
    nz = v.rng.standard_normal(n + 512) * np.exp(-np.arange(n + 512) / (SR * decay * 0.35))
    nz = fft_filter(nz, lambda f: bp_gain(f, f0 * 1.35, q) + 0.5 * bp_gain(f, f0 * 3.1, q), pad=4096)[:n]
    x = _norm_peak(body) + p.get('noise', 0.55) * _norm_peak(nz)
    return _norm_peak(x * _head_ramp(n, 0.35))


@voice('kickskin', 'drum', 3, 'acoustic kick head thump (noise band + damped shell mode), layered under kickx. '
       'p: tone, decay, shell')
def v_kickskin(v: VoiceCall) -> np.ndarray:
    p = v.p
    tone = float(p.get('tone', 95.0))
    decay = float(p.get('decay', 0.045))
    n = int(SR * (decay * 7.0 + 0.03))
    t = t_axis(n)
    nz = v.rng.standard_normal(n + 1024) * np.exp(-np.arange(n + 1024) / (SR * decay))
    nz = fft_filter(nz, [('bp', tone, 1.2), ('lp', 900.0, 0.7)], pad=4096)[:n]
    shell = np.sin(2 * np.pi * phase_drop(t, tone * 1.9, 0.12, 0.02)) * np.exp(-t / (decay * 1.4))
    x = _norm_peak(nz) + p.get('shell', 0.35) * shell
    return _norm_peak(x * _head_ramp(n, 1.0))


def phase_drop(t: np.ndarray, f: float, depth: float, tau: float) -> np.ndarray:
    """Phase (cycles) of a tone that starts depth x f sharp and settles to f with time-constant tau."""
    fi = f * (1.0 + depth * np.exp(-t / tau))
    return np.cumsum(fi) / SR


# ── texture generators ──────────────────────────────────────────────────────────────────────────────────────────────

def crackle_pops(n: int, rng: np.random.Generator, rate: float = 20.0, loud_prob: float = 0.05,
                 loud_gain: float = 2.5, width: float = 0.35, sigma: float = 0.35, ring_mix: float = 0.6,
                 ring_ms: tuple = (0.5, 2.5), ring_hz: tuple = (1200.0, 4000.0)) -> np.ndarray:
    """(n, 2) vinyl pops. Each pop is a Hann-windowed noise burst 0.1-1 ms long (log-uniform) at a Poisson time, plus
    the short ring it excites in the stylus/cartridge (a damped resonance, ring_hz, time-constant ring_ms, mixed at
    ring_mix), sized lognormal(0, sigma) clipped at +-2 sigma (x loud_gain with probability loud_prob: the rare loud
    ones), panned centre +- width. The ring gives each pop body without raising its peak, so a crackle can reach its
    loudness on the pops rather than on the hiss. Each pop is band-shaped on its own (no energy under ~500 Hz: that
    is the rumble's band) and THEN scaled so its louder channel peaks at exactly its size: the file's crest is set by
    the size distribution, not by a random ring phase. Pops that run past n spill into the returned array's tail
    padding: the caller folds (P.fold) so they wrap into the head."""
    pad = int(0.03 * SR)
    pre = 128                                                              # room for the zero-phase shaping's pre-ring
    out = np.zeros((n + pad + pre, 2))
    bands = [('hp', 550.0, 0.707), ('peak', 2800.0, 3.0, 0.9), ('lp', 10500.0, 0.707)]
    t = 0.0
    while True:
        t += rng.exponential(1.0 / rate)
        s = int(t * SR)
        if s >= n:
            break
        d = int(round(SR * 1e-3 * 10 ** rng.uniform(-1.0, 0.0)))          # 0.1 .. 1 ms
        d = max(5, d)
        amp = float(np.exp(np.clip(rng.normal(0.0, sigma), -2 * sigma, 2 * sigma)))
        if rng.random() < loud_prob:
            amp *= loud_gain
        burst = rng.standard_normal(d) * np.hanning(d + 2)[1:-1]
        burst = burst / max(float(np.max(np.abs(burst))), 1e-9)
        fr = 10 ** rng.uniform(math.log10(ring_hz[0]), math.log10(ring_hz[1]))
        tau = 1e-3 * rng.uniform(*ring_ms)
        L = int(5 * tau * SR)
        tt = np.arange(L) / SR
        h = np.exp(-tt / tau) * np.sin(2 * np.pi * fr * tt + rng.uniform(0.0, 2 * math.pi))
        h *= np.minimum(1.0, np.arange(L) / max(1, int(0.0002 * SR)))    # the ring starts softly (no step)
        ring = np.convolve(burst, h)
        ring /= max(float(np.max(np.abs(ring))), 1e-9)
        pop = np.concatenate([burst, np.zeros(len(ring) - d)]) + ring_mix * ring
        pop = np.concatenate([np.zeros(pre), pop, np.zeros(pre)])
        pop = fft_filter(pop, bands, pad=4096)
        pop[:pre // 4] *= _cos_ramp(pre // 4)
        pop[-(pre // 4):] *= _cos_ramp(pre // 4)[::-1]
        th = math.pi / 4 + rng.uniform(-width, width)
        gl, gr = math.cos(th) * math.sqrt(2), math.sin(th) * math.sqrt(2)
        pop = pop * (amp / max(float(np.max(np.abs(pop))) * max(gl, gr), 1e-9))
        m = min(len(pop), len(out) - s)
        out[s:s + m, 0] += pop[:m] * gl
        out[s:s + m, 1] += pop[:m] * gr
    return out[pre:]


def tape_hiss(n: int, rng: np.random.Generator, hp: float = 300.0, lift_hz: float = 5000.0, lift_db: float = 4.0,
              lp: float = 12000.0, wow_rate: float = 0.55, wow_depth: float = 0.06) -> np.ndarray:
    """(n,) unit-RMS tape hiss: HP `hp`, a gentle bell of +lift_db around lift_hz (4-6 kHz), LP `lp` whose corner
    wobbles +-wow_depth at wow_rate Hz (the slight wow in its filter)."""
    ph = rng.random() * 2 * math.pi

    def g(f, tt):
        wob = 1.0 + wow_depth * np.sin(2 * np.pi * wow_rate * tt + ph)
        return (hp_gain(f, hp, 0.707) * peak_gain(f, lift_hz, lift_db, 0.7) * lp_gain(f, lp * wob, 0.707)
                * peak_gain(f, 1200.0, -1.5, 0.8))
    x = stft_noise(n, rng, g, nfft=2048)
    return x / max(float(np.sqrt(np.mean(x * x))), 1e-12)


def rumble(n: int, rng: np.random.Generator, rate: float = 100.0 / 180.0, depth: float = 0.55,
           lo: float = 18.0, hi: float = 70.0) -> np.ndarray:
    """(n,) unit-RMS turntable rumble: noise band-limited to lo..hi Hz, amplitude swelling once per platter turn."""
    x = rng.standard_normal(n + 8192)
    x = fft_filter(x, [('hp', lo, 0.707, 4), ('lp', hi, 0.707, 4)], pad=16384)[4096:4096 + n]
    t = t_axis(n)
    sw = 1.0 - depth * (0.5 + 0.5 * np.cos(2 * np.pi * rate * t + rng.random() * 2 * math.pi))
    x = x * sw
    return x / max(float(np.sqrt(np.mean(x * x))), 1e-12)


VOICE_NAMES = ('woodknock', 'kickskin')
assert all(name in F.VOICES for name in VOICE_NAMES)
