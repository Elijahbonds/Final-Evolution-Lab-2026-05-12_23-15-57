#!/usr/bin/env python3
"""flip_oneshots.py — the Flip pack's one-shots producer (musicsuite/flippack, SPEC.md §4.3): 5 chord stabs,
9 hits (horns, orchestra, bass, drums), 3 textures and the `bank_kit_fel` kit bank.

Everything here is synthesised by fel_synth + flip_voices + voices_cypher + flip_oneshots_voices from sines,
band-limited oscillators and seeded noise. No samples, no audio files read, no third-party audio. Every random draw
derives from the item's seed (fel_synth.rng_for), so a re-run is byte-identical on this machine.

    PY=/Users/elijahbonds/.cache/fel-kokoro/.venv/bin/python
    $PY flip_oneshots.py                   # render all 17 items + the bank, then the self-check
    $PY flip_oneshots.py --only hit_orch   # render some ids (comma-separated), then the self-check on all
    $PY flip_oneshots.py --check           # the self-check only (no render)

Output: this producer's staging pack, `flippack/oneshots/` (FLIPPACK_DIR, unless it is already set):
    oneshots/audio/<id>.mp3   oneshots/items/<id>.json   oneshots/items.json (all of this producer's records)
    oneshots/banks/bank_kit_fel.json  and  flippack/banks/bank_kit_fel.json (the pack's bank folder)
The records are pack-relative (`file: audio/<id>.mp3`), so assembly is a plain copy of audio/ and items/.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FLIPPACK = os.path.join(os.path.dirname(HERE), 'flippack')
STAGE = os.path.join(FLIPPACK, 'oneshots')
os.environ.setdefault('FLIPPACK_DIR', STAGE)
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

import flip_pack as P  # noqa: E402
import flip_voices  # noqa: E402,F401   (flute / strings / gtr / mallet)
import voices_cypher  # noqa: E402,F401  (slapx / clavx / congax / kickx)
import flip_oneshots_voices as V  # noqa: E402   (woodknock / kickskin + texture generators)
import validate as VAL  # noqa: E402    (the songs' click detector)

F = P.F
SR = P.SR
OC = P.OC
SCRIPT = os.path.abspath(__file__)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# helpers
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def fit(x: np.ndarray, length_s: float, fade_s: float) -> np.ndarray:
    """Cut (or pad) a one-shot to length_s with a raised-cosine fade over its last fade_s: the tail ends where we say,
    and it falls through -60 dB fast (the contract allows at most 0.10 s under -60 dBFS at the end)."""
    n = int(round(length_s * SR))
    x = np.asarray(x, dtype=np.float64)
    x = x[:n] if len(x) >= n else np.pad(x, (0, n - len(x)))
    f = int(round(fade_s * SR))
    x = x.copy()
    x[-f:] *= F._cos_ramp(f)[::-1] ** 1.5
    return x


def punch(x: np.ndarray, boost_db: float, tau: float) -> np.ndarray:
    """A transient lift on a one-shot's head: +boost_db at sample 0, easing back with time-constant tau (s)."""
    t = np.arange(len(x)) / SR
    return np.asarray(x, dtype=np.float64) * F.undb(boost_db * np.exp(-t / tau))


def rms_db(x: np.ndarray) -> float:
    return F.db(float(np.sqrt(np.mean(np.asarray(x) ** 2))) + 1e-12)


def seamless(gen, n: int, xfade: int, rng: np.random.Generator) -> np.ndarray:
    """A continuous noise bed that loops: render n + xfade samples, equal-power crossfade the overhang into the head
    (the fade-in on the head, the fade-out on the overhang) and fold it back (P.fold). The end flows into the start."""
    x = np.array(gen(n + xfade, rng), dtype=np.float64)
    th = 0.5 * np.pi * np.arange(xfade) / xfade
    x[:xfade] *= np.sin(th)[(slice(None),) + (None,) * (x.ndim - 1)]
    x[n:n + xfade] *= np.cos(th)[(slice(None),) + (None,) * (x.ndim - 1)]
    return P.fold(x, n)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# the items: each returns (audio, write kwargs). Chords are spelled out (voicings are original, all common-practice)
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def stab_ep_cm9(seed):
    # Cm9 in close position over its root: C4 Eb4 G4 Bb4 D5; a 6 ms strum; a small room
    x = P.render_chord('ep', ['C4', 'Eb4', 'G4', 'Bb4', 'D5'], 0.42, 0.85, seed=seed, strum_ms=6,
                       bright=0.55, decay=0.85, release=0.12, tine=0.25)
    x = P.process(x, eq=[('hp', 110.0), ('peak', 2400.0, 1.5, 0.8), ('lp', 11000.0)], drive=0.05,
                  reverb=0.10, reverb_type='room', seed=seed)
    return fit(x, 1.30, 0.40), dict(kind='stab', title='EP Cm9', tags=['keys', 'ep', 'stab', 'soul'],
                                    root='C4', chord='Cm9')


def stab_saw_dm7(seed):
    x = P.render_chord('stab', ['D4', 'F4', 'A4', 'C5'], 0.20, 0.9, seed=seed, cutoff=800.0, env=6000.0,
                       decay=0.16, sustain=0.2, release=0.06)
    x = P.process(x, eq=[('hp', 140.0), ('peak', 3200.0, 1.0, 0.9)], reverb=0.15, reverb_type='plate', seed=seed)
    return fit(x, 1.15, 0.45), dict(kind='stab', title='Saw Stab Dm7', tags=['synth', 'saw', 'stab'],
                                    root='D4', chord='Dm7')


def stab_organ_g7(seed):
    x = P.render_chord('organ', ['G3', 'B3', 'D4', 'F4'], 0.25, 0.9, seed=seed, drawbars='gospel', perc=0.4,
                       click=0.10, release=0.03)
    x = P.process(x, eq=[('hp', 90.0), ('peak', 1800.0, 1.0, 0.8), ('lp', 9000.0)], drive=0.12,
                  reverb=0.08, reverb_type='room', seed=seed)
    return fit(x, 0.70, 0.22), dict(kind='stab', title='Organ G7', tags=['keys', 'organ', 'gospel', 'stab'],
                                    root='G3', chord='G7')


def stab_strings_ebmaj7(seed):
    x = P.render_chord('strings', ['Eb4', 'G4', 'Bb4', 'D5'], 0.34, 0.9, seed=seed, art='marc', bright=0.55)
    x = P.process(x, eq=[('hp', 150.0), ('lp', 12000.0)], reverb=0.15, reverb_type='hall', seed=seed)
    return fit(x, 1.50, 0.60), dict(kind='stab', title='Strings Ebmaj7', tags=['strings', 'orchestral', 'stab'],
                                    root='Eb4', chord='Ebmaj7')


def stab_clav_am7(seed):
    x = P.render_chord('clavx', ['A3', 'C4', 'E4', 'G4'], 0.15, 0.85, seed=seed, strum_ms=4, decay=0.12,
                       sustain=0.18, env=4200.0, drive=0.3)
    x = P.process(x, eq=[('hp', 150.0), ('peak', 1400.0, 1.0, 1.0)], reverb=0.06, reverb_type='room', seed=seed)
    return fit(x, 0.45, 0.14), dict(kind='stab', title='Clav Am7', tags=['keys', 'clav', 'funk', 'stab'],
                                    root='A3', chord='Am7')


def hit_horn_fall(seed):
    # a 4-part section on a Bb6 shout voicing (Bb4 D5 F5 G5), 4 unison voices per part, falling 2 semitones
    x = P.render_chord('brass', ['Bb4', 'D5', 'F5', 'G5'], 0.30, 0.9, seed=seed, strum_ms=5, voices=4,
                       bright=0.75, attack=0.008, sustain=0.6, release=0.07, fall=2, fall_time=0.28, scoop=-25.0,
                       vib=6.0)
    x = P.process(x, eq=[('hp', 180.0), ('peak', 2200.0, 1.0, 0.9), ('lp', 12000.0)], reverb=0.10,
                  reverb_type='room', seed=seed)
    return fit(x, 1.00, 0.30), dict(kind='hit', title='Horn Fall', tags=['horns', 'brass', 'fall', 'section'],
                                    root='Bb4', chord='Bb6')


def hit_horn_bap(seed):
    # F4 + F5 (unison section on each, plus the octave). The brass "blat" opens the filter ~80 ms in, which made the
    # loudest moment late (and a second finder onset); a +5 dB punch on the attack keeps the bap front-loaded.
    x = P.render_chord('brass', ['F4', 'F5'], 0.09, 0.95, seed=seed, voices=3, bright=0.8, attack=0.006,
                       sustain=0.5, release=0.05, vib=0.0, scoop=-20.0)
    x = punch(x, 5.0, 0.05)
    x = P.process(x, eq=[('hp', 160.0), ('peak', 2600.0, 1.5, 0.9), ('lp', 13000.0)], reverb=0.08,
                  reverb_type='room', seed=seed)
    return fit(x, 0.55, 0.16), dict(kind='hit', title='Horn Bap', tags=['horns', 'brass', 'short'], root='F4')


def hit_orch(seed):
    # an ORIGINAL orchestra hit: a C power voicing plus the 9th (C G C D G), strings + brass + a pitched low tom
    # standing in for timpani + a short impact for the floor shake, through a plate. Not modelled on any famous hit.
    strings = P.render_chord('strings', ['C3', 'C4', 'G4', 'C5', 'D5', 'G5'], 0.26, 0.95, seed=seed, art='marc',
                             bright=0.7, sustain=0.45)
    brass = P.render_chord('brass', ['C4', 'G4', 'C5', 'D5'], 0.22, 0.95, seed=seed, voices=3, bright=0.8,
                           attack=0.006, sustain=0.55, release=0.08, vib=0.0, scoop=-20.0)
    timp = P.render_voice('tom', 'C2', 0.5, 0.95, seed=seed, decay=0.30)
    boom = P.render_voice('impact', None, 0.5, 0.9, seed=seed, tune=44.0, decay=0.18)    # SHORT: 0.72 s of boom
    x = P.layer(strings, brass, timp, boom, gains_db=[0.0, -1.5, -8.0, -14.0])
    x = P.process(x, eq=[('hp', 38.0), ('peak', 3500.0, 1.5, 0.8), ('lp', 13000.0)], drive=0.10,
                  reverb=0.16, reverb_type='plate', seed=seed)
    return fit(x, 2.20, 0.90), dict(kind='hit', title='Orchestra Hit', tags=['orchestral', 'hit', 'strings', 'brass'],
                                    root='C4', chord='C5add9')


def hit_bass_pluck_a(seed):
    x = P.render_voice('pluck_bass', 'A1', 0.45, 0.9, seed=seed, cutoff=180.0, env=1400.0, decay=0.3,
                       sustain=0.35, release=0.08, q=1.0)
    x = P.process(x, eq=[('hp', 30.0, 0.707), ('peak', 700.0, 1.0, 1.0), ('lp', 4500.0)], drive=0.08, seed=seed)
    return fit(x, 0.70, 0.20), dict(kind='hit', title='Bass Pluck A', tags=['bass', 'synth', 'pluck'], root='A1')


def hit_bass_slap_e(seed):
    x = P.render_voice('slapx', 'E2', 0.26, 0.95, seed=seed, art='pop', bright=0.75, drive=0.35)
    x = P.process(x, eq=[('hp', 35.0), ('peak', 900.0, 1.0, 1.0), ('lp', 9000.0)], seed=seed)
    return fit(x, 0.55, 0.15), dict(kind='hit', title='Bass Slap E', tags=['bass', 'slap', 'funk'], root='E2')


def hit_kick_dusty(seed):
    # an acoustic-style kick: a short, low-swept body (not an 808 boom), a windowed beater, a head thump; then a
    # dusty sampler band-limit (HP 34 / LP 5.2 kHz, both 4-pole) and a little drive
    k = P.render_voice('kickx', None, 0.2, 0.95, seed=seed, tune=55.0, punch=115.0, pitch_tau=0.022, decay=0.085,
                       hold=0.012, beater=0.45, drive=0.25)
    s = P.render_voice('kickskin', None, 0.1, 0.95, seed=seed, tone=95.0, decay=0.04, shell=0.35)
    x = P.layer(k, s, gains_db=[0.0, -7.0])
    x = P.process(x, eq=[('hp', 34.0, 0.707, 4), ('peak', 62.0, 2.0, 1.0), ('peak', 380.0, -4.0, 1.2),
                         ('peak', 2600.0, 2.0, 1.0), ('lp', 5200.0, 0.707, 4)], drive=0.18,
                  reverb=0.05, reverb_type='room', seed=seed)
    return fit(x, 0.35, 0.10), dict(kind='hit', title='Dusty Kick', tags=['drum', 'kick', 'acoustic', 'dusty'])


def hit_snare_crack(seed):
    x = P.render_voice('snare', None, 0.15, 0.95, seed=seed, tune=205.0, decay=0.14, snappy=0.7, body=0.55,
                       tone=0.6, lofi=0.5)
    x = P.process(x, eq=[('hp', 120.0), ('peak', 210.0, 1.5, 1.0), ('lp', 9000.0)], reverb=0.10,
                  reverb_type='room', seed=seed)
    return fit(x, 0.50, 0.15), dict(kind='hit', title='Crack Snare', tags=['drum', 'snare', 'lofi'])


def hit_rim_wood(seed):
    rim = P.render_voice('rim', None, 0.08, 0.95, seed=seed, tone=1.05)
    wood = P.render_voice('woodknock', None, 0.1, 0.9, seed=seed, tone=820.0, decay=0.035, noise=0.55)
    x = P.layer(rim, wood, gains_db=[0.0, -3.0])
    x = P.process(x, eq=[('hp', 250.0), ('lp', 12000.0)], reverb=0.05, reverb_type='room', seed=seed)
    return fit(x, 0.30, 0.08), dict(kind='hit', title='Wood Rim', tags=['drum', 'rim', 'wood'])


def hit_conga_slap(seed):
    x = P.render_voice('congax', None, 0.1, 0.95, seed=seed, size='high', stroke='slap', sat=0.45)
    x = P.process(x, eq=[('hp', 150.0), ('lp', 12000.0)], reverb=0.05, reverb_type='room', seed=seed)
    return fit(x, 0.40, 0.10), dict(kind='hit', title='Conga Slap', tags=['perc', 'conga', 'slap'])


ONESHOTS = {
    'stab_ep_cm9': (stab_ep_cm9, 0x2001),
    'stab_saw_dm7': (stab_saw_dm7, 0x2002),
    'stab_organ_g7': (stab_organ_g7, 0x2003),
    'stab_strings_ebmaj7': (stab_strings_ebmaj7, 0x2004),
    'stab_clav_am7': (stab_clav_am7, 0x2005),
    'hit_horn_fall': (hit_horn_fall, 0x2006),
    'hit_horn_bap': (hit_horn_bap, 0x2007),
    'hit_orch': (hit_orch, 0x2008),
    'hit_bass_pluck_a': (hit_bass_pluck_a, 0x2009),
    'hit_bass_slap_e': (hit_bass_slap_e, 0x200A),
    'hit_kick_dusty': (hit_kick_dusty, 0x200B),
    'hit_snare_crack': (hit_snare_crack, 0x200C),
    'hit_rim_wood': (hit_rim_wood, 0x200D),
    'hit_conga_slap': (hit_conga_slap, 0x200E),
}


# ── textures ────────────────────────────────────────────────────────────────────────────────────────────────────────

CRACKLE = dict(bpm=100, bars=2)
PLATTER_HZ = 100.0 / 180.0          # 33 1/3 rpm


def tex_vinyl_crackle(seed):
    """Pops ~20/s (rare loud ones) over a soft surface hiss and a platter-rate rumble swell, as a seamless 2-bar loop.
    A bare 0.1-1 ms burst carries almost no loudness (a ~28 dB crest: at -24 LUFS its peaks would sit far above
    0 dBFS), so each pop also rings briefly (crackle_pops: the stylus/cartridge resonance), and every pop is scaled
    to an exact peak, so the crest is ~21 dB: at -24 LUFS the loudest pop sits near -3.5 dBFS and the limiter never
    acts. The hiss and rumble sit 12 and 14 LU under the pops."""
    n = P.loop_samples(CRACKLE['bpm'], CRACKLE['bars'])
    pops = P.fold(V.crackle_pops(n, F.rng_for(seed, 'pops'), rate=20.0, loud_prob=0.05, loud_gain=2.2, sigma=0.35,
                                 ring_mix=0.8, width=0.55), n)
    xf = int(0.6 * SR)
    hiss = np.stack([seamless(lambda m, r: V.tape_hiss(m, r, hp=900.0, lift_hz=3500.0, lift_db=2.0, lp=8000.0,
                                                       wow_depth=0.0), n, xf, F.rng_for(seed, 'hiss', c))
                     for c in range(2)], axis=1)
    rum = seamless(lambda m, r: V.rumble(m, r, rate=PLATTER_HZ, depth=0.6), n, xf, F.rng_for(seed, 'rumble'))
    rum2 = np.stack([rum, rum], axis=1)
    pops *= F.undb(-2.5) / float(np.max(np.abs(pops)))
    ref = F.lufs(pops)
    hiss *= F.undb(ref - 12.0 - F.lufs(hiss))
    rum2 *= F.undb(ref - 14.0 - F.lufs(rum2))
    y = pops + hiss + rum2
    y -= y.mean(axis=0, keepdims=True)
    return y, dict(title='Vinyl Crackle', tags=['texture', 'vinyl', 'crackle', 'lofi'], loop=True,
                   bpm=CRACKLE['bpm'], bars=CRACKLE['bars'], lufs_target=-24.0, clicks_by_design=True)


def tex_tape_swell(seed):
    n = int(round(4.0 * SR))
    t = np.arange(n) / SR
    u = t / (n / SR)
    w = u ** (math.log(0.5) / math.log(0.55))            # the swell peaks at 55 % of the way
    env = np.sin(np.pi * w) ** 1.6
    common = V.tape_hiss(n, F.rng_for(seed, 'tape', 'c'))
    chans = []
    for c in range(2):
        own = V.tape_hiss(n, F.rng_for(seed, 'tape', c))
        chans.append((0.55 * common + 0.85 * own) * env)
    y = np.stack(chans, axis=1)
    e = int(0.02 * SR)
    y[:e] *= F._cos_ramp(e)[:, None]
    y[-e:] *= F._cos_ramp(e)[::-1, None]
    return y, dict(title='Tape Swell', tags=['texture', 'tape', 'hiss', 'swell'], loop=False, lufs_target=-22.0)


def tex_riser(seed):
    n = P.loop_samples(100, 2)                            # 2 bars at 100 BPM = 4.8 s: the file end is the landing
    dur = n / SR
    chans = []
    for c in range(2):
        x = P.render_voice('riser', None, dur, 0.9, seed=seed, variant=c, tone='F2', lo=250.0, hi=9000.0, q=1.5,
                           tone_level=0.35, end_ms=10.0)
        x = x[:n] if len(x) >= n else np.pad(x, (0, n - len(x)))
        chans.append(x)
    y = np.stack(chans, axis=1)
    y = np.stack([P.process(y[:, c], eq=[('hp', 60.0), ('lp', 14000.0)], seed=seed)[:n] for c in range(2)], axis=1)
    e = int(0.010 * SR)                                   # a 10 ms landing fade (the spec allows 12 ms or less)
    y[-e:] *= (F._cos_ramp(e)[::-1] ** 2)[:, None]
    s = int(0.005 * SR)
    y[:s] *= F._cos_ramp(s)[:, None]
    return y, dict(title='Riser 2 Bars', tags=['texture', 'riser', 'fx', 'build'], loop=False, bpm=100, bars=2,
                   lufs_target=-20.0)


TEXTURES = {
    'tex_vinyl_crackle': (tex_vinyl_crackle, 0x3001),
    'tex_tape_swell': (tex_tape_swell, 0x3002),
    'tex_riser': (tex_riser, 0x3003),
}

ALL_IDS = list(ONESHOTS) + list(TEXTURES)

BANK = {'id': 'bank_kit_fel', 'title': 'FEL Kit',
        'pads': ['hit_kick_dusty', 'hit_snare_crack', 'hit_rim_wood', 'hit_conga_slap',          # 1-4 drums
                 'hit_bass_pluck_a', 'hit_bass_slap_e',                                         # 5-6 bass
                 'stab_ep_cm9', 'stab_saw_dm7', 'stab_organ_g7', 'stab_strings_ebmaj7', 'stab_clav_am7',  # 7-11
                 'hit_horn_bap', 'hit_horn_fall', 'hit_orch',                                   # 12-14 horns/orch
                 None, None]}


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# render
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def render(iid: str, strict: bool = True) -> dict:
    if iid in ONESHOTS:
        fn, seed = ONESHOTS[iid]
        x, kw = fn(seed)
        kind = kw.pop('kind')
        return P.write_oneshot(iid, x, kind=kind, script=SCRIPT, seed=seed, strict=strict, **kw)
    fn, seed = TEXTURES[iid]
    y, kw = fn(seed)
    return P.write_texture(iid, y, script=SCRIPT, seed=seed, strict=strict, **kw)


def write_bank() -> list[str]:
    out = []
    dirs = {os.path.join(FLIPPACK, 'banks'), os.path.join(P.PACK_DIR, 'banks')}
    if os.path.abspath(P.PACK_DIR) != os.path.abspath(STAGE):
        dirs = {os.path.join(P.PACK_DIR, 'banks')}          # a dry run never touches the pack's bank folder
    for d in sorted(dirs):
        os.makedirs(d, exist_ok=True)
        path = os.path.join(d, 'bank_kit_fel.json')
        with open(path, 'w') as fh:
            json.dump(BANK, fh, indent=1)
            fh.write('\n')
        out.append(path)
    return out


def load_records() -> list[dict]:
    recs = []
    for iid in ALL_IDS:
        p = os.path.join(P.ITEMS_DIR, f'{iid}.json')
        if os.path.exists(p):
            with open(p) as fh:
                recs.append(json.load(fh))
    order = {k: i for i, k in enumerate(P.KINDS)}
    return sorted(recs, key=lambda r: (order[r['kind']], r['id']))


def write_items_json(recs: list[dict]) -> str:
    """This producer's records as one list (the pack.json entries for its items), beside its staged audio."""
    real = os.path.abspath(P.PACK_DIR) == os.path.abspath(FLIPPACK)      # never an extra file in the pack root
    path = os.path.join(STAGE if real else P.PACK_DIR, 'items.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as fh:
        json.dump(recs, fh, indent=1)
        fh.write('\n')
    return path


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# self-check (the contract via flip_pack.validate_record, plus this producer's own numbers)
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def seam_report(dec: np.ndarray) -> dict:
    """The loop join: the step from the last sample to the first against the typical sample-to-sample step in the
    last 5 ms + first 5 ms, per channel, and the songs' click detector run across the join."""
    k = int(0.005 * SR)
    out = {'jump': [], 'typStep': [], 'ratio': [], 'clicks': 0}
    for c in range(dec.shape[1]):
        a, b = dec[-k:, c], dec[:k, c]
        steps = np.abs(np.diff(np.concatenate([a, b])))
        jump = abs(float(b[0] - a[-1]))
        typ = float(np.median(np.abs(np.diff(a))) + np.median(np.abs(np.diff(b)))) / 2
        out['jump'].append(round(jump, 5))
        out['typStep'].append(round(typ, 5))
        out['ratio'].append(round(jump / max(float(np.percentile(steps, 99)), 1e-9), 2))
    out['clicks'] = len(P._seam_clicks(dec))
    return out


def self_check() -> bool:
    recs = {r['id']: r for r in load_records()}
    ok = True
    rows = []
    for iid in ALL_IDS:
        r = recs.get(iid)
        if r is None:
            print(f'MISSING {iid}')
            ok = False
            continue
        v = P.validate_record(r)
        path = os.path.join(P.PACK_DIR, r['file'])
        dec, _ = sf.read(path, dtype='float64', always_2d=True)
        pk = F.db(float(np.max(np.abs(dec))))
        clicks = sorted({i for c in range(dec.shape[1]) for i in VAL.click_events(dec[:, c])})
        a = OC.check_file(path)['rates']
        row = {'id': iid, 'ok': v.ok, 'bytes': os.path.getsize(path), 'sec': round(len(dec) / SR, 3),
               'ch': dec.shape[1], 'peakDb': round(pk, 2), 'lufs': round(F.lufs(dec), 2),
               'clicks': len(clicks), 'slices44': a['44100']['slices'], 'slices48': a['48000']['slices'],
               'mode': a['44100']['mode'], 'onsets44': a['44100']['uncapped']}
        if r['kind'] != 'texture':
            m = dec[:, 0]
            first = np.nonzero(np.abs(m) >= 0.03 * np.max(np.abs(m)))[0]
            row['prerollMs'] = round(first[0] / SR * 1e3, 2)
            env = np.sqrt(F.moving_avg(m * m, int(0.005 * SR)))
            loud = np.nonzero(env >= F.undb(-60))[0]
            row['tailSilS'] = round((len(m) - int(loud[-1])) / SR, 3)
            row['endDb'] = round(F.db(float(np.max(np.abs(m[-int(0.005 * SR):]))) + 1e-12), 1)
            good = -4.0 <= pk <= -1.0 and row['prerollMs'] <= 5.0 and row['bytes'] <= 80_000 and not clicks
        else:
            row['edgeDb'] = (round(F.db(float(np.max(np.abs(dec[:int(0.001 * SR)]))) + 1e-12), 1),
                             round(F.db(float(np.max(np.abs(dec[-int(0.001 * SR):]))) + 1e-12), 1))
            good = pk <= -1.0 and row['bytes'] <= 420_000 and (not clicks or r.get('clicksByDesign'))
            if r.get('loop'):
                row['seam'] = seam_report(dec)
                good &= row['seam']['ratio'][0] < 1.0 and row['seam']['ratio'][1] < 1.0
        if r.get('bpm'):
            row['barExact'] = len(dec) == P.loop_samples(r['bpm'], r['bars'])
            good &= row['barExact']
        row['ok'] = bool(v.ok and good)
        if not row['ok']:
            row['failures'] = v.failures()
        if v.warnings:
            row['warnings'] = v.warnings
        ok &= row['ok']
        rows.append(row)
    for row in rows:
        print(json.dumps(row))
    total = sum(r['bytes'] for r in rows)
    print(f'self-check: {sum(r["ok"] for r in rows)}/{len(ALL_IDS)} ok, {total:,} bytes of audio')
    bank_ok = all(x is None or x in recs for x in BANK['pads']) and len(BANK['pads']) == 16
    print(f'bank_kit_fel: {"ok" if bank_ok else "FAIL"} ({sum(x is not None for x in BANK["pads"])} pads)')
    return ok and bank_ok


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--lenient', action='store_true', help='record failing items instead of raising')
    a = ap.parse_args(argv)
    print(f'[flip_oneshots] pack dir: {P.PACK_DIR}')
    if not a.check:
        ids = [x for x in a.only.split(',') if x] or ALL_IDS
        unknown = [x for x in ids if x not in ALL_IDS]
        if unknown:
            raise SystemExit(f'unknown ids: {unknown}')
        for iid in ids:
            render(iid, strict=not a.lenient)
        for p in write_bank():
            print(f'[flip_oneshots] wrote {p}')
        print(f'[flip_oneshots] wrote {write_items_json(load_records())}')
    return 0 if self_check() else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
