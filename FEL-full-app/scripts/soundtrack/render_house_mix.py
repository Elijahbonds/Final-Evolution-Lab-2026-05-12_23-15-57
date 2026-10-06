#!/usr/bin/env python3
"""
scripts/soundtrack/render_house_mix.py — CREATOR SOUNDTRACK piece F (owner, 2026-10-06: "render full house mixes").

Renders one full-length stereo mix.mp3 per FEL house song, for the menu soundtrack, with the SAME generator, library and
seed that rendered the shipped stems and previews (scripts/music/songs/). It does this by asking fel_synth.render() for a
"preview" that starts at bar 1 and runs the whole song, at 128 kbps CBR, into a SCRATCH folder; it never writes into
public/ or into scripts/music/songs/. Nothing here changes the shipped stems, previews or maps.

It could not run in the agent's container (no numpy / soundfile there). Run it on the Mac with the Kokoro virtualenv the
song README names (Python 3.12 + numpy + soundfile; no ffmpeg needed):

    PY=/Users/elijahbonds/.cache/fel-kokoro/.venv/bin/python
    $PY scripts/soundtrack/render_house_mix.py --out /tmp/fel-house-mix            # all six
    $PY scripts/soundtrack/render_house_mix.py --out /tmp/fel-house-mix warmup     # one

Then, for each song you keep:
  1. cp /tmp/fel-house-mix/<id>/mix.mp3 public/audio/songs/<id>/mix.mp3      (about 1.6 MB each at 128 kbps)
  2. add '<id>' to HOUSE_MIXES in lib/soundtrack/house.ts
  3. provenance: lib/babylon/music/provenance.test.ts holds EVERY file under public/audio/songs to PROVENANCE.json, so
     scripts/music/songs/build_song_provenance.py must list mix.mp3 too (add it to the per-song `files` list when the file
     exists, with this script as its generator), then re-run it. Until then the provenance test fails on mix.mp3 — on
     purpose: an unrecorded file must not ship.
  4. npx vitest run lib/soundtrack lib/babylon/music/provenance.test.ts lib/babylon/dance/felSongs.test.ts
"""
from __future__ import annotations

import argparse
import importlib.util
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SONGS_DIR = os.path.normpath(os.path.join(HERE, '..', 'music', 'songs'))
SONG_IDS = ['warmup', 'cypher', 'goldenhour', 'battle', 'canals', 'evolution']
MIX_KBPS = 128


def load_song_module(song_id: str):
    path = os.path.join(SONGS_DIR, f'song_{song_id}.py')
    spec = importlib.util.spec_from_file_location(f'song_{song_id}', path)
    if spec is None or spec.loader is None:
        raise SystemExit(f'no song script at {path}')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod, path


def render_mix(song_id: str, out_root: str) -> str:
    sys.path.insert(0, SONGS_DIR)          # fel_synth and the voices_* modules live beside the song scripts
    import fel_synth                        # noqa: E402  (after the path insert)
    mod, script_path = load_song_module(song_id)
    song = mod.build()
    song.preview_start_bar = 1              # the whole song, from bar 1 …
    song.preview_bars = song.bars           # … to the last bar
    fel_synth.PREVIEW_KBPS = MIX_KBPS       # menu-quality CBR instead of the preview's 96 kbps
    fel_synth.PREVIEW_BYTES_MAX = 10 ** 9   # no 600 KB preview budget for a full song
    work = os.path.join(out_root, '_render')
    fel_synth.render(song, work, script_path, profile='song', keep_wav=False, validate=False)
    src = os.path.join(work, song.id, 'preview.mp3')
    dst_dir = os.path.join(out_root, song.id)
    os.makedirs(dst_dir, exist_ok=True)
    dst = os.path.join(dst_dir, 'mix.mp3')
    shutil.copyfile(src, dst)
    return dst


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--out', required=True, help='a scratch folder (never public/)')
    ap.add_argument('songs', nargs='*', default=SONG_IDS)
    a = ap.parse_args()
    out = os.path.abspath(a.out)
    if os.sep + 'public' + os.sep in out + os.sep:
        raise SystemExit('render into a scratch folder, then copy: never straight into public/')
    for sid in a.songs:
        if sid not in SONG_IDS:
            raise SystemExit(f'unknown song {sid}; one of {", ".join(SONG_IDS)}')
        path = render_mix(sid, out)
        print(f'{sid}: {path} ({os.path.getsize(path) / 1e6:.2f} MB)')


if __name__ == '__main__':
    main()
