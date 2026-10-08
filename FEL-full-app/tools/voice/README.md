# tools/voice: the game's voices

Everything that turns a written line into a clip the game plays. Run every command from `FEL-full-app/`.

| File | What it is |
|---|---|
| `script/*.csv` | **The production script** (2026-10-06): every line that is missing or spoken by the browser's voice today, one row per line, ready for a voice service. |
| `PERSONAS.md` | The brief for each voice: who they are, age, energy, pace. Pick or design the provider voice from this. |
| `import-voices.mts` | **The import**: a folder of rendered takes → the voice bank, levelled and measured, with a report. Provider-neutral. |
| `measure-loudness.py` | Measures loudness (ITU-R BS.1770): the whole bank, or single files for the import. |
| `render-mic.py` | The offline renderer (Kokoro) behind `scripts/mic/build-mic.mts`. It keeps the provider's takes on a re-render. |

The bank layout (unchanged): `public/audio/voice/v1/<voice>/<group>.<hash>.bin` holds a group's clips back to back (AAC in
.m4a, mono, 24 kHz), and `<group>.json` is its index, the manifest: each line's `id`, `moment`, `text`, byte range, seconds,
and, once measured, `lufs` and `peak`. The game finds a clip as `<voice>/<line id>`.

## The script

Ten files, one per voice or voice family: `coach.csv` (the Mirror, the Quick Screen, Prove It, the movement-play space
check), `boardwalk.csv`, `unclejune.csv`, `nova.csv`, `moss.csv`, `velvet.csv` (the court MCs), `scoop.csv` (the sidekick),
`bb_host.csv` (Brain Brawl's host), `crowd.csv`, `players.csv` (rivals and hoopers).

| Column | Meaning |
|---|---|
| `id` | `<voice>.<line id>`. **Name the rendered file exactly this** (any audio extension). |
| `voice`, `persona` | The voice (see `PERSONAS.md`) and its on-screen name. |
| `mode` | Where the line is heard. |
| `moment`, `tier`, `tags` | When the game says it (the moment table is `lib/babylon/audio/mic/moments.ts`). |
| `priority` | **P1** spoken by the browser's voice today (the robotic half). **P2** a pool of fewer than three lines the owner hears often. **P3** a pool of fewer than three on a rarer moment (one carnival event, a celebration, one side's game point). |
| `text` | **What to say**, word for word. |
| `match` | Only on a page line whose spoken words differ from the page's own string (a digit spelled out: the page says "130 cm", the take says "one hundred thirty centimetres"). The game finds the take by either. Not read aloud. |
| `delivery` | How to say it (the persona's default plus this line's note). |
| `max_sec` | The longest the take may run. The voice lane drops a line that cannot start in its window, so a slow read is a lost line. |
| `target` | Where the import writes it: `public/audio/voice/v1/<voice>/<group>.json#<line id>`. |
| `source` | For a page line, the file the page's string comes from. |

`lib/babylon/audio/voice/voiceScriptFiles.test.ts` keeps the script honest: every row passes the script rules (clean,
original, gender-neutral, no digits, inside its moment's word limit), every page line says exactly what its page says, every
fixed page line has a row, and with the script imported every pool the game picks from has at least three lines.

## The workflow: five steps

**1. Choose the voices.** For each voice in the script, pick or design a voice in the licensed service from `PERSONAS.md`, and
write the provider voice ID in its table. Decide per persona: add only the new lines, or re-voice the whole persona so old and
new lines are one voice (recommended once a persona moves to the service):

    node node_modules/tsx/dist/cli.mjs tools/voice/import-voices.mts --export scoop

writes `tools/voice/script/revoice/scoop.csv` with every existing line of that voice, same ids, same targets.

**2. Render.** Give the service each row's `text` (and its `delivery` note), one take per row, and save every take into ONE
folder, named by the row's `id`: `coach.page.proveit.02.wav`, `scoop.dunk.up.02.wav`. WAV at 24 kHz or more is best; AIFF,
M4A, MP3, FLAC, OGG and CAF also import. No music, no effects, no reverb. Leading and trailing silence is fine (it is trimmed).

**3. Check the folder** (runs anywhere, converts nothing):

    node node_modules/tsx/dist/cli.mjs tools/voice/import-voices.mts ~/Desktop/voice-takes --check [--only coach,scoop]

It lists every expected id with no file, every file whose name is no row's id (a typo), and every id with two files. Fix and
re-run until it is clean. `--only` limits the check and the import to some voices. Add `--script tools/voice/script/revoice`
for a re-voice batch.

**4. Import** (on the Mac: it uses `afconvert`, or `ffmpeg` where there is no `afconvert`, and the renderer's Python venv for
the loudness measure, `~/.cache/fel-kokoro/.venv`, or `VOICE_PYTHON=<python with numpy and soundfile>`):

    node node_modules/tsx/dist/cli.mjs tools/voice/import-voices.mts ~/Desktop/voice-takes [--only coach] [--allow-missing]

For each take it: decodes to 24 kHz mono; trims the silence at both ends and fades 8 ms (as the renderer does); measures its
loudness and levels it to -19 LUFS (`TARGET_LUFS` in `lib/babylon/audio/voice/loudness.ts`) with peaks under -1 dBFS;
encodes AAC (32 kbps; 24 for the crowd); decodes and measures the result. Then it rebuilds each touched bank (a re-voiced id
is replaced in place, a new id appended, every other clip byte-for-byte untouched, a new hashed `.bin`), writes the index with
each take's `lufs`, `peak` and `sec`, adds the line to the voice's script JSON (`lib/babylon/audio/mic/script/<voice>.json`),
keeps the levelled take in `~/.cache/fel-voice/takes/<voice>/` (or `FEL_VOICE_TAKES`), and writes each touched voice's median
loudness into `MEASURED_CAST_LUFS` in `loudness.ts`. It stops before converting anything if an expected file is missing
(`--allow-missing` imports the rest).

**Read the report.** One line per take (loudness before → gain → after, peak, length), then:
- `WARNINGS`: a take over its `max_sec` (re-render it shorter or faster), one still more than 6 dB from the target after
  levelling, one near clipping;
- `BY HAND`: a Brain Brawl host line must also be added to `lib/babylon/party/brainBrawlLines.ts` (`HOST_LINES`, under its
  moment) so the game picks it; its id comes out as the row's line id when it is added at the end of that moment's list.

**5. Verify, then commit.**

    npx vitest run lib/babylon/audio lib/session-setup

Listen in the game: the Mirror (a cue, a framing fix, the movement screen), the Quick Screen (the countdown, a setup), Prove It
("Go when ready", "Next up!" with the name on screen), and a hoops mode. In the browser console `window.__FEL_VOICE_GAPS__`
lists the page lines still spoken by the browser's voice; it should shrink to the lines not recorded yet. Commit the changed
`public/audio/voice/v1/**` (new `.bin`, changed `.json`, the old `.bin` deleted), the script JSONs and `loudness.ts`. Pushing
and deploying stay the owner's call.

## How the game uses a take

- **The hoops voices** (MCs, sidekick, crowd, players) pick from the bank index at run time: a new line in the index is in the
  shuffle bag the next session.
- **The pages** (Mirror, Quick Screen, Prove It) build their lines in code and ask `lib/babylon/audio/voice/speakNatural.ts`,
  which plays the Coach's take whose text (or `match`) is the page's line; a line the page builds from parts plays one take per
  sentence when every sentence has one. Anything else is said by the device's best browser voice and logged as a gap.
- **Re-rendering with Kokoro** (`scripts/mic/build-mic.mts`) keeps the provider's takes: it hands the takes store to the
  renderer, which uses a take in place of its own render, id for id. A signed creator card's own recordings still come first.
- **Loudness:** each clip plays trimmed to the target by its own `lufs`; a clip without one (a re-render rewrites the indexes
  without `lufs`) by its voice's `MEASURED_CAST_LUFS`. To re-measure the whole bank after any render:
  `~/.cache/fel-kokoro/.venv/bin/python tools/voice/measure-loudness.py public/audio/voice/v1 [--only <voice,...>]`.
