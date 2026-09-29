# The Cypher's six house songs — specs v1 (2026-09-25)

Owner decisions #5/#6 (musicsuite/DECISIONS.md): six FEL-made songs, 1.5–2 min, easy → hard, each with its own key,
style and sections, rendered as audio + stems from scripted composition. The file format is CONTRACT.md; the
instruments are `fel_synth.py`; the checker is `validate.py`.

| # | id | title | style | BPM | key | swing | bars | sec | diff | taps/min | hook stem | preview |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `warmup` | Morning Boardwalk | lo-fi boom-bap | 88 | F major | 0.58 | 36 | 98.2 | 1 | 28 | keys | 13–28 |
| 2 | `cypher` | Windward Circle | slap-bass funk | 96 | E dorian | 0.54 | 40 | 100.0 | 2 | 40 | bass | 13–28 |
| 3 | `goldenhour` | Golden Hour Glide | west-coast sunset groove | 104 | B♭ dorian (`Bb dorian`) | 0.56 | 44 | 101.5 | 3 | 54 | lead | 13–28 |
| 4 | `battle` | Breakwater | b-boy breakbeat | 112 | G minor | 0.52 | 48 | 102.9 | 4 | 68 | horns | 13–28 |
| 5 | `canals` | Canal Lights | house-hop | 118 | C minor | 0.55 | 52 | 105.8 | 5 | 84 | keys | 21–36 |
| 6 | `evolution` | Final Evolution | electro-funk | 126 | F♯ minor (`F# minor`) | 0.50 | 56 | 106.7 | 6 | 100 | lead | 17–32 |

The three legacy ids keep their tempos (88 / 96 / 112, danceTracks.ts) so saved progress and the tempo each chart was
learned at still hold. Six tonics (F, E, B♭, G, C, F♯), tempo rises with difficulty, length grows 98 → 107 s, every
earned instrument carries at least one hook across the set (keys ×2, bass, lead ×2, horns; drums/perc/fx carry the
breaks, builds and transitions). Seeds: warmup `0x5150`, cypher `0xC1FE`, battle `0xBA77` (the chart seeds, reused),
goldenhour `0x5E75`, canals `0xCA7A`, evolution `0xEF01`.

## Rules for every composer

**Scripts.** One script per song: `songgen/song_<id>.py`, which builds a `Song` and ends with
`if __name__ == '__main__': main(build, __file__)` (fel_synth.main). Run it with
`/Users/elijahbonds/.cache/fel-kokoro/.venv/bin/python songgen/song_<id>.py`; it writes `songs/<id>/` and validates.
Then `validate.py songs --suite`. Never write inside the repo. Keep the spec's id, title, bpm, key, swing, bars,
sections (names, bars, energy, stems), breakBars, difficulty, targetTapsPerMin, hookStem, preview start and seed; the
notes inside are yours (the motifs below are starting sketches — keep, vary or replace them, but pass the IP check).

**Arrangement rules** (the validator enforces 1–3):
1. A stem a section lists must sound at least once in every bar of that section (no silence > 1 bar). Sparse parts
   (horns, fx) need a stab, swell or `wash` in every bar; a stem a section does not list must be silent there, or
   close to it (a reverb tail or a riser into the next section is fine).
2. The bed: `kick` at bar 1 sixteenth 0 (the t = 0 anchor), then kick + `hat` only, every bar to the end, sparse
   (kick on 1, or 1 and 3; a hat pulse on quarters or off-beat 8ths). No pitched material in the bed.
3. The last bar ends with a hit on beat 1 that rings out; nothing starts after the last bar's sixteenth 8 except tails.
4. Drums do not repeat a bed hit (same voice, same position). Bed + drums together = the full kit.
5. Every stem must stand on its own as a part (the band is heard in any subset): complete bass lines, complete
   voicings, horn lines that make sense without the lead.
6. Density follows `energy`: 1 = pulse and colour, 3 = full groove, 5 = everything plus fills, ghost notes, doubles.
7. The hook stem carries the hook audibly in every hook bar; the other stems make room (register, rhythm).
8. Breaks: the freeze belongs on `breakBars`. The band stops or thins, the horns hit on the freeze, fx carries the
   transition back in. The bed keeps the pulse.
9. Peaks: the shared peak guard should stay under ~2.5 dB (`map.mix.sharedPeakGuardDb`). Strum or offset chord
   attacks (`strum_ms`, six 0 vs 0.5), keep bed and drums kicks apart, keep bass notes from all starting with the
   loudest kick + snare + chord stab on the same sixteenth.

**IP check (write it in the script's docstring).** Everything is synthesised by fel_synth; no samples, no loops, no
audio files read. Melodies, riffs and basslines come from the chord symbols and rules here. Before rendering, sing or
play each hook, riff and bassline against the tunes you know; if it resembles one, change the rhythm and the contour.
Drum patterns must not reproduce a famous break (e.g. the Amen, Funky Drummer, Apache, Think, Impeach the President,
the classic 808 electro "Planet Rock" kick) — build them from the patterns below. No words: `vox`/`vox_lead` are
wordless vowels only.

**API cheat sheet** (fel_synth):
`Song(...)`, `Section(name, start_bar, bars, energy, stems)`, `song.pattern(stem, voice, bars, 'x...o...', vel,
**params)`, `song.note(stem, voice, bar, six, 'F2', dur16, vel, **params)`, `song.chord(stem, voice, bar, six,
voicing('Gm9', center=64, rootless=True, prev=last), dur16, vel, strum_ms=15)`, `song.phrase(stem, 'whistle',
[(bar, six, pitch, dur16, vel), ...], glide=0.08)`, `song.fx(stem, voice, bar, six, dur16)`,
`song.fx_into(stem, 'riser', bar, 0, dur16)` (ends ON bar/six), `song.roll(stem, 'snare', bar, bars)`,
`song.plays(stem, bar)`, `song.bars_of('hook')`, `Key('F major').degree(5, 4)`, `chord_root('Gm9', 1)`,
`song.mix['keys'] = StemMix(...)` (eq, drive, reverb/reverb_type, delay/delay_16ths/delay_fb, duck/duck_release,
tremolo, pan, width). Voices and their params: `python -c "import fel_synth as F; [print(k, '-', v.about) for k, v in
sorted(F.VOICES.items())]"`.

Pattern strings are 16 characters per bar: `X` accent, `x` normal, `o` ghost, `g` soft ghost, `1`–`9` = velocity/9,
`.` rest.

---

## 1. `warmup` — Morning Boardwalk (difficulty 1)

Lo-fi boom-bap for the first minute of the morning on the boardwalk: dusty swung drums, a warm EP, a soft horn
section. 88 BPM, **F major**, swing 0.58, 36 bars (98.2 s), seed `0x5150`, 28 taps/min, hook = **keys**.

| # | section | bars | energy | stems | what happens |
|---|---|---|---|---|---|
| 1 | intro | 1–4 | 1 | bed keys fx | EP comp alone (dark: `bright` 0.2), wordless vox pad, air |
| 2 | verse | 5–12 | 2 | bed drums bass keys perc fx | the groove arrives; bass in, shaker |
| 3 | hook | 13–20 | 3 | all | EP hook melody on top; horns swell/answer; lead counter-line |
| 4 | break | 21–22 | 2 | bed keys horns fx | band stops: horn chord held (the freeze), EP one chord |
| 5 | verse | 23–26 | 2 | bed drums bass keys perc lead fx | groove back; lead = soft "ooh" vox_lead |
| 6 | hook | 27–34 | 4 | all | hook again, fuller: ghost snares, tamb, crash on 27 |
| 7 | outro | 35–36 | 1 | bed keys fx | EP on Fmaj9, vox pad, final bed kick rings |

- **breakBars** `[21, 22]`. 21.1: horns B♭maj9 shell swell (dur 28 sixteenths, `fall` 2 at the end), EP one chord;
  drums/bass/perc/lead out; bed kick on 21.1 then hats only; fx `downsweep` from 21.1 (2 bars), `reverse` into 23.1.
- **Progression** (one chord per bar): intro/verse `Gm9 | C13 | Fmaj9 | Dm9` (ii–V–I–vi); hook
  `Bbmaj9 | Am7 | Gm9 | C9sus4` (IV–iii–ii–V); break `Bbmaj9` (2 bars); outro `Fmaj9` (2 bars).
- **bed**: `kick` (tune 50, decay 0.35, click 0.2) `x...............`; `hat` (decay 0.03, tone 0.3)
  `x...x...x...x...` vel 0.35 (break: hats only after 21.1).
- **drums** (`snare` tune 200, lofi 0.6, decay 0.14; `hat` decay 0.035, tone 0.25): snare `....x.......x...`;
  kick verse `..........x.....`, hook `......x...x.....`; hat `..x...x...x...x.` vel 0.5; hook adds ghost snare
  `.......o.......o` (0.25), `openhat` six 14 every 4th bar, `crash` 0.5 on 13.1 and 27.1.
- **bass** `pluck_bass` (shape `warm`, cutoff 160, env 700, fdecay 0.12, q 0.8, sub 0.4), roots in octave 1–2 (F1–E2):
  root six 0 (dur 6), fifth six 10 (dur 2), a scale-step approach to the next root six 14 (dur 2); hook adds the
  octave on six 7 (dur 1, 0.6).
- **keys** `ep` (bright 0.35, decay 1.6, tine 0.15), rootless voicings around 64 voice-led with `prev`: six 0 dur 7
  (strum 18 ms, 0.62), six 10 dur 5 (0.5). Stem tremolo (4.8 Hz, 0.18). **Hook melody** on the EP an octave above the
  comp (vel 0.75), sketch (bar: sixteenth pitch dur):
  - bar 1 (B♭maj9): 0 F4 2 · 2 A4 2 · 4 C5 4 · 10 D5 2 · 12 C5 4
  - bar 2 (Am7): 2 E5 2 · 4 D5 2 · 6 C5 6 · 14 A4 2
  - bar 3 (Gm9): 0 B♭4 2 · 2 A4 2 · 4 G4 4 · 10 D5 6
  - bar 4 (C9sus4): 0 C5 4 · 6 B♭4 2 · 8 G4 8 — bars 5–8 repeat with the last bar resolving to F4.
- **perc** `shaker` (length 0.06) `oxoxoxoxoxoxoxox` (0.45 / 0.25); `rim` `.......x........` on even bars (0.55);
  hook 2 adds `tamb` `....x.......x...` (0.4).
- **horns** `brass` (voices 2, bright 0.3, attack 0.06, vib 10, scoop −20), shells (3rd/7th/9th, center 67): odd hook
  bars a swell six 0 dur 8; even hook bars answers six 6 and 10 (dur 2). Break as above.
- **lead** hook: `soft_lead` counter-line answering the EP in even bars (e.g. six 8 A5 4, 12 G5 2, 14 F5 2) and one
  long chord-tone note (six 0, dur 6, 0.5) in odd bars; verse 2: `vox_lead` (vowel `o`) one long note per bar.
- **fx** `wash` (lo 400, hi 2500, rate 0.08, vel 0.35) in 4-bar events wherever fx is listed; `vox` pad (vowels
  `u`→`o`, 3 notes around 60) bars 1–4 and 35–36; `riser` into 13 (1 bar) and into 27 (2 bars, tone F3); `impact`
  0.5 on 13.1 and 27.1; break per above.
- **mix**: drums eq add `('lp', 9000)` and drive 0.2; keys `('lp', 6000)`; lead delay 0.12 (dotted 8th).

## 2. `cypher` — Windward Circle (difficulty 2)

Slap-bass funk for the circle on Windward: the bass riff IS the hook, a clav comps the 16ths, a horn section answers.
96 BPM, **E dorian**, swing 0.54, 40 bars (100.0 s), seed `0xC1FE`, 40 taps/min, hook = **bass**.

| # | section | bars | energy | stems | what happens |
|---|---|---|---|---|---|
| 1 | intro | 1–4 | 1 | bed keys perc fx | clav + congas over the pulse |
| 2 | verse | 5–12 | 2 | bed drums bass keys perc fx | drums + a thinned bass riff |
| 3 | hook | 13–20 | 3 | all | the full slap riff; horns answer; organ pad |
| 4 | break | 21–22 | 2 | bed keys horns fx | stop-time: horn A13 swell + stabs, scrub fx |
| 5 | verse | 23–28 | 3 | bed drums bass keys perc lead fx | square-lead fills between the riff |
| 6 | hook | 29–36 | 4 | all | riff + horns + lead doubling the horns (last 4 bars) |
| 7 | outro | 37–40 | 2 | bed drums bass horns fx | horn hits on each downbeat, final hit 40.1 |

- **breakBars** `[21, 22]`: 21.1 horns A13 shell (G, C♯, F♯) swell dur 24 with `fall` 3; 22 six 8 and 12 short stabs
  (E5/B4/G4); `scrub` (pitch E3) 21 six 8 and 22 six 8 (dur 4); EP/clav one chord on 21.1.
- **Progression**: verse `Em9 | Em9 | A13 | A13` (the dorian i–IV vamp); hook `Gmaj7 | A13 | F#m7 | Bm7`, last hook
  bar of each hook `B7#9`; break `A13`; outro `Em9`.
- **bed**: `kick` `x...............`; `hat` `x...x...x...x...` 0.35.
- **drums** (`snare` tune 220, snappy 0.8, decay 0.13): snare `....x..o.o..x...` (ghost 0.25); kick
  `..........x..x..` (+ six 6 in hooks); `hat` (decay 0.03) `.oxo.oxo.oxo.oxo` (0.5 / 0.25); `openhat` six 14 on
  bars 4 and 8 of each section.
- **bass** `slap` (bright 0.7, pop 0.25) — the riff, per Em9 bar (sixteenth pitch dur vel):
  0 E2 2 1.0 · 3 E3 1 0.8 · 4 E2 1 0.5 · 6 G2 2 0.8 · 8 A2 1 0.7 · 10 B2 2 0.85 · 13 D3 1 0.8 · 14 E3 2 0.9.
  A13 bars: the same rhythm on A1 / A2 / A1 / C♯2 / E2 / F♯2 / G2 / A2. Hook: same rhythm on each chord (root, octave,
  root ghost, 3rd, 5th, 6th, ♭7, octave). Verses drop the six 3 and six 13 pops (the full riff is the hook's).
- **keys** `clav` (width 0.2, env 5000) 3rd+7th shells around 64 on `..x..x.x..x..x..` (0.6–0.75); hooks add `organ`
  (drawbars `full`, perc 0.2) whole-bar chords at 0.45 around 60.
- **perc** `conga` low `x.....x.........`, mid `...x......x..x..`, high slap `.......x.......x`; hooks `tamb`
  `....x.......x...` 0.5; hook 2 `cowbell` `..x.......x.....` 0.4.
- **horns** `brass` (voices 3, bright 0.75), per 4-bar hook phrase: bar 1 six 0 hit dur 2 + six 14 stab dur 2 (the
  next chord); bar 2 six 0 dur 1, 3 dur 1, 6 dur 3 `fall` 2 (top line E5 E5 F♯5); bar 3 six 0 hit dur 2 + six 14 dur 2;
  bar 4 six 0 dur 2, 4 dur 2, 8 dur 6 swell. Outro hits 37.1, 38.1 (+ six 6), 39.1, 40.1 dur 12 `fall` 4.
- **lead** `square_lead` (glide 0.04): verse 2 fills in the riff's gaps, e.g. bar A 8 B4 2 · 10 D5 2 · 12 E5 4,
  bar B 0 G5 3 · 4 F♯5 2 · 6 E5 6; hook 1 and hook 2 bars 29–32: a short fill answering the riff in every bar
  (six 8–15); hook 2 bars 33–36 double the horn top line an octave up at 0.5.
- **fx** `wash` (lo 300, hi 1800, vel 0.3) in every section that lists fx; `sweep` bar 12 six 8 (dur 8); `riser` into
  13 and 29 (2 bars); `impact` 13.1 and 29.1; break per above; `downsweep` 37.1 (2 bars).
- **mix**: bass drive 0.2; keys pan −0.3; horns reverb plate 0.18.

## 3. `goldenhour` — Golden Hour Glide (difficulty 3)

A west-coast sunset groove: laid-back swing, a rolling sliding synth bass, a portamento whistle lead that carries the
hook, fat clap-on-snare backbeat. 104 BPM, **B♭ dorian** (`Bb dorian`), swing 0.56, 44 bars (101.5 s), seed `0x5E75`,
54 taps/min, hook = **lead**.

| # | section | bars | energy | stems | what happens |
|---|---|---|---|---|---|
| 1 | intro | 1–4 | 1 | bed keys lead fx | pad + the whistle teases the hook's first two bars |
| 2 | verse | 5–12 | 2 | bed drums bass keys perc fx | the roll-in: sliding bass, clap+snare |
| 3 | hook | 13–20 | 3 | all | whistle hook; horn swells; bell sparkles |
| 4 | break | 21–24 | 2 | bed keys horns fx | two stop hits (21.1, 23.1), swells between |
| 5 | verse | 25–32 | 3 | bed drums bass keys perc lead fx | whistle counter-melody, long notes |
| 6 | hook | 33–40 | 4 | all | hook with the octave-up answer in bars 4 and 8 |
| 7 | outro | 41–44 | 2 | bed keys lead fx | the whistle's last phrase over the pad |

- **breakBars** `[21, 23]`: 21.1 horns `Gbmaj7` hit dur 3 (the freeze), 21 six 12 swell dur 10 (into 22); 23.1
  `Ab13` hit dur 3, 23 six 12 swell dur 18 `fall` 2 (into 24); pad holds; fx `downsweep` 21.1, `riser` into 25
  (1 bar), `reverse` into 25.1.
- **Progression**: verse `Bbm9 | Eb9 | Bbm9 | Eb9` (dorian i–IV); hook `Gbmaj7 | Fm7 | Ebm9 | Ab13`
  (VI–v–iv–VII); break `Gbmaj7 | Gbmaj7 | Ab13 | Ab13`; intro/outro `Bbm9 | Eb9`.
- **bed**: `kick` `x...............`; `hat` `..x...x...x...x.` 0.35 (off-beat 8ths).
- **drums** (`snare` tune 180, decay 0.2, body 0.7 + `clap` tone 1200, decay 0.18, both on `....x.......x...`):
  kick `.......x..x.....` (every 4th bar `...x...x..x.....`); `hat` `xo.oxo.oxo.oxo.o` (0.45 / 0.2); `openhat`
  six 6 in bar 4 of each phrase.
- **bass** `pluck_bass` (shape `saw`, cutoff 140, env 600, fdecay 0.2, q 1.3, sub 0.5), sliding (`from`, glide
  0.06): per B♭m9 bar 0 B♭1 5 · 6 B♭2 1 · 8 D♭2 3 · 11 E♭2 1 · 12 F2 3, sliding into the next root; same shape on
  each chord.
- **keys** `pad` (shape `warm`, cutoff 1500, attack 0.35) whole-bar chords around 60; `ep` light comp six 6 and 14
  (0.4); hooks add `bell` (decay 0.5) on six 8 of odd bars (chord 9ths).
- **perc** `shaker` `x.x.x.x.x.x.x.x.` 0.4; `conga` mid `......x...x..x..`; verse 2 `snap` `....x.......x...` 0.5.
- **horns** `brass` (voices 3, bright 0.45, attack 0.05): hook swells six 0 dur 12 on bar 1 of each 2-bar phrase;
  answers six 6 dur 2 and six 12 dur 4 on even bars. Break per above.
- **lead** `whistle` (glide 0.1, vib 0.3) — **hook** sketch:
  - bar 1 (G♭maj7): 0 F5 6 (slide from E♭5) · 6 A♭5 2 · 8 F5 2 · 10 E♭5 6
  - bar 2 (Fm7): 0 C5 4 · 4 E♭5 2 · 6 C5 2 · 8 A♭4 8
  - bar 3 (E♭m9): 0 F5 6 · 6 A♭5 2 · 8 B♭5 2 · 10 A♭5 6
  - bar 4 (A♭13): 0 F5 3 · 3 E♭5 5 · 8 C5 2 · 10 E♭5 6 — bars 5–8 repeat, bar 8 answered an octave up in hook 2.
  Verse 2: a counter-melody of long notes (one or two per bar, none shorter than 8 sixteenths); intro: bars 1–2 of the
  hook twice at 0.6; outro: bars 1–4 of the hook fading 0.6 → 0.4.
- **fx** `wash` (lo 600, hi 3500, rate 0.06) wherever listed; `riser` into 13 and 33 (2 bars, tone B♭2); `impact`
  13.1 and 33.1; `sweep` six 8 (dur 8) at the end of each 4-bar verse phrase.
- **mix**: lead delay 0.2 (dotted 8th, fb 0.4); bass drive 0.25.

## 4. `battle` — Breakwater (difficulty 4)

A b-boy breakbeat for the battle at the breakwater: a busy original drum break, octave-pumping bass, a brass riff that
IS the hook, scrub fx on the stops. 112 BPM, **G minor**, swing 0.52, 48 bars (102.9 s), seed `0xBA77`, 68 taps/min,
hook = **horns**.

| # | section | bars | energy | stems | what happens |
|---|---|---|---|---|---|
| 1 | intro | 1–4 | 2 | bed perc horns fx | horn fanfare hits over congas, scrubs |
| 2 | verse | 5–12 | 3 | bed drums bass keys perc fx | the break drops; stabs; bass pumps |
| 3 | hook | 13–20 | 4 | all | the brass riff; organ; lead doubles an octave up |
| 4 | break | 21–24 | 3 | bed drums horns fx | the drum break alone; it STOPS on 22 and 24 (freeze) |
| 5 | verse | 25–32 | 3 | bed drums bass keys perc lead fx | saw-lead call phrases |
| 6 | build | 33–36 | 4 | bed drums bass keys perc lead fx | snare roll 35–36, rising lead arp, riser |
| 7 | hook | 37–44 | 5 | all | the riff with everything: ride, cowbell, tamb |
| 8 | outro | 45–48 | 3 | bed drums horns fx | break + horn hits, final hit 48.1 |

- **breakBars** `[22, 24]`: bars 21 and 23 = the drum break (drums solo + horn stabs six 0, 6 and 12); bars 22 and 24:
  the break plays to six 7, then STOPS (drums, perc silent from six 8), horns hit six 8 dur 4 (the freeze), `scrub`
  (pitch G3, rate 6) six 8 dur 4; bed pulse continues.
- **Progression**: verse `Gm7 | Gm7 | Ebmaj7 | D7#9`; hook `Gm | F | Eb | D7` (i–VII–VI–V); build `Ebmaj7 | Ebmaj7 |
  D7#9 | D7#9`; intro/break/outro on `Gm7`.
- **bed**: `kick` `x...............`; `hat` `..x...x...x...x.` 0.35.
- **drums** — an original 2-bar break (A, B), drive 0.25:
  A: kick `..........x.....` · snare `....x..o.o..x...` · hat `x...x..xx...x...`
  B: kick `..x.......x..x..` · snare `....x..o....x.oo` · hat `x...x..xx...x...` · openhat six 6.
  Toms (high → low) six 12–15 at the end of every 8th bar; `crash` on section downbeats; hook 2 adds `ride`
  `x...x...x...x...`. Build: `roll` on snare bars 35–36 (steps 2, 1, 1, 0.5), kick on quarters in bar 36.
- **bass** `pluck_bass` (shape `square`, cutoff 250, env 1500, fdecay 0.07, q 1.2, sub 0.3), octave pump
  `x.x..xx.x.x..x.x` alternating root (octave 1) and octave (octave 2); follows the hook roots G / F / E♭ / D.
- **keys** `stab` (cutoff 600, env 4500, decay 0.12) `x..x..x...x.....` in verses; hooks `organ` (drawbars
  `gospel`) sustained at 0.4 plus stabs on six 0 and 6.
- **perc** `conga` (low/mid/high, `stroke` open/slap) `x..x..x...x..x..` family; hook `tamb` 8ths 0.35; hook 2
  `cowbell` `..x.......x.....`; intro congas + `snap` on 4 and 12.
- **horns** `brass` (voices 3, bright 0.85, attack 0.015, scoop −40), triads under the top line — **hook riff**
  sketch (sixteenth top-note dur):
  - bar 1 (Gm): 0 D5 2 · 3 D5 1 · 6 F5 2 · 8 G5 3 (`fall` 2)
  - bar 2 (F): 2 F5 2 · 4 E♭5 2 · 7 C5 1 · 8 D5 6
  - bar 3 (E♭): 0 E♭5 2 · 3 E♭5 1 · 6 G5 2 · 8 B♭5 3 (`fall` 2)
  - bar 4 (D7): 0 A5 2 · 3 F♯5 2 · 6 D5 2 · 8 C5 2 · 10 A4 6
  Intro fanfare: 1.1 swell dur 8, 2.1 hit + 2 six 6, 3.1 swell, 4.1 hit + 4 six 14 pickup. Outro hits each downbeat,
  48.1 dur 12 `fall` 4.
- **lead** `saw_lead` (glide 0.03): verse 2 two-bar call phrases in G minor pentatonic (bar 1 call, bar 2 answer, each
  ≥ 3 notes); build: a rising 16th arpeggio (G–B♭–D–F up two octaves) bars 33–36; hooks: the horn top line an octave
  up at 0.5.
- **fx** `wash` (low, 0.25) wherever listed; intro `scrub` 2 six 8 (dur 4), 4 six 8 (dur 8); `riser` into 13 and 37
  (2 bars); `impact` 13.1 and 37.1; `downsweep` 21.1 and 45.1; `sweep` 32 six 8.
- **mix**: horns eq add `('peak', 2500, 2.0, 0.8)`; bass drive 0.2.

## 5. `canals` — Canal Lights (difficulty 5)

House-hop under the lights on the canals: four-on-the-floor with a hip-hop swing, off-beat bass pumping under a
sidechain, an organ stab riff as the hook, a wordless vox lead. 118 BPM, **C minor**, swing 0.55, 52 bars
(105.8 s), seed `0xCA7A`, 84 taps/min, hook = **keys**.

| # | section | bars | energy | stems | what happens |
|---|---|---|---|---|---|
| 1 | intro | 1–8 | 2 | bed keys perc fx | half-time bed, dark organ riff, shaker, vox pad |
| 2 | verse | 9–16 | 3 | bed drums bass keys perc fx | four-on-the-floor, off-beat bass, EP chords |
| 3 | build | 17–20 | 4 | bed drums bass keys perc lead fx | 4-bar riser, vox lead enters, snare roll 19–20 |
| 4 | hook | 21–28 | 4 | all | organ stab riff, horn stabs, vox lead melody |
| 5 | break | 29–32 | 2 | bed keys horns fx | pads + two freeze hits (29.1, 31.1) |
| 6 | verse | 33–40 | 3 | bed drums bass keys perc lead fx | vox lead answers, rim clicks |
| 7 | hook | 41–48 | 5 | all | riff + tamb + doubled horns + fills |
| 8 | outro | 49–52 | 2 | bed drums perc fx | drums + shaker thin out, final kick 52.1 |

- **breakBars** `[29, 31]`: 29.1 and 31.1 horn hits dur 4 (the freezes) with the organ holding `Cm9` then
  `Abmaj9`; horn swells 29 six 10 (dur 12, into 30) and 31 six 10 (dur 22, into 32); drums/bass/perc/lead out; bed
  kick + hats continue; `downsweep` 29.1, `reverse` into 33.1.
- **Progression**: verse `Cm9 | Abmaj9 | Ebmaj9 | Bb6`; hook `Fm9 | Gm7 | Abmaj7 | Bb9sus4`; build `Abmaj7 | Abmaj7 |
  Bb | Bb`; break `Cm9 | Cm9 | Abmaj9 | Abmaj9`; intro/outro `Cm9 | Abmaj9`.
- **bed**: `kick` `x.......x.......` (half-time, sparse); `hat` `..x...x...x...x.` 0.35 (the house off-beat).
- **drums**: kick `....x.......x...` (with the bed = four on the floor); `clap` (tone 1350, decay 0.16)
  `....x.......x...`; `hat` `xo.oxo.oxo.oxo.o` (0.45 / 0.25); `openhat` six 14 every 2nd bar; build: `roll` on
  snare bars 19–20; hook 2 fills (toms) at phrase ends.
- **bass** `pluck_bass` (shape `saw`, cutoff 200, env 1200, fdecay 0.08) off-beats: six 2, 6, 10 (dur 2) on the
  root, six 14 the octave; hook: root / 5th / octave movement on the same off-beats. Stem `duck` 0.45 (release
  0.12 s) keyed by the kicks.
- **keys** — the **hook** is an `organ` stab riff (drawbars `house`, perc 0.3, click 0.1), chord voicings around 64,
  rhythm `x..x..x...x.x...` (durs 1, 1, 2, 1, 2), one chord per bar of the hook progression; the intro plays it at
  0.35 with `bright` low; verses: `ep` whole-bar chords (0.5) + two organ stabs on six 6 and 14. Stem `duck` 0.35.
- **perc** `shaker` `oxoxoxoxoxoxoxox` (0.45 / 0.25); `conga` mid `......x...x..x..`; hooks `tamb`
  `..x...x...x...x.` 0.35; verse 2 `rim` six 7.
- **horns** `brass` (bright 0.7): hooks six 6 dur 1 every bar + six 14 dur 2 `fall` 2 every 2nd bar; hook 2 doubles
  with `voices` 4. Break per above. Stem `duck` 0.25.
- **lead** `vox_lead` (vowel `o`, glide 0.06) — hook sketch (C minor pentatonic):
  - bar 1 (Fm9): 0 C5 4 · 4 E♭5 2 · 6 F5 4 · 10 E♭5 2 · 12 C5 4
  - bar 2 (Gm7): 2 B♭4 2 · 4 G4 2 · 6 B♭4 6 · 14 C5 2
  - bar 3 (A♭maj7): 0 E♭5 4 · 4 G5 4 · 8 F5 2 · 10 E♭5 6
  - bar 4 (B♭9sus4): 0 F5 6 · 8 E♭5 2 · 10 C5 6
  Build: long rising notes (one per bar, dur ≥ 12: C5 → E♭5 → F5 → G5); verse 2: a short answer in every bar after
  the organ stabs.
- **fx** `vox` pad (vowels `u`→`a`) bars 1–8 and 29–32; `wash` elsewhere it is listed; `riser` 17.1 → 21.1 (4 bars,
  tone C3) and into 41 (2 bars); `impact` 21.1 and 41.1; stem `duck` 0.3.
- **mix**: every `duck` above uses release 0.12 s; keys reverb plate 0.2.

## 6. `evolution` — Final Evolution (difficulty 6)

The finale: electro-funk at 126 with a robotic square-wave hook, 808-style long bass, 16th-note arps, zaps, and two
breaks (the last freeze lands inside the final hook run). 126 BPM, **F♯ minor** (`F# minor`), swing 0.50 (straight),
56 bars (106.7 s), seed `0xEF01`, 100 taps/min, hook = **lead**.

| # | section | bars | energy | stems | what happens |
|---|---|---|---|---|---|
| 1 | intro | 1–4 | 2 | bed keys fx | a 16th square arp + pad, zaps |
| 2 | verse | 5–12 | 3 | bed drums bass keys perc fx | electro kit, long 808 bass |
| 3 | build | 13–16 | 4 | bed drums bass keys perc lead fx | roll, rising lead arp, riser |
| 4 | hook | 17–24 | 4 | all | square-lead hook, octave-pulse bass, brass stabs |
| 5 | break | 25–28 | 3 | bed keys horns fx | freeze hits 25.1 and 27.1, brass swells, scrubs |
| 6 | verse | 29–36 | 3 | bed drums bass keys perc lead fx | call/response lead |
| 7 | build | 37–40 | 4 | bed drums bass keys perc lead fx | as 13–16, higher |
| 8 | hook | 41–48 | 5 | all | the hook with every layer |
| 9 | break | 49–50 | 4 | bed horns fx | the last freeze: brass hits 49.1 and 50.1 |
| 10 | hook | 51–54 | 5 | all | the hook's last four bars, full |
| 11 | outro | 55–56 | 2 | bed keys fx | arp + pad ring out, final kick 56.1 |

- **breakBars** `[25, 27, 49, 50]`: 25.1 / 27.1 / 49.1 / 50.1 brass hits dur 4 (the freezes); 26 and 28 brass swells
  (dur 12) with `fall` 3; `scrub` (pitch F♯3) 25 six 8 dur 8, 27 six 8 dur 8, 49 six 8 dur 4; drums/bass/perc/lead out
  (bed continues); `downsweep` 25.1 and 49.1; `reverse` into 29.1 and 51.1.
- **Progression**: verse `F#m9 | F#m9 | Dmaj7 | E6`; hook `F#m | D | A | E` (i–VI–III–VII); build `Bm7 | Bm7 | C#7 |
  C#7`; break `Dmaj7 | Dmaj7 | C#7 | C#7` (49–50 `C#7`); intro/outro `F#m9`.
- **bed**: `kick` `x...............`; `hat` (tone 0.6) `x...x...x...x...` 0.35.
- **drums**: kick `......x.x.....x.` (original, syncopated); `clap` (tone 1500, decay 0.12) `....x.......x...`, hooks
  layer `snare` on the clap; `hat` `.oXo.oXo.oXo.oXo`; builds: `roll` on snare (13–16 and 37–40, 2 bars each end);
  `tom` fills at section ends; hook 2 adds `ride` quarters.
- **bass** verse: `bass808` (decay 1.2, punch 7, drive 0.4) `x.....x...x.....` on the roots with `from` slides
  between chords; hook: `pluck_bass` (shape `square`, cutoff 300, env 2500) octave pulse `x.x.x.x.x.x.x.x.`
  (root octave 1 / octave 2) with the `bass808` on six 0.
- **keys** `pluck` (shape `square`, env 5000, decay 0.15) 16th arpeggios up-down through the chord tones over two
  octaves (0.5–0.7, accents on the beat) in intro/verse/build/hook/outro; `pad` (shape `saw`, cutoff 2200) under the
  hooks, the intro and the break. Stem `duck` 0.25.
- **perc** `cowbell` `...x.......x....` (hooks); `rim` `......x.......x.`; `shaker` 16ths soft (0.3 / 0.2).
- **horns** `brass` (bright 0.95, attack 0.012, voices 3, spread 12): hooks six 0 dur 2, six 6 dur 1, six 10 dur 2
  every bar on the hook chord (doubling the lead's accents); breaks per above.
- **lead** `square_lead` (glide 0.035, vib 0.12) — **hook** sketch:
  - bar 1 (F♯m): 0 C♯5 3 · 3 E5 3 · 6 F♯5 2 · 8 E5 2 · 10 C♯5 2 · 12 B4 4
  - bar 2 (D): 0 A4 2 · 2 B4 2 · 4 C♯5 6 · 12 E5 2 · 14 F♯5 2
  - bar 3 (A): 0 A5 4 · 4 G♯5 2 · 6 E5 2 · 8 C♯5 4 · 12 E5 4
  - bar 4 (E): 0 G♯5 3 · 3 F♯5 3 · 6 E5 2 · 8 B4 8
  Builds: a rising 16th arpeggio (F♯ minor, two octaves); verse 2: 2-bar call/response phrases.
- **fx** `wash` wherever listed; `zap` on six 6 and 14 of odd hook bars (0.4); `riser` into 17, 41 (4 bars, tone F♯2)
  and into 51 (2 bars); `impact` 17.1, 41.1, 51.1; breaks per above.
- **mix**: lead delay 0.15 (dotted 8th); bass drive 0.35; drums drive 0.2.

---

## Render order and done-ness

1. Write `song_<id>.py` → render → `validate.py songs/<id>` green (all checks).
2. Listen to the preview and the solo stems (any subset must sound like a band); keep `sharedPeakGuardDb` ≥ −2.5.
3. After all six: `validate.py songs --suite` green (six ids incl. the legacy three, difficulties 1–6, distinct keys,
   tempi 88–126 rising with difficulty, taps rising, distinct titles and styles).
