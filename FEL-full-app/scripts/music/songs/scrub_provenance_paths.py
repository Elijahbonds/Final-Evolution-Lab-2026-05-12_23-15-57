#!/usr/bin/env python3
"""scrub_provenance_paths.py — MUSIC-SUITE P7 FIX (2026-09-29).

WHAT WAS WRONG (found in review, confirmed against the shipped files): fel_synth.py's render() writes
`provenance.script` / `provenance.library` (and, for cypher/canals, `provenance.modules[...].path`) as
`os.path.abspath(...)` — correct and useful WHILE RENDERING (validate.py re-reads those exact paths right
after render() writes them, in the same run on the same machine, to prove "the script that made this is
still the one on disk"), but never scrubbed before the file is copied into public/audio/songs/<id>/map.json,
a plain static file Next.js serves unauthenticated at /audio/songs/<id>/map.json. Every one of the six shipped
songs leaked the rendering machine's home directory and this repo's local, outside-the-repo work path
(e.g. "/Users/<name>/…/musicsuite/songgen/fel_synth.py") to any visitor who fetched that URL.

THE FIX IS HERE, NOT IN fel_synth.py: render()'s own absolute paths stay exactly as they are (validate.py's
freshness check — "script/library changed since render" — depends on them resolving on the machine that just
rendered), so this is a SEPARATE step, run once on the already-copied files in public/audio/songs/ (and meant
to run again after any future re-render, alongside build_song_provenance.py — see README.md's "after a
re-render" list). It rewrites the leaked absolute paths to plain basenames ("song_warmup.py", "fel_synth.py",
"voices_cypher.py") — enough to say WHICH file rendered it without saying WHERE that file sat on somebody's
disk. PROVENANCE.json (build_song_provenance.py) is the authoritative, tested provenance record with proper
repo-relative paths; map.json's own copy only ever needs a name, never a directory.

Nothing here touches the sha256 fields (scriptSha256 / librarySha256 / the modules' own sha256) — those hash
file CONTENTS, not the path string, so they stay valid; only the leaked path itself is replaced. map.json's
own bytes change (a path string got shorter), so its own PROVENANCE.json entry's sha256 goes stale — this
script does not fix that itself; run build_song_provenance.py right after this, exactly as a real re-render's
step 3 already says.

Run from the repo root, after any (re-)render and copy into public/audio/songs/:
    python3 scripts/music/songs/scrub_provenance_paths.py
    python3 scripts/music/songs/build_song_provenance.py
"""
from __future__ import annotations

import json
import os

APP_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SONGS_DIR = os.path.join(APP_ROOT, 'public', 'audio', 'songs')
SONG_IDS = ['warmup', 'cypher', 'goldenhour', 'battle', 'canals', 'evolution']


def scrub_one(song_id: str) -> bool:
    """Rewrite one song's map.json provenance paths to basenames in place. Returns True if it changed anything."""
    mp = os.path.join(SONGS_DIR, song_id, 'map.json')
    with open(mp) as fh:
        m = json.load(fh)
    pr = m.get('provenance', {})
    changed = False
    for key in ('script', 'library'):
        v = pr.get(key)
        if isinstance(v, str) and ('/' in v or '\\' in v):
            pr[key] = os.path.basename(v)
            changed = True
    for mod in (pr.get('modules') or {}).values():
        p = mod.get('path')
        if isinstance(p, str) and ('/' in p or '\\' in p):
            mod['path'] = os.path.basename(p)
            changed = True
    if changed:
        with open(mp, 'w') as fh:
            json.dump(m, fh, indent=1)
            fh.write('\n')
    return changed


def main() -> None:
    touched = [song_id for song_id in SONG_IDS if scrub_one(song_id)]
    print(f'scrubbed {len(touched)}/{len(SONG_IDS)} map.json files: {touched}' if touched
          else 'nothing to scrub — every map.json already carries repo-safe paths')


if __name__ == '__main__':
    main()
