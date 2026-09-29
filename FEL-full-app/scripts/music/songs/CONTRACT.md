# The Cypher song contract — v1 (2026-09-25)

What phase 7 (wiring) and phase 9 (charts) may rely on for every FEL house song. `validate.py` enforces every
numbered rule marked **[V]**; `fel_synth.py` (library v1.0.0) produces files that meet it. A change to any rule bumps
this contract's version and the library's `LIB_VERSION`.

## 1. Folder

```
musicsuite/songs/<id>/
  stems/bed.mp3  stems/drums.mp3  stems/bass.mp3  stems/keys.mp3
  stems/perc.mp3 stems/horns.mp3  stems/lead.mp3  stems/fx.mp3
  preview.mp3
  map.json
```

`<id>` matches `[a-z_]+` (the `?track=` deep-link regex in danceTracks.ts) and equals `map.id` **[V]**. The six ids:
`warmup`, `cypher`, `goldenhour`, `battle`, `canals`, `evolution` (the first three keep saved progress meaningful)
**[V --suite]**.

## 2. Stems

| stem | earned by (DanceCore family) | role |
|---|---|---|
| `bed` | nothing: always on | sparse kick + hat pulse; the song never opens silent |
| `drums` | bounce | the rest of the kit (snare/clap, extra kicks, hats, fills) |
| `bass` | footwork | the low end |
| `keys` | wave | harmony (EP, organ, stabs, pads) |
| `perc` | toprock | shakers, congas, tambourine, rims, bells |
| `horns` | freeze | brass section: stabs, swells, the freeze hits |
| `lead` | power | the riff/melody |
| `fx` | transition | risers, sweeps, impacts, reverse swells, wordless vox, air |

(The mapping is `StemBand.ts` `CATEGORY_STEM`, lower-cased; also written to `map.earned`.)

1. **Format [V]**: MP3 (MPEG-1 Layer III), **mono**, **44,100 Hz**. LAME VBR through libsndfile; one quality level per
   song (`map.encoding.stemVbrLevel`, 0.55 = LAME V5.5 by default, raised in 0.1 steps up to 0.85 only if needed) so
   the eight stems total **≤ 6,500,000 bytes** [V]. Typical per-stem average 35–90 kbps (~64 kbps overall); sanity
   cap 112 kbps per stem [V].
2. **Length and alignment [V]**: every stem decodes to exactly `map.samples` = round(`durationSec` × 44100) samples,
   all eight identical. Sample 0 = **bar 1, beat 1**; a pickup lives inside bar 1. Each file carries a LAME/Xing
   gapless header with `frames × 1152 − encoderDelay − padding = samples` [V]; values in `map.encoding.lame`.
   A gapless-aware decoder (libsndfile/mpg123, current Chrome/Firefox/Safari `decodeAudioData`) returns exactly
   `samples`. If a decoder returns more, the extra at the START is `encoderDelay + 529` (the LAME/mpg123 decoder-delay
   convention, `map.encoding.decoderDelayConvention`): trim that, then cut to `samples`. Phase 7 should assert
   `buffer.length === samples` in dev and log once if a browser disagrees.
3. **Anchor [V]**: the bed has an onset at bar 1 sixteenth 0 (`map.stems.bed.onsets[0] = [1, 0, v]`) and its first
   sample above −40 dBFS is within 10 ms of t = 0.
4. **Sum = mix**: summing the eight stems at gain 1 is the full mix. There is **no master compression**. The only
   processing that touches the sum is the *shared peak guard*: one transparent limiter gain curve (2.5 ms / 40 ms,
   zero-phase) multiplied **identically** into all eight stems, so the sum identity holds exactly. It acts only on the
   loudest coincident downbeats and takes at most 3.0 dB (`map.mix.sharedPeakGuardDb`); if more would be needed the
   loudness target slides down instead, to no lower than −15 LUFS (`map.mix.targetLufs`). Only an arrangement that
   still needs more than 3 dB at −15 LUFS gets a deeper guard; the composer should fix that arrangement (SONGS.md rule
   9). A stem that alone exceeds its ceiling is limited on its own (`map.mix.stemLimitDb`, normally empty).
   Measured: smoke 2.1 dB, full-length soak 2.95 dB at a −14.24 target.
5. **Levels [V]** (measured on the decoded MP3s):
   - each stem peak **≤ −3.0 dBFS**;
   - the 8-stem sum peak **≤ −1.0 dBFS**;
   - the 8-stem sum loudness **−14 LUFS ± 1.0** — BS.1770-4 style: K-weighting (the standard pre-filter + RLB
     high-pass, applied as a zero-phase magnitude response), 400 ms blocks at 100 ms hop, −70 LUFS absolute and −10 LU
     relative gates (`fel_synth.lufs`). Measured on the mono sum as a single channel.
6. **DC [V]**: |mean| ≤ 0.001 over each stem and ≤ 0.005 over every 1 s window (every stem is high-passed ≥ 20 Hz).
7. **No clicks [V]**: every rendered note has raised-cosine edge fades (≥ 2 ms in, ≥ 3 ms out); the song's last 25 ms
   fade to 0. The validator flags any sample whose 2nd difference is > 0.006, > 8× its local RMS (±5 ms, excluding
   ±3 samples) **and** > 2.5× every other 2nd-difference peak in that window (a step, kink or polarity flip; noise
   bursts do not qualify). It catches a hard cut, a 0.02 step on a bass line, a polarity flip on a pad and an unfaded
   note start, and passes clean hat/shaker noise (proven in the smoke run).
8. **No holes [V]**: within a section, every stem that section lists (`sections[].stems`) never goes silent
   (50 ms RMS < −60 dBFS) for more than one bar (+60 ms window slack). A stem not listed may be silent there. Every
   stem listed anywhere must be audible (peak > −40 dBFS) and have onsets [V].
9. **The bed [V]** is listed in every section and never has a hole longer than a bar; it carries kick + hat only
   (no pitched material), so the game can run it at gain 1 from the count-in's end to the last bar.

## 3. Preview

`preview.mp3` [V]: **stereo**, 44,100 Hz, MP3 CBR 96 kbps (80 if 96 would pass the size cap), **≤ 600,000 bytes**.
Exactly `preview.bars` (= **16** for a song) bars starting at `preview.startBar`, which is the first bar of a `hook`
section (the first hook unless the spec says otherwise) [V]. It is the full mix with stereo placement (each stem
constant-power panned by its `StemMix.pan`, plus the side channel of a decorrelated stereo reverb), its own bus
limiter and loudness normalisation: **−14 LUFS ± 1.5**, peak **≤ −1.0 dBFS** [V]; 10 ms fade-in, fade-out over the
last ≤ 1.5 s. It is NOT sample-identical to the stem sum; its mid channel correlates ≥ 0.8 with the stem sum at the
same bars [V].

## 4. The clock

All positions in map.json are musical: `bar` is 1-based, `sixteenth` is 0 ≤ s < 16 within the bar (a float for 32nds,
e.g. 12.5, or triplets). Seconds from the start of the stems:

```
d16 = 15 / bpm                                   // one sixteenth
swingOffset(s) = (s is an integer AND s is odd) ? 2 * (swing - 0.5) : 0
timeOf(bar, s) = ((bar - 1) * 16 + s + swingOffset(s)) * d16
```

`swing` ∈ [0.5, 0.75] (0.5 = straight, 0.667 = triplet feel) and applies to every stem. Rendered hits also carry a
deterministic humanise (drums ±2.4 ms, others ±4 ms, velocity ±5 %) that the map does NOT include; the validator
checks kick/snare/clap onsets land within 8 ms median / 15 ms p90 of `timeOf` [V].

## 5. map.json

```jsonc
{
  "id": "warmup",                     // [a-z_]+, = folder name
  "title": "Morning Boardwalk",       // <= 32 chars, original
  "style": "lo-fi boom-bap",
  "bpm": 88,                          // number (int when whole)
  "key": "F major",                   // "<tonic> <mode>", tonic A-G with b/#, mode in fel_synth.SCALES
  "timeSig": "4/4",
  "bars": 36,
  "durationSec": 98.181818,           // = bars * 240 / bpm (±1e-4)
  "sampleRate": 44100,
  "samples": 4329818,                 // = round(durationSec * 44100) = decoded length of every stem
  "swing": 0.58,
  "sections": [                       // contiguous, from bar 1, covering every bar exactly once
    { "name": "intro", "startBar": 1, "bars": 4, "energy": 1, "stems": ["bed", "keys", "fx"] },
    ...                               // name in intro|verse|build|hook|break|bridge|outro; energy int 1..5;
  ],                                  // stems = the stems that PLAY in this section (bed always); optional "label"
  "breakBars": [21, 22],              // 1-based bars where a freeze belongs (the band stops / the horns hit)
  "difficulty": 1,                    // 1..6, easy -> hard, unique across the six songs
  "targetTapsPerMin": 28,             // the chart density phase 9 aims for
  "hookStem": "keys",                 // the earned stem that carries the hook
  "earned": { "bounce": "drums", "footwork": "bass", ... },
  "progression": { "verse": ["Gm9", "C13", "Fmaj9", "Dm9"], ... },   // chord symbols per bar, informative
  "preview": { "file": "preview.mp3", "startBar": 13, "bars": 16 },
  "stems": {
    "bed":   { "onsets": [[1, 0, 0.9], [1, 4, 0.4], ...], "voices": { "kick": [...], "hat": [...] } },
    "drums": { "onsets": [...], "voices": { "snare": [...], "kick": [...], "hat": [...] } },
    "bass":  { "onsets": [[5, 0, 0.9], [5, 10, 0.8], ...] },
    ...                               // all eight stems
  },
  "encoding": { "format": "...", "stemVbrLevel": 0.55,
                "lame": { "tag": "Xing", "frames": 3889, "encoder": "LAME3.100", "encoderDelay": 576, "padding": 1706 },
                "decoderDelayConvention": 529 },
  "mix": { "sumLufs": -14.3, "sumPeakDb": -1.2, "stemPeakDb": {...}, "sharedPeakGuardDb": -2.1,
           "stemLimitDb": {}, "targetLufs": -14.0, "mp3VbrLevel": 0.55, "stemBytes": {...} },
  "provenance": { ... }               // §6
}
```

**Onsets [V]**: `[bar, sixteenth, velocity]` for every note/hit START on the grid (humanise excluded), one entry per
position (a chord or a stacked hit is one onset at the loudest velocity), strictly sorted, `1 ≤ bar ≤ bars`,
`0 ≤ sixteenth < 16`, `0 < velocity ≤ 1`, and `timeOf(bar, sixteenth) < durationSec`. Lead phrases give one onset per
note. FX events give their start (a riser placed with `fx_into` starts before the downbeat it lands on; the landing
is usually an `impact` onset). `voices` (bed, drums, perc only) splits the same onsets by instrument (`kick`,
`snare`, `clap`, `hat`, `openhat`, `tom`, `conga`, ...) so charts can put accents on real kicks and snares.

**Sections [V]**: a full song has at least intro, verse, hook, break and outro; the energy arc starts ≤ 2, ends ≤ 3,
peaks ≥ 3 and above the start. `breakBars` is non-empty and inside the song.

## 6. Provenance and IP

`map.provenance` [V]:

```jsonc
{
  "statement": "100% original, generated from code by FEL (fel_synth). No samples, no third-party audio, no vocals ...",
  "script": "/abs/path/songgen/song_warmup.py", "scriptSha256": "...",     // the composition (git-free content hash)
  "library": "/abs/path/songgen/fel_synth.py", "librarySha256": "...", "libraryVersion": "1.0.0",
  "seed": 20816, "seedDerivation": "every random draw = numpy PCG64(blake2b(seed, stem/voice/variant/params...))",
  "date": "2026-09-25",
  "tools": { "python": "3.12.13", "numpy": "2.5.x", "soundfile": "0.14.0", "libsndfile": "1.2.2" },
  "sha256": { "stems/bed.mp3": "...", ..., "preview.mp3": "..." }         // every audio file
}
```

The validator re-hashes every file, and fails if the script or the library changed since the render (re-render).
Rendering is deterministic: the same script + library + seed produce byte-identical MP3s on this machine.

IP rules (hard): 100 % original and generated from code; no samples, loops or third-party audio of any kind; no
recognisable melody, bassline, drum break or hook from an existing recording (compose from the chord progressions and
rhythmic rules in SONGS.md; if a line starts to resemble a known tune, change it); no vocals except the wordless
formant synth (`vox`, `vox_lead`: "ooh/aah" vowels, no words). Formant and drawbar tables in fel_synth are generic
acoustics data, not recordings.

## 7. Game integration (phase 7/9 guidance, not validated)

- Decode the eight stems once (`decodeAudioData`), start eight `AudioBufferSourceNode`s with the SAME `when` on the
  mode's audio clock; each through its own GainNode. `bed` at 1 from the downbeat; the seven earned stems follow
  StemBand's levels (`nextStemLevel`). All stems at gain 1 = the mastered mix, so the master bus needs no extra gain.
- The rendered `bed` replaces KitPulse's 808 floor for these songs (both would double the kick).
- Judge and schedule against `timeOf()`; the count-in precedes `when` by one bar at `bpm`.
- Chart accents: `stems.<stem>.onsets` (velocity ≥ ~0.6 = a strong hit), kick/snare from `stems.drums.voices`;
  freezes on `breakBars`; section energy steers density toward `targetTapsPerMin`.
- A stem whose family never appears in a chart would never be earned: either chart every family at least lightly or
  auto-raise the missing stems.

## 8. Validation

```
PY=/Users/elijahbonds/.cache/fel-kokoro/.venv/bin/python
$PY songgen/validate.py songs/<id>              # one song, JSON verdict, exit 0 = pass
$PY songgen/validate.py songs --suite            # all songs + set rules (six ids, difficulties 1..6, keys, tempi, taps)
$PY songgen/validate.py songgen/smoke_out/smoke --profile smoke   # the 4-bar library proof (relaxed song-length rules)
```

The `smoke` profile relaxes only: duration 90–120 s, the 6.5 MB cap, the 16-bar preview and hook-start rules, the
section-arc rule and non-empty breakBars. Every audio rule is identical.
