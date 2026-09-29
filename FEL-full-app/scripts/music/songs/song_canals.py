#!/usr/bin/env python3
"""song_canals.py — "Canal Lights", The Cypher's song 5 of 6 (difficulty 5).

House-hop under the lights on the canals: a half-time pulse that becomes four-on-the-floor with a hip-hop swing, an
off-beat saw bass pumping under a sidechain, a house drawbar-organ stab riff as THE hook (keys), horn stabs with falls,
a wordless "ooh" vox lead, and water-drop twinkles in the fx.

    118 BPM, C minor, swing 0.55, 52 bars (105.763 s), seed 0xCA7A, 84 taps/min, hook stem = keys, preview bars 21-36.

    PY=/Users/elijahbonds/.cache/fel-kokoro/.venv/bin/python
    $PY songgen/song_canals.py            # -> songs/canals/{stems/*.mp3, preview.mp3, map.json}, then validates

ARRANGEMENT (bar: what the player hears)
  1-8   intro  e2  bed (half-time kick + off-beat hats), the hook's organ riff played dark and soft on Cm9|Abmaj9 and
                   brightening every two bars (drawbars open up), shaker (congas join at 5), a wordless vox pad and
                   canal drips; a reverse swell pulls into bar 9.
  9-16  verse  e3  drums complete the four-on-the-floor + clap + 16th hats; the off-beat saw bass arrives (C2-Ab1-F1-
                   Bb1 under Cm9|Abmaj9|Fm9|Bb6); EP chords with two organ stabs per bar (the riff's Eb-C shape); a
                   soft horn-section pad on beat 3 of every bar between the stabs; a snare pickup at 16.
  17-20 build  e4  a 4-bar riser (17.1 -> 21.1), the vox lead enters with four long rising notes (C Eb F G), organ
                   stabs tighten to the riff rhythm then 8ths, bass goes to 16ths, a snare roll on 19-20.
  21-28 hook   e4  THE HOOK: the organ stab riff over Fm9|Gm7|Abmaj7|Bb9sus4 (bass drops to a rising F1-G1-Ab1-Bb1
                   off-beat line that answers the riff), horns blend into the riff's 2& stab and fall on 4& every
                   other bar, the "ooh" vox melody, tamb, drip twinkles; bar 28 holds the stab while the kit stops on
                   beat 4 (a tom run on the and-of-3) and the horn fall carries into the break.
  29-32 break  e2  band stops: horn FREEZE hits on 29.1 and 31.1 with swells, the vox pad (C-Eb-G, then Ab-Eb-G) and
                   drips, downsweep in, reverse swell out; the bed keeps the pulse. Bed + horns + fx only.
  33-40 verse  e3  groove back, the vox answers after each organ stab, rim clicks; 39-40 are a mini-build before the
                   last hook (2-bar riser, snare roll, rising vox, organ 8ths, bass 16ths).
  41-48 hook   e5  everything: the riff with a pad under it, horns doubled (4 voices + an octave layer) with shouts at
                   the phrase ends, the vox opens to "aah" over an "oo" choir an octave down, the bass slides into
                   its octaves, snare doubles + ghost notes, 8th tamb, rim, a tom fill into the outro.
  49-52 outro  e2  drums and shaker thin out over the vox pad and drips; the vox sings a last phrase (C Bb G | Eb F G
                   | Eb C) home to C, horn swells sigh under it; crash + final bed kick + a C minor horn chord on 52.1
                   ring out.

LEVELS: stem balance is set with GAIN (a flat EQ band; fel_synth 1.0.0 never applies StemMix.gain_db). The shared
peak guard stays at 2.5 dB (2.47 after the critic pass) with no per-stem limiting because the arrangement keeps the
loud parts apart (the hook bass rests on the riff's six-6 stab, the fills interlock with the horn shouts, the kick
click stays <= 0.12).

CRITIC PASS (2026-09-25) — departures from SONGS.md, and why:
  - verse progression Cm9|Abmaj9|Fm9|Bb6 (i-VI-iv-VII): the spec's Cm9|Abmaj9|Ebmaj9|Bb6 is i-VI-III-VII, the same
    progression as evolution's hook (F#m|D|A|E); bar 3 of the verse is now iv.
  - sections: horns also play verse 1 and the outro, the lead also sings the outro, so every earned stem is audible
    (bar RMS > -40 dBFS) in >= 60 % of the song's bars (horns were 38 %, lead 54 %); the break is bed + horns + fx
    (keys out) so the freeze bars carry the bed and at most two earned stems; the kit, bass and lead stop early in
    bar 28 so no tail rings into the freeze.
  - intro shaker +3.5 dB (bars 1-4 measured -41 dBFS alone) and a conga goodbye in bar 52.
  - peak guard kept <= 2.5 dB after the new vox line: the hook vox's G5 now enters on six 7 (off the riff's six-6
    stab), bar 28's held stab 0.80 -> 0.70, hook 2's bass answer on six 7 0.60 -> 0.50, the hook-2 "oo" choir
    0.5 -> 0.42 x vel with a 60 ms attack, crash 41 0.64 -> 0.58, impact 41 0.46 -> 0.36.

IP CHECK (done before rendering, per SONGS.md):
  - Every sound is synthesised by fel_synth (numpy oscillators, noise, FFT filters, synthetic IRs) plus ONE added voice
    in voices_canals.py (`drip`, a chirping sine). No samples, no loops, no audio files are read.
  - The organ riff (tops C5 C5 Eb5 C5 Ab4 | Bb4 Bb4 D5 Bb4 G4 | C5 C5 Eb5 C5 G4 | Eb5 Eb5 F5 Eb5 C5 Bb4 on
    sixteenths 0/3/6/10/12) was composed from the hook progression (iv-v-VI-VII in C minor) as a repeated-note +
    rising-third cell in contrary motion to the rising roots. Checked against the house organ/piano hooks I know
    (Show Me Love's organ bass, Gypsy Woman's organ line, Finally's piano, Gonna Make You Sweat's stabs, Your Love's
    arp, Plastic Dreams' solo, Vogue's bass): different register, contour, rhythm and harmony — no match.
  - The vox melody (C Bb G F | G Bb G F | C Bb G Eb | Eb F) stays in C minor pentatonic, wordless "ooh"/"aah" vowels
    only; no lyric, no word. (Critic pass: its first cell used to be G F Eb F G, the opening pitches of "Mary Had a
    Little Lamb" in Eb; public domain, but the owner's rule is "resembles a famous tune -> change it", so it now falls
    from the top.) It does not follow any vocal line I know.
  - Bass: off-beat root/5th/octave pumping (a genre convention, no quoted line). Drums: four-on-the-floor + clap on
    2 and 4 + 16th hats (genre convention); no break (Amen, Funky Drummer, Apache, Think, Impeach, Planet Rock) is
    reproduced. Congas: an original 2-bar low/mid/slap figure.
  - No words anywhere: `vox` and `vox_lead` are wordless formant vowels ("oo", "oh", "ah").
"""
from __future__ import annotations

import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fel_synth import (Song, Section, StemMix, STEMS, voicing, midi, parse_chord, hrand, main)  # noqa: E402
import voices_canals  # noqa: E402,F401  (registers the `drip` voice)

ID = 'canals'
SEED = 0xCA7A
ALL = STEMS

INTRO = ['Cm9', 'Abmaj9']
VERSE = ['Cm9', 'Abmaj9', 'Fm9', 'Bb6']          # i - VI - iv - VII (critic: i-VI-III-VII was evolution's hook)
BUILD = ['Abmaj7', 'Abmaj7', 'Bb', 'Bb']
HOOK = ['Fm9', 'Gm7', 'Abmaj7', 'Bb9sus4']
BREAK = ['Cm9', 'Cm9', 'Abmaj9', 'Abmaj9']
OUTRO = ['Cm9', 'Abmaj9', 'Cm9', 'Cm9']

# critic pass: horns join verse 1 and the outro, the lead sings the outro (each earned stem sounds in >= 60 % of the
# bars), and the break is bed + horns + fx only (the freeze bars carry the bed and at most two earned stems).
SECTIONS = [
    Section('intro', 1, 8, 2, ('bed', 'keys', 'perc', 'fx')),
    Section('verse', 9, 8, 3, ('bed', 'drums', 'bass', 'keys', 'perc', 'horns', 'fx'), label='verse 1'),
    Section('build', 17, 4, 4, ('bed', 'drums', 'bass', 'keys', 'perc', 'lead', 'fx')),
    Section('hook', 21, 8, 4, ALL, label='hook 1'),
    Section('break', 29, 4, 2, ('bed', 'horns', 'fx')),
    Section('verse', 33, 8, 3, ('bed', 'drums', 'bass', 'keys', 'perc', 'lead', 'fx'), label='verse 2'),
    Section('hook', 41, 8, 5, ALL, label='hook 2'),
    Section('outro', 49, 4, 2, ('bed', 'drums', 'perc', 'horns', 'lead', 'fx')),
]


def bar_chords() -> dict[int, str]:
    c: dict[int, str] = {}
    for i in range(8):
        c[1 + i] = INTRO[i % 2]
        c[9 + i] = VERSE[i % 4]
        c[21 + i] = HOOK[i % 4]
        c[33 + i] = VERSE[i % 4]
        c[41 + i] = HOOK[i % 4]
    for i in range(4):
        c[17 + i] = BUILD[i]
        c[29 + i] = BREAK[i]
        c[49 + i] = OUTRO[i]
    return c


CH = bar_chords()


def stack(symbol: str, top, n: int = 4, span: int = 12) -> list[float]:
    """A stab voicing hung under a melody note: `top`, then the nearest chord tones below it (distinct pitch classes,
    no minor seconds between neighbours), at most `span` semitones down. The top line of the stabs is the riff."""
    root, ivs, _ = parse_chord(symbol)
    pcs = {(root + i) % 12 for i in ivs}
    t = int(round(midi(top)))
    out = [t]
    for m in range(t - 1, t - span - 1, -1):
        if len(out) >= n:
            break
        if m % 12 not in pcs or any(m % 12 == o % 12 for o in out) or out[-1] - m < 2:
            continue
        out.append(m)
    return sorted(float(x) for x in out)


# ── sounds ─────────────────────────────────────────────────────────────────────────────────────────────────────────
KICK = dict(tune=50.0, punch=165.0, decay=0.21, click=0.12, drive=0.2)   # click <= 0.12: the beater tick stays under the click detector
KICK_LAST = dict(KICK, decay=0.5)
BED_HAT = dict(decay=0.034, tone=0.45)
CLAP = dict(tone=1350.0, decay=0.16)
HAT = dict(decay=0.034, tone=0.55)
OHAT = dict(decay=0.22, tone=0.45)
SNARE = dict(tune=205.0, decay=0.13, snappy=0.8, body=0.5, tone=0.55)
TOMS = (196.0, 155.6, 130.8, 98.0)         # G3 Eb3 C3 G2 — tuned to the key
TOM = dict(decay=0.18)
BASS = dict(shape='saw', cutoff=200.0, env=1200.0, fdecay=0.08, q=1.1, sub=0.3)
EP = dict(bright=0.35, decay=1.6, tine=0.15)
ORG_HOOK = dict(drawbars='house', perc=0.12, click=0.06)
ORG_VERSE = dict(drawbars='house', perc=0.12, click=0.06)
PAD = dict(shape='warm', cutoff=1300.0, attack=0.3, release=0.6)
HORN = dict(bright=0.7, attack=0.015, voices=3, scoop=-30.0)
HORN2 = dict(HORN, voices=4)
HORN_BLEND = dict(bright=0.45, attack=0.015, voices=3, scoop=-30.0)
SHAKER = dict(length=0.06, tone=0.5)
WASH = dict(lo=350.0, hi=2600.0, rate=0.09, q=1.2)
VOX = dict(vowel='o', glide=0.06)
DRIP_NOTES = ('C6', 'Eb6', 'F6', 'G6', 'Bb6', 'C7')

# bass roots per chord: the verse walks C2-Ab1-F1-Bb1, the hook climbs F1-G1-Ab1-Bb1
ROOT = {'Cm9': 36, 'Abmaj9': 32, 'Bb6': 34, 'Abmaj7': 32, 'Bb': 34,
        'Fm9': 29, 'Gm7': 31, 'Bb9sus4': 34}

# THE HOOK — organ stab riff, one 4-bar phrase: (sixteenth, top note, dur16, velocity) per bar of HOOK
HOOK_RIFF = [
    [(0, 'C5', 1, .87), (3, 'C5', 1, .70), (6, 'Eb5', 2, .80), (10, 'C5', 1, .72), (12, 'Ab4', 2, .80)],   # Fm9
    [(0, 'Bb4', 1, .86), (3, 'Bb4', 1, .70), (6, 'D5', 2, .80), (10, 'Bb4', 1, .72), (12, 'G4', 2, .80)],  # Gm7
    [(0, 'C5', 1, .87), (3, 'C5', 1, .70), (6, 'Eb5', 2, .80), (10, 'C5', 1, .72), (12, 'G4', 2, .80)],    # Abmaj7
    [(0, 'Eb5', 1, .87), (3, 'Eb5', 1, .70), (6, 'F5', 3, .84), (10, 'Eb5', 1, .72), (12, 'C5', 1, .76),
     (14, 'Bb4', 1, .70)],                                                                                  # Bb9sus4
]
HOOK_HOLD = [(0, 'Eb5', 1, .87), (3, 'Eb5', 1, .70), (6, 'F5', 8, .70)]      # bar 28: the stab holds into the break
INTRO_RIFF = {
    'Cm9': [(0, 'C5', 1, .87), (3, 'C5', 1, .70), (6, 'Eb5', 2, .86), (10, 'C5', 1, .72), (12, 'G4', 2, .80)],
    'Abmaj9': [(0, 'C5', 1, .87), (3, 'C5', 1, .70), (6, 'Eb5', 2, .86), (10, 'C5', 1, .72), (12, 'Ab4', 2, .80)],
}
VERSE_STABS = {'Cm9': ('Eb5', 'C5'), 'Abmaj9': ('Eb5', 'C5'), 'Fm9': ('Eb5', 'C5'), 'Bb6': ('D5', 'Bb4'),
               'Abmaj7': ('Eb5', 'C5')}
HORN_STAB_TOP = ['Eb5', 'D5', 'Eb5', 'F5']          # six 6, doubling the organ's six-6 accent
HORN_FALL_TOP = {1: 'F5', 3: 'Eb5'}                  # six 14 on the even bars of the phrase
# verse 1 / outro: soft section pads (3rd-5th-7th shells, C4..Bb4, stepwise voice leading)
HORN_PAD = {'Cm9': [63, 67, 70], 'Abmaj9': [60, 67, 70], 'Fm9': [60, 63, 68], 'Bb6': [62, 65, 70]}

# the vox hook (C minor pentatonic), bar index within the 4-bar phrase. Critic pass: the first cell used to be
# G F Eb F G (3-2-1-2-3 in Eb, the opening pitches of "Mary Had a Little Lamb"); it now falls C Bb G F from the top.
VOX_HOOK = [
    (0, 0, 'C6', 4, .80), (0, 4, 'Bb5', 3, .70), (0, 7, 'G5', 5, .76), (0, 12, 'F5', 3, .72),
    (1, 0, 'G5', 4, .80), (1, 4, 'Bb5', 4, .78), (1, 8, 'G5', 6, .74), (1, 14, 'F5', 1, .66),
    (2, 0, 'C6', 4, .80), (2, 4, 'Bb5', 3, .70), (2, 7, 'G5', 5, .74), (2, 12, 'Eb5', 3, .72),
    (3, 0, 'Eb5', 6, .76), (3, 6, 'F5', 9, .74),
]
VOX_END_OPEN = [(3, 0, 'Eb5', 4, .74), (3, 4, 'F5', 4, .76), (3, 8, 'G5', 5, .80)]     # hook 1 -> the break
VOX_END_HOME = [(3, 0, 'F5', 4, .76), (3, 4, 'Eb5', 4, .72), (3, 8, 'C5', 7, .74)]     # hook 2 -> home (C)


def build() -> Song:
    s = Song(id=ID, title='Canal Lights', style='house-hop', bpm=118, key='C minor', bars=52, seed=SEED,
             difficulty=5, target_taps_per_min=84, swing=0.55, hook_stem='keys', sections=SECTIONS,
             break_bars=[29, 31], preview_start_bar=21, preview_bars=16,
             progression={'intro': INTRO, 'verse': VERSE, 'build': BUILD, 'hook': HOOK, 'break': BREAK,
                          'outro': OUTRO})
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


# ── bed: half-time kick (1 and 3) + the off-beat house hat. Kick + hat only, every bar. ─────────────────────────────

def bed(s: Song):
    for bar in range(1, 53):
        if bar == 52:
            s.hit('bed', 'kick', bar, 0, 0.92, **KICK_LAST)          # the last hit rings out
            for six, v in ((2, .34), (6, .28)):
                s.hit('bed', 'hat', bar, six, v, **BED_HAT)
            continue
        s.hit('bed', 'kick', bar, 0, 0.88, human=bar != 1, **KICK)
        s.hit('bed', 'kick', bar, 8, 0.84, **KICK)
        s.hit('bed', 'hat', bar, 2, 0.36, **BED_HAT)
        s.hit('bed', 'hat', bar, 6, 0.30, **BED_HAT)
        s.hit('bed', 'hat', bar, 10, 0.38, **BED_HAT)
        s.hit('bed', 'hat', bar, 14, 0.32, **dict(BED_HAT, decay=0.07))   # a longer "tss" pushes into the bar


# ── drums: the rest of the kit (kick 2 & 4, clap, 16th hats, open hats, fills, rolls, crashes) ─────────────────────

def _groove(s: Song, bar: int, hats: str = 'xo.oxo.oxo.oxo.o', kick: bool = True, clap: bool = True):
    if kick:
        s.pattern('drums', 'kick', [bar], '....x.......x...', vel=0.86, **KICK)
    if clap:
        s.pattern('drums', 'clap', [bar], '....x.......x...', vel=0.84, **CLAP)
    if hats:
        s.pattern('drums', 'hat', [bar], hats, vel=0.42, accent=0.5, ghost=0.22, **HAT)


def _toms(s: Song, bar: int, sixes, vel0: float = 0.5, vel1: float = 0.72):
    k = len(sixes)
    for i, six in enumerate(sixes):
        s.hit('drums', 'tom', bar, six, vel0 + (vel1 - vel0) * i / max(1, k - 1), pitch=TOMS[min(3, i * 4 // k)],
              **TOM)


def drums(s: Song):
    # verse 1 (9-16)
    for bar in range(9, 17):
        _groove(s, bar)
        if bar in (10, 12, 14):
            s.hit('drums', 'openhat', bar, 14, 0.40, **OHAT)
    s.hit('drums', 'crash', 9, 0, 0.45)
    for six, v in ((13, .45), (14, .6), (15, .75)):
        s.hit('drums', 'snare', 16, six, v, **SNARE)
    # build (17-20): groove, then a two-bar roll over the kick; hats drop out on 20
    for bar in (17, 18):
        _groove(s, bar)
        s.hit('drums', 'openhat', bar, 14, 0.42, **OHAT)
    _groove(s, 19, clap=False)
    _groove(s, 20, clap=False, hats='')
    s.roll('drums', 'snare', 19, 2, steps=(4, 2, 1, 0.5), vel=(0.3, 0.72), **SNARE)
    # hook 1 (21-28)
    for bar in range(21, 28):
        _groove(s, bar)
        if bar % 2 == 0 and bar != 24:
            s.hit('drums', 'openhat', bar, 14, 0.42, **OHAT)
    s.hit('drums', 'crash', 21, 0, 0.56)
    s.hit('drums', 'crash', 25, 0, 0.45)
    for six, v in ((14, .5), (15, .66)):
        s.hit('drums', 'snare', 24, six, v, **SNARE)
    # bar 28: the kit STOPS on beat 4 (a tom run on the and-of-3, no kick/clap on 4) so nothing of it rings into
    # the freeze on 29.1; the horn fall on 28 six 14 carries the gap.
    s.pattern('drums', 'kick', [28], '....x...........', vel=0.86, **KICK)
    s.pattern('drums', 'clap', [28], '....x...........', vel=0.84, **CLAP)
    s.pattern('drums', 'hat', [28], 'xo.oxo.ox.......', vel=0.42, accent=0.5, ghost=0.22, **HAT)
    _toms(s, 28, (9, 10, 11), 0.45, 0.6)
    # verse 2 (33-40): ghost snares join; 39-40 are the mini-build before the last hook
    for bar in range(33, 40):
        _groove(s, bar)
        s.pattern('drums', 'snare', [bar], '.......o.......o' if bar % 2 else '...............o', ghost=0.2, **SNARE)
        if bar in (34, 36, 38):
            s.hit('drums', 'openhat', bar, 14, 0.40, **OHAT)
    s.hit('drums', 'crash', 33, 0, 0.50)
    s.hit('drums', 'openhat', 36, 6, 0.36, **OHAT)
    _groove(s, 40, clap=False, hats='xo.oxo.o........')
    s.roll('drums', 'snare', 40, 1, steps=(2, 1, 1, 0.5), vel=(0.35, 0.8), **SNARE)
    # hook 2 (41-48): snare doubles the clap, ghost notes, crashes, tom fills
    for bar in range(41, 49):
        _groove(s, bar)
        s.pattern('drums', 'snare', [bar], '....x..o....x..o', vel=0.5, ghost=0.2, **SNARE)
        if bar % 2 == 0 and bar not in (44, 48):
            s.hit('drums', 'openhat', bar, 14, 0.44, **OHAT)
    s.hit('drums', 'crash', 41, 0, 0.58)
    s.hit('drums', 'crash', 45, 0, 0.50)
    s.hit('drums', 'snare', 44, 15, 0.42, **SNARE)                   # bar 44: the horn shout is the fill
    _toms(s, 48, (9, 11, 13, 14, 15), 0.45, 0.68)
    # outro (49-52): thin out, the crash on 52.1 rings with the last bed kick
    _groove(s, 49)
    s.hit('drums', 'crash', 49, 0, 0.55)
    _groove(s, 50, hats='x...x...x...x...')
    _groove(s, 51, kick=False, hats='x...x...x...x...')
    s.hit('drums', 'crash', 52, 0, 0.48)


# ── bass: off-beat saw, root/5th/octave, sidechained by every kick ──────────────────────────────────────────────────

def _approach(cur: int, nxt: int) -> int:
    a = nxt + 2
    return a if a != cur else nxt + 4


def bass(s: Song):
    B = BASS
    for bar in list(range(9, 17)) + list(range(33, 41)):          # verses
        ch = CH[bar]
        R = ROOT[ch]
        v2 = bar >= 33
        last_of_phrase = (bar - 9) % 4 == 3
        s.note('bass', 'pluck_bass', bar, 2, R, 2, .90, **B)
        s.note('bass', 'pluck_bass', bar, 6, R, 2, .78, **B)
        s.note('bass', 'pluck_bass', bar, 10, R, 2, .84, **B)
        if v2:
            s.note('bass', 'pluck_bass', bar, 11 if bar != 40 else 7, R + 12, 1, .45, **B)
        if bar == 40:                                                  # mini-build: 16th ghosts, G1 into the hook
            for six in (3, 11, 13):
                s.note('bass', 'pluck_bass', bar, six, R + 12, 1, .5, **B)
            s.note('bass', 'pluck_bass', bar, 14, 31, 2, .82, **B)
        elif last_of_phrase:
            nxt = ROOT[CH[bar + 1]]
            s.note('bass', 'pluck_bass', bar, 14, _approach(R, nxt), 2, .76, **B)
        else:
            s.note('bass', 'pluck_bass', bar, 14, R + 12, 2, .74, **B)
    # build
    for bar in (17, 18, 19):
        R = ROOT[CH[bar]]
        for six, v in ((2, .9), (6, .78), (10, .84)):
            s.note('bass', 'pluck_bass', bar, six, R, 2, v, **B)
        s.note('bass', 'pluck_bass', bar, 14, R + 12, 2, .74, **B)
        if bar == 19:
            for six in (3, 7, 11, 15):
                s.note('bass', 'pluck_bass', bar, six, R + 12, 1, .45, **B)
    for six in range(16):                                            # bar 20: rolling 16ths, rising in velocity
        s.note('bass', 'pluck_bass', 20, six, 34 + (12 if six % 2 else 0), 1, 0.5 + 0.2 * six / 15, **B)
    # hooks
    for bar in list(range(21, 29)) + list(range(41, 49)):
        R = ROOT[CH[bar]]
        h2 = bar >= 41
        idx = (bar - 21) % 4
        s.note('bass', 'pluck_bass', bar, 2, R, 2, .90, **B)
        s.note('bass', 'pluck_bass', bar, 7, R + 12, 1, .50 if h2 else .60, **B)   # answers the riff's six-6 stab
        if h2:
            s.note('bass', 'pluck_bass', bar, 10, R + 12, 2, .86, **{**B, 'from': R + 7, 'glide': 0.035})
        elif bar != 28:                                               # 28: the bass stops after six 7 (the break)
            s.note('bass', 'pluck_bass', bar, 10, R + 12, 2, .84, **B)
        if bar in (28, 48):                                           # no pickup into the break / the outro
            pass
        elif idx == 3:
            s.note('bass', 'pluck_bass', bar, 14, _approach(R, ROOT[CH[bar + 1]]), 2, .72 if h2 else .78, **B)
        else:
            s.note('bass', 'pluck_bass', bar, 14, R + 7, 2, .74, **B)
        if h2 and idx % 2 == 0:
            s.note('bass', 'pluck_bass', bar, 15, R + 12, 1, .5, **B)


# ── keys: THE HOOK (organ stab riff), EP + organ stabs in the verses, held organ + pad in the break ─────────────────

def _riff(s: Song, bar: int, chord: str, cells, vscale: float = 1.0, **org):
    for six, top, dur, v in cells:
        vc = stack(chord, top, 4)
        comp = (4.0 / len(vc)) ** (0.5 / 1.3)            # a 3-note stab plays as loud as a 4-note one
        s.chord('keys', 'organ', bar, six, vc, dur, min(1.0, v * vscale * comp), strum_ms=7, **org)


def keys(s: Song):
    # intro: the riff, dark and soft, the drawbars opening every two bars
    bars_open = {1: ((0, 0, 8, 3, 0, 0, 0, 0, 0), 0.0, .62), 3: ((0, 0, 8, 5, 2, 0, 0, 0, 0), 0.08, .68),
                 5: ((0, 0, 8, 6, 4, 0, 0, 0, 0), 0.15, .74), 7: ((0, 0, 8, 8, 6, 0, 0, 0, 0), 0.22, .80)}
    for bar in range(1, 9):
        db_, perc, vs = bars_open[bar - (bar - 1) % 2]
        cells = list(INTRO_RIFF[CH[bar]])
        if bar == 8:
            cells.append((14, 'Bb4', 2, .7))
        _riff(s, bar, CH[bar], cells, vs * 0.72, drawbars=db_, perc=perc, click=0.06)
    # verses: EP whole-bar chords + two organ stabs (six 6 and 14) carrying the riff's Eb-C shape
    prev = None
    for bar in list(range(9, 17)) + list(range(17, 19)) + list(range(33, 41)):
        ch = CH[bar]
        v = voicing(ch, center=60, rootless=True, prev=prev)
        prev = v
        if bar >= 33:
            s.chord('keys', 'ep', bar, 0, v, 8, .46, strum_ms=14, **EP)
            s.chord('keys', 'ep', bar, 10, v, 5, .40, strum_ms=10, **EP)
        else:
            s.chord('keys', 'ep', bar, 0, v, 14, .46, strum_ms=14, **EP)
        t6, t14 = VERSE_STABS[ch]
        if bar == 40:                                                 # mini-build: organ 8ths into the last hook
            for i, six in enumerate(range(0, 16, 2)):
                s.chord('keys', 'organ', bar, six, stack(ch, 'D5' if i % 2 == 0 else 'F5', 4), 1,
                        .5 + .22 * i / 7, strum_ms=7, **ORG_HOOK)
            continue
        s.chord('keys', 'organ', bar, 6, stack(ch, t6, 3), 1, .62, strum_ms=3, **ORG_VERSE)
        s.chord('keys', 'organ', bar, 14, stack(ch, t14, 3), 2, .52, strum_ms=3, **ORG_VERSE)
        if bar == 39:
            s.chord('keys', 'organ', bar, 10, stack(ch, 'C5', 3), 1, .55, strum_ms=3, **ORG_VERSE)
    # build 19-20 (Bb): the riff rhythm as a tease, then 8ths rising
    _riff(s, 19, 'Bb', [(0, 'D5', 1, .9), (3, 'D5', 1, .7), (6, 'F5', 2, .86), (10, 'D5', 1, .72),
                        (12, 'Bb4', 2, .8)], 0.78, **ORG_HOOK)
    for i, six in enumerate(range(0, 16, 2)):
        s.chord('keys', 'organ', 20, six, stack('Bb', 'D5' if i % 2 == 0 else 'F5', 4), 1, .5 + .22 * i / 7,
                strum_ms=7, **ORG_HOOK)
    # hooks: THE RIFF
    for bar in list(range(21, 29)) + list(range(41, 49)):
        idx = (bar - 21) % 4
        cells = HOOK_HOLD if bar == 28 else HOOK_RIFF[idx]
        if bar == 48:
            cells = [c for c in cells if c[0] < 14]
        _riff(s, bar, CH[bar], cells, 1.0, **ORG_HOOK)
        if bar >= 41:                                                 # hook 2: a low pad glues it
            s.chord('keys', 'pad', bar, 0, voicing(CH[bar], center=55, n=4), 15, .32, **PAD)
    # break (29-32): the keys are OUT (critic pass) so the freeze bars are bed + horns + fx; the fx vox pad carries
    # the Cm -> Ab harmony the organ used to hold.


# ── perc: shaker 16ths, an original conga figure, tamb in the hooks, rim in verse 2 ────────────────────────────────

CONGA_A = (('low', 'x.........x.....'), ('mid', '......x......x..'), ('high', '...x............'))
CONGA_B = (('low', 'x.....x.........'), ('mid', '...x......x..x..'), ('high', '...............x'))


def _congas(s: Song, bar: int, scale: float = 1.0, upto: int = 16):
    pat = CONGA_A if bar % 2 else CONGA_B
    for size, steps in pat:
        steps = steps[:upto] + '.' * (16 - upto)
        stroke = 'slap' if size == 'high' else 'open'
        s.pattern('perc', 'conga', [bar], steps, vel=(0.6 if size != 'high' else 0.58) * scale, size=size,
                  stroke=stroke)


def perc(s: Song):
    for bar in range(1, 53):
        if not s.plays('perc', bar):
            continue
        sec = s.section_at(bar)
        if bar <= 4:            # critic pass: +3.5 dB, it measured -41 dBFS alone (inaudible when earned)
            s.pattern('perc', 'shaker', [bar], 'oxoxoxoxoxoxoxox', vel=0.50, ghost=0.26, **SHAKER)
        elif bar == 52:         # the last bar: shaker to beat 2 + a low-mid conga goodbye on the downbeat
            s.pattern('perc', 'shaker', [bar], 'oxoxoxo.........', vel=0.46, ghost=0.26, **SHAKER)
            s.hit('perc', 'conga', bar, 0, 0.62, size='low', stroke='open')
            s.hit('perc', 'conga', bar, 3, 0.50, size='mid', stroke='open')
        else:
            e = sec.energy
            s.pattern('perc', 'shaker', [bar], 'oxoxoxoxoxoxoxox', vel=0.40 + 0.02 * e, ghost=0.22 + 0.01 * e,
                      **SHAKER)
        if 5 <= bar <= 50:
            if bar == 20:
                _congas(s, bar, upto=8)
                for i, six in enumerate(range(8, 16)):
                    s.hit('perc', 'conga', 20, six, 0.45 + 0.25 * i / 7, size='mid' if i % 2 == 0 else 'high',
                          stroke='open')
            else:
                _congas(s, bar, 0.85 if bar <= 8 else 1.0)
        if sec.name == 'hook' and bar < 41:
            s.pattern('perc', 'tamb', [bar], '..x...x...x...x.', vel=0.35, decay=0.1)
        if bar >= 41 and sec.name == 'hook':
            s.pattern('perc', 'tamb', [bar], 'o.x.o.x.o.x.o.x.', vel=0.40, ghost=0.2, decay=0.1)
        if 33 <= bar <= 48 and sec.name in ('verse', 'hook'):
            s.hit('perc', 'rim', bar, 7, 0.5)
            if bar % 2 == 0 and bar >= 41:
                s.hit('perc', 'rim', bar, 15, 0.42)


# ── horns: stabs on 2& doubling the riff's accent, falls on 4&, the break's freeze hits and swells ──────────────────

def horns(s: Song):
    for bar in list(range(21, 29)) + list(range(41, 49)):
        idx = (bar - 21) % 4
        ch = CH[bar]
        h2 = bar >= 41
        H = HORN2 if h2 else HORN
        v6 = stack(ch, HORN_STAB_TOP[idx], 3)
        s.chord('horns', 'brass', bar, 6, v6, 1, .72, strum_ms=6, **dict(HORN_BLEND, voices=H['voices']))
        if h2:
            s.chord('horns', 'brass', bar, 6, [m + 12 for m in v6], 1, .34, strum_ms=6, **HORN_BLEND)
            if idx == 3:                                              # the shout at each phrase end
                for six, top, d in ((8, 'Bb4', 1), (10, 'C5', 1), (12, 'Eb5', 2)):
                    s.chord('horns', 'brass', bar, six, stack(ch, top, 3), d, .80, strum_ms=4, **H)
        if idx in (1, 3):
            top = 'F5' if (h2 and idx == 3) else HORN_FALL_TOP[idx]
            s.chord('horns', 'brass', bar, 14, stack(ch, top, 3), 2, .66 if (h2 and idx == 3) else .74, strum_ms=6,
                    fall=2, **H)
    # the break: FREEZE hits on 29.1 and 31.1, swells between
    FREEZE = dict(bright=0.85, attack=0.012, voices=3, scoop=-25.0)
    SWELL = dict(bright=0.4, attack=0.35, voices=3, scoop=0.0, sustain=0.95)
    s.chord('horns', 'brass', 29, 0, [63, 67, 70, 74], 4, .95, strum_ms=5, **FREEZE)
    s.chord('horns', 'brass', 29, 10, [63, 67, 70, 74], 12, .62, strum_ms=8, **SWELL)
    s.chord('horns', 'brass', 31, 0, [63, 67, 70, 72], 4, .95, strum_ms=5, **FREEZE)
    s.chord('horns', 'brass', 31, 10, [63, 67, 70, 72], 20, .64, strum_ms=8, fall=2, **SWELL)
    # critic pass — verse 1: a soft section pad on beat 3 of every bar, between the organ's six-6 and six-14 stabs
    # (slow attack, so it never stacks on the bed kick at six 8); the last one falls off into the build.
    PAD_H = dict(bright=0.35, attack=0.10, voices=3, scoop=0.0, sustain=0.9)
    for bar in range(9, 17):
        v = HORN_PAD[CH[bar]]
        if bar == 16:
            s.chord('horns', 'brass', bar, 8, v, 4, .48, strum_ms=8, fall=1, **PAD_H)
        else:
            s.chord('horns', 'brass', bar, 8, v, 5, .46 if bar % 2 else .42, strum_ms=8, **PAD_H)
    # outro: three sighing swells (Cm9, Abmaj9, Cm9) off beat 2, then a C minor chord on the last hit, 52.1
    OUT_H = dict(bright=0.32, attack=0.25, voices=3, scoop=0.0, sustain=0.9)
    s.chord('horns', 'brass', 49, 4, HORN_PAD['Cm9'], 10, .50, strum_ms=8, **OUT_H)
    s.chord('horns', 'brass', 50, 4, HORN_PAD['Abmaj9'], 10, .48, strum_ms=8, **OUT_H)
    s.chord('horns', 'brass', 51, 4, HORN_PAD['Cm9'], 8, .46, strum_ms=8, **OUT_H)
    s.chord('horns', 'brass', 52, 0, [60, 63, 67], 6, .50, strum_ms=6, bright=0.45, attack=0.03, voices=3,
            scoop=-20.0, release=0.3)


# ── lead: the wordless vox (build notes, the hook melody, verse-2 answers) ──────────────────────────────────────────

def _vox_phrases(s: Song, start_bar: int, notes, shift: int = 0, vscale: float = 1.0, **params):
    """Split a note list into breaths (a gap of more than a sixteenth starts a new phrase) and add them."""
    seq = sorted(((start_bar + b, six, midi(p) + shift, d, v * vscale) for b, six, p, d, v in notes),
                 key=lambda x: (x[0], x[1]))
    group = [seq[0]]
    for n in seq[1:]:
        pb, ps, _, pd, _ = group[-1]
        if (n[0] - 1) * 16 + n[1] - ((pb - 1) * 16 + ps + pd) > 0.5:
            s.phrase('lead', 'vox_lead', group, **params)
            group = []
        group.append(n)
    s.phrase('lead', 'vox_lead', group, **params)


def lead(s: Song):
    # build: four long rising notes, legato
    s.phrase('lead', 'vox_lead', [(17, 0, 'C5', 16, .55), (18, 0, 'Eb5', 16, .62), (19, 0, 'F5', 16, .70),
                                  (20, 0, 'G5', 15, .78)], **VOX)
    # hooks
    for start, end_cells, h2 in ((21, VOX_END_OPEN, False), (41, VOX_END_HOME, True)):
        for half in (0, 4):
            cells = list(VOX_HOOK) if half == 0 else [c for c in VOX_HOOK if c[0] < 3] + list(end_cells)
            _vox_phrases(s, start + half, cells, **(dict(VOX, vowel='a') if h2 else VOX))
            if h2:                                                     # hook 2: an "oo" choir an octave down
                for b, six, p, d, v in cells:
                    s.note('lead', 'vox', start + half + b, six, midi(p) - 12, d, 0.42 * v, vowels=('u', 'o'),
                           attack=0.06, release=0.18, voices=3, morph='swell')
    # verse 2: an answer after each organ stab; 39-40 rise into the last hook
    answers = {
        33: [(8, 'Eb5', 2, .62), (10, 'F5', 2, .64), (12, 'G5', 3, .68)],
        34: [(8, 'G5', 2, .64), (10, 'F5', 2, .62), (12, 'Eb5', 3, .64)],
        35: [(8, 'Bb4', 2, .60), (10, 'C5', 2, .62), (12, 'Eb5', 3, .66)],
        36: [(8, 'F5', 3, .64), (11, 'G5', 4, .66)],
        37: [(8, 'Eb5', 2, .62), (10, 'F5', 2, .64), (12, 'G5', 3, .68)],
        38: [(8, 'G5', 2, .64), (10, 'Eb5', 2, .62), (12, 'C5', 3, .64)],
    }
    for bar, cells in answers.items():
        s.phrase('lead', 'vox_lead', [(bar, six, p, d, v) for six, p, d, v in cells], **VOX)
    s.phrase('lead', 'vox_lead', [(39, 0, 'Eb5', 16, .62), (40, 0, 'F5', 8, .68), (40, 8, 'G5', 7, .76)], **VOX)
    # critic pass — outro: the vox says goodbye with the hook's head (C Bb G), rises Eb F G over Abmaj9 and settles
    # on C, held into the last hit (ends 52 six 8; only tails after).
    s.phrase('lead', 'vox_lead', [(49, 0, 'C6', 4, .70), (49, 4, 'Bb5', 2, .64), (49, 6, 'G5', 10, .66),
                                  (50, 0, 'Eb5', 6, .62), (50, 6, 'F5', 2, .60), (50, 8, 'G5', 8, .64),
                                  (51, 0, 'Eb5', 8, .60), (51, 8, 'C5', 16, .60)], **VOX)


# ── fx: vox pads, washes, risers, impacts, sweeps, reverse swells and canal drips ───────────────────────────────────

def _drips(s: Song, bar: int, sixes, vel: float = 0.42):
    for six in sixes:
        note = DRIP_NOTES[int(hrand(SEED, 'drip', bar, six) * len(DRIP_NOTES))]
        rise = 1.5 + 0.5 * hrand(SEED, 'drip-rise', bar, six)
        s.note('fx', 'drip', bar, six, note, 1, vel * (0.8 + 0.4 * hrand(SEED, 'drip-v', bar, six)),
               rise=round(rise, 2))


TWINKLE = {0: (3, 9, 13), 1: (5, 11), 2: (3, 9, 13), 3: (5, 11, 14)}     # the canal-lights motif, per bar of a phrase


def _twinkle(s: Song, bar: int, phrase_bar: int, vel: float):
    _drips(s, bar, TWINKLE[phrase_bar % 4], vel)


def fx(s: Song):
    W = dict(WASH)
    # intro: wordless vox pad (common tones of Cm9 and Abmaj9), drips, a reverse swell into the verse
    s.chord('fx', 'vox', 1, 0, [63, 67, 72], 64, .55, strum_ms=40, vowels=('u', 'a'), attack=1.4, release=1.2)
    s.chord('fx', 'vox', 5, 0, [63, 67, 70], 62, .58, strum_ms=40, vowels=('a', 'o'), attack=0.8, release=1.0)
    for bar, sixes in ((2, (10, 13)), (4, (6, 12, 14)), (6, (10, 13)), (8, (4, 7, 11))):
        _drips(s, bar, sixes)
    s.fx_into('fx', 'reverse', 9, 0, 8, .55, pitches=[60, 63, 67])
    # verse 1: a pumping wash + the twinkle motif; a sweep into the build
    s.fx('fx', 'wash', 9, 0, 64, .54, **W)
    s.fx('fx', 'wash', 13, 0, 64, .56, **W)
    for bar in range(9, 17):
        _twinkle(s, bar, bar - 9, 0.50)
    s.fx('fx', 'sweep', 16, 8, 8, .55)
    # build: the 4-bar riser 17.1 -> 21.1 over a brighter wash
    s.fx('fx', 'wash', 17, 0, 64, .42, lo=500.0, hi=4000.0, rate=0.15, q=1.2)
    s.fx_into('fx', 'riser', 21, 0, 64, .70, tone='C3', lo=250.0, hi=9000.0)
    # hook 1: impact, wash, twinkles, whooshes at the phrase ends
    s.hit('fx', 'impact', 21, 0, .42, tune=42.0, decay=0.8)
    s.fx('fx', 'wash', 21, 0, 64, .54, **W)
    s.fx('fx', 'wash', 25, 0, 64, .56, **W)
    for bar in range(21, 29):
        _twinkle(s, bar, bar - 21, 0.54)
    s.fx('fx', 'sweep', 24, 8, 8, .50)
    s.fx('fx', 'sweep', 28, 8, 8, .55)
    # break: downsweep in, vox pad, drips, reverse swell out
    s.fx('fx', 'downsweep', 29, 0, 16, .60)
    # the vox pad carries the break's harmony (the keys are out): C-Eb-G for Cm9, then Ab-Eb-G for Abmaj9
    s.chord('fx', 'vox', 29, 0, [60, 63, 67], 32, .60, strum_ms=40, vowels=('o', 'a'), attack=0.9, release=1.0)
    s.chord('fx', 'vox', 31, 0, [56, 63, 67], 30, .60, strum_ms=40, vowels=('a', 'o'), attack=0.7, release=1.0)
    _drips(s, 30, (2, 5, 9))
    _drips(s, 32, (1, 6))
    s.fx_into('fx', 'reverse', 33, 0, 8, .60, pitches=[60, 63, 67])
    # verse 2: washes, twinkles, the 2-bar riser into the last hook
    s.fx('fx', 'wash', 33, 0, 64, .54, **W)
    s.fx('fx', 'wash', 37, 0, 64, .56, **W)
    for bar in range(33, 39):
        _twinkle(s, bar, bar - 33, 0.50)
    s.fx_into('fx', 'riser', 41, 0, 32, .66, tone='C3', lo=300.0, hi=9000.0)
    # hook 2
    s.hit('fx', 'impact', 41, 0, .36, tune=42.0, decay=0.8)
    s.fx('fx', 'wash', 41, 0, 64, .56, **W)
    s.fx('fx', 'wash', 45, 0, 64, .58, **W)
    for bar in range(41, 49):
        _twinkle(s, bar, bar - 41, 0.58)
    s.fx('fx', 'sweep', 44, 8, 8, .52)
    s.fx_into('fx', 'reverse', 45, 0, 4, .45, pitches=[65, 68, 72])
    # outro: vox pad home on C minor, a last wash, drips
    s.chord('fx', 'vox', 49, 0, [60, 63, 67], 56, .58, strum_ms=40, vowels=('o', 'u'), attack=0.8, release=1.5)
    s.fx('fx', 'wash', 49, 0, 56, .40, **W)
    _drips(s, 50, (6, 10))
    _drips(s, 51, (3, 11))
    _drips(s, 52, (2,), 0.36)


# fel_synth 1.0.0 declares StemMix.gain_db but process_stem never applies it, so the stem balance is set with a flat
# EQ band instead: a low-shelf at 1 MHz is exactly flat (+-0.00 dB) across 0-22 kHz at the given gain.
GAIN = {'bed': -1.0, 'drums': -0.5, 'bass': -3.0, 'keys': 0.5, 'perc': -1.0, 'horns': -1.5, 'lead': 0.0, 'fx': 3.0}


def _g(stem: str) -> tuple:
    return ('lowshelf', 1e6, GAIN[stem])


def mix(s: Song):
    s.mix['bed'] = StemMix(gain_db=GAIN['bed'], eq=[('hp', 32.0), _g('bed')], reverb=0.05, reverb_type='room')
    s.mix['drums'] = StemMix(gain_db=GAIN['drums'], eq=[('hp', 32.0), _g('drums')], drive=0.1, reverb=0.10,
                             reverb_type='room')
    s.mix['bass'] = StemMix(gain_db=GAIN['bass'], eq=[('hp', 30.0), ('lp', 4500.0, 0.7), _g('bass')], drive=0.2,
                            duck=0.45, duck_release=0.12)
    s.mix['keys'] = StemMix(gain_db=GAIN['keys'], eq=[('hp', 140.0), ('lowshelf', 300.0, -2.0),
                                                      ('peak', 2200.0, 1.0, 1.0), _g('keys')],
                            drive=0.14, reverb=0.2, reverb_type='plate', duck=0.35, duck_release=0.12, pan=-0.2)
    s.mix['perc'] = StemMix(gain_db=GAIN['perc'], eq=[('hp', 180.0), _g('perc')], reverb=0.14, reverb_type='room',
                            pan=0.35)
    s.mix['horns'] = StemMix(gain_db=GAIN['horns'], eq=[('hp', 160.0), ('peak', 2500.0, 1.5, 0.8), _g('horns')],
                             reverb=0.2, reverb_type='plate', duck=0.25, duck_release=0.12, pan=0.25)
    s.mix['lead'] = StemMix(gain_db=GAIN['lead'], eq=[('hp', 220.0), ('peak', 3000.0, 1.5, 1.0), _g('lead')],
                            reverb=0.2, reverb_type='plate', delay=0.14, delay_16ths=3.0, delay_fb=0.3, pan=0.05)
    s.mix['fx'] = StemMix(gain_db=GAIN['fx'], eq=[('hp', 60.0), _g('fx')], reverb=0.3, reverb_type='hall', duck=0.3,
                          duck_release=0.12, pan=-0.1, width=0.9)


def stamp_modules(out_root: str | None = None):
    """Record the added voice module in the map's provenance (git-free content hash), next to script + library."""
    here = os.path.dirname(os.path.abspath(__file__))
    out_root = out_root or os.path.join(os.path.dirname(here), 'songs')
    mp = os.path.join(out_root, ID, 'map.json')
    if not os.path.exists(mp):
        return
    with open(mp) as fh:
        m = json.load(fh)
    vp = os.path.join(here, 'voices_canals.py')
    with open(vp, 'rb') as fh:
        h = hashlib.sha256(fh.read()).hexdigest()
    m['provenance']['modules'] = {'voices_canals.py': {'path': vp, 'sha256': h, 'adds': ['drip']}}
    with open(mp, 'w') as fh:
        json.dump(m, fh, indent=1)
        fh.write('\n')


if __name__ == '__main__':
    main(build, __file__)
    stamp_modules(sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None)
