"""flip_voices — shared instruments for the Flip loop pack (musicsuite/flippack). ADDS to fel_synth's registry,
changes nothing in fel_synth.py. Everything is synthesised from sines, band-limited oscillators and seeded noise:
no samples, no recordings, no impulse responses from anywhere.

    flute    breathy flute: soft triangle core + breath noise shaped on the harmonics + a "chiff" (a short noisy
             overblow at the attack, which is also what makes each note a clean Flip onset). p: breath, chiff, vib,
             attack, release, bright
    strings  a string section from detuned band-limited saws: art='stacc' (short, bowed-off: stabs and spiccato),
             'marc' (accented, medium) or 'legato' (slow swell: beds only, never a chop event). p: art, voices, spread,
             bright, scrape, attack, decay, sustain, release
    gtr      plucked (synth) guitar string, additive: pluck-position comb, high partials die first, pick noise,
             small body resonance. p: pos, bright, decay, damp, pick, mute (0..1 palm mute)
    mallet   struck bar: kind='marimba' | 'vibes' | 'kalimba' (mode ratios per kind), mallet hardness. p: kind,
             hard, decay

All four have attacks under ~12 ms (legato strings excepted) so a note is a Flip onset when it stands clear of the
bed (SPEC.md, "writing for the finder"). Import this module to register them: `import flip_voices`.
"""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fel_synth as F  # noqa: E402
from fel_synth import (SR, VoiceCall, voice, t_axis, env_adsr, filtered_osc, additive, fft_filter, stft_noise,  # noqa: E402
                       bp_gain, hp_gain, lp_gain, edge_fade, _norm_peak, _sat, _cos_ramp, phase_of, harmonic_amps)


def _vib(n: int, t: np.ndarray, depth_semi: float, rate: float, delay: float, rng) -> np.ndarray:
    ramp = np.clip((t - delay) / 0.25, 0.0, 1.0)
    return depth_semi * ramp * np.sin(2 * np.pi * rate * t + rng.random() * 6.28)


@voice('flute', 'tonal', 1, 'breathy flute with a chiff attack. p: breath, chiff, vib, attack, release, bright')
def v_flute(v: VoiceCall) -> np.ndarray:
    p = v.p
    rel = p.get('release', 0.07)
    n = int(SR * (v.dur + rel * 6))
    t = t_axis(n)
    f0 = v.f
    semis = _vib(n, t, p.get('vib', 0.18), p.get('rate', 5.1), p.get('vib_delay', 0.18), v.rng)
    scoop = -0.25 * np.exp(-t / 0.03)                      # a tiny lip scoop into the note
    f = f0 * 2.0 ** ((semis + scoop) / 12.0)
    bright = p.get('bright', 0.5)
    tone = filtered_osc(f, 'tri', f0 * (2.2 + 2.5 * bright), q=0.7, poles=2, f_ref=f0, phase0=v.rng.random())
    tone += 0.12 * np.sin(2 * np.pi * phase_of(f * 2.0, v.rng.random()))
    # breath: noise through bands on the first harmonics, plus air above
    def bgain(fr, tt):
        g = np.zeros_like(fr)
        for k, lvl in ((1, 1.0), (2, 0.6), (3, 0.35)):
            g = g + lvl * bp_gain(fr, f0 * k, 6.0)
        return g + 0.25 * hp_gain(fr, 5000.0) * lp_gain(fr, 11000.0)
    breath = stft_noise(n, v.rng, bgain, nfft=1024)
    breath = breath / max(np.max(np.abs(breath)), 1e-9)
    env = env_adsr(n, p.get('attack', 0.012), 0.25, p.get('sustain', 0.85), rel, v.dur)
    x = _norm_peak(tone) * env + p.get('breath', 0.10) * breath * env
    ch = p.get('chiff', 0.35)
    if ch > 0:                                              # the chiff: 18 ms of overblown noise at the attack
        m = min(n, int(0.018 * SR))
        cn = fft_filter(v.rng.standard_normal(m + 256), [('bp', min(f0 * 3.0, 9000.0), 1.4), ('hp', 800.0)])[128:128 + m]
        cn = _norm_peak(cn) * np.exp(-t_axis(m) / 0.006) * _cos_ramp_head(m, int(0.0015 * SR))
        x[:m] += ch * (0.6 + 0.4 * v.vel) * cn
    return _norm_peak(x, 0.5)


def _cos_ramp_head(n: int, r: int) -> np.ndarray:
    out = np.ones(n)
    r = min(r, n)
    out[:r] = _cos_ramp(r)
    return out


_STR_ART = {
    #          attack  decay  sustain release scrape
    'stacc':  (0.006, 0.10, 0.18, 0.07, 0.30),
    'marc':   (0.010, 0.22, 0.55, 0.12, 0.22),
    'legato': (0.180, 0.60, 0.95, 0.35, 0.05),
}


@voice('strings', 'tonal', 1, 'string section (detuned saws + bow scrape). p: art stacc|marc|legato, voices, spread, '
       'bright, scrape, attack, decay, sustain, release')
def v_strings(v: VoiceCall) -> np.ndarray:
    p = v.p
    a0, d0, s0, r0, sc0 = _STR_ART[p.get('art', 'marc')]
    rel = p.get('release', r0)
    n = int(SR * (v.dur + rel * 6))
    t = t_axis(n)
    f0 = v.f
    bright = p.get('bright', 0.5)
    fenv = np.exp(-t / 0.08)
    cut = f0 * (3.0 + 5.0 * bright * v.vel) + 2500.0 * bright * fenv
    cut = np.minimum(cut, 14000.0)
    nv = int(p.get('voices', 5))
    spread = p.get('spread', 11.0)
    x = np.zeros(n)
    for i in range(nv):
        c = (i - (nv - 1) / 2) * (2 * spread / max(nv - 1, 1))
        semis = _vib(n, t, 0.08, 5.3 + 0.37 * i, 0.2, v.rng) + c / 100.0
        f = f0 * 2.0 ** (semis / 12.0)
        x += filtered_osc(f, 'saw', cut, q=0.8, poles=2, f_ref=f0, phase0=v.rng.random())
    x = fft_filter(x, [('peak', 600.0, 2.0, 0.8), ('peak', 2800.0, 1.5, 1.0), ('hp', 120.0)])  # a body, not a synth
    env = env_adsr(n, p.get('attack', a0), p.get('decay', d0), p.get('sustain', s0), rel, v.dur)
    x = _norm_peak(x) * env
    sc = p.get('scrape', sc0)
    if sc > 0:                                              # bow scrape: 25 ms of rosin noise at the attack
        m = min(n, int(0.025 * SR))
        nz = fft_filter(v.rng.standard_normal(m + 256), [('bp', 3500.0, 0.9), ('hp', 1500.0)])[128:128 + m]
        x[:m] += sc * v.vel * _norm_peak(nz) * np.exp(-t_axis(m) / 0.008) * _cos_ramp_head(m, int(0.001 * SR))
    return _norm_peak(x, 0.5)


@voice('gtr', 'tonal', 1, 'plucked guitar string (additive). p: pos, bright, decay, damp, pick, mute')
def v_gtr(v: VoiceCall) -> np.ndarray:
    p = v.p
    mute = float(p.get('mute', 0.0))
    decay = p.get('decay', 1.6) * (1.0 - 0.85 * mute)
    rel = p.get('release', 0.05)
    n = int(SR * (min(v.dur + rel * 6, decay * 3.0) + 0.02))
    t = t_axis(n)
    f0 = v.f
    K = max(1, min(160, int(0.46 * SR / (f0 * 1.01))))
    k = np.arange(1, K + 1, dtype=np.float64)
    pos = p.get('pos', 0.17)
    bright = p.get('bright', 0.55)
    amps = k ** -1.05 * (0.25 + 0.75 * np.abs(np.sin(np.pi * k * pos))) / (1.0 + (k * f0 / (1500.0 + 4000.0 * bright * v.vel)) ** 2)
    damp = p.get('damp', 2.2) * (1.0 + 6.0 * mute)
    ph0 = np.concatenate([[0.0], v.rng.random(K - 1) * 2 * np.pi])

    def gfn(fk, idx):
        tt = (idx / SR)[None, :]
        return np.exp(-tt * (1.0 / decay + damp * (fk / 1000.0) ** 1.25))
    x = additive(np.full(n, f0), amps, gfn, phase0=ph0)
    x *= env_adsr(n, 0.0015, 10.0, 1.0, rel, v.dur)
    x = _norm_peak(x)
    m = min(n, int(0.006 * SR))
    pick = fft_filter(v.rng.standard_normal(m + 256), [('bp', 2500.0 + 2500.0 * bright, 0.9)])[128:128 + m]
    x[:m] += p.get('pick', 0.25) * _norm_peak(pick) * np.exp(-t_axis(m) / 0.0015)
    x = fft_filter(x, [('peak', 110.0, 3.0, 1.2), ('peak', 220.0, 2.0, 1.0), ('peak', 3200.0, -2.0, 0.7), ('hp', 70.0)])
    return _norm_peak(_sat(x, p.get('drive', 0.05)), 0.5)


_MALLET = {
    #            mode ratios                  mode levels            mode decay scale
    'marimba': ((1.0, 3.93, 9.24), (1.0, 0.30, 0.10), (1.0, 0.35, 0.18)),
    'vibes':   ((1.0, 4.0, 10.0), (1.0, 0.25, 0.08), (1.0, 0.50, 0.25)),
    'kalimba': ((1.0, 5.4, 11.3), (1.0, 0.22, 0.10), (1.0, 0.30, 0.15)),
}


@voice('mallet', 'tonal', 1, 'struck bar: kind marimba|vibes|kalimba. p: kind, hard, decay')
def v_mallet(v: VoiceCall) -> np.ndarray:
    p = v.p
    ratios, levels, dscale = _MALLET[p.get('kind', 'marimba')]
    decay = p.get('decay', 0.45 if p.get('kind', 'marimba') != 'vibes' else 1.4)
    n = int(SR * (decay * 5.0 + 0.02))
    t = t_axis(n)
    hard = p.get('hard', 0.5) * (0.5 + 0.5 * v.vel)
    x = np.zeros(n)
    for r, lvl, ds in zip(ratios, levels, dscale):
        fr = v.f * r
        if fr > 0.45 * SR:
            continue
        x += lvl * (0.4 + 1.2 * hard if r > 1 else 1.0) * np.sin(2 * np.pi * fr * t + v.rng.random() * 6.28) * np.exp(-t / (decay * ds))
    if p.get('kind') == 'vibes':
        x *= 1.0 - 0.25 * (0.5 - 0.5 * np.cos(2 * np.pi * 5.5 * t))
    m = min(n, int(0.004 * SR))
    click = fft_filter(v.rng.standard_normal(m + 256), [('bp', 2000.0 + 3000.0 * hard, 0.8)])[128:128 + m]
    x = _norm_peak(x)
    x[:m] += 0.2 * hard * _norm_peak(click) * np.exp(-t_axis(m) / 0.001)
    x *= _cos_ramp_head(n, int(0.0008 * SR))
    return _norm_peak(x, 0.5)


VOICE_NAMES = ('flute', 'strings', 'gtr', 'mallet')
assert all(name in F.VOICES for name in VOICE_NAMES)
