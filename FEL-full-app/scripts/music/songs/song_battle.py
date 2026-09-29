#!/usr/bin/env python3
"""song_battle.py — "Breakwater" (id `battle`), FEL house song #4, difficulty 4.

A b-boy breakbeat for the battle at the breakwater: an original two-bar drum break, a square-wave octave-pump bass,
saw stabs and a gospel organ, congas / tambourine / cowbell / snaps, and a bright brass riff harmonised in triads
that IS the hook, doubled an octave up by a saw lead. Scrubs (the synthetic scratch) answer the horns.
112 BPM, G minor, swing 0.52, 48 bars (102.86 s), seed 0xBA77, 68 taps/min, hook stem = horns, preview bars 13-28.

    /Users/elijahbonds/.cache/fel-kokoro/.venv/bin/python songgen/song_battle.py     # -> songs/battle/ + validate

Arrangement (bars are 1-based; e = energy):

    intro   1-4   e2  bed perc horns fx     horn fanfare (swell, the riff's head, swell, a D7#9 kick-off) over congas +
                                            snaps; scrubs answer the horns in bars 2 and 4; a reverse swell into bar 5
    verse   5-12  e3  +drums bass keys      the break drops (crash), octave-pump bass, saw stabs; horns rest
                      perc fx (no horns)
    hook   13-20  e4  all                   the brass riff; organ + stabs; tambourine 8ths; the saw lead doubles the
                                            horn line an octave up; a scrub answers every even bar's rest
    break  21-24  e3  bed drums horns fx    the break alone with horn stabs (21, 23); on the downbeats of 22 and 24 it
                                            STOPS for the whole bar: the horns hit (Ebmaj7, then D7#9) and hang, a
                                            scrub answers on beat 3, the bed keeps the pulse = the freeze
    verse  25-32  e3  +bass keys perc lead  the groove back; saw-lead call/answer phrases; organ under the stabs
    build  33-36  e4  all                   16th hats, a rising saw-lead arpeggio (two octaves), snare roll 35-36,
                                            kick quarters in 36 with the stabs on the &s between them, 8th-note bass,
                                            conga roll, 2-bar riser, one horn swell a bar (top D5 - G5 - F#5 - A5,
                                            into the riff's Bb5)
    hook   37-44  e5  all                   the riff with everything: ride (beats 1, 3 and the &s), cowbell, tamb,
                                            bass ghosts, a 4-player brass section, crash on 37 and 41
    outro  45-48  e3  bed drums horns       the break with horn hits on each downbeat (Gm7, Ebmaj7, D7#9) and the last
                      lead fx               hit on 48.1 (open Gm, dur 12, a 4-semitone fall) ringing out; the saw lead
                                            doubles the hits' top line an octave up

Critic pass (2026-09-25), three changes from the composer's render, measured on the decoded stems (the new
material is the song's own: sustained chord swells and an octave doubling of the outro's horn line):
  - horns and lead each played in 28 of 48 bars (58 %); an earned instrument must be audible on its own (bar RMS
    above -40 dBFS) in at least 60 % of the song. The build now lists horns (a swell a bar) and the outro lists the
    lead (the hits' top line an octave up): 32 bars each (67 %).
  - The spec's stop at six 8 of 22 / 24 left bed + drums + horns + fx in each freeze bar, and the snare's tail
    measured -38 dBFS inside the freeze. The break now stops on the downbeat: 22 and 24 are bed + horns + fx for
    the whole bar (the drums stem rests exactly one bar each time, inside the no-holes rule).
  - Bar 36 (the build's last bar) is the song's loudest coincidence; the new horn swell there pushed the shared
    peak guard past 3 dB (the target slid). The bar-36 stabs moved off the kick quarters onto the downbeat and the
    &s, and the conga roll tops out at 0.78 instead of 0.85: the guard is 2.5 dB (the composer's render: 2.76).

The hook (horns, top line; triads under it, each chosen from G natural minor -- G harmonic minor over D7 -- as the
diatonic triad that contains the top note and shares the most tones with the bar's chord):

    Gm / Eb bars   0 Bb5 (2)  2 G5 (1)  6 A5 (2)  9 F5 (1)  11 G5 (4, fall 2)       the same notes over two chords
    F bar          2 F5 (1)   3 G5 (1)  4 A5 (2)  7 C6 (1)   8 A5 (4)
    D7 bar         2 F#5 (1)  3 G5 (1)  4 A5 (2)  7 C6 (1)   8 A5 (4)                (the F bar's answer, F -> F#)
    last D7 bar    2 F#5  3 G5  4 A5  5 C6 (1 each)  6 D6 (6, fall 3)                  the run that ends each hook

IP check (hard rule; CONTRACT.md s.6, SONGS.md rules). Everything is synthesised by fel_synth voices (sine/noise
drums, band-limited oscillators, FM, filtered noise, additive leads); no samples, no loops, no audio files are read,
no custom voices are added. No vocals of any kind (not even the wordless vox). The chord progressions are the spec's
(verse Gm7-Gm7-Ebmaj7-D7#9, hook i-VII-VI-V, build Ebmaj7x2-D7#9x2). Everything melodic was written for this song:
  - The SONGS.md sketch's hook head (D-D-F-G on sixteenths 0/3/6/8) was DROPPED: a repeated note, a minor third up
    and a whole step up in a 3+3+2 rhythm is the "Mission: Impossible" theme's motif, transposed. The riff above is
    a zig-zag (down a third, up a step, down a third, up a step to a held, falling note) that repeats over Gm and
    Eb (so it turns from minor into lydian colour), answered by a rising F-G-A-C-A figure. Sung against the tunes we
    know it matches none of them (checked in particular against Smoke on the Water, Seven Nation Army, Hit the Road
    Jack, Peter Gunn, Pick Up the Pieces, Vehicle, 25 or 6 to 4, Sing Sing Sing, Gonna Fly Now, It's Just Begun).
  - The lead's verse calls avoid the rising m3 + M2 cell (G-Bb-C, the Smoke on the Water head): they open with
    arpeggio leaps (Bb-D-G, C-D-G, F-G-Bb, D-G-F-Bb) and answer with descending lines.
  - The drum break is ours and differs from the SONGS.md sketch, whose snare (2, 2a, 3e, 4) and kick placements sat
    too close to the Amen family: A = kick 1 / 2& / 3a (the bed owns beat 1), snare 2 & 4, ghosts 1& and 4&;
    B = kick 1a / 3e / 4&, snare 2 & 4, ghosts 2& and 3a, open hat on 4&. Not the Amen, Funky Drummer, Apache,
    Think, Impeach the President, Big Beat, It's Just Begun or the 808 electro "Planet Rock" kick.
  - Bass: root/octave pump (a generic disco/breakbeat device) with our approach notes (F#, F, D, the b7).
  - Congas: our 8-stroke bar (low open / mid open / high slap with mutes), not a tumbao.

Mix notes (all measured by analyze_battle.py on the decoded stems):
  - fel_synth 1.0.0 never applies StemMix.gain_db, so the faders ride in each stem's EQ list (`fader()`).
  - No master compression (CONTRACT.md s.2.4). The sum's peak-to-loudness is set by the arrangement, so the peak
    guard was brought from ~5 dB (first draft) to ~2.5 dB by arrangement, not by processing: the snare is fatter and
    a touch lower (lofi grit + a longer tail = more loudness per peak), the toms and the build roll top out lower,
    the crash is shorter, the congas and the impact leave the hook downbeats to the horns and the bed kick, the bass
    softens the riff's downbeats and ducks under every kick, the ride skips the backbeats, and the bass pump -- the
    most loudness-per-peak stem in the song -- sits high. Stem-level drive on the summed kit was removed: it squared
    off the kick bodies and left kinks the click check flagged. High shelves on the drums were tried and dropped:
    their MP3 overshoot on the sum cost ~1 dB of loudness in the encoder's peak trim.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fel_synth import Song, Section, StemMix, voicing, midi, parse_chord, main  # noqa: E402

ID = 'battle'
SEED = 0xBA77
BARS = 48
ALL = ('bed', 'drums', 'bass', 'keys', 'perc', 'horns', 'lead', 'fx')

SECTIONS = [
    Section('intro', 1, 4, 2, ('bed', 'perc', 'horns', 'fx')),
    Section('verse', 5, 8, 3, ('bed', 'drums', 'bass', 'keys', 'perc', 'fx')),
    Section('hook', 13, 8, 4, ALL),
    Section('break', 21, 4, 3, ('bed', 'drums', 'horns', 'fx')),
    Section('verse', 25, 8, 3, ('bed', 'drums', 'bass', 'keys', 'perc', 'lead', 'fx')),
    # critic pass: the build gains horn swells and the outro the saw lead, so horns and lead (the freeze and power
    # instruments) each play in 32 of the 48 bars (67 %), not 28 (58 %): an earned instrument must be audible on
    # its own in at least 60 % of the song (the spec's lists left both at 58 %)
    Section('build', 33, 4, 4, ALL),
    Section('hook', 37, 8, 5, ALL),
    Section('outro', 45, 4, 3, ('bed', 'drums', 'horns', 'lead', 'fx')),
]

VERSE = ['Gm7', 'Gm7', 'Ebmaj7', 'D7#9']
HOOK = ['Gm', 'F', 'Eb', 'D7']                  # i - VII - VI - V
BUILD = ['Ebmaj7', 'Ebmaj7', 'D7#9', 'D7#9']
BREAK = ['Gm7', 'Ebmaj7', 'Gm7', 'D7#9']        # 22 / 24 carry the freeze hits' chords
OUTRO = ['Gm7', 'Ebmaj7', 'D7#9', 'Gm']
PROGRESSION = {'intro': VERSE, 'verse': VERSE, 'hook': HOOK, 'break': BREAK, 'build': BUILD, 'outro': OUTRO}
HOOK_STARTS = (13, 37)


def chord_of(bar: int) -> str:
    if bar <= 4:
        return VERSE[bar - 1]
    if bar <= 12:
        return VERSE[(bar - 5) % 4]
    if bar <= 20:
        return HOOK[(bar - 13) % 4]
    if bar <= 24:
        return BREAK[bar - 21]
    if bar <= 32:
        return VERSE[(bar - 25) % 4]
    if bar <= 36:
        return BUILD[bar - 33]
    if bar <= 44:
        return HOOK[(bar - 37) % 4]
    return OUTRO[bar - 45]


# ── harmony helpers ────────────────────────────────────────────────────────────────────────────────────────────────

NAT = (7, 9, 10, 0, 2, 3, 5)        # G natural minor: G A Bb C D Eb F
HARM = (7, 9, 10, 0, 2, 3, 6)       # G harmonic minor (over D7): F -> F#
# a passing A over Eb reads better as the lydian upper structure (D F A = maj7 / 9 / #11) than as A C Eb
TRIAD_OVERRIDE = {('Eb', 9): (2, 5, 9)}


def chord_pcs(sym: str) -> set[int]:
    root, ivs, _ = parse_chord(sym)
    return {(root + i) % 12 for i in ivs}


def triad_under(top, sym: str) -> list[float]:
    """Close-position brass triad with `top` as the top note: the diatonic triad (G natural minor, harmonic over a D
    chord) that contains the top note and shares the most tones with the chord (ties -> contains the root)."""
    top = midi(top)
    tpc = int(round(top)) % 12
    root = parse_chord(sym)[0]
    tri = TRIAD_OVERRIDE.get((sym, tpc))
    if tri is None:
        scale = HARM if sym.startswith('D') else NAT
        cp = chord_pcs(sym)
        best = None
        for d in range(7):
            t = (scale[d], scale[(d + 2) % 7], scale[(d + 4) % 7])
            if tpc not in t:
                continue
            score = 10 * len(set(t) & cp) + (5 if root in t else 0) + (3 if t[0] == root else 0)
            if best is None or score > best[0]:
                best = (score, t)
        tri = best[1]
    others = [pc for pc in tri if pc != tpc]
    return sorted([top - ((tpc - pc) % 12) for pc in others] + [top])


def fader(gain_db: float) -> list:
    """A flat gain as an EQ pair: a low shelf and a high shelf at the same corner multiply to exactly gain_db at
    every frequency (checked to 1e-12 dB from 10 Hz to 22 kHz)."""
    return [('lowshelf', 1000.0, gain_db), ('highshelf', 1000.0, gain_db)] if gain_db else []


def low_root(sym: str) -> float:
    """Bass root in octave 1 (G1 31 ... D1 26), as the spec's octave pump asks."""
    return float(24 + parse_chord(sym)[0])


# ── the hook riff (horns top line) ─────────────────────────────────────────────────────────────────────────────────

RIFF_ODD = [(0, 'Bb5', 2, 0.88), (2, 'G5', 1, 0.8), (6, 'A5', 2, 0.92), (9, 'F5', 1, 0.82), (11, 'G5', 4, 0.96)]
RIFF_F = [(2, 'F5', 1, 0.82), (3, 'G5', 1, 0.82), (4, 'A5', 2, 0.92), (7, 'C6', 1, 0.95), (8, 'A5', 4, 0.9)]
RIFF_D = [(2, 'F#5', 1, 0.82), (3, 'G5', 1, 0.82), (4, 'A5', 2, 0.92), (7, 'C6', 1, 0.95), (8, 'A5', 4, 0.9)]
RIFF_END = [(2, 'F#5', 1, 0.85), (3, 'G5', 1, 0.85), (4, 'A5', 1, 0.9), (5, 'C6', 1, 0.92), (6, 'D6', 6, 1.0)]


def riff_bar(i: int) -> list[tuple]:
    """Top line of hook bar i (0..7)."""
    if i in (0, 2, 4, 6):
        return RIFF_ODD
    if i in (1, 5):
        return RIFF_F
    if i == 3:
        return RIFF_D
    return RIFF_END


# ── the kit ────────────────────────────────────────────────────────────────────────────────────────────────────────

KIT = {
    'kick': dict(tune=55.0, punch=175.0, decay=0.26, click=0.18, drive=0.25, pitch_tau=0.03),
    'snare': dict(tune=195.0, decay=0.2, snappy=0.8, body=0.7, tone=0.55, lofi=0.7),
    'hat': dict(decay=0.034, tone=0.45, metal=0.5),
    'openhat': dict(decay=0.24, tone=0.4),
    'pedalhat': dict(),
    'ride': dict(decay=0.8, bell=0.15),
}
# voice -> (normal 'x', accent 'X', ghost 'o')
VEL = {'kick': (0.85, 1.0, 0.5), 'snare': (0.8, 0.88, 0.28), 'hat': (0.48, 0.6, 0.27), 'openhat': (0.45, 0.55, 0.3),
       'pedalhat': (0.4, 0.5, 0.25), 'ride': (0.34, 0.42, 0.25)}

# the break (2 bars). The bed owns kick on 1 and the hats on the off-beat 8ths (2, 6, 10, 14): the drums never
# repeat those (SONGS.md rule 4).
BREAK_A = {'kick': '......x....x....', 'snare': '..g.X.......X.o.', 'hat': 'x...x..ox...x..o'}
BREAK_B = {'kick': '...x.....x....x.', 'snare': '....X.o....oX...', 'hat': 'x...x...x...xo..', 'openhat': '..............x.'}
# hook 1 (e4): one more ghost in A, a 16th hat lift in B
BREAK_A4 = {'kick': '......x....x....', 'snare': '..g.X..o....X.o.', 'hat': 'x...x..ox...x..o'}
BREAK_B4 = {'kick': '...x.....x....x.', 'snare': '....X.o....oX..g', 'hat': 'x...xo..x...xo..', 'openhat': '..............x.'}
# the break section's second A: an extra kick on 4e and a ghost on 3e
BREAK_A2 = {'kick': '......x....x.x..', 'snare': '..g.X....o..X.o.', 'hat': 'x...x..ox...x..o'}
# the stop bars (22, 24) have NO drums: the break plays 21 / 23 through and stops on the downbeat of 22 / 24, so the
# whole freeze bar is bed + horns + fx (the spec's stop at six 8 left the kit in the first half of the break bar:
# bed + drums + horns + fx, and a snare tail at -38 dBFS inside the freeze). In the bars before a stop the kick
# tightens (decay 0.14 s, not 0.26): the long kick body was what rang on into the freeze bar.
TIGHT_KICK = dict(KIT['kick'], decay=0.14)
# the fill bar: B's front half, then toms high -> low
BREAK_FILL = {'kick': '...x.....x......', 'snare': '....X.o.........', 'hat': 'x...x...x.......'}
FILL_TOMS = [(11, 'high', 0.56), (12, 'high', 0.69), (13, 'mid', 0.6), (14, 'mid', 0.69), (15, 'low', 0.76)]
# build: 16ths with the bed's hats (every position the bed does not play)
BUILD_HATS = 'Xo.oXo.oXo.oXo.o'


def drum_bar(s: Song, bar: int, pat: dict, hats_over: str | None = None, ride: bool = False, tight: bool = False):
    for vname, steps in pat.items():
        if vname == 'hat' and hats_over is not None:
            steps = hats_over
        n, a, g = VEL[vname]
        kit = TIGHT_KICK if (tight and vname == 'kick') else KIT[vname]
        s.pattern('drums', vname, [bar], steps, vel=n, accent=a, ghost=g, **kit)
    if ride:
        n, a, g = VEL['ride']
        # the ride rides beats 1 and 3 and the &s, and leaves the backbeats to the snare
        s.pattern('drums', 'ride', [bar], 'x.o...o.x.o...o.', vel=n, accent=a, ghost=g, **KIT['ride'])


def fill_toms(s: Song, bar: int):
    for six, size, v in FILL_TOMS:
        s.hit('drums', 'tom', bar, six, v, size=size, decay=0.26)


# ── congas ─────────────────────────────────────────────────────────────────────────────────────────────────────────

CONGA_A = [(0, 'low', 'open', 0.85), (3, 'mid', 'open', 0.62), (6, 'high', 'slap', 0.8), (7, 'high', 'mute', 0.34),
           (10, 'low', 'open', 0.74), (11, 'mid', 'mute', 0.34), (13, 'mid', 'open', 0.64), (14, 'high', 'slap', 0.6)]
CONGA_B = CONGA_A[:7] + [(13, 'mid', 'open', 0.64), (14, 'high', 'open', 0.7), (15, 'high', 'open', 0.5)]


def congas(s: Song, bar: int, alt: bool, lift: float = 1.0, skip_downbeat: bool = False):
    for six, size, stroke, v in (CONGA_B if alt else CONGA_A):
        if six == 0 and skip_downbeat:
            continue
        s.hit('perc', 'conga', bar, six, min(1.0, v * lift), size=size, stroke=stroke)


# ── build ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def build() -> Song:
    s = Song(id=ID, title='Breakwater', style='b-boy breakbeat', bpm=112, key='G minor', bars=BARS, seed=SEED,
             difficulty=4, target_taps_per_min=68, swing=0.52, hook_stem='horns', sections=SECTIONS,
             break_bars=[22, 24], preview_start_bar=13, progression=PROGRESSION,
             notes=('Original composition generated from code (song_battle.py + fel_synth); no samples, no vocals. '
                    'Hook = the brass riff (Bb-G / A / F-G fall, answered F-G-A-C-A), triads under the top line, '
                    'doubled an octave up by the saw lead. Freezes: the whole of bars 22 and 24 (the break stops on '
                    'the downbeat, horn hit + scrub; the bed keeps the pulse). Horn swells in the build and the lead '
                    'in the outro keep both instruments in 32 of 48 bars. The SONGS.md sketch\'s hook head was replaced (it matched the '
                    'Mission: Impossible motif) and its break was rewritten (too close to the Amen family).'))

    # ── mix ── fel_synth 1.0.0 declares StemMix.gain_db but process_stem never applies it, so each stem's fader
    # rides in its EQ list (a low shelf + a high shelf at the same corner = an exactly flat gain; pre-send).
    # gain_db stays 0 so a library fix cannot double-apply it.
    F = {'bed': 0.0, 'drums': 1.0, 'bass': 0.5, 'keys': 1.0, 'perc': 3.0, 'horns': -2.0, 'lead': -1.0, 'fx': 5.0}
    # the bed leans away from the sub and toward the beater click and the hats, so the pulse reads on a phone
    # (a bigger high shelf here, or one on the drums, costs more in MP3 overshoot on the sum than it buys)
    s.mix['bed'] = StemMix(eq=[('hp', 32.0), ('lowshelf', 90.0, -3.0), ('highshelf', 5000.0, 2.0)] + fader(F['bed']),
                           reverb=0.05, reverb_type='room', pan=0.0)
    # the break's grit lives in the voices (kick drive, snare lofi): a stem-level drive on the raw summed kit (peaks
    # ~2.4) squares off the kick bodies and leaves kinks the click check rightly flags
    s.mix['drums'] = StemMix(eq=[('hp', 32.0), ('peak', 5000.0, 1.0, 0.7)] + fader(F['drums']), drive=0.0,
                             reverb=0.10, reverb_type='room', pan=0.0)
    # the bass pump is big (it is the most loudness-per-peak stem in the song) and ducks under every kick
    s.mix['bass'] = StemMix(eq=[('hp', 30.0), ('lp', 5000.0, 0.7)] + fader(F['bass']), drive=0.2, duck=0.35,
                            duck_release=0.08, pan=0.0)
    s.mix['keys'] = StemMix(eq=[('hp', 150.0), ('lowshelf', 300.0, -2.0)] + fader(F['keys']), reverb=0.2,
                            reverb_type='plate', pan=-0.3)
    s.mix['perc'] = StemMix(eq=[('hp', 160.0)] + fader(F['perc']), reverb=0.14, reverb_type='room', pan=0.35)
    s.mix['horns'] = StemMix(eq=[('hp', 150.0), ('peak', 2500.0, 2.0, 0.8)] + fader(F['horns']), reverb=0.2,
                             reverb_type='plate', pan=0.2)
    s.mix['lead'] = StemMix(eq=[('hp', 250.0), ('lp', 9000.0, 0.7)] + fader(F['lead']), reverb=0.16,
                            reverb_type='plate', delay=0.12, pan=-0.15)
    s.mix['fx'] = StemMix(eq=[('hp', 60.0)] + fader(F['fx']), reverb=0.3, reverb_type='hall', pan=-0.1, width=0.9)

    # ── bed: kick on 1, off-beat hats (the &s of 2 and 4 a touch longer and louder: the lilt) ──
    for bar in range(1, BARS + 1):
        s.pattern('bed', 'kick', [bar], 'x...............', vel=0.9, tune=52.0, decay=0.28, click=0.3)
        if bar < BARS:
            s.pattern('bed', 'hat', [bar], '..x.......x.....', vel=0.6, decay=0.03, tone=0.5)
            s.pattern('bed', 'hat', [bar], '......x.......x.', vel=0.7, decay=0.055, tone=0.45)
        else:                                                   # last bar: nothing after six 8
            s.pattern('bed', 'hat', [bar], '..x...x.........', vel=0.6, decay=0.03, tone=0.5)

    drums(s)
    bass(s)
    keys(s)
    perc(s)
    horns(s)
    lead(s)
    fx(s)
    return s


def drums(s: Song):
    for bar in list(range(5, 13)) + list(range(25, 33)):          # verses: A / B, fill at the end
        a = (bar - 5) % 2 == 0
        if bar in (12, 32):
            drum_bar(s, bar, BREAK_FILL)
            fill_toms(s, bar)
        else:
            drum_bar(s, bar, BREAK_A if a else BREAK_B)
    for start in HOOK_STARTS:                                     # hooks
        e5 = start == 37
        for i in range(8):
            bar = start + i
            if i == 7:
                drum_bar(s, bar, BREAK_FILL, ride=e5)
                fill_toms(s, bar)
            else:
                drum_bar(s, bar, BREAK_A4 if i % 2 == 0 else BREAK_B4, ride=e5)
    drum_bar(s, 21, BREAK_A, tight=True)                          # the break section: the break alone for a bar,
    drum_bar(s, 23, BREAK_A2, tight=True)                         # then a whole bar of stop (22, 24: the freeze)
    drum_bar(s, 33, BREAK_A, hats_over=BUILD_HATS)                # build: 16th hats, then the roll
    drum_bar(s, 34, BREAK_B, hats_over=BUILD_HATS)
    s.pattern('drums', 'kick', [35], '........x.......', vel=0.85, **KIT['kick'])
    s.pattern('drums', 'hat', [35], BUILD_HATS, vel=0.48, accent=0.6, ghost=0.3, **KIT['hat'])
    s.pattern('drums', 'kick', [36], '....x...x...x...', vel=0.9, **KIT['kick'])
    s.pattern('drums', 'hat', [36], BUILD_HATS, vel=0.5, accent=0.62, ghost=0.32, **KIT['hat'])
    s.roll('drums', 'snare', 35, 2, steps=(2, 1, 1, 0.5), vel=(0.38, 0.86), **KIT['snare'])
    drum_bar(s, 45, BREAK_A)                                      # outro: the break under the horn hits
    drum_bar(s, 46, BREAK_B)
    drum_bar(s, 47, BREAK_FILL)
    fill_toms(s, 47)
    s.hit('drums', 'snare', 48, 0, 0.8, **KIT['snare'])           # the last hit (the bed has the kick)
    for bar in (5, 13, 21, 25, 33, 37, 41, 45, 48):
        s.hit('drums', 'crash', bar, 0, 0.55, decay=1.0)


def bass(s: Song):
    P = dict(shape='square', cutoff=300.0, env=1500.0, fdecay=0.07, q=1.2, sub=0.2, decay=0.22, sustain=0.5)
    # the octave pump: (six, 'L'ow root / 'H'igh octave, dur16, vel)
    PUMP = [(0, 'L', 1.7, 0.85), (2, 'H', 1.0, 0.78), (5, 'L', 0.9, 0.72), (6, 'H', 1.6, 0.84), (8, 'L', 1.7, 0.9),
            (10, 'H', 1.6, 0.8), (13, 'L', 0.9, 0.74), (15, 'H', 0.9, 0.8)]
    GHOSTS = [(3, 'H', 0.6, 0.42), (11, 'H', 0.6, 0.42)]
    bars = [b for b in range(1, BARS + 1) if s.plays('bass', b)]
    for bar in bars:
        sym = chord_of(bar)
        nxt = chord_of(bar + 1) if bar < BARS else sym
        lo = low_root(sym)
        hi = lo + 12
        e = s.energy(bar)
        if bar == 36:                                             # build's last bar: 8ths, crescendo, F# lead-in
            for k, six in enumerate(range(0, 16, 2)):
                s.note('bass', 'pluck_bass', bar, six, lo if k % 2 == 0 else hi, 1.6 if six < 14 else 0.9,
                       0.62 + 0.03 * k, **P)
            s.note('bass', 'pluck_bass', bar, 15, 42, 0.9, 0.85, **P)      # F#2 -> G
            continue
        notes = list(PUMP) + (GHOSTS if e >= 5 else [])
        for six, reg, dur, v in sorted(notes):
            if six == 15 and not s.plays('bass', bar + 1):
                continue                                          # no approach note into a section without bass
            m = lo if reg == 'L' else hi
            if six == 13 and sym == 'Gm7' and nxt != 'Gm7':
                m = 38                                            # D2: the 5th before the change
            if six == 15:
                if nxt.startswith('Gm') and sym != 'Gm7' and sym != 'Gm':
                    m = 42                                        # F#2, the leading tone into G
                elif sym.startswith('Gm') and (nxt.startswith('Gm') or nxt.startswith('Eb')):
                    m = 41                                        # F2: the b7 (and a step above Eb)
            if six == 0 and s.section_at(bar).name == 'hook' and (bar - s.section_at(bar).start_bar) % 2 == 0:
                v = 0.72                                          # the horns + the bed kick own the riff's downbeats
            s.note('bass', 'pluck_bass', bar, six, m, dur, v, **P)


def keys(s: Song):
    STAB = dict(cutoff=600.0, env=4500.0, decay=0.12)
    ORGAN = dict(drawbars='gospel', perc=0.2, click=0.08)
    prev = None
    oprev = None
    for bar in range(1, BARS + 1):
        if not s.plays('keys', bar):
            continue
        sym = chord_of(bar)
        sec = s.section_at(bar)
        v = voicing(sym, center=64, rootless=True, prev=prev)
        prev = v
        if sec.name == 'verse':
            hits = [(0, 1.5, 0.78), (3, 1.2, 0.62), (6, 2.0, 0.72), (10, 2.0, 0.66)]
            if (bar - sec.start_bar) % 4 == 3:
                hits.append((14, 1.2, 0.6))                        # pickup into the next phrase
            for six, dur, vel in hits:
                s.chord('keys', 'stab', bar, six, v, dur, vel, strum_ms=3, **STAB)
            ov = voicing(sym, center=60, n=4, prev=oprev)          # a low organ bed under the stabs (louder in
            oprev = ov                                             # verse 2)
            s.chord('keys', 'organ', bar, 0, ov, 15.5, 0.26 if sec.start_bar == 5 else 0.32, strum_ms=8, **ORGAN)
        elif sec.name == 'hook':
            ov = voicing(sym, center=60, n=4, prev=oprev)
            oprev = ov
            s.chord('keys', 'organ', bar, 0, ov, 15.5, 0.56 if sec.energy >= 5 else 0.52, strum_ms=8, **ORGAN)
            hits = [(0, 1.5, 0.72), (6, 1.5, 0.64)]
            if sec.energy >= 5 and (bar - sec.start_bar) % 2 == 1:
                hits.append((14, 1.2, 0.58))
            for six, dur, vel in hits:
                s.chord('keys', 'stab', bar, six, v, dur, vel, strum_ms=3, **STAB)
        elif sec.name == 'build':
            ov = voicing(sym, center=60, n=4, prev=oprev)
            oprev = ov
            s.chord('keys', 'organ', bar, 0, ov, 15.5, 0.34 + 0.02 * (bar - 33), strum_ms=8, **ORGAN)
            if bar < 36:
                for six, dur, vel in [(0, 1.5, 0.74), (3, 1.2, 0.62), (6, 2.0, 0.7), (10, 2.0, 0.66)]:
                    s.chord('keys', 'stab', bar, six, v, dur, vel, strum_ms=3, **STAB)
            else:
                # rising stabs on the downbeat and the &s, between the kick quarters (critic pass: stabs on the kick
                # quarters stacked kick + bass + roll + stab on 4 / 8 / 12, the song's loudest coincidence, and left
                # no room for the build's horn swell under the peak guard; SONGS.md rule 9)
                for k, six in enumerate((0, 2, 6, 10, 14)):
                    s.chord('keys', 'stab', bar, six, v, 1.2, 0.56 + 0.08 * k, strum_ms=3, **STAB)


def perc(s: Song):
    for bar in range(1, BARS + 1):
        if not s.plays('perc', bar):
            continue
        sec = s.section_at(bar)
        alt = (bar - sec.start_bar) % 2 == 1
        if sec.name == 'intro':
            congas(s, bar, alt, 0.95)
            s.pattern('perc', 'snap', [bar], '....x.......x...', vel=0.72)
        elif sec.name == 'verse':
            congas(s, bar, alt)
            if sec.start_bar == 25:
                s.pattern('perc', 'tamb', [bar], '....x.......x...', vel=0.42, decay=0.14)
        elif sec.name == 'hook':
            congas(s, bar, alt, 1.05, skip_downbeat=True)     # the horns and the kick own the hook downbeats
            s.pattern('perc', 'tamb', [bar], 'o.o.x.o.o.o.x.o.', vel=0.44, ghost=0.3, decay=0.1)
            if sec.energy >= 5:
                s.pattern('perc', 'cowbell', [bar], '..x.......x.....', vel=0.42, decay=0.2)
        elif sec.name == 'build':
            if bar < 36:
                congas(s, bar, alt, 1.0)
                steps = 'o.o.x.o.o.o.x.o.' if bar < 35 else 'ogogxgogogogxgog'
                s.pattern('perc', 'tamb', [bar], steps, vel=0.44, ghost=0.3, decay=0.1)
            else:                                                # the conga roll into the last hook (it
                for six in range(16):                            # tops out at 0.78: bar 36 is the song's peak)
                    s.hit('perc', 'conga', bar, six, 0.4 + 0.025 * six, size='high' if six % 2 == 0 else 'mid',
                          stroke='open' if six % 4 else 'slap')
                s.pattern('perc', 'tamb', [bar], 'xoxoxoxoxoxoxoxo', vel=0.5, ghost=0.34, decay=0.1)


def horn(s: Song, bar: int, six: float, notes, dur16: float, vel: float, **p):
    params = dict(voices=3, bright=0.8, attack=0.022, scoop=-40.0, vib=10.0, release=0.09)
    params.update(p)
    s.chord('horns', 'brass', bar, six, notes, dur16, vel, strum_ms=3.0, **params)


def horns(s: Song):
    # intro fanfare: a swell, the riff's head, a swell, a D7#9 kick-off with a pickup that falls into the verse
    horn(s, 1, 0, triad_under('D5', 'Gm7'), 10, 0.85, attack=0.42, bright=0.7)
    horn(s, 1, 12, triad_under('G5', 'Gm7'), 1, 0.85)
    horn(s, 1, 14, triad_under('Bb5', 'Gm7'), 1.5, 0.9)
    for six, top, dur, vel in RIFF_ODD[:3]:
        horn(s, 2, six, triad_under(top, 'Gm'), dur, vel)
    horn(s, 3, 0, triad_under('G5', 'Ebmaj7'), 10, 0.85, attack=0.42, bright=0.7)
    horn(s, 3, 12, triad_under('Bb5', 'Ebmaj7'), 1, 0.85)
    horn(s, 3, 14, triad_under('D6', 'Ebmaj7'), 1.5, 0.9)
    d79 = [midi('F#4'), midi('C5'), midi('F5')]                    # 3 / b7 / #9: the D7#9 shell
    horn(s, 4, 0, d79, 2, 1.0)
    horn(s, 4, 3, d79, 1, 0.8)
    horn(s, 4, 6, [midi('A4'), midi('D5'), midi('F#5')], 2, 0.9)
    horn(s, 4, 14, triad_under('D5', 'D7'), 1.5, 0.9, fall=2)

    # the hooks: the riff in triads (hook 2: a 4-player unison per part and a brighter blat: a fatter section)
    for start in HOOK_STARTS:
        e5 = start == 37
        for i in range(8):
            bar = start + i
            sym = HOOK[i % 4]
            for (six, top, dur, vel) in riff_bar(i):
                notes = triad_under(top, sym)
                long = dur >= 4
                fall = 3 if (i == 7 and long) else (2 if (long and i % 2 == 0) else 0)
                horn(s, bar, six, notes, dur, vel, fall=fall, voices=4 if e5 else 3, bright=0.84 if e5 else 0.78)

    # the break: stabs on 21 / 23 (the riff's Bb-A-G in the top), the freeze hits on the downbeats of 22 and 24
    # (the kit stops there): one hit that hangs for a beat and a half, then falls
    for bar, tops in ((21, [(0, 'Bb5', 2, 0.9), (6, 'A5', 1, 0.8), (12, 'G5', 2, 0.88)]),
                      (23, [(0, 'Bb5', 2, 0.9), (6, 'A5', 1, 0.8), (10, 'F5', 1, 0.78), (12, 'G5', 2, 0.9)])):
        for six, top, dur, vel in tops:
            horn(s, bar, six, triad_under(top, 'Gm7'), dur, vel)
    horn(s, 22, 0, [midi('Eb4'), midi('Bb4'), midi('D5'), midi('G5')], 6, 1.0, fall=2, voices=4, attack=0.01)
    horn(s, 24, 0, [midi('D4'), midi('F#4'), midi('C5'), midi('F5')], 6, 1.0, fall=3, voices=4, attack=0.01)

    # the build (critic pass): one slow swell a bar under the lead's arpeggio, the top line climbing D5 - G5 - F#5 -
    # A5 into the riff's Bb5 (Ebmaj7 upper structure, Ebmaj7, D7 without its root twice); the last swell is a
    # longer crescendo that lets go before the hook's downbeat
    horn(s, 33, 0, [midi('G4'), midi('Bb4'), midi('D5')], 12, 0.72, attack=0.42, bright=0.65)
    horn(s, 34, 0, [midi('Bb4'), midi('Eb5'), midi('G5')], 12, 0.76, attack=0.42, bright=0.68)
    horn(s, 35, 0, [midi('A4'), midi('C5'), midi('F#5')], 12, 0.8, attack=0.42, bright=0.7)
    horn(s, 36, 0, [midi('C5'), midi('F#5'), midi('A5')], 14, 0.8, attack=1.4, bright=0.72)

    # outro: a hit on every downbeat, the riff's skeleton after it, the last hit rings with a long fall
    horn(s, 45, 0, triad_under('Bb5', 'Gm7'), 2, 1.0)
    horn(s, 45, 6, triad_under('A5', 'Gm7'), 1, 0.82)
    horn(s, 45, 11, triad_under('G5', 'Gm7'), 3, 0.9, fall=1)
    horn(s, 46, 0, [midi('Eb4'), midi('Bb4'), midi('D5'), midi('G5')], 2, 1.0)
    horn(s, 46, 6, triad_under('A5', 'Eb'), 1, 0.82)
    horn(s, 46, 11, triad_under('Bb5', 'Ebmaj7'), 3, 0.9, fall=1)
    horn(s, 47, 0, [midi('D4'), midi('F#4'), midi('C5'), midi('F5')], 2, 1.0)
    horn(s, 47, 4, triad_under('A5', 'D7'), 1, 0.85)
    horn(s, 47, 7, triad_under('C6', 'D7'), 1, 0.88)
    horn(s, 47, 8, triad_under('D6', 'D7'), 3, 0.95)
    horn(s, 48, 0, [midi('G3'), midi('D4'), midi('G4'), midi('Bb4'), midi('D5'), midi('G5')], 12, 1.0, fall=4,
         voices=4, attack=0.012)


def lead(s: Song):
    SAW = dict(glide=0.03, cutoff=2600.0, env=1.5)
    # hooks: the horn top line an octave up
    for start in HOOK_STARTS:
        for i in range(8):
            bar = start + i
            notes = [(bar, six, midi(top) + 12, dur, 0.5 if start == 13 else 0.55) for six, top, dur, _ in riff_bar(i)]
            s.phrase('lead', 'saw_lead', notes, **SAW)
    # verse 2: two-bar call (arpeggio leap up) and answer (descending), four times
    calls = [
        (25, [(4, 'Bb4', 1, 0.8), (6, 'D5', 1, 0.85), (7, 'G5', 4, 0.9)]),
        (26, [(0, 'Bb5', 2, 0.88), (2, 'G5', 1, 0.75), (4, 'F5', 2, 0.8), (8, 'D5', 1, 0.75), (10, 'C5', 1, 0.7),
              (11, 'D5', 4, 0.85)]),
        (27, [(4, 'C5', 1, 0.8), (6, 'D5', 1, 0.85), (7, 'G5', 4, 0.9)]),
        (28, [(0, 'F5', 2, 0.88), (2, 'D5', 1, 0.75), (4, 'C5', 2, 0.8), (8, 'A4', 1, 0.75), (10, 'C5', 1, 0.7),
              (11, 'D5', 4, 0.85)]),
        (29, [(4, 'F5', 1, 0.8), (6, 'G5', 1, 0.85), (7, 'Bb5', 4, 0.9), (12, 'C6', 1, 0.8), (13, 'Bb5', 2, 0.8)]),
        (30, [(0, 'G5', 2, 0.88), (2, 'F5', 1, 0.75), (4, 'D5', 2, 0.8), (8, 'F5', 1, 0.75), (10, 'D5', 1, 0.7),
              (11, 'G5', 4, 0.85)]),
        (31, [(4, 'D5', 1, 0.8), (6, 'G5', 1, 0.85), (7, 'F5', 2, 0.85), (10, 'Bb5', 4, 0.9)]),
        (32, [(0, 'A5', 2, 0.9), (2, 'F#5', 1, 0.8), (4, 'D5', 2, 0.8), (6, 'C5', 2, 0.75)]),
    ]
    for bar, ns in calls:
        s.phrase('lead', 'saw_lead', [(bar, six, p, d, v) for six, p, d, v in ns], **SAW)
    # build: a rising 16th arpeggio, two octaves (G-Bb-D-F over Ebmaj7, F#-A-C-Eb over D7#9)
    L1 = [midi(n) for n in ('G3', 'Bb3', 'D4', 'F4', 'G4', 'Bb4', 'D5', 'F5', 'G5')]
    L2 = [midi(n) for n in ('F#4', 'A4', 'C5', 'Eb5', 'F#5', 'A5', 'C6', 'Eb6')]
    notes = []
    for beat in range(16):
        bar = 33 + beat // 4
        k = (beat % 8) // 2
        L = L1 if bar < 35 else L2
        for j in range(4):
            six = (beat % 4) * 4 + j
            u = beat / 15.0
            vel = (0.62 + 0.3 * u) * (1.0 if j == 0 else 0.82)
            notes.append((bar, six, L[k + j], 0.7, min(1.0, vel)))
    s.phrase('lead', 'saw_lead', notes, glide=0.01, cutoff=2400.0, env=2.0, attack=0.004, release=0.05)
    # outro (critic pass): the saw lead doubles the horn hits' top line an octave up, as it doubles the riff in the
    # hooks, and holds the last G under the final hit
    outro = [(45, 0, 'Bb6', 2, 0.5), (45, 6, 'A6', 1, 0.44), (45, 11, 'G6', 3, 0.48),
             (46, 0, 'G6', 2, 0.5), (46, 6, 'A6', 1, 0.44), (46, 11, 'Bb6', 3, 0.48),
             (47, 0, 'F6', 2, 0.5), (47, 4, 'A6', 1, 0.44), (47, 7, 'C7', 1, 0.46), (47, 8, 'D7', 3, 0.5),
             (48, 0, 'G6', 10, 0.5)]
    s.phrase('lead', 'saw_lead', outro, **SAW)


def fx(s: Song):
    W = dict(lo=250.0, hi=1400.0, rate=0.08, q=1.2)
    for bar in range(1, 45, 4):
        s.fx('fx', 'wash', bar, 0, 64, 0.5, **W)
    s.fx('fx', 'wash', 45, 0, 48, 0.5, **W)
    # intro: the scrubs answer the fanfare; a reverse swell pulls the verse in
    s.fx('fx', 'scrub', 2, 8, 4, 0.75, pitch='G3', rate=6.0)
    s.fx('fx', 'scrub', 4, 8, 6, 0.8, pitch='G3', rate=7.0)
    s.fx_into('fx', 'reverse', 5, 0, 8, 0.6, pitches=[55, 58, 62])
    # into the hooks
    for hook in HOOK_STARTS:
        s.fx_into('fx', 'riser', hook, 0, 32, 0.8, tone='G2')
        s.hit('fx', 'impact', hook, 0, 0.4, tune=44.0, decay=0.9)
        for i in (1, 3, 5):                                       # the scrub answers the horns' rest
            s.fx('fx', 'scrub', hook + i, 12, 3.5, 0.62, pitch='D4' if i == 3 else 'G3', rate=8.0)
    # the break: a downsweep in, the freeze scrubs (answering the downbeat horn hits of 22 / 24 on beat 3), a reverse
    # swell back into the verse
    s.fx('fx', 'downsweep', 21, 0, 16, 0.6)
    s.fx('fx', 'scrub', 22, 8, 4, 0.85, pitch='G3', rate=6.0)
    s.fx('fx', 'scrub', 24, 8, 4, 0.85, pitch='D3', rate=6.0)
    s.fx_into('fx', 'reverse', 25, 0, 4, 0.55, pitches=[50, 54, 57, 60])
    s.fx('fx', 'sweep', 32, 8, 8, 0.6)
    # outro
    s.fx('fx', 'downsweep', 45, 0, 16, 0.55)
    s.fx('fx', 'scrub', 46, 12, 3.5, 0.6, pitch='G3', rate=8.0)
    s.hit('fx', 'impact', 48, 0, 0.5, tune=44.0, decay=1.0)


if __name__ == '__main__':
    main(build, __file__)
