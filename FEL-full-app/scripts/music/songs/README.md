# The six FEL house songs — how they are made, and how to re-render one

MUSIC-SUITE P7 (2026-09-29). The Cypher's six songs (`public/audio/songs/<id>/`: `warmup`, `cypher`, `goldenhour`,
`battle`, `canals`, `evolution`) are FEL's own: every file is generated from the code in this folder (numpy + the
shared `fel_synth` library — no samples, no loops, no third-party audio, no vocals other than the wordless formant
synth "ooh"/"aah" heard in `warmup`, `goldenhour` and `canals`). Rendering is deterministic — the same script, the
same library and the same seed give byte-identical MP3s on this machine (proved by rendering twice and comparing
every file's sha256, before these were shipped). Each file's record is `public/audio/songs/PROVENANCE.json`, and
`lib/babylon/music/provenance.test.ts` holds every file under `public/audio/songs` to it: its sha256, its licence
(`FEL original, generated`), and the exact generator in this folder that rendered it.

This mirrors `scripts/music/flip-pack/README.md` (the Flip pack, P5) for the same reason: FEL's own generated audio
must be rebuildable from the repo, not trusted on the strength of a PROVENANCE.json alone.

## What is here

| Path | What |
|---|---|
| `fel_synth.py` | the synth library (1.0.0) every song script imports — oscillators, FM, filtered noise, synthetic reverb, the MP3/loudness/click/hole checks, and `render()` / `main()` (the CLI every song script shares) |
| `song_warmup.py` … `song_evolution.py` | one composition script per song — the arrangement, the chord progressions, the melodies and the IP self-check (each script's own docstring) |
| `voices_cypher.py` | `cypher`'s extra instrument voices (slap bass, clav, conga, kick), imported by `song_cypher.py` |
| `voices_canals.py` | `canals`'s extra `drip` voice (water-drop twinkles), imported by `song_canals.py` |
| `validate.py` | the format/level/click/hole/timing checker every song must pass (44 checks) — the same one `lib/babylon/music/provenance.test.ts`'s neighbour, the Flip pack, uses for its own click detector |
| `build_song_provenance.py` | reads the rendered files under `public/audio/songs/` and this folder's scripts, and (re)writes `public/audio/songs/PROVENANCE.json` — never renders audio itself |
| `CONTRACT.md` | the rules every song's files meet (folder layout, stem format, the musical clock, `map.json`'s shape, provenance) — what phase 7 (wiring) and phase 9 (charts) may rely on |
| `SONGS.md` | the composers' brief: the six songs' keys, tempos, sections and the general rules a chart generator or a new song should follow |

The Python files here are byte-for-byte the ones that rendered the shipped songs — `build_song_provenance.py`
checks it on every run (a script whose hash has drifted from the record fails the provenance test, not this build
step, which only reads what is on disk).

## Rebuild one song (or all six) and compare

You need the Kokoro virtualenv (Python 3.12 with numpy and soundfile — no Kokoro model or ffmpeg needed; the songs
have no real speech, only synthesised vowels):

```sh
PY=/Users/elijahbonds/.cache/fel-kokoro/.venv/bin/python
mkdir -p /tmp/fel-songs-rerender
$PY scripts/music/songs/song_warmup.py --out /tmp/fel-songs-rerender      # renders + validates (44/44) on its own
# ...same for song_cypher.py / song_goldenhour.py / song_battle.py / song_canals.py / song_evolution.py

# Byte-identical rebuild check (never render straight into public/audio/songs/ — compare first):
diff <($PY -c "import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest())" /tmp/fel-songs-rerender/warmup/stems/bed.mp3) \
     <($PY -c "import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest())" public/audio/songs/warmup/stems/bed.mp3)
```

Every song script's default `--out` is `scripts/music/songs/songs` (one level up from the script, then `songs/`) —
always pass `--out <scratch dir>` explicitly, as above, so a re-render never lands inside this folder.

Each script also takes `--profile song` (default; the full contract) or `--profile smoke` (the relaxed 4-bar
library proof), `--no-validate` (skip `validate.py` after rendering) and `--keep-wav` (keep the pre-encode WAV
stems next to the MP3s, for a closer A/B).

To validate any rendered song folder directly, or the whole shipped set:

```sh
$PY scripts/music/songs/validate.py public/audio/songs/warmup           # one song, JSON verdict, exit 0 = pass
$PY scripts/music/songs/validate.py public/audio/songs --suite           # all six + the set rules (8 checks)
```

## After a re-render that changes the shipped files

1. Copy the new `map.json` / `preview.mp3` / `stems/*.mp3` into `public/audio/songs/<id>/`.
2. Regenerate the slim gameplay index (`lib/babylon/dance/felSongsData.json`) — see
   `lib/babylon/dance/felSongs.ts`'s header for the extractor.
3. Run `python3 scripts/music/songs/scrub_provenance_paths.py` — `render()`'s own `map.json` carries the
   rendering machine's ABSOLUTE path in `provenance.script` / `library` (and, for cypher/canals,
   `provenance.modules[...].path`), which validate.py's own freshness check needs right after rendering; this
   rewrites the copy that just landed in `public/audio/songs/` down to a bare filename before it ships as a
   static, unauthenticated file (MUSIC-SUITE P7 FIX, 2026-09-29 — every one of the six shipped songs leaked
   `/Users/<name>/…` at `/audio/songs/<id>/map.json` until this step existed; skip it and
   `provenance.test.ts`'s "no place on a machine" check on `map.json` now fails loudly instead of shipping it).
4. Re-run `python3 scripts/music/songs/build_song_provenance.py` from the repo root to rewrite
   `public/audio/songs/PROVENANCE.json` with the new hashes (step 3 changes `map.json`'s own bytes).
5. Run `lib/babylon/music/provenance.test.ts` and `lib/babylon/dance/felSongs.test.ts` — both fail loudly on any
   drift between the shipped files, the generator scripts and the gameplay index.

## Provenance record

`public/audio/songs/PROVENANCE.json`: one entry per file (`map.json`, `preview.mp3`, each of the eight
`stems/*.mp3`) — its repo-relative path, its sha256, its licence (`FEL original, generated`), and the generator
script in this folder that rendered it (path + sha256). `cypher` and `canals` also carry the extra voice module
they import (`voices_cypher.py` / `voices_canals.py`) under `dsp`. Owner decision #26 (2026-09-25): the six songs
ship now; Keep/Rework notes may come later and get re-rendered in a follow-up — this whole pipeline exists so a
re-render is a file swap, never a hand edit.
