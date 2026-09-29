# The Flip loop pack: contract v1 (2026-09-25)

This is what phase 5 (wiring the pack into the Flip) can rely on for every item in FEL's own loop pack (owner
decision #15: a FEL-made loop pack plus the "FEL theme" first lesson, each item with a written provenance record).
`songgen/flip_pack.py` makes files that meet it, and `build_pack.py` checks every rule marked **[V]**. The design,
the item list and the numbers behind the rules are in SPEC.md.

## 1. Folder and ownership

```
musicsuite/flippack/
  CONTRACT.md  SPEC.md                 architect (frozen)
  onsets_check.py  flip_parity.ts      the Flip.ts mirror + the real-Flip.ts parity runner (frozen)
  build_pack.py                        the only writer of pack.json and PROVENANCE.md (frozen)
  audio/<id>.mp3                       every item, flat
  items/<id>.json                      one sidecar per item, written by flip_pack.write_* and never hand-edited
  banks/<bank_id>.json                 optional kit banks {id, title, pads: [id|null, ...] (up to 16)}
  pack.json  PROVENANCE.md             assembled by build_pack.py
musicsuite/songgen/
  fel_synth.py (library 1.0.0, unchanged)   flip_pack.py (the finisher, frozen)   flip_voices.py (shared voices, frozen)
  flip_<producer>*.py                  each producer's scripts and extra voices; one producer per file
```

A producer writes only its own ids (SPEC.md §4), its own `flip_<producer>*.py` files and, for the one-shot and chop
producers, its own bank files. Nothing is written inside the repo. `FLIPPACK_DIR=<dir>` sends every write to a dry-run
pack instead.

## 2. Kinds and ids

| kind | what | channels | id prefix |
|---|---|---|---|
| `theme` | the three "FEL theme" candidates for the first "chop this" lesson (4 bars) | stereo | `theme_` |
| `loop` | melodic loops (2 or 4 bars) | stereo | `loop_` |
| `stab` | chord stabs (pitched, with a root) | mono | `stab_` |
| `hit` | horn hits, orchestra hit, bass notes, drum one-shots | mono | `hit_` |
| `chop` | Kokoro-voiced vocal chops: one-shots, plus chop **sheets** (`sheet: true`) | mono | `chop_` |
| `texture` | crackle loop, tape-hiss swell, riser | stereo | `tex_` |

1. An id matches `[a-z0-9_]{3,48}`, starts with its kind's prefix, is unique, and names its file: `file` =
   `audio/<id>.mp3` [V].
2. `title` is player-facing, at most 24 characters, unique within its kind, with no real person's name [V: length,
   uniqueness].

## 3. Audio (every file) [V]

1. MP3 (MPEG-1 Layer III, LAME VBR through libsndfile, `compression_level` 0.3), 44,100 Hz, stereo or mono per §2.
2. Decoded length = `samples` exactly, through libsndfile (mpg123) **and** macOS CoreAudio (`afconvert`, the decoder
   family Safari uses). Both return identical samples. Each file carries a LAME/Xing gapless header, recorded as
   `lame: {encoderDelay, padding}`. A decoder that ignores it returns extra samples: `encoderDelay + 529` at the
   start (trim them), then padding at the end (cut to `samples`).
3. The decoded peak is at or below **-1.0 dBFS**. DC: |mean| is at most 0.002 per channel.
4. There are no clicks. The songs' detector (`songgen/validate.py click_events`) finds nothing inside the file. A
   loop's first and last 5 ms are checked across the seam instead (§4.3). A `texture` with `clicksByDesign: true`
   (crackle only) is exempt.

## 4. Loops: `theme`, `loop`, chop sheets [V]

1. **Tempo and length.** `bpm` is one of **90, 96, 98, 100, 105, 108, 112, 120, 125**: the integer tempos from 85
   to 125 at which N bars of 4/4 is a whole number of samples. `bars` is 4 for a theme and 2 or 4 otherwise.
   `samples` = `bars * 240 * 44100 / bpm` exactly, and sample 0 is bar 1 beat 1.
2. **Downbeat.** The downbeat is at the head: every attack is placed at k × 10 ms + 1 ms (`flip_pack.lock_time`,
   which moves an attack by 5 ms at most), so the bar-1 attack sits 1 ms into the file, well within the 5 ms
   pre-roll. When the file loops, the Flip finder must fire at the seam, within one window (`head.downbeat`). An
   energy ratio of 2.6 or more there is a SHOULD (a warning).
3. **Seamless.** The loop is rendered circularly: tails, reverb, echoes and EQ ringing wrap from the end into the
   head. It is encoded with 1,152 samples of circular context on each side, which the widened LAME delay and
   padding drop, with the tag CRC re-signed. The decoded end-to-start join has no click on either decoder.
4. **Level.** Loudness is **-16 LUFS ± 1** (BS.1770 via `fel_synth.lufs`, stereo). Sheets are the exception: their
   peak sits between -4 and -1 dBFS.
5. **Key.** Themes and loops give a `key` that parses with `fel_synth.Key`, such as `Eb major` or `D dorian`.

## 5. Choppability: what the Flip does with the file [V]

`onsets_check.py` mirrors `Flip.ts onsetSlices` line for line: 10 ms RMS windows on the channel mean, a
`floor * 0.9 + prev * 0.1` floor, an onset where energy is above 2.2 × floor and above 0.02, 80 ms minimum gap and a
16 cap. `flip_parity.ts` runs the app's real `Flip.ts` on the same float32 data, and the slice starts must match
sample for sample (`build_pack.py --parity`). Every rule below runs on the decoded MP3 at **44.1 kHz and at 48 kHz**,
because decodeAudioData resamples to the AudioContext rate.

1. `onsets`: the Flip's onsets in seconds, as Flip.ts finds them today at 44.1 kHz. The first is usually 0.01 (see
   §9.1).
2. `suggestedPads`: the musical slice points in seconds, at most 16, sorted, the first at 0.0. Each one is the start
   of the 10 ms window holding a chop event's attack (`flip_pack.pad_time`), so it lands 1 ms before the attack.
3. For themes, loops and sheets:
   - **Count.** The uncapped onset count is 8 to 16 (12 to 16 for 4-bar items), in transient mode, so the 16 pads
     always cover the whole file. `suggestedPads` has the same bounds.
   - **Spacing.** No two onsets are closer than 0.15 s, and no two suggested pads either.
   - **Precision and recall.** Every detected onset is within 10.5 ms of a suggested pad (nothing spurious), and
     every suggested pad is detected within 10.5 ms (nothing missed). This means that TRANSIENTS equals FEL's own
     cuts to within one window.
   - **Solid.** No onset has an energy/floor ratio below 2.6 (it could vanish). At most one free window has a ratio
     between 1.9 and 2.2 (it could appear).
   - SHOULD: every slice except the last is at most 1.2 s long, because the pad gate stops playback there.
4. One-shots (`stab`, `hit`, single `chop`) have `suggestedPads: [0.0]`: the whole file is one pad. Their `onsets`
   are recorded as the finder sees them, but choppability does not apply (§9.3).

## 6. One-shots: `stab`, `hit`, single `chop` [V]

1. Mono, 0.05 to 3.0 s long.
2. The first sample at or above 3 % of the peak (-30 dB) is within **5 ms** of sample 0. The head fade-in is 0.7 ms
   raised-cosine, and sample 0 = 0.
3. The tail is faded: the last 5 ms are at or below -40 dBFS, and at most 0.10 s at the end is under -60 dBFS.
4. The decoded peak is between -4.0 and -1.0 dBFS (target -3).
5. `stab` requires `root` (a note name such as `C4`) and should give `chord` (such as `Cm9`). A pitched `hit` (bass,
   horn, orchestra) should give `root`. A `root` must parse with `fel_synth.midi`.
6. Each file is at most 80 KB.

## 7. Textures [V]

1. Stereo, 1 to 12 s long. Loudness is **-22 LUFS ± 3**, and the peak is at or below -1 dBFS. Each file is at most
   420 KB.
2. With `loop: true`, the file is seamless (§4.3); a `clicksByDesign` crackle skips the seam click check, and the fold still makes it continuous. If `bpm` and `bars` are given, they are exact (§4.1).
3. With `loop: false`, both edges are faded (the first and last 1 ms at or below -40 dBFS). A riser gives `bpm` and
   `bars`, and its file end is the landing downbeat.

## 8. pack.json

Written by `build_pack.py` only:

```jsonc
{
  "pack": "fel_flip", "version": "1.0.0", "date": "2026-09-25", "sampleRate": 44100,
  "statement": "100% original, generated from code by FEL ...", "licence": "FEL original, generated",
  "themeCandidates": ["theme_a_...", "theme_b_...", "theme_c_..."], "themeDefault": null,   // the owner picks
  "finder": { "windowMs": 10, "minGapMs": 80, "ratio": 2.2, "gate": 0.02, "maxSlices": 16, "note": "..." },
  "decoding": { "lengthField": "samples", "decoderDelayConvention": 529, "note": "..." },
  "banks": [ { "id": "bank_kit_fel", "title": "FEL Kit", "pads": ["stab_ep_cm9", "hit_kick_dusty", null, ...] } ],
  "items": [ {
    "id": "loop_arp_pluck", "file": "audio/loop_arp_pluck.mp3", "kind": "loop", "title": "Night Arp",
    "bpm": 120, "key": "A minor", "bars": 2, "loop": true,            // loops, themes, sheets (+ "swing" if not 0.5)
    "durationSec": 4.0, "samples": 176400, "channels": 2,
    "onsets": [0.01, 0.25, ...],                                        // §5.1
    "suggestedPads": [0.0, 0.25, ...],                                  // §5.2
    "tags": ["arp", "synth", "night"],                                  // 1..8, [a-z0-9-]+
    "lame": { "encoderDelay": 1728, "padding": 1814 },
    "root": "C4", "chord": "Cm9",                                       // stab (hit and chop when pitched)
    "text": "yeah", "voice": "warm", "sheet": true,                     // chops (sheet only on sheets)
    "candidate": "a", "character": "...", "lesson": {...},              // themes (§8.2)
    "clicksByDesign": true,                                             // crackle texture only
    "provenance": {                                                     // §8.1
      "script": "/abs/.../songgen/flip_loops.py", "seed": 61441, "sha256": "...", "date": "2026-09-25",
      "licence": "FEL original, generated",
      "scriptSha256": "...", "library": "fel_synth 1.0.0", "librarySha256": "...",
      "finisher": "flip_pack 1.0.0", "finisherSha256": "...", "tools": {...},
      "kokoro": { ... }                                                 // chops only
    }
  } ]
}
```

Items are ordered theme, loop, stab, hit, chop, texture, then by id.

1. **Provenance [V].** `script` is an absolute path that exists, `seed` is an int, `sha256` matches the file,
   `date` is `2026-09-25`, and `licence` is `FEL original, generated`. `scriptSha256` matches the script, so editing
   a script means re-rendering every item it makes. Chops add `kokoro: {package: "kokoro-onnx 0.6.1", model:
   "Kokoro-82M v1.0 ONNX (Apache-2.0)", modelSha256, voicesSha256, voice: [[name, weight], ...], speed, lang,
   text}`.
2. **Themes [V].** Each theme has `candidate` (`a`, `b` or `c`, one each) and `character` (at most 120 chars: what
   it sounds like, for the owner's pick). It also has `lesson` with three parts. `playInOrder` = `[0 .. n-1]`, where
   pads 1 to n in order replay the phrase. `flipPattern` is 16 entries, one bar of 16 steps at the theme's bpm, each
   a pad index or null, with at least 4 hits: one good re-flip to show the player. `tip` is at most 140 chars.
3. **Banks [V].** A bank lists at most 16 existing one-shot ids (`stab`, `hit`, or single `chop`; never a sheet or a
   loop), or null.

## 9. Pack rules [V]

The pack holds exactly **3** themes (candidates a, b and c), **8 to 10** loops, **10 to 14** one-shots (stab + hit),
**2 to 3** textures, **20 to 48** single chops and **2 to 3** chop sheets. There are no orphan files in `audio/`.
The whole pack (audio plus pack.json) is at most **8,000,000 bytes**. Every item passes §3 to §8, and with
`--parity` the real Flip.ts agrees with the mirror on every file.

## 10. IP (hard)

1. Everything is 100 % original and generated from code by fel_synth, `flip_*` modules, or Kokoro run locally.
   There are no samples, no loops, no third-party audio and no audio files read from anywhere (besides a script's
   own renders).
2. There are no recognisable melodies, riffs, basslines, hooks or drum breaks. Before rendering, play each line
   against the tunes you know, and if it resembles one, change the rhythm and the contour. The same rule and the
   same famous-break list apply as in `songgen/SONGS.md`. The three themes especially must not echo any existing
   theme, jingle or sample.
3. Voices come from Kokoro-82M (Apache-2.0 weights) on this machine only. They are synthetic, and they are not
   blends of the in-game MC cast (`am_onyx`/`am_eric`, `af_nova`/`af_heart`, `bm_george`/`bm_fable`). Words are
   original short words and syllables, and no chop, title or tag names a real person.
4. The drum one-shots are new designs, not the 808 kit in `public/audio/kits/808`.

## 11. Validate

```
PY=/Users/elijahbonds/.cache/fel-kokoro/.venv/bin/python
$PY flippack/onsets_check.py --self-test                 # the mirror vs the Flip.test.ts cases
$PY flippack/onsets_check.py audio/<id>.mp3              # what the Flip sees, at 44.1 and 48 kHz
$PY flippack/build_pack.py --check --partial             # a producer's self-check (item rules only)
$PY flippack/build_pack.py --parity                      # the full pack + the real Flip.ts; writes pack.json on a pass
```

## 12. For phase 5 (not validated here)

1. **The first slice starts 10 ms late (Flip.ts:57-64).** The finder's loop starts at window 1 and never marks
   window 0, and line 64 (`onsets[0] > windowSize * 2 ? onsets : onsets`) is a no-op. On any file that starts on
   its transient (every pack item, and most trimmed uploads), pad 1 starts at 10 ms and loses the downbeat's
   attack. The fix the comment intends is `if (onsets[0] <= windowSize * 2) onsets[0] = 0`. The pack's
   `suggestedPads[0]` is already 0.0, and `onsets` records today's behaviour.
2. **Load pack items with `suggestedPads`** ("FEL cuts") by default. TRANSIENTS gives the same cuts by construction,
   to within one 10 ms window.
3. **Load one-shots whole**, as a kit bank with one file per pad, and never through `onsetSlices`. A one-shot run
   through the finder falls back to 8 grid slices of one hit, which is what makes today's 808 stems chop into
   clicks.
4. **Slices are played with no fades.** A pad ends exactly where the next attack starts, and the 1.2 s gate stops
   with `node.stop` (a hard cut). The pack keeps each attack 1 ms clear of the previous slice, but a 2 to 3 ms fade
   on each pad buffer and a short release ramp on the gate will still be needed.
5. **The finder is full-band RMS.** A sustained low end or a loud bed hides melodic attacks entirely: a first sketch
   with a sub bass under the melody gave 4 onsets for 16 notes. User uploads will often land under 8 slices. A
   spectral-flux or high-weighted finder would find more, but changing it changes every item's `onsets`, so re-run
   `onsets_check.py` (updated to match) if the finder changes.
6. **Test bookkeeping.** `Flip.test.ts:13` asserts that `FEL_SOURCES.length === 8` and that every url is under
   `/audio/kits/808/`. Add the pack as its own list (read from pack.json) rather than growing `FEL_SOURCES`, or
   update the test in the same commit.
7. **Gapless decoding.** In dev, assert `buffer.length === Math.round(samples * ctx.sampleRate / 44100)`. Loops
   carry `encoderDelay` = 576 + 1152.
