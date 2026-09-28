#!/usr/bin/env python3
"""flip_chops — the Kokoro vocal chops of the Flip loop pack (musicsuite/flippack, SPEC.md §4.4, CONTRACT.md).

    36 single chops (kind 'chop', mono one-shots)
        30 base chops chop_<word>_<voice>: 10 short original words x 3 synthetic Kokoro voice blends
        6 processed variants: chop_yeah_low, chop_hey_high, chop_go_stutter, chop_ooh_tuned, chop_ooh_swell,
          chop_fel_radio
    3 chop sheets (kind 'chop', sheet: true): 16 syllables one per beat, 4 bars, so the Flip puts one word per pad
    3 banks: flippack/banks/bank_vox_<voice>.json

Voices come ONLY from Kokoro-82M (Apache-2.0 weights) run locally through kokoro-onnx 0.6.1 (~/.cache/fel-kokoro):
three blends of its stock voice packs, none of them the in-game MC cast. They are synthetic, not real people. Nothing
else is read: no samples, no audio files. Kokoro is deterministic; the item seeds (0x4001.. in item order, sheets
0x4101..0x4103) drive only the processing (room IRs, the vibrato phase).

Each base chop: Kokoro (lang en-us, 24 kHz) -> P.resample to 44.1 kHz -> P.shape_chop -> light processing (drive
0.08, +1.5 dB air shelf, a short room at 0.06) -> P.write_oneshot(kind='chop'). For every word a few Kokoro spellings
are voiced ("Hey!", "Hey.", ...) and the take that hits hardest is kept (punch(): the most level in the first 80 ms
after the attack, within the word's length cap); the kept spelling is the provenance text, the others are listed.
Every spelling is run through Kokoro's own phonemizer first and refused unless it is the word (PHONEMES): the
phonemes the model was given are recorded in the provenance, and the self-check re-reads them.

    ~/.cache/fel-kokoro/.venv/bin/python flip_chops.py                 # render everything, then the self-check
    ~/.cache/fel-kokoro/.venv/bin/python flip_chops.py --only chop_ooh_tuned,chop_ooh_swell
    ~/.cache/fel-kokoro/.venv/bin/python flip_chops.py --check         # self-check only (no renders)
    FLIPPACK_DIR=<dir> ... flip_chops.py                               # a dry run somewhere else

Items are written where the contract puts them (flippack/audio/<id>.mp3, flippack/items/<id>.json) by the
finisher, then the banks (flippack/banks/bank_vox_{warm,deep,bright}.json), then flippack/chops/: a staging copy of
all of it (audio/, items/, banks/) plus chops/items.json, the pack.json entries of these 39 items.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import flip_pack as P  # noqa: E402
import flip_chops_dsp as D  # noqa: E402

F = P.F
SR = P.SR
SCRIPT = os.path.abspath(__file__)
DSP_SCRIPT = os.path.join(HERE, 'flip_chops_dsp.py')

# ── Kokoro ───────────────────────────────────────────────────────────────────────────────────────────────────────────

KOKORO_HOME = os.path.expanduser(os.environ.get('KOKORO_HOME', '~/.cache/fel-kokoro'))
KOKORO_RATE = 24000
KOKORO_LANG = 'en-us'
MODEL_SHA256 = '8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb'
VOICES_SHA256 = '4b4fa06e0f62b3418bc105cf4d43a611cc8c3a0aa4210c756778335de0fa20fd'
MC_CAST = {'am_onyx', 'am_eric', 'af_nova', 'af_heart', 'bm_george', 'bm_fable'}   # never used here

VOICES = {   # label -> Kokoro voice-pack blend (names never shown to players), speed, the chop high-pass
    'warm': {'mix': [['af_bella', 0.6], ['af_sky', 0.4]], 'speed': 1.0, 'hp': 90.0},
    'deep': {'mix': [['am_fenrir', 0.6], ['am_puck', 0.4]], 'speed': 0.95, 'hp': 60.0},
    'bright': {'mix': [['bf_emma', 0.6], ['bf_isabella', 0.4]], 'speed': 1.05, 'hp': 90.0},
}
VOICE_ORDER = ('warm', 'deep', 'bright')
assert not ({n for v in VOICES.values() for n, _ in v['mix']} & MC_CAST)

# slug, text (the record's `text`), title word, Kokoro spellings tried (in order), longest chop (s), tag
WORDS = [
    ('hey', 'hey', 'Hey', ['Hey!', 'Hey.', 'Hey!!'], 0.6, 'hey'),
    ('uh', 'uh', 'Uh', ['Uh!', 'Uh.', 'Uh!!'], 0.6, 'uh'),
    ('yeah', 'yeah', 'Yeah', ['Yeah.', 'Yeah!', 'Yeah!!'], 0.6, 'yeah'),
    ('go', 'go', 'Go', ['Go!', 'Go.', 'Go!!'], 0.6, 'go'),
    ('letsgo', "let's go", "Let's Go", ["Let's go!", "Let's go.", "Let's go!!"], 1.0, 'lets-go'),
    ('one', 'one', 'One', ['One!', 'One.', 'One!!'], 0.6, 'one'),
    ('two', 'two', 'Two', ['Two!', 'Two.', 'Two!!'], 0.6, 'two'),
    ('checkit', 'check it', 'Check It', ['Check it!', 'Check it.', 'Check it!!'], 1.0, 'check-it'),
    ('fel', 'F-E-L', 'F-E-L', ['F. E. L.', 'F. E. L!', 'F, E, L!'], 1.0, 'fel'),
    ('ooh', 'ooh', 'Ooh', ['Ooh.', 'Ooh!', 'Ooh!!'], 0.6, 'ooh'),
]
WORD = {w[0]: w for w in WORDS}
# What Kokoro must be asked to say, per word: its phonemizer's output for the spelling with punctuation and stress
# marks removed. Every spelling voiced (takes and the sheet spelling) is checked against this before it is rendered,
# so a spelling can never smuggle in a different word ('Uhh!' phonemizes to /uː/ = "ooh", 'Oooh.' to /uːoʊ/ =
# "oo-oh"; both were once kept takes).
PHONEMES = {'hey': 'heɪ', 'uh': 'ʌ', 'yeah': 'jɛh', 'go': 'ɡoʊ', 'letsgo': 'lɛts ɡoʊ', 'one': 'wʌn', 'two': 'tuː',
            'checkit': 'tʃɛk ɪt', 'fel': 'ɛf iː ɛl', 'ooh': 'uː'}


def bare_phonemes(ph: str) -> str:
    """Kokoro phonemes without punctuation or stress marks, spaces collapsed ('ˈɛf... ˈiː... ˈɛl.' -> 'ɛf iː ɛl')."""
    return ' '.join(re.sub(r"[.,!?;:…\"-]", ' ', re.sub(r'[ˈˌ]', '', ph)).split())

BASE_IDS = [f'chop_{w[0]}_{v}' for v in VOICE_ORDER for w in WORDS]
VARIANT_IDS = ['chop_yeah_low', 'chop_hey_high', 'chop_go_stutter', 'chop_ooh_tuned', 'chop_ooh_swell', 'chop_fel_radio']
VARIANT_VOICE = {'chop_yeah_low': 'deep', 'chop_hey_high': 'warm', 'chop_go_stutter': 'bright',
                 'chop_ooh_tuned': 'warm', 'chop_ooh_swell': 'warm', 'chop_fel_radio': 'deep'}
SEEDS = {iid: 0x4001 + i for i, iid in enumerate(BASE_IDS + VARIANT_IDS)}

# the sheets: 16 syllables, one per beat; a multi-syllable take is split at its energy dips
SHEET_ORDER = [('hey', 0, 1), ('uh', 0, 1), ('yeah', 0, 1), ('go', 0, 1), ('letsgo', 0, 2), ('letsgo', 1, 2),
               ('one', 0, 1), ('two', 0, 1), ('checkit', 0, 2), ('checkit', 1, 2), ('fel', 0, 3), ('fel', 1, 3),
               ('fel', 2, 3), ('ooh', 0, 1), ('yeah', 0, 1), ('hey', 0, 1)]
SHEET_TEXT = "hey uh yeah go let's go one two check it F E L ooh yeah hey"
SHEETS = {   # id -> seed, voice, bpm, longest syllable (s)
    'chop_sheet_warm': (0x4101, 'warm', 90, 0.45),
    'chop_sheet_deep': (0x4102, 'deep', 96, 0.38),     # its "yeah" (pad 3) follows a held "uh": at 0.40 the weakest
                                                       # onset measured 3.3, at 0.38 (with the 120 ms cut fade) 3.9
    'chop_sheet_bright': (0x4103, 'bright', 100, 0.40),
}
# a sheet syllable keeps at most 20 ms of soft lead-in before its main rise: a sheet pad must fire within one window
# of its beat, and shape_chop's default 50 ms (or 30) let the bright "let's" and "E" fire two windows late
SHEET_LEAD_MS = 20.0
# a syllable cut at the sheet's length cap fades over 120 ms (trim_oneshot's default is 60): the cut "yeah"/"go" end
# less abruptly, and the next pad's onset sees a lower floor (the deep sheet's "yeah" after the held /ʌ/ of "uh")
SHEET_CUT_FADE_MS = 120.0
# the sheet cuts F-E-L into three letters; spelled with ellipses Kokoro leaves a real pause between them (in the
# chop takes E runs straight into L, and the deepest dip lands inside the L)
SHEET_SPELLING = {'fel': 'F... E... L.'}
ALL_IDS = BASE_IDS + VARIANT_IDS + list(SHEETS)

# light processing (SPEC §4.4: air <= 2 dB, drive <= 0.1, room <= 0.08)
AIR_DB, DRIVE, ROOM = 1.5, 0.08, 0.06
C4, C5 = F.hz(F.midi('C4')), F.hz(F.midi('C5'))


def utterance_bounds(x: np.ndarray, gap_s: float = 0.03, floor_db: float = -50.0, main_db: float = -20.0) -> tuple[int, int]:
    """The spoken word inside a Kokoro render: from 5 ms before the first sound to 10 ms after the last, where the
    sound is the runs above floor_db (re the loudest, 2 ms RMS) merged across gaps under gap_s, and a run counts only
    if it reaches main_db. Kokoro's punctuation silence goes, and so does a weak blip it sometimes leaves after a
    silent gap at the very end of a take (the bright blend does, about 60 ms after the word)."""
    e = D.env_rms(x, 2.0)
    idx = np.nonzero(e >= F.undb(floor_db) * e.max())[0]
    runs, s, prev = [], int(idx[0]), int(idx[0])
    for i in idx[1:]:
        if i - prev > gap_s * SR:
            runs.append((s, prev))
            s = int(i)
        prev = int(i)
    runs.append((s, prev))
    main = [(a, b) for a, b in runs if e[a:b + 1].max() >= F.undb(main_db) * e.max()]
    return max(0, main[0][0] - int(0.005 * SR)), min(len(x), main[-1][1] + int(0.010 * SR))


class Voicer:
    """Kokoro, loaded once; takes cached in memory by (voice, spelling). Checks the model files are the ones the
    provenance names."""

    def __init__(self):
        from kokoro_onnx import Kokoro
        model, voices = os.path.join(KOKORO_HOME, 'model.onnx'), os.path.join(KOKORO_HOME, 'voices-en.npz')
        for path, want in ((model, MODEL_SHA256), (voices, VOICES_SHA256)):
            got = F.sha256_file(path)
            if got != want:
                raise RuntimeError(f'{path}: sha256 {got} is not the pinned {want}')
        self.k = Kokoro(model, voices)
        self.styles = {lab: sum(w * self.k.get_voice_style(n) for n, w in v['mix']) for lab, v in VOICES.items()}
        self.cache: dict = {}

    def phonemes(self, text: str) -> str:
        """What Kokoro will actually say for `text` (its own phonemizer: the job's real input)."""
        return self.k.tokenizer.phonemize(text, KOKORO_LANG)

    def check_word(self, slug: str, text: str) -> str:
        """Refuse a spelling whose phonemes are not the word's (PHONEMES); returns the phonemes."""
        ph = self.phonemes(text)
        if bare_phonemes(ph) != PHONEMES[slug]:
            raise ValueError(f'{text!r} phonemizes to {ph!r}, not {slug!r} /{PHONEMES[slug]}/')
        return ph

    def say(self, voice: str, text: str) -> np.ndarray:
        """Kokoro at 24 kHz -> 44.1 kHz (P.resample), cut to the spoken word (utterance_bounds), edges faded."""
        key = (voice, text)
        if key not in self.cache:
            a, sr = self.k.create(text, voice=self.styles[voice], speed=VOICES[voice]['speed'], lang=KOKORO_LANG)
            assert sr == KOKORO_RATE, sr
            x = P.resample(np.asarray(a, dtype=np.float64), KOKORO_RATE)
            a0, b0 = utterance_bounds(x)
            y = D.fade_out(D.fade_in(x[a0:b0], 2.0), 10.0)
            self.cache[key] = y / float(np.max(np.abs(y))) * 0.9
        return self.cache[key]


def kokoro_prov(voice: str, text: str, phonemes: str | None = None) -> dict:
    out = {'package': 'kokoro-onnx 0.6.1', 'model': 'Kokoro-82M v1.0 ONNX (Apache-2.0)',
           'modelSha256': MODEL_SHA256, 'voicesSha256': VOICES_SHA256,
           'voice': [list(p) for p in VOICES[voice]['mix']], 'speed': VOICES[voice]['speed'], 'lang': KOKORO_LANG,
           'text': text}
    if phonemes:
        out['phonemes'] = phonemes        # what the model was actually asked to say (its phonemizer's output)
    return out


def sounding_sec(x: np.ndarray, rel_db: float = -30.0) -> float:
    e = D.env_rms(x, 5.0)
    loud = np.nonzero(e >= F.undb(rel_db) * e.max())[0]
    return (loud[-1] - loud[0]) / SR if len(loud) else 0.0


def punch(shaped: np.ndarray) -> float:
    """How hard a take hits: the mean 10 ms level over the first 80 ms after the attack, relative to its loudest."""
    env, _, _, _ = P.detector_view(shaped / np.max(np.abs(shaped)))
    return float(np.mean(env[:8]) / env.max())


class Takes:
    """The kept take per (voice, word): every spelling voiced, shaped, and the punchiest one inside the cap kept."""

    def __init__(self, voicer: Voicer):
        self.v = voicer
        self.kept: dict = {}

    def get(self, voice: str, slug: str) -> dict:
        key = (voice, slug)
        if key not in self.kept:
            _, _, _, spellings, cap, _ = WORD[slug]
            scored = []
            for i, text in enumerate(spellings):
                ph = self.v.check_word(slug, text)
                raw = self.v.say(voice, text)
                shaped = P.shape_chop(raw)
                over = max(0.0, sounding_sec(shaped) - (cap - 0.08))
                scored.append((punch(shaped) - 2.0 * over, -i, text, raw, shaped, ph))
            best = max(scored, key=lambda s: (s[0], s[1]))
            self.kept[key] = {'text': best[2], 'raw': best[3], 'shaped': best[4], 'phonemes': best[5],
                              'tried': [{'text': s[2], 'phonemes': s[5], 'score': round(s[0], 4)}
                                        for s in sorted(scored, key=lambda s: -s[1])]}
        return self.kept[key]


# ── processing ───────────────────────────────────────────────────────────────────────────────────────────────────────

def colour(x: np.ndarray, voice: str, drive: float = DRIVE, air_db: float = AIR_DB) -> np.ndarray:
    """Drive + high-pass + air shelf (no reverb). drive=0: EQ only (the sheets: the tanh lifts a soft lead-in
    against the attack, which measured as a weak Flip onset on the deep sheet)."""
    y = D.saturate(x, drive) if drive > 0 else np.asarray(x, dtype=np.float64)
    y = np.concatenate([y, np.zeros(int(0.03 * SR))])
    return F.fft_filter(y, [('hp', VOICES[voice]['hp'], 0.707, 2), ('highshelf', 7500.0, air_db)], pad=int(0.2 * SR))


def light(x: np.ndarray, voice: str, seed: int) -> np.ndarray:
    """The base chops' light processing: drive 0.08, +1.5 dB air, a short room at 0.06."""
    return D.short_room(colour(x, voice), ROOM, seed=seed)


def preflight(x: np.ndarray, peak_db: float, loop: bool = False) -> list[int]:
    """Encode exactly as the finisher will (P.encode_checked, same level and peak target), decode, and return where
    the songs' click detector fires (a loop's first/last 5 ms are checked across the seam instead, as P.measure does)."""
    import tempfile
    fd, tmp = tempfile.mkstemp(suffix='.mp3', prefix='flip_chops_')
    os.close(fd)
    try:
        dec = P.encode_checked(tmp, x, peak_db, loop=loop)
    finally:
        os.unlink(tmp)
    edge = int(0.005 * SR) if loop else 0
    hits = sorted({i for c in range(dec.shape[1]) for i in P._clicks(dec[:, c]) if edge <= i < len(dec) - edge})
    if loop:
        hits += sorted({(i + len(dec)) % len(dec) for i in P._seam_clicks(dec)})
    return hits


def declick_clean(y: np.ndarray, peak_db: float = -3.0, target_db: float = -2.5) -> tuple[np.ndarray, int]:
    """Speech has real impulses (a /t/ or /k/ burst, a vocal-fry pulse) that the songs' click rule flags. Soften them
    with D.declick wherever the detector fires, first on the float signal, then on the decoded MP3 of the exact
    encode write_oneshot will make, until it is clean. Returns (signal at peak_db, points softened)."""
    fixed = 0
    at = P._clicks(y)
    for _ in range(8):
        if at:
            y = D.declick(y, at)
            y = y / np.max(np.abs(y)) * F.undb(peak_db)
            fixed += len(at)
        at = preflight(y, target_db)
        if not at:
            return y, fixed
    raise RuntimeError(f'still clicks after de-clicking: {at}')


def finish(x: np.ndarray, cap: float) -> np.ndarray:
    """Trim / fade / -3 dBFS, at most `cap` seconds (P.trim_oneshot). The tail is cut where it falls 55 dB under the
    peak (not 60): the file is normalised to -3 dBFS, so a slow reverb tail between -60 and -63 dBFS would otherwise
    count as end silence (CONTRACT §6.3)."""
    return P.trim_oneshot(x, peak_db=-3.0, max_sec=cap, floor_db=-55.0)


def write_chop(iid: str, y: np.ndarray, **kw) -> dict:
    """P.write_oneshot(kind='chop') of a finished chop (already trimmed by P.trim_oneshot, so trim=False), after the
    de-click pre-flight; the number of softened points goes in the provenance."""
    y, fixed = declick_clean(y)
    kw['prov_extra'] = dict(kw.get('prov_extra') or {}, declickedPoints=fixed)
    return P.write_oneshot(iid, y, kind='chop', script=SCRIPT, trim=False, **kw)


def base_meta(voice: str, slug: str) -> tuple[str, list[str], dict]:
    _, text, word, _, _, tag = WORD[slug]
    return f'{word} ({voice})', ['vocal', 'chop', tag, voice], {'text': text, 'voice': voice}


def prov_for(voice: str, take: dict, **more) -> dict:
    p = {'kokoro': kokoro_prov(voice, take['text'], take.get('phonemes')), 'takesTried': take['tried'],
         'dsp': {'script': DSP_SCRIPT, 'sha256': F.sha256_file(DSP_SCRIPT)}}
    p.update(more)
    return p


def render_base(iid: str, takes: Takes) -> dict:
    _, slug, voice = iid.split('_', 2)
    seed = SEEDS[iid]
    t = takes.get(voice, slug)
    cap = WORD[slug][4]
    y = finish(light(t['shaped'], voice, seed), cap)
    title, tags, extra = base_meta(voice, slug)
    return write_chop(iid, y, title=title, tags=tags, seed=seed, extra=extra,
                      prov_extra=prov_for(voice, t, process='shape_chop, drive 0.08, air +1.5 dB, room 0.06'))


def ooh_tuned_signal(takes: Takes, seed: int) -> tuple[np.ndarray, dict]:
    """Warm "ooh": autocorrelation f0 -> varispeed to the nearest C (C4) -> TD-PSOLA to C5 (the octave, with the
    vowel's formants kept) held for 1.0 s with a gentle delayed vibrato -> air + plate. Returns (signal, facts)."""
    t = takes.get('warm', 'ooh')
    x = t['raw']
    f0 = D.f0_median(x)
    semis = 12.0 * math.log2(C4 / f0)
    xv = P.varispeed(x, semis)
    f0_at = D.f0_function(xv)
    marks = D.pitch_marks(xv, f0_at)
    out_k, in_k = D.time_map_knots(xv, 1.0)
    rng = F.rng_for(seed, 'vibrato')
    f_out = D.vibrato_f0(C5, rate_hz=5.2, depth_cents=18.0, delay_s=0.30, ramp_s=0.30, phase=float(rng.random() * 2 * math.pi))
    y = D.psola(xv, marks, int(1.0 * SR), lambda o: np.interp(o, out_k, in_k), f_out)
    y = D.fade_out(D.fade_in(D.even_out(y, amount=0.6), 4.0), 70.0)   # a held note, not a spoken decay
    y = colour(y, 'warm', drive=0.05)
    y = P.process(y, eq=[('hp', 150.0)], reverb=0.14, reverb_type='plate', seed=seed, tail_sec=1.6)
    facts = {'f0SourceHz': round(f0, 1), 'varispeedSemis': round(semis, 3), 'f0TunedHz': round(D.f0_median(y[:int(0.9 * SR)]), 1),
             'stretch': 'TD-PSOLA to 1.0 s at C5 (formants kept), levelled, vibrato 5.2 Hz +-18 cents after 0.3 s, plate 0.14'}
    return y, facts


def render_variant(iid: str, takes: Takes, cache: dict) -> dict:
    seed = SEEDS[iid]
    voice = VARIANT_VOICE[iid]
    tags_v = ['vocal', 'chop', voice]
    if iid == 'chop_yeah_low':
        t = takes.get('deep', 'yeah')
        y = P.shape_chop(P.varispeed(t['shaped'], -5.0))
        y = D.saturate(y, 0.2)
        y = F.fft_filter(np.concatenate([y, np.zeros(int(0.03 * SR))]),
                         [('hp', 50.0, 0.707, 2), ('lp', 6000.0, 0.707, 2)], pad=int(0.2 * SR))
        y = finish(D.short_room(y, 0.05, seed=seed), 0.9)
        return write_chop(iid, y, title='Yeah (slowed)', tags=tags_v[:2] + ['yeah', 'deep', 'slowed'],
                          seed=seed, extra={'text': 'yeah', 'voice': 'deep'},
                          prov_extra=prov_for('deep', t, derivedFrom='chop_yeah_deep',
                                              process='varispeed -5 st, drive 0.2, LP 6 kHz, room 0.05'))
    if iid == 'chop_hey_high':
        t = takes.get('warm', 'hey')
        y = P.shape_chop(P.varispeed(t['shaped'], 5.0))
        y = finish(light(y, 'warm', seed), 0.6)
        return write_chop(iid, y, title='Hey (chipmunk)', tags=tags_v[:2] + ['hey', 'warm', 'pitched'],
                          seed=seed, extra={'text': 'hey', 'voice': 'warm'},
                          prov_extra=prov_for('warm', t, derivedFrom='chop_hey_warm',
                                              process='varispeed +5 st, then the base light processing'))
    if iid == 'chop_go_stutter':
        t = takes.get('bright', 'go')
        g = finish(light(t['shaped'], 'bright', seed), 0.6)
        six = int(round(60.0 / 100 / 4 * SR))            # a 16th at 100 BPM = 0.15 s = 15 Flip windows
        gate = int(round(0.7 * six))
        out = np.zeros(2 * six + len(g))
        for i, lvl in enumerate((-1.5, -0.75, 0.0)):
            seg = g if i == 2 else D.fade_out(g[:gate], 12.0)
            out[i * six:i * six + len(seg)] += seg * F.undb(lvl)
        return write_chop(iid, finish(out, 2.0), title='Go Go Go', tags=tags_v[:2] + ['go', 'bright', 'stutter'],
                          seed=seed, extra={'text': 'go go go', 'voice': 'bright'},
                          prov_extra=prov_for('bright', t, derivedFrom='chop_go_bright',
                                              process='three hits on 16ths at 100 BPM, first two gated to 70 % (105 ms)'))
    if iid == 'chop_ooh_tuned':
        if 'ooh' not in cache:
            cache['ooh'] = ooh_tuned_signal(takes, SEEDS['chop_ooh_tuned'])
        y, facts = cache['ooh']
        t = takes.get('warm', 'ooh')
        return write_chop(iid, finish(y, 3.0), title='Ooh (tuned C)', tags=tags_v[:2] + ['ooh', 'warm', 'tuned', 'pitched'],
                          seed=seed, root='C5', extra={'text': 'ooh', 'voice': 'warm'},
                          prov_extra=prov_for('warm', t, derivedFrom='chop_ooh_warm', tuning=facts))
    if iid == 'chop_ooh_swell':
        if 'ooh' not in cache:
            cache['ooh'] = ooh_tuned_signal(takes, SEEDS['chop_ooh_tuned'])
        y, facts = cache['ooh']
        t = takes.get('warm', 'ooh')
        z = D.fade_in(y, 80.0)                                   # the reversed file ends on a faded attack
        z = P.process(z, eq=[('hp', 180.0)], reverb=0.35, reverb_type='plate', seed=seed, tail_sec=2.0)
        z = z[::-1].copy()
        z = D.fade_out(z, 30.0)
        return write_chop(iid, finish(z, 3.0), title='Ooh (reverse)', tags=tags_v[:2] + ['ooh', 'warm', 'reverse', 'swell'],
                          seed=seed, root='C5', extra={'text': 'ooh', 'voice': 'warm'},
                          prov_extra=prov_for('warm', t, derivedFrom='chop_ooh_tuned', tuning=facts,
                                              process='chop_ooh_tuned through a plate (0.35), reversed'))
    if iid == 'chop_fel_radio':
        t = takes.get('deep', 'fel')
        y = D.band(t['shaped'], 400.0, 3200.0, poles=4, mid_db=3.0, mid_hz=1500.0)
        y = D.saturate(y, 0.3)
        y = D.band(y, 350.0, 3600.0, poles=2)
        y = D.slap_echo(y, delay_ms=92.0, gain_db=-9.0, second_db=-19.0)
        y = finish(y, 1.25)
        return write_chop(iid, y, title='F-E-L (radio)', tags=tags_v[:2] + ['fel', 'deep', 'radio', 'lofi'],
                          seed=seed, extra={'text': 'F-E-L', 'voice': 'deep'},
                          prov_extra=prov_for('deep', t, derivedFrom='chop_fel_deep',
                                              process='band-pass 400 Hz-3.2 kHz (+3 dB at 1.5 kHz), drive 0.3, slap echo 92 ms -9 dB'))
    raise KeyError(iid)


def unvoiced_view(x: np.ndarray, win_ms: float = 10.0, hop_ms: float = 5.0) -> tuple[np.ndarray, np.ndarray, np.ndarray, int]:
    """Per 10 ms window (5 ms hop): (window starts, RMS level, share of the energy above 5 kHz, window length)."""
    x = np.asarray(x, dtype=np.float64)
    w, hop = int(win_ms * 1e-3 * SR), int(hop_ms * 1e-3 * SR)
    han = np.hanning(w)
    fr = np.fft.rfftfreq(w, 1.0 / SR)
    starts = np.arange(0, max(1, len(x) - w + 1), hop)
    lvl, hf = np.zeros(len(starts)), np.zeros(len(starts))
    for j, a in enumerate(starts):
        seg = x[a:a + w]
        if len(seg) < w:
            seg = np.pad(seg, (0, w - len(seg)))
        s = np.abs(np.fft.rfft(seg * han)) ** 2
        hf[j] = s[fr > 5000.0].sum() / (s[fr > 80.0].sum() + 1e-20)
        lvl[j] = math.sqrt(float(np.mean(seg * seg)))
    return starts, lvl, hf, w


def trim_unvoiced(x: np.ndarray, lead: bool, tail: bool, hiss_share: float = 0.5, hiss_db: float = -40.0,
                  voiced_share: float = 0.3, voiced_db: float = -25.0) -> tuple[np.ndarray, dict]:
    """Cut a hiss (breath / sibilant noise: over hiss_share of a window's energy above 5 kHz, within hiss_db of the
    loudest window) off the head and/or tail of a syllable whose own sounds are voiced there. The voiced span is the
    windows under voiced_share and within voiced_db of the loudest; an edge is cut 2 ms outside it (3 ms fade) only
    when a hiss sits beyond it. Returns (signal, {'leadMs', 'tailMs'} removed)."""
    x = np.asarray(x, dtype=np.float64)
    starts, lvl, hf, w = unvoiced_view(x)
    top = lvl.max()
    voiced = np.nonzero((hf < voiced_share) & (lvl >= top * F.undb(voiced_db)))[0]
    hiss = (hf > hiss_share) & (lvl >= top * F.undb(hiss_db))
    a, b = 0, len(x)
    if len(voiced):
        v0, v1 = int(voiced[0]), int(voiced[-1])
        if lead and hiss[:v0].any():
            a = max(0, int(starts[v0]) - int(0.002 * SR))
        if tail and hiss[v1 + 1:].any():
            b = min(len(x), int(starts[v1]) + w + int(0.002 * SR))
    y = x[a:b].copy()
    if a > 0:
        y = D.fade_in(y, 3.0)
    if b < len(x):
        y = D.fade_out(y, 3.0)
    return y, {'leadMs': round(a / SR * 1e3, 1), 'tailMs': round((len(x) - b) / SR * 1e3, 1)}


# A letter cut out of "F... E... L." keeps only its own sound. Kokoro's bright blend breathes a loud hiss (about
# -10 dB, 99 % of its energy above 5 kHz) into the pause between E and L, and the dip cut handed it to the L pad, which
# then opened "sss-ELL"; the deep blend leaves the /f/'s last 50 ms on the head of E. Each letter's own sounds are
# voiced except the /f/ at the end of F, so every part loses an unvoiced lead-in and E and L lose an unvoiced tail.
SHEET_UNVOICED_TRIM = {('fel', 0): (True, False), ('fel', 1): (True, True), ('fel', 2): (True, True)}


def sheet_syllables(voice: str, takes: Takes, max_sec: float) -> tuple[list[np.ndarray], list[tuple[str, str]], dict]:
    """The 16 sheet syllables; also the (spelling, phonemes) voiced, and the unvoiced edges trimmed (ms) per part."""
    sylls, texts, trims = [], [], {}
    for slug, part, n in SHEET_ORDER:
        t = takes.get(voice, slug)
        if slug in SHEET_SPELLING:
            sp = SHEET_SPELLING[slug]
            t = {'text': sp, 'phonemes': takes.v.check_word(slug, sp), 'raw': takes.v.say(voice, sp)}
        piece = t['raw'] if n == 1 else D.split_at_dips(t['raw'], n)[part]
        if (slug, part) in SHEET_UNVOICED_TRIM:
            piece, cut = trim_unvoiced(piece, *SHEET_UNVOICED_TRIM[(slug, part)])
            if cut['leadMs'] or cut['tailMs']:
                trims[f'{slug}[{part}]'] = cut
        c = P.shape_chop(piece, lead_ms=SHEET_LEAD_MS)
        c = colour(c, voice, drive=0.0)
        sylls.append(P.trim_oneshot(c, peak_db=-3.0, max_sec=max_sec, cut_fade_ms=SHEET_CUT_FADE_MS))
        if (t['text'], t['phonemes']) not in texts:
            texts.append((t['text'], t['phonemes']))
    return sylls, texts, trims


def render_sheet(iid: str, takes: Takes) -> dict:
    seed, voice, bpm, max_sec = SHEETS[iid]
    n = P.loop_samples(bpm, 4)
    sylls, texts, trims = sheet_syllables(voice, takes, max_sec)
    buf = np.zeros(n + int(SR))
    pads = []
    for b, s in enumerate(sylls):
        t = P.pad_time(b * 60.0 / bpm)
        a = int(round(t * SR))
        buf[a:a + len(s)] += s
        pads.append(t)
    # what write_sheet will encode (fold the tails into the head, -3 dBFS, circular limiter), de-clicked like the chops
    x = P.fold(buf, n)
    x = P.circular_limit(x / np.max(np.abs(x)) * F.undb(-3.0), -3.0)
    fixed = 0
    at = P._clicks(x)
    for _ in range(8):
        if at:
            x = D.declick(x, at)
            x = P.circular_limit(x / np.max(np.abs(x)) * F.undb(-3.0), -3.0)
            fixed += len(at)
        at = preflight(x, -2.7, loop=True)
        if not at:
            break
    else:
        raise RuntimeError(f'{iid}: still clicks after de-clicking: {at}')
    buf = x
    prov = {'kokoro': kokoro_prov(voice, ' | '.join(tx for tx, _ in texts), ' | '.join(ph for _, ph in texts)),
            'declickedPoints': fixed, 'unvoicedTrimMs': trims,
            'dsp': {'script': DSP_SCRIPT, 'sha256': F.sha256_file(DSP_SCRIPT)},
            'process': f'16 syllables (multi-syllable takes split at their energy dips; the F-E-L letters lose any '
                       f'breath hiss at their edges), each shape_chop(lead_ms={SHEET_LEAD_MS:g}), HP + air +1.5 dB, '
                       f'trim_oneshot(max_sec={max_sec}, cut fade {SHEET_CUT_FADE_MS:g} ms), placed at pad_time(beat) at {bpm} BPM'}
    return P.write_sheet(iid, buf, bpm=bpm, bars=4, title=f'Vox Sheet ({voice})', tags=['vocal', 'chop', 'sheet', voice, 'words'],
                         suggested_pads=pads, script=SCRIPT, seed=seed, extra={'text': SHEET_TEXT, 'voice': voice},
                         prov_extra=prov)


# ── banks, the chops folder, the self-check ─────────────────────────────────────────────────────────────────────────

def write_banks() -> list[str]:
    d = os.path.join(P.PACK_DIR, 'banks')
    os.makedirs(d, exist_ok=True)
    out = []
    for voice in VOICE_ORDER:
        pads = [f'chop_{w[0]}_{voice}' for w in WORDS] + [v for v in VARIANT_IDS if VARIANT_VOICE[v] == voice]
        pads += [None] * (16 - len(pads))
        bank = {'id': f'bank_vox_{voice}', 'title': f'Vox Chops ({voice})', 'pads': pads}
        path = os.path.join(d, f"{bank['id']}.json")
        with open(path, 'w') as fh:
            json.dump(bank, fh, indent=1)
            fh.write('\n')
        out.append(path)
    return out


def load_records() -> list[dict]:
    recs = []
    for iid in ALL_IDS:
        path = os.path.join(P.ITEMS_DIR, f'{iid}.json')
        if os.path.exists(path):
            with open(path) as fh:
                recs.append(json.load(fh))
    return recs


def write_chops_folder(recs: list[dict]) -> str:
    """flippack/chops/: this producer's staging copy, laid out like a pack of its own (audio/, items/, banks/) plus
    items.json (these items' pack.json entries, in item order; `file` resolves against flippack/ or chops/ alike)."""
    d = os.path.join(P.PACK_DIR, 'chops')
    for sub in ('audio', 'items', 'banks'):
        os.makedirs(os.path.join(d, sub), exist_ok=True)
    for r in recs:
        shutil.copyfile(os.path.join(P.PACK_DIR, r['file']), os.path.join(d, r['file']))
        shutil.copyfile(os.path.join(P.ITEMS_DIR, f"{r['id']}.json"), os.path.join(d, 'items', f"{r['id']}.json"))
    for voice in VOICE_ORDER:
        b = os.path.join(P.PACK_DIR, 'banks', f'bank_vox_{voice}.json')
        if os.path.exists(b):
            shutil.copyfile(b, os.path.join(d, 'banks', os.path.basename(b)))
    with open(os.path.join(d, 'items.json'), 'w') as fh:
        json.dump(recs, fh, indent=1)
        fh.write('\n')
    return os.path.join(d, 'items.json')


def seam_report(path: str) -> dict:
    """A sheet's loop point, numerically: the jump from the last sample to the first against the biggest
    sample-to-sample step inside the last and first 5 ms, plus the seam-click detector."""
    import soundfile as sf
    y, _ = sf.read(path, dtype='float64', always_2d=True)
    m = y[:, 0]
    k = int(0.005 * SR)
    jump = abs(m[0] - m[-1])
    inner = max(np.max(np.abs(np.diff(m[-k:]))), np.max(np.abs(np.diff(m[:k]))))
    return {'jump': round(float(jump), 6), 'maxStepEdges': round(float(inner), 6),
            'edgeDbfs': [round(F.db(np.max(np.abs(m[-k:]))), 1), round(F.db(np.max(np.abs(m[:k]))), 1)],
            'seamClicks': P._seam_clicks(y)}


def self_check(recs: list[dict]) -> bool:
    ok = True
    print(f"\n{'id':22s} {'kind':6s} {'sec':>5s} {'on44':>4s} {'on48':>4s} {'minRatio':>8s} {'peak':>6s} {'bytes':>7s}  verdict")
    total = 0
    for r in recs:
        v = P.validate_record(r)
        m = P.measure(os.path.join(P.PACK_DIR, r['file']), r['kind'], r.get('suggestedPads'))
        a44, a48 = m['flip']['44100'], m['flip']['48000']
        lo = min(a44['onsetRatios'] + a48['onsetRatios']) if a44['onsetRatios'] else None
        total += m['bytes']
        ok &= v.ok
        # the words: every recorded Kokoro job phonemizes to one of the ten listed words, nothing else
        ph = (r['provenance'].get('kokoro') or {}).get('phonemes', '')
        said = [bare_phonemes(x) for x in ph.split('|')] if ph else []
        words_ok = bool(said) and all(x in PHONEMES.values() for x in said)
        if not words_ok:
            ok = False
            print(f"   {r['id']}: Kokoro phonemes {ph!r} are not the listed words")
        print(f"{r['id']:22s} {'sheet' if r.get('sheet') else r['kind']:6s} {r['durationSec']:5.2f} {a44['uncapped']:4d} "
              f"{a48['uncapped']:4d} {lo if lo is not None else '-':>8} {m['peakDb']:6.2f} {m['bytes']:7d}  "
              f"{'ok' if v.ok else 'FAIL ' + json.dumps(v.failures())}{' warn ' + json.dumps(v.warnings) if v.warnings else ''}")
        if r.get('sheet'):
            sr = seam_report(os.path.join(P.PACK_DIR, r['file']))
            exact = m['samples'] == P.loop_samples(r['bpm'], r['bars'])
            print(f"   seam {sr}  barExact {exact} ({m['samples']} = {r['bars']} bars at {r['bpm']} BPM)  "
                  f"head {m['head']}  weak {a44['weakOnsets'] + a48['weakOnsets']} near {a44['nearMisses'] + a48['nearMisses']}")
            ok &= exact and not sr['seamClicks']
    print(f'{len(recs)} items, {total:,} bytes of audio')
    return ok


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--only', default='', help='comma-separated ids to render (default: all)')
    ap.add_argument('--check', action='store_true', help='self-check only, no renders')
    a = ap.parse_args(argv)
    only = [x for x in a.only.split(',') if x]
    bad = [x for x in only if x not in ALL_IDS]
    if bad:
        raise SystemExit(f'unknown ids: {bad}')
    if not a.check:
        takes = Takes(Voicer())
        cache: dict = {}
        for iid in ALL_IDS:
            if only and iid not in only:
                continue
            if iid in BASE_IDS:
                render_base(iid, takes)
            elif iid in VARIANT_IDS:
                render_variant(iid, takes, cache)
            else:
                render_sheet(iid, takes)
        for p in write_banks():
            print('[flip_chops] wrote', p)
    recs = load_records()
    print('[flip_chops] wrote', write_chops_folder(recs))
    return 0 if self_check(recs) else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
