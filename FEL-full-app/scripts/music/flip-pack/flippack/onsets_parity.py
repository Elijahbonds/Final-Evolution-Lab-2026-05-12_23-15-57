#!/usr/bin/env python3
"""onsets_parity.py — the P5 parity run: onsets_check.py's mirror, with the app's P5 head rule, against the real Flip.ts.

MUSIC-SUITE P5 FIX PASS (2026-09-25). What was wrong: onsets_check.py is ON THE RENDER PATH of every pack file — the
finisher (songgen/flip_pack.py) puts ../flippack on sys.path and imports it, and every chop runs through its resample,
energy_envelope, GATE and MIN_GAP_MS — but the repo copy had been edited after the renders (a head rule mirrored from
Flip.ts, a relative REPO_APP), and install-pack.ts's render path never followed ../flippack, so no provenance record named
it. The repo's onsets_check.py is now the exact file that rendered the pack (sha256 eec7f523…, byte for byte the outbox
copy; its __pycache__ was compiled from it at 18:54, before the 19:0x–19:47 renders, and never rewritten), and its hash is
on every file's renderPath. The two parity-only changes live HERE instead, so the rendering file is never edited again:

  * THE HEAD RULE. Flip.ts (P5) treats a first onset within two windows of the file's start as the start
    (`if (onsets[0] <= windowSize * 2) onsets[0] = 0`, CONTRACT §12.1). onset_slices below applies it on top of the
    mirror's raw detections, so --parity stays sample for sample. pack.json's `onsets` stay the raw detections.
  * WHERE THE APP IS. onsets_check.py names the music worktree's absolute path (REPO_APP — it is the rendering file, so
    it stays); this finds the app four folders up from here (scripts/music/flip-pack/flippack/), or FEL_APP.

Usage (the pack's python):

    onsets_parity.py --self-test          # onsets_check's self-test + the head rule
    onsets_parity.py --parity FILE ...    # the app's real Flip.ts (tsx, read-only) on the same data: must be identical

Host note (P5 gate): when this starts tsx itself and TMPDIR is a very long path, tsx can exit 1 with no output
(assumption: its IPC socket path passes the macOS limit) — run with a short TMPDIR.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import onsets_check as OC  # noqa: E402  (the rendering file, never edited)

REPO_APP = os.environ.get('FEL_APP') or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..'))

_mirror_slices = OC.onset_slices


def onset_slices(mono, sr: int) -> list[tuple[int, int]]:
    """Flip.ts onsetSlices as of P5: the mirror's slices, with a first onset within two windows of the head moved to 0."""
    on = OC.flip_onsets(mono, sr)
    if len(on) < 2:
        return _mirror_slices(mono, sr)
    window, _ = OC._params(sr)
    if on[0] <= window * 2:
        on = [0] + on[1:]
    n = len(mono)
    return [(s, on[i + 1] if i + 1 < len(on) else n) for i, s in enumerate(on)]


def self_test() -> bool:
    ok = OC.self_test()
    import numpy as np
    sr = 44100
    hit = np.zeros(sr, dtype=OC.F32)
    hit[:4410] = (0.5 * np.exp(-np.arange(4410) / 800.0) * np.sin(np.arange(4410) * 0.2)).astype(OC.F32)
    hit[22050:22050 + 4410] = hit[:4410]
    got = onset_slices(hit, sr)[0][0]
    good = got == 0
    print(f"{'ok  ' if good else 'FAIL'} head rule (P5: pad 1 starts at sample 0): {got!r}")
    print('parity self-test', 'PASSED' if ok and good else 'FAILED')
    return ok and good


def parity(files: list[str]) -> bool:
    # OC.parity reads `onset_slices` from its own module: the P5 rule goes in for the run, and comes out again
    OC.onset_slices = onset_slices
    try:
        return OC.parity(files, app=REPO_APP)
    finally:
        OC.onset_slices = _mirror_slices


def main(argv: list[str]) -> int:
    if '--self-test' in argv:
        return 0 if self_test() else 1
    if '--parity' in argv:
        return 0 if parity([a for a in argv if not a.startswith('--')]) else 1
    print(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
