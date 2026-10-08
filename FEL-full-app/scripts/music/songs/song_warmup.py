#!/usr/bin/env python3
"""song_warmup.py — "Morning Boardwalk" (id `warmup`), FEL house song #1, difficulty 1.

Lo-fi boom-bap for the first minute of the morning on the boardwalk: dusty swung drums, a warm FM electric piano
that carries the hook, a soft two-part horn section, a triangle-flute counter-line and an ocean-air wash.
88 BPM, F major, swing 0.58, 36 bars (98.18 s), seed 0x5150, 28 taps/min, hook stem = keys.

    /Users/elijahbonds/.cache/fel-kokoro/.venv/bin/python songgen/song_warmup.py     # -> songs/warmup/ + validate

Arrangement (bar numbers are 1-based; e = energy):

    intro   1-4   e1  bed keys fx          dark EP comp alone, wordless "ooh" vox pad, air; bar 4 teases the hook head
    verse   5-12  e2  +drums bass perc     the groove arrives: lofi snare 2&4, swung shaker, walking pluck bass
    hook   13-20  e3  all                  EP hook melody over a lower comp, horn swells + punches, flute answers
    break  21-22  e2  bed horns fx         the band stops (the EP too): horns hit and hold a Bbmaj9 swell and fall
                                           (the freeze), downsweep in, reverse swell out
    verse  23-26  e2  +lead +horns         groove back, a wordless "ooh" (vox_lead) sings the hook head slowly over
                                           soft horn blooms; bar 26 builds (snare roll, bass pump, a horn crescendo,
                                           2-bar riser, the vox climbs into the hook)
    hook   27-34  e4  all                  the hook again, fuller: ghost snares + ghost hats, tamb, crash, bass ghosts,
                                           harmony under the melody's long notes, 3-voice horns, busier flute, "aah" pad
    outro  35-36  e1  bed keys horns lead fx   EP Fmaj9 with the hook head resolved home, horns hold the chord, the
                                           flute walks home to F, vox pad, the last kick rings

IP check (hard rule). Everything is synthesised by fel_synth (numpy oscillators, FM, filtered noise); no samples,
no loops, no audio files are read. The chord progressions are the spec's (ii-V-I-vi verse, IV-iii-ii-V hook); the
melodies, counter-lines, horn parts and basslines were written for this song from those chords:
  - hook melody: a turn figure (D-C-D) that leaps to the 3rd above (F), answered by an arpeggio (A-C-E) and a
    sequence that climbs one step per phrase (F, G, then A at the peak) before landing on F over the sus4 chord.
    Sung against the tunes we know it matches none of them; its rhythm (3+1+2+4+2+4 sixteenths) is ours.
  - flute counter-line: a three-note rising answer (x-y-ZZ) sequenced down a step, then a four-note descent.
  - bass: root / fifth / approach-note walks with chromatic turns (A-Bb-A-Ab-G), octave pops in the hooks.
  - drums: boom-bap built from the spec rules (kick on 1 in the bed; the drums answer on the 3-and in the verse and
    on the 2-and + 3-and in the hooks, snare 2&4),
    not a copy of any recorded break (no Amen / Funky Drummer / Impeach / Think / Apache pattern).
  - no words anywhere: `vox` and `vox_lead` are wordless formant vowels ("ooh"/"aah").

Mix notes (no master compression; the stems sum to the mix):
  - stem faders ride in each stem's EQ as a flat low+high shelf pair (see `fader`): fel_synth 1.0.0 declares
    StemMix.gain_db but never applies it.
  - peak-to-loudness is managed in the arrangement, not on the bus: the hook comp is pushed onto the previous bar's
    "and of 4" so hook downbeats are kick + bass + melody only; the flute's long notes float in on six 2; horn swells
    bloom (attack 0.4 s); bass roots are quarters and duck under every kick; drums / keys / perc / bass run through
    per-stem tape drive (0.2 / 0.4 / 0.35 / 0.3) and the drums are low-passed at 7 kHz (dusty, and it keeps the MP3
    encode from overshooting). Result: shared peak guard ~2.5 dB, no post-encode trim needed at -14 LUFS.
  - drums drive is 0.2, not more: with the 3-and kick in the drums (it shares six 10 with an off-beat hat), drive
    >= 0.3 lets the kick's swing gate the hat's noise through the tanh, and validate.py's click detector trips on it
    (drive 0.3: one flag in the lossless render; 0.2: clean, still clean at click_dominance 2.2).
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fel_synth import Song, Section, StemMix, voicing, midi, main  # noqa: E402

ID = 'warmup'
SEED = 0x5150
BARS = 36
ALL = ('bed', 'drums', 'bass', 'keys', 'perc', 'horns', 'lead', 'fx')

SECTIONS = [
    Section('intro', 1, 4, 1, ('bed', 'keys', 'fx')),
    Section('verse', 5, 8, 2, ('bed', 'drums', 'bass', 'keys', 'perc', 'fx')),
    Section('hook', 13, 8, 3, ALL),
    Section('break', 21, 2, 2, ('bed', 'horns', 'fx')),
    Section('verse', 23, 4, 2, ('bed', 'drums', 'bass', 'keys', 'perc', 'horns', 'lead', 'fx')),
    Section('hook', 27, 8, 4, ALL),
    Section('outro', 35, 2, 1, ('bed', 'keys', 'horns', 'lead', 'fx')),
]
# (critic pass, 2026-09-25) Two deviations from the SONGS.md rows, both for the game:
#  - verse 2 lists horns and the outro lists horns + lead: with the spec rows alone the horns sounded in 18/36 bars and
#    the lead in 20/36, so a dancer who earned them heard nothing for half the song. Now horns 24/36, lead 22/36 (the
#    critic bar: every earned stem audible on its own in >= 60 % of the bars).
#  - the break drops the EP (SONGS.md rule 8: bed + the horns' freeze + fx carrying the transition): with the EP chord
#    and pickup lick the freeze bars had three earned stems over the bed; the critic bar is at most two.

VERSE = ['Gm9', 'C13', 'Fmaj9', 'Dm9']          # ii - V - I - vi
HOOK = ['Bbmaj9', 'Am7', 'Gm9', 'C9sus4']       # IV - iii - ii - V
PROGRESSION = {'intro': VERSE, 'verse': VERSE, 'hook': HOOK, 'break': ['Bbmaj9', 'Bbmaj9'],
               'outro': ['Fmaj9', 'Fmaj9']}
HOOK_BARS = (13, 27)


def chord_of(bar: int) -> str:
    if bar <= 12:
        return VERSE[(bar - 1) % 4]
    if bar <= 20:
        return HOOK[(bar - 13) % 4]
    if bar <= 22:
        return 'Bbmaj9'
    if bar <= 26:
        return VERSE[(bar - 23) % 4]
    if bar <= 34:
        return HOOK[(bar - 27) % 4]
    return 'Fmaj9'


def section(s: Song, bar: int) -> Section:
    return s.section_at(bar)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# bed: kick + hat only (the always-on floor). Kick on 1 everywhere (SONGS.md rule 2 and the warmup row: the bed is
# `x...............`, a steady pulse for the easiest song; the "and of 3" kick lives in the drums); quarter hats with a
# lilt (downbeats a touch louder).
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BED_KICK = dict(tune=50.0, decay=0.35, click=0.2)
BED_HAT = dict(decay=0.03, tone=0.3)


def bed(s: Song) -> None:
    for bar in range(1, BARS + 1):
        name = section(s, bar).name
        if bar == BARS:                                     # the last bar: one kick on 1 that rings, hats to six 8
            s.hit('bed', 'kick', bar, 0, 0.9, **dict(BED_KICK, decay=0.6))
            for six, v in ((0, 0.4), (4, 0.3), (8, 0.24)):
                s.hit('bed', 'hat', bar, six, v, **BED_HAT)
            continue
        if name == 'break' and bar == 22:                  # the freeze: bar 22 keeps the hats only
            pass
        else:
            s.hit('bed', 'kick', bar, 0, 0.9, **BED_KICK)
        s.pattern('bed', 'hat', [bar], '4...3...4...3...', **BED_HAT)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# drums: the rest of the kit — lofi snare 2&4, off-beat hats, the 3-and kick (+ the 2-and in hooks), fills into every
# section change.
# Never repeats a bed hit (bed = kick 0, hat 0 4 8 12).
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

SNARE = dict(tune=200.0, lofi=0.6, decay=0.19)
DHAT = dict(decay=0.035, tone=0.25)
DKICK = dict(tune=50.0, decay=0.3, click=0.16)


def drums(s: Song) -> None:
    for bar in range(1, BARS + 1):
        sec = section(s, bar)
        if 'drums' not in sec.stems:
            continue
        rel = bar - sec.start_bar                    # bar within the section
        hook2 = sec.name == 'hook' and sec.start_bar == 27
        last = bar == sec.end_bar
        # snare backbeat (fills replace beat 4 in the last bar of a section)
        s.hit('drums', 'snare', bar, 4, 0.72, **SNARE)
        if bar == 26:                                # the build: a 16th snare roll into the last hook
            for i, six in enumerate(range(8, 16)):
                s.hit('drums', 'snare', bar, six, 0.34 + 0.064 * i, **SNARE)
        elif last and bar in (12, 20, 34):
            s.hit('drums', 'snare', bar, 12, 0.9, **SNARE)
            if bar == 12:                            # into hook 1: da-da-da
                s.hit('drums', 'snare', bar, 13, 0.36, **SNARE)
                s.hit('drums', 'snare', bar, 14, 0.62, **SNARE)
                s.hit('drums', 'snare', bar, 15, 0.76, **SNARE)
            elif bar == 20:                          # into the break: two hard hits, then the band stops
                s.hit('drums', 'snare', bar, 14, 0.7, **SNARE)
                s.hit('drums', 'snare', bar, 15, 0.84, **SNARE)
            else:                                    # into the outro: a falling tom run
                s.hit('drums', 'tom', bar, 13, 0.6, size='high', decay=0.18)
                s.hit('drums', 'tom', bar, 14, 0.7, size='mid', decay=0.18)
                s.hit('drums', 'tom', bar, 15, 0.8, size='low', decay=0.2)
        else:
            s.hit('drums', 'snare', bar, 12, 0.72, **SNARE)
            if rel % 4 == 3 and sec.name == 'verse':
                s.hit('drums', 'snare', bar, 15, 0.3, **SNARE)     # pickup ghost into the next phrase
        if hook2 and not last:
            s.pattern('drums', 'snare', [bar], '.......o.......o', ghost=0.24, **SNARE)

        # kicks after the bed's 1 (SONGS.md warmup row: verse `..........x.....`, hook `......x...x.....`): the verse
        # answers on the "and of 3" (+ a soft 4-and push every other bar), the hook adds the "and of 2"
        if sec.name == 'verse':
            s.hit('drums', 'kick', bar, 10, 0.62, **DKICK)
            if rel % 2 == 1:
                s.hit('drums', 'kick', bar, 14, 0.5, **DKICK)
        else:                                        # (no push kick before the break / the outro: it would bleed)
            push = rel % 2 == 1 and not (last and bar in (20, 34))
            s.hit('drums', 'kick', bar, 6, 0.56, **DKICK)
            s.hit('drums', 'kick', bar, 10, 0.64, **DKICK)
            if push:
                s.hit('drums', 'kick', bar, 15, 0.5, **DKICK)

        # hats: off-beat 8ths; ghost 16ths in hook 2; openhat on six 14 every 4th bar; cut before fills
        if bar == 26:
            steps = '..x...x.........'
        elif last and bar in (12, 20, 34):
            steps = '..x...x...x.....'
        elif hook2:
            steps = '..xg..xg..xg..xg'
        else:
            steps = '..x...x...x...x.'
        if rel % 4 == 3 and not last and steps[14] == 'x':
            steps = steps[:14] + '.' + steps[15:]
            s.hit('drums', 'openhat', bar, 14, 0.5, decay=0.26, tone=0.3)
        s.pattern('drums', 'hat', [bar], steps, vel=0.5, ghost=0.3, **DHAT)
    s.hit('drums', 'crash', 13, 0, 0.5)
    s.hit('drums', 'crash', 27, 0, 0.58)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# bass: warm pluck bass, roots F1..E2: root (six 0, a quarter so it clears the snare), fifth (six 10), approach note
# (six 14) into the next root. Hooks add the octave pop on the swung six 7; hook 2 adds ghost roots on six 3 and a
# 12-pop. Sidechain-ducked by every kick (mix).
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BASS = dict(shape='warm', cutoff=160.0, env=520.0, fdecay=0.12, q=0.8, sub=0.4)

# (root, fifth, approach) per chord — the approach walks into the NEXT bar's root
VERSE_BASS = {
    'Gm9': ('G1', 'D2', 'Bb1'),     # -> C2 (step up)
    'C13': ('C2', 'G1', 'E1'),      # -> F1 (leading tone)
    'Fmaj9': ('F1', 'C2', 'C#2'),   # -> D2 (chromatic)
    'Dm9': ('D2', 'A1', 'Ab1'),     # -> G1 (chromatic)
}
HOOK_BASS = {
    'Bbmaj9': ('Bb1', 'F1', 'G#1'),  # -> A1
    'Am7': ('A1', 'E2', 'Ab1'),      # -> G1
    'Gm9': ('G1', 'D2', 'B1'),       # -> C2
    'C9sus4': ('C2', 'G1', 'A1'),    # -> Bb1
}


def bass(s: Song) -> None:
    for bar in range(1, BARS + 1):
        sec = section(s, bar)
        if 'bass' not in sec.stems:
            continue
        ch = chord_of(bar)
        rel = bar - sec.start_bar
        n = lambda six, p, d, v: s.note('bass', 'pluck_bass', bar, six, p, d, v, **BASS)
        if sec.name == 'verse':
            root, fifth, appr = VERSE_BASS[ch]
            if bar == 26:                                    # the build: an 8th-note pump up Dm7 into the hook
                for six, p, d, v in ((0, 'D2', 2, 0.9), (2, 'D2', 1, 0.5), (4, 'F2', 2, 0.72), (6, 'D2', 1, 0.5),
                                     (8, 'A2', 2, 0.76), (10, 'D2', 1, 0.52), (12, 'C3', 2, 0.8), (14, 'A1', 2, 0.82)):
                    n(six, p, d, v)
                continue
            n(0, root, 4, 0.9)                               # a quarter: out of the snare's way
            if ch == 'Dm9' and rel % 4 == 3 and bar == 8:    # mid-verse turn: A-Bb-A-Ab -> G
                n(10, 'A1', 2, 0.74)
                n(12, 'Bb1', 1, 0.55)
                n(13, 'A1', 1, 0.5)
                n(14, 'Ab1', 2, 0.66)
                continue
            n(10, fifth, 2, 0.75)
            if bar == 12:                                    # into the hook: C2 steps down to Bb1
                n(14, 'C2', 2, 0.68)
            else:
                n(14, appr, 2, 0.65)
        else:                                                # hook
            root, fifth, appr = HOOK_BASS[ch]
            hook2 = sec.start_bar == 27
            r = midi(root)
            n(0, root, 4, 0.9)                               # a quarter: out of the snare's way
            n(7, r + 12, 1, 0.52)
            if hook2 and rel % 2 == 0:
                n(3, root, 1, 0.34)                          # a dead-note ghost
            n(10, fifth, 4 if bar == 34 else 2, 0.75)
            if hook2 and rel % 2 == 1 and bar != 34:
                n(12, midi(fifth) + 12, 1, 0.45)
            if bar == 34:
                pass                                         # G1 rings under the tom run; the outro drops the bass
            elif bar == 20:
                n(14, 'A1', 1, 0.62)                         # the band stops under the freeze
            else:
                n(14, appr, 2, 0.65)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# keys (the hook stem): FM EP comp with tremolo + the hook melody an octave above the comp.
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

EP = dict(bright=0.28, decay=1.6, tine=0.15)
EP_DARK = dict(bright=0.2, decay=1.8, tine=0.1)
EP_MEL = dict(bright=0.5, decay=2.0, tine=0.24)

# hook melody: (bar within the hook 0..7, sixteenth, pitch, dur16, vel)
_HEAD = [(0, 'D5', 3, 0.8), (3, 'C5', 1, 0.6), (4, 'D5', 2, 0.64)]
HOOK_MELODY = (
    [(0, *x) for x in _HEAD] + [(0, 6, 'F5', 4, 0.84), (0, 10, 'E5', 2, 0.64), (0, 12, 'C5', 4, 0.68)] +
    [(1, 2, 'A4', 2, 0.7), (1, 4, 'C5', 2, 0.74), (1, 6, 'E5', 6, 0.86), (1, 14, 'D5', 2, 0.64)] +
    [(2, *x) for x in _HEAD] + [(2, 6, 'F5', 2, 0.78), (2, 8, 'G5', 4, 0.88), (2, 12, 'F5', 2, 0.64),
                                (2, 14, 'D5', 2, 0.66)] +
    [(3, 0, 'C5', 8, 0.8)] +
    [(4, *x) for x in _HEAD] + [(4, 6, 'F5', 4, 0.84), (4, 10, 'E5', 2, 0.64), (4, 12, 'C5', 4, 0.68)] +
    [(5, 2, 'A4', 2, 0.7), (5, 4, 'C5', 2, 0.74), (5, 6, 'E5', 6, 0.86), (5, 14, 'D5', 2, 0.64)] +
    [(6, *x) for x in _HEAD] + [(6, 6, 'F5', 2, 0.8), (6, 8, 'A5', 4, 0.92), (6, 12, 'G5', 2, 0.66),
                                (6, 14, 'F5', 2, 0.68)] +
    [(7, 0, 'G5', 2, 0.78), (7, 2, 'F5', 2, 0.72), (7, 4, 'D5', 2, 0.72), (7, 6, 'F5', 8, 0.88)]
)
# hook 2: a soft diatonic third under the melody's long notes (bars 4..7 of the hook)
F_MAJOR = [0, 2, 4, 5, 7, 9, 11]


def third_below(m: float) -> float:
    m = int(m)
    for d in (3, 4):
        if (m - d - 5) % 12 in F_MAJOR:
            return float(m - d)
    return float(m - 3)


def keys(s: Song) -> None:
    prev = None
    for bar in range(1, BARS + 1):
        sec = section(s, bar)
        ch = chord_of(bar)
        rel = bar - sec.start_bar
        name = sec.name
        if name == 'intro':
            v = voicing(ch, 63, rootless=True, prev=prev)
            s.chord('keys', 'ep', bar, 0, v, 12, 0.56, strum_ms=34, **EP_DARK)
            if bar < 4:
                s.note('keys', 'ep', bar, 10, v[-2], 2, 0.34, **EP_DARK)
                s.note('keys', 'ep', bar, 12, v[-1], 4, 0.4, **EP_DARK)
            else:                                           # bar 4 teases the hook head over Dm9
                for six, p, d, vel in ((6, 'D5', 1, 0.5), (7, 'C5', 1, 0.4), (8, 'D5', 2, 0.48), (10, 'F5', 6, 0.56)):
                    s.note('keys', 'ep', bar, six, p, d, vel, **EP_DARK)
            prev = v
        elif name == 'verse':
            v = voicing(ch, 64, rootless=True, prev=prev)
            second = sec.start_bar == 23
            s.chord('keys', 'ep', bar, 0, v, 7, 0.58, strum_ms=24, **EP)
            into_hook = bar in (12, 26)                     # the hook's first chord is pushed onto this bar's 14
            if bar == 26:                                   # build: 8th-note pushes that climb
                for six, vel in ((6, 0.34), (8, 0.38), (10, 0.42), (12, 0.46)):
                    s.chord('keys', 'ep', bar, six, v, 1.5, vel, strum_ms=14, **EP)
            elif rel % 2 == 1 or second:
                s.chord('keys', 'ep', bar, 7, v, 2, 0.4, strum_ms=14, **EP)
                s.chord('keys', 'ep', bar, 10, v, 4 if into_hook else 5, 0.5, strum_ms=18, **EP)
            else:
                s.chord('keys', 'ep', bar, 10, v, 4 if into_hook else 5, 0.5, strum_ms=18, **EP)
            prev = v
        elif name == 'hook':
            # push comping: each hook chord lands on the previous bar's "and of 4" (six 14), tied over the barline,
            # so the downbeat belongs to the kick, the bass and the melody (and the melody's pickups get harmonised)
            v = voicing(ch, 60, rootless=True, prev=prev)
            s.chord('keys', 'ep', bar - 1, 14, v, 8, 0.38, strum_ms=26, **EP)
            s.chord('keys', 'ep', bar, 10, v, 5 if bar == sec.end_bar else 4, 0.3, strum_ms=18, **EP)
            prev = v
        elif name == 'break':                               # the EP sits the freeze out (the horns hold the chord);
            prev = voicing('Bbmaj9', 62, rootless=True, prev=prev)   # voice-lead verse 2 as if it had played
        else:                                               # outro: Fmaj9, the hook head resolved home, ring out
            v = voicing('Fmaj9', 62, rootless=True, prev=prev)
            if bar == 35:
                s.chord('keys', 'ep', bar, 0, v, 8, 0.56, strum_ms=26, **EP)
                for six, p, d, vel in ((6, 'D5', 1, 0.52), (7, 'C5', 1, 0.44), (8, 'D5', 2, 0.52), (10, 'F5', 6, 0.62)):
                    s.note('keys', 'ep', bar, six, p, d, vel, **EP_MEL)
            else:
                s.chord('keys', 'ep', bar, 0, sorted(v + [midi('F3'), midi('A5')]), 11, 0.6, strum_ms=45, **EP)
            prev = v
    # the hook melody over both hooks
    for hb in HOOK_BARS:
        for (rb, six, p, d, vel) in HOOK_MELODY:
            s.note('keys', 'ep', hb + rb, six, p, d, vel, **EP_MEL)
            if hb == 27 and rb >= 4 and d >= 4:
                s.note('keys', 'ep', hb + rb, six, third_below(midi(p)), d, vel * 0.55, **EP_MEL)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# perc: swung 16th shaker + a rim figure (2-bar: 3 9 14 | 6 14); tambourine on the backbeat in hook 2.
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def perc(s: Song) -> None:
    for bar in range(1, BARS + 1):
        sec = section(s, bar)
        if 'perc' not in sec.stems:
            continue
        rel = bar - sec.start_bar
        hook = sec.name == 'hook'
        hook2 = hook and sec.start_bar == 27
        if bar == 26:                                   # build: the shaker swells through the bar
            for six in range(16):
                s.hit('perc', 'shaker', bar, six, (0.22 if six % 2 == 0 else 0.34) + 0.012 * six, length=0.06)
        else:
            s.pattern('perc', 'shaker', [bar], 'oxoxoxoxoxoxoxox', vel=0.48 if hook else 0.42,
                      ghost=0.26 if hook else 0.22, length=0.06)
        if rel % 2 == 0:
            for six, v in ((3, 0.36), (9, 0.46), (14, 0.5)):
                s.hit('perc', 'rim', bar, six, v)
        else:
            for six, v in ((6, 0.48), (14, 0.4)):
                s.hit('perc', 'rim', bar, six, v)
        if hook2:
            s.pattern('perc', 'tamb', [bar], '....x.......x...', vel=0.34, decay=0.1)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# horns: soft 2-voice brass. Hook: odd bars swell (dur 8), even bars punch with the melody (six 4 + 6).
# Break: the freeze — a Bbmaj9 hit + held swell with a fall. Verse 2: pad blooms under the "ooh" and a crescendo
# into hook 2. Outro: the home chord (Fmaj9) held with the EP.
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BRASS = dict(voices=2, bright=0.3, attack=0.06, vib=10.0, scoop=-20.0)


def horns(s: Song) -> None:
    horn_prev = None
    for bar in range(1, BARS + 1):
        sec = section(s, bar)
        if 'horns' not in sec.stems:
            continue
        ch = chord_of(bar)
        rel = bar - sec.start_bar
        if sec.name == 'break':
            if bar == 21:
                v = voicing('Bbmaj9', 67, n=4, rootless=True)
                s.chord('horns', 'brass', bar, 0, v, 2, 0.78, strum_ms=8, **dict(BRASS, bright=0.55, attack=0.012))
                s.chord('horns', 'brass', bar, 0, v, 28, 0.66, strum_ms=8,
                        **dict(BRASS, attack=0.45, fall=2, vib=14.0, sustain=0.9))
            continue
        if sec.name == 'verse':                             # verse 2: soft pads that bloom under the "ooh"
            v = voicing(ch, 67, n=3, rootless=True, prev=horn_prev)
            horn_prev = v
            if bar == 26:                                   # the build: one long crescendo into hook 2
                s.chord('horns', 'brass', bar, 0, v, 14, 0.46, strum_ms=10,
                        **dict(BRASS, attack=1.6, sustain=1.0, vib=12.0))
            else:                                           # off the vox's downbeat, a bar-long bloom
                s.chord('horns', 'brass', bar, 4, v, 10, 0.4, strum_ms=10, **dict(BRASS, attack=0.5, sustain=0.9))
            continue
        if sec.name == 'outro':                             # the horns hold the home chord with the EP
            v = voicing('Fmaj9', 67, n=3, rootless=True)
            if bar == 35:
                s.chord('horns', 'brass', bar, 0, v, 14, 0.42, strum_ms=12, **dict(BRASS, attack=0.6, sustain=0.9))
            else:                                           # the last chord: on 1, rings out (nothing after 36.8)
                s.chord('horns', 'brass', bar, 0, v, 8, 0.4, strum_ms=12,
                        **dict(BRASS, attack=0.25, sustain=0.85, release=0.3))
            continue
        hook2 = sec.start_bar == 27
        b = dict(BRASS, voices=3, bright=0.38) if hook2 else BRASS
        v = voicing(ch, 67, n=3, rootless=True)
        if rel % 2 == 0:
            s.chord('horns', 'brass', bar, 0, v, 8, 0.56 if not hook2 else 0.6, strum_ms=10,
                    **dict(b, attack=0.4))                  # a real swell: it blooms after the downbeat
            if hook2:
                nxt = voicing(chord_of(bar + 1), 67, n=3, rootless=True)
                s.chord('horns', 'brass', bar, 14, nxt, 1, 0.5, strum_ms=5, **b)
        else:
            s.chord('horns', 'brass', bar, 4, v, 1, 0.56, strum_ms=5, **b)
            if bar == 34:                                   # the last punch falls off into the outro
                s.chord('horns', 'brass', bar, 6, v, 4, 0.66, strum_ms=6, **dict(b, fall=3))
            else:
                s.chord('horns', 'brass', bar, 6, v, 3, 0.64, strum_ms=6, **b)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# lead: hooks = a soft triangle "flute" counter-line (odd bars one long chord tone, even bars the answer);
# verse 2 = a wordless "ooh" (vox_lead) that sings the hook head slowly and climbs into hook 2; outro = the flute's
# last word (a long A5, then C6-A5-F5 home).
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

# (bar within the hook, sixteenth, pitch, dur16, vel)
FLUTE_1 = [
    (0, 2, 'A5', 6, 0.42),
    (1, 9, 'G5', 1, 0.52), (1, 10, 'A5', 2, 0.58), (1, 12, 'C6', 4, 0.64),
    (2, 2, 'Bb5', 6, 0.42),
    (3, 9, 'F5', 1, 0.52), (3, 10, 'G5', 2, 0.58), (3, 12, 'Bb5', 4, 0.64),
    (4, 2, 'A5', 6, 0.42),
    (5, 9, 'G5', 1, 0.52), (5, 10, 'A5', 2, 0.58), (5, 12, 'C6', 4, 0.64),
    (6, 2, 'Bb5', 4, 0.42),
    (7, 8, 'D6', 2, 0.6), (7, 10, 'C6', 2, 0.58), (7, 12, 'Bb5', 2, 0.56), (7, 14, 'A5', 2, 0.54),
]
FLUTE_2 = [
    (0, 2, 'A5', 5, 0.46), (0, 14, 'F5', 2, 0.46),
    (1, 0, 'E5', 2, 0.44), (1, 9, 'G5', 1, 0.56), (1, 10, 'A5', 2, 0.62), (1, 12, 'C6', 3, 0.68), (1, 15, 'D6', 1, 0.5),
    (2, 2, 'Bb5', 5, 0.46), (2, 14, 'G5', 2, 0.46),
    (3, 0, 'F5', 2, 0.44), (3, 9, 'F5', 1, 0.56), (3, 10, 'G5', 2, 0.62), (3, 12, 'Bb5', 3, 0.68), (3, 15, 'C6', 1, 0.5),
    (4, 2, 'A5', 5, 0.46), (4, 14, 'F5', 2, 0.46),
    (5, 0, 'E5', 2, 0.44), (5, 9, 'G5', 1, 0.56), (5, 10, 'A5', 2, 0.62), (5, 12, 'C6', 3, 0.68), (5, 15, 'E6', 1, 0.5),
    (6, 2, 'D6', 2, 0.5), (6, 4, 'C6', 3, 0.46),
    (7, 8, 'D6', 2, 0.64), (7, 10, 'C6', 2, 0.62), (7, 12, 'Bb5', 2, 0.6), (7, 14, 'A5', 2, 0.56),
]
# verse 2 wordless "ooh": the hook head sung slowly, then the climb into hook 2
VOX_LINE = [
    (23, 0, 'D5', 6, 0.56), (23, 6, 'C5', 2, 0.48), (23, 8, 'D5', 8, 0.56),
    (24, 0, 'E5', 10, 0.58), (24, 12, 'D5', 4, 0.5),
    (25, 0, 'C5', 8, 0.56), (25, 8, 'A4', 8, 0.5),
    (26, 0, 'A4', 4, 0.52), (26, 4, 'C5', 4, 0.56), (26, 8, 'D5', 4, 0.6), (26, 12, 'F5', 4, 0.66),
]
FLUTE = dict(glide=0.05, vib=0.16)


def lead(s: Song) -> None:
    for hb, line in ((13, FLUTE_1), (27, FLUTE_2)):
        # the odd-bar long notes float in on six 2 with a slow swell (off the downbeat pile-up); the answers are
        # one phrase per two bars so legato notes glide and the rests breathe
        swell = [x for x in line if x[0] % 2 == 0 and x[1] == 2]
        for (rb, six, p, d, v) in swell:
            s.phrase('lead', 'soft_lead', [(hb + rb, six, p, d, v)], **dict(FLUTE, attack=0.14))
        for pair in range(4):
            notes = [(hb + rb, six, p, d, v) for (rb, six, p, d, v) in line if rb // 2 == pair
                     and (rb, six, p, d, v) not in swell]
            if notes:
                s.phrase('lead', 'soft_lead', notes, **FLUTE)
    s.phrase('lead', 'vox_lead', VOX_LINE, vowel='o', glide=0.09, attack=0.08)
    # outro: the flute floats a long 3rd over the EP's resolved hook head, then walks down the home triad to F
    s.phrase('lead', 'soft_lead', [(35, 2, 'A5', 6, 0.4)], **dict(FLUTE, attack=0.14))
    s.phrase('lead', 'soft_lead', [(35, 12, 'C6', 2, 0.44), (35, 14, 'A5', 2, 0.42), (36, 0, 'F5', 8, 0.46)],
             **FLUTE)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# fx: ocean-air wash under everything; wordless vox pads (intro "ooh", the second half of verse 1 and of hook 1,
# all of hook 2 "aah", outro "ooh"); risers + impacts into the hooks; reverse swells into the verse downbeats; a
# mid-hook whoosh; a downsweep into the freeze; a whoosh into the outro.
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

WASH = dict(lo=400.0, hi=2500.0, rate=0.08)


def fx(s: Song) -> None:
    for bar, d in ((1, 64), (5, 64), (9, 64), (13, 64), (17, 64), (21, 32), (23, 64), (27, 64), (31, 64), (35, 26)):
        # (0.5, was 0.44: the wash-only fx bars sat at -40.2 dBFS alone; now every fx bar is above -40)
        s.fx('fx', 'wash', bar, 0, d, 0.36 if bar in (1, 21, 35) else 0.5, **WASH)
    prev = None
    for bar in (1, 2, 3, 4):
        v = voicing(chord_of(bar), 60, n=3, prev=prev)
        s.chord('fx', 'vox', bar, 0, v, 16, 0.5, vowels=('u', 'o'), attack=0.5, release=0.7)
        prev = v
    for bars, center, vel, vw in (((9, 10, 11, 12), 67, 0.3, ('u', 'o')),      # verse 1: an "ooh" joins
                                  ((17, 18, 19, 20), 65, 0.32, ('o', 'a')),     # hook 1, second half
                                  ((27, 28, 29, 30), 65, 0.34, ('o', 'a')),     # hook 2: "aah" all the way
                                  ((31, 32, 33, 34), 65, 0.4, ('o', 'a'))):
        prev = None
        for bar in bars:
            v = voicing(chord_of(bar), center, n=3, prev=prev)
            s.chord('fx', 'vox', bar, 0, v, 16, vel, vowels=vw, attack=0.35, release=0.6)
            prev = v
    s.chord('fx', 'vox', 35, 0, voicing('Fmaj9', 62, n=3), 16, 0.46, vowels=('u', 'o'), attack=0.4, release=0.6)
    s.chord('fx', 'vox', 36, 0, voicing('Fmaj9', 62, n=3), 5, 0.4, vowels=('o', 'u'), attack=0.2, release=0.45)

    s.fx_into('fx', 'reverse', 9, 0, 6, 0.42, pitches=[58, 62, 65, 69])         # verse 1, second phrase
    s.fx('fx', 'sweep', 16, 8, 8, 0.36, lo=600.0, hi=5000.0)                    # hook 1, mid-hook whoosh
    s.fx('fx', 'sweep', 30, 8, 8, 0.4, lo=600.0, hi=5000.0)                     # hook 2, mid-hook whoosh
    s.fx_into('fx', 'reverse', 5, 0, 8, 0.5, pitches=[58, 62, 65, 69])          # the groove arrives
    s.fx_into('fx', 'riser', 13, 0, 16, 0.6, hi=7000.0)                         # into hook 1 (one bar)
    s.hit('fx', 'impact', 13, 0, 0.42, decay=0.9)
    s.fx('fx', 'downsweep', 21, 0, 32, 0.56, hi=6000.0, lo=180.0)               # into the freeze
    s.fx_into('fx', 'reverse', 23, 0, 8, 0.62, pitches=[58, 62, 65, 69])       # out of the break
    s.fx_into('fx', 'riser', 27, 0, 32, 0.7, tone='F3', hi=8000.0)              # the build (two bars)
    s.hit('fx', 'impact', 27, 0, 0.45, decay=1.0)
    s.fx('fx', 'sweep', 34, 8, 8, 0.42, lo=500.0, hi=5000.0)                    # whoosh into the outro


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# mix
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def fader(gain_db: float) -> list:
    """A flat stem gain as an EQ pair (low shelf + high shelf at the same corner multiply to exactly gain_db at every
    frequency). fel_synth 1.0.0 declares StemMix.gain_db but process_stem never applies it, so the faders ride in the
    EQ list (applied after drive, before the reverb/delay sends: a pre-send fader). gain_db stays 0 so a later library
    fix cannot double them."""
    return [('lowshelf', 1000.0, gain_db), ('highshelf', 1000.0, gain_db)]


FADERS = {'bed': -0.5, 'drums': 0.0, 'bass': -3.0, 'keys': 2.5, 'perc': 1.0, 'horns': 4.0, 'lead': 4.5, 'fx': 2.0}


def mix(s: Song) -> None:
    F = FADERS
    s.mix['bed'] = StemMix(eq=[('hp', 32.0), ('lp', 11000.0)] + fader(F['bed']), reverb=0.05, reverb_type='room')
    s.mix['drums'] = StemMix(eq=[('hp', 32.0), ('lp', 7000.0)] + fader(F['drums']), drive=0.2, reverb=0.1,
                             reverb_type='room')
    s.mix['bass'] = StemMix(eq=[('hp', 30.0), ('lp', 4000.0, 0.7)] + fader(F['bass']), drive=0.3, duck=0.45,
                            duck_release=0.11)
    s.mix['keys'] = StemMix(eq=[('hp', 120.0), ('lowshelf', 300.0, -2.0), ('lp', 6000.0)] + fader(F['keys']),
                            drive=0.4, reverb=0.22, reverb_type='plate', tremolo=(4.8, 0.18), pan=-0.25)
    s.mix['perc'] = StemMix(eq=[('hp', 180.0)] + fader(F['perc']), drive=0.35, reverb=0.16, reverb_type='room',
                            pan=0.3)
    s.mix['horns'] = StemMix(eq=[('hp', 150.0), ('peak', 2500.0, 1.0, 0.8), ('lp', 7000.0)] + fader(F['horns']),
                             reverb=0.22, reverb_type='plate', pan=0.2)
    s.mix['lead'] = StemMix(eq=[('hp', 200.0)] + fader(F['lead']), reverb=0.18, reverb_type='plate', delay=0.12,
                            delay_16ths=3.0, delay_fb=0.3, pan=0.1)
    s.mix['fx'] = StemMix(eq=[('hp', 60.0)] + fader(F['fx']), reverb=0.3, reverb_type='hall', pan=-0.1, width=0.9)


def build() -> Song:
    s = Song(id=ID, title='Morning Boardwalk', style='lo-fi boom-bap', bpm=88, key='F major', bars=BARS,
             sections=SECTIONS, seed=SEED, difficulty=1, target_taps_per_min=28, swing=0.58, break_bars=[21, 22],
             preview_start_bar=13, hook_stem='keys', progression=PROGRESSION)
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


if __name__ == '__main__':
    main(build, __file__)
