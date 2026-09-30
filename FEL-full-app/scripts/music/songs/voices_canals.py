"""voices_canals.py — extra voices for song_canals.py ("Canal Lights"). ADDS to fel_synth's registry, changes nothing.

Everything is synthesised from code (numpy sines + filtered noise). No samples, no recordings.

    drip   a water-drop "plink": a sine whose pitch jumps up fast and settles, with a short decay and a faint
           airy tick. The canal twinkle that gives the fx stem its identity in the intro, the break and the outro.
"""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fel_synth import SR, VoiceCall, voice, t_axis, phase_of, fft_filter, edge_fade, _norm_peak  # noqa: E402


@voice('drip', 'fx', 3, 'water-drop plink (sine chirping up, short decay, airy tick). p: rise (pitch ratio), decay, air')
def v_drip(v: VoiceCall) -> np.ndarray:
    p = v.p
    f0 = v.f or 1000.0
    decay = p.get('decay', 0.055)
    n = int(SR * (decay * 6.0 + 0.02))
    t = t_axis(n)
    rise = p.get('rise', 1.7)                                   # pitch ratio reached ~40 ms after the start
    f = f0 * (1.0 + (rise - 1.0) * (1.0 - np.exp(-t / 0.013)))
    body = np.sin(2 * np.pi * phase_of(f)) * np.exp(-t / decay)
    body += 0.18 * np.sin(2 * np.pi * phase_of(f * 2.01)) * np.exp(-t / (decay * 0.4))
    m = int(0.006 * SR)
    tick = np.zeros(n)
    tick[:m] = edge_fade(fft_filter(v.rng.standard_normal(m) * np.exp(-t_axis(m) / 0.0012),
                                    [('hp', 3000), ('lp', 9000)]), 0.3, 2.0)
    x = _norm_peak(body) + p.get('air', 0.12) * _norm_peak(tick)
    return _norm_peak(x, 0.5)
