#!/usr/bin/env python3
"""song_cypher.py — "Windward Circle" (id `cypher`), FEL house song 2 of 6 for The Cypher: slap-bass funk,
96 BPM, E dorian, swing 0.54, 40 bars (100.0 s), seed 0xC1FE, difficulty 2, 40 taps/min, hook stem = BASS.

    /Users/elijahbonds/.cache/fel-kokoro/.venv/bin/python songgen/song_cypher.py [--no-validate]

writes songs/cypher/{stems/*.mp3, preview.mp3, map.json} and runs validate.py on it.

Arrangement (bars):
    intro   1-4   e1  bed keys perc fx            clav comp + conga trio over the pulse, air, a reverse swell into 5
    verse   5-12  e2  + drums bass                the kit arrives; the THINNED slap riff (no 3/13 pops) on Em9|A13
    hook   13-20  e3  all                         the FULL slap riff on Gmaj7|A13|F#m7|Bm7 (B7#9), horns answer,
                                                  organ pad, square-lead fills, tambourine
    break  21-22  e2  bed horns fx                stop-time: horn A13 hit (the freeze) + swell with a fall, stabs,
                                                  scrubs, a downsweep; reverse swell back in (the band's last hit on
                                                  20 "&4" is choked so the kit is gone when the freeze lands)
    verse  23-28  e3  all                         lead call/response fills over soft horn pads; 27-28 = the build
                                                  (harmony doubles speed, bass walk-up, snare roll, conga roll, a horn
                                                  crescendo swell and the riser, both stopping a 32nd before hook 2)
    hook   29-36  e4  all                         riff + dead-note ghosts + a pop run up (32), cowbell + shaker,
                                                  brighter horns, a crash at 33 where the lead starts doubling the
                                                  horn line an octave up (33-36)
    outro  37-40  e2  bed drums bass horns lead fx  horn hits on every downbeat, low-E riff, the lead's verse-2 call
                                                  cell answers in the gaps, final hit 40.1 rings

    (Critic pass 2026-09-25, deviations from the SONGS.md table: the break drops keys — bed + horns + fx, SONGS.md
    rule 8's own recipe, so the freeze is "bed + at most two stems"; verse 2 adds horns and the outro adds lead, so
    every earned stem is audible in >= 60 % of the bars — horns 28/40, lead 26/40.)

IP check (the rules in SONGS.md):
  * Everything is synthesised by fel_synth + voices_cypher (sines, pulses, saws, seeded noise). No samples, loops,
    recordings or audio files are read. No words: there is no vocal of any kind in this song.
  * The hook (bass) is composed here from the chord tones of Gmaj7|A13|F#m7|Bm7 with a thumb/pop/dead-note vocabulary:
    a one-bar cell (thumb root on 1, octave pop on the "a", a maj7/b7 -> octave pop pair on the "a"/3, the 10th popped
    on the "a" of 3, a dead note under the snare on 4, the 9th, and a PUSH to the next chord's root on the "&" of 4)
    stated on G and sequenced a half step down on F#; the answering bars climb 5-b7-8-9-10 to C#3 / D3 and step back
    down G2-F#2 into the next bar. The riff never pops on the backbeat (4 and 12 are dead notes): the snare owns it.
    The verse riff is the same vocabulary thinned on Em9|A13. Checked against the funk/slap basslines I know (the
    classic octave-slap grooves, Seinfeld-style slap themes, the Larry Graham / Louis Johnson / Marcus Miller lines):
    the contour (7-8 pop pairs, the 5-b7-8-9-10 climb, the push on 14) and the G -> F# half-step sequence follow none.
  * The kit is an original 2-bar pattern built around the bed's 1 + "&3" kick: drums kick on the "e" of 4 (bar A, the
    spec's six 13, right after the backbeat) and "a" of 1 / "&" of 4 (+ "&" of 2 in the hooks) (bar B); snare ghosts
    on 6/11 and 9/15. It is deliberately NOT the Funky Drummer (its 7/9 ghost pair and 1-&1-&3-a3 kick), the Amen,
    Apache, Think or Impeach patterns — and not goldenhour's 1 + "a"2 + "&"3 groove (bar A used to be exactly that
    grid until the critic pass moved its kick from six 7 to six 13).
  * Horn pads (verse 2): the vamp's shells held soft and dark between the bass pops and the lead; no melody.
  * Horn line: parallel diatonic triads under an original top line (F#5 hit, G5 push, E-F#-E fall; D-E-F#-A walk-up).
  * Lead: short square-lead answers built from the chord tones; verse 2 call/response is a sequence of one
    E-minor-pentatonic cell (B-D-E / G-F#-E-D-B) moved up to A13 (C#-E-F# / A-G-F#-E-C#).
  * Congas: a tumbao-derived traditional pattern (public-domain Afro-Cuban rhythm vocabulary), re-accented.

Mix (no master compression; the only sum processing is fel_synth's shared peak guard, ~2.35 dB here):
  * stem levels are set with a broadband EQ band (G()), because fel_synth 1.0.0's StemMix.gain_db is never applied;
  * the slap has a per-note soft clip (its own "compressor"; dead notes excepted), the clav and the congas a per-note
    clip; the snare is NOT clipped (a clipped snare regrows ~2 dB of peak in the MP3 stem);
  * the arrangement keeps the loudest transients apart: the bass ghosts the backbeat, the clav comps on the free 16ths,
    the congas slap a 16th after the snare, the organ breathes in a 32nd after the hook downbeats, risers stop a 32nd
    before the drop, the outro downsweep starts a 16th after the hit; in the verse A bars the clav only chks on 13
    (the kick's 16th), and the outro lead's last note enters on 40 "&1", after the final hit.
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import fel_synth as F  # noqa: E402
from fel_synth import Song, Section, StemMix, midi  # noqa: E402
import voices_cypher  # noqa: E402,F401  (registers slapx, clavx, congax, kickx)

OUT_ROOT = os.path.join(os.path.dirname(HERE), 'songs')
ALL = ('bed', 'drums', 'bass', 'keys', 'perc', 'horns', 'lead', 'fx')

# Critic pass (2026-09-25) deviations from the SONGS.md table, for the earned-stem rules of the critic brief:
#   * break = bed + horns + fx only (the freeze reads: "bed + at most two stems"; SONGS.md rule 8's own recipe);
#   * verse 2 adds horns (soft pads + a build swell) and the outro adds lead (a call/response tag) so every earned
#     stem is audible in >= 60 % of the bars (horns 22 -> 28 bars, lead 22 -> 26 bars of 40).
SECTIONS = [
    Section('intro', 1, 4, 1, ('bed', 'keys', 'perc', 'fx')),
    Section('verse', 5, 8, 2, ('bed', 'drums', 'bass', 'keys', 'perc', 'fx'), label='verse1'),
    Section('hook', 13, 8, 3, ALL, label='hook1'),
    Section('break', 21, 2, 2, ('bed', 'horns', 'fx')),
    Section('verse', 23, 6, 3, ALL, label='verse2'),
    Section('hook', 29, 8, 4, ALL, label='hook2'),
    Section('outro', 37, 4, 2, ('bed', 'drums', 'bass', 'horns', 'lead', 'fx')),
]

VAMP = ['Em9', 'Em9', 'A13', 'A13']
HOOK = ['Gmaj7', 'A13', 'F#m7', 'Bm7', 'Gmaj7', 'A13', 'F#m7', 'B7#9']
PROGRESSION = {
    'intro': VAMP,
    'verse': VAMP + VAMP,
    'hook': HOOK,
    'break': ['A13', 'A13'],
    'verse2': VAMP + ['Em9', 'A13'],
    'outro': ['Em9'] * 4,
}
CHORD: dict[int, str] = {}
for _start, _seq in ((1, PROGRESSION['intro']), (5, PROGRESSION['verse']), (13, HOOK), (21, PROGRESSION['break']),
                     (23, PROGRESSION['verse2']), (29, HOOK), (37, PROGRESSION['outro'])):
    for _i, _c in enumerate(_seq):
        CHORD[_start + _i] = _c

# ── hand voicings ──────────────────────────────────────────────────────────────────────────────────────────────────
CLAV = {   # 3-note shells, voice-led (the vamp keeps G and F# and moves D <-> C#)
    'Em9': ['G4', 'D5', 'F#5'], 'A13': ['G4', 'C#5', 'F#5'],
    'Gmaj7': ['F#4', 'B4', 'D5'], 'A13h': ['G4', 'B4', 'C#5'], 'F#m7': ['E4', 'A4', 'C#5'],
    'Bm7': ['F#4', 'A4', 'D5'], 'B7#9': ['D#4', 'A4', 'D5'],
}
ORGAN = {   # 3-note shells under the clav (3rd / 7th / colour)
    'Gmaj7': ['B3', 'D4', 'F#4'], 'A13': ['G3', 'C#4', 'F#4'], 'F#m7': ['A3', 'C#4', 'E4'],
    'Bm7': ['A3', 'B3', 'D4'], 'B7#9': ['D#3', 'A3', 'D4'],
}


def is_hook_bar(bar: int) -> bool:
    return 13 <= bar <= 20 or 29 <= bar <= 36


def clav_voicing(bar: int) -> list:
    c = CHORD[bar]
    if c == 'A13' and is_hook_bar(bar):     # in the hook A13 sits between Gmaj7 and F#m7 shells: the lower A9 shell
        return CLAV['A13h']
    return CLAV[c]


# ── the bass: slap cells (six, pitch, dur16, vel, art[, extra params]) ────────────────────────────────────────────────
T, P, D = 'thumb', 'pop', 'dead'
# The riff leaves the backbeat to the snare: on 4 and 12 the bass plays a dead note (or rests), the pops sit on the
# "a" around it. (That is how slap players make room for the snare, and it keeps the two loudest transients apart.)
HOOK_BASS = {
    # the hook riff, bar 1 (Gmaj7): thumb G1, octave pop on the "a", 7->8 pop pair, 10th -> (dead) -> 9th, PUSH to A1
    'G': [(0, 'G1', 2, 0.92, T), (3, 'G2', 1, 0.85, P), (4, 'G1', .5, 0.45, D), (6, 'G1', 1, 0.70, T),
          (7, 'F#2', 1, 0.80, P), (8, 'G2', 2, 0.90, P), (10, 'D2', 1, 0.72, T), (11, 'B2', 1, 0.82, P),
          (12, 'G1', .5, 0.38, D), (13, 'A2', 1, 0.72, P), (14, 'A1', 2, 0.95, T)],
    # bar 2 (A13): the push already landed, so beat 1 is a dead note; pops climb 5-b7-8-9-10 to C#3
    'A': [(0, 'A1', .5, 0.50, D), (2, 'A2', 1, 0.85, P), (3, 'A1', 1, 0.65, T), (4, 'A1', .5, 0.40, D),
          (6, 'E2', 1, 0.72, T), (7, 'G2', 1, 0.80, P), (8, 'A2', 1, 0.85, P), (9, 'B2', 1, 0.75, P),
          (10, 'C#3', 2, 0.92, P), (12, 'A1', .5, 0.35, D), (13, 'A1', 1, 0.68, T), (14, 'G2', 1, 0.80, P),
          (15, 'F#2', 1, 0.80, P)],
    # bar 3 (F#m7): bar 1's shape a half step down, 5th -> (dead) -> 4th, PUSH to B1
    'F#': [(0, 'F#1', 2, 0.92, T), (3, 'F#2', 1, 0.85, P), (4, 'F#1', .5, 0.45, D), (6, 'F#1', 1, 0.70, T),
           (7, 'E2', 1, 0.80, P), (8, 'F#2', 2, 0.90, P), (10, 'C#2', 1, 0.72, T), (11, 'C#3', 1, 0.82, P),
           (12, 'F#1', .5, 0.38, D), (13, 'B2', 1, 0.72, P), (14, 'B1', 2, 0.95, T)],
    # bar 4 (Bm7): bar 2's climb a step up, to D3, and a pop pair A2-F#2 leading back to G
    'B': [(0, 'B1', .5, 0.50, D), (2, 'B2', 1, 0.85, P), (3, 'B1', 1, 0.65, T), (4, 'B1', .5, 0.40, D),
          (6, 'F#2', 1, 0.72, T), (7, 'A2', 1, 0.80, P), (8, 'B2', 1, 0.85, P), (9, 'C#3', 1, 0.75, P),
          (10, 'D3', 2, 0.92, P), (12, 'B1', .5, 0.35, D), (13, 'B1', 1, 0.68, T), (14, 'A2', 1, 0.80, P),
          (15, 'F#2', 1, 0.80, P)],
}
# the last hook bar (B7#9): the #9 -> 3 rub (D3 -> D#3), then an ending
HOOK_BASS_B79 = [(0, 'B1', .5, 0.50, D), (2, 'B2', 1, 0.85, P), (3, 'B1', 1, 0.65, T), (4, 'B1', .5, 0.40, D),
                 (6, 'F#2', 1, 0.72, T), (7, 'A2', 1, 0.80, P), (8, 'B2', 1, 0.85, P), (9, 'D3', 1, 0.78, P),
                 (10, 'D#3', 2, 0.92, P), (12, 'B1', .5, 0.35, D)]
END_INTO_BREAK = [(13, 'F#2', 1, 0.75, P), (14, 'B1', 1.5, 0.90, T, {'from': 'B2', 'glide': 0.05})]  # the drop-slide
END_INTO_OUTRO = [(13, 'C#2', 1, 0.72, T), (14, 'D#2', 2, 0.88, T)]                                  # leading tone
# hook 2 (energy 4): a pop run up at the end of its first phrase, and dead notes in the riff's holes
HOOK2_POP_RUN = [(12, 'B1', .5, 0.35, D), (13, 'D3', 1, 0.80, P), (14, 'F#3', 1, 0.84, P), (15, 'A3', 1, 0.88, P)]
HOOK2_GHOSTS = {'G': [(2, 'G1', .5, 0.32, D)], 'F#': [(2, 'F#1', .5, 0.32, D)],      # only where no note rings
                'A': [(5, 'A1', .5, 0.32, D)], 'B': [(5, 'B1', .5, 0.32, D)]}

VERSE_BASS = {
    # thinned: no pop on the "a" of 1, no pull-off after beat 4 (the hook adds them back)
    'E1': [(0, 'E2', 2, 1.00, T), (4, 'E2', .5, 0.45, D), (6, 'E2', 1, 0.70, T), (7, 'D3', 1, 0.78, P),
           (8, 'E3', 2, 0.88, P), (10, 'B2', 1, 0.70, T), (11, 'G3', 1, 0.80, P), (14, 'E2', 1, 0.72, T)],
    'E2': [(0, 'E2', 2, 1.00, T), (3, 'E2', 1, 0.60, T), (4, 'E2', .5, 0.45, D), (6, 'E2', 1, 0.68, T),
           (8, 'E3', 2, 0.88, P), (10, 'B2', 1, 0.70, T), (11, 'D3', 1, 0.80, P), (14, 'A1', 2, 0.92, T)],
    'A1': [(0, 'A1', .5, 0.50, D), (2, 'A2', 1, 0.80, P), (4, 'A1', .5, 0.42, D), (6, 'A1', 1, 0.70, T),
           (7, 'G2', 1, 0.78, P), (8, 'A2', 2, 0.88, P), (10, 'E2', 1, 0.70, T), (11, 'C#3', 1, 0.76, P),
           (14, 'A1', 1, 0.72, T)],
    'A2': [(0, 'A1', 2, 1.00, T), (3, 'A1', 1, 0.60, T), (4, 'A1', .5, 0.45, D), (6, 'A1', 1, 0.68, T),
           (8, 'A2', 2, 0.86, P), (10, 'E2', 1, 0.70, T), (11, 'G2', 1, 0.80, P), (14, 'D2', 1, 0.80, T)],
}
# the verse's last bar walks up (a B minor arpeggio) into the hook's G1
VERSE_WALK_INTO_HOOK = [(0, 'A1', 2, 1.00, T), (3, 'A1', 1, 0.60, T), (4, 'A1', .5, 0.45, D), (6, 'A1', 1, 0.68, T),
                        (8, 'A2', 2, 0.86, P), (10, 'E2', 1, 0.70, T), (11, 'A2', 1, 0.76, P), (13, 'B1', 1, 0.74, T),
                        (14, 'D2', 1, 0.80, T), (15, 'F#2', 1, 0.76, P)]
# verse 2, bar 27: the riff grows (the "a"-of-1 pop and the pull-off come back); bar 28: the build walk-up
VERSE2_GROW = [(0, 'E2', 2, 1.00, T), (3, 'E3', 1, 0.80, P), (4, 'E2', .5, 0.45, D), (6, 'E2', 1, 0.70, T),
               (7, 'D3', 1, 0.78, P), (8, 'E3', 2, 0.88, P), (10, 'B2', 1, 0.70, T), (11, 'G3', 1, 0.84, P),
               (12, 'E2', .5, 0.35, D), (13, 'F#3', 1, 0.72, P), (14, 'A1', 2, 0.92, T)]
BUILD_WALK = [(0, 'A1', .5, 0.50, D), (2, 'A2', 1, 0.80, P), (3, 'A1', 1, 0.62, T), (4, 'A1', .5, 0.42, D),
              (6, 'A1', 1, 0.70, T), (7, 'G2', 1, 0.78, P), (8, 'A2', 1, 0.72, P), (10, 'E2', 1, 0.72, T),
              (11, 'E2', .5, 0.40, D), (12, 'A1', .5, 0.35, D), (13, 'D2', 1, 0.80, T), (14, 'E2', 1, 0.84, T),
              (15, 'F#2', 1, 0.88, P)]
OUTRO_BASS = {
    37: [(0, 'E1', 2, 1.00, T), (3, 'E2', 1, 0.80, P), (4, 'E1', .5, 0.45, D), (6, 'E1', 1, 0.70, T),
         (7, 'D2', 1, 0.78, P), (8, 'E2', 2, 0.88, P), (10, 'B1', 1, 0.70, T), (11, 'G2', 1, 0.82, P),
         (14, 'E1', 1, 0.72, T)],
    38: [(0, 'E1', 2, 1.00, T), (4, 'E1', .5, 0.45, D), (6, 'E1', 1, 0.70, T), (8, 'E2', 2, 0.88, P),
         (10, 'B1', 1, 0.70, T), (11, 'D2', 1, 0.80, P), (14, 'E2', 1, 0.78, P)],
    39: [(0, 'E1', 3, 1.00, T), (6, 'E2', 1, 0.72, P), (8, 'E1', 2, 0.80, T), (13, 'B1', 1, 0.72, T),
         (14, 'D2', 1, 0.76, T), (15, 'D#2', 1, 0.80, T)],
    40: [(0, 'E1', 12, 0.90, T, {'decay': 1.4, 'release': 0.12})],
}

# ── horns: (six, pitches, dur16, vel[, extra]) ────────────────────────────────────────────────────────────────────
HORN_HOOK = {
    1: [(0, ['B4', 'D5', 'F#5'], 2, 0.82), (14, ['C#5', 'E5', 'G5'], 2, 0.88)],                      # hit, PUSH
    2: [(4, ['G4', 'C#5', 'E5'], 1, 0.72), (6, ['G4', 'C#5', 'F#5'], 1, 0.78),
        (8, ['G4', 'C#5', 'E5'], 3, 0.85, {'fall': 2})],                                             # da-da DAA~
    3: [(0, ['A4', 'C#5', 'E5'], 2, 0.88), (14, ['A4', 'D5', 'F#5'], 2, 0.88)],
    4: [(2, ['F#4', 'A4', 'D5'], 1, 0.72), (4, ['G4', 'B4', 'E5'], 1, 0.76), (6, ['A4', 'D5', 'F#5'], 1, 0.80),
        (8, ['D5', 'F#5', 'A5'], 4, 0.82, {'attack': 0.12})],                                       # walk-up + swell
    8: [(2, ['D#4', 'A4', 'D5'], 1, 0.76), (4, ['D#4', 'A4', 'D5'], 1, 0.80),
        (8, ['D#4', 'A4', 'D5'], 4, 0.90, {'fall': 3})],                                             # the #9 hits
}
HORN_HOOK[5], HORN_HOOK[6], HORN_HOOK[7] = HORN_HOOK[1], HORN_HOOK[2], HORN_HOOK[3]
# verse 2: the section breathes under the lead — soft, dark pads (slow attack, no scoop) on the vamp, voiced between
# the bass pops and the lead (D4-B4; the vamp moves D4 <-> C#4 like the clav), then a crescendo swell on the upper A13
# shell in the build bar that stops a 32nd before hook 2's first hit. (All below velocity 0.6: swells, not accents.)
_PAD = {'attack': 0.45, 'bright': 0.3, 'scoop': 0.0, 'vib': 6.0, 'release': 0.25}
HORN_VERSE2 = {
    23: [(0, ['D4', 'G4', 'B4'], 28, 0.40, _PAD)],                                                   # Em9 (2 bars)
    25: [(0, ['C#4', 'G4', 'B4'], 28, 0.40, _PAD)],                                                  # A13 (2 bars)
    27: [(0, ['D4', 'G4', 'B4'], 14, 0.42, _PAD)],                                                   # Em9
    28: [(0, ['G4', 'C#5', 'F#5'], 15.5, 0.58, {'attack': 1.3, 'bright': 0.6, 'scoop': 0.0, 'vib': 10.0,
                                                'release': 0.04})],                                   # A13 swell
}
HORN_BREAK = {
    21: [(0, ['G4', 'C#5', 'F#5'], 2, 0.95, {'bright': 0.9}),                                        # THE FREEZE
         (4, ['G4', 'C#5', 'F#5'], 16, 0.80, {'attack': 0.9, 'fall': 3, 'vib': 18})],               # swell -> fall
    22: [(8, ['G4', 'B4', 'E5'], 1, 0.85), (12, ['G4', 'B4', 'E5'], 2, 0.90)],
}
HORN_OUTRO = {
    37: [(0, ['G4', 'B4', 'E5'], 2, 0.90), (6, ['F#4', 'A4', 'D5'], 1, 0.72), (8, ['G4', 'B4', 'E5'], 2, 0.80)],
    38: [(0, ['G4', 'B4', 'E5'], 2, 0.90), (6, ['A4', 'D5', 'F#5'], 1, 0.76), (14, ['F#4', 'A4', 'D5'], 2, 0.80)],
    39: [(0, ['G4', 'B4', 'E5'], 2, 0.90), (8, ['F#4', 'A4', 'D5'], 1, 0.74), (10, ['G4', 'B4', 'E5'], 1, 0.80),
         (12, ['A4', 'D5', 'F#5'], 2, 0.85)],
    40: [(0, ['G4', 'B4', 'D5', 'F#5'], 12, 0.86, {'fall': 4, 'fall_time': 0.35})],               # the last hit
}

# ── lead (square) ─────────────────────────────────────────────────────────────────────────────────────────────────
LEAD_HOOK_FILLS = {   # hook-bar index -> [(six, pitch, dur16, vel)], answers in the riff's gaps
    1: [(8, 'D5', 1, 0.62), (9, 'E5', 1, 0.64), (10, 'F#5', 2, 0.72)],
    2: [(12, 'E5', 1, 0.62), (13, 'F#5', 1, 0.64), (14, 'A5', 2, 0.72)],
    3: [(8, 'C#5', 1, 0.62), (9, 'E5', 1, 0.64), (10, 'F#5', 2, 0.72)],
    4: [(12, 'F#5', 1, 0.62), (13, 'A5', 1, 0.64), (14, 'B5', 2, 0.72)],
    # bar 20 (into the stop-time break): the answer comes early, between the horns' #9 hits, so its echoes are gone
    # before the freeze (a fill on 12-15 trailed its delay into bar 21 at -36 dB)
    8: [(5, 'A5', 1, 0.64), (6, 'F#5', 1, 0.66), (7, 'D#5', 1, 0.74)],
}
LEAD_HOOK_FILLS[5], LEAD_HOOK_FILLS[6], LEAD_HOOK_FILLS[7] = LEAD_HOOK_FILLS[1], LEAD_HOOK_FILLS[2], LEAD_HOOK_FILLS[3]
LEAD_HOOK2_FILLS = dict(LEAD_HOOK_FILLS)
LEAD_HOOK2_FILLS[2] = [(12, 'E5', 1, 0.62), (13, 'G5', 1, 0.64), (14, 'A5', 1, 0.70), (15, 'B5', 1, 0.72)]
LEAD_HOOK2_FILLS[4] = [(12, 'F#5', 1, 0.62), (13, 'A5', 1, 0.64), (14, 'C#6', 1, 0.70), (15, 'D6', 1, 0.74)]
LEAD_VERSE2 = {
    23: [(8, 'B4', 1, 0.70), (9, 'D5', 1, 0.72), (10, 'E5', 3, 0.82), (14, 'D5', 1, 0.70), (15, 'E5', 1, 0.75)],
    24: [(0, 'G5', 2, 0.85), (2, 'F#5', 2, 0.78), (4, 'E5', 2, 0.78), (6, 'D5', 1, 0.72), (7, 'B4', 5, 0.80)],
    25: [(8, 'C#5', 1, 0.70), (9, 'E5', 1, 0.72), (10, 'F#5', 3, 0.82), (14, 'E5', 1, 0.70), (15, 'F#5', 1, 0.75)],
    26: [(0, 'A5', 2, 0.85), (2, 'G5', 2, 0.78), (4, 'F#5', 2, 0.78), (6, 'E5', 1, 0.72), (7, 'C#5', 5, 0.80)],
    27: [(8, 'E5', 2, 0.75), (10, 'G5', 2, 0.80), (12, 'B5', 4, 0.86)],
    28: [(0, 'A5', 3, 0.80), (3, 'G5', 1, 0.70), (4, 'F#5', 2, 0.75), (6, 'E5', 2, 0.75), (8, 'E5', 1, 0.70),
         (9, 'F#5', 1, 0.72), (10, 'G5', 1, 0.75), (11, 'A5', 1, 0.78), (12, 'B5', 1, 0.82), (13, 'C#6', 1, 0.85),
         (14, 'D6', 2, 0.90)],
}
# the outro: the verse-2 call cell comes home, answering the horn hits in their gaps (call B-D-E, answer G-F#-E-D),
# and the lead holds the 5th over the last hit. Part of the hook-2 phrase so its level stays relative to it.
LEAD_OUTRO = {
    37: [(10, 'B4', 1, 0.46), (11, 'D5', 1, 0.48), (12, 'E5', 2, 0.52)],
    38: [(8, 'G5', 2, 0.50), (10, 'F#5', 1, 0.46), (11, 'E5', 1, 0.46), (12, 'D5', 2, 0.46)],
    39: [(2, 'B4', 1, 0.45), (3, 'D5', 1, 0.47), (4, 'E5', 3, 0.50)],
    40: [(2, 'B5', 8, 0.40)],
}


def build() -> Song:
    s = Song(id='cypher', title='Windward Circle', style='slap-bass funk', bpm=96, key='E dorian', bars=40,
             seed=0xC1FE, difficulty=2, target_taps_per_min=40, swing=0.54, hook_stem='bass', sections=SECTIONS,
             break_bars=[21, 22], preview_start_bar=13, progression=PROGRESSION,
             notes='voices: fel_synth + voices_cypher (slapx, clavx, congax, kickx; map voices name them kick/conga); '
                   'see provenance.modules')
    bed(s)
    drums(s)
    bass(s)
    keys(s)
    perc(s)
    horns(s)
    lead(s)
    fx(s)
    mix(s)
    return s


# ── bed: kick on 1 and the "&" of 3, hats on the quarters (kick + hat only, every bar) ─────────────────────────────
KICK = dict(tune=54.0, punch=160.0, decay=0.17, beater=0.25, drive=0.3)
KICKV = 'kickx'   # voices_cypher; written to map.json as kick


def bed(s: Song):
    for bar in range(1, s.bars + 1):
        last = bar == s.bars
        s.hit('bed', KICKV, bar, 0, 0.95 if last else 0.90, **KICK)
        if not last:
            s.hit('bed', KICKV, bar, 10, 0.52, **KICK)
        for six, v in ((0, 0.36), (4, 0.28), (8, 0.33), (12, 0.28)):
            if last and six > 8:
                continue
            s.hit('bed', 'hat', bar, six, v, decay=0.03, tone=0.4)


# ── drums: the rest of the kit (never on a bed position) ─────────────────────────────────────────────────────────
SNARE, CONGA = 'snare', 'congax'      # congax = per-note soft-clipped conga (voices_cypher), written to map.json as conga
SN = dict(tune=220.0, snappy=0.8, decay=0.2, body=0.7, tone=0.55)        # a fat, ringing funk snare
HT = dict(decay=0.028, tone=0.45)


def _kit_bar(s: Song, bar: int, *, kicks, ghosts, hats: str, hat_v=0.44, hat_o=0.2, backbeat=(4, 12),
             hat_until: int = 16, open14: bool = False):
    for six, v in kicks:
        s.hit('drums', KICKV, bar, six, v, **KICK)
    for six in backbeat:
        s.hit('drums', SNARE, bar, six, 0.88, **SN)
    for six, v in ghosts:
        s.hit('drums', SNARE, bar, six, v, **SN)
    for six, ch in enumerate(hats):
        if six >= hat_until or ch == '.':
            continue
        if open14 and six == 14:
            continue
        v = {'x': hat_v, 'o': hat_o, 'g': hat_o * 0.7}[ch]
        s.hit('drums', 'hat', bar, six, v, **HT)
    if open14:
        s.hit('drums', 'openhat', bar, 14, 0.46, decay=0.2, tone=0.45)


def drums(s: Song):
    H8 = '..x...x...x...x.'
    H8g = '..x...x...x..gx.'
    H16 = '.oxo.oxo.oxo.oxo'
    for bar in s.bars_of('verse', 'hook', 'outro'):
        sec = s.section_at(bar)
        lab = sec.label or sec.name
        a = (bar - sec.start_bar) % 2 == 0
        if lab == 'verse1':
            kicks = [(13, 0.66)] if a else [(3, 0.55), (14, 0.60)]
            ghosts = [(6, 0.20), (11, 0.22)] if a else [(9, 0.20), (15, 0.24)]
            hats = H8 if a else H8g
            if bar == 12:        # fill into the hook: toms down on beat 4
                _kit_bar(s, bar, kicks=[(3, 0.55)], ghosts=[(9, 0.20)], hats=hats, hat_until=12, backbeat=(4,))
                s.hit('drums', SNARE, bar, 12, 0.92, **SN)
                for six, size, v in ((13, 'high', 0.70), (14, 'mid', 0.72), (15, 'low', 0.50)):
                    s.hit('drums', 'tom', bar, six, v, size=size, decay=0.16)
                continue
            _kit_bar(s, bar, kicks=kicks, ghosts=ghosts, hats=hats, hat_v=0.42, open14=(bar == 8))
        elif lab in ('hook1', 'hook2'):
            e4 = lab == 'hook2'
            kicks = [(13, 0.68)] if a else [(3, 0.55), (6, 0.62), (14, 0.60)]
            ghosts = [(6, 0.20), (11, 0.22)] if a else [(9, 0.20), (15, 0.24)]
            if e4:
                ghosts += [(1, 0.16)] if a else [(7, 0.18)]
            if bar in (20, 36):
                _kit_bar(s, bar, kicks=[(3, 0.55), (6, 0.62)], ghosts=[(9, 0.20)], hats=H16, hat_until=12,
                         backbeat=(4,))
                if bar == 20:    # the band's last hit before the stop-time break, on the "&" of 4: short and
                    # choked (no open hat, a tight snare) so the kit is gone when the freeze lands on 21.1
                    s.hit('drums', SNARE, bar, 12, 0.90, **SN)
                    s.hit('drums', KICKV, bar, 14, 0.72, **{**KICK, 'decay': 0.08})
                    s.hit('drums', SNARE, bar, 14, 0.72, **{**SN, 'decay': 0.07})
                else:            # fill into the outro
                    s.hit('drums', SNARE, bar, 8, 0.70, **SN)
                    for six, size, v in ((12, 'high', 0.74), (13, 'high', 0.66), (14, 'mid', 0.74), (15, 'low', 0.68)):
                        s.hit('drums', 'tom', bar, six, v, size=size, decay=0.16)
                continue
            _kit_bar(s, bar, kicks=kicks, ghosts=ghosts, hats=H16, hat_v=0.46 if e4 else 0.44,
                     open14=(bar in (16,) or (e4 and not a)))
        elif lab == 'verse2':
            if bar == 28:        # the build: snare roll, kick on the quarters the bed leaves free
                s.roll('drums', SNARE, 28, 1, steps=(2, 1, 1, 0.5), vel=(0.24, 0.55), **SN)
                for six, v in ((4, 0.60), (8, 0.70), (12, 0.80)):
                    s.hit('drums', KICKV, bar, six, v, **KICK)
                for six in (2, 6, 10, 14):
                    s.hit('drums', 'hat', bar, six, 0.40, **HT)
                continue
            kicks = [(13, 0.66)] if a else [(3, 0.55), (14, 0.60)]
            ghosts = [(6, 0.20), (11, 0.22)] if a else [(9, 0.20), (15, 0.24)]
            _kit_bar(s, bar, kicks=kicks, ghosts=ghosts, hats=H16, hat_v=0.40, hat_o=0.17, open14=bar in (24, 26))
        elif lab == 'outro':
            if bar == 40:
                s.hit('drums', 'crash', bar, 0, 0.58, decay=1.3)
                s.hit('drums', SNARE, bar, 0, 0.70, **SN)
                continue
            kicks = [(13, 0.66)] if a else [(3, 0.55), (14, 0.60)]
            ghosts = [(6, 0.20), (11, 0.22)] if a else [(9, 0.20), (15, 0.24)]
            if bar == 39:        # snare pickup into the last hit
                _kit_bar(s, bar, kicks=[(6, 0.66)], ghosts=[(9, 0.20)], hats=H8, hat_until=12, backbeat=(4,))
                for six, v in ((12, 0.90), (13, 0.50), (14, 0.72), (15, 0.86)):
                    s.hit('drums', SNARE, bar, six, v, **SN)
                continue
            _kit_bar(s, bar, kicks=kicks, ghosts=ghosts, hats=H8 if a else H8g, hat_v=0.42)
    for bar, v in ((13, 0.40), (23, 0.45), (29, 0.42), (33, 0.34), (37, 0.42)):
        s.hit('drums', 'crash', bar, 0, v, decay=1.1)


# ── bass: the slap riff (the hook stem) ────────────────────────────────────────────────────────────────────────────
SLAP = dict(bright=0.75, drive=0.35)   # per-note soft clip: the slap through its own compressor (as slap is played)


def _bass_cell(s: Song, bar: int, cell):
    for item in cell:
        six, pitch, dur, vel, art = item[:5]
        extra = dict(item[5]) if len(item) > 5 else {}
        if art == D:          # dead notes are a thud: no extra clip (it would carve kinks into the short burst)
            extra.setdefault('drive', 0.12)
        s.note('bass', 'slapx', bar, six, pitch, dur, vel, art=art, **{**SLAP, **extra})


def bass(s: Song):
    root_key = {'Gmaj7': 'G', 'A13': 'A', 'F#m7': 'F#', 'Bm7': 'B'}
    for bar in s.bars_of('hook'):
        i = (bar - (13 if bar <= 20 else 29)) + 1          # 1..8 within the hook
        c = CHORD[bar]
        if c == 'B7#9':
            cell = HOOK_BASS_B79 + (END_INTO_BREAK if bar == 20 else END_INTO_OUTRO)
        else:
            cell = list(HOOK_BASS[root_key[c]])
            if bar >= 29:
                cell += HOOK2_GHOSTS[root_key[c]]
            if bar == 32:        # hook 2, end of the first phrase: the pops run up instead of stepping down
                cell = [x for x in cell if x[0] < 12] + HOOK2_POP_RUN
        _bass_cell(s, bar, sorted(cell, key=lambda x: x[0]))
    for bar in s.bars_of('verse'):
        k = (bar - (5 if bar <= 12 else 23)) % 4             # 0..3 inside the Em9 Em9 A13 A13 vamp
        if bar == 12:
            cell = VERSE_WALK_INTO_HOOK
        elif bar == 27:
            cell = VERSE2_GROW
        elif bar == 28:
            cell = BUILD_WALK
        else:
            cell = [VERSE_BASS['E1'], VERSE_BASS['E2'], VERSE_BASS['A1'], VERSE_BASS['A2']][k]
            if k == 0 and bar not in (5, 23):                # slide up from the D2 that ended the last A13 bar
                cell = [(0, 'E2', 2, 1.00, T, {'from': 'D2', 'glide': 0.02})] + cell[1:]
        _bass_cell(s, bar, cell)
    for bar, cell in OUTRO_BASS.items():
        _bass_cell(s, bar, cell)


# ── keys: clav 16th comp everywhere keys play, organ pad in the hooks, a held organ chord in the break ────────────
CLAV_PATS = {   # 'C' accent chord, 'c' chord, 'm' muted chk, '.' rest — a 2-bar comp (A, B). The chord hits sit on
    # the off-16ths around the kit (never on the snare's 4/12 or the bed's 0/10), so the clav interlocks with the
    # drums instead of stacking on them.
    'intro': ('..C...c..C...c..', '...C..c....C...c'),
    'verse1': ('..C..mc..Cm..m.m', 'm..C..c.m..C.m.c'),   # (A bars: only a chk on 13, the kit's "e"-of-4 kick)
    'hook': ('.mC..C.m.C.m...c', '.c...C.m.m.C.m..'),     # interlocks with the riff's free 16ths
    'verse2': ('.mC..mc.mCm.mm.m', 'm.mC.mc.m.mC.m.c'),
}


def _clav_bar(s: Song, bar: int, pat: str, scale: float = 1.0, **kw):
    vo = clav_voicing(bar)
    for six, ch in enumerate(pat):
        if ch == 'C':      # staccato: the clav speaks and gets out of the backbeat's way
            s.chord('keys', 'clavx', bar, six, vo, 0.75, 0.80 * scale, strum_ms=4, decay=0.14, sustain=0.18, **kw)
        elif ch == 'c':
            s.chord('keys', 'clavx', bar, six, vo, 0.75, 0.66 * scale, strum_ms=4, decay=0.14, sustain=0.18, **kw)
        elif ch == 'm':
            s.chord('keys', 'clavx', bar, six, vo[:2], 0.4, 0.34 * scale, decay=0.03, sustain=0.0, **kw)


def keys(s: Song):
    for bar in range(1, s.bars + 1):
        if not s.plays('keys', bar):
            continue
        sec = s.section_at(bar)
        lab = sec.label or sec.name
        a = (bar - sec.start_bar) % 2 == 0
        if lab == 'intro':        # the clav's filter opens bar by bar (dark -> bright) as the intro builds
            _clav_bar(s, bar, CLAV_PATS['intro'][0 if a else 1], 0.85, env=1600.0 + 700.0 * (bar - 1))
        elif lab == 'verse1':
            _clav_bar(s, bar, CLAV_PATS['verse1'][0 if a else 1])
        elif lab == 'verse2':
            pat = CLAV_PATS['verse2'][0 if a else 1]
            if bar == 28:
                pat = '.mC.mC..mC.m.m..'      # the build: a dotted-8th ladder, then out of the roll's way
            _clav_bar(s, bar, pat, 0.78 if bar == 28 else 1.0)
        elif lab in ('hook1', 'hook2'):
            pat = CLAV_PATS['hook'][0 if a else 1]
            if bar in (20, 36):           # the keys leave before the break's freeze / the outro's first hit
                pat = pat[:12] + '....'
            _clav_bar(s, bar, pat, 0.92)
            # the organ breathes in a 32nd after the downbeat (off the kick/crash/riff stack), then holds the bar
            # (bar 20: it lets go on beat 4 so the plate tail is down before the stop-time break)
            s.chord('keys', 'organ', bar, 0.5, ORGAN[CHORD[bar]], 11.5 if bar == 20 else 15.0,
                    0.40 if lab == 'hook1' else 0.44, strum_ms=6, drawbars=(0, 6, 8, 5, 0, 3, 0, 0, 2), perc=0.18,
                    click=0.05)
    # (the break has no keys: the freeze is the horns' alone — bed + horns + fx)


# ── perc: conga trio (+ tambourine, shaker, cowbell as the energy rises) ───────────────────────────────────────────
CONGA_INTRO = [(0, 'low', 'open', 0.62), (6, 'mid', 'open', 0.55), (10, 'low', 'open', 0.58), (12, 'high', 'slap', 0.50),
               (14, 'mid', 'open', 0.50)]
# (the low open tone sits on the "a" of 3, one swung 16th after the bed's "&3" kick, so the two never stack)
# (the slap answers the snare a 16th late on beat 4: "a" of 4 = six 13)
CONGA_A = [(0, 'mid', 'mute', 0.42), (4, 'high', 'slap', 0.66), (6, 'mid', 'open', 0.58), (8, 'mid', 'mute', 0.38),
           (11, 'low', 'open', 0.64), (13, 'high', 'slap', 0.52), (14, 'mid', 'open', 0.58), (15, 'low', 'open', 0.52)]
CONGA_B = [(0, 'mid', 'mute', 0.42), (2, 'low', 'open', 0.56), (4, 'high', 'slap', 0.66), (7, 'mid', 'open', 0.56),
           (8, 'mid', 'mute', 0.38), (11, 'mid', 'open', 0.56), (13, 'high', 'slap', 0.52), (14, 'mid', 'open', 0.56)]


def _congas(s: Song, bar: int, hits):
    for six, size, stroke, v in hits:
        s.hit('perc', CONGA, bar, six, v, size=size, stroke=stroke, sat=0.4)


def perc(s: Song):
    for bar in range(1, s.bars + 1):
        if not s.plays('perc', bar):
            continue
        sec = s.section_at(bar)
        lab = sec.label or sec.name
        a = (bar - sec.start_bar) % 2 == 0
        if lab == 'intro':
            hits = list(CONGA_INTRO)
            if bar == 2:
                hits += [(3, 'mid', 'mute', 0.35), (8, 'mid', 'mute', 0.35)]
            if bar == 4:     # a conga pickup into the verse
                hits = [h for h in hits if h[0] < 12] + [(12, 'high', 'slap', 0.55), (13, 'high', 'slap', 0.45),
                                                         (14, 'mid', 'open', 0.60), (15, 'low', 'open', 0.66)]
            _congas(s, bar, sorted(hits))
            continue
        if bar == 28:        # the build: a 16th conga roll, high/mid alternating, crescendo
            for six in range(16):
                s.hit('perc', CONGA, bar, six, 0.30 + 0.25 * six / 15, size='high' if six % 2 == 0 else 'mid',
                      stroke='slap' if six % 4 == 0 else ('mute' if six == 15 else 'open'), sat=0.4)
        else:
            hits = CONGA_A if a else CONGA_B
            if bar in (13, 29):  # the hook's downbeat is the kit's and the riff's: the congas lay out on the 1
                hits = hits[1:]
            _congas(s, bar, hits)
        if lab in ('hook1', 'hook2'):
            s.pattern('perc', 'tamb', [bar], '....x.......x...', vel=0.34, decay=0.10)
        if lab in ('verse2', 'hook2'):
            s.pattern('perc', 'shaker', [bar], 'oxoxoxoxoxoxoxox', vel=0.44, ghost=0.26, length=0.05)
        if lab == 'hook2':
            s.pattern('perc', 'cowbell', [bar], '..x...x...x..x..', vel=0.44, decay=0.18)


# ── horns: 3-voice brass answers (hooks), the freeze (break), a hit on every outro downbeat ───────────────────────
BRASS = dict(voices=3, bright=0.75, attack=0.02, scoop=-30.0, vib=10.0)


def _horn(s: Song, bar: int, items):
    for it in items:
        six, pitches, dur, vel = it[:4]
        p = dict(BRASS)
        p.update(it[4] if len(it) > 4 else {})
        s.chord('horns', 'brass', bar, six, pitches, dur, vel, strum_ms=6, **p)


def horns(s: Song):
    for bar in s.bars_of('hook'):
        i = (bar - (13 if bar <= 20 else 29)) + 1
        items = HORN_HOOK[i]
        if bar >= 29:            # hook 2 (energy 4): the section leans in — brighter, a touch louder
            items = [(it[0], it[1], it[2], min(1.0, it[3] + 0.05), {**(it[4] if len(it) > 4 else {}), 'bright': 0.85})
                     for it in items]
        _horn(s, bar, items)
    for bar, items in HORN_BREAK.items():
        _horn(s, bar, items)
    for bar, items in HORN_VERSE2.items():
        _horn(s, bar, items)
    for bar, items in HORN_OUTRO.items():
        _horn(s, bar, items)


# ── lead: square-lead fills (verse 2, hooks), doubling the horn top line an octave up in 33-36 ────────────────────
def lead(s: Song):
    LP = dict(glide=0.04, vib=0.12)
    notes = []
    for bar, items in LEAD_VERSE2.items():
        notes += [(bar, six, p, d, v) for six, p, d, v in items]
    s.phrase('lead', 'square_lead', notes, **LP)
    for start, fills in ((13, LEAD_HOOK_FILLS), (29, LEAD_HOOK2_FILLS)):
        notes = []
        for i in range(1, 9):
            bar = start + i - 1
            if start == 29 and i >= 5:        # 33-36: double the horn top line an octave up, quieter
                for it in HORN_HOOK[i]:
                    six, pitches, dur, vel = it[:4]
                    notes.append((bar, six, midi(pitches[-1]) + 12, dur, 0.45 * vel / 0.9))
                continue
            notes += [(bar, six, p, d, v) for six, p, d, v in fills[i]]
        if start == 29:                       # the outro tag (37-40) rides the same phrase: same level reference
            for bar, items in LEAD_OUTRO.items():
                notes += [(bar, six, p, d, v) for six, p, d, v in items]
        s.phrase('lead', 'square_lead', notes, **LP)


# ── fx: air under every section, risers/impacts into the hooks, the break's scrubs, sweeps at phrase ends ──────────
def fx(s: Song):
    W = dict(lo=300.0, hi=1800.0, rate=0.08)
    for start, bars in ((1, 4), (5, 8), (13, 8), (21, 2), (23, 6), (29, 8), (37, 4)):
        s.fx('fx', 'wash', start, 0, bars * 16, 0.30, **W)
    s.fx_into('fx', 'reverse', 5, 0, 8, 0.60, pitches=[52, 55, 59, 62])          # intro -> verse
    s.fx('fx', 'sweep', 8, 8, 8, 0.40)
    s.fx('fx', 'sweep', 12, 8, 8, 0.45)
    for hook in (13, 29):   # the riser stops a 32nd before the downbeat (a breath before the drop), then the impact
        s.fx_into('fx', 'riser', hook - 1, 15.5, 31.5, 0.44, tone='E3')
        s.hit('fx', 'impact', hook, 0, 0.32, human=False, tune=46.0, decay=0.7)
    s.fx('fx', 'sweep', 16, 4, 8, 0.45)
    s.fx('fx', 'downsweep', 21, 0, 16, 0.60)
    for bar in (21, 22):
        s.fx('fx', 'scrub', bar, 8, 4, 0.60, pitch='E3', rate=6.0)
    s.fx_into('fx', 'reverse', 23, 0, 8, 0.60, pitches=[55, 61, 66, 71])         # break -> verse 2
    for bar in (24, 26):
        s.fx('fx', 'scrub', bar, 14, 2, 0.40, pitch='B3', rate=8.0)
    s.fx('fx', 'sweep', 32, 4, 8, 0.45)
    s.fx('fx', 'downsweep', 37, 1, 31, 0.45)       # starts a 16th after the outro's first hit
    s.fx_into('fx', 'reverse', 40, 0, 8, 0.55, pitches=[52, 55, 59, 62, 66])     # into the last hit
    s.hit('fx', 'impact', 40, 0, 0.30, human=False, tune=46.0, decay=0.9)


# ── mix ────────────────────────────────────────────────────────────────────────────────────────────────────────────
def G(db: float) -> tuple:
    """A broadband gain as an EQ band (a low shelf far above the audio band). fel_synth 1.0.0 declares
    StemMix.gain_db but process_stem never applies it, so the stem levels are set here instead."""
    return ('lowshelf', 1.0e6, float(db))


STEM_GAIN = {'bed': 0.5, 'drums': 3.5, 'bass': -1.0, 'keys': 1.0, 'perc': -2.5, 'horns': 0.0, 'lead': 1.5, 'fx': 10.0}


def mix(s: Song):
    g = STEM_GAIN
    s.mix['bed'] = StemMix(eq=[('hp', 32.0), G(g['bed'])], reverb=0.05, reverb_type='room', pan=0.0)
    s.mix['drums'] = StemMix(eq=[('hp', 35.0), ('peak', 5000.0, 1.0, 0.7), ('lp', 15000.0, 0.707, 4), G(g['drums'])],
                             reverb=0.10, reverb_type='room', pan=0.0)
    s.mix['bass'] = StemMix(eq=[('hp', 28.0), ('peak', 250.0, -1.5, 0.9), ('peak', 1100.0, 2.5, 0.8),
                                ('highshelf', 3000.0, 2.0), ('lp', 9000.0, 0.7), G(g['bass'])], drive=0.3, pan=0.0)
    s.mix['keys'] = StemMix(eq=[('hp', 180.0), ('lowshelf', 350.0, -2.0), G(g['keys'])], drive=0.15, reverb=0.18,
                            reverb_type='plate', pan=-0.3)
    s.mix['perc'] = StemMix(eq=[('hp', 120.0), ('lp', 15000.0, 0.707, 4), G(g['perc'])], reverb=0.15,
                            reverb_type='room', pan=0.35)
    s.mix['horns'] = StemMix(eq=[('hp', 160.0), ('peak', 2500.0, 1.5, 0.8), G(g['horns'])], reverb=0.18,
                             reverb_type='plate', pan=0.2)
    s.mix['lead'] = StemMix(eq=[('hp', 250.0), G(g['lead'])], reverb=0.14, reverb_type='plate', delay=0.12,
                            delay_16ths=3.0, pan=0.1)
    s.mix['fx'] = StemMix(eq=[('hp', 80.0), G(g['fx'])], reverb=0.30, reverb_type='hall', pan=-0.1, width=0.9)


# ── entry point: render, record the voices module in the provenance, validate ─────────────────────────────────────
def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=OUT_ROOT)
    ap.add_argument('--no-validate', action='store_true')
    a = ap.parse_args()
    song = build()
    F.render(song, a.out, __file__, profile='song', validate=False)
    out_dir = os.path.join(a.out, song.id)
    mp = os.path.join(out_dir, 'map.json')
    with open(mp) as fh:
        m = json.load(fh)
    for stem in ('bed', 'drums', 'perc'):     # chart-facing instrument names: kickx -> kick, congax -> conga
        vv = m['stems'][stem].get('voices', {})
        for src, dst in (('kickx', 'kick'), ('congax', 'conga')):
            if src in vv:
                merged = {(b, x): v for b, x, v in vv.get(dst, [])}
                for b, x, v in vv.pop(src):
                    merged[(b, x)] = max(v, merged.get((b, x), 0.0))
                vv[dst] = [[b, x, v] for (b, x), v in sorted(merged.items())]
        m['stems'][stem]['voices'] = dict(sorted(vv.items()))
    vpath = os.path.abspath(voices_cypher.__file__)
    m['provenance']['modules'] = {'voices_cypher.py': {'path': vpath, 'sha256': F.sha256_file(vpath)}}
    with open(mp, 'w') as fh:
        json.dump(m, fh, indent=1)
        fh.write('\n')
    if a.no_validate:
        return
    import validate as V
    verdict = V.validate_song(out_dir, profile='song')
    bad = [c for c in verdict['checks'] if not c['ok']]
    print(json.dumps({'ok': verdict['ok'], 'failed': bad, 'stats': verdict.get('stats')}, indent=1))
    sys.exit(0 if verdict['ok'] else 1)


if __name__ == '__main__':
    main()
