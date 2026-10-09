#!/usr/bin/env python3
"""song_evolution.py - "Final Evolution", FEL house song 6 of 6 (difficulty 6).

Electro-funk, 126 BPM, F# minor, straight 16ths (swing 0.50), 56 bars = 106.67 s, seed 0xEF01, 100 taps/min,
hook stem = LEAD (a robotic square lead with a short glide on every note).

    /Users/elijahbonds/.cache/fel-kokoro/.venv/bin/python songgen/song_evolution.py
    -> songs/evolution/{stems/*.mp3, preview.mp3, map.json}; fel_synth.main then runs validate.py on it.

Arrangement (bar numbers are 1-based; e = energy):

  intro   1-4   e2  bed keys fx            filtered 16th square arp opening up + saw pad, zaps, reverse into 5
  verse   5-12  e3  + drums bass perc      electro kit, long 808 with slides, up-down arp, shaker + rim, zaps
  build  13-16  e4  + horns lead           climbing lead arp (8ths -> 16ths), brass swells, rising snare roll, riser
  hook   17-24  e4  all                    THE HOOK (square lead), octave-pulse bass, brass stabs on its accents, pad
  break  25-28  e3  bed keys horns fx      freezes 25.1 / 27.1 = brass hit + fx only (keys answer in 26 / 28),
                                           swells with falls 26 / 28, scrubs
  verse  29-36  e3  bed drums bass keys perc horns lead fx   lead call/response built from the hook's octave yelp,
                                           the brass answers each call (six 12/14) and lands with each response
  build  37-40  e4  as 13-16 (horns included), the lead arp and the brass an octave-and-a-bit higher, riser
  hook   41-48  e5  all + ride, ghost snares, tamb, bass 16ths, 4-voice brass (+ the top an octave down), zaps
  break  49-50  e4  bed horns fx           the last freeze: brass hits 49.1 / 50.1, scrubs, swell + riser into 51
  hook   51-54  e5  all                    the hook's last four bars
  outro  55-56  e2  bed keys fx            arp + pad, final kick / chord / boom on 56.1 ring out

Critic pass (2026-09-25): horns were audible in only 26 of 56 bars (46 %; a freeze-earned instrument must sound in
>= 60 %), so the builds and verse 2 now carry brass (42 bars, 75 %) and list it in their sections. The freeze bars
held keys + drum/lead/keys tails from the hook fills (5 stems in 25 and 49): a hook bar that runs into a break now
stops its lead, keys and tom fill by sixteenth 13-14, and break 1's keys play only in 26 and 28, so every breakBar is
bed + horns + fx. The hook's second chord is now Bm (i-iv-III-VII) instead of D (i-VI-III-VII): canals' verse already
loops i-VI-III-VII, and the IP note below already steers this hook away from that loop's best-known F# minor dance
use. The hook melody is unchanged (bar 2's held D5 becomes the minor 3rd of Bm). Verses gained a zap per bar so fx
(transition) is heard in most bars.

Progression: intro/outro F#m9; verse F#m9 | F#m9 | Dmaj7 | E6; build Bm7 | Bm7 | C#7 | C#7;
hook F#m | Bm | A | E (i-iv-III-VII); break Dmaj7 | Dmaj7 | C#7 | C#7; last freeze C#7 | C#7.

The hook (lead, 4 bars; bars 5-7 repeat 1-3, bar 8 climbs to C#6 and settles on E5; before a break it stops on E5
at sixteenth 12 so the freeze lands in silence):
  F#m: 0 F#4 1 > 1 F#5 2 (octave "yelp") . 4 C#5 2 . 6 E5 1 . 7 B5 2 (syncopated 11th) . 10 A5 2 . 12 F#5 4
  Bm:  2 A5 2 . 4 F#5 1 . 5 E5 1 . 6 D5 4 (the minor 3rd, held) . 10 E5 2 . 12 F#5 2 . 14 G#5 2
  A:   the bar-1 cell a minor third up: A4 > A5 . E5 . G#5 . C#6 (peak) . B5 . A5
  E:   0 G#5 3 . 3 F#5 1 . 4 E5 2 . 6 B4 2 . 8 C#5 1 . 9 E5 1 . 10 F#5 2 . 12 G#5 4

The lead is `robo_lead`, a voice defined in THIS script (so the composition hash in map.provenance.scriptSha256 covers
it): an event-per-note mono square with a sub pulse, a resonant filter envelope and a 25-35 ms glide from the previous
note. Events rather than a fel_synth phrase so each note keeps its own velocity (fel_synth normalises a whole phrase
to one peak, which would flatten the builds' crescendo and the hook-2 octave double).

IP check (SONGS.md rules; done before rendering):
- Everything is synthesised by fel_synth + the one voice below from numpy oscillators/noise. No samples, no loops, no
  audio files are read. No vocals of any kind (this song has no vox at all).
- Melodies, riffs and basslines were written for this song from the chord symbols above and checked by singing them
  against known tunes. Deliberately avoided: a root-pedal / lower-neighbour opening (the shape of the famous minor-key
  synth instrumentals, e.g. the Axel F and Popcorn figures), the Take On Me riff (6-6-4-2 in 8ths), the 3-2-1-2-3
  "Mary had a little lamb" turn (an early draft of hook bar 2 had it; replaced by 5-3-2-1 then 2-3-#4 rising),
  and any stepwise F#-G#-A-G#-F# 8th-note piano arpeggio in this key (the Robert Miles "Children" area; the critic
  pass also moved the hook's harmony off F#m-D-A-E to F#m-Bm-A-E). The hook's identity is its octave yelp
  into a syncopated leap to the 11th (B over F#m) and its sequence a minor third up on the A chord; the rhythm cell is
  XX..X.XX..X.X... . The added brass (builds, verse 2) is chord shells and swells, not a melody.
- Drums: the kick pattern is bed 1 + 3 with drum kicks on the "and" of 2 and 4 (bar A) / "and" of 2, 3-and, 4-e (bar
  B); clap on 2 and 4; hats in straight 16ths with the bed on the off-beats. It is not the Planet Rock / Numbers
  808 pattern, not Amen / Funky Drummer / Apache / Think / Impeach. The builds use a pitch-rising snare roll.
- The 808 bass line (root, 5th/octave slides, a 6th on E6) and the hook's octave pulse are generic genre devices,
  not a recognisable bassline.
"""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fel_synth as F  # noqa: E402
from fel_synth import Song, Section, StemMix, SR, main, midi, voicing  # noqa: E402

ALL = F.STEMS


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# the one extra voice: robo_lead
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

@F.voice('robo_lead', 'tonal', 1, 'robotic mono square lead (evolution): square + sub pulse through a resonant LP with a '
         'per-note filter envelope, short glide from p["from"], delayed vibrato. p: from, glide, cutoff, env, fdecay, '
         'q, sub, detune, vib, vib_delay, rate, attack, decay, sustain, release')
def v_robo_lead(v: F.VoiceCall) -> np.ndarray:
    p = v.p
    rel = p.get('release', 0.045)
    n = int(SR * (v.dur + rel * 6))
    t = F.t_axis(n)
    m1 = float(v.midi)
    m0 = float(midi(p['from'])) if p.get('from') is not None else m1
    tau = max(p.get('glide', 0.025), 1e-3)
    mc = m1 + (m0 - m1) * np.exp(-t / tau)
    vib = p.get('vib', 0.1) * np.clip((t - p.get('vib_delay', 0.2)) / 0.2, 0.0, 1.0)
    mc = mc + vib * np.sin(2 * np.pi * p.get('rate', 5.8) * t + v.rng.random() * 6.28)
    f = F.hz_arr(mc)
    f_ref = F.hz(max(m0, m1) + 0.3)                  # band-limit for the highest pitch the glide visits
    base = p.get('cutoff', 1400.0) + 1.3 * F.hz(m1)  # key-tracked
    cut = base * (1.0 + p.get('env', 2.4) * (0.45 + 0.55 * v.vel) * np.exp(-t / p.get('fdecay', 0.09)))
    cut = np.minimum(cut, 15000.0)
    q = p.get('q', 1.6)
    x = F.filtered_osc(f, 'square', cut, q=q, poles=2, f_ref=f_ref, phase0=v.rng.random())
    det = p.get('detune', 0.0)
    if det:
        r = 2 ** (det / 1200.0)
        x = x + F.filtered_osc(f * r, 'square', cut, q=q, poles=2, f_ref=f_ref * r, phase0=v.rng.random())
    sub = p.get('sub', 0.25)
    if sub > 0:
        s = F.filtered_osc(f * 0.5, 'pulse', cut * 0.5, q=0.8, poles=2, width=0.3, f_ref=f_ref * 0.5,
                           phase0=v.rng.random())
        x = F._norm_peak(x) + sub * F._norm_peak(s)
    env = F.env_adsr(n, p.get('attack', 0.004), p.get('decay', 0.25), p.get('sustain', 0.72), rel, v.dur)
    return F._norm_peak(x * env, 0.5)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# material
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

VERSE_CH = ['F#m9', 'F#m9', 'Dmaj7', 'E6']
BUILD_CH = ['Bm7', 'Bm7', 'C#7', 'C#7']
HOOK_CH = ['F#m', 'Bm', 'A', 'E']
BREAK_CH = ['Dmaj7', 'Dmaj7', 'C#7', 'C#7']

SECTIONS = [
    Section('intro', 1, 4, 2, ('bed', 'keys', 'fx')),
    Section('verse', 5, 8, 3, ('bed', 'drums', 'bass', 'keys', 'perc', 'fx'), label='verse 1'),
    Section('build', 13, 4, 4, ALL, label='build 1'),
    Section('hook', 17, 8, 4, ALL, label='hook 1'),
    Section('break', 25, 4, 3, ('bed', 'keys', 'horns', 'fx'), label='break 1'),
    Section('verse', 29, 8, 3, ALL, label='verse 2'),
    Section('build', 37, 4, 4, ALL, label='build 2'),
    Section('hook', 41, 8, 5, ALL, label='hook 2'),
    Section('break', 49, 2, 4, ('bed', 'horns', 'fx'), label='last freeze'),
    Section('hook', 51, 4, 5, ALL, label='hook 3'),
    Section('outro', 55, 2, 2, ('bed', 'keys', 'fx')),
]
HOOK_STARTS = {17: 0, 41: 0, 51: 4}      # first bar of each hook -> index of that bar inside the 8-bar hook


def hook_index(song: Song, bar: int) -> int:
    s = song.section_at(bar)
    return HOOK_STARTS[s.start_bar] + (bar - s.start_bar)


def into_break(song: Song, bar: int) -> bool:
    """The last bar of a section that is followed by a break (the band has to be quiet by the freeze downbeat)."""
    s = song.section_at(bar)
    nxt = song.section_at(bar + 1) if bar < song.bars else None
    return bool(s and nxt and bar == s.end_bar and nxt.name == 'break')


def chord_at(song: Song, bar: int) -> str:
    s = song.section_at(bar)
    i = bar - s.start_bar
    if s.name in ('intro', 'outro'):
        return 'F#m9'
    if s.name == 'verse':
        return VERSE_CH[i % 4]
    if s.name == 'build':
        return BUILD_CH[i % 4]
    if s.name == 'hook':
        return HOOK_CH[hook_index(song, bar) % 4]
    if s.name == 'break':
        return BREAK_CH[i] if s.start_bar == 25 else 'C#7'
    raise ValueError(bar)


# the hook: (six, pitch, dur16, vel, fresh) - fresh = a new attack (no glide from the previous note)
HOOK_LEAD = [
    [(0, 'F#4', 1, 0.80, True), (1, 'F#5', 2, 1.00, False), (4, 'C#5', 2, 0.84, False), (6, 'E5', 1, 0.80, False),
     (7, 'B5', 2, 1.00, False), (10, 'A5', 2, 0.86, False), (12, 'F#5', 4, 0.92, False)],
    [(2, 'A5', 2, 0.92, True), (4, 'F#5', 1, 0.76, False), (5, 'E5', 1, 0.76, False), (6, 'D5', 4, 0.92, False),
     (10, 'E5', 2, 0.80, False), (12, 'F#5', 2, 0.86, False), (14, 'G#5', 2, 0.84, False)],
    [(0, 'A4', 1, 0.80, True), (1, 'A5', 2, 1.00, False), (4, 'E5', 2, 0.84, False), (6, 'G#5', 1, 0.80, False),
     (7, 'C#6', 2, 1.00, False), (10, 'B5', 2, 0.86, False), (12, 'A5', 4, 0.92, False)],
    [(0, 'G#5', 3, 0.95, False), (3, 'F#5', 1, 0.76, False), (4, 'E5', 2, 0.86, False), (6, 'B4', 2, 0.84, False),
     (8, 'C#5', 1, 0.76, False), (9, 'E5', 1, 0.80, False), (10, 'F#5', 2, 0.86, False), (12, 'G#5', 4, 0.92, False)],
]
HOOK_LEAD_END = [(0, 'G#5', 2, 0.92, False), (3, 'A5', 1, 0.78, False), (4, 'B5', 2, 0.88, False),
                 (7, 'C#6', 3, 1.00, False), (10, 'B5', 2, 0.86, False), (12, 'G#5', 1, 0.80, False),
                 (13, 'E5', 3, 0.90, False)]
# the same climb when a freeze follows: land on E5 early (six 10-12) so the echoes are gone by the freeze downbeat
HOOK_LEAD_STOP = [(0, 'G#5', 2, 0.92, False), (3, 'A5', 1, 0.78, False), (4, 'B5', 2, 0.88, False),
                  (7, 'C#6', 2, 1.00, False), (9, 'B5', 1, 0.84, False), (10, 'E5', 2, 0.90, False)]

# brass stabs on the hook's accents, none on the kick positions (0, 8): the yelp's arrival (1), the syncopated peak
# (7) and the backbeat (12); on the E bars the landing E5 (4). (six, dur16, vel, voicing, extra params)
HOOK_HORNS = [
    [(1, 2, 0.95, ['A4', 'C#5', 'F#5'], {}), (7, 1, 0.88, ['C#5', 'F#5', 'B5'], {}),
     (12, 3, 0.85, ['A4', 'C#5', 'F#5'], {})],
    [(2, 1.5, 0.92, ['D5', 'F#5', 'A5'], {}), (6, 1.5, 0.90, ['F#4', 'A4', 'D5'], {}),
     (12, 2, 0.85, ['A4', 'D5', 'F#5'], {})],
    [(1, 2, 0.95, ['C#5', 'E5', 'A5'], {}), (7, 1, 0.88, ['E5', 'A5', 'C#6'], {}),
     (12, 3, 0.85, ['C#5', 'E5', 'A5'], {})],
    [(4, 2, 0.92, ['G#4', 'B4', 'E5'], {}), (12, 4, 0.90, ['B4', 'E5', 'G#5'], {})],
]
HOOK_HORNS_END = [(4, 2, 0.9, ['E5', 'G#5', 'B5'], {}), (7, 2.5, 0.95, ['E5', 'G#5', 'C#6'], {}),
                  (13, 2, 0.90, ['G#4', 'B4', 'E5'], {'fall': 2})]

# verse 808: (six, pitch, dur16, vel, slide-from)
VERSE_808 = [
    [(0, 'F#1', 5, 0.95, None), (6, 'F#1', 3, 0.75, None), (10, 'C#2', 4, 0.85, 'F#1'), (14, 'E2', 2, 0.70, 'C#2')],
    [(0, 'F#1', 5, 0.95, 'E2'), (6, 'A1', 3, 0.75, 'F#1'), (10, 'F#2', 3, 0.80, 'A1'), (13, 'E2', 1, 0.60, None),
     (14, 'D2', 2, 0.75, 'E2')],
    [(0, 'D2', 5, 0.95, None), (6, 'D2', 3, 0.72, None), (10, 'A1', 4, 0.82, 'D2'), (14, 'C#2', 2, 0.70, 'A1')],
    [(0, 'E2', 5, 0.95, 'C#2'), (6, 'E1', 3, 0.75, 'E2'), (10, 'B1', 3, 0.80, 'E1'), (13, 'C#2', 1, 0.60, None),
     (14, 'E2', 2, 0.75, 'C#2')],
]
HOOK_BASS_ROOT = {'F#m': 'F#1', 'Bm': 'B1', 'A': 'A1', 'E': 'E1'}

# brass in verse 2: two shells per chord. Even bars answer the lead's call (12, 14); odd bars push in on 2 and land
# with the lead's response on 14. The six-14 stabs are one 16th long so they are gone before the next downbeat's
# kick + 808 (a longer one added to that pile-up and to the peak guard).
VERSE_HORNS = {'F#m9': (['A4', 'C#5', 'E5'], ['G#4', 'C#5', 'E5']),
               'Dmaj7': (['F#4', 'A4', 'C#5'], ['A4', 'C#5', 'F#5']),
               'E6': (['G#4', 'C#5', 'E5'], ['B4', 'E5', 'G#5'])}
# brass in the builds: bar 1 swell, bar 2 two stabs, bar 3 swell, bar 4 a crescendo swell that cuts at six 13 (a
# breath before the hook's first stab on 1). The swells start on the 'e' of 1, off the kick + 808 downbeat, and stay
# moderate: louder / 4-5-voice swells peaking into the roll's last 32nds pushed the shared peak guard to 2.9 dB.
BUILD_HORNS = {
    'build 1': [[(1, 13, 0.54, ['D4', 'A4', 'C#5'], dict(attack=0.5))],
                [(6, 1.5, 0.60, ['F#4', 'A4', 'D5'], {}), (10, 2, 0.62, ['A4', 'D5', 'F#5'], {})],
                [(1, 13, 0.56, ['E#4', 'B4', 'C#5'], dict(attack=0.55))],
                [(1, 12, 0.56, ['G#4', 'B4', 'E#5'], dict(attack=1.4, release=0.05))]],
    'build 2': [[(1, 13, 0.58, ['A4', 'D5', 'F#5'], dict(attack=0.5))],
                [(6, 1.5, 0.64, ['D5', 'F#5', 'A5'], {}), (10, 2, 0.66, ['F#5', 'A5', 'D6'], {})],
                [(1, 13, 0.60, ['B4', 'E#5', 'G#5'], dict(attack=0.55))],
                [(1, 12, 0.60, ['B4', 'E#5', 'G#5'], dict(attack=1.4, release=0.05))]],
}
# octave pulse: (six, 'L'|'H', vel)
PULSE = [(0, 'L', 0.72), (2, 'H', 0.70), (4, 'L', 0.80), (6, 'H', 0.72), (7, 'H', 0.50), (8, 'L', 0.78),
         (10, 'H', 0.70), (12, 'L', 0.80), (14, 'H', 0.75)]

# verse 2: lead call / response (bar offset in the 8-bar verse -> notes)
VERSE2_LEAD = {
    0: [(0, 'F#4', 1, 0.72, True), (1, 'F#5', 2, 0.86, False), (4, 'E5', 1, 0.70, False), (6, 'C#5', 4, 0.76, False)],
    1: [(6, 'A4', 1, 0.66, True), (7, 'B4', 1, 0.68, False), (8, 'C#5', 2, 0.76, False), (11, 'E5', 1, 0.70, False),
        (12, 'F#5', 2, 0.78, False), (14, 'E5', 2, 0.72, False)],
    2: [(0, 'A4', 1, 0.72, True), (1, 'A5', 2, 0.86, False), (4, 'F#5', 1, 0.70, False), (6, 'E5', 4, 0.76, False)],
    3: [(6, 'C#5', 1, 0.66, True), (7, 'E5', 1, 0.68, False), (8, 'G#5', 2, 0.76, False), (11, 'F#5', 1, 0.70, False),
        (12, 'E5', 2, 0.78, False), (14, 'C#5', 2, 0.72, False)],
    4: [(0, 'F#4', 1, 0.74, True), (1, 'F#5', 2, 0.88, False), (4, 'A5', 1, 0.72, False), (6, 'G#5', 2, 0.76, False),
        (8, 'E5', 4, 0.78, False)],
    5: [(6, 'C#5', 1, 0.68, True), (7, 'E5', 1, 0.70, False), (8, 'F#5', 2, 0.78, False), (11, 'A5', 1, 0.72, False),
        (12, 'G#5', 2, 0.80, False), (14, 'E5', 2, 0.74, False)],
    6: [(0, 'A4', 1, 0.74, True), (1, 'A5', 2, 0.88, False), (4, 'C#6', 1, 0.74, False), (6, 'B5', 2, 0.78, False),
        (8, 'A5', 4, 0.80, False)],
    7: [(6, 'G#5', 1, 0.70, True), (7, 'A5', 1, 0.72, False), (8, 'B5', 2, 0.80, False), (11, 'C#6', 1, 0.76, False),
        (12, 'B5', 2, 0.82, False), (14, 'G#5', 2, 0.78, False)],
}

# ── voice parameter sets ──
KICK = dict(tune=47.0, punch=165.0, decay=0.28, click=0.2, drive=0.15, pitch_tau=0.034)
KICK_LAST = dict(KICK, decay=0.55)
BHAT = dict(decay=0.034, tone=0.6, metal=0.3)
DHAT = dict(decay=0.026, tone=0.45, metal=0.25)
OHAT = dict(decay=0.22, tone=0.5)
CLAP = dict(tone=1500.0, decay=0.12)
SNARE = dict(tune=205.0, decay=0.15, snappy=0.8, tone=0.6, body=0.5)
GHOST = dict(tune=205.0, decay=0.08, snappy=0.7, tone=0.5, body=0.3)
B808 = dict(decay=1.2, punch=7.0, drive=0.4)
PBASS = dict(shape='square', cutoff=220.0, env=1000.0, fdecay=0.07, q=0.9, sub=0.2, decay=0.2, sustain=0.5,
             release=0.03)
PLUCK = dict(shape='square', decay=0.15, cutoff=700.0)
PAD = dict(shape='saw', cutoff=2200.0, attack=0.35, release=0.7)
BRASS = dict(bright=0.95, attack=0.009, voices=3, spread=12.0)
LEAD = dict(cutoff=1400.0, env=1.9, fdecay=0.09, q=1.4, sub=0.25, vib=0.1, attack=0.004, decay=0.25,
            sustain=0.85, release=0.045)
SHAKER = dict(length=0.05, tone=0.6)
ZAP_HI = dict(top=3200.0, bottom=160.0, decay=0.10)
ZAP_LO = dict(top=2200.0, bottom=110.0, decay=0.12)

UPDOWN = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0, 1]
GROUP332 = [0, 1, 2, 1, 2, 3, 2, 3, 4, 5, 6, 5, 6, 7, 6, 5]
OCTAVES = [0, 3, 1, 4, 2, 5, 1, 4, 0, 3, 1, 4, 2, 5, 4, 3]     # triad over 2 octaves, low/high pairs


def arp_tones(sym: str, lo: int = 52, n: int = 8, tones: int = 4) -> list[int]:
    """The chord's first `tones` chord tones (root, 3rd, 5th, 7th/6th; the 9th is left to the pad), from `lo` up."""
    root, ivs, _ = F.parse_chord(sym)
    pcs = {(root + i) % 12 for i in ivs[:tones]}
    return [m for m in range(lo, lo + 48) if m % 12 in pcs][:n]


def step_vel(six: int, base: float = 1.0, accent: float = 0.70) -> float:
    return base * (accent if six % 4 == 0 else 0.58 if six % 2 == 0 else 0.50)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# composition
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def build() -> Song:
    s = Song(id='evolution', title='Final Evolution', style='electro-funk', bpm=126, key='F# minor', bars=56,
             sections=SECTIONS, seed=0xEF01, difficulty=6, target_taps_per_min=100, swing=0.5, hook_stem='lead',
             break_bars=[25, 27, 49, 50], preview_start_bar=17,
             progression={'intro': ['F#m9'], 'verse': VERSE_CH, 'build': BUILD_CH, 'hook': HOOK_CH,
                          'break': BREAK_CH, 'last freeze': ['C#7', 'C#7'], 'outro': ['F#m9']},
             notes='Hook = robo_lead (square, short glide): octave yelp -> syncopated 11th, sequenced a minor third up. '
                   'Freezes: brass hits on 25.1, 27.1, 49.1, 50.1.')
    bars = range(1, s.bars + 1)
    sec = s.section_at

    # ── bed: kick on 1 and 3, closed hat on the off-beat 8ths; bar 56 = the last kick ringing out ──
    for bar in bars:
        if bar < s.bars:
            s.hit('bed', 'kick', bar, 0, 0.92, **KICK)
            s.hit('bed', 'kick', bar, 8, 0.78, **KICK)
            for six, v in ((2, 0.40), (6, 0.36), (10, 0.40), (14, 0.36)):
                s.hit('bed', 'hat', bar, six, v, **BHAT)
        else:
            s.hit('bed', 'kick', bar, 0, 1.0, **KICK_LAST)
            s.hit('bed', 'hat', bar, 2, 0.30, **BHAT)
            s.hit('bed', 'hat', bar, 6, 0.24, **BHAT)

    compose_drums(s)
    compose_bass(s)
    compose_keys(s)
    compose_perc(s)
    compose_horns(s)
    compose_lead(s)
    compose_fx(s)
    mix(s)
    return s


def pattern_bar(s: Song, stem: str, voice: str, bar: int, steps: str, vel: float, ghost: float = 0.4,
                skip: set | None = None, **params):
    for six, ch in enumerate(steps):
        v = {'X': 1.0, 'x': vel, 'o': ghost, 'g': ghost * 0.6}.get(ch)
        if v is None and ch.isdigit() and ch != '0':
            v = int(ch) / 9.0
        if v is None or (skip and six in skip):
            continue
        s.hit(stem, voice, bar, six, v, **params)


def snare_roll(s: Song, bar: int, bars: int = 2, steps=(2, 1, 1, 0.5), vel=(0.25, 0.8), tune=(185.0, 290.0)):
    """A build roll whose snare rises in pitch as it speeds up (tune quantised to 5 Hz steps)."""
    total = 16 * bars
    part = total / len(steps)
    pos = 0.0
    while pos < total - 1e-9:
        i = min(len(steps) - 1, int(pos // part))
        u = pos / total
        tn = round((tune[0] + (tune[1] - tune[0]) * u) / 5.0) * 5.0
        s.hit('drums', 'snare', bar + int(pos // 16), round(pos % 16, 3), vel[0] + (vel[1] - vel[0]) * u,
              **dict(SNARE, tune=tn, decay=0.12))
        pos += steps[i]


def compose_drums(s: Song):
    KA, KB = '......x.......x.', '......x...x..x..'
    CL = '....x.......x...'
    HATS = 'xo.oxo.oxo.oxo.o'
    for sc in s.sections:
        if 'drums' not in sc.stems:
            continue
        lab = sc.label or sc.name
        for i, bar in enumerate(sc.bar_range()):
            last = bar == sc.end_bar
            if sc.name == 'verse':
                if last:                                              # fill into the build
                    pattern_bar(s, 'drums', 'kick', bar, '......x...x.....', 0.66, **KICK)
                    pattern_bar(s, 'drums', 'clap', bar, CL, 0.9, **CLAP)
                    pattern_bar(s, 'drums', 'hat', bar, 'xo.oxo.oxo.o....', 0.42, ghost=0.2, **DHAT)
                    for six, size, v in ((13, 'high', 0.45), (14, 'mid', 0.5), (15, 'low', 0.55)):
                        s.hit('drums', 'tom', bar, six, v, size=size, decay=0.22)
                    continue
                pattern_bar(s, 'drums', 'kick', bar, KA if i % 2 == 0 else KB, 0.62, **KICK)
                pattern_bar(s, 'drums', 'clap', bar, CL, 0.95, **CLAP)
                pattern_bar(s, 'drums', 'hat', bar, HATS, 0.48, ghost=0.24, **DHAT)
                if lab == 'verse 2':
                    pattern_bar(s, 'drums', 'snare', bar, '.......o.......o', 0.3, ghost=0.24, **GHOST)
                if i % 4 == 3:
                    s.hit('drums', 'openhat', bar, 14, 0.45, **OHAT)
                if i == 0:
                    s.hit('drums', 'crash', bar, 0, 0.4)
            elif sc.name == 'build':
                if i < 2:
                    pattern_bar(s, 'drums', 'kick', bar, KA if i % 2 == 0 else KB, 0.64, **KICK)
                    pattern_bar(s, 'drums', 'clap', bar, CL, 0.95, **CLAP)
                    pattern_bar(s, 'drums', 'hat', bar, HATS, 0.5, ghost=0.26, **DHAT)
                elif i == 2:
                    snare_roll(s, bar, 2)
                    pattern_bar(s, 'drums', 'kick', bar, KA, 0.66, **KICK)
                    pattern_bar(s, 'drums', 'hat', bar, 'xoxoxoxoxoxoxoxo', 0.46, ghost=0.28, skip={2, 6, 10, 14},
                                **DHAT)
                else:
                    pattern_bar(s, 'drums', 'kick', bar, '....x.......x...', 0.72, **KICK)
            elif sc.name == 'hook':
                e5 = sc.energy >= 5
                hi = hook_index(s, bar)
                fill = last
                if i == 0:
                    s.hit('drums', 'crash', bar, 0, 0.46 if e5 else 0.42)
                if fill and into_break(s, bar):                       # a stop fill: done by six 13, the freeze
                    pattern_bar(s, 'drums', 'kick', bar, '......x.........', 0.66, **KICK)   # lands in silence
                    pattern_bar(s, 'drums', 'clap', bar, '....x...........', 0.9, **CLAP)
                    pattern_bar(s, 'drums', 'snare', bar, '....x.4567......', 0.8, **SNARE)
                    pattern_bar(s, 'drums', 'hat', bar, 'xo.oxo..........', 0.42, ghost=0.2, **DHAT)
                    for six, size, v in ((10, 'high', 0.5), (11, 'high', 0.48), (12, 'mid', 0.55), (13, 'low', 0.6)):
                        s.hit('drums', 'tom', bar, six, v, size=size, decay=0.11)
                    continue
                if fill:                                              # fill into the outro
                    pattern_bar(s, 'drums', 'kick', bar, '......x.........', 0.66, **KICK)
                    pattern_bar(s, 'drums', 'clap', bar, '....x...........', 0.9, **CLAP)
                    pattern_bar(s, 'drums', 'snare', bar, '....x...4567....', 0.8, **SNARE)
                    pattern_bar(s, 'drums', 'hat', bar, 'xo.oxo.o........', 0.42, ghost=0.2, **DHAT)
                    for six, size, v in ((12, 'high', 0.5), (13, 'high', 0.48), (14, 'mid', 0.55), (15, 'low', 0.6)):
                        s.hit('drums', 'tom', bar, six, v, size=size, decay=0.13)
                    continue
                pattern_bar(s, 'drums', 'kick', bar, KA if i % 2 == 0 else KB, 0.64, **KICK)
                pattern_bar(s, 'drums', 'clap', bar, CL, 0.9, **CLAP)
                pattern_bar(s, 'drums', 'snare', bar, CL, 0.5, **SNARE)
                if e5:
                    pattern_bar(s, 'drums', 'ride', bar, 'x...o...x...o...', 0.24, ghost=0.16, decay=0.7, bell=0.15)
                    pattern_bar(s, 'drums', 'hat', bar, '.o.o.o.o.o.o.o.o', 0.3, ghost=0.24, **DHAT)
                    pattern_bar(s, 'drums', 'snare', bar, '.......o.o.....o', 0.3, ghost=0.22, **GHOST)
                    if hi == 3:                                       # half-way fill: a ghost-snare drag
                        for six, v in ((13, 0.3), (14, 0.38), (15, 0.46)):
                            s.hit('drums', 'snare', bar, six, v, **GHOST)
                else:
                    pattern_bar(s, 'drums', 'hat', bar, HATS, 0.5, ghost=0.26, **DHAT)
                if i % 2 == 1 and not (e5 and hi == 3):
                    s.hit('drums', 'openhat', bar, 14, 0.42, **OHAT)


def n808(s: Song, bar: int, six: float, pitch, dur: float, vel: float, frm=None, glide: float = 0.06, **kw):
    params = dict(B808, **kw)
    if frm is not None:
        params['from'] = frm
        params['glide'] = glide
    s.note('bass', 'bass808', bar, six, pitch, dur, vel, **params)


def compose_bass(s: Song):
    for sc in s.sections:
        if 'bass' not in sc.stems:
            continue
        lab = sc.label or sc.name
        for i, bar in enumerate(sc.bar_range()):
            last = bar == sc.end_bar
            if sc.name == 'verse':
                pat = VERSE_808[i % 4]
                for j, (six, p, d, v, frm) in enumerate(pat):
                    if j == 0 and i % 4 == 0 and i > 0:
                        frm = 'E2'
                    if last and six == 14:
                        p, frm = 'D2', 'C#2'                      # E6 -> E7 colour, D = the 3rd of the build's Bm7
                    n808(s, bar, six, p, d, v, frm)
                if lab == 'verse 2' and i % 2 == 0:              # verse 2: 16th ghost blips
                    n808(s, bar, 3, pat[0][1], 1, 0.5)
            elif sc.name == 'build':
                root = 'B1' if i < 2 else 'C#2'
                if i in (0, 2):
                    n808(s, bar, 0, root, 8, 0.85, 'D2' if i == 0 else 'B1', glide=0.05, decay=0.8)
                env = 900.0 + 300.0 * i
                steps = range(0, 16, 2) if i < 3 else (0, 2, 4, 6, 8, 9, 10, 11)
                for k, six in enumerate(steps):
                    v = 0.58 + 0.06 * i + (0.08 if six % 4 == 0 else 0.0) - (0.12 if (i, six) == (3, 0) else 0.0)
                    if i == 3 and six >= 8:
                        v = 0.66 + 0.06 * (six - 8)
                    s.note('bass', 'pluck_bass', bar, six, root, 1.5 if six < 8 or i < 3 else 0.8, min(v, 0.85),
                           **dict(PBASS, env=env))
            elif sc.name == 'hook':
                ch = chord_at(s, bar)
                lo = midi(HOOK_BASS_ROOT[ch])
                e5 = sc.energy >= 5
                n808(s, bar, 0, lo, 3, 0.56, decay=0.45)
                nxt = chord_at(s, bar + 1) if bar + 1 <= sc.end_bar else None
                for six, oc, v in PULSE:
                    if last and six > 10:
                        continue
                    s.note('bass', 'pluck_bass', bar, six, lo + (12 if oc == 'H' else 0), 1.25, v, **PBASS)
                if e5 and not last:
                    s.note('bass', 'pluck_bass', bar, 11, lo + 12, 1, 0.45, **PBASS)
                    if nxt:
                        s.note('bass', 'pluck_bass', bar, 15, midi(HOOK_BASS_ROOT[nxt]) + 12, 1, 0.55, **PBASS)


def arp_bar(s: Song, bar: int, sym: str, order, lo: int = 52, base: float = 1.0, env: float = 4000.0,
            steps=range(16), tones: int = 4, dur: float = 1.0, accent: float = 0.70):
    tn = arp_tones(sym, lo, 8 if tones == 4 else 6, tones)
    for six in steps:
        idx = order[six % len(order)]
        s.note('keys', 'pluck', bar, six, tn[min(idx, len(tn) - 1)], dur, round(step_vel(six, base, accent), 3),
               **dict(PLUCK, env=env))


def compose_keys(s: Song):
    prev = None
    for sc in s.sections:
        if 'keys' not in sc.stems:
            continue
        lab = sc.label or sc.name
        for i, bar in enumerate(sc.bar_range()):
            ch = chord_at(s, bar)
            if sc.name == 'intro':
                arp_bar(s, bar, ch, UPDOWN, base=(0.80, 0.86, 0.92, 1.0)[i], env=(1200.0, 2000.0, 3000.0, 4500.0)[i])
                if i == 0:
                    s.chord('keys', 'pad', bar, 0, voicing('F#m9', center=62, rootless=True), 62, 0.5,
                            **dict(PAD, attack=1.2))
            elif sc.name == 'verse':
                arp_bar(s, bar, ch, UPDOWN if lab == 'verse 1' else GROUP332, base=1.0, env=4000.0)
            elif sc.name == 'build':
                lo = 52 if lab == 'build 1' else 57
                arp_bar(s, bar, ch, UPDOWN, lo=lo, base=0.86 + 0.04 * i, env=3500.0 + 1200.0 * i)
            elif sc.name == 'hook':
                e5 = sc.energy >= 5
                stop = into_break(s, bar)                        # a freeze follows: out by six 14
                arp_bar(s, bar, ch, OCTAVES, base=0.82 if e5 else 0.76, env=3000.0 if e5 else 2600.0, tones=3,
                        accent=0.62, steps=range(14) if stop else range(16))
                v = voicing(ch, center=60, prev=prev)
                prev = v
                s.chord('keys', 'pad', bar, 0, v, 12 if stop else 15.5, 0.52 if e5 else 0.46, strum_ms=6,
                        **dict(PAD, release=0.12 if stop else 0.25 if bar == sc.end_bar else PAD['release']))
            elif sc.name == 'break':
                # the freezes (25, 27) are brass + fx only; the keys answer in 26 and 28: a short pad under a
                # rising 8th arp, out by six 14 before the next freeze
                if i in (1, 3):
                    last = i == 3
                    v = voicing(ch, center=62, rootless=False)
                    s.chord('keys', 'pad', bar, 0, v, 16 if last else 11, 0.5,
                            **dict(PAD, attack=0.12, release=0.3 if last else 0.12))
                    tn = arp_tones(ch, 57)
                    for k, six in enumerate(range(0, 16 if last else 13, 2)):
                        s.note('keys', 'pluck', bar, six, tn[k], 1.0, 0.44 + 0.02 * k, **dict(PLUCK, env=2500.0))
            elif sc.name == 'outro':
                if i == 0:
                    arp_bar(s, bar, ch, UPDOWN, base=0.85, env=3000.0)
                    s.chord('keys', 'pad', bar, 0, voicing('F#m9', center=62, rootless=True), 30, 0.5,
                            **dict(PAD, release=1.2))
                else:
                    s.chord('keys', 'pluck', bar, 0, voicing('F#m9', center=64), 8, 0.55, strum_ms=14,
                            **dict(PLUCK, env=3500.0, decay=0.5))


def compose_perc(s: Song):
    for sc in s.sections:
        if 'perc' not in sc.stems:
            continue
        lab = sc.label or sc.name
        for i, bar in enumerate(sc.bar_range()):
            if sc.name == 'build':
                acc = 0.36 + 0.04 * i
                pattern_bar(s, 'perc', 'shaker', bar, 'xoxoxoxoxoxoxoxo' if i < 3 else 'xxxxxxxxxxxxxxxx', acc,
                            ghost=acc * 0.65, **SHAKER)
            else:
                pattern_bar(s, 'perc', 'shaker', bar, 'xoxoxoxoxoxoxoxo', 0.45, ghost=0.3, **SHAKER)
            rim = '...x..x.......x.' if lab == 'verse 2' else '......x.......x.'
            if not (sc.name == 'hook' and bar == sc.end_bar):
                pattern_bar(s, 'perc', 'rim', bar, rim, 0.52)
            if sc.name == 'hook':
                cb = '...x.....o.x....' if sc.energy >= 5 and bar != sc.end_bar else '...x.......x....'
                pattern_bar(s, 'perc', 'cowbell', bar, cb, 0.42, ghost=0.3, decay=0.18)
                if sc.energy >= 5:
                    pattern_bar(s, 'perc', 'tamb', bar, '..x.......x.....', 0.4, decay=0.1)


def horn_chord(s: Song, bar: int, six: float, pitches, dur: float, vel: float, strum_ms: float = 5.0, **kw):
    """A brass chord, spread 5 ms per note upward. Tighter (2.5 / 4 ms) was tried on the hook stabs: the coherent
    attack pushed the shared peak guard to 2.95 / 2.67 dB (rule 9 wants <= 2.5) for ~2-3 ms of onset gain."""
    s.chord('horns', 'brass', bar, six, pitches, dur, vel, strum_ms=strum_ms, **dict(BRASS, **kw))


def compose_horns(s: Song):
    for sc in s.sections:
        if 'horns' not in sc.stems:
            continue
        lab = sc.label or sc.name
        for i, bar in enumerate(sc.bar_range()):
            if sc.name == 'build':
                for six, d, v, pitches, extra in BUILD_HORNS[lab][i]:
                    horn_chord(s, bar, six, pitches, d, v, voices=2, bright=0.8, **dict({'release': 0.08}, **extra))
            elif sc.name == 'verse':
                a, b = VERSE_HORNS[chord_at(s, bar)]
                soft = dict(voices=2, bright=0.7, release=0.07)
                if i % 2 == 0:                                       # answer the call
                    horn_chord(s, bar, 12, a, 1, 0.58, **soft)
                    horn_chord(s, bar, 14, b, 1, 0.64, **soft)
                else:                                                # push in, then land with the response
                    horn_chord(s, bar, 2, a, 2, 0.60, **soft)       # (the last bar lands on 12, with the fill,
                    horn_chord(s, bar, 12 if bar == sc.end_bar else 14, b, 1, 0.54, **soft)   # so the build's
                    # downbeat pile-up - kick, tom tail, 808, lead - carries no brass reverb)
            elif sc.name == 'hook':
                hi = hook_index(s, bar)
                e5 = sc.energy >= 5
                stabs = HOOK_HORNS_END if hi == 7 else HOOK_HORNS[hi % 4]
                for six, d, v, pitches, extra in stabs:
                    extra = dict({'release': 0.055}, **extra)
                    ps = [midi(p) for p in pitches]
                    if e5:                                           # the 4th voice: the top an octave down
                        ps = sorted(set(ps + [max(ps) - 12]))
                        horn_chord(s, bar, six, ps, d, v * 0.86, voices=3, **extra)
                    else:
                        horn_chord(s, bar, six, ps, d, v * 0.86, voices=2, bright=0.85, **extra)
    # break 1: freezes on 25.1 / 27.1, swells with falls on 26 / 28
    horn_chord(s, 25, 0, ['D4', 'A4', 'C#5', 'F#5'], 4, 1.0, fall=1)
    horn_chord(s, 26, 2, ['F#4', 'A4', 'C#5', 'E5'], 12, 0.85, attack=0.45, fall=3)
    horn_chord(s, 27, 0, ['C#4', 'G#4', 'B4', 'E#5'], 4, 1.0, fall=1)
    horn_chord(s, 28, 2, ['E#4', 'B4', 'C#5', 'G#5'], 12, 0.88, attack=0.45, fall=3)
    # the last freeze: 49.1 and 50.1, a pickup stab, then a swell into the final hook
    horn_chord(s, 49, 0, ['C#4', 'G#4', 'B4', 'E#5', 'G#5'], 4, 1.0)
    horn_chord(s, 49, 14, ['G#4', 'B4', 'E#5'], 1, 0.7)
    horn_chord(s, 50, 0, ['E#4', 'B4', 'C#5', 'G#5'], 4, 1.0)
    horn_chord(s, 50, 8, ['G#4', 'B4', 'E#5', 'G#5'], 8, 0.8, attack=0.35)


def lead_line(s: Song, notes, glide: float = 0.025, yelp_glide: float = 0.035, **params):
    """notes: [(bar, six, pitch, dur16, vel, fresh)]. Every note glides from the previous one when it follows within
    a sixteenth, unless marked fresh (a new attack)."""
    notes = sorted(notes, key=lambda x: (x[0], x[1]))
    prev = None
    for bar, six, p, d, v, fresh in notes:
        kw = dict(LEAD, **params)
        start = (bar - 1) * 16 + six
        if prev is not None and not fresh and start - prev[1] <= 1.0 + 1e-9:
            kw['from'] = prev[0]
            kw['glide'] = yelp_glide if abs(midi(p) - midi(prev[0])) >= 12 else glide
        s.note('lead', 'robo_lead', bar, six, p, d, v, **kw)
        prev = (p, start + d)


def compose_lead(s: Song):
    for sc in s.sections:
        if 'lead' not in sc.stems:
            continue
        lab = sc.label or sc.name
        if sc.name == 'hook':
            main_notes = []
            for bar in sc.bar_range():
                hi = hook_index(s, bar)
                cell = HOOK_LEAD[hi % 4] if hi != 7 else HOOK_LEAD_STOP if into_break(s, bar) else HOOK_LEAD_END
                for six, p, d, v, fresh in cell:
                    main_notes.append((bar, six, p, d, v, fresh))
            lead_line(s, main_notes)
        elif sc.name == 'verse':
            notes = []
            for i, bar in enumerate(sc.bar_range()):
                for six, p, d, v, fresh in VERSE2_LEAD[i]:
                    notes.append((bar, six, p, d, v, fresh))
            lead_line(s, notes)
        elif sc.name == 'build':
            b0 = sc.start_bar
            notes = []
            if lab == 'build 1':
                bm = arp_tones('Bm7', 59, 10)          # B3 D4 F#4 A4 B4 D5 F#5 A5 ...
                cs = arp_tones('C#7', 61, 10)          # C#4 E#4 G#4 B4 C#5 ...
                for k, six in enumerate(range(0, 16, 2)):                         # bar 1: 8ths
                    notes.append((b0, six, bm[k // 4 + k % 4], 1.5, 0.5 + 0.01 * k, True))
                for k, six in enumerate(range(0, 16, 2)):                         # bar 2: 8ths, higher
                    notes.append((b0 + 1, six, bm[2 + k // 4 + k % 4], 1.5, 0.58 + 0.01 * k, True))
                for g in range(8):                                                # bars 3-4: 16ths climbing
                    top = min(g, 5)
                    for k in range(4):
                        bar, six = b0 + 2 + g // 4, (g % 4) * 4 + k
                        notes.append((bar, six, cs[top + k], 0.8, 0.62 + 0.03 * g + (0.03 if k == 0 else 0), True))
            else:
                bm = arp_tones('Bm7', 62, 12)          # D4 F#4 A4 B4 D5 ...
                cs = arp_tones('C#7', 65, 12)          # E#4 G#4 B4 C#5 ...
                for g in range(16):
                    bar = b0 + g // 4
                    tn = bm if g < 8 else cs
                    top = min(g % 8, 5 if g < 8 else 4)          # tops out at D6 / C#6
                    for k in range(4):
                        six = (g % 4) * 4 + k
                        notes.append((bar, six, tn[top + k], 0.8, 0.5 + 0.022 * g + (0.06 if k == 0 else 0), True))
            lead_line(s, notes)


def compose_fx(s: Song):
    WASH = dict(lo=450.0, hi=3200.0, rate=0.09, q=1.2)
    # intro
    s.fx('fx', 'wash', 1, 0, 64, 0.36, **dict(WASH, lo=350.0, hi=2400.0))
    for bar, six, v in ((2, 14, 0.36), (3, 6, 0.4), (4, 6, 0.42), (4, 14, 0.46)):
        s.hit('fx', 'zap', bar, six, v, **ZAP_HI)
    s.fx_into('fx', 'reverse', 5, 0, 8, 0.55, pitches=[54, 57, 61, 64])
    # verse 1
    for b in (5, 9):
        s.fx('fx', 'wash', b, 0, 64, 0.34, **WASH)
    s.fx('fx', 'sweep', 8, 8, 8, 0.4)
    s.fx('fx', 'sweep', 12, 8, 8, 0.45)
    # build 1 -> hook 1
    s.fx('fx', 'wash', 13, 0, 64, 0.26, **WASH)
    s.fx_into('fx', 'riser', 17, 0, 64, 0.8, tone='F#2', lo=250.0, hi=8000.0)
    s.hit('fx', 'impact', 17, 0, 0.62, tune=40.0, decay=0.9)
    for b in (17, 21):
        s.fx('fx', 'wash', b, 0, 64, 0.28, **WASH)
    for bar in range(17, 25, 2):
        s.hit('fx', 'zap', bar, 6, 0.4, **ZAP_HI)
        s.hit('fx', 'zap', bar, 14, 0.4, **ZAP_LO)
    # break 1
    s.fx('fx', 'downsweep', 25, 0, 32, 0.55)
    s.fx('fx', 'wash', 25, 0, 64, 0.24, **dict(WASH, lo=300.0, hi=1800.0))
    s.fx('fx', 'scrub', 25, 8, 8, 0.62, pitch='F#3', rate=6.0)
    s.fx('fx', 'scrub', 27, 8, 8, 0.62, pitch='F#3', rate=7.0)
    s.fx_into('fx', 'reverse', 29, 0, 8, 0.58, pitches=[54, 61, 66, 69])
    # verse 2
    for b in (29, 33):
        s.fx('fx', 'wash', b, 0, 64, 0.34, **WASH)
    s.fx('fx', 'sweep', 32, 8, 8, 0.42)
    s.fx('fx', 'sweep', 36, 8, 8, 0.45)
    # build 2 -> hook 2
    s.fx('fx', 'wash', 37, 0, 64, 0.26, **WASH)
    s.fx_into('fx', 'riser', 41, 0, 64, 0.85, tone='F#2', lo=300.0, hi=9500.0)
    s.hit('fx', 'impact', 41, 0, 0.68, tune=40.0, decay=1.0)
    for b in (41, 45):
        s.fx('fx', 'wash', b, 0, 64, 0.28, **WASH)
    for bar in range(41, 49):
        s.hit('fx', 'zap', bar, 6, 0.42 if bar % 2 else 0.34, **(ZAP_HI if bar % 2 else ZAP_LO))
        s.hit('fx', 'zap', bar, 14, 0.4, **(ZAP_LO if bar % 2 else ZAP_HI))
    # the last freeze
    s.fx('fx', 'downsweep', 49, 0, 16, 0.5)
    s.fx('fx', 'scrub', 49, 8, 4, 0.66, pitch='F#3', rate=6.5)
    s.fx('fx', 'scrub', 50, 8, 4, 0.58, pitch='C#4', rate=8.0)
    s.fx_into('fx', 'riser', 51, 0, 32, 0.78, tone='C#3', lo=400.0, hi=9000.0)
    s.fx_into('fx', 'reverse', 51, 0, 8, 0.52, pitches=[54, 57, 61, 66])
    # hook 3
    s.hit('fx', 'impact', 51, 0, 0.66, tune=40.0, decay=1.0)
    s.fx('fx', 'wash', 51, 0, 64, 0.28, **WASH)
    for bar in range(51, 55):
        s.hit('fx', 'zap', bar, 6, 0.42 if bar % 2 else 0.34, **(ZAP_HI if bar % 2 else ZAP_LO))
        s.hit('fx', 'zap', bar, 14, 0.4, **(ZAP_LO if bar % 2 else ZAP_HI))
    # outro
    s.fx('fx', 'wash', 55, 0, 32, 0.3, **dict(WASH, lo=350.0, hi=2400.0))
    s.hit('fx', 'impact', 56, 0, 0.42, tune=38.0, decay=1.3)
    # critic pass: a zap on the last 16th of every verse bar (alternating low / high) and in the bars that were
    # only a quiet wash (hook 1's even bars, the builds' first bars, 26, 55), so the transition stem is heard in
    # most bars; the verses' wash is up a little (0.30 -> 0.34)
    for sc in s.sections:
        if sc.name != 'verse':
            continue
        for i, bar in enumerate(sc.bar_range()):
            s.hit('fx', 'zap', bar, 14, 0.30 if i % 2 == 0 else 0.34, **(ZAP_LO if i % 2 == 0 else ZAP_HI))
    for bar in (18, 20, 22, 24):
        s.hit('fx', 'zap', bar, 14, 0.32, **ZAP_LO)
    for bar in (13, 37):
        s.hit('fx', 'zap', bar, 14, 0.34, **ZAP_HI)
    s.hit('fx', 'zap', 26, 14, 0.34, **ZAP_LO)
    s.hit('fx', 'zap', 55, 6, 0.28, **ZAP_LO)


# Stem gains (dB). fel_synth 1.0.0 declares StemMix.gain_db but process_stem never applies it, so the gain is put
# into each stem's EQ as a complementary low-shelf + high-shelf pair at one corner: their product is exactly flat
# (= the gain at every frequency), and it scales the dry, echo and reverb paths alike. gain_db stays 0 so a later
# library that honours it cannot double-apply these.
GAIN_DB = {'bed': -0.7, 'drums': 1.0, 'bass': -4.5, 'keys': 3.5, 'perc': 3.0, 'horns': -0.5, 'lead': 2.5, 'fx': 3.0}


def gain_eq(stem: str) -> list:
    g = GAIN_DB[stem]
    return [('lowshelf', 1000.0, g), ('highshelf', 1000.0, g)] if g else []


def mix(s: Song):
    s.mix['bed'] = StemMix(eq=[('hp', 30.0), ('lp', 14000.0, 0.7)] + gain_eq('bed'), reverb=0.04,
                           reverb_type='room', pan=0.0)
    s.mix['drums'] = StemMix(eq=[('hp', 35.0), ('lp', 13500.0, 0.7)] + gain_eq('drums'), reverb=0.10,
                             reverb_type='room', pan=0.0)
    s.mix['bass'] = StemMix(eq=[('hp', 27.0), ('lp', 5000.0, 0.7)] + gain_eq('bass'), drive=0.3, duck=0.15,
                            duck_release=0.1, pan=0.0)
    s.mix['keys'] = StemMix(eq=[('hp', 150.0), ('lowshelf', 300.0, -2.0), ('lp', 12000.0, 0.7)] + gain_eq('keys'),
                            reverb=0.18, reverb_type='plate', duck=0.25, duck_release=0.12, pan=-0.3)
    s.mix['perc'] = StemMix(eq=[('hp', 250.0), ('lp', 13000.0, 0.7)] + gain_eq('perc'), reverb=0.12,
                            reverb_type='room', pan=0.35)
    s.mix['horns'] = StemMix(eq=[('hp', 180.0), ('peak', 2500.0, 1.5, 0.8), ('lp', 12000.0, 0.7)] + gain_eq('horns'),
                             reverb=0.18, reverb_type='plate', pan=0.2)
    s.mix['lead'] = StemMix(eq=[('hp', 220.0), ('peak', 1800.0, 1.0, 0.9), ('lp', 12000.0, 0.7)] + gain_eq('lead'),
                            reverb=0.12, reverb_type='plate', delay=0.15, delay_16ths=3, delay_fb=0.33, pan=0.0)
    s.mix['fx'] = StemMix(eq=[('hp', 70.0), ('lp', 13000.0, 0.7)] + gain_eq('fx'), reverb=0.3, reverb_type='hall',
                          pan=-0.1, width=0.9)


if __name__ == '__main__':
    main(build, __file__)
