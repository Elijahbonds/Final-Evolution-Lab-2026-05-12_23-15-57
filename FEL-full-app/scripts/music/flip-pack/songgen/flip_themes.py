#!/usr/bin/env python3
"""flip_themes — the three "FEL theme" candidates for the Flip's first "chop this" lesson (flippack SPEC.md 4.1).

    theme_a_sunday_tape   Sunday Tape      90 BPM swing 0.54  Eb major   seed 0x7E0A
    theme_b_skyline       Skyline Anthem  100 BPM straight    D major    seed 0x7E0B
    theme_c_dust_strings  Dust & Strings   96 BPM swing 0.56  A minor    seed 0x7E0C

Every theme is 4 bars, drum-less, stereo, -16 LUFS, with no bass part. It is built so that ONE PAD = ONE MUSICAL
EVENT: each event is a melody note plus a short chord hit on the same grid spot (or, for the answers, a horn / pizz
chord on its own), over a slow-attack bed at -16 dB high-passed at 200 Hz or more, so the Flip's RMS onset finder
cuts exactly FEL's own slices (TRANSIENTS == FEL cuts). Everything is generated here from fel_synth / flip_voices
voices with seeded randomness: no samples, no third-party audio, no quoted melodies.

    PY=/Users/elijahbonds/.cache/fel-kokoro/.venv/bin/python
    $PY flip_themes.py                 # render all three into flippack/audio + items, write flippack/themes/items.json
    $PY flip_themes.py --only theme_b_skyline
    $PY flip_themes.py --dry           # render + print the finder's view, write nothing
    FLIPPACK_DIR=<dir> $PY flip_themes.py   # a dry-run pack elsewhere

The self-check at the end runs the contract validator on each item, the Flip mirror at 44.1 and 48 kHz, a numeric
seam/click/length check, and renders each lesson flipPattern offline from the item's own slices.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

import numpy as np
import soundfile as sf

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
import flip_pack as P  # noqa: E402
import flip_voices  # noqa: E402,F401  (registers flute / strings / gtr / mallet)

F = P.F
OC = P.OC
SR = P.SR
SCRIPT = os.path.abspath(__file__)
THEMES_DIR = os.path.join(P.PACK_DIR, 'themes')
IDS = ('theme_a_sunday_tape', 'theme_b_skyline', 'theme_c_dust_strings')


def M(name):
    return F.midi(name)


def chord_of(names: str) -> list[float]:
    return [M(n) for n in names.split()]


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# Theme A: Sunday Tape (soulful EP + a small horn section answering; late-night and hopeful)
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# The chords share tones (Eb, G, Bb and C sit in all four), so any pad over any other stays consonant:
#   | Ebmaj9 | Cm9 | Abmaj9 | Bb13sus4 (Ab/Bb) |
# Melody: `ep` notes in Bb4..Eb6, each doubled by a rootless 4-note `ep` chord hit strummed 8 ms on the same spot.
# Horns: 2-part `brass` thirds answering on the and-of-3 and on 4 in bars 1 and 3 (their own pads).
# Bed: a `pad` holding the bar's chord at -16 dB, HP 220, slow attack.

A_CHORDS = {1: chord_of('Bb3 D4 F4 G4'),       # Ebmaj9 rootless (3 5 7 9 -> G Bb D F)
            2: chord_of('Bb3 D4 Eb4 G4'),      # Cm9 rootless (b3 5 b7 9)
            3: chord_of('Bb3 C4 Eb4 G4'),      # Abmaj9 rootless (3 5 7 9)
            4: chord_of('Ab3 C4 Eb4 G4')}      # Bb13sus4 as Ab/Bb (b7 9 11 13)
A_BED = {1: chord_of('Eb4 G4 Bb4 D5'), 2: chord_of('C4 Eb4 G4 Bb4 D5'),
         3: chord_of('Ab3 C4 Eb4 G4 Bb4'), 4: chord_of('Bb3 Eb4 F4 Ab4 C5')}
# (bar, sixteenth, melody note)
# Bar 2 is C6-G5-Bb5-F5 (a Cm11 pentatonic zigzag), NOT C6-Bb5-G5-F5: the critic's interval screen found that
# Bb5-D6-C6-Bb5-G5-F5 (+4 -2 -2 -3 -2) is the relative shape 1-3-2-1-6-5 of "Amazing Grace" ("grace how sweet the
# sound") and "Danny Boy" ("the pipes, the pipes are calling"). Now no run of 4+ intervals matches a screened tune.
A_MELODY = [(1, 0, 'G5'), (1, 3, 'Bb5'), (1, 6, 'D6'),
            (2, 0, 'C6'), (2, 4, 'G5'), (2, 7, 'Bb5'), (2, 10, 'F5'),
            (3, 0, 'Eb5'), (3, 3, 'G5'), (3, 6, 'C6'),
            (4, 0, 'Bb5'), (4, 6, 'Eb6')]
# (bar, sixteenth, lower, upper): horn answers in thirds on tones common to all four chords
A_HORNS = [(1, 10, 'G4', 'Bb4'), (1, 12, 'C5', 'Eb5'),
           (3, 10, 'Eb5', 'G5'), (3, 12, 'C5', 'Eb5')]


def build_a() -> tuple[F.Song, dict]:
    song = P.loop_song('theme_a_sunday_tape', bpm=90, key='Eb major', bars=4, seed=0x7E0A, swing=0.54)
    for bar, six, name in A_MELODY:
        song.note('lead', 'ep', bar, six, name, 2.0, vel=0.9, bright=0.6, decay=0.34, release=0.08, tine=0.3)
        song.chord('keys', 'ep', bar, six, A_CHORDS[bar], 1.5, vel=0.72, strum_ms=8.0, bright=0.45, decay=0.3,
                   release=0.07)
    for bar, six, lo, hi in A_HORNS:          # "bap-BAAH": a short, softer call, then the accented answer
        bap = six == 10
        song.chord('horns', 'brass', bar, six, [lo, hi], 0.6 if bap else 1.5, vel=0.72 if bap else 1.0,
                   attack=0.006, sustain=0.45, release=0.03 if bap else 0.05, bright=0.6, voices=3, vib=0.0)
    for bar in range(1, 5):
        song.chord('bed', 'pad', bar, 0, A_BED[bar], 15.0, vel=0.6, attack=0.6, release=0.7, cutoff=1400.0)
    song.mix['lead'] = F.StemMix(gain_db=0.0, eq=[('hp', 180.0), ('peak', 2400.0, 1.5, 0.9)], reverb=0.10,
                                 reverb_type='room', pan=0.05, width=0.6)
    song.mix['keys'] = F.StemMix(gain_db=-6.0, eq=[('hp', 150.0), ('lowshelf', 300.0, -2.0)], reverb=0.10,
                                 reverb_type='room', pan=-0.2, width=0.6)
    song.mix['horns'] = F.StemMix(gain_db=-2.5, eq=[('hp', 180.0), ('peak', 2500.0, 1.5, 0.8)], reverb=0.06,
                                  reverb_type='room', pan=0.25, width=0.7)
    song.mix['bed'] = F.StemMix(gain_db=-16.0, eq=[('hp', 220.0), ('lp', 5000.0)], reverb=0.3, reverb_type='hall',
                                pan=0.0, width=0.9)
    meta = dict(
        title='Sunday Tape', tags=['theme', 'soul', 'keys', 'horns', 'warm'], candidate='a',
        character='Soulful Eb: warm electric-piano chords, a two-horn section answering, late-night and hopeful.',
        pad_stems=('lead', 'keys', 'horns'),
    )
    return song, meta


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# Theme B: Skyline Anthem (bright synth-brass anthem: stacked brass stabs, a heroic lead climbing to bar 4)
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#   | D | Bm7 | Gmaj7 | A7sus4 -> A |       (D and F# sit in the first three chords, D in the fourth as its sus4)
# Hits: `brass` (4 voices, bright 0.8, attack 6 ms, sustain 0.45, release 0.05) doubled by `stab`.
# Lead: `square_lead` phrase, legato_gap 0, every note shorter than the gap to the next, climbing to E6 in bar 4.
# Bed: `pad` at -16 dB, HP 240.

B_HITS = {1: chord_of('D4 F#4 A4'), 2: chord_of('D4 F#4 A4 B4'), 3: chord_of('D4 F#4 G4 B4'),
          '4s': chord_of('D4 E4 G4 A4'), '4': chord_of('C#4 E4 A4')}
B_BED = {1: chord_of('D4 F#4 A4 D5'), 2: chord_of('B3 D4 F#4 A4'), 3: chord_of('G3 B3 D4 F#4'),
         '4s': chord_of('A3 D4 E4 G4'), '4': chord_of('A3 C#4 E4 A4')}
# (bar, sixteenth, lead note, chord key)
B_EVENTS = [(1, 0, 'A4', 1), (1, 3, 'D5', 1), (1, 6, 'E5', 1), (1, 10, 'F#5', 1),
            (2, 0, 'F#5', 2), (2, 3, 'E5', 2), (2, 6, 'D5', 2), (2, 10, 'A5', 2),
            (3, 0, 'G5', 3), (3, 3, 'A5', 3), (3, 6, 'B5', 3), (3, 10, 'D6', 3),
            (4, 0, 'E6', '4s'), (4, 4, 'D6', '4s'), (4, 8, 'C#6', '4')]


def build_b() -> tuple[F.Song, dict]:
    song = P.loop_song('theme_b_skyline', bpm=100, key='D major', bars=4, seed=0x7E0B, swing=0.5)
    notes = []
    starts = [(bar, six) for bar, six, _, _ in B_EVENTS]
    for i, (bar, six, name, ck) in enumerate(B_EVENTS):
        nxt = starts[i + 1] if i + 1 < len(starts) else (5, 0)
        ioi16 = (nxt[0] - bar) * 16 + (nxt[1] - six)
        last = i + 1 == len(starts)
        dur16 = 3.0 if last else min(2.0, 0.45 * ioi16)       # every note well inside the gap to the next
        notes.append((bar, six, name, dur16, 0.95 if six == 0 else 0.88))
        song.chord('horns', 'brass', bar, six, B_HITS[ck], 2.0 if last else 0.75, vel=0.9, attack=0.006,
                   sustain=0.45, release=0.05, bright=0.8, voices=4, vib=0.0)
        song.chord('keys', 'stab', bar, six, B_HITS[ck], 1.0 if last else 0.75, vel=0.85, cutoff=700.0, env=6000.0,
                   decay=0.14, sustain=0.0, release=0.05)
    song.phrase('lead', 'square_lead', notes, legato_gap=0.0, attack=0.008, sustain=0.5, decay=0.25, release=0.06,
                vib=0.12, glide=0.02)
    bed_plan = [(1, 0, 1, 16.0), (2, 0, 2, 16.0), (3, 0, 3, 16.0), (4, 0, '4s', 8.0), (4, 8, '4', 8.0)]
    for bar, six, ck, d in bed_plan:
        song.chord('bed', 'pad', bar, six, B_BED[ck], d, vel=0.6, attack=0.6, release=0.6, cutoff=1600.0)
    song.mix['lead'] = F.StemMix(gain_db=0.0, eq=[('hp', 200.0)], reverb=0.08, reverb_type='plate', pan=0.05,
                                 width=0.6)
    song.mix['horns'] = F.StemMix(gain_db=-4.0, eq=[('hp', 160.0), ('peak', 2200.0, 1.5, 0.8)], reverb=0.08,
                                  reverb_type='room', pan=-0.2, width=0.7)
    song.mix['keys'] = F.StemMix(gain_db=-9.0, eq=[('hp', 180.0)], reverb=0.06, reverb_type='room', pan=0.25,
                                 width=0.6)
    song.mix['bed'] = F.StemMix(gain_db=-16.0, eq=[('hp', 240.0), ('lp', 6000.0)], reverb=0.3, reverb_type='hall',
                                pan=0.0, width=0.9)
    meta = dict(
        title='Skyline Anthem', tags=['theme', 'anthem', 'brass', 'synth', 'bright'], candidate='b',
        character='Bright D-major synth-brass anthem: stacked brass stabs under a heroic lead that climbs to bar 4.',
        pad_stems=('lead', 'horns', 'keys'),
    )
    return song, meta


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# Theme C: Dust & Strings (dusty flute over plucked strings, cinematic and a little wistful)
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#   | Am9 | Fmaj7 | Dm9 | E7sus4 -> E7 |
# Melody: `flute` (chiff 0.55, sustain 0.5, tongued 1.25 sixteenths) with a soft pizz dyad under each note; the
# answers are 3-note pizzicato-like `strings` chords (art='stacc', sustain 0.12). Bed: legato `strings` at -16 dB.
# "Dust" is the chain on every stem: HP 180 / LP 7.5 kHz plus drive 0.15. Never crackle (that is tex_vinyl_crackle).

C_DUST = [('hp', 180.0), ('lp', 7500.0)]
C_BED = {1: chord_of('A3 C4 E4 G4 B4'), 2: chord_of('F3 A3 C4 E4'), 3: chord_of('D4 F4 A4 C5 E5'),
         '4s': chord_of('E3 A3 B3 D4'), '4': chord_of('E3 G#3 B3 D4')}
C_DYAD = {1: chord_of('C5 E5'), 2: chord_of('A4 C5'), 3: chord_of('F4 A4'), '4s': chord_of('A4 D5'),
          '4': chord_of('G#4 D5')}
# (bar, sixteenth, flute note, dyad key)
C_FLUTE = [(1, 0, 'A5', 1), (1, 3, 'B5', 1), (1, 6, 'E5', 1),
           (2, 0, 'A5', 2), (2, 3, 'C6', 2), (2, 6, 'G5', 2),
           (3, 0, 'F5', 3), (3, 3, 'A5', 3), (3, 6, 'E5', 3),
           (4, 0, 'B5', '4s'), (4, 4, 'A5', '4s'), (4, 12, 'G#5', '4')]
# (bar, sixteenth, chord): the pizz answers
C_PIZZ = [(1, 10, 'G4 C5 E5'), (2, 10, 'A4 C5 E5'), (3, 10, 'F4 A4 D5'), (4, 8, 'G#4 B4 E5')]


def build_c() -> tuple[F.Song, dict]:
    song = P.loop_song('theme_c_dust_strings', bpm=96, key='A minor', bars=4, seed=0x7E0C, swing=0.56)
    for bar, six, name, ck in C_FLUTE:
        song.note('lead', 'flute', bar, six, name, 1.25, vel=0.9, chiff=0.55, sustain=0.5, release=0.05,
                  attack=0.01, breath=0.12, vib=0.1)
        song.chord('keys', 'strings', bar, six, C_DYAD[ck], 0.75, vel=0.75, art='stacc', sustain=0.12, decay=0.08,
                   release=0.05, voices=3, scrape=0.4)
    for bar, six, names in C_PIZZ:
        song.chord('horns', 'strings', bar, six, chord_of(names), 1.0, vel=0.85, art='stacc', sustain=0.12,
                   decay=0.08, release=0.05, voices=3, scrape=0.5, bright=0.6)
    bed_plan = [(1, 0, 1, 16.0), (2, 0, 2, 16.0), (3, 0, 3, 16.0), (4, 0, '4s', 8.0), (4, 8, '4', 8.0)]
    for bar, six, ck, d in bed_plan:
        song.chord('bed', 'strings', bar, six, C_BED[ck], d, vel=0.55, art='legato', attack=0.5, release=0.5,
                   voices=4, bright=0.35)
    song.mix['lead'] = F.StemMix(gain_db=0.0, eq=list(C_DUST), drive=0.15, reverb=0.10, reverb_type='plate',
                                 pan=0.1, width=0.6)
    song.mix['keys'] = F.StemMix(gain_db=-6.0, eq=list(C_DUST), drive=0.12, reverb=0.08, reverb_type='room',
                                 pan=-0.15, width=0.6)
    song.mix['horns'] = F.StemMix(gain_db=-2.0, eq=list(C_DUST), drive=0.15, reverb=0.10, reverb_type='room',
                                  pan=-0.25, width=0.7)
    song.mix['bed'] = F.StemMix(gain_db=-16.0, eq=[('hp', 200.0), ('lp', 7500.0)], drive=0.1, reverb=0.3,
                                reverb_type='hall', pan=0.0, width=0.9)
    meta = dict(
        title='Dust & Strings', tags=['theme', 'cinematic', 'flute', 'strings', 'dusty'], candidate='c',
        character='Dusty A-minor flute over plucked strings: cinematic, a little wistful, like an old film reel.',
        pad_stems=('lead', 'keys', 'horns'),
    )
    return song, meta


BUILDERS = {'theme_a_sunday_tape': build_a, 'theme_b_skyline': build_b, 'theme_c_dust_strings': build_c}


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# analysis helpers (in memory, before the MP3)
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def finder_view(y: np.ndarray, pads: list[float]) -> dict:
    """The Flip mirror on the levelled mix (mono mean, float32) at 44.1 and 48 kHz, matched against the pads."""
    mono = y.mean(axis=1).astype(np.float32)
    out = {}
    for r in P.RATES:
        a = OC.analyse(OC.resample(mono, SR, r), r)
        on = a['uncappedOnsets']
        spur = [t for t in on if min(abs(t - s) for s in pads) > P.LIMITS['match_s']]
        miss = [s for s in pads if not on or min(abs(t - s) for t in on) > P.LIMITS['match_s']]
        out[r] = dict(n=a['uncapped'], mode=a['mode'], minRatio=min(a['onsetRatios']) if a['onsetRatios'] else None,
                      ratios=a['onsetRatios'], weak=a['weakOnsets'], near=a['nearMisses'], spurious=spur, missed=miss,
                      minGap=a['minGapSec'], slices=a['sliceSec'])
    out['head'] = P.head_onset(mono.astype(np.float64))
    return out


def print_view(iid: str, v: dict, pads: list[float]) -> None:
    print(f'  {iid}: pads={len(pads)} head={v["head"]}')
    for r in P.RATES:
        a = v[r]
        print(f"   @{r}: n={a['n']} minRatio={a['minRatio']} weak={a['weak']} near={a['near']} "
              f"spurious={a['spurious']} missed={a['missed']} minGap={a['minGap']}")
        print(f"          ratios={a['ratios']}")


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# lesson: the flipPattern, rendered offline from the item's own slices
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

LESSONS = {
    # one bar of 16 steps at the theme's bpm, each a pad index (0-based) or None: a re-flip that sounds like a new
    # idea. The tips count pads from 1, the way the player sees them.
    'theme_a_sunday_tape': dict(     # Ebmaj9 -> Abmaj9 -> Cm9 on a 3-3-2, then the bar-1 horn call "bap-BAAH"
        flipPattern=[0, None, None, 11, None, None, 7, None, None, None, 3, None, 4, None, None, None],
        tip='Pads 1 to 16 in order play the theme. Flip it: 1, 12 and 8 on a 3-3-2, then let the horns on 4 and '
            '5 answer.'),
    'theme_b_skyline': dict(         # D -> A7sus4 (the peak) -> Gmaj7 -> Bm7 -> A, on a 3-3-3-3-4
        flipPattern=[0, None, None, 12, None, None, 11, None, None, 7, None, None, 14, None, None, None],
        tip='Pads 1 to 15 in order play the anthem. Flip it: 1, jump to the peak on 13, fall through 12 and 8, '
            'then land on 15.'),
    'theme_c_dust_strings': dict(    # Am9 -> Fmaj7 -> Dm9 -> a pizz answer -> E7 (G#), which leads back to 1
        flipPattern=[0, None, None, 5, None, None, 10, None, None, None, 7, None, None, 15, None, None],
        tip='Pads 1 to 16 in order play the theme. Flip it: 1, 6, 11, the pizz on 8, then 16 leads you back '
            'to 1.'),
}

GATE_S = 1.2           # the Flip's pad gate (a slice stops here)


def render_flip(mono_or_stereo: np.ndarray, sr: int, pads: list[float], pattern: list, bpm: float,
                bars: int = 2) -> np.ndarray:
    """MPC-style offline render of a flipPattern: each hit plays its pad's slice (start to the next pad) from its
    step and is choked by the next hit, with a 3 ms fade on each end (what phase 5's pad buffers will do)."""
    y = np.asarray(mono_or_stereo, dtype=np.float64)
    if y.ndim == 1:
        y = y[:, None]
    n = len(y)
    starts = [int(round(p * sr)) for p in pads]
    ends = starts[1:] + [n]
    step = 15.0 / bpm
    total = int(round(bars * 16 * step * sr))
    out = np.zeros((total + sr, y.shape[1]))
    hits = [(b * 16 + i, pattern[i]) for b in range(bars) for i in range(16) if pattern[i] is not None]
    f = int(0.003 * sr)
    ramp = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, f))
    for j, (k, pad) in enumerate(hits):
        t0 = int(round(k * step * sr))
        choke = int(round(hits[j + 1][0] * step * sr)) if j + 1 < len(hits) else total
        seg = y[starts[pad]:min(ends[pad], starts[pad] + int(GATE_S * sr))].copy()
        seg = seg[:max(0, choke - t0)]
        if len(seg) > 2 * f:
            seg[:f] *= ramp[:, None]
            seg[-f:] *= ramp[::-1][:, None]
        out[t0:t0 + len(seg)] += seg
    return out[:total]


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# render + write
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def make(iid: str, dry: bool = False) -> dict | None:
    song, meta = BUILDERS[iid]()
    y = P.render_loop(song)
    pads = P.pads_from_song(song, *meta['pad_stems'])
    lv = P.level_loop(y, P.LIMITS['loop_lufs'])
    v = finder_view(lv, pads)
    print_view(iid, v, pads)
    if dry:
        return None
    lesson = dict(LESSONS[iid])
    lesson = {'playInOrder': list(range(len(pads))), 'flipPattern': lesson['flipPattern'], 'tip': lesson['tip']}
    assert len(lesson['tip']) <= 140, len(lesson['tip'])
    assert all(p is None or 0 <= p < len(pads) for p in lesson['flipPattern'])
    extra = {'candidate': meta['candidate'], 'character': meta['character'], 'lesson': lesson}
    assert len(meta['character']) <= 120, len(meta['character'])
    return P.write_loop(song, y, kind='theme', title=meta['title'], tags=meta['tags'], suggested_pads=pads,
                        script=SCRIPT, extra=extra)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# self-check
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def seam_jump(dec: np.ndarray) -> dict:
    """The loop seam, numerically: the step across the join vs the largest step inside the last/first 5 ms, per
    channel (a jump would be a join step far above its neighbours)."""
    k = int(0.005 * SR)
    out = []
    for c in range(dec.shape[1]):
        tail, head = dec[-k:, c], dec[:k, c]
        join = abs(head[0] - tail[-1])
        inner = max(np.max(np.abs(np.diff(tail))), np.max(np.abs(np.diff(head))))
        d2 = abs((head[0] - tail[-1]) - (tail[-1] - tail[-2]))
        d2_in = max(np.max(np.abs(np.diff(tail, 2))), np.max(np.abs(np.diff(head, 2))))
        out.append({'join': round(float(join), 5), 'innerMax': round(float(inner), 5),
                    'd2Join': round(float(d2), 5), 'd2InnerMax': round(float(d2_in), 5),
                    'ok': bool(join <= 1.5 * inner + 1e-4 and d2 <= 1.5 * d2_in + 1e-4)})
    return {'ok': all(c['ok'] for c in out), 'channels': out}


def self_check(ids: list[str]) -> bool:
    ok_all = True
    rows = []
    for iid in ids:
        path = os.path.join(P.ITEMS_DIR, f'{iid}.json')
        rec = json.load(open(path))
        v = P.validate_record(rec)
        apath = os.path.join(P.PACK_DIR, rec['file'])
        dec, sr = sf.read(apath, dtype='float64', always_2d=True)
        seam = seam_jump(dec)
        n_exact = P.loop_samples(rec['bpm'], rec['bars'])
        chk = OC.check_file(apath)
        r44, r48 = chk['rates']['44100'], chk['rates']['48000']
        flip = render_flip(dec, sr, rec['suggestedPads'], rec['lesson']['flipPattern'], rec['bpm'])
        flip_pk = P.db(np.max(np.abs(flip)) + 1e-12)
        flip_hits = sum(x is not None for x in rec['lesson']['flipPattern']) * 2
        fa = OC.analyse(flip.mean(axis=1).astype(np.float32), sr)
        flip_clicks = sorted({i for c in range(flip.shape[1]) for i in P._clicks(flip[:, c])})
        prev = os.path.join(THEMES_DIR, f'{iid}_flip_preview.mp3')
        os.makedirs(THEMES_DIR, exist_ok=True)
        sf.write(prev, np.clip(flip, -1, 1), sr, format='MP3', subtype='MPEG_LAYER_III', bitrate_mode='VARIABLE',
                 compression_level=P.MP3_LEVEL)
        gaps = np.diff(rec['suggestedPads'])
        row = dict(id=iid, ok=v.ok, failures=v.failures(), warnings=v.warnings,
                   slices44=r44['uncapped'], slices48=r48['uncapped'], minRatio44=min(r44['onsetRatios']),
                   minRatio48=min(r48['onsetRatios']), near44=r44['nearMisses'], near48=r48['nearMisses'],
                   pads=len(rec['suggestedPads']), minPadGap=round(float(gaps.min()), 3),
                   maxPadGap=round(float(gaps.max()), 3), samples=len(dec), exact=len(dec) == n_exact,
                   peakDb=round(P.db(np.max(np.abs(dec))), 2), lufs=round(P.lufs(dec), 2), seam=seam['ok'],
                   seamDetail=seam['channels'], bytes=os.path.getsize(apath), flipPeakDb=round(flip_pk, 2),
                   head=P.head_onset(OC.load_mono(apath)[0].astype(np.float64)),
                   flipHits=flip_hits, flipOnsets=fa['uncapped'], flipClicks=len(flip_clicks),
                   flipLufs=round(P.lufs(flip), 1))
        ok = v.ok and seam['ok'] and row['exact'] and row['peakDb'] <= -1.0
        ok_all &= ok
        rows.append(row)
        print(f"[self-check] {iid}: {'OK' if ok else 'FAIL'} slices {row['slices44']}/{row['slices48']} "
              f"(44.1/48k) pads {row['pads']} minRatio {row['minRatio44']}/{row['minRatio48']} "
              f"near {row['near44']}/{row['near48']} padGap {row['minPadGap']}..{row['maxPadGap']} s "
              f"peak {row['peakDb']} dBFS lufs {row['lufs']} seam {'ok' if seam['ok'] else seam} "
              f"exact {row['exact']} ({row['samples']}) bytes {row['bytes']} head {row['head']} "
              f"flip: {row['flipHits']} hits / {row['flipOnsets']} onsets, {row['flipClicks']} clicks, "
              f"peak {row['flipPeakDb']} dBFS, {row['flipLufs']} LUFS")
        if not v.ok:
            print('   failures', json.dumps(v.failures()))
        if v.warnings:
            print('   warnings', json.dumps(v.warnings))
    return ok_all


def write_items_json(ids: list[str]) -> str:
    """flippack/themes/items.json: the pack.json entries for this producer's items (the sidecars, in id order)."""
    os.makedirs(THEMES_DIR, exist_ok=True)
    recs = []
    for iid in IDS:
        p = os.path.join(P.ITEMS_DIR, f'{iid}.json')
        if os.path.exists(p):
            recs.append(json.load(open(p)))
    out = os.path.join(THEMES_DIR, 'items.json')
    with open(out, 'w') as fh:
        json.dump({'producer': 'flip_themes', 'script': SCRIPT, 'items': recs}, fh, indent=1)
        fh.write('\n')
    return out


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--check', action='store_true', help='self-check the written items only (no render)')
    a = ap.parse_args(argv)
    ids = [x for x in a.only.split(',') if x] or list(IDS)
    for x in ids:
        if x not in BUILDERS:
            raise SystemExit(f'unknown id {x}')
    if not a.check:
        for iid in ids:
            make(iid, dry=a.dry)
        if a.dry:
            return 0
    ok = self_check(ids)
    print('[flip_themes] items.json ->', write_items_json(ids))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
