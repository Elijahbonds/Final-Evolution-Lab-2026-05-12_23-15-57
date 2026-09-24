# The MC on the mic (2026-09-24)

Owner: *"add a MC announcer on the mic at the events so it has better commentary and audio. Mouthpiece aka voice of venice beach
would be perfect for this and i will get a creator card for all my guys. for now create some voices, commentary, chatter"*

Owner decisions (AskUserQuestion, 2026-09-24):
- **Voices:** pre-recorded AI voices. Kokoro-82M (Apache-2.0 weights) runs locally and renders every line to a small clip. No browser speech.
- **Events:** all the hoops events: the dunk contest, Dunk Duel, the 3PT contest, the 1v1 and 3v3 runs, and the court carnival.
- **Cast:** one MC per court (Venice is the lead mic), plus a courtside sidekick, crowd chatter and player chatter shared across courts.
- **Language:** clean streetball. Hard roasts, no profanity or slurs.

## The cast (`lib/babylon/audio/mic/cast.ts`)

Every voice is an original character. Nobody's real voice, name or catchphrase is imitated.

| Court | MC | Who |
|---|---|---|
| Venice Beach Court | **Boardwalk** | The lead mic. A rapid-fire boardwalk hype MC: the pier, the drum circle, Dogtown, tourists with phones. The creator-card slot `venice-lead-mic` is pending. |
| Blossom Park | **Uncle June** | A park elder under the cherry trees. Dry and slow, then he loses it on a great play. |
| Orbit | **Nova** | An arena announcer in space: liftoff, altitude, mission control. |
| Canopy Court | **Moss** | Forest-calm with nature metaphors; the hype builds like wind in the trees. |
| Night Rooftop | **Velvet** | A late-night radio host with savage one-liners, almost whispered. |

- **Scoop:** the courtside sidekick on every court. He answers the MC's big calls and fills quiet stretches.
- **The crowd:** six voices, crowd_a to crowd_f: a front-row regular, a big guy with friends, a teen filming, a jolly heckler, a hooper waiting for next, and a tourist.
- **The players:** the five dunk rivals (Cass, Ty, Pilot, Zo, Stack), each in their own temperament, and three court hoopers (hooper_a/b/c) who talk trash and call for the ball.

## How it works

- **`MicDirector`** (pure, tested) decides who says what and when:
  - **The booth:** the MC and the sidekick share one mic. A bigger moment cuts in; an equal one waits up to 1.2 s; a smaller one is dropped.
  - **The crowd:** up to three shouts at once, panned across the stands.
  - **The players:** one line at a time each.
  - **Lines:** picked per moment, tier (ordinary, good, huge) and tag (`rival:cass`). No line repeats until its pool has gone round.
  - **Stingers:** the dunk's name, the rival's name or the judges' number is spoken right after the line ("Hand me a new mic, this one's melted! … The windmill!").
- **`VoiceKit`** plays the cues through SoundKit's context:
  - one bank per voice per event group, fetched when the mode loads and never awaited;
  - clips decoded on demand at 24 kHz into a 64-clip cache;
  - the MCs through the court's own PA: a horn EQ, drive, a compressor, the slap-back off that court's walls, a procedural room;
  - the crowd ducked about 8 dB under the booth;
  - clips scheduled back to back on the audio clock, so slow-mo and hit-stop cannot pull a line apart.
- **`ModeMic`** is the per-run object a mode drives:
  - `say` at a moment, `then` after the booth is free, `crowd` for the stands alone;
  - `hold` / `release` (the dunk's flight is silent from take-off to the iron: WINDOW OPEN and NOW! are the player's);
  - filler and crowd chatter only in dead time;
  - the caption on the HUD (`mic` / `micWho`, read out by the caption bus too);
  - the `MC` toggle: the voice on or off, remembered. The captions stay either way.
- **The moments** (`moments.ts`) are the contract between the modes, the scripts and the tests. Each moment has a word limit set by the game's speech window: a 3PT make has 0.8 s, a dunk's run 1.2 s. The map of every site, with its window: `~/Claude/outbox/finish-release/mic/MAP.md`.

## The scripts

- **Where they live:** `lib/babylon/audio/mic/script/<cast>.json`, 2,221 written lines: 5 MCs × 387 lines, 44 for the sidekick, 162 for the crowd and 80 for the players. On top of that, 118 name stingers per MC (the dunks, the rivals, the numbers 0 to 60) are generated from the game's own vocabulary (`names.ts`).
- **How they were made:** seven writers (one per MC, one for the sidekick, one for the chatter), then three adversarial critics, who made 504 fixes.
- **The rules** (`scriptRules.ts`) are enforced by `scripts.test.ts` on every shipped line:
  - clean: no profanity, even mild, and no violence idiom;
  - original: no real names or borrowed catchphrases;
  - gender-neutral about everyone but the speaker;
  - speakable: no digits, no all-caps words, no markup;
  - every line inside its moment's word limit, and every voice meeting its counts.

## Rebuilding the voices

```
# once: the voice tool, outside the repo
python3.12 -m venv ~/.cache/fel-kokoro/.venv && ~/.cache/fel-kokoro/.venv/bin/pip install kokoro-onnx soundfile
# model.onnx + voices/*.bin from huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX, packed into voices-en.npz

node node_modules/tsx/dist/cli.mjs scripts/mic/merge-drafts.mts <drafts dir> [critiques.json]   # drafts → the shipped scripts
node node_modules/tsx/dist/cli.mjs scripts/mic/build-mic.mts [--only boardwalk,scoop]           # scripts → public/audio/voice/v1
```

- **What the build does:** it renders every line with its character's blended Kokoro voice, trims and levels each clip, encodes it as AAC (32 kbps, the crowd at 24), and packs one bank per voice per group (`<group>.<hash>.bin` plus a `<group>.json` index).
- **The render cache:** clips are cached by text and voice, so a re-render only voices what changed.
- **Recording scripts:** the build also writes one per voice to `~/Claude/outbox/finish-release/mic/recording-scripts/`.

## A real person behind a mic (creator cards)

When the owner's creator card for a voice is signed:
1. Set that cast member's `card.status` to `'signed'` in `cast.ts`.
2. Put their takes at `$MIC_RECORDINGS/<cast id>/<line id>.wav` (or `.aif` / `.m4a`). They record from the recording script, in their own words.
3. Run `build-mic.mts`. Their takes replace the rendered lines id for id; anything not recorded keeps the rendered voice.

A take is never used without a signed card: the build refuses and warns.

## Probe

`scripts/probes/_mic-probe.mts` plays a mode on a fake pad and records the game's actual output (a tap after the limiter) to `~/Claude/outbox/finish-release/mic/probe/<tag>.m4a`. It also logs the mic's log and every bank request.

- Arguments: `MODE=dunk|onevone|threevthree|threepoint|carnival|dunkduel`, `COURT=venice|blossom|orbit|canopy|rooftop`, `SEC=40`.
