"""voices_cypher.py — extra fel_synth voices for song 2, `cypher` ("Windward Circle", slap-bass funk).

Importing this module registers four voices in fel_synth.VOICES (in this process only; fel_synth.py itself is not
changed, so the other composers' renders are unaffected):

    slapx   additive slap bass with three articulations (art='thumb' | 'pop' | 'dead'), string-like damping (high
            partials die first), a pluck-position comb, a fret/finger transient and optional slides (from=, glide=).
    clavx   funk clav: a narrow pulse through a resonant, fast-closing low-pass (the "quack"); short muted "chk" notes
            come from a small `sustain` and a short `decay`.
    congax  the library conga through a per-note soft clip (p: sat) — the slap is rounded against its own body.
    kickx   the library kick with its beater click replaced by a 5 ms windowed noise burst (no lone spike that the
            no-click rule would read as a click after MP3 coding).

Everything is synthesised from sines, pulses and seeded noise (no samples, no recordings).
"""
from __future__ import annotations

import numpy as np

import fel_synth as F
from fel_synth import SR, voice, VoiceCall, t_axis, additive, env_adsr, fft_filter, filtered_osc, _glide_curve, \
    _norm_peak, _sat

# articulation tables: pluck position, spectral tilt, brightness corner (base, per bright*vel), damping, transient
_SLAP = {
    #          pos   tilt  fc0     fc_amt  tau0  kdamp  flick  nz_tau  nz_band                         nz_lvl
    'thumb': (0.19, 0.95, 1400.0, 2600.0, 0.70, 7.0, 0.10, 0.006, [('bp', 1300.0, 0.9)], 0.16),
    'pop':   (0.11, 0.80, 2600.0, 4500.0, 0.50, 5.0, 0.22, 0.004, [('bp', 3200.0, 1.1), ('hp', 1500.0)], 0.22),
    'dead':  (0.25, 1.30, 700.0, 0.0, 0.030, 25.0, 0.00, 0.012, [('bp', 700.0, 0.8)], 0.55),
}


@voice('slapx', 'tonal', 1, 'additive slap bass. p: art thumb|pop|dead, bright, decay, release, drive, from, glide')
def v_slapx(v: VoiceCall) -> np.ndarray:
    p = v.p
    art = p.get('art', 'thumb')
    pos, tilt, fc0, fc_amt, tau0, kdamp, flick, nz_tau, nz_band, nz_lvl = _SLAP[art]
    bright = p.get('bright', 0.7)
    rel = p.get('release', 0.035 if art != 'dead' else 0.012)
    n = int(SR * (v.dur + rel * 6 + 0.012))
    t = t_axis(n)
    f = _glide_curve(n, v.f, p)
    if flick:
        f = f * 2.0 ** (flick / 12.0 * np.exp(-t / 0.014))
    f0 = float(v.f)
    K = max(1, min(420, int(0.46 * SR / (f0 * 1.03))))
    k = np.arange(1, K + 1, dtype=np.float64)
    fk = k * f0
    fc = fc0 + fc_amt * bright * v.vel
    amps = k ** -tilt * (0.3 + 0.7 * np.abs(np.sin(np.pi * k * pos))) / (1.0 + (fk / fc) ** 2)
    tau = p.get('decay', tau0)

    def gfn(fkk, idx):
        tt = (idx / SR)[None, :]
        return np.exp(-tt * (1.0 / tau + kdamp * (fkk / 1000.0) ** 1.3))

    # harmonic phases: the fundamental starts at 0, the partials at seeded random phases. Aligned phases would give
    # a saw-like step once per period (a hard kink the no-click rule rightly flags); spread phases keep the same
    # spectrum without the step.
    ph0 = np.concatenate([[0.0], v.rng.random(K - 1) * 2.0 * np.pi])
    x = additive(f, amps, gfn, phase0=ph0)
    x *= env_adsr(n, 0.0012, 1.0, 1.0, rel, v.dur)
    x = _norm_peak(x)
    m = min(n, int(0.03 * SR))
    nz = v.rng.standard_normal(m) * np.exp(-t_axis(m) / nz_tau)
    nz = _norm_peak(fft_filter(nz, nz_band))
    x[:m] += nz_lvl * (0.5 + 0.5 * v.vel) * nz
    x = _sat(x, p.get('drive', 0.12))
    return _norm_peak(x, 0.8 if art != 'dead' else 0.5)


@voice('clavx', 'tonal', 1, 'funk clav (resonant quack). p: width, cutoff, env, fdecay, q, decay, sustain, release, drive')
def v_clavx(v: VoiceCall) -> np.ndarray:
    p = v.p
    rel = p.get('release', 0.012)
    n = int(SR * (v.dur + rel * 6 + 0.005))
    t = t_axis(n)
    cut = p.get('cutoff', 1000.0) + p.get('env', 4200.0) * (0.35 + 0.65 * v.vel) * np.exp(-t / p.get('fdecay', 0.07))
    x = filtered_osc(np.full(n, v.f), 'pulse', cut, q=p.get('q', 2.4), poles=2, width=p.get('width', 0.2),
                     hp=320.0, f_ref=v.f, phase0=float(v.rng.random()))
    env = env_adsr(n, 0.0015, p.get('decay', 0.22), p.get('sustain', 0.25), rel, v.dur)
    # a clav through a small driven amp: the soft clip rounds the resonant attack spike (~3 dB less crest)
    return _norm_peak(_sat(_norm_peak(x * env), p.get('drive', 0.35)), 0.5)


def _saturated(base: str, peak: float):
    """A library voice through a per-note soft clip (p['sat'], 0..1): the hit's transient is rounded against its own
    body — a compressor pedal on the instrument, not on the mix. Dynamics BETWEEN notes (ghosts vs accents) stay."""
    fn = F.VOICES[base].fn

    def v(call: VoiceCall) -> np.ndarray:
        p = dict(call.p)
        sat = p.pop('sat', 0.4)
        lp = p.pop('sat_lp', 13000.0)
        x = fn(VoiceCall(call.f, call.midi, call.dur, call.vel, p, call.rng))
        # the clip's new harmonics are band-limited again (sat_lp). NB: clipping noisy hits (a snare) is a bad idea for
        # MP3 stems: the coded plateau regrows its peak (+2 dB measured on a snare at sat 0.7) — congas are fine (+0 dB)
        return _norm_peak(fft_filter(_sat(_norm_peak(x), sat), [('lp', lp, 0.707, 4)]), peak)
    return v


for _name, _base, _peak, _about in (
        ('congax', 'conga', 1.0, 'library conga through a per-note soft clip. p: sat, sat_lp + conga p'),
):
    voice(_name, 'drum', F.VOICES[_base].variants, _about)(_saturated(_base, _peak))


@voice('kickx', 'drum', 3, 'library sine kick (click 0) + a windowed beater noise (a 5 ms hann burst, no single spike). '
       'p: beater + kick p')
def v_kickx(v: VoiceCall) -> np.ndarray:
    p = dict(v.p)
    beater = p.pop('beater', 0.25)
    p['click'] = 0.0
    x = F.VOICES['kick'].fn(VoiceCall(v.f, v.midi, v.dur, v.vel, p, v.rng))
    m = int(0.005 * SR)
    nz = fft_filter(v.rng.standard_normal(m + 64), [('hp', 1500.0), ('lp', 6000.0)])[32:32 + m] * np.hanning(m)
    x[:m] += beater * (0.5 + 0.5 * v.vel) * _norm_peak(nz)
    return _norm_peak(x)


VOICE_NAMES = ('slapx', 'clavx', 'congax', 'kickx')
assert all(name in F.VOICES for name in VOICE_NAMES)
