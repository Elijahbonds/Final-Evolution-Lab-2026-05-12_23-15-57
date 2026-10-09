#!/usr/bin/env python3
"""song_goldenhour.py — "Golden Hour Glide", FEL house song 3 of 6 (difficulty 3).

A west-coast sunset groove: laid-back swing (0.56), a rolling saw bass that slides into every root, a clap-on-snare
backbeat, a warm pad with off-beat EP stabs and bell sparkles, a soft brass section, and a portamento WHISTLE that
carries the hook (hook stem = lead). 104 BPM, B-flat dorian, 44 bars (101.54 s), seed 0x5E75.

    /Users/elijahbonds/.cache/fel-kokoro/.venv/bin/python songgen/song_goldenhour.py   # -> songs/goldenhour/ + validate

Form (SONGS.md §3: names, bars, energy, breakBars, preview 13-28 kept; ONE stem change, see the critic note below):
    intro   1-4   e1  bed keys lead fx            pad + the whistle teases the hook's first two bars (twice)
    verse   5-12  e2  bed drums bass keys perc fx  the roll-in: sliding bass, clap+snare, shaker/conga
    hook   13-20  e3  all                          whistle hook, horn swells + answers, bell sparkles
    break  21-24  e2  bed keys horns fx            FREEZES 21.1 (Gbmaj7) and 23.1 (Ab13): the band STOPS — bed + horn
                                                   stop hit + fx only; keys + horns breathe back in on 22 and 24
    verse  25-32  e3  all (+ lead, + horns)        whistle counter-melody in long notes over soft horn pads; snaps;
                                                   31-32 = the build (bass drops out, snare roll, horn crescendo,
                                                   riser, the bass dives into 33)
    hook   33-40  e4  all                          the hook again, fuller; the whistle answers an octave UP in 36 and 40
    outro  41-44  e2  bed keys lead fx             the whistle's last phrase over the pad; 44.1 rings out

Harmony: verse Bbm9|Eb9|Bbm9|Ab13 (dorian i-IV-i-VII), hook Gbmaj7|Bbm9|Ebm9|Ab13 (VI-i-iv-VII), break Gbmaj7 x2|
Ab13 x2, intro = the verse, outro Bbm9|Eb9|Ab13|Bbm9 (VII-i to close). Ab13 (VII) is the song's turnaround
everywhere.

Critic pass (2026-09-25) — what changed from the first render and why:
  * horns were audible in only 21/44 bars (47.7 %); every earned stem must be heard in >= 60 % of the bars, or earning
    "freeze" buys silence for most of the song. Verse 2 now lists horns (soft 3-voice pads under the whistle's long
    notes, a crescendo through the build): 29/44 bars. This is the only deviation from the SONGS.md stem lists.
  * the freeze bars (breakBars 21, 23) carried bed + keys + horns + fx; a freeze is the band stopping, so they now
    carry bed + horns + fx only (keys sit out 21 and 23; the bass and the whistle stop before 21.1).
  * distinctness: the hook loop Gbmaj7|Fm7|Ebm9|Ab13 was warmup's hook (Bbmaj9|Am7|Gm9|C9sus4) transposed — the
    same IVmaj7-iii7-ii9-V cycle — and the i-IV-i-IV intro/verse vamp was cypher's (Em9|A13). Bar 2 of the hook is
    now the tonic Bbm9 (VI-i-iv-VII) and bar 4 of each intro/verse phrase is Ab13 (i-IV-i-VII); the melody notes were
    checked against the new chords (bar 2 of the hook is C-Bb-F-Eb-Db = 9-1-5-11-3 of Bbm9; over the intro's Ab13 the
    same tease bar is 3-9-13-5-11).

IP CHECK (CONTRACT.md §6 / SONGS.md "IP check") — done before rendering:
  * Every sound is synthesised by fel_synth from code (oscillators, FM, filtered noise, synthetic reverb IRs). No
    samples, no loops, no audio files are read. The `vox` pad in fx is the library's wordless formant "ooh/aah" — no
    words, no recorded voice.
  * The whistle hook was composed here from the hook chords' tones: bar 1 climbs the upper structure of Gbmaj7
    (Db-F-Ab-Bb) to a C6 that is pushed on the "and of 4" and tied over the bar line; bar 3 repeats that rhythm a
    step lower on Ebm9 (Bb-Db-Eb-F, pushed Gb); bars 2 and 4 fall back down. Bars 1-2 are chord tones of both
    Gbmaj7->Bbm9 and the intro's Bbm9->Eb9 / Bbm9->Ab13 (one passing 16th), so the intro can tease them. Sung/played against the tunes we
    know (G-funk whistle leads, smooth-soul hooks, the set's other five songs): no match in contour + rhythm — the
    tied push-then-fall shape and the step-down sequence are this song's own. The octave-up answer (bars 36/40) is a
    register lift of the same tail, not a quote.
  * The bass is built from rules: root on 1 (slid into from the previous bar's last note), an octave "pop" (locked to
    the swung a7 kick in the verses), the 5th, a colour tone, and a chromatic/step approach that slides into the next
    root (hook: Gb2 dives into Bb1; verse: the leading tone A1 rises into Bb1). It follows the chords only; no known
    bassline.
  * Drums: an original pattern from SONGS.md's rules (kick 1 [bed] + a7 [swung] + and-of-3, clap-on-snare 2 & 4,
    swung 16th ghost hats). Not the Amen, Funky Drummer, Apache, Think, Impeach, or any electro/808 pattern.
  * Pad/EP voicings come from fel_synth.voicing; the horn voicings are written out (3-5-7 swells, a rising-fourth
    "bah - baaah" answer, verse-2 pads on a common-tone chain). Perc and fx parts are rhythmic rules written out below.
  * The critic-pass chord changes (hook bar 2 = Bbm9, verse bar 4 = Ab13) were re-checked the same way: the hook's
    bar 2 line (C-Bb-F-Eb-Db) and the new counter-melody notes (Gb5-Eb5 in 28, Eb5-Bb5 in 32) are chord tones of
    their bars; no new melody was introduced.

Mix and peak notes (the arrangement, not a compressor, keeps the shared peak guard under 2.5 dB — SONGS.md rule 9):
  * Stem faders go through `flat()` (a shelf pair = an exact flat gain) because fel_synth 1.0.0 never applies
    StemMix.gain_db.
  * Downbeat bass roots sit 8 ms behind the bed kick and the layered clap is flammed 6 ms behind the snare (both via
    the event `_offset_ms` the library already uses for strums). Map onsets stay on the grid.
  * Keys make room on the drum-fill bars; the kick owns beat 1 (no low conga there); bells sit out where the
    whistle's octave-up answer lives.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fel_synth import Song, Section, StemMix, voicing, midi, main  # noqa: E402

ID = 'goldenhour'
SEED = 0x5E75
BARS = 44
ALL = ('bed', 'drums', 'bass', 'keys', 'perc', 'horns', 'lead', 'fx')

SECTIONS = [
    Section('intro', 1, 4, 1, ('bed', 'keys', 'lead', 'fx')),
    Section('verse', 5, 8, 2, ('bed', 'drums', 'bass', 'keys', 'perc', 'fx')),
    Section('hook', 13, 8, 3, ALL),
    Section('break', 21, 4, 2, ('bed', 'keys', 'horns', 'fx')),
    Section('verse', 25, 8, 3, ALL),          # SONGS.md had no horns here; added so horns play >= 60 % of the bars
    Section('hook', 33, 8, 4, ALL),
    Section('outro', 41, 4, 2, ('bed', 'keys', 'lead', 'fx')),
]

PROG = {
    'intro': ['Bbm9', 'Eb9', 'Bbm9', 'Ab13'],
    'verse': ['Bbm9', 'Eb9', 'Bbm9', 'Ab13'],
    'hook': ['Gbmaj7', 'Bbm9', 'Ebm9', 'Ab13'],
    'break': ['Gbmaj7', 'Gbmaj7', 'Ab13', 'Ab13'],
    'outro': ['Bbm9', 'Eb9', 'Ab13', 'Bbm9'],
}


def pos_in(song: Song, bar: int) -> tuple:
    sec = song.section_at(bar)
    return sec, bar - sec.start_bar


def chord_at(song: Song, bar: int) -> str:
    sec, i = pos_in(song, bar)
    seq = PROG[sec.name]
    return seq[i % len(seq)]


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# bed: kick on 1 + off-beat hats (+ a swung pickup hat on even bars) — the pulse that never stops
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BED_KICK = dict(tune=49.0, punch=150.0, decay=0.28, click=0.2, drive=0.45)
BED_HAT = dict(decay=0.032, tone=0.35, metal=0.4)


def write_bed(s: Song):
    for bar in range(1, BARS + 1):
        s.hit('bed', 'kick', bar, 0, 0.92 if bar in (1, 44) else 0.88, **BED_KICK)
        hats = [(2, 0.30), (6, 0.37), (10, 0.30), (14, 0.39)]
        if bar % 2 == 0:
            hats.append((15, 0.17))          # swung pickup into the next bar: the bed alone still sways
        if bar == BARS:
            hats = [(2, 0.30), (6, 0.34)]    # last bar: nothing starts after sixteenth 8
        for six, v in hats:
            s.hit('bed', 'hat', bar, six, v, **BED_HAT)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# drums (bounce): clap-on-snare backbeat, swung ghost hats, kick on a7 + and-of-3, fills into every section
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

SNARE = dict(tune=180.0, decay=0.2, body=0.7, snappy=0.7, tone=0.45)
CLAP = dict(tone=1200.0, decay=0.18)
# drum kick: a low beater click (MP3 turned a brighter click over the a7 kick's sine tail into a flagged spike) and a
# short decay (the snare/clap lead the drums stem; fills don't pile onto the next downbeat)
DKICK = dict(tune=52.0, punch=175.0, decay=0.19, click=0.07, drive=0.25)
HAT = dict(decay=0.035, tone=0.5)
OHAT = dict(decay=0.24, tone=0.4)


def write_drums(s: Song):
    for bar in range(1, BARS + 1):
        if not s.plays('drums', bar):
            continue
        sec, i = pos_in(s, bar)
        e = sec.energy
        phrase_end = i % 4 == 3
        roll = bar == 32
        # backbeat: snare + clap layered on 2 and 4 (the clap is a hair softer so the snare body leads)
        if not roll:
            s.hit('drums', 'snare', bar, 4, 0.86, **SNARE)
            s.hit('drums', 'snare', bar, 12, 0.9, **SNARE)
        s.hit('drums', 'clap', bar, 4, 0.7, _offset_ms=6.0, **CLAP)      # flammed 6 ms behind the snare: the layer
        s.hit('drums', 'clap', bar, 12, 0.74, _offset_ms=6.0, **CLAP)    # widens instead of stacking one peak
        # kick (the bed has beat 1): a7 swung + and-of-3; phrase ends add the e-of-1 push
        kp = '...x...x..x.....' if phrase_end else '.......x..x.....'
        if e >= 4 and i % 4 == 1:
            s.hit('drums', 'kick', bar, 14, 0.5, **DKICK)       # hook 2: a soft push into the next bar
        if bar == 31:
            kp = '.......x..x...x.'
        if bar == 40:
            kp = '...x......x.....'                   # the setup bar before the fill out: the a7 kick sits out
        if roll:
            kp = '....x...x...x...'                   # the build: four on the floor with the bed
        s.pattern('drums', 'kick', [bar], kp, vel=0.7, **DKICK)
        # hats: 16ths minus the bed's off-beats; the odd ones are the swung ghosts
        hp = 'xo.oxo.oxo.oxo.o'
        if bar % 2 == 0:
            hp = hp[:15] + '.'                     # the bed owns the swung pickup on even bars
        ghost = {2: 0.15, 3: 0.19, 4: 0.23}[e]
        s.pattern('drums', 'hat', [bar], hp, vel=0.42, ghost=ghost, accent=0.5, **HAT)
        if phrase_end or (e >= 4 and i % 2 == 1):
            s.hit('drums', 'openhat', bar, 6, 0.42, **OHAT)
        # ghost snares from energy 3
        if e >= 3 and not roll:
            s.hit('drums', 'snare', bar, 9, 0.2, **SNARE)
            if bar % 2 == 1:
                s.hit('drums', 'snare', bar, 15, 0.24, **SNARE)
    # crashes on the downbeats the band returns on
    for bar, v in ((13, 0.42), (25, 0.42), (33, 0.45), (37, 0.32)):
        s.hit('drums', 'crash', bar, 0, v, decay=1.3)
    # fills
    s.hit('drums', 'snare', 12, 13, 0.5, **SNARE)                      # into hook 1
    s.hit('drums', 'tom', 12, 14, 0.58, size='mid', decay=0.15)
    s.hit('drums', 'tom', 12, 15, 0.64, size='low', decay=0.15)
    for six, v in ((13, 0.5), (14, 0.72), (15, 0.9)):                  # the stop into the freeze at 21
        s.hit('drums', 'snare', 20, six, v, **SNARE)
    s.hit('drums', 'tom', 28, 14, 0.56, size='high', decay=0.15)                   # mid-verse turn
    s.hit('drums', 'tom', 28, 15, 0.62, size='mid', decay=0.15)
    s.roll('drums', 'snare', 32, 1, steps=(2, 1, 1, 0.5), vel=(0.3, 0.95), **SNARE)   # the build into hook 2
    s.hit('drums', 'tom', 36, 13, 0.5, size='high', decay=0.15)                  # mid-hook turn
    s.hit('drums', 'tom', 36, 14, 0.56, size='mid', decay=0.15)
    s.hit('drums', 'tom', 36, 15, 0.62, size='low', decay=0.15)
    for six, v, size in ((13, 0.5, 'high'), (14, 0.58, 'mid'), (15, 0.66, 'low')):   # out into the outro
        s.hit('drums', 'tom', 40, six, v, size=size, decay=0.15)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# bass (footwork): a sliding saw pluck — every root is slid into from the note before it
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BASS = dict(shape='saw', cutoff=240.0, env=1300.0, fdecay=0.16, q=1.3, sub=0.3, decay=0.3, sustain=0.6,
            release=0.05, drive=0.15)
LAYBACK_MS = 8.0           # downbeat roots sit this far behind the bed kick (map onsets stay on the grid)
# cells: (six, midi, dur16, vel, slide) with slide = None | 'prev' (from the previous note) | 'pop' (octave pop).
# Nothing starts on six 4 or 12 with the snare+clap (SONGS.md rule 9).
VERSE_CELL = {
    'Bbm9': [(0, 34, 6, 0.95, 'prev'), (7, 46, 2, 0.6, 'pop'), (10, 41, 2, 0.8, None), (13, 32, 1, 0.62, None),
             (14, 37, 2, 0.7, None)],                    # Bb1 . Bb2 F2 Ab1 Db2 -> slides up into Eb2
    'Eb9': [(0, 39, 6, 0.95, 'prev'), (7, 51, 2, 0.6, 'pop'), (10, 46, 2, 0.8, None), (13, 43, 1, 0.62, None),
            (14, 36, 2, 0.7, None)],                     # Eb2 . Eb3 Bb2 G2 C2 -> slides down into Bb1
    'Ab13': [(0, 32, 6, 0.95, 'prev'), (7, 44, 2, 0.6, 'pop'), (10, 39, 2, 0.8, None), (13, 42, 1, 0.62, None),
             (14, 33, 2, 0.7, None)],                    # Ab1 . Ab2 Eb2 Gb2 A1 -> leading tone up into Bb1
}
HOOK_CELL = {
    'Gbmaj7': [(0, 30, 5, 0.95, 'prev'), (6, 42, 1, 0.6, 'pop'), (8, 37, 3, 0.8, None), (11, 41, 1, 0.58, None),
               (13, 42, 3, 0.72, None)],                 # Gb1 . Gb2 Db2 F2 Gb2 -> DIVES into Bb1
    'Bbm9': [(0, 34, 5, 0.95, 'prev'), (6, 46, 1, 0.6, 'pop'), (8, 37, 3, 0.8, None), (11, 44, 1, 0.58, None),
             (13, 41, 3, 0.72, None)],                   # Bb1 . Bb2 Db2 Ab2 F2 -> steps down into Eb2
    'Ebm9': [(0, 39, 5, 0.95, 'prev'), (6, 51, 1, 0.6, 'pop'), (8, 46, 3, 0.8, None), (11, 42, 1, 0.58, None),
             (13, 34, 3, 0.72, None)],                   # Eb2 . Eb3 Bb2 Gb2 Bb1 -> slides down into Ab1
    'Ab13': [(0, 32, 5, 0.95, 'prev'), (6, 44, 1, 0.6, 'pop'), (8, 39, 3, 0.8, None), (11, 42, 1, 0.58, None),
             (13, 44, 1, 0.7, None), (14, 31, 2, 0.7, None)],   # Ab1 . Ab2 Eb2 Gb2 Ab2 G1 -> half-step into Gb1
}


def write_bass(s: Song, chords: dict):
    prev_last = 29.0                          # the first entry (bar 5) swoops up from F1
    for bar in range(1, BARS + 1):
        if not s.plays('bass', bar):
            continue
        sec, i = pos_in(s, bar)
        e = sec.energy
        ch = chords[bar]
        cell = list((HOOK_CELL if sec.name == 'hook' else VERSE_CELL)[ch])
        if bar == sec.start_bar and s.section_at(bar - 1) and not s.plays('bass', bar - 1):
            prev_last = {5: 29.0, 25: 29.0}.get(bar, prev_last)          # re-entry after a bass-less section
        if bar == 12:                                                   # verse -> hook: approach Gb1 from G1
            cell[-1] = (14, 31, 2, 0.72, None)
        if bar in (20, 40):                                             # hook -> break / outro: land and stop
            # into the freeze (21.1) the last note lets go a 16th early: the band has stopped when the horns hit
            cell = cell[:4] + [(13, 44, 2 if bar == 20 else 3, 0.7, None)]
        if bar == 32:                                                   # the build: drop out, then the dive
            cell = [(0, 32, 4, 0.95, 'prev'), (7, 44, 1, 0.6, 'pop'), (10, 46, 6, 0.8, None)]   # Ab1 . Ab2 Bb2 -> the dive
        if bar == 31:                                                   # the build starts: roots only, pushed
            cell = [(0, 34, 6, 0.95, 'prev'), (7, 46, 2, 0.6, 'pop'), (10, 41, 2, 0.8, None),
                    (14, 37, 2, 0.75, None)]
        if e >= 3 and bar not in (31, 32):
            six0, m0, _d, v0, sl0 = cell[0]
            cell[0] = (six0, m0, 3, v0, sl0)                            # the root gets shorter ...
            cell.append((3, m0, 1, 0.42 if e == 3 else 0.46, 'ghost'))        # ... for a swung, muted ghost of the root
        cell.sort(key=lambda c: c[0])
        root = cell[0][1]
        for six, m, dur, vel, slide in cell:
            extra = dict(BASS)
            if slide == 'prev' and prev_last is not None and abs(prev_last - m) > 0:
                extra['from'] = float(prev_last)
                extra['glide'] = 0.055
            elif slide == 'pop':
                extra['from'] = float(root)
                extra['glide'] = 0.022
            elif slide == 'ghost':
                extra['env'] = 450.0          # a ghost is dull: no bright saw edge poking out of a quiet bar
            if six == 0:
                extra['_offset_ms'] = LAYBACK_MS
            s.note('bass', 'pluck_bass', bar, six, m, dur, vel, **extra)
        last = max(cell, key=lambda c: c[0])
        prev_last = float(last[1])


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# keys (wave): warm pad (whole bars) + light EP off-beat stabs + bell sparkles in the hooks
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

PAD = dict(shape='warm', cutoff=1500.0, attack=0.35, release=0.8, detune=8.0)
EP = dict(bright=0.35, decay=1.4, tine=0.14, release=0.12)
EP_STAB = dict(EP, release=0.07)             # the off-beat comp: short, so it never rings onto the downbeat
BELL = dict(decay=0.5, index=2.0, ratio=3.5)
SPARKLE = {                                   # three bell notes per sparkle (octave 6, falling): chord colour tones
    'Gbmaj7': ('Ab6', 'F6', 'Db6'), 'Bbm9': ('Eb6', 'C6', 'Ab5'), 'Ebm9': ('F6', 'Db6', 'Bb5'),
    'Ab13': ('F6', 'Eb6', 'C6'), 'Eb9': ('F6', 'Db6', 'Bb5'),
}


FILL_BARS = (12, 20, 28, 36, 40)           # the drum fills (six 13-15) that lead into the next phrase/section


def write_keys(s: Song, chords: dict):
    prev_pad = None
    prev_ep = None
    for bar in range(1, BARS + 1):
        sec, i = pos_in(s, bar)
        e = sec.energy
        ch = chords[bar]
        # pad
        if sec.name == 'break':
            # the freezes (21, 23) are the band STOPPING: keys sit out and breathe back in on 22 and 24; the pad
            # before a freeze lets go early with a short release so nothing of it is left under the horn hit
            if bar not in s.break_bars:
                v = voicing(ch, 60, n=4, prev=prev_pad)
                before_freeze = bar + 1 in s.break_bars
                s.chord('keys', 'pad', bar, 0, v, 12.5 if before_freeze else 15.5, 0.62, strum_ms=25,
                        **(dict(PAD, release=0.3) if before_freeze else PAD))
                prev_pad = v
        else:
            v = voicing(ch, 59, n=4, prev=prev_pad)
            if bar == BARS:
                s.chord('keys', 'pad', bar, 0, v, 7, 0.55, strum_ms=30, **dict(PAD, release=0.45))
            elif bar + 1 in s.break_bars:
                s.chord('keys', 'pad', bar, 0, v, 12.5, {1: 0.5, 2: 0.5, 3: 0.54, 4: 0.56}[e], strum_ms=40,
                        **dict(PAD, release=0.3))
            else:
                s.chord('keys', 'pad', bar, 0, v, 15.5, {1: 0.5, 2: 0.5, 3: 0.54, 4: 0.56}[e], strum_ms=40, **PAD)
            prev_pad = v
        # EP comp
        ep = voicing(ch, 66, n=3 if e <= 2 else 4, rootless=True, prev=prev_ep)
        prev_ep = ep
        if sec.name == 'break':
            if bar not in s.break_bars:
                s.chord('keys', 'ep', bar, 0, ep, 6, 0.58, strum_ms=8, **EP)        # the band comes back in
                if bar + 1 not in s.break_bars:
                    s.chord('keys', 'ep', bar, 14, ep, 2, 0.32, strum_ms=10, **EP)  # pickup into verse 2
        elif bar == BARS:
            s.chord('keys', 'ep', bar, 0, ep, 8, 0.45, strum_ms=18, **EP)
        elif sec.name in ('intro', 'outro'):
            s.chord('keys', 'ep', bar, 14, ep, 2, 0.3, strum_ms=12, **EP)
        else:
            base = {2: 0.4, 3: 0.44, 4: 0.47}[e]
            s.chord('keys', 'ep', bar, 6, ep, 1.5, base, strum_ms=18, **EP_STAB)
            if bar not in FILL_BARS:                                          # keys make room for the fills
                s.chord('keys', 'ep', bar, 14, ep, 1.5, base, strum_ms=18, **EP_STAB)
            if e >= 4 and i % 2 == 1 and bar not in FILL_BARS:
                s.chord('keys', 'ep', bar, 11, ep, 1, 0.22, strum_ms=12, **EP_STAB)   # swung ghost stab
        # bell sparkles: hook 1 odd bars, hook 2 every bar, break bars 22/24, the intro's last bar
        spark = (sec.name == 'hook' and (e >= 4 or i % 2 == 0)) or bar in (4, 22, 24)
        if bar in (36, 40):
            spark = False            # the whistle's octave-up answer (F6-Eb6-C6) owns that register in these bars
        if spark:
            vs = (0.5, 0.4, 0.34) if sec.name == 'hook' else (0.4, 0.32, 0.27)
            for six, p, v in zip((8, 10, 12), SPARKLE[ch], vs):
                s.note('keys', 'bell', bar, six, p, 2, v, **BELL)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# perc (toprock): shaker + conga tumble, snaps in verse 2, tambourine in hook 2
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def write_perc(s: Song):
    for bar in range(1, BARS + 1):
        if not s.plays('perc', bar):
            continue
        sec, i = pos_in(s, bar)
        e = sec.energy
        shaker = {2: 'x.o.x.o.x.o.x.o.', 3: 'x.ogx.o.x.ogx.o.', 4: 'x.ogx.ogx.ogx.og'}[e]
        if bar == 32:
            shaker = 'xgogxgogxgoxxoxx'                     # the build: the shaker fills in toward the drop
        s.pattern('perc', 'shaker', [bar], shaker, vel=0.42, ghost=0.28, length=0.06, tone=0.5)
        s.pattern('perc', 'conga', [bar], '......x...x..x..', vel=0.52, size='mid')
        if e >= 3:
            if bar not in FILL_BARS:                          # the drums own the fill bars' back half
                s.pattern('perc', 'conga', [bar], '...........x...x', vel=0.46, size='low')    # the kick owns beat 1
            if i % 2 == 1:
                s.pattern('perc', 'conga', [bar], '..............x.', vel=0.58, size='high', stroke='slap')
        if sec.name == 'verse' and e >= 3:
            s.pattern('perc', 'snap', [bar], '....x.......x...', vel=0.5)
        if e >= 4:
            s.pattern('perc', 'tamb', [bar], '..x...x...x...x.', vel=0.32, accent=0.42, decay=0.1)
    # conga turns at phrase ends (interlocking with the drum fills)
    for bar in (8, 16, 28):
        for six, size in ((12, 'high'), (13, 'high')):
            s.hit('perc', 'conga', bar, six, 0.46, size=size, stroke='open')


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# horns (freeze): soft swells + two-hit answers in the hooks; the break's stop hits and swells
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BRASS = dict(voices=3, bright=0.45, attack=0.05, spread=9.0, vib=12.0, scoop=-25.0)
# written-out voicings (the top line matters): swells are 3-5-7 shells under the whistle; the answers are a rising
# fourth "bah - baaah" (Eb4 -> Ab4 on Bbm9 = its b7-9-11 upper structure, F4 -> Bb4 on Ab13) that the section repeats
# every even hook bar.
SWELL = {'Gbmaj7': ('Bb3', 'Db4', 'F4'), 'Ebm9': ('Gb3', 'Bb3', 'Db4')}
SWELL4 = {'Gbmaj7': ('Gb3', 'Bb3', 'Db4', 'F4'), 'Ebm9': ('Gb3', 'Bb3', 'Db4', 'Eb4')}
ANSWER = {'Bbm9': (('Ab3', 'C4', 'Eb4'), ('C4', 'Eb4', 'Ab4')), 'Ab13': (('Gb3', 'C4', 'F4'), ('C4', 'Gb4', 'Bb4'))}
# verse 2: soft section pads under the whistle's long notes (below it: tops F4/Gb4, the whistle sits Bb4-Bb5), one
# common-tone voice-leading chain b7-3-5 / 3-b7-9 / b7-3-13: Ab3 Db4 F4 -> G3 Db4 F4 -> Gb3 C4 F4
VERSE_PAD = {'Bbm9': ('Ab3', 'Db4', 'F4'), 'Eb9': ('G3', 'Db4', 'F4'), 'Ab13': ('Gb3', 'C4', 'F4')}


def write_verse_horns(s: Song, chords: dict, sec: Section):
    """Horns in verse 2: a darker, slower swell per bar (the hook's answers stay the hook's), a pickup "bah" at the
    end of the first phrase, and a crescendo through the build (31-32) that hands over to hook 2's swell."""
    for bar in sec.bar_range():
        i = bar - sec.start_bar
        ch = chords[bar]
        v = VERSE_PAD[ch]
        if bar == sec.end_bar:                                            # the build's last bar: open up into 33
            s.chord('horns', 'brass', bar, 0, v, 15, 0.6, strum_ms=14,
                    **dict(BRASS, attack=1.3, bright=0.55, vib=8.0))
        elif bar == sec.end_bar - 1:                                      # the build starts: a longer, rising swell
            s.chord('horns', 'brass', bar, 0, v, 15.5, 0.52, strum_ms=14,
                    **dict(BRASS, attack=0.9, bright=0.4, vib=8.0))
        else:
            s.chord('horns', 'brass', bar, 0, v, 13, 0.46 if i % 2 == 0 else 0.42, strum_ms=16,
                    **dict(BRASS, attack=0.55, bright=0.32, vib=8.0, scoop=-12.0))
        if i == 3:                                                        # end of phrase 1: a short "bah" pickup
            s.chord('horns', 'brass', bar, 14, VERSE_PAD[chords[bar + 1]], 1.5, 0.5, strum_ms=8,
                    **dict(BRASS, attack=0.02, bright=0.45))


def write_horns(s: Song, chords: dict):
    for bar in range(1, BARS + 1):
        sec, i = pos_in(s, bar)
        if sec.name == 'verse' and s.plays('horns', bar) and bar == sec.start_bar:
            write_verse_horns(s, chords, sec)
        if sec.name != 'hook':
            continue
        e = sec.energy
        ch = chords[bar]
        bright = 0.45 if e <= 3 else 0.55
        if i % 2 == 0:                                   # bar 1 of each 2-bar phrase: a swell under the whistle
            v = (SWELL if e <= 3 else SWELL4)[ch]
            s.chord('horns', 'brass', bar, 0, v, 12, 0.7 if e <= 3 else 0.64, strum_ms=10,
                    **dict(BRASS, attack=0.42, bright=bright))
            if e >= 4:                                   # hook 2: the section pushes the next chord with the whistle
                s.chord('horns', 'brass', bar, 14, ANSWER[chords[bar + 1]][0], 2, 0.6, strum_ms=12,
                        **dict(BRASS, attack=0.02, bright=0.6))
        else:                                            # answers: "bah - baaah"
            a, b = ANSWER[ch]
            s.chord('horns', 'brass', bar, 6, a, 2, 0.67 if e <= 3 else 0.63, strum_ms=12,
                    **dict(BRASS, attack=0.025, bright=bright))
            fall = 2 if bar in (20, 40) else 0
            s.chord('horns', 'brass', bar, 12, b, 4, 0.72, strum_ms=12,
                    **dict(BRASS, attack=0.03, bright=bright + 0.05, fall=fall))
    # the break: two freezes with swells between (breakBars 21, 23)
    hitp = dict(BRASS, attack=0.012, bright=0.7, scoop=-15.0)
    s.chord('horns', 'brass', 21, 0, ('Gb3', 'Bb3', 'Db4', 'F4'), 3, 0.88, strum_ms=6, **hitp)       # FREEZE 1
    s.chord('horns', 'brass', 21, 12, ('Bb3', 'Db4', 'F4'), 12, 0.62, strum_ms=12,
            **dict(BRASS, attack=0.9, bright=0.4))                                                  # swell into 22
    s.chord('horns', 'brass', 22, 10, ANSWER['Ab13'][0], 2, 0.55, strum_ms=5, **dict(BRASS, attack=0.02))
    s.chord('horns', 'brass', 22, 14, ANSWER['Ab13'][1], 2, 0.62, strum_ms=5, **dict(BRASS, attack=0.02))
    s.chord('horns', 'brass', 23, 0, ('Gb3', 'C4', 'F4', 'Bb4'), 3, 0.88, strum_ms=6, **hitp)        # FREEZE 2
    s.chord('horns', 'brass', 23, 12, ('C4', 'Gb4', 'Bb4'), 18, 0.62, strum_ms=12,
            **dict(BRASS, attack=1.1, bright=0.45, fall=2))                                 # swell + fall into 25


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# lead (power): the portamento whistle — ONE phrase for the whole song, so velocities set the section levels
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

# the hook, 4 bars: (bar offset, six, pitch, dur16). A 'C6' pushed on the and-of-4 ties over the bar line.
HOOK_A = [(0, 0, 'Db5', 2), (0, 2, 'F5', 4), (0, 6, 'Ab5', 2), (0, 8, 'Bb5', 6), (0, 14, 'C6', 6),
          (1, 4, 'Bb5', 2), (1, 6, 'F5', 4), (1, 10, 'Eb5', 3), (1, 13, 'Db5', 1)]
HOOK_B = [(2, 0, 'Bb4', 2), (2, 2, 'Db5', 4), (2, 6, 'Eb5', 2), (2, 8, 'F5', 6), (2, 14, 'Gb5', 6)]
HOOK_B_UP = HOOK_B[:-1] + [(2, 14, 'Gb5', 5)]    # hook 2: the push lets go a 16th early so the octave jump speaks
TAIL_Q = [(3, 4, 'F5', 2), (3, 6, 'Eb5', 2), (3, 8, 'C5', 6)]                   # bar 4: the question
TAIL_A = [(3, 4, 'F5', 2), (3, 6, 'Ab5', 2), (3, 8, 'Bb5', 5)]                  # bar 8: the answer (lands on Bb)
# (bar 20 only: the Bb lets go at six 13 with the snare stop, so the whistle's echoes are gone under the 21.1 freeze)
TAIL_Q_UP = [(3, 4, 'F6', 2), (3, 6, 'Eb6', 2), (3, 8, 'C6', 6)]                # hook 2 bar 4: octave-up answer
TAIL_A_UP = [(3, 4, 'F6', 2), (3, 6, 'Eb6', 2), (3, 8, 'C6', 4), (3, 12, 'Bb5', 3)]   # hook 2 bar 8
# verse 2 counter-melody: long notes (>= 8 sixteenths); the dorian G natural colours the Eb9 bar (26), the b7 Gb the
# Ab13 turnaround (28); 31-32 widen Db-F / Eb-Bb into hook 2
COUNTER = [(25, 0, 'Db5', 8), (25, 8, 'F5', 8), (26, 0, 'G5', 12),
           (27, 0, 'F5', 8), (27, 8, 'Ab5', 8), (28, 0, 'Gb5', 8), (28, 8, 'Eb5', 8),
           (29, 0, 'C5', 8), (29, 8, 'Db5', 8), (30, 0, 'Bb4', 12),
           (31, 0, 'Db5', 8), (31, 8, 'F5', 8), (32, 0, 'Eb5', 8), (32, 8, 'Bb5', 7)]   # breath before hook 2
WHISTLE = dict(glide=0.07, vib=0.3, rate=5.2, vib_delay=0.18, attack=0.035, scoop=-1.5, harm2=0.08, harm3=0.03,
               release=0.1)


def _place(start_bar: int, cells, vel) -> list:
    out = []
    for k, (off, six, p, dur) in enumerate(cells):
        v = vel(k, len(cells)) if callable(vel) else vel
        out.append((start_bar + off, six, p, dur, v))
    return out


def write_lead(s: Song):
    notes = []
    # intro: the hook's first two bars, twice, softly (they fit Bbm9|Eb9 and Bbm9|Ab13 — chord tones + one passing 16th)
    notes += _place(1, HOOK_A, 0.6)
    notes += _place(3, HOOK_A, 0.58)
    # hook 1 (13-20) and hook 2 (33-40)
    for start, up in ((13, False), (33, True)):
        hv = 0.84 if not up else 0.86
        notes += _place(start, HOOK_A + (HOOK_B_UP if up else HOOK_B), hv)
        notes += _place(start, TAIL_Q_UP if up else TAIL_Q, hv)
        notes += _place(start + 4, HOOK_A + (HOOK_B_UP if up else HOOK_B), hv)
        notes += _place(start + 4, TAIL_A_UP if up else TAIL_A, hv)
    # verse 2 counter-melody
    notes += [(b, six, p, d, 0.6) for (b, six, p, d) in COUNTER]
    # outro: the hook's call over Bbm9|Eb9, the question over Ab13, home on Bb (fading 0.6 -> 0.42)
    outro = _place(41, HOOK_A, lambda k, n: 0.6 - 0.1 * k / n)
    outro += [(43, 0, 'Gb5', 4, 0.5), (43, 4, 'F5', 2, 0.48), (43, 6, 'Eb5', 2, 0.47), (43, 8, 'C5', 4, 0.46),
              (43, 12, 'Db5', 4, 0.45), (44, 0, 'Bb4', 8, 0.42)]
    notes += outro
    notes.sort(key=lambda n: (n[0], n[1]))
    s.phrase('lead', 'whistle', [(b, six, midi(p), d, v) for (b, six, p, d, v) in notes], **WHISTLE)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# fx (transition): air wash everywhere, wordless "ooh" in intro/break/outro, risers/impacts/sweeps at the seams
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

WASH = dict(lo=600.0, hi=3500.0, rate=0.06, q=1.2)
VOX = dict(vowels=('u', 'o'), attack=0.8, release=0.9, voices=4)


def write_fx(s: Song):
    for bar in (1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41):
        s.fx('fx', 'wash', bar, 0, 64, 0.6 if bar in (1, 21, 41) else 0.66, **WASH)
    # wordless vox pad (common tones so one pad spans two chords)
    s.chord('fx', 'vox', 1, 0, ['Bb3', 'Db4', 'F4'], 30, 0.5, strum_ms=40, **VOX)
    s.chord('fx', 'vox', 3, 0, ['Bb3', 'Db4', 'F4'], 28, 0.5, strum_ms=40, **VOX)
    s.chord('fx', 'vox', 21, 4, ['Bb3', 'Db4', 'F4'], 24, 0.45, strum_ms=40, **dict(VOX, vowels=('o', 'a')))
    s.chord('fx', 'vox', 23, 4, ['C4', 'Eb4', 'Gb4'], 24, 0.45, strum_ms=40, **dict(VOX, vowels=('o', 'a')))
    s.chord('fx', 'vox', 41, 0, ['Bb3', 'Db4', 'F4'], 30, 0.5, strum_ms=40, **VOX)
    s.chord('fx', 'vox', 43, 0, ['Ab3', 'C4', 'F4'], 22, 0.46, strum_ms=40, **dict(VOX, release=0.5))
    # the roll-in to verse 1
    s.fx_into('fx', 'reverse', 5, 0, 8, 0.6, pitches=[58, 61, 65])
    # a short reverse swell sucks into every mid-section phrase start (the fx player hears their part on each seam)
    for bar, pitches in ((9, [58, 61, 65]), (17, [54, 58, 61]), (29, [58, 61, 65]), (37, [54, 58, 61, 65])):
        s.fx_into('fx', 'reverse', bar, 0, 6, 0.5, pitches=pitches)
    # verse phrase ends
    for bar in (8, 28):
        s.fx('fx', 'sweep', bar, 8, 8, 0.55, lo=500.0, hi=5000.0)
    s.fx('fx', 'sweep', 16, 8, 8, 0.4, lo=700.0, hi=6000.0)
    s.fx('fx', 'sweep', 36, 8, 8, 0.45, lo=700.0, hi=6000.0)
    # risers into both hooks, impacts on them
    for hook in (13, 33):
        s.fx_into('fx', 'riser', hook, 0, 32, 0.64, tone='Bb2', lo=300.0, hi=8000.0)
        s.hit('fx', 'impact', hook, 0, 0.36, tune=40.0, decay=0.9)
    # the break: a light impact under the first freeze, a downsweep, then back in through a riser + reverse swell
    s.hit('fx', 'impact', 21, 0, 0.36, tune=40.0, decay=0.8)
    s.fx('fx', 'downsweep', 21, 0, 16, 0.55, lo=250.0, hi=7000.0)
    s.fx('fx', 'downsweep', 23, 0, 12, 0.4, lo=300.0, hi=6000.0)
    s.fx_into('fx', 'riser', 25, 0, 16, 0.6, lo=400.0, hi=7000.0)
    s.fx_into('fx', 'reverse', 25, 0, 8, 0.62, pitches=[58, 61, 65, 68])
    s.hit('fx', 'impact', 25, 0, 0.34, tune=40.0, decay=0.7)
    # the exhale into the outro
    s.fx('fx', 'downsweep', 41, 0, 16, 0.45, lo=250.0, hi=6000.0)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# mix
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def flat(gain_db: float) -> list:
    """A flat gain as two EQ bands. fel_synth 1.0.0 declares StemMix.gain_db but process_stem never applies it, so
    the stem balance goes through the eq list instead: an RBJ low shelf and high shelf at the same corner and gain
    multiply to exactly A^2 = gain_db at every frequency (checked to 1e-6 dB). Applied after drive, before the
    delay/reverb sends — where a fader would sit. gain_db stays 0 so a future library fix cannot double it."""
    return [('lowshelf', 1000.0, gain_db), ('highshelf', 1000.0, gain_db)]


# stem faders (dB), set from the per-section K-weighted loudness of the solo stems (see the analysis in the report)
FADER = {'bed': -1.5, 'drums': -1.0, 'bass': -4.3, 'keys': 0.7, 'perc': 2.2, 'horns': 0.4, 'lead': 2.2, 'fx': 4.0}


def write_mix(s: Song):
    s.mix['bed'] = StemMix(eq=[('hp', 32.0)] + flat(FADER['bed']), reverb=0.05, reverb_type='room', pan=0.0)
    s.mix['drums'] = StemMix(eq=[('hp', 40.0), ('lp', 13000.0)] + flat(FADER['drums']), drive=0.12, reverb=0.10,
                             reverb_type='room', pan=0.0)
    s.mix['bass'] = StemMix(eq=[('hp', 30.0), ('lp', 4500.0, 0.7), ('peak', 750.0, 2.0, 1.0)] + flat(FADER['bass']),
                            drive=0.25, pan=0.0)
    s.mix['keys'] = StemMix(eq=[('hp', 140.0), ('lowshelf', 300.0, -2.0), ('highshelf', 7000.0, -2.0)]
                            + flat(FADER['keys']), reverb=0.24, reverb_type='plate', pan=-0.25)
    s.mix['perc'] = StemMix(eq=[('hp', 180.0)] + flat(FADER['perc']), reverb=0.16, reverb_type='room', pan=0.35)
    s.mix['horns'] = StemMix(eq=[('hp', 160.0), ('peak', 2200.0, 1.0, 0.8), ('lp', 9000.0)] + flat(FADER['horns']),
                             reverb=0.26, reverb_type='plate', pan=0.25)
    s.mix['lead'] = StemMix(eq=[('hp', 250.0)] + flat(FADER['lead']), reverb=0.2, reverb_type='plate', delay=0.2,
                            delay_16ths=3.0, delay_fb=0.4, delay_damp=4000.0, pan=0.05)
    s.mix['fx'] = StemMix(eq=[('hp', 60.0)] + flat(FADER['fx']), reverb=0.3, reverb_type='hall', pan=-0.1, width=0.9)


def build() -> Song:
    s = Song(id=ID, title='Golden Hour Glide', style='west-coast sunset groove', bpm=104, key='Bb dorian',
             bars=BARS, sections=SECTIONS, seed=SEED, difficulty=3, target_taps_per_min=54, swing=0.56,
             break_bars=[21, 23], preview_start_bar=13, hook_stem='lead', progression=PROG,
             notes='Hook = the portamento whistle (lead). Freezes: 21.1 horn hit on Gbmaj7, 23.1 horn hit on Ab13 '
                   '(bed + horns + fx only; keys return on 22 and 24). Horns also pad verse 2 (bars 25-32). '
                   'Build = bars 31-32 (bass drops out, snare roll, horn crescendo, riser, bass dive into 33).')
    chords = {bar: chord_at(s, bar) for bar in range(1, BARS + 1)}
    write_bed(s)
    write_drums(s)
    write_bass(s, chords)
    write_keys(s, chords)
    write_perc(s)
    write_horns(s, chords)
    write_lead(s)
    write_fx(s)
    write_mix(s)
    return s


if __name__ == '__main__':
    main(build, __file__)
