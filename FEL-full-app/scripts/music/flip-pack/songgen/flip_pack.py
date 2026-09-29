"""flip_pack — the shared finisher for the Flip loop pack (musicsuite/flippack; the rules are CONTRACT.md there,
the design and the "writing for the finder" numbers are SPEC.md). FROZEN for the pack workflow: producers import it,
they do not edit it (a variant belongs in the producer's own flip_*.py module).

Producers compose; this module renders, finishes, encodes, measures and records, so every item is made the same way.
Nothing here composes music, and nothing here reads audio from anywhere but its own renders (and, for the vocal
chops, Kokoro's output handed in as an array).

    import flip_pack as P, flip_voices        # (sys.path: songgen/) flip_voices registers flute/strings/gtr/mallet
    F = P.F                                    # fel_synth
    song = P.loop_song('loop_ep_soul', bpm=90, key='F minor', bars=4, seed=0xF101)
    song.chord('keys', 'ep', 1, 0, F.voicing('Fm9', center=64), dur16=2, vel=0.9, decay=0.35)
    song.mix['keys'] = F.StemMix(gain_db=0, eq=[('hp', 150)], reverb=0.08, reverb_type='room')   # gain_db IS applied here
    y = P.render_loop(song)                    # (n, 2): one seamless cycle, attacks window-locked
    P.write_loop(song, y, kind='loop', title='Velvet Keys', tags=['keys', 'soul'],
                 suggested_pads=P.pads_from_song(song, 'keys'), script=__file__)
    # -> flippack/audio/loop_ep_soul.mp3 + flippack/items/loop_ep_soul.json; prints the verdict; raises on a failure

    x = P.render_chord('ep', F.voicing('Cm9', center=62), 0.4, 0.9, seed=7, strum_ms=6)
    P.write_oneshot('stab_ep_cm9', P.process(x, eq=[('hp', 120)], reverb=0.1), kind='stab', title='EP Cm9',
                    tags=['keys', 'stab'], root='C4', chord='Cm9', script=__file__, seed=7)

Also: layer (sum one-shot parts), write_sheet (vocal chop sheets), write_texture, shape_chop (one Flip onset per
spoken chop), tame / accent
(detector-keyed mix tools, last resort), varispeed / resample, report(id), validate_record(rec).
FLIPPACK_DIR=<dir> sends every write to a dry-run pack instead of musicsuite/flippack.

Timing: `lock_time(t)` moves an attack onto the Flip's 10 ms analysis grid (k x 10 ms + LOCK_OFFSET_MS) so the
finder cuts every slice 1 ms before its attack at 44.1 AND 48 kHz (its windows are 10 ms at any rate). The move is
at most 5 ms; every part starting on the same grid position moves together; `_nolock=True` opts an event out.
Loops: rendered circularly (fold, tile, process, keep one cycle) and encoded with circular context that a gapless
decoder drops (the LAME delay/padding widened, the tag CRC re-signed) — no seam at the loop point.
"""
from __future__ import annotations

import datetime
import hashlib
import json
import math
import os
import platform
import re
import sys

import numpy as np
import soundfile as sf

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
import fel_synth as F  # noqa: E402
from fel_synth import SR, db, undb, lufs, sha256_file, edge_fade, _cos_ramp, make_ir, fft_convolve, fft_filter  # noqa: E402,F401

_REAL_PACK = os.path.join(os.path.dirname(_HERE), 'flippack')
# FLIPPACK_DIR=<scratch dir> renders a dry run somewhere else (the real pack is only written without it)
PACK_DIR = os.path.abspath(os.environ.get('FLIPPACK_DIR', _REAL_PACK))
AUDIO_DIR = os.path.join(PACK_DIR, 'audio')
ITEMS_DIR = os.path.join(PACK_DIR, 'items')
sys.path.insert(0, _REAL_PACK)
import onsets_check as OC  # noqa: E402

PACK_VERSION = '1.0.0'
DATE = '2026-09-25'
LICENCE = 'FEL original, generated'
STATEMENT = ('100% original, generated from code by FEL (fel_synth + flip_* modules). No samples, no third-party audio, '
             'no recognisable melodies. Spoken chops are Kokoro-82M synthetic voices rendered locally; no real person.')

KINDS = ('theme', 'loop', 'stab', 'hit', 'chop', 'texture')
ID_PREFIX = {'theme': 'theme_', 'loop': 'loop_', 'stab': 'stab_', 'hit': 'hit_', 'chop': 'chop_', 'texture': 'tex_'}
STEREO_KINDS = ('theme', 'loop', 'texture')
# the integer tempos 85-125 for which N bars of 4/4 is a whole number of samples at 44.1 kHz
EXACT_BPMS = (90, 96, 98, 100, 105, 108, 112, 120, 125)

LOCK_OFFSET_MS = 1.0
WINDOW_S = 0.010
MP3_LEVEL = 0.3                   # libsndfile compression_level -> LAME VBR ~V3 (stereo ~150-190 kbps, mono ~70-100)

LIMITS = {
    'peak_db': -1.0,               # every decoded file
    'loop_lufs': -16.0, 'loop_lufs_tol': 1.0,          # theme / loop (stereo, BS.1770 via fel_synth.lufs)
    'texture_lufs': -22.0, 'texture_lufs_tol': 3.0,    # texture (stereo); crackle may sit at the quiet end
    'oneshot_peak_db': (-4.0, -1.0),                    # stab / hit / chop (decoded peak window)
    'preroll_ms': 5.0,             # first sample >= 10 % of the peak (one-shots) / steepest rise (loops) within this
    'tail_silence_s': 0.10,        # one-shots: at most this much below -60 dBFS at the end
    'end_db': -40.0,               # one-shots: the last 5 ms stay under this
    'dc_abs': 0.002,
    'match_s': 0.0105,             # a detected onset matches a suggested pad within one 10 ms window (+ rounding)
    'min_gap_s': 0.15,             # loops: the closest two detected onsets
    'weak_max': 0, 'near_max': 1,  # robustness: weak onsets (ratio < 2.6) / near misses (1.7..2.2) per rate
    'loop_bytes': 420_000, 'oneshot_bytes': 80_000, 'sheet_bytes': 260_000, 'texture_bytes': 420_000,
    'title_max': 24,
}
RATES = (44100, 48000)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# time
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def loop_samples(bpm: float, bars: int) -> int:
    """Samples in `bars` bars of 4/4 at `bpm`; raises unless that is a whole number (the loop-exactness rule)."""
    exact = bars * 240.0 * SR / bpm
    n = int(round(exact))
    if abs(exact - n) > 1e-6:
        raise ValueError(f'{bars} bars at {bpm} BPM = {exact:.3f} samples (not whole); use one of {EXACT_BPMS}')
    return n


def lock_time(t: float) -> float:
    """The nearest k x 10 ms + LOCK_OFFSET_MS at or after 0 (moves an attack by at most 5 ms)."""
    off = LOCK_OFFSET_MS * 1e-3
    k = max(0, int(round((t - off) / WINDOW_S)))
    return k * WINDOW_S + off


def lock_sample(t: float) -> int:
    return int(round(lock_time(t) * SR))


def pad_time(t: float) -> float:
    """The slice point for an attack at grid time t: the start of its 10 ms window (1 ms before the locked attack)."""
    return round(max(0.0, lock_time(t) - LOCK_OFFSET_MS * 1e-3), 6)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# loops: fel_synth songs rendered as seamless, window-locked stereo loops
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def loop_song(id: str, *, bpm: float, key: str, bars: int, seed: int, swing: float = 0.5,
              human_vel: float = 0.03) -> F.Song:
    """A fel_synth Song set up as a loop: one section, no timing humanise (the lock does timing), light velocity
    humanise. The eight stem names are just track names here (pan/reverb/eq per track via song.mix[...])."""
    loop_samples(bpm, bars)
    song = F.Song(id=re.sub(r'[^a-z_]', '_', id), title=id[:32], style='flip', bpm=bpm, key=key, bars=bars,
                  sections=[F.Section('hook', 1, bars, 3, F.STEMS)], seed=seed, difficulty=1,
                  target_taps_per_min=0, swing=swing, preview_bars=bars, human_ms=0.0, human_vel=human_vel)
    song.flip_id = id
    return song


class LockedRenderer(F._Renderer):
    """fel_synth's renderer with every attack on the Flip grid (params _nolock=True opts an event out)."""

    def __init__(self, song: F.Song, lock: bool = True):
        super().__init__(song)
        self.lock = lock

    def event_start(self, e: F.Event) -> int:
        t = self.song.time(e.bar, e.six)
        if self.lock and not e.params.get('_nolock'):
            t = lock_time(t)
        t += e.params.get('_offset_ms', 0.0) * 1e-3
        return max(0, int(round(t * SR)))

    def render_phrase(self, ph: F.Phrase):
        song = self.song
        notes = []
        for (bar, six, m, dur16, vel) in ph.notes:
            t = song.time(bar, six)
            t = lock_time(t) if (self.lock and not ph.params.get('_nolock')) else t
            s = max(0, int(round(t * SR)))
            e = s + int(round(dur16 * song.d16 * SR))
            notes.append(F.PhraseNote(s, e, m, vel))
        p = {k: v for k, v in ph.params.items() if not k.startswith('_')}
        rng = F.rng_for(song.seed, 'phrase', ph.stem, ph.voice, ph.notes[0][0], ph.notes[0][1])
        return F.render_lead_phrase(ph.voice, notes, p, rng)


def _stereo_stem(song: F.Song, stem: str, parts: F.StemParts, n_total: int) -> np.ndarray:
    """Pan + stereo reverb side, and StemMix.gain_db — which fel_synth 1.0.0 declares but never applies (its songs
    level stems only through loudness/limiting); here it IS the track fader."""
    mx = song.mix[stem]
    g = undb(mx.gain_db)
    th = (mx.pan + 1) * np.pi / 4
    mono = (parts.pre + parts.wet) * g
    L = mono * math.cos(th) * math.sqrt(2)
    R = mono * math.sin(th) * math.sqrt(2)
    if mx.reverb > 0 and mx.width > 0:
        cfg = F.REVERBS[mx.reverb_type]
        irL = make_ir(seed=song.seed, channel=0, **cfg)
        irR = make_ir(seed=song.seed, channel=1, **cfg)
        side = fft_convolve(parts.send * g, irL - irR, n_total) * 0.5 * mx.width
        L = L + side
        R = R - side
    return np.stack([L, R], axis=1)


def fold(y: np.ndarray, n: int) -> np.ndarray:
    """Circular fold: everything past sample n (tails, echoes, reverb) is added back from the head, so the loop's
    end flows into its start with no seam."""
    out = np.array(y[:n], copy=True)
    k = n
    while k < len(y):
        m = min(n, len(y) - k)
        out[:m] += y[k:k + m]
        k += n
    return out


def render_loop(song: F.Song, lock: bool = True, tail_sec: float = 8.0, stems=None) -> np.ndarray:
    """(n, 2) stereo float64 of one seamless cycle: every stem that has events, mixed by song.mix (gain_db, pan, eq,
    drive, reverb, delay, width, duck, tremolo). NOT levelled (write_loop levels).

    Circular all the way: each stem's dry render (notes + tails up to tail_sec) is folded onto one cycle FIRST, then
    tiled and processed, and the middle cycle is kept — so EQ pre-ringing, reverb and echo tails wrap around the
    seam exactly as they would in an endless loop (a linear fold AFTER processing leaves a step at the seam)."""
    n = loop_samples(song.bpm, song.bars)
    total = n + int(tail_sec * SR)
    rend = LockedRenderer(song, lock)
    kicks = [rend.event_start(e) % n for e in song.events if e.voice in ('kick', 'kickx')]
    used = {e.stem for e in song.events} | {p.stem for p in song.phrases}
    reps = 2 + int(math.ceil(4.0 * SR / n))                 # enough cycles before the kept one for the longest tail
    keep = slice((reps - 1) * n - n, (reps - 1) * n)        # the second-to-last cycle: tails from before, pre-ring from after
    tiled_kicks = [k + i * n for i in range(reps) for k in kicks]
    out = np.zeros((n, 2))
    for stem in F.STEMS:
        if stem not in used or (stems and stem not in stems):
            continue
        dry = fold(rend.render_stem_dry(stem, total), n)
        tiled = np.tile(dry, reps)
        parts = F.process_stem(song, stem, tiled, reps * n, tiled_kicks)
        out += _stereo_stem(song, stem, parts, reps * n)[keep]
    return out


def circular_limit(y: np.ndarray, ceiling_db: float) -> np.ndarray:
    """fel_synth's transparent limiter, computed on three copies of the loop so the gain wraps without a seam."""
    ceil = undb(ceiling_db)
    n = len(y)
    tri = np.concatenate([y, y, y], axis=0)
    g = F.limiter_gain(tri, ceil)[n:2 * n]
    return y * (g[:, None] if y.ndim == 2 else g)


def level_loop(y: np.ndarray, target_lufs: float, ceiling_db: float = -1.6) -> np.ndarray:
    for _ in range(3):
        y = y * undb(target_lufs - lufs(y))
        y = circular_limit(y, ceiling_db)
    return y


def pads_from_song(song: F.Song, *stems: str, extra: list[float] | None = None, drop: list[float] | None = None) -> list[float]:
    """Suggested pads = the slice point of every note/chord/phrase start on the given stems (grid positions merged),
    in seconds. Pass the stems that carry the chop events (e.g. the lead + the chord hits)."""
    ts = set()
    for e in song.events:
        if e.stem in stems and e.onset and not e.params.get('_nopad'):
            ts.add(round(song.time(e.bar, e.six), 6))
    for ph in song.phrases:
        if ph.stem in stems and not ph.params.get('_nopad'):
            for (bar, six, m, dur16, vel) in ph.notes:
                ts.add(round(song.time(bar, six), 6))
    ts |= set(extra or [])
    pads = sorted({pad_time(t) for t in ts})
    if drop:
        pads = [p for p in pads if all(abs(p - d) > 0.004 for d in drop)]
    return pads


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# one-shots
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def render_voice(voice: str, note, dur: float, vel: float = 0.9, seed: int = 1, variant: int = 0, **params) -> np.ndarray:
    """One note / hit of any fel_synth voice (incl. voices registered by flip_* modules), edge-faded, mono.
    `note` is a name/midi or None (unpitched); a voice's own `pitch=<Hz>` param (tom, conga) passes through **params."""
    spec = F.VOICES[voice]
    if spec.fn is None:                                  # a lead voice: a one-note phrase
        n_end = int(round(dur * SR))
        rng = F.rng_for(seed, 'lead', voice, variant)
        _, x = F.render_lead_phrase(voice, [F.PhraseNote(0, n_end, F.midi(note), vel)], dict(params), rng)
        return edge_fade(x, 2.0, 3.0)
    m = F.midi(note) if note is not None else None
    call = F.VoiceCall(F.hz(m) if m is not None else None, m, float(dur), float(vel), dict(params),
                       F.rng_for(seed, 'voice', voice, variant, F._freeze(params), m))
    return edge_fade(spec.fn(call), 2.0, 3.0) * (vel ** 1.3)


def render_chord(voice: str, pitches, dur: float, vel: float = 0.85, seed: int = 1, strum_ms: float = 0.0, **params) -> np.ndarray:
    parts = []
    for i, p in enumerate(sorted(F.midi(x) for x in pitches)):
        x = render_voice(voice, p, dur, vel, seed=seed, variant=i, **params)
        off = int(round(i * strum_ms * 1e-3 * SR))
        parts.append(np.concatenate([np.zeros(off), x]))
    n = max(len(p) for p in parts)
    return sum(np.pad(p, (0, n - len(p))) for p in parts)


def layer(*parts: np.ndarray, gains_db: list[float] | None = None, offsets_ms: list[float] | None = None) -> np.ndarray:
    """Sum mono parts of different lengths (layered one-shots: an orchestra hit, a doubled stab), each with an
    optional gain (dB) and start offset (ms)."""
    gains = gains_db or [0.0] * len(parts)
    offs = [int(round((o or 0.0) * 1e-3 * SR)) for o in (offsets_ms or [0.0] * len(parts))]
    n = max(o + len(x) for o, x in zip(offs, parts))
    out = np.zeros(n)
    for x, g, o in zip(parts, gains, offs):
        out[o:o + len(x)] += np.asarray(x, dtype=np.float64) * undb(g)
    return out


def process(x: np.ndarray, eq=None, drive: float = 0.0, reverb: float = 0.0, reverb_type: str = 'room',
            seed: int = 1, tail_sec: float = 1.5) -> np.ndarray:
    """Mono chain for a one-shot: drive -> EQ -> reverb send (mono return). Adds tail room for the reverb."""
    y = np.concatenate([np.asarray(x, dtype=np.float64), np.zeros(int(tail_sec * SR) if reverb > 0 else 0)])
    if drive > 0:
        y = F._sat(y, drive)
    y = fft_filter(y, list(eq or []) + [('hp', 20.0, 0.707)], pad=int(0.3 * SR))[:len(y)]
    if reverb > 0:
        cfg = F.REVERBS[reverb_type]
        ir = make_ir(seed=seed, channel=0, **cfg)
        y = y + fft_convolve(y, ir, len(y)) * reverb
    return y


def resample(x: np.ndarray, sr_in: int, sr_out: int = SR) -> np.ndarray:
    """Band-limited FFT resample (e.g. Kokoro's 24 kHz -> 44.1 kHz; also varispeed: resample(x, SR, SR / ratio))."""
    return OC.resample(np.asarray(x, dtype=np.float64), sr_in, sr_out).astype(np.float64)


def varispeed(x: np.ndarray, semitones: float) -> np.ndarray:
    """MPC-style pitch: speed and pitch together (+12 = twice as fast, an octave up)."""
    ratio = 2.0 ** (semitones / 12.0)
    return resample(x, int(round(SR * ratio)), SR) if abs(semitones) > 1e-9 else np.asarray(x, dtype=np.float64)


def trim_oneshot(x: np.ndarray, peak_db: float = -3.0, floor_db: float = -60.0, fade_in_ms: float = 0.7,
                 fade_out_ms: float = 25.0, head_frac: float = 0.03, keep_pre_ms: float = 1.0,
                 max_sec: float | None = None, cut_fade_ms: float = 60.0) -> np.ndarray:
    """Trim to the first transient (keep_pre_ms before the first sample >= head_frac x peak), cut the tail where
    it falls under floor_db (+ the fade), raised-cosine fades, normalise the peak to peak_db. Mono in, mono out."""
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 2:
        x = x.mean(axis=1)
    x = fft_filter(np.concatenate([x, np.zeros(int(0.05 * SR))]), [('hp', 20.0, 0.707)], pad=int(0.2 * SR))[:len(x)]
    pk = float(np.max(np.abs(x)))
    if pk <= 0:
        raise ValueError('silent one-shot')
    x = x / pk
    above = np.nonzero(np.abs(x) >= head_frac)[0]
    a = max(0, int(above[0]) - int(keep_pre_ms * 1e-3 * SR))
    env = np.sqrt(F.moving_avg(x * x, int(0.005 * SR)))
    loud = np.nonzero(env >= undb(floor_db))[0]
    b = min(len(x), int(loud[-1]) + int(fade_out_ms * 1e-3 * SR)) if len(loud) else len(x)
    y = x[a:b].copy()
    fo_ms = fade_out_ms
    if max_sec is not None and len(y) > int(max_sec * SR):      # a hard length (sheets): cut, with a longer fade
        y = y[:int(max_sec * SR)]
        fo_ms = max(fade_out_ms, cut_fade_ms)
    fi = max(1, int(fade_in_ms * 1e-3 * SR))
    fo = max(1, int(min(fo_ms * 1e-3 * SR, len(y) // 3)))
    y[:fi] *= _cos_ramp(fi)
    y[-fo:] *= _cos_ramp(fo)[::-1]
    y[0] = 0.0
    y[-1] = 0.0
    return y / float(np.max(np.abs(y))) * undb(peak_db)


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# detector-aware shaping (last-resort mix tools; arrangement comes first — see SPEC.md "writing for the finder")
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def detector_view(mono: np.ndarray, sr: int = SR) -> tuple[np.ndarray, np.ndarray, np.ndarray, int]:
    """The Flip finder's state per 10 ms window: (env, floor, ratio, window size)."""
    win = max(16, int(sr * 10 // 1000))
    env = OC.energy_envelope(np.asarray(mono, dtype=np.float32), win).astype(np.float64)
    floor = np.zeros(len(env))
    fl = 0.0
    for w in range(1, len(env)):
        fl = fl * 0.9 + env[w - 1] * 0.1
        floor[w] = fl
    ratio = np.where(floor > 0, env / np.maximum(floor, 1e-12), np.inf)
    return env, floor, ratio, win


def _window_gain_to_samples(gw: np.ndarray, win: int, n: int, smooth_ms: float = 4.0) -> np.ndarray:
    centers = np.arange(len(gw)) * win + win / 2
    g = np.interp(np.arange(n), centers, gw, left=gw[0] if len(gw) else 1.0, right=gw[-1] if len(gw) else 1.0)
    return F.moving_avg(g, max(1, int(smooth_ms * 1e-3 * SR)))


def tame(y: np.ndarray, pads: list[float], cap_ratio: float = 1.8, max_cut_db: float = 4.0, guard_s: float = 0.03,
         passes: int = 4) -> np.ndarray:
    """Pull every finder-visible rise that is NOT a suggested pad (outside +-guard_s of one) down to cap_ratio,
    by at most max_cut_db, with a smooth gain (a detector-keyed compressor). Mono or (n, 2)."""
    y = np.array(y, dtype=np.float64, copy=True)
    for _ in range(passes):
        mono = y.mean(axis=1) if y.ndim == 2 else y
        env, floor, ratio, win = detector_view(mono)
        gw = np.ones(len(env))
        for w in range(1, len(env)):
            t = w * win / SR
            if ratio[w] > cap_ratio and env[w] > OC.GATE * 0.8 and all(abs(t - p) > guard_s for p in pads):
                gw[w] = max(undb(-max_cut_db), cap_ratio * floor[w] / env[w])
        if gw.min() >= 0.999:
            break
        g = _window_gain_to_samples(gw, win, len(mono))
        y = y * (g[:, None] if y.ndim == 2 else g)
    return y


def accent(y: np.ndarray, pads: list[float], boost_db: float = 3.0, hold_ms: float = 12.0, release_ms: float = 30.0) -> np.ndarray:
    """A transient shaper keyed to the suggested pads: +boost_db over the first hold_ms of each pad's attack, easing
    back over release_ms. Makes a weak chop onset solid without touching the arrangement."""
    y = np.array(y, dtype=np.float64, copy=True)
    n = len(y)
    g = np.zeros(n)
    h, r = int(hold_ms * 1e-3 * SR), int(release_ms * 1e-3 * SR)
    shape = np.concatenate([_cos_ramp(int(0.001 * SR)), np.ones(h), _cos_ramp(r)[::-1]])
    for p in pads:
        a = int(round(p * SR))
        m = min(len(shape), n - a)
        if m > 0:
            g[a:a + m] = np.maximum(g[a:a + m], shape[:m])
    gain = 10 ** (boost_db * g / 20.0)
    return y * (gain[:, None] if y.ndim == 2 else gain)


def shape_chop(x: np.ndarray, lead_ms: float = 50.0, cap_ratio: float = 1.7, max_cut_db: float = 10.0,
               head_frac: float = 0.03) -> np.ndarray:
    """Make a spoken chop register as ONE onset in the Flip, placed the way a sheet places it (sample 0 on a 10 ms
    window start, attack 1 ms in): trim a soft lead-in (breath, /h/, /j/) to at most lead_ms before the main rise
    (the first window at >= 30 % of the loudest), trim the head to 1 ms before the first sample >= head_frac x peak,
    then cap every later rise the finder could see (80 ms after the attack onward) at cap_ratio, by at most
    max_cut_db. Mono in, mono out (unnormalised, tail untouched; trim_oneshot() finishes it)."""
    x = np.asarray(x, dtype=np.float64)
    env, _, _, win = detector_view(x)
    main = int(np.nonzero(env >= 0.3 * env.max())[0][0]) * win
    x = x[max(0, main - int(lead_ms * 1e-3 * SR)):].copy()
    first = int(np.nonzero(np.abs(x) >= head_frac * np.max(np.abs(x)))[0][0])
    x = x[max(0, first - int(0.001 * SR)):].copy()
    fi = int(0.0007 * SR)
    x[:fi] *= _cos_ramp(fi)
    lead = np.zeros(win)                     # one silent window before it: the attack's own window is w = 1
    gap = int(math.floor(SR * OC.MIN_GAP_MS / 1000)) // win
    for _ in range(10):
        env, floor, ratio, win = detector_view(np.concatenate([lead, x]))
        gw = np.ones(len(env))
        for w in range(1 + gap, len(env)):
            if ratio[w] > cap_ratio and env[w] > OC.GATE * 0.25:
                gw[w] = max(undb(-max_cut_db), cap_ratio * 0.97 * floor[w] / env[w])
        if gw.min() >= 0.999:
            break
        g = _window_gain_to_samples(gw, win, len(x) + win)[win:]
        x = x * g
    return x


# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# encode, measure, record
# ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def _write_mp3(path: str, x: np.ndarray, level: float = MP3_LEVEL) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    sf.write(path, np.clip(x, -1, 1), SR, format='MP3', subtype='MPEG_LAYER_III', bitrate_mode='VARIABLE',
             compression_level=level)


def _crc16_arc(data: bytes) -> int:
    """CRC-16/ARC (poly 0xA001 reflected, init 0) — the LAME "Info tag CRC" (FFmpeg: AV_CRC_16_ANSI_LE)."""
    crc = 0
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ 0xA001 if crc & 1 else crc >> 1
    return crc


def _lame_offsets(buf: bytes) -> tuple[int, int]:
    """(frame start, LAME string offset) of the Xing/Info frame."""
    i = 0
    if buf[:3] == b'ID3':
        i = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9])
    while i < len(buf) - 1 and not (buf[i] == 0xFF and (buf[i + 1] & 0xE0) == 0xE0):
        i += 1
    for tag in (b'Xing', b'Info'):
        j = buf.find(tag, i, i + 200)
        if j >= 0:
            break
    else:
        raise RuntimeError('no Xing/Info frame')
    flags = int.from_bytes(buf[j + 4:j + 8], 'big')
    k = j + 8 + (4 if flags & 1 else 0) + (4 if flags & 2 else 0) + (100 if flags & 4 else 0) + (4 if flags & 8 else 0)
    if buf[k:k + 4] != b'LAME':
        raise RuntimeError('no LAME extension')
    return i, k


def _widen_gapless(path: str, head: int, tail: int) -> dict:
    """Add `head` samples to the LAME encoder delay and `tail` to the padding (so a gapless decoder drops the circular
    context we encoded around the loop), and re-sign the Info tag CRC."""
    buf = bytearray(open(path, 'rb').read())
    f0, k = _lame_offsets(bytes(buf))
    d = buf[k + 21:k + 24]
    delay, pad = (d[0] << 4) | (d[1] >> 4), ((d[1] & 0x0F) << 8) | d[2]
    nd, npad = delay + head, pad + tail
    if nd > 4095 or npad > 4095:
        raise RuntimeError(f'gapless fields overflow: delay {nd}, padding {npad}')
    buf[k + 21] = (nd >> 4) & 0xFF
    buf[k + 22] = ((nd & 0x0F) << 4) | ((npad >> 8) & 0x0F)
    buf[k + 23] = npad & 0xFF
    crc = _crc16_arc(bytes(buf[f0:k + 34]))
    buf[k + 34] = (crc >> 8) & 0xFF
    buf[k + 35] = crc & 0xFF
    open(path, 'wb').write(bytes(buf))
    return {'encoderDelay': nd, 'padding': npad, 'contextHead': head, 'contextTail': tail}


LOOP_CONTEXT = 1152        # samples of circular context encoded on each side of a loop, then dropped by the header


def _write_loop_mp3(path: str, x: np.ndarray, level: float = MP3_LEVEL) -> None:
    """A seamless loop MP3: encode [last C samples | loop | first C samples] and widen the LAME gapless fields by C
    at each end, so the MDCT edge artefacts of the first/last frames fall in the dropped context, not on the seam."""
    c = min(LOOP_CONTEXT, len(x) // 4)
    ext = np.concatenate([x[-c:], x, x[:c]], axis=0)
    _write_mp3(path, ext, level)
    _widen_gapless(path, c, c)


def coreaudio_decode(path: str) -> np.ndarray | None:
    """Decode with macOS CoreAudio (afconvert; the decoder family Safari uses), or None where unavailable."""
    import shutil
    import subprocess
    import tempfile
    if not shutil.which('afconvert'):
        return None
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        out = tmp.name
    try:
        subprocess.run(['afconvert', '-f', 'WAVE', '-d', f'LEF32@{SR}', path, out], check=True, capture_output=True)
        y, _ = sf.read(out, dtype='float64', always_2d=True)
        return y
    finally:
        os.unlink(out)


def encode_checked(path: str, x: np.ndarray, peak_db: float, level: float = MP3_LEVEL, loop: bool = False) -> np.ndarray:
    """Encode (loop=True: the seamless-loop encoding); if the decoded peak overshoots `peak_db`, trim the gain and
    re-encode (MP3 overshoot ~0.2-0.8 dB). The decoded length must equal the rendered length."""
    g = 1.0
    for _ in range(6):
        (_write_loop_mp3 if loop else _write_mp3)(path, x * g, level)
        dec, sr = sf.read(path, dtype='float64', always_2d=True)
        assert sr == SR, sr
        if len(dec) != len(x):
            raise RuntimeError(f'{path}: decoded {len(dec)} samples, rendered {len(x)} (gapless header?)')
        pk = db(np.max(np.abs(dec)))
        if pk <= peak_db:
            return dec
        g *= undb(peak_db - pk - 0.1)
    raise RuntimeError(f'{path}: decoded peak stays above {peak_db} dBFS')


def _clicks(ch: np.ndarray) -> list[int]:
    import validate as V            # songgen/validate.py (same click rule as the songs)
    return V.click_events(ch)


def _seam_clicks(dec: np.ndarray) -> list[int]:
    m = min(4096, len(dec) // 2)
    out = []
    for c in range(dec.shape[1]):
        seam = np.concatenate([dec[-m:, c], dec[:m, c]])
        out += [i - m for i in _clicks(seam) if abs(i - m) < int(0.01 * SR)]
    return out


def _rel(path: str) -> str:
    return os.path.relpath(path, PACK_DIR)


def head_onset(mono: np.ndarray, sr: int = SR) -> dict:
    """Is the downbeat a real transient WHEN THE FILE LOOPS? The Flip mirror run on [last 1 s of the loop + the loop]
    must fire within one window of the seam (the as-is Flip always fires at 10 ms on any file, so that proves nothing).
    Returns {ok, atMs (the onset's offset from the seam), ratio}."""
    k = min(len(mono) // 2, sr)
    rot = np.concatenate([mono[-k:], mono]).astype(np.float32)
    a = OC.analyse(rot, sr)
    for t, r in zip(a['uncappedOnsets'], a['onsetRatios']):
        off = t - k / sr
        if -0.0105 <= off <= 0.0105:
            return {'ok': True, 'atMs': round(off * 1e3, 2), 'ratio': r}
    return {'ok': False, 'atMs': None, 'ratio': None}


def measure(path: str, kind: str, suggested: list[float] | None) -> dict:
    dec, sr = sf.read(path, dtype='float64', always_2d=True)
    mono, _ = OC.load_mono(path)
    mono = mono.astype(np.float64)
    looped = kind in ('theme', 'loop') or (kind == 'chop' and suggested and len(suggested) > 1) or kind == 'texture'
    edge = int(0.005 * SR) if looped else 0          # a loop's file edges are checked as the seam instead
    m = {'samples': int(len(dec)), 'channels': int(dec.shape[1]), 'peakDb': round(db(np.max(np.abs(dec))), 2),
         'lufs': round(lufs(dec), 2), 'bytes': os.path.getsize(path),
         'dc': round(float(np.max(np.abs(dec.mean(axis=0)))), 5),
         'clicks': sorted({round(i / SR, 4) for c in range(dec.shape[1]) for i in _clicks(dec[:, c])
                           if edge <= i < len(dec) - edge})}
    rates = {}
    for r in RATES:
        rates[str(r)] = OC.analyse(OC.resample(mono, sr, r), r)
    m['flip'] = rates
    ca = coreaudio_decode(path)
    if ca is None:
        m['coreaudio'] = None
    else:
        k = min(4096, len(dec))
        same = len(ca) == len(dec) and float(np.max(np.abs(ca[:k] - dec[:k]))) < 2e-3 and float(np.max(np.abs(ca[-k:] - dec[-k:]))) < 2e-3
        m['coreaudio'] = {'samples': int(len(ca)), 'matches': bool(same)}
    m['edgeDb'] = {'start': round(db(np.max(np.abs(dec[:int(0.001 * SR)])) + 1e-12), 1),
                   'end': round(db(np.max(np.abs(dec[-int(0.001 * SR):])) + 1e-12), 1)}
    if looped:
        m['seamClicks'] = _seam_clicks(dec)
    if kind in ('theme', 'loop') or (kind == 'chop' and suggested and len(suggested) > 1):
        m['head'] = head_onset(mono)
    elif kind != 'texture':
        pk = np.max(np.abs(mono))
        first = np.nonzero(np.abs(mono) >= 0.03 * pk)[0]              # -30 dB re the peak
        m['prerollMs'] = round(float(first[0]) / SR * 1e3, 2) if len(first) else None
        env = np.sqrt(F.moving_avg(mono * mono, int(0.005 * SR)))
        loud = np.nonzero(env >= undb(-60))[0]
        m['tailSilenceSec'] = round((len(mono) - (int(loud[-1]) if len(loud) else 0)) / SR, 4)
        m['endDb'] = round(db(np.max(np.abs(mono[-int(0.005 * SR):])) + 1e-12), 1)
    if suggested:
        match = {}
        for rate, a in rates.items():
            on = a['uncappedOnsets']
            prec = [t for t in on if min(abs(t - s) for s in suggested) <= LIMITS['match_s']]
            rec = [s for s in suggested if on and min(abs(t - s) for t in on) <= LIMITS['match_s']]
            match[rate] = {'spurious': [t for t in on if t not in prec],
                           'missed': [s for s in suggested if s not in rec]}
        m['match'] = match
    return m


class Verdict:
    def __init__(self):
        self.checks: list[dict] = []
        self.warnings: list[dict] = []

    def add(self, name: str, ok: bool, detail=None):
        self.checks.append({'name': name, 'ok': bool(ok), **({'detail': detail} if detail is not None and not ok else {})})

    def warn(self, name: str, ok: bool, detail=None):
        """A SHOULD rule: reported, never fails the item."""
        if not ok:
            self.warnings.append({'name': name, 'detail': detail})

    @property
    def ok(self) -> bool:
        return all(c['ok'] for c in self.checks)

    def failures(self) -> list[dict]:
        return [c for c in self.checks if not c['ok']]


def validate_record(rec: dict, m: dict | None = None) -> Verdict:
    """Every CONTRACT.md item rule, on the sidecar record + the decoded file."""
    v = Verdict()
    kind = rec.get('kind')
    v.add('kind', kind in KINDS, kind)
    iid = rec.get('id', '')
    v.add('id.format', bool(re.fullmatch(r'[a-z0-9_]{3,48}', iid)) and iid.startswith(ID_PREFIX.get(kind, '?')), iid)
    v.add('file', rec.get('file') == f'audio/{iid}.mp3', rec.get('file'))
    path = os.path.join(PACK_DIR, rec.get('file', ''))
    if not os.path.exists(path):
        v.add('file.exists', False, path)
        return v
    m = m or measure(path, kind, rec.get('suggestedPads'))
    title = rec.get('title', '')
    v.add('title', 0 < len(title) <= LIMITS['title_max'] and title == title.strip(), title)
    tags = rec.get('tags', [])
    v.add('tags', 1 <= len(tags) <= 8 and all(re.fullmatch(r'[a-z0-9-]+', t) for t in tags), tags)
    v.add('samples', rec.get('samples') == m['samples'], (rec.get('samples'), m['samples']))
    if m.get('coreaudio') is not None:          # a second, independent decoder (CoreAudio = Safari's family) agrees
        v.add('decode.coreaudio', m['coreaudio']['matches'] and m['coreaudio']['samples'] == m['samples'], m['coreaudio'])
    lame = rec.get('lame') or {}
    v.add('lame.fields', isinstance(lame.get('encoderDelay'), int) and isinstance(lame.get('padding'), int), lame)
    v.add('durationSec', abs(rec.get('durationSec', -1) - m['samples'] / SR) < 1e-5, rec.get('durationSec'))
    want_ch = 2 if kind in STEREO_KINDS else 1
    v.add('channels', m['channels'] == want_ch, m['channels'])
    v.add('peak', m['peakDb'] <= LIMITS['peak_db'], m['peakDb'])
    v.add('dc', m['dc'] <= LIMITS['dc_abs'], m['dc'])
    if kind == 'texture' and rec.get('clicksByDesign'):
        v.add('no_clicks', True)                   # a crackle texture: its pops ARE the sound (textures only)
    else:
        v.add('no_clicks', not m['clicks'], m['clicks'][:8])
    prov = rec.get('provenance', {})
    v.add('provenance.fields', all(k in prov for k in ('script', 'seed', 'sha256', 'date', 'licence')), sorted(prov))
    v.add('provenance.sha256', prov.get('sha256') == sha256_file(path), 're-render: the file changed')
    v.add('provenance.date', prov.get('date') == DATE, prov.get('date'))
    v.add('provenance.licence', prov.get('licence') == LICENCE, prov.get('licence'))
    scr = prov.get('script', '')
    v.add('provenance.script', os.path.isabs(scr) and os.path.exists(scr), scr)
    if os.path.exists(scr):
        v.add('provenance.scriptSha256', prov.get('scriptSha256') == sha256_file(scr), 're-render: the script changed')
    v.add('provenance.seed', isinstance(prov.get('seed'), int), prov.get('seed'))
    if kind == 'chop':
        k = prov.get('kokoro') or {}
        need = ('package', 'model', 'modelSha256', 'voicesSha256', 'voice', 'speed', 'lang', 'text')
        v.add('provenance.kokoro', all(x in k for x in need) and isinstance(k.get('voice'), list) and k['voice'],
              sorted(k))
        mc = {'am_onyx', 'am_eric', 'af_nova', 'af_heart', 'bm_george', 'bm_fable'}        # the in-game MC cast
        v.add('chop.not_mc_cast', not ({n for n, _ in (k.get('voice') or [])} & mc), k.get('voice'))
        v.add('chop.text', isinstance(rec.get('text'), str) and 0 < len(rec['text']) <= 80, rec.get('text'))
        v.add('chop.voice', isinstance(rec.get('voice'), str) and 0 < len(rec['voice']) <= 16, rec.get('voice'))
    sp = rec.get('suggestedPads') or []
    v.add('suggestedPads.shape', 1 <= len(sp) <= 16 and sp == sorted(sp) and all(0 <= s < m['samples'] / SR for s in sp), sp)
    on = rec.get('onsets')
    v.add('onsets.mirror', on == m['flip']['44100']['onsets'], (on, m['flip']['44100']['onsets']))
    grid_like = kind in ('theme', 'loop') or (kind == 'chop' and len(sp) > 1)
    if grid_like:
        bpm, bars = rec.get('bpm'), rec.get('bars')
        v.add('bpm.exact', bpm in EXACT_BPMS, bpm)
        v.add('bars', bars in ((4,) if kind == 'theme' else (2, 4)), bars)
        if bpm in EXACT_BPMS and bars:
            v.add('length.exact', m['samples'] == loop_samples(bpm, bars), (m['samples'], bars, bpm))
        if kind != 'chop':
            try:
                F.Key(rec.get('key', ''))
                v.add('key', True)
            except Exception as e:  # noqa: BLE001
                v.add('key', False, str(e))
            v.add('lufs', abs(m['lufs'] - LIMITS['loop_lufs']) <= LIMITS['loop_lufs_tol'], m['lufs'])
        else:
            v.add('chop.sheet.peak', LIMITS['oneshot_peak_db'][0] <= m['peakDb'] <= LIMITS['oneshot_peak_db'][1], m['peakDb'])
        v.add('seam', not m['seamClicks'], m['seamClicks'])
        v.add('head.downbeat', m['head']['ok'], m['head'])
        v.warn('head.solid', m['head']['ok'] and m['head']['ratio'] >= OC.SOLID_ONSET, m['head'])
        durs = m['flip']['44100']['sliceSec']
        v.warn('slices.gate', not durs or max(durs[:-1] or [0]) <= 1.2, {'longestSec': max(durs[:-1] or [0])})
        lo = 12 if bars == 4 else 8
        v.add('suggestedPads.count', lo <= len(sp) <= 16 and sp and sp[0] == 0.0, (len(sp), sp[:1]))
        v.add('suggestedPads.spacing', len(sp) < 2 or min(np.diff(sp)) >= LIMITS['min_gap_s'] - 1e-9,
              round(float(min(np.diff(sp))), 4) if len(sp) > 1 else None)
        for rate, a in m['flip'].items():
            v.add(f'flip@{rate}.count', lo <= a['uncapped'] <= 16 and a['mode'] == 'transient', (a['mode'], a['uncapped']))
            v.add(f'flip@{rate}.min_gap', (a['minGapSec'] or 0) >= LIMITS['min_gap_s'], a['minGapSec'])
            v.add(f'flip@{rate}.no_spurious', not m['match'][rate]['spurious'], m['match'][rate]['spurious'])
            v.add(f'flip@{rate}.no_missed', not m['match'][rate]['missed'], m['match'][rate]['missed'])
            v.add(f'flip@{rate}.solid', len(a['weakOnsets']) <= LIMITS['weak_max'] and len(a['nearMisses']) <= LIMITS['near_max'],
                  {'weak': a['weakOnsets'], 'near': a['nearMisses']})
        if kind == 'loop' or kind == 'theme':
            v.add('bytes', m['bytes'] <= LIMITS['loop_bytes'], m['bytes'])
        else:
            v.add('bytes', m['bytes'] <= LIMITS['sheet_bytes'], m['bytes'])
    elif kind == 'texture':
        v.add('lufs', abs(m['lufs'] - LIMITS['texture_lufs']) <= LIMITS['texture_lufs_tol'], m['lufs'])
        v.add('bytes', m['bytes'] <= LIMITS['texture_bytes'], m['bytes'])
        if rec.get('bpm') is not None:                     # a loop, or a riser whose file end is the landing
            v.add('length.exact', rec.get('bpm') in EXACT_BPMS and m['samples'] == loop_samples(rec['bpm'], rec.get('bars') or 0),
                  (m['samples'], rec.get('bpm'), rec.get('bars')))
        if rec.get('loop') and not rec.get('clicksByDesign'):          # crackle: its pops may land on the seam
            v.add('seam', not m['seamClicks'], m['seamClicks'])
        elif not rec.get('loop'):
            v.add('texture.faded_edges', m['edgeDb']['start'] <= -40 and m['edgeDb']['end'] <= -40, m['edgeDb'])
        v.add('texture.length', 1.0 <= m['samples'] / SR <= 12.0, m['samples'] / SR)
    else:                       # stab / hit / chop one-shot
        lo_pk, hi_pk = LIMITS['oneshot_peak_db']
        v.add('oneshot.peak', lo_pk <= m['peakDb'] <= hi_pk, m['peakDb'])
        v.add('oneshot.preroll', m['prerollMs'] is not None and m['prerollMs'] <= LIMITS['preroll_ms'], m['prerollMs'])
        v.add('oneshot.tail_silence', m['tailSilenceSec'] <= LIMITS['tail_silence_s'], m['tailSilenceSec'])
        v.add('oneshot.end', m['endDb'] <= LIMITS['end_db'], m['endDb'])
        v.add('oneshot.length', 0.05 <= m['samples'] / SR <= 3.0, m['samples'] / SR)
        v.add('suggestedPads.whole', sp == [0.0], sp)
        v.add('bytes', m['bytes'] <= LIMITS['oneshot_bytes'], m['bytes'])
        if kind in ('stab',):
            v.add('root', bool(rec.get('root')), rec.get('root'))
        if kind == 'hit':
            v.warn('hit.root', bool(rec.get('root')) or any(t in ('drum', 'perc', 'kick', 'snare', 'rim', 'conga') for t in rec.get('tags', [])),
                   'a pitched hit should carry root')
        if rec.get('root'):
            try:
                F.midi(rec['root'])
                v.add('root.format', True)
            except Exception:  # noqa: BLE001
                v.add('root.format', False, rec['root'])
    return v


def _record(iid: str, kind: str, title: str, tags: list[str], samples: int, suggested: list[float], script: str,
            seed: int, extra: dict, prov_extra: dict | None) -> dict:
    path = os.path.join(AUDIO_DIR, f'{iid}.mp3')
    mono, sr = OC.load_mono(path)
    onsets = OC.analyse(mono, sr)['onsets']
    rec = {'id': iid, 'file': f'audio/{iid}.mp3', 'kind': kind, 'title': title}
    rec.update({k: v for k, v in extra.items() if v is not None})
    lt = F.lame_tag(path) or {}
    rec.update({
        'durationSec': round(samples / SR, 6), 'samples': samples, 'channels': 2 if kind in STEREO_KINDS else 1,
        'onsets': onsets, 'suggestedPads': [round(float(s), 4) for s in suggested], 'tags': list(tags),
        'lame': {'encoderDelay': lt.get('encoderDelay'), 'padding': lt.get('padding')},
    })
    scr = os.path.abspath(script)
    lib = os.path.join(_HERE, 'fel_synth.py')
    prov = {'script': scr, 'seed': int(seed), 'sha256': sha256_file(path), 'date': DATE, 'licence': LICENCE,
            'scriptSha256': sha256_file(scr), 'library': f'fel_synth {F.LIB_VERSION}',
            'librarySha256': sha256_file(lib), 'finisher': f'flip_pack {PACK_VERSION}',
            'finisherSha256': sha256_file(os.path.abspath(__file__)),
            'tools': {'python': platform.python_version(), 'numpy': np.__version__, 'soundfile': sf.__version__,
                      'libsndfile': sf.__libsndfile_version__}}
    if prov_extra:
        prov.update(prov_extra)
    rec['provenance'] = prov
    return rec


def _save(rec: dict, strict: bool) -> dict:
    v = validate_record(rec)
    os.makedirs(ITEMS_DIR, exist_ok=True)
    with open(os.path.join(ITEMS_DIR, f"{rec['id']}.json"), 'w') as fh:
        json.dump(rec, fh, indent=1)
        fh.write('\n')
    status = 'ok' if v.ok else 'FAIL'
    print(f"[flip_pack] {rec['id']}: {status}" + ('' if v.ok else ' ' + json.dumps(v.failures()))
          + (' warnings ' + json.dumps(v.warnings) if v.warnings else ''), flush=True)
    if strict and not v.ok:
        raise RuntimeError(f"{rec['id']} fails the contract: {json.dumps(v.failures())}")
    return rec


def write_loop(song: F.Song, y: np.ndarray, *, kind: str, title: str, tags: list[str], suggested_pads: list[float],
               script: str, lufs_target: float | None = None, extra: dict | None = None, strict: bool = True,
               prov_extra: dict | None = None) -> dict:
    """Level (-16 LUFS, circular limiter), encode stereo MP3, measure, validate, write the sidecar."""
    iid = song.flip_id
    n = loop_samples(song.bpm, song.bars)
    assert y.shape == (n, 2), (y.shape, n)
    target = lufs_target if lufs_target is not None else (LIMITS['texture_lufs'] if kind == 'texture' else LIMITS['loop_lufs'])
    y = level_loop(y, target)
    path = os.path.join(AUDIO_DIR, f'{iid}.mp3')
    encode_checked(path, y, LIMITS['peak_db'] - 0.2, loop=True)
    ex = {'bpm': int(song.bpm) if float(song.bpm).is_integer() else song.bpm, 'key': song.key, 'bars': song.bars,
          'loop': True, 'swing': song.swing if song.swing != 0.5 else None}
    ex.update(extra or {})
    return _save(_record(iid, kind, title, tags, n, suggested_pads, script, song.seed, ex, prov_extra), strict)


def write_oneshot(iid: str, x: np.ndarray, *, kind: str, title: str, tags: list[str], script: str, seed: int,
                  root: str | None = None, chord: str | None = None, key: str | None = None, extra: dict | None = None,
                  peak_db: float = -3.0, trim: bool = True, strict: bool = True, prov_extra: dict | None = None) -> dict:
    """Trim/fade/normalise (unless trim=False), encode mono MP3, measure, validate, write the sidecar."""
    y = trim_oneshot(x, peak_db=peak_db) if trim else np.asarray(x, dtype=np.float64)
    path = os.path.join(AUDIO_DIR, f'{iid}.mp3')
    encode_checked(path, y, min(peak_db + 0.5, LIMITS['peak_db'] - 0.2))
    ex = {'root': root, 'chord': chord, 'key': key}
    ex.update(extra or {})
    return _save(_record(iid, kind, title, tags, len(y), [0.0], script, seed, ex, prov_extra), strict)


def write_sheet(iid: str, x: np.ndarray, *, bpm: int, bars: int, title: str, tags: list[str], suggested_pads: list[float],
                script: str, seed: int, extra: dict | None = None, strict: bool = True, prov_extra: dict | None = None) -> dict:
    """A chop sheet (kind 'chop', mono, exactly `bars` bars at `bpm`, one chop per suggested pad), seamless."""
    n = loop_samples(bpm, bars)
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 2:
        x = x.mean(axis=1)
    x = fold(x, n) if len(x) > n else np.pad(x, (0, n - len(x)))
    x = circular_limit(x / max(np.max(np.abs(x)), 1e-9) * undb(-3.0), -3.0)
    path = os.path.join(AUDIO_DIR, f'{iid}.mp3')
    encode_checked(path, x, -2.7, loop=True)
    ex = {'bpm': bpm, 'bars': bars, 'loop': True, 'sheet': True}
    ex.update(extra or {})
    return _save(_record(iid, 'chop', title, tags, n, suggested_pads, script, seed, ex, prov_extra), strict)


def write_texture(iid: str, y: np.ndarray, *, title: str, tags: list[str], script: str, seed: int, loop: bool,
                  bpm: int | None = None, bars: int | None = None, lufs_target: float = -22.0, clicks_by_design: bool = False,
                  extra: dict | None = None, strict: bool = True, prov_extra: dict | None = None) -> dict:
    """A stereo texture (-22 LUFS by default; -25..-19 allowed). loop=True: y must already be seamless (fold() a
    render longer than the loop); bpm/bars optional, but exact when given (a riser's file end is its landing).
    clicks_by_design=True only for crackle (its pops are the sound)."""
    y = np.asarray(y, dtype=np.float64)
    if y.ndim == 1:
        y = np.stack([y, y], axis=1)
    if bpm is not None:
        assert len(y) == loop_samples(bpm, bars), (len(y), bpm, bars)
    if loop:
        y = level_loop(y, lufs_target)
    else:
        for _ in range(3):
            y = y * undb(lufs_target - lufs(y))
            y = y * F.limiter_gain(y, undb(-1.6))[:, None]
    path = os.path.join(AUDIO_DIR, f'{iid}.mp3')
    encode_checked(path, y, LIMITS['peak_db'] - 0.2, loop=loop)
    ex = {'loop': loop, 'bpm': bpm, 'bars': bars, 'clicksByDesign': True if clicks_by_design else None}
    ex.update(extra or {})
    return _save(_record(iid, 'texture', title, tags, len(y), [0.0], script, seed, ex, prov_extra), strict)


def report(iid: str) -> None:
    """Print the Flip mirror's view of an item (both rates)."""
    path = os.path.join(AUDIO_DIR, f'{iid}.mp3')
    r = OC.check_file(path)
    for rate, a in r['rates'].items():
        print(f"{iid} @{rate}: {a['mode']} pads={a['slices']} uncapped={a['uncapped']} minGap={a['minGapSec']} "
              f"weak={a['weakOnsets']} near={a['nearMisses']} blocked={a['blockedByGap']}\n   onsets={a['onsets']}")
