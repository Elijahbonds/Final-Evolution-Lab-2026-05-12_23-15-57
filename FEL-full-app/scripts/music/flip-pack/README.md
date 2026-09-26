# The FEL Flip pack — how it is made, and how to rebuild it from the repo

MUSIC-SUITE P5 (2026-09-25). The Flip's built-in sounds (`public/audio/flip`) are FEL's own: every file is generated from
code in this folder (numpy + `fel_synth`, and, for the vocal chops, Kokoro-82M run locally). Nothing is sampled, nothing
is third-party, no melody is borrowed. Each file's record is `public/audio/flip/PROVENANCE.json`, and
`lib/babylon/music/provenance.test.ts` holds every file in `public/audio/flip` to it: the file's sha256, the licence
(`FEL original, generated`), and the exact generator in this folder that rendered it (its sha256, and every module on
its render path).

## What is here

| Path | What |
|---|---|
| `songgen/fel_synth.py` | the synth library (1.0.0) the songs and the pack share |
| `songgen/flip_pack.py` | the finisher: encoding, the gapless MP3 fold, level, checks, the item sidecars |
| `songgen/flip_themes.py` | the three FEL-theme candidates (Sunday Tape, Skyline Anthem, Dust & Strings) and their lessons |
| `songgen/flip_loops.py` | ten melodic loops |
| `songgen/flip_oneshots.py` (+ `flip_oneshots_voices.py`) | chord stabs, horn and orchestra hits, bass notes, drums, textures, the FEL Kit bank |
| `songgen/flip_chops.py` (+ `flip_chops_dsp.py`) | the Kokoro-voiced chops and chop sheets, the three Vox banks |
| `songgen/flip_voices.py`, `songgen/voices_cypher.py` | instruments the producers import |
| `songgen/validate.py` | the click detector the songs and the pack share |
| `flippack/CONTRACT.md`, `flippack/SPEC.md` | the rules every file meets, and the design behind them |
| `flippack/build_pack.py` | assembles and validates a pack: writes `pack.json` (and `PROVENANCE.md`) |
| `flippack/onsets_check.py` | a line-for-line mirror of the app's onset finder (`Flip.ts onsetSlices`) — and on every file's render path (below) |
| `flippack/onsets_parity.py` | the parity run against the app's P5 `Flip.ts`: the mirror + the P5 head rule, the app found relative to this folder |
| `flippack/flip_parity.ts` | runs the app's real `Flip.ts` on the same data (`--parity`) |
| `install-pack.ts`, `renderPath.ts` | puts a built pack into `public/audio/flip` in its repo form (see below); a generator's render path |

The Python files are byte-for-byte the ones that rendered the shipped pack (the provenance test checks it) — every one,
`flippack/onsets_check.py` included. MUSIC-SUITE P5 FIX PASS (2026-09-25): that file is NOT only a measuring tool. The
finisher (`songgen/flip_pack.py`) puts `../flippack` on `sys.path` and imports it, and every chop goes through its
`resample`, `energy_envelope`, `GATE` and `MIN_GAP_MS`; this README used to call it the one exception, and the repo copy
had been edited after the renders (a relative app path, the P5 head rule). It is back to the exact bytes that rendered
(sha256 `eec7f523…`; the outbox copy, whose `__pycache__` was compiled from it before the renders and never rewritten), it
is on every entry's `renderPath`, and it is not to be edited — its absolute `REPO_APP` stays because the renders ran with
it. The two parity-only changes live in `flippack/onsets_parity.py`: the app's P5 head rule (a first onset within two
windows of the file's start is the start — CONTRACT §12.1, fixed in `Flip.ts`) and the app's path (four folders up, or
`FEL_APP`). pack.json's `onsets` fields keep the raw detections, as the contract defines them.

## Rebuild

You need the Kokoro virtualenv (Python 3.12 with numpy, soundfile and kokoro-onnx 0.6.1) and the Kokoro-82M model files
in `~/.cache/fel-kokoro` (`KOKORO_HOME` moves it). No ffmpeg. Render into a scratch folder, never into the repo:

```sh
PY=~/.cache/fel-kokoro/.venv/bin/python
export FLIPPACK_DIR=/tmp/fel-flippack          # every producer writes audio/<id>.mp3 + items/<id>.json here
$PY scripts/music/flip-pack/songgen/flip_themes.py
$PY scripts/music/flip-pack/songgen/flip_loops.py
$PY scripts/music/flip-pack/songgen/flip_oneshots.py
$PY scripts/music/flip-pack/songgen/flip_chops.py
$PY scripts/music/flip-pack/flippack/onsets_parity.py --self-test          # the mirror's self-test + the P5 head rule
$PY scripts/music/flip-pack/flippack/build_pack.py                         # every rule; writes pack.json
TMPDIR=/tmp $PY scripts/music/flip-pack/flippack/onsets_parity.py --parity "$FLIPPACK_DIR"/audio/*.mp3   # the app's real Flip.ts
node node_modules/tsx/dist/cli.mjs scripts/music/flip-pack/install-pack.ts --from "$FLIPPACK_DIR" --check
node node_modules/tsx/dist/cli.mjs scripts/music/flip-pack/install-pack.ts --from "$FLIPPACK_DIR"
```

Each script's `--help` lists `--only <ids>` (re-render a few items) and `--check` (validate without rendering). The one-shot
and chop producers also write their `banks/<bank>.json`. `onsets_parity.py --parity` needs `node_modules/.bin/tsx`
(`FEL_APP=<checkout>` points it at another one; a very long `TMPDIR` can make tsx exit 1 with no output — use a short
one). `build_pack.py --parity` (frozen) runs the mirror WITHOUT the P5 head rule, so it can report a file whose first
onset sits within two windows of its start; use `onsets_parity.py` instead.

Every item renders from its script with its seed, so on this machine a rebuild gives the same bytes (assumption: another
machine's libsndfile / LAME build can encode different bytes from the same samples — the install step then records the new
hashes, and the provenance test follows them).

## Install (what `install-pack.ts` does)

1. Reads `<pack>/pack.json` through the app's own reader (`lib/babylon/music/flipPack.ts parseFlipPack`) and refuses the
   pack unless every item and bank is read with no problem.
2. Checks every audio file against its provenance sha256, and every generator against this folder (scriptSha256, the
   fel_synth and flip_pack hashes, the chop DSP). A pack rendered by code the repo doesn't hold is refused.
3. Writes `public/audio/flip/audio/<id>.mp3` (names kept; stray files there are removed), `pack.json` with each
   provenance `script` rewritten to its path in this folder and `themeDefault` set, and `PROVENANCE.json` — one entry per
   audio file, with its render path. If the pack has its own `PROVENANCE.json` (the outbox pack does), every entry must
   agree with it on the file hash and the render path.
4. MUSIC-SUITE P5 FIX PASS: the render path (`renderPath.ts`) follows the finisher's `sys.path` — `songgen/`, then
   `flippack/` — and is keyed by repo path; the provenance test recomputes it and holds the record to it. The outbox
   record names songgen modules by file name and lacks `flippack/` (its generator had the same gap): its entries must match,
   and a `flippack/` module it lacks must be byte-identical to the pack folder's copy, the file the renders imported.

## The FEL theme

`public/audio/flip/pack.json` → `"themeDefault": "theme_a_sunday_tape"` (owner decision #25). All three themes ship as
lessons; to make another the default, change that one line (`theme_b_skyline` or `theme_c_dust_strings`). pack.json is an
index file: PROVENANCE.json names it in `indexFiles` and does not hash it, so the switch needs no other change — the
provenance test instead checks every item in pack.json against the record. `install-pack.ts --theme <id>` sets it too.

## Not shipped

The three 2-bar theme flip previews (`themes/*_flip_preview.mp3` in the outbox pack) were listening aids for the owner's
pick; they are not in the repo (the lesson plays its flip from the theme's own pads).
