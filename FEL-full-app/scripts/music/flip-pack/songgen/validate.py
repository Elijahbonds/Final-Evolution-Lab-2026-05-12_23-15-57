#!/usr/bin/env python3
"""validate.py — check rendered Cypher songs against CONTRACT.md and print a JSON verdict.

    python validate.py <songs_root | song_dir> [--profile song|smoke] [--suite] [--quiet]

A song dir holds map.json, preview.mp3 and stems/*.mp3. With a root, every sub-folder that has a map.json is checked.
--suite adds the set-level rules (six songs, the three legacy ids, difficulties 1..6, distinct keys/tempos).
Exit code 0 = every check passed. Every number the checks use is in LIMITS.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fel_synth import (SR, STEMS, EARNED_STEMS, SECTION_NAMES, Key, lufs, db, sha256_file, lame_tag)  # noqa: E402

LIMITS = {
    'stem_peak_db': -3.0,          # every decoded stem
    'sum_peak_db': -1.0,           # the 8 decoded stems summed at gain 1
    'preview_peak_db': -1.0,
    'lufs_target': -14.0,          # the 8-stem sum, BS.1770-style K-weighted gated loudness
    'lufs_tol': 1.0,
    'preview_lufs_tol': 1.5,
    'dc_abs': 1e-3,                # |mean| over the whole stem
    'dc_window_abs': 5e-3,         # |mean| over any 1 s window
    'silence_db': -60.0,           # a 50 ms window below this RMS is silent
    'gap_tolerance_sec': 0.06,     # a gap may exceed one bar by at most this (window quantisation)
    'click_abs': 0.006,            # |2nd difference| must exceed this ...
    'click_ratio': 8.0,            # ... and this many times its local RMS (±5 ms, excluding ±3 samples) ...
    'click_dominance': 2.5,        # ... and tower this many times over every other peak in that window
    'align_median_ms': 8.0,        # drum/bed onsets: median |audio onset - map time|
    'align_p90_ms': 15.0,
    'start_ms': 10.0,              # the bed's first audible sample (> -40 dBFS) is within this of t = 0
    'song_bytes': 6_500_000,       # 8 stems total
    'preview_bytes': 600_000,
    'stem_kbps_max': 112.0,        # sanity: VBR average per stem
    'dur_min': 90.0, 'dur_max': 120.0,
    'preview_bars': 16,
    'preview_env_corr': 0.8,       # preview (mid) vs the stem sum at preview.startBar: waveform correlation
    'date': '2026-09-25',
}
LEGACY_IDS = ('warmup', 'cypher', 'battle')


class Report:
    def __init__(self):
        self.checks = []

    def add(self, name: str, ok: bool, detail=None):
        self.checks.append({'name': name, 'ok': bool(ok), **({'detail': detail} if detail is not None else {})})
        return ok

    @property
    def ok(self) -> bool:
        return all(c['ok'] for c in self.checks)


def time_of(m: dict, bar: float, six: float) -> float:
    """The contract's clock: seconds of (bar, sixteenth) with swing on odd integer sixteenths."""
    d16 = 15.0 / m['bpm']
    s = float(six)
    sw = 2.0 * (m.get('swing', 0.5) - 0.5) if (s.is_integer() and int(s) % 2 == 1) else 0.0
    return ((bar - 1) * 16 + s + sw) * d16


# ── map schema ────────────────────────────────────────────────────────────────────────────────────────────────────

def check_map(m: dict, folder: str, rep: Report, profile: str) -> bool:
    ok = True
    req = {'id': str, 'title': str, 'style': str, 'bpm': (int, float), 'key': str, 'timeSig': str, 'bars': int,
           'durationSec': (int, float), 'sampleRate': int, 'samples': int, 'swing': (int, float), 'sections': list,
           'breakBars': list, 'difficulty': int, 'targetTapsPerMin': (int, float), 'preview': dict, 'stems': dict,
           'provenance': dict}
    missing = [k for k, t in req.items() if k not in m or not isinstance(m[k], t) or isinstance(m[k], bool)]
    ok &= rep.add('map.required_fields', not missing, missing or None)
    if missing:
        return False
    ok &= rep.add('map.id', bool(re.fullmatch(r'[a-z_]+', m['id'])) and m['id'] == os.path.basename(folder),
                  {'id': m['id'], 'folder': os.path.basename(folder)})
    ok &= rep.add('map.title', 0 < len(m['title'].strip()) <= 32, m['title'])
    try:
        Key(m['key'])
        kok = True
    except Exception as e:  # noqa: BLE001
        kok = False
    ok &= rep.add('map.key_parses', kok, m['key'])
    ok &= rep.add('map.timeSig', m['timeSig'] == '4/4', m['timeSig'])
    ok &= rep.add('map.bpm_range', 60 <= m['bpm'] <= 200, m['bpm'])
    ok &= rep.add('map.swing_range', 0.5 <= m['swing'] <= 0.75, m['swing'])
    dur = m['bars'] * 240.0 / m['bpm']
    ok &= rep.add('map.durationSec', abs(m['durationSec'] - dur) < 1e-4, {'map': m['durationSec'], 'expected': dur})
    ok &= rep.add('map.sampleRate', m['sampleRate'] == SR, m['sampleRate'])
    ok &= rep.add('map.samples', m['samples'] == int(round(m['durationSec'] * SR)),
                  {'map': m['samples'], 'expected': int(round(m['durationSec'] * SR))})
    if profile == 'song':
        ok &= rep.add('map.duration_90_120', LIMITS['dur_min'] <= m['durationSec'] <= LIMITS['dur_max'],
                      round(m['durationSec'], 2))
    ok &= rep.add('map.difficulty', 1 <= m['difficulty'] <= 6, m['difficulty'])
    ok &= rep.add('map.targetTapsPerMin', 0 < m['targetTapsPerMin'] <= 400, m['targetTapsPerMin'])
    if m.get('hookStem') is not None:
        ok &= rep.add('map.hookStem', m['hookStem'] in EARNED_STEMS, m['hookStem'])

    # sections
    errs = []
    b = 1
    for s in m['sections']:
        for k in ('name', 'startBar', 'bars', 'energy', 'stems'):
            if k not in s:
                errs.append(f'section missing {k}: {s}')
        if errs:
            break
        if s['name'] not in SECTION_NAMES:
            errs.append(f"name {s['name']} not in {SECTION_NAMES}")
        if s['startBar'] != b:
            errs.append(f"{s['name']} starts at {s['startBar']}, expected {b}")
        if not (isinstance(s['bars'], int) and s['bars'] >= 1):
            errs.append(f"{s['name']} bars {s['bars']}")
        if not (isinstance(s['energy'], int) and 1 <= s['energy'] <= 5):
            errs.append(f"{s['name']} energy {s['energy']}")
        if 'bed' not in s['stems']:
            errs.append(f"{s['name']} does not list the bed")
        bad = [x for x in s['stems'] if x not in STEMS]
        if bad:
            errs.append(f"{s['name']} unknown stems {bad}")
        b = s['startBar'] + s['bars']
    if not errs and b != m['bars'] + 1:
        errs.append(f"sections cover 1..{b - 1}, song has {m['bars']} bars")
    ok &= rep.add('map.sections', not errs, errs or None)
    if profile == 'song':
        names = {s['name'] for s in m['sections']}
        need = {'intro', 'verse', 'hook', 'break', 'outro'}
        ok &= rep.add('map.sections_cover_arc', need <= names, sorted(need - names) or None)
        en = [s['energy'] for s in m['sections']]
        ok &= rep.add('map.energy_arch', max(en) >= 3 and en[0] <= 2 and en[-1] <= 3 and max(en) > en[0],
                      en)

    bb = m['breakBars']
    ok &= rep.add('map.breakBars', all(isinstance(x, int) and 1 <= x <= m['bars'] for x in bb)
                  and bb == sorted(set(bb)) and (profile != 'song' or len(bb) > 0), bb)

    pv = m['preview']
    pv_ok = pv.get('file') == 'preview.mp3' and isinstance(pv.get('startBar'), int) and isinstance(pv.get('bars'), int)
    if pv_ok:
        pv_ok = 1 <= pv['startBar'] and pv['startBar'] + pv['bars'] - 1 <= m['bars']
        if profile == 'song':
            pv_ok &= pv['bars'] == LIMITS['preview_bars']
            hooks = [s['startBar'] for s in m['sections'] if s['name'] == 'hook']
            pv_ok &= pv['startBar'] in hooks
    ok &= rep.add('map.preview', pv_ok, pv)

    # onsets
    stems = m['stems']
    oerr = []
    counts = {}
    for st in STEMS:
        if st not in stems or not isinstance(stems[st].get('onsets'), list):
            oerr.append(f'{st}: no onsets list')
            continue
        ons = stems[st]['onsets']
        counts[st] = len(ons)
        prev = (0, -1.0)
        for o in ons:
            if not (isinstance(o, list) and len(o) == 3):
                oerr.append(f'{st}: bad onset {o}')
                break
            bar, six, vel = o
            if not (isinstance(bar, int) and 1 <= bar <= m['bars']):
                oerr.append(f'{st}: bar {bar} outside 1..{m["bars"]}')
                break
            if not (0 <= six < 16):
                oerr.append(f'{st}: sixteenth {six}')
                break
            if not (0 < vel <= 1):
                oerr.append(f'{st}: velocity {vel}')
                break
            if (bar, six) <= prev:
                oerr.append(f'{st}: onsets not strictly sorted at {o}')
                break
            if time_of(m, bar, six) >= m['durationSec']:
                oerr.append(f'{st}: onset {o} at/after the end')
                break
            prev = (bar, six)
    active = {st for s in m['sections'] for st in s['stems']}
    for st in active:
        if counts.get(st, 0) == 0:
            oerr.append(f'{st} is listed in a section but has no onsets')
    ok &= rep.add('map.onsets', not oerr, oerr or counts)
    first_bed = stems.get('bed', {}).get('onsets', [[0, 0, 0]])
    ok &= rep.add('map.bed_anchor', bool(first_bed) and first_bed[0][0] == 1 and first_bed[0][1] == 0,
                  first_bed[:1])

    # provenance
    pr = m['provenance']
    perr = []
    for k in ('script', 'seed', 'date', 'sha256'):
        if k not in pr:
            perr.append(f'missing {k}')
    if not perr:
        if pr['date'] != LIMITS['date']:
            perr.append(f"date {pr['date']}")
        if not isinstance(pr['seed'], int):
            perr.append('seed not int')
        files = [f'stems/{s}.mp3' for s in STEMS] + ['preview.mp3']
        for f in files:
            h = pr['sha256'].get(f)
            p = os.path.join(folder, f)
            if not h:
                perr.append(f'no sha256 for {f}')
            elif os.path.exists(p) and sha256_file(p) != h:
                perr.append(f'sha256 mismatch {f}')
        sp = pr['script']
        if not os.path.exists(sp):
            perr.append(f'script missing: {sp}')
        elif pr.get('scriptSha256') and sha256_file(sp) != pr['scriptSha256']:
            perr.append('script changed since render (re-render)')
        lp = pr.get('library')
        if lp and os.path.exists(lp) and pr.get('librarySha256') and sha256_file(lp) != pr['librarySha256']:
            perr.append('library changed since render (re-render)')
    ok &= rep.add('map.provenance', not perr, perr or None)
    return ok


# ── audio ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def _sliding_max(a: np.ndarray, w: int) -> np.ndarray:
    """Trailing sliding max over w samples (out[i] = max(a[i-w+1..i]))."""
    from fel_synth import sliding_min
    return -sliding_min(-a, w)


def click_events(x: np.ndarray) -> list[int]:
    """Sample indices of hard discontinuities (a step or a kink): the 2nd difference at the sample must be
    (1) above an absolute floor, (2) click_ratio x the local RMS of the 2nd difference (±5 ms, excluding ±3 samples),
    and (3) click_dominance x every other 2nd-difference peak in that window. Noise bursts fail (3): their spikes have
    neighbours of similar size. Grouped within 5 ms."""
    if len(x) < 64:
        return []
    d2 = x[2:] - 2 * x[1:-1] + x[:-2]
    a = np.abs(d2)
    n = len(d2)
    cand = np.nonzero(a > LIMITS['click_abs'])[0]
    if len(cand) == 0:
        return []
    W = int(0.005 * SR)
    E = 3
    c = np.concatenate([[0.0], np.cumsum(d2 * d2)])
    lo = np.maximum(0, cand - W)
    hi = np.minimum(n, cand + W + 1)
    elo = np.maximum(0, cand - E)
    ehi = np.minimum(n, cand + E + 1)
    tot = c[hi] - c[lo] - (c[ehi] - c[elo])
    cnt = (hi - lo) - (ehi - elo)
    rms = np.sqrt(np.maximum(tot, 0) / np.maximum(cnt, 1))
    keep = a[cand] > LIMITS['click_ratio'] * np.maximum(rms, 1e-9)
    cand = cand[keep]
    if len(cand) == 0:
        return []
    wl = W - E
    pad = np.concatenate([np.zeros(W), a, np.zeros(W)])
    smax = _sliding_max(pad, wl)                    # smax[j] = max(pad[j-wl+1..j])
    left = smax[cand + W - E - 1]                   # a[i-W .. i-E-1]
    right = smax[cand + W + W]                      # a[i+E+1 .. i+W]
    dom = a[cand] > LIMITS['click_dominance'] * np.maximum(np.maximum(left, right), 1e-12)
    flag = cand[dom]
    out = []
    for i in flag:
        if not out or i - out[-1] > int(0.005 * SR):
            out.append(int(i) + 1)
    return out


def rms_windows(x: np.ndarray, win: float = 0.05, hop: float = 0.01) -> tuple[np.ndarray, int, int]:
    w, h = int(win * SR), int(hop * SR)
    c = np.concatenate([[0.0], np.cumsum(x * x)])
    starts = np.arange(0, max(1, len(x) - w + 1), h)
    r = np.sqrt((c[np.minimum(starts + w, len(x))] - c[starts]) / w)
    return r, w, h


def longest_gap(r: np.ndarray, a: int, b: int, thr: float, w: int, h: int) -> float:
    """Longest silent stretch (s) among windows starting in [a, b) samples."""
    i0, i1 = a // h, max(a // h + 1, (b - w) // h + 1)
    seg = r[i0:i1] < thr
    if not seg.any():
        return 0.0
    best = run = 0
    for s in seg:
        run = run + 1 if s else 0
        best = max(best, run)
    return ((best - 1) * h + w) / SR


def onset_offsets(x: np.ndarray, times: list[float]) -> list[float]:
    """For each expected onset time, where the energy rises fastest within [-15, +25] ms (ms offsets)."""
    e = np.convolve(x * x, np.ones(int(0.002 * SR)) / int(0.002 * SR), mode='same')
    d = int(0.001 * SR)
    rise = np.zeros_like(e)
    rise[d:-d] = e[2 * d:] - e[:-2 * d]
    out = []
    for t in times:
        c = int(round(t * SR))
        lo, hi = max(0, c - int(0.015 * SR)), min(len(x), c + int(0.025 * SR))
        if hi - lo < 10:
            continue
        r = rise[lo:hi]
        pk = float(r.max())
        if pk <= 0:
            continue
        i = lo + int(np.argmax(r >= 0.5 * pk))       # the FIRST strong rise (a clap's later bursts are not the onset)
        out.append((i - c) / SR * 1000.0)
    return out


def check_audio(m: dict, folder: str, rep: Report, profile: str) -> dict:
    stats = {}
    dec = {}
    fmt_err = []
    for st in STEMS:
        p = os.path.join(folder, 'stems', f'{st}.mp3')
        if not os.path.exists(p):
            fmt_err.append(f'missing {st}.mp3')
            continue
        info = sf.info(p)
        if info.samplerate != SR or info.channels != 1 or info.format != 'MP3':
            fmt_err.append(f'{st}: {info.format} {info.samplerate} Hz {info.channels} ch')
        y, _ = sf.read(p, dtype='float64', always_2d=True)
        dec[st] = y[:, 0]
    rep.add('audio.stem_files_mono_44k_mp3', not fmt_err, fmt_err or None)
    if len(dec) != len(STEMS):
        return stats
    lens = {st: len(v) for st, v in dec.items()}
    rep.add('audio.equal_length', len(set(lens.values())) == 1 and lens['bed'] == m['samples'],
            {'lengths': sorted(set(lens.values())), 'map.samples': m['samples']})
    n = min(lens.values())
    for st in STEMS:
        dec[st] = dec[st][:n]
    rep.add('audio.finite', all(np.all(np.isfinite(v)) for v in dec.values()))
    tags = {st: lame_tag(os.path.join(folder, 'stems', f'{st}.mp3')) for st in STEMS}
    terr = []
    for st, tg in tags.items():
        if not tg or not tg.get('frames'):
            terr.append(f'{st}: no LAME/Xing gapless header')
        elif tg['frames'] * 1152 - tg['encoderDelay'] - tg['padding'] != m['samples']:
            terr.append(f"{st}: header says {tg['frames'] * 1152 - tg['encoderDelay'] - tg['padding']} samples")
    delays = {(tg or {}).get('encoderDelay') for tg in tags.values()}
    rep.add('audio.gapless_header', not terr and len(delays) == 1, terr or {'encoderDelay': sorted(delays)})

    pk = {st: round(db(np.max(np.abs(v))), 2) for st, v in dec.items()}
    rep.add('audio.stem_peaks', all(v <= LIMITS['stem_peak_db'] for v in pk.values()), pk)
    mix = sum(dec.values())
    spk = round(db(np.max(np.abs(mix))), 2)
    rep.add('audio.sum_peak', spk <= LIMITS['sum_peak_db'], spk)
    L = round(lufs(mix), 2)
    rep.add('audio.sum_loudness', abs(L - LIMITS['lufs_target']) <= LIMITS['lufs_tol'], L)
    stats.update(stemPeakDb=pk, sumPeakDb=spk, sumLufs=L)

    dc = {}
    for st, v in dec.items():
        g = abs(float(v.mean()))
        w = SR
        k = len(v) // w
        wm = float(np.max(np.abs(v[:k * w].reshape(k, w).mean(axis=1)))) if k else g
        dc[st] = (round(g, 6), round(wm, 6))
    rep.add('audio.dc', all(g <= LIMITS['dc_abs'] and wm <= LIMITS['dc_window_abs'] for g, wm in dc.values()),
            {st: {'mean': g, 'max1s': wm} for st, (g, wm) in dc.items()})

    clicks = {st: click_events(v) for st, v in dec.items()}
    rep.add('audio.no_clicks', all(len(c) == 0 for c in clicks.values()),
            {st: [round(i / SR, 4) for i in c[:8]] for st, c in clicks.items() if c} or None)

    # silence gaps per section per active stem
    bar_sec = 240.0 / m['bpm']
    thr = 10 ** (LIMITS['silence_db'] / 20)
    gap_err = []
    worst = {}
    for st in STEMS:
        r, w, h = rms_windows(dec[st])
        for s in m['sections']:
            if st not in s['stems']:
                continue
            a = int(round(time_of(m, s['startBar'], 0) * SR))
            b = min(n, int(round(time_of(m, s['startBar'] + s['bars'], 0) * SR)))
            g = longest_gap(r, a, b, thr, w, h)
            worst[st] = max(worst.get(st, 0.0), round(g, 3))
            if g > bar_sec + LIMITS['gap_tolerance_sec']:
                gap_err.append(f"{st} silent {g:.2f}s in {s['name']}@{s['startBar']} (bar {bar_sec:.2f}s)")
    rep.add('audio.no_gaps_over_one_bar', not gap_err, gap_err or {'worstGapSec': worst, 'barSec': round(bar_sec, 3)})

    active = {st for s in m['sections'] for st in s['stems']}
    silent = [st for st in active if np.max(np.abs(dec[st])) < 0.01]
    rep.add('audio.active_stems_audible', not silent, silent or None)

    # alignment: the bed's first sound at t = 0; drum/bed onsets where the map says
    first = int(np.argmax(np.abs(dec['bed']) > 0.01)) if np.any(np.abs(dec['bed']) > 0.01) else -1
    rep.add('audio.bar1_beat1_at_t0', 0 <= first <= LIMITS['start_ms'] * 1e-3 * SR,
            {'firstAudibleMs': round(first / SR * 1000, 2)})
    offs = []
    for st in ('bed', 'drums'):
        voices = m['stems'][st].get('voices', {})
        for vname in ('kick', 'snare', 'clap'):
            times = [time_of(m, b, s) for b, s, v in voices.get(vname, []) if v >= 0.6]
            offs += onset_offsets(dec[st], times)
    if offs:
        a = np.abs(np.array(offs))
        med, p90 = float(np.median(a)), float(np.percentile(a, 90))
        rep.add('audio.onsets_align', med <= LIMITS['align_median_ms'] and p90 <= LIMITS['align_p90_ms'],
                {'n': len(offs), 'medianAbsMs': round(med, 2), 'p90AbsMs': round(p90, 2),
                 'meanSignedMs': round(float(np.mean(offs)), 2)})
    else:
        rep.add('audio.onsets_align', False, 'no kick/snare/clap onsets to align')

    # sizes
    sizes = {st: os.path.getsize(os.path.join(folder, 'stems', f'{st}.mp3')) for st in STEMS}
    total = sum(sizes.values())
    kbps = {st: round(sz * 8 / m['durationSec'] / 1000, 1) for st, sz in sizes.items()}
    rep.add('files.stems_total_bytes', profile != 'song' or total <= LIMITS['song_bytes'], {'total': total, 'kbps': kbps})
    rep.add('files.stem_bitrate_sane', all(k <= LIMITS['stem_kbps_max'] for k in kbps.values()), kbps)
    stats.update(stemBytes=total, kbps=kbps)

    # preview
    pp = os.path.join(folder, 'preview.mp3')
    if not os.path.exists(pp):
        rep.add('preview.exists', False)
        return stats
    info = sf.info(pp)
    y, _ = sf.read(pp, dtype='float64', always_2d=True)
    pv = m['preview']
    exp = (time_of(m, pv['startBar'] + pv['bars'], 0) if pv['startBar'] + pv['bars'] <= m['bars']
           else m['durationSec']) - time_of(m, pv['startBar'], 0)
    rep.add('preview.format', info.channels == 2 and info.samplerate == SR and info.format == 'MP3',
            {'channels': info.channels, 'sr': info.samplerate})
    rep.add('preview.length', abs(len(y) / SR - exp) <= 0.03, {'sec': round(len(y) / SR, 3), 'expected': round(exp, 3)})
    ppk = round(db(np.max(np.abs(y))), 2)
    rep.add('preview.peak', ppk <= LIMITS['preview_peak_db'], ppk)
    pl = round(lufs(y), 2)
    rep.add('preview.loudness', abs(pl - LIMITS['lufs_target']) <= LIMITS['preview_lufs_tol'], pl)
    psz = os.path.getsize(pp)
    rep.add('preview.bytes', psz <= LIMITS['preview_bytes'], psz)
    a = int(round(time_of(m, pv['startBar'], 0) * SR))
    seg = mix[a:a + len(y)]
    k = min(len(seg), len(y))
    i0, i1 = int(k * 0.2), int(k * 0.8)          # skip the preview's fades
    corr = float(np.corrcoef(y[i0:i1].mean(axis=1), seg[i0:i1])[0, 1]) if i1 - i0 > 100 else 0.0
    rep.add('preview.from_the_song', corr >= LIMITS['preview_env_corr'], round(corr, 3))
    rep.add('preview.clicks', not click_events(y[:, 0]) and not click_events(y[:, 1]))
    stats.update(previewLufs=pl, previewPeakDb=ppk, previewBytes=psz)
    return stats


def validate_song(folder: str, profile: str = 'song') -> dict:
    rep = Report()
    mp = os.path.join(folder, 'map.json')
    if not os.path.exists(mp):
        rep.add('map.exists', False, mp)
        return {'id': os.path.basename(folder), 'dir': folder, 'ok': False, 'checks': rep.checks}
    try:
        with open(mp) as fh:
            m = json.load(fh)
    except Exception as e:  # noqa: BLE001
        rep.add('map.json_parses', False, str(e))
        return {'id': os.path.basename(folder), 'dir': folder, 'ok': False, 'checks': rep.checks}
    map_ok = check_map(m, folder, rep, profile)
    stats = check_audio(m, folder, rep, profile) if 'samples' in m and 'sections' in m else {}
    return {'id': m.get('id'), 'dir': folder, 'ok': rep.ok and map_ok, 'profile': profile, 'stats': stats,
            'checks': rep.checks}


def validate_suite(results: list[dict], root: str) -> dict:
    rep = Report()
    maps = []
    for r in results:
        with open(os.path.join(r['dir'], 'map.json')) as fh:
            maps.append(json.load(fh))
    ids = [m['id'] for m in maps]
    rep.add('suite.six_songs', len(maps) == 6, ids)
    rep.add('suite.legacy_ids', all(i in ids for i in LEGACY_IDS), [i for i in LEGACY_IDS if i not in ids] or None)
    diffs = sorted(m['difficulty'] for m in maps)
    rep.add('suite.difficulties_1_to_6', diffs == list(range(1, 7)), diffs)
    keys = [Key(m['key']).tonic for m in maps]
    rep.add('suite.distinct_keys', len(set(keys)) == len(keys), [m['key'] for m in maps])
    by_d = sorted(maps, key=lambda m: m['difficulty'])
    bpms = [m['bpm'] for m in by_d]
    rep.add('suite.tempo_spread', min(bpms) <= 90 and max(bpms) >= 120 and bpms == sorted(set(bpms)), bpms)
    taps = [m['targetTapsPerMin'] for m in by_d]
    rep.add('suite.taps_rise_with_difficulty', taps == sorted(taps) and len(set(taps)) == len(taps), taps)
    titles = [m['title'] for m in maps]
    rep.add('suite.distinct_titles', len(set(t.lower() for t in titles)) == len(titles), titles)
    styles = [m['style'] for m in maps]
    rep.add('suite.distinct_styles', len(set(styles)) == len(styles), styles)
    return {'ok': rep.ok, 'checks': rep.checks}


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('path')
    ap.add_argument('--profile', default='song', choices=['song', 'smoke'])
    ap.add_argument('--suite', action='store_true')
    ap.add_argument('--quiet', action='store_true', help='only failing checks in the output')
    a = ap.parse_args(argv)
    path = os.path.abspath(a.path)
    if os.path.exists(os.path.join(path, 'map.json')):
        dirs = [path]
    else:
        dirs = sorted(os.path.join(path, d) for d in os.listdir(path)
                      if os.path.exists(os.path.join(path, d, 'map.json')))
    results = [validate_song(d, a.profile) for d in dirs]
    out = {'ok': bool(results) and all(r['ok'] for r in results), 'profile': a.profile, 'limits': LIMITS,
           'songs': results}
    if a.suite:
        s = validate_suite(results, path)
        out['suite'] = s
        out['ok'] = out['ok'] and s['ok']
    if a.quiet:
        for r in out['songs']:
            r['checks'] = [c for c in r['checks'] if not c['ok']]
        out.pop('limits')
    print(json.dumps(out, indent=1))
    return 0 if out['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
