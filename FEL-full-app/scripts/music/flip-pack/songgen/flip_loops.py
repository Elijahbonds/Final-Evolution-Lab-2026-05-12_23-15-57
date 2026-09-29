#!/usr/bin/env python3
"""flip_loops.py — the loops producer of the Flip loop pack (musicsuite/flippack, SPEC.md §4.2): ten melodic loops.

Every loop is stereo, -16 LUFS, exactly N bars at an exact tempo, seamless (rendered circularly by flip_pack), with
no drum kit (the player's groovebox is the drums) and ONE Flip onset per articulated event: 8-16 pads for 2 bars,
12-16 for 4 bars, suggestedPads == what the Flip's own finder (Flip.ts onsetSlices) cuts, to within one 10 ms window.

    PY=/Users/elijahbonds/.cache/fel-kokoro/.venv/bin/python
    $PY flip_loops.py                    # render all ten, then the self-check + loops/items.json
    $PY flip_loops.py --only loop_ep_soul,loop_arp_pluck
    $PY flip_loops.py --check            # the self-check only (no render)

Output: FLIPPACK_DIR (default musicsuite/flippack/loops): audio/<id>.mp3 + items/<id>.json (the contract layout,
`file` = audio/<id>.mp3), and items.json = the pack.json entries of these ten items. Everything is synthesised by
fel_synth + flip_voices + voices_cypher (slapx) from sines, band-limited oscillators and seeded noise; no samples, no
audio is read from anywhere but this script's own renders. Every random draw derives from the item seed (F.rng_for),
so a re-run is byte-identical on this machine. The melodies/riffs are written for this pack (see the IP notes per
loop below and in the producer report).
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
FLIPPACK = os.path.join(os.path.dirname(HERE), 'flippack')
os.environ.setdefault('FLIPPACK_DIR', os.path.join(FLIPPACK, 'loops'))
sys.path.insert(0, HERE)

import flip_pack as P  # noqa: E402
import flip_voices  # noqa: E402,F401  (registers flute / strings / gtr / mallet)
import voices_cypher  # noqa: E402,F401  (registers slapx)
import soundfile as sf  # noqa: E402

F = P.F
StemMix = F.StemMix
V = F.voicing

IDS = ('loop_ep_soul', 'loop_organ_gospel', 'loop_gtr_pluck', 'loop_string_stabs', 'loop_flute_riff',
       'loop_bass_riff', 'loop_horn_riff', 'loop_arp_pluck', 'loop_vox_choir', 'loop_kalimba_steps')


def ioi16(events, i: int, bars: int) -> float:
    """Sixteenths from event i to the next one (circular: the last wraps to the first); events = (bar, six, ...)."""
    pos = [(e[0] - 1) * 16 + e[1] for e in events]
    nxt = pos[i + 1] if i + 1 < len(pos) else pos[0] + 16 * bars
    return float(nxt - pos[i])


def dry_mix(**kw) -> StemMix:
    """A StemMix with no echo (an echo is a spurious onset or a raised floor) unless asked."""
    kw.setdefault('delay', 0.0)
    return StemMix(**kw)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# the ten loops. Each builder returns (song, pad_stems, meta); meta = title, tags, optional post(y, pads) -> y
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def build_ep_soul():
    """Velvet Keys — F minor, 90 BPM swung 0.56, 4 bars. Rootless EP comps |Fm9|Dbmaj9|Bbm9|Eb9sus4| (all four
    hold F and Ab, so any pad over any other stays consonant), a top-note EP melody on some hits, gate 2/16 (1.5/16
    before a 3/16 re-hit), a -16 dB pad bed."""
    song = P.loop_song('loop_ep_soul', bpm=90, key='F minor', bars=4, seed=0x1001, swing=0.56)
    chords = ['Fm9', 'Dbmaj9', 'Bbm9', 'Eb9sus4']
    # (bar, sixteenth, melody note or None) — 4 + 3 + 4 + 3 = 14 comp hits; IOIs 3/16 .. 6/16 (0.5 .. 1.0 s)
    hits = [(1, 0, 'C5'), (1, 6, None), (1, 10, 'Eb5'), (1, 13, 'F5'),
            (2, 2, 'Eb5'), (2, 6, None), (2, 12, 'C5'),
            (3, 0, 'Db5'), (3, 6, None), (3, 10, 'F5'), (3, 13, 'Eb5'),
            (4, 0, 'Bb4'), (4, 4, None), (4, 10, 'Db5')]
    ep = dict(decay=0.35, bright=0.55, release=0.07)
    for i, (bar, six, mel) in enumerate(hits):
        vx = V(chords[bar - 1], center=64, n=4, rootless=True)
        gate = min(2.0, 0.5 * ioi16(hits, i, song.bars))       # 2/16, or half the gap before a 3/16 re-hit
        song.chord('keys', 'ep', bar, six, vx, dur16=gate, vel=0.8, strum_ms=4, **ep)
        if mel:
            song.note('lead', 'ep', bar, six, mel, dur16=gate, vel=0.9, **ep)
    for bar in range(1, 5):                       # the bed: slow attack, high-passed, never an onset
        song.chord('bed', 'pad', bar, 0, V(chords[bar - 1], center=60, n=4), dur16=16, vel=0.6, _nopad=True,
                   attack=0.6, release=0.7, cutoff=1500.0)
    song.mix['keys'] = dry_mix(gain_db=0.0, eq=[('hp', 120.0), ('lowshelf', 300.0, -2.0)], reverb=0.08,
                               reverb_type='room', pan=-0.12, width=0.6)
    song.mix['lead'] = dry_mix(gain_db=-3.0, eq=[('hp', 250.0)], reverb=0.08, reverb_type='room', pan=0.15, width=0.6)
    song.mix['bed'] = dry_mix(gain_db=-16.0, eq=[('hp', 250.0), ('lp', 5000.0)], reverb=0.2, reverb_type='hall',
                              width=0.9)
    return song, ('keys', 'lead'), dict(title='Velvet Keys', tags=['keys', 'ep', 'soul', 'warm', 'chords'])


def build_organ_gospel():
    """Church Stabs — G mixolydian, 105 BPM swung 0.54, 2 bars. Gospel-drawbar organ stabs over a G pedal:
    G / F/G / C/G / G7sus (all share G; the F/G and C/G share C), gate 1/16, IOI 2/16 or more."""
    song = P.loop_song('loop_organ_gospel', bpm=105, key='G mixolydian', bars=2, seed=0x1002, swing=0.54)
    G_ = ['G3', 'D4', 'G4', 'B4']                  # open voicings over the G: close low tones beat at 25-50 Hz,
    FG = ['G3', 'C4', 'F4', 'A4']                  # which ripples the Flip's 10 ms RMS windows (near misses)
    CG = ['G3', 'C4', 'E4', 'G4']
    Gs = ['G3', 'D4', 'F4', 'C5']
    # top voice B B A G B | G A B C B. IP (critic): bar 2 used to open F/G, C/G (top A, G), which made the top voice
    # B-A-G B-A-G on beats 4-1-2 = the "Hot Cross Buns" / "Three Blind Mice" 3-2-1 3-2-1 incipit; bar 2 now rises
    hits = [(1, 0, G_), (1, 2, G_), (1, 6, FG), (1, 9, CG), (1, 12, G_),
            (2, 0, CG), (2, 4, FG), (2, 6, G_), (2, 10, Gs), (2, 14, G_)]
    org = dict(drawbars='gospel', perc=0.35, click=0.1, release=0.03)
    for i, (bar, six, ch) in enumerate(hits):
        gate = 1.0 if ioi16(hits, i, song.bars) >= 3 else 0.75      # a 2/16 re-hit needs a little more air
        song.chord('keys', 'organ', bar, six, ch, dur16=gate, vel=0.85 if six % 4 else 0.95, **org)
    # the 16' drawbar's sub-octave (G2 = 98 Hz) is the loop's rumble and the finder's ripple: a 4-pole HP at 170 Hz
    song.mix['keys'] = dry_mix(gain_db=0.0, eq=[('hp', 170.0, 0.707, 4), ('peak', 2200.0, 1.0, 0.8), ('lp', 9000.0)],
                               drive=0.12, reverb=0.07, reverb_type='room', width=0.7)
    return song, ('keys',), dict(title='Church Stabs', tags=['organ', 'gospel', 'keys', 'stabs', 'church'])


def build_gtr_pluck():
    """Nylon Pluck — E minor, 100 BPM straight, 2 bars. A palm-muted (mute 0.9, pos 0.2) fingerpicked 8th line, gate
    1.25/16, bar 1 over Em9, bar 2 over Cmaj9 (they share E G B D); lowest note E3, HP 140."""
    song = P.loop_song('loop_gtr_pluck', bpm=100, key='E minor', bars=2, seed=0x1003)
    line = [(1, ['E3', 'B3', 'F#4', 'G4', 'D4', 'B3', 'G4', 'F#4']),
            (2, ['C4', 'G4', 'B4', 'D5', 'B4', 'E4', 'G4', 'D4'])]
    g = dict(pos=0.2, mute=0.9, bright=0.6, pick=0.3)
    for bar, notes in line:
        for i, n in enumerate(notes):
            six = 2 * i
            v = 0.85 if n == 'E3' else (1.0 if six % 4 == 0 else 0.9)     # the low E carries the most RMS
            song.note('keys', 'gtr', bar, six, n, dur16=1.25, vel=v, **g)
    song.mix['keys'] = dry_mix(gain_db=0.0, eq=[('hp', 140.0), ('peak', 4000.0, 1.5, 0.8)], reverb=0.08,
                               reverb_type='room', width=0.7)
    return song, ('keys',), dict(title='Nylon Pluck', tags=['guitar', 'nylon', 'pluck', 'mellow'])


def build_string_stabs():
    """String Stabs — C minor, 112 BPM, 2 bars. Staccato section stabs, 4-note voicings, gate 1/16 (3/4 of it
    before a 2/16 re-hit), hall send 0.1: |Cm9 . Abmaj7 . .|Fm9 . G7sus4 . .| (neighbours share two or more tones)."""
    song = P.loop_song('loop_string_stabs', bpm=112, key='C minor', bars=2, seed=0x1004)
    cm = V('Cm9', center=67, n=4)
    ab = V('Abmaj7', center=67, n=4, prev=cm)
    fm = V('Fm9', center=67, n=4, prev=ab)
    gs = V('G7sus4', center=67, n=4, prev=fm)
    hits = [(1, 0, cm), (1, 3, cm), (1, 8, ab), (1, 11, ab), (1, 14, ab),
            (2, 0, fm), (2, 4, fm), (2, 8, gs), (2, 10, gs), (2, 13, gs)]
    st = dict(art='stacc', sustain=0.1, bright=0.6)
    for i, (bar, six, ch) in enumerate(hits):
        gate = 1.0 if ioi16(hits, i, song.bars) >= 3 else 0.75
        song.chord('keys', 'strings', bar, six, ch, dur16=gate, vel=0.95 if six in (0, 8) else 0.85, **st)
    song.mix['keys'] = dry_mix(gain_db=0.0, eq=[('hp', 150.0)], reverb=0.1, reverb_type='hall', width=0.9)
    return song, ('keys',), dict(title='String Stabs', tags=['strings', 'stabs', 'cinematic', 'dark'])


def build_flute_riff():
    """Rooftop Flute — D dorian, 96 BPM swung 0.56, 2 bars. Tongued flute notes (chiff 0.5, sustain 0.55, attack 6 ms,
    gate 1.2/16) 3/16 or more apart, over a legato strings bed Dm9 -> G13 (the dorian vamp; they share F A E) at -16 dB."""
    song = P.loop_song('loop_flute_riff', bpm=96, key='D dorian', bars=2, seed=0x1005, swing=0.56)
    mel = [(1, 0, 'D5'), (1, 3, 'F5'), (1, 6, 'A5'), (1, 10, 'B5'), (1, 13, 'A5'),
           (2, 0, 'G5'), (2, 4, 'E5'), (2, 7, 'F5'), (2, 11, 'C5')]
    fl = dict(chiff=0.5, sustain=0.55, release=0.05, breath=0.08, vib=0.12, attack=0.006)
    for bar, six, n in mel:
        song.note('lead', 'flute', bar, six, n, dur16=1.2, vel=0.95 if six in (0,) else 0.9, **fl)
    song.chord('bed', 'strings', 1, 0, V('Dm9', center=60, n=4), dur16=16, vel=0.7, art='legato', _nopad=True)
    song.chord('bed', 'strings', 2, 0, V('G13', center=60, n=4), dur16=16, vel=0.7, art='legato', _nopad=True)
    song.mix['lead'] = dry_mix(gain_db=0.0, eq=[('hp', 250.0)], reverb=0.07, reverb_type='plate', pan=0.05, width=0.6)
    song.mix['bed'] = dry_mix(gain_db=-16.0, eq=[('hp', 250.0), ('lp', 6000.0)], reverb=0.2, reverb_type='hall',
                              width=0.9)
    return song, ('lead',), dict(title='Rooftop Flute', tags=['flute', 'dorian', 'breezy', 'strings'])


def build_bass_riff():
    """Pocket Bass — Bb minor, 98 BPM, 2 bars. slapx: thumb on the beats, pops off them, octave 2 (F2 and up),
    staccato (gate 1/16), high-passed at 45 Hz. Riff written for this pack."""
    song = P.loop_song('loop_bass_riff', bpm=98, key='Bb minor', bars=2, seed=0x1006)
    riff = [(1, 0, 'thumb', 'Bb2'), (1, 3, 'pop', 'Bb3'), (1, 8, 'thumb', 'Ab2'), (1, 10, 'pop', 'Ab3'),
            (1, 14, 'pop', 'F3'),
            (2, 0, 'thumb', 'Gb2'), (2, 3, 'pop', 'Db4'), (2, 8, 'thumb', 'Ab2'), (2, 10, 'pop', 'C4'),
            (2, 12, 'thumb', 'F2')]
    for i, (bar, six, art, n) in enumerate(riff):
        gate = 1.0 if ioi16(riff, i, song.bars) >= 3 else 0.75
        song.note('bass', 'slapx', bar, six, n, dur16=gate, vel=1.0 if art == 'thumb' else 0.9, art=art, bright=0.7)
    song.mix['bass'] = dry_mix(gain_db=0.0, eq=[('hp', 45.0), ('lp', 6500.0, 0.7)], drive=0.08, reverb=0.03,
                               reverb_type='room', width=0.3)
    return song, ('bass',), dict(title='Pocket Bass', tags=['bass', 'slap', 'funk', 'groove'])


def build_horn_riff():
    """Horn Section — Ab major, 108 BPM, 2 bars. Three brass parts (each a 3-voice section: attack 6 ms, sustain
    0.5, release 0.05, bright 0.7) in close harmony, panned L/C/R; shots gated 1/16 (3/4 of it before a 2/16 re-hit), one
    2-semitone fall at bar 2 beat 3: its pitch fall is over 0.67 s before the loop point (dry, under -40 dB 0.58 s
    before it)."""
    song = P.loop_song('loop_horn_riff', bpm=108, key='Ab major', bars=2, seed=0x1007)
    # (bar, sixteenth, [low, mid, high]). Top voice Eb Eb C Db Bb | C Eb F Eb(fall) = degrees 5 5 3 4 2 | 3 5 6 5.
    # IP (critic): the first draft's top voice C C Db Eb Eb Db (3 3 4 5 5 4 in Ab, near-even rhythm) was the
    # "Ode to Joy" incipit; this line starts on the 5th, drops, and turns on the 2nd (Ab Ab Ab Db Eb | Ab Eb/G Fm/Ab)
    shots = [(1, 0, ['Ab4', 'C5', 'Eb5']), (1, 3, ['Ab4', 'C5', 'Eb5']), (1, 6, ['Eb4', 'Ab4', 'C5']),
             (1, 10, ['F4', 'Ab4', 'Db5']), (1, 12, ['Eb4', 'G4', 'Bb4']),
             (2, 0, ['Eb4', 'Ab4', 'C5']), (2, 3, ['G4', 'Bb4', 'Eb5']), (2, 5, ['Ab4', 'C5', 'F5'])]
    fall = (2, 8, ['Ab4', 'C5', 'Eb5'])
    br = dict(voices=3, attack=0.006, sustain=0.5, release=0.05, bright=0.7)
    stems = ('horns', 'keys', 'lead')             # low / mid / high part
    allhits = shots + [fall]
    for i, (bar, six, ch) in enumerate(shots):
        gate = 1.0 if ioi16(allhits, i, song.bars) >= 3 else 0.75
        for stem, n in zip(stems, ch):
            song.note(stem, 'brass', bar, six, n, dur16=gate, vel=0.95 if six in (0, 10) else 0.85, **br)
    for stem, n in zip(stems, fall[2]):
        song.note(stem, 'brass', fall[0], fall[1], n, dur16=2, vel=0.95, fall=2, **br)
    for stem, pan in zip(stems, (-0.35, 0.0, 0.35)):
        song.mix[stem] = dry_mix(gain_db=0.0, eq=[('hp', 150.0), ('peak', 2500.0, 1.5, 0.8)], reverb=0.08,
                                 reverb_type='plate', pan=pan, width=0.7)
    return song, stems, dict(title='Horn Section', tags=['horns', 'brass', 'funk', 'bright'])


def build_arp_pluck():
    """Night Arp — A minor, 120 BPM, 2 bars. A saw pluck (decay 0.12) in 8ths, accents on the beats, on-beats and
    off-beats panned apart; a -16 dB pad (HP 250): Am9 -> Fmaj9 (they share A C E G)."""
    song = P.loop_song('loop_arp_pluck', bpm=120, key='A minor', bars=2, seed=0x1008)
    arp = [(1, ['A3', 'E4', 'B4', 'C5', 'G4', 'E5', 'C5', 'B4']),
           (2, ['F3', 'C4', 'G4', 'A4', 'E4', 'E5', 'C5', 'G4'])]
    pl = dict(decay=0.12, cutoff=700.0, env=3400.0, shape='saw', release=0.04)
    for bar, notes in arp:
        for i, n in enumerate(notes):
            six = 2 * i
            on = six % 4 == 0
            song.note('keys' if on else 'lead', 'pluck', bar, six, n, dur16=1, vel=1.0 if on else 0.9, **pl)
    song.chord('bed', 'pad', 1, 0, V('Am9', center=60, n=4), dur16=16, vel=0.6, attack=0.6, release=0.7,
               cutoff=1400.0, _nopad=True)
    song.chord('bed', 'pad', 2, 0, V('Fmaj9', center=60, n=4), dur16=16, vel=0.6, attack=0.6, release=0.7,
               cutoff=1400.0, _nopad=True)
    song.mix['keys'] = dry_mix(gain_db=0.0, eq=[('hp', 120.0)], reverb=0.08, reverb_type='plate', pan=-0.2, width=0.7)
    song.mix['lead'] = dry_mix(gain_db=0.0, eq=[('hp', 120.0)], reverb=0.08, reverb_type='plate', pan=0.2, width=0.7)
    song.mix['bed'] = dry_mix(gain_db=-16.0, eq=[('hp', 250.0), ('lp', 5000.0)], reverb=0.2, reverb_type='hall',
                              width=0.9)
    return song, ('keys', 'lead'), dict(title='Night Arp', tags=['arp', 'synth', 'pluck', 'night'])


def build_vox_choir():
    """Choir Hits — Bb major, 96 BPM, 4 bars. Wordless choir chord hits ("hah" = vowel a, "oh" = vowel o), attack
    10 ms, gate 1/16, release 0.05, 3 voices per note, 3/16 or more apart, open 3-note voicings |Bb|Gm|Eb|F7sus4|
    (each shares Bb with every other one)."""
    song = P.loop_song('loop_vox_choir', bpm=96, key='Bb major', bars=4, seed=0x1009)
    # open 3-note voicings (low, mid, high): close 2nds beat under 80 Hz and ripple the finder's 10 ms windows
    chords = [['Bb3', 'F4', 'D5'], ['G3', 'D4', 'Bb4'], ['Eb4', 'Bb4', 'G5'], ['F3', 'Eb4', 'Bb4']]
    rhythm = {1: [0, 3, 6, 10], 2: [0, 4, 10], 3: [0, 3, 6, 10], 4: [0, 6, 11]}
    vx = dict(attack=0.01, release=0.05, voices=3, breath=0.03)
    k = 0
    for bar in range(1, 5):
        lo, mid, hi = chords[bar - 1]
        for six in rhythm[bar]:
            vowel = ('a', 'a') if k % 2 == 0 else ('o', 'o')
            song.chord('keys', 'vox', bar, six, [lo, mid], dur16=1, vel=0.9, vowels=vowel, **vx)
            song.note('lead', 'vox', bar, six, hi, dur16=1, vel=0.9, vowels=vowel, **vx)
            k += 1
    song.mix['keys'] = dry_mix(gain_db=0.0, eq=[('hp', 150.0)], reverb=0.1, reverb_type='plate', pan=-0.25, width=0.8)
    song.mix['lead'] = dry_mix(gain_db=0.0, eq=[('hp', 150.0)], reverb=0.1, reverb_type='plate', pan=0.25, width=0.8)
    # the three detuned voices beat into a swell ~100 ms after each attack (a finder near-miss); a +3 dB push on
    # the first 12 ms of every hit (flip_pack.accent) makes each "hah" land and keeps the swell under the finder
    post = lambda y, pads: P.accent(y, pads, boost_db=3.0)     # noqa: E731
    return song, ('keys', 'lead'), dict(title='Choir Hits', tags=['vocal', 'choir', 'wordless', 'hits', 'soul'],
                                        post=post)


def build_kalimba_steps():
    """Kalimba Steps — F major, 125 BPM, 2 bars. A kalimba line in 8ths (decay 0.1), accents on the beats, beats and
    off-beats panned apart; F major pentatonic plus the 7th (E) as the turn back home."""
    song = P.loop_song('loop_kalimba_steps', bpm=125, key='F major', bars=2, seed=0x100A)
    line = [(1, ['F4', 'C5', 'A4', 'D5', 'C5', 'G4', 'A4', 'F5']),
            (2, ['D5', 'A4', 'C5', 'G4', 'A4', 'E5', 'C5', 'G4'])]
    kb = dict(kind='kalimba', decay=0.1, hard=0.6)
    for bar, notes in line:
        for i, n in enumerate(notes):
            six = 2 * i
            on = six % 4 == 0
            song.note('keys' if on else 'lead', 'mallet', bar, six, n, dur16=1, vel=1.0 if on else 0.85, **kb)
    song.mix['keys'] = dry_mix(gain_db=0.0, eq=[('hp', 150.0)], reverb=0.07, reverb_type='room', pan=-0.15, width=0.6)
    song.mix['lead'] = dry_mix(gain_db=0.0, eq=[('hp', 150.0)], reverb=0.07, reverb_type='room', pan=0.15, width=0.6)
    return song, ('keys', 'lead'), dict(title='Kalimba Steps', tags=['kalimba', 'mallet', 'bright', 'playful'])


BUILDERS = {
    'loop_ep_soul': build_ep_soul,
    'loop_organ_gospel': build_organ_gospel,
    'loop_gtr_pluck': build_gtr_pluck,
    'loop_string_stabs': build_string_stabs,
    'loop_flute_riff': build_flute_riff,
    'loop_bass_riff': build_bass_riff,
    'loop_horn_riff': build_horn_riff,
    'loop_arp_pluck': build_arp_pluck,
    'loop_vox_choir': build_vox_choir,
    'loop_kalimba_steps': build_kalimba_steps,
}
assert tuple(BUILDERS) == IDS


def render_one(iid: str, strict: bool = True) -> dict:
    song, pad_stems, meta = BUILDERS[iid]()
    pads = P.pads_from_song(song, *pad_stems)
    y = P.render_loop(song)
    if meta.get('post'):
        y = meta['post'](y, pads)
    return P.write_loop(song, y, kind='loop', title=meta['title'], tags=meta['tags'], suggested_pads=pads,
                        script=__file__, strict=strict)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# self-check: the contract (flip_pack.validate_record) + this producer's own numeric checks
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def seam_jump(ch: np.ndarray, ms: float = 5.0) -> float:
    """How the last `ms` flows into the first `ms`: the 2nd difference AT the join over the largest 2nd difference
    anywhere else in the 2 x ms window (<= ~1 means the join is no rougher than the audio around it)."""
    m = int(ms * 1e-3 * P.SR)
    s = np.concatenate([ch[-m:], ch[:m]])
    d2 = np.abs(s[2:] - 2 * s[1:-1] + s[:-2])
    j = m - 1                                     # d2 index centred on the last sample; j + 1 on the first
    at = max(d2[j - 1], d2[j], d2[j + 1])
    rest = np.concatenate([d2[:j - 1], d2[j + 2:]])
    return float(at / max(rest.max(), 1e-12))


def self_check(ids) -> bool:
    ok_all = True
    rows = []
    for iid in ids:
        path = os.path.join(P.ITEMS_DIR, f'{iid}.json')
        if not os.path.exists(path):
            print(f'{iid}: MISSING sidecar')
            ok_all = False
            continue
        rec = json.load(open(path))
        v = P.validate_record(rec)
        dec, sr = sf.read(os.path.join(P.PACK_DIR, rec['file']), dtype='float64', always_2d=True)
        ca = P.coreaudio_decode(os.path.join(P.PACK_DIR, rec['file']))
        exact = len(dec) == P.loop_samples(rec['bpm'], rec['bars'])
        jump = max(seam_jump(dec[:, c]) for c in range(dec.shape[1]))
        jump_ca = max(seam_jump(ca[:, c]) for c in range(ca.shape[1])) if ca is not None else None
        a44 = P.OC.analyse(P.OC.load_mono(os.path.join(P.PACK_DIR, rec['file']))[0], 44100)
        mono, _ = P.OC.load_mono(os.path.join(P.PACK_DIR, rec['file']))
        a48 = P.OC.analyse(P.OC.resample(mono, 44100, 48000), 48000)
        ok = v.ok and exact and jump < 2.0 and (jump_ca is None or jump_ca < 2.0)
        ok_all &= ok
        rows.append((iid, ok, a44['uncapped'], a48['uncapped'], len(rec['suggestedPads']),
                     min(a44['onsetRatios'][1:] or [0]), min(a48['onsetRatios'][1:] or [0]),
                     len(a44['nearMisses']) + len(a48['nearMisses']),
                     round(F.lufs(dec), 2), round(F.db(np.max(np.abs(dec))), 2), exact, round(jump, 2),
                     None if jump_ca is None else round(jump_ca, 2), os.path.getsize(os.path.join(P.PACK_DIR, rec['file'])),
                     v.failures(), v.warnings))
    print('\nid                   ok   on44 on48 pads minR44 minR48 near  LUFS   peak  exact seam(sf/ca)  bytes')
    for r in rows:
        print(f'{r[0]:20s} {"PASS" if r[1] else "FAIL"} {r[2]:4d} {r[3]:4d} {r[4]:4d} {r[5]:6.2f} {r[6]:6.2f} {r[7]:4d} '
              f'{r[8]:6.2f} {r[9]:6.2f} {str(r[10]):5s} {r[11]}/{r[12]}  {r[13]:7,d}')
        if r[14]:
            print('   failures:', json.dumps(r[14]))
        if r[15]:
            print('   warnings:', json.dumps(r[15]))
    total = sum(r[13] for r in rows)
    print(f'total audio bytes: {total:,} ({len(rows)} files)')
    return ok_all


def write_items_json(ids) -> str:
    recs = []
    for iid in ids:
        p = os.path.join(P.ITEMS_DIR, f'{iid}.json')
        if os.path.exists(p):
            recs.append(json.load(open(p)))
    out = os.path.join(P.PACK_DIR, 'items.json')
    with open(out, 'w') as fh:
        json.dump(recs, fh, indent=1)
        fh.write('\n')
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--only', default='', help='comma-separated ids')
    ap.add_argument('--check', action='store_true', help='self-check only, no render')
    ap.add_argument('--no-strict', action='store_true', help='record a failing item instead of raising')
    a = ap.parse_args(argv)
    ids = [x for x in a.only.split(',') if x] or list(IDS)
    for iid in ids:
        if iid not in BUILDERS:
            raise SystemExit(f'unknown id {iid}; known: {", ".join(IDS)}')
    print(f'[flip_loops] pack dir: {P.PACK_DIR}')
    if not a.check:
        for iid in ids:
            render_one(iid, strict=not a.no_strict)
    ok = self_check(ids)
    print('wrote', write_items_json(IDS))
    print('SELF-CHECK', 'PASSED' if ok else 'FAILED')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
