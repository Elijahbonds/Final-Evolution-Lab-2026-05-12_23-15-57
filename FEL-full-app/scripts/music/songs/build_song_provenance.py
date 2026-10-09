#!/usr/bin/env python3
"""build_song_provenance.py — MUSIC-SUITE P7 (2026-09-29): writes public/audio/songs/PROVENANCE.json in the
shape lib/babylon/music/provenance.test.ts holds every music root to (see public/audio/flip/PROVENANCE.json for the
first one, from P5). One entry per file under public/audio/songs/<id>/ (stems/*.mp3, preview.mp3, map.json), each
carrying its own sha256 and the exact generator script in this repo (scripts/music/songs/song_<id>.py) that rendered
the whole song bundle (stems, preview and map together, in one render() call — fel_synth.py:render).

Run from the repo root after any re-render:
    python3 scripts/music/songs/build_song_provenance.py

It only reads files that are already in public/audio/songs/ and scripts/music/songs/ — it never renders audio itself
(see README.md in this folder for that).
"""
from __future__ import annotations

import hashlib
import json
import os

APP_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SONGS_DIR = os.path.join(APP_ROOT, 'public', 'audio', 'songs')
SCRIPTS_DIR = os.path.join(APP_ROOT, 'scripts', 'music', 'songs')
LICENCE = 'FEL original, generated'

SONG_IDS = ['warmup', 'cypher', 'goldenhour', 'battle', 'canals', 'evolution']
# MUSIC-SUITE P7: cypher and canals each layer one extra wordless-vox voice module on top of the shared library —
# named here so their stems' render path is complete (provenance.test.ts's render-path check only walks `script` +
# `dsp.script`; these songs pass the extra module as `dsp` since it is not imported by the top-level song script).
EXTRA_MODULE = {'cypher': 'voices_cypher.py', 'canals': 'voices_canals.py'}


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def rel(path: str, base: str) -> str:
    return os.path.relpath(path, base).replace(os.sep, '/')


def main() -> None:
    entries = []
    for song_id in SONG_IDS:
        song_dir = os.path.join(SONGS_DIR, song_id)
        script_repo_path = f'scripts/music/songs/song_{song_id}.py'
        script_abs = os.path.join(APP_ROOT, script_repo_path)
        if not os.path.isfile(script_abs):
            raise SystemExit(f'missing generator script for {song_id}: {script_repo_path}')
        script_sha = sha256_file(script_abs)
        dsp = None
        if song_id in EXTRA_MODULE:
            mod_repo_path = f'scripts/music/songs/{EXTRA_MODULE[song_id]}'
            mod_abs = os.path.join(APP_ROOT, mod_repo_path)
            if not os.path.isfile(mod_abs):
                raise SystemExit(f'missing voice module for {song_id}: {mod_repo_path}')
            dsp = {'script': mod_repo_path, 'sha256': sha256_file(mod_abs)}

        files = [os.path.join(song_dir, 'map.json'), os.path.join(song_dir, 'preview.mp3')]
        for stem in ['bed', 'drums', 'bass', 'keys', 'perc', 'horns', 'lead', 'fx']:
            files.append(os.path.join(song_dir, 'stems', f'{stem}.mp3'))

        for f in files:
            if not os.path.isfile(f):
                raise SystemExit(f'missing file for {song_id}: {f}')
            entry = {
                'file': rel(f, SONGS_DIR),
                'sha256': sha256_file(f),
                'licence': LICENCE,
                'script': script_repo_path,
                'scriptSha256': script_sha,
            }
            if dsp:
                entry['dsp'] = dsp
            entries.append(entry)

    library_sha = sha256_file(os.path.join(SCRIPTS_DIR, 'fel_synth.py'))
    record = {
        'schema': 'fel-musicsuite-songs-provenance/1',
        'date': '2026-09-29',
        'licence': LICENCE,
        'statement': (
            'All audio in public/audio/songs/ is 100% original and generated from code by FEL: numpy oscillators, '
            'FM synthesis, filtered seeded noise and synthetic reverb impulse responses (fel_synth.py, library '
            '1.0.0), driven by one composition script per song (scripts/music/songs/song_<id>.py). No samples, no '
            'loops, no recordings, no third-party audio, and no vocals other than the wordless formant synth '
            '("ooh"/"aah" vowels, no words) heard in warmup, goldenhour and canals. Rendering is deterministic: '
            'the same script, library and seed give byte-identical files (see scripts/music/songs/README.md to '
            're-render and compare).'
        ),
        'library': {'path': 'scripts/music/songs/fel_synth.py', 'sha256': library_sha, 'version': '1.0.0'},
        'validator': {'path': 'scripts/music/songs/validate.py', 'sha256': sha256_file(os.path.join(SCRIPTS_DIR, 'validate.py'))},
        'files': entries,
    }
    out_path = os.path.join(SONGS_DIR, 'PROVENANCE.json')
    with open(out_path, 'w') as fh:
        json.dump(record, fh, indent=1)
        fh.write('\n')
    print(f'wrote {out_path}: {len(entries)} file entries over {len(SONG_IDS)} songs')


if __name__ == '__main__':
    main()
