# Voice lines needed (VOICEOVER lane, 2026-10-06)

The owner asked to polish the voiceovers: they sound robotic, they talk over each other / come late / cut off, they repeat,
and they are hard to hear on a TV or phone. Code fixed the timing, the repetition memory and the mix (see the lane's commits).
**What code cannot fix is the voices themselves.** This file lists every line that is missing or robotic, so the owner can
choose how to voice them.

> **Decided (owner, 2026-10-06): a licensed AI voice service, provider-neutral.** The production script is now
> **`tools/voice/script/*.csv`** (282 lines, one row per line, with persona, delivery, max seconds and the bank target), the
> voice briefs are `tools/voice/PERSONAS.md`, and `tools/voice/import-voices.mts` brings the rendered takes into the bank; the
> five-step workflow is in `tools/voice/README.md`. The lists below are the audit that the script was built from; the script is
> what to render. Every line is written for an original, generic persona; none imitates a real person or uses anyone's
> catchphrase.
>
> **The count grew from ~180 to 282.** The audit below counted a moment's lines without its tags. The game asks a tagged moment
> WITH its tag (a carnival event, a celebration, one side's game point, one player's duel win), and each of those pools held one
> line per MC: the script adds 60 more lines for them (priority P3), and 98 page lines (P1, the Mirror's movement-screen station
> lines and the Quick Screen's move setups included) where this file estimated ~51.

## How a new line gets used

- **A run-time line (sections 1 to 3)** plays the rendered take automatically when the Coach's bank has a line with the
  **same text** (case, punctuation and spacing aside): `lib/babylon/audio/voice/speakNatural.ts` looks it up with
  `VoiceKit.findText`. Add the line to the Coach's script (`lib/babylon/audio/mic/script/coach.json`, a new moment id such
  as `mirror.cue.*`), render, and it replaces the browser voice with no code change. Until then the page speaks it with the
  device's best voice and logs it (`window.__FEL_VOICE_GAPS__`, kind `tts`).
- **A thin moment (section 4)**: add lines to that voice's script with the same `moment` (and `tier` where shown) and
  render. The shuffle bag (`lib/babylon/audio/voice/lineMemory.ts`) uses every new line in its rounds at once. In play, a
  thin pool is logged once as kind `thin`.
- After rendering, run `tools/voice/measure-loudness.py public/audio/voice/v1` on the Mac (it needs `afconvert`). It writes
  each line's measured loudness into the bank index, and the game trims every clip back to the target level.

## Counts

| Where | Mode(s) | Kind | Lines needed |
|---|---|---|---|
| Mirror coach (`app/play/mirror`) | Mirror squat / lunge / press-row | robotic (browser voice) | 37 fixed + 4 built-at-run-time families |
| Quick Screen (`app/play/mirror/assess`) | Mirror assess / Quick Screen | robotic (browser voice) | 12 fixed + 3 families |
| Prove It (`app/play/dunkduel`) | Court session / Prove It | robotic (browser voice) | 2 fixed + 1 family |
| The 5 court MCs (boardwalk, moss, nova, unclejune, velvet) | Flight Night, Dunk Duel, Downtown 3PT, 1v1, 3v3, Court Carnival | thin (2 variants) | 50 (10 moments x 1 more line x 5 MCs) |
| The sidekick (scoop) | the same six hoops modes | thin (1-2 variants) | 25 |
| The quiz host (bb_host) | Brain Brawl | thin (2 variants) | 17 |
| The Coach (coach) | Movement play space check | thin (2 variants) | 6 |
| The crowd (crowd_a..f) | the six hoops modes | thin (1 variant) | 12 |
| The hoopers (hooper_a..c) | 1v1, 3v3 | thin (2 variants) | 9 |
| The rivals (cass, ty, pilot, zo, stack) | Flight Night, Dunk Duel | thin (2 variants) | 10 |
| **Total** | | | **~129 thin top-ups + ~51 run-time lines** |

Every hoops voice, the hosts (Stoop, Professor Okta, the quiz host) and the Coach are **Kokoro renders** (an offline
text-to-speech model; `tools/voice/render-mic.py`). They are not "missing", but they are synthetic, and a provider decision
covers them too. If the owner re-voices in stages, the most-heard lines first: each court MC's `intro.court`,
`filler.banter`, `filler.crowd`, `game.make`, `three.make`, `dunk.make` and the momentum calls; then the hosts.

---

## 1. Mirror coach: spoken by the browser today

Spoken from `app/play/mirror/_components/mirror-harness.tsx` (`speak`). Persona: the Coach, calm, specific, encouraging.

**Fixed lines** (render with exactly this text; source file:line):

| # | Text | Source |
|---|---|---|
| 1 | Press the floor apart with your feet — knees travel out over your second toes. | `lib/babylon/nexus/neuro-mirror/rules/cue-engine.ts:56` |
| 2 | Still drifting. Spread the floor apart with your feet — all the way down, all the way up. | cue-engine.ts:57 |
| 3 | Hold the bottom. Breathe. Own the position before you move again. | cue-engine.ts:58 |
| 4 | Stay heavy on the floor through the whole foot — heels stay down as you sit. | cue-engine.ts:62 |
| 5 | Still lifting. Sit slower and keep the floor under your heels — the depth can wait. | cue-engine.ts:64 |
| 6 | Stop the set. Ankle rocks against the wall, ten each side, then we go again. | cue-engine.ts:65 |
| 7 | Sink straight down the middle, square to the camera — shoulders stay over the centre of your stance. | cue-engine.ts:71 |
| 8 | Still drifting to one side. Slow the descent and press evenly into the ground under both feet. | cue-engine.ts:73 |
| 9 | Hold the top. Reset your stance, breathe twice, then descend only as far as you stay centred. | cue-engine.ts:74 |
| 10 | Fifty-fifty. Don't travel — split the floor between both feet. | cue-engine.ts:77 |
| 11 | You're sliding off centre. Freeze at the bottom — find the middle, then rise. | cue-engine.ts:78 |
| 12 | Stop. Reset your tripod, and give me a half-squat with no travel. | cue-engine.ts:79 |
| 13 | Own the bottom — sit to about chair height, then push the floor away. | cue-engine.ts:83 |
| 14 | Deeper. Slow the way down and sit INTO it — then explode. | cue-engine.ts:84 |
| 15 | Box squat: sit to a chair height, touch, and stand tall. Depth before speed. | cue-engine.ts:85 |
| 16 | Keep the handle's path low — row it to your back pocket, press it straight out at the wall. | cue-engine.ts:92 |
| 17 | Still climbing. Aim the handle at your back pocket on the row, and straight at the wall ahead on the press. | cue-engine.ts:94 |
| 18 | Half speed and a lighter handle — row to your back pocket until the path stays low. | cue-engine.ts:96 |
| 19 | Pull the handle back toward the wall behind you, not up toward the ceiling. | cue-engine.ts:101 |
| 20 | Still riding up. Let the handle pull your arm long first, then row it back to your pocket. | cue-engine.ts:103 |
| 21 | Reset with a lighter handle. Let it hang from a long arm for two seconds, then row. | cue-engine.ts:105 |
| 22 | Stand tall toward the ceiling — shoulders stay stacked over your hips. | cue-engine.ts:111 |
| 23 | Still leaning off to one side. Exhale fully, grow tall toward the ceiling, then go. | cue-engine.ts:113 |
| 24 | Stop. Ninety-ninety breathing, three breaths, then we rebuild the rep. | cue-engine.ts:114 |
| 25 | There it is. Own it. | cue-engine.ts:471 |
| 26 | Step into the shot — I cannot see you yet. | `lib/mirror/framing.ts` (SAY.noBody) |
| 27 | Your feet are out of shot. Tilt the phone down or step back. | framing.ts (cutOffBottom) |
| 28 | Your head is out of shot. Tilt the phone up or step back. | framing.ts (cutOffTop) |
| 29 | Turn and face the camera square-on — I read your knees from the front. | framing.ts (turned) |
| 30 | Step back a couple of paces so your whole body stays in shot when you squat. | framing.ts (tooClose) |
| 31 | Come forward a little — you are far enough away that I am guessing. | framing.ts (tooFar) |
| 32 | Move to the middle of the shot. | framing.ts (offCentre) |
| 33 | More light, or a plainer background — I am losing track of you. | framing.ts (dim) |
| 34 | Sit a little deeper if you can — I count a squat when your hips drop. Shallow ones still count from here, marked shallow. | `lib/mirror/squatStage.ts:164` (DEEPER_LINE) |
| 35 | Square up to the camera — I read your knees from the front. | squatStage.ts:193 (SQUARE_UP_LINE) |
| 36 | Not counted: the camera never saw you land. Keep your feet in the shot and go again. | `lib/irl/dunkTracker.ts:50` (refusalLine) |
| 37 | Not counted: that read over 130 cm, so the camera lost your feet. Go again. | dunkTracker.ts:50 |

**Built at run time** (cannot be one take; suggested split so the fixed part is rendered and only the number is composed
from the Coach's existing number clips, `name:num:*` and `name:unit:*` in `coach.json`):

- The station lines and retest lines from `lib/mirror/screenRunner.ts` (`say`): render each station's fixed instruction;
  keep counts and sides as composed clips.
- The jump progress line (`progressLine`, mirror-harness.tsx:668): "You got up…" + number + "inches." The Coach already
  has `coach.jump.height` and the number clips; a Mirror code change to compose them is a follow-up (mirror-coach lane).
- The press-row and lunge turn lines reuse rows 1–24 and 29.

## 2. Quick Screen: spoken by the browser today

Spoken from `app/play/mirror/assess/_components/use-voice.ts` (the runner's `say`, `lib/assess/runner.ts:374`). Persona: the
Coach.

| # | Text | Source |
|---|---|---|
| 1 | Hold that. | runner.ts:397 |
| 2 | Stand still for two seconds. | runner.ts:430 |
| 3 | Go. | runner.ts:447 |
| 4–6 | 3 / 2 / 1 (the countdown) | runner.ts:448 |
| 7 | Lost you for a moment — trying this move once more. | runner.ts:463 |
| 8 | Face the camera. | `lib/assess/protocol.ts:108` |
| 9 | Turn side-on, right side to the camera. | protocol.ts:109 |
| 10 | Turn side-on, left side to the camera. | protocol.ts:109 |
| 11 | (the tracking-loss prompt) | runner.ts:459, `TRACKING_LOSS_PROMPT` |
| 12 | the framing instructions | the Quick Screen's framing check (same wording family as section 1, rows 26–33) |

Built at run time: the calibration "why" lines (runner.ts:407, :418) and each move's own instruction. Render each move's
instruction as a fixed line.

## 3. Prove It: spoken by the browser today

Spoken from `app/play/dunkduel/_components/prove-it.tsx` through `lib/session-setup/voice.ts`. Persona: the court-session
announcer (warm, quick).

| # | Text | Note |
|---|---|---|
| 1 | Go when ready | fixed (`goWhenReadyLine`) |
| 2 | Next up! | **Decided 2026-10-06:** a recorded "Next up!" and the name shown big on screen; no name is spoken (`cuesAfterDunk`, `NEXT_UP_SPOKEN` in `lib/session-setup/voice.ts`). |
| 3 | `<N> inches, judges <x.y>` | built at run time (`spokenResultLine`; the name is no longer in it). Still the browser voice: composing the numbers from the Coach's number clips is a follow-up. |

## 4. Thin moments: fewer than 3 variants (the "too repetitive" half code cannot fix)

The shuffle bag never repeats a line until a pool has gone round, but a pool of two still alternates the same pair. Each
row: the voice, the moment, how many lines it has, and one or two suggested new lines (original wording, under the moment's
word limit in `lib/babylon/audio/mic/moments.ts`).

### The five court MCs (each needs 1 more line per moment: 50 lines)

Write each in that MC's own voice (persona in `lib/babylon/audio/mic/cast.ts`).

| Moment | Has | Suggested new line (adapt per MC) |
|---|---|---|
| `carnival.tie` | 2 | "Dead even! Neither one blinked." |
| `carnival.handoff` | 2 | "Hand it over. Fresh legs, same stakes." |
| `carnival.runnerup` | 2 | "Second place tonight, and nobody here forgets that run." |
| `dunk.need.ahead` | 2 | "You've got the lead. Two clean dunks and it's yours." |
| `duel.tie` | 2 | "Same score! The judges can't split them." |
| `game.intro.ones` | 2 | "One on one. No help, no excuses. Check it up." |
| `game.intro.threes` | 2 | "Three on three, half court. Call your own fouls, play it clean." |
| `game.point` | 2 | "Game point! Next bucket ends it." |
| `game.draw` | 2 | "All square. Somebody take this one." |
| `three.results` | 2 | "Here's how the racks shook out." |

### The sidekick, scoop (25 lines)

| Moment | Has | Needs | Suggested |
|---|---|---|---|
| `dunk.up` | 1 | 2 | "Here we go, here we go." / "Clear the lane, folks." |
| `dunk.make` tier 0 | 1 | 2 | "That'll count." / "Got it down." |
| `dunk.make` tier 1 | 2 | 1 | "Oh, the judges liked that one." |
| `dunk.fifty` | 2 | 1 | "Perfect! Frame it!" |
| `dunk.miss` | 2 | 1 | "Shake it off. Go again." |
| `dunk.win` | 2 | 1 | "Champion of the night, right there." |
| `dunk.lose` | 1 | 2 | "Tough night. Come back hungry." / "Not this time. Next one's yours." |
| `game.make` | 1 | 2 | "Bucket." / "Count it." |
| `game.block` | 2 | 1 | "Not in this house!" |
| `game.win` | 1 | 2 | "Ballgame!" / "That's the run. Who's next?" |
| `intro.court` | 2 | 1 | "Scoop here, right on the sideline, all night." |
| `filler.crowd` | 2 | 1 | "Back row, I can't hear you!" |
| `momentum.warming` | 1 | 2 | "Something's starting." / "Getting loose now." |
| `momentum.fire` | 2 | 1 | "Can't miss! Somebody guard that!" |
| `momentum.cold` | 1 | 2 | "Rim's not friendly tonight." / "One drop and it turns around." |
| `outro.win` | 2 | 1 | "What a night. Get home safe, everybody." |
| `outro.loss` | 2 | 1 | "Good fight. Run it back soon." |
| `three.fire` | 2 | 1 | "Splash after splash!" |

### The quiz host, bb_host (17 lines; Brain Brawl, `lib/babylon/party/brainBrawlLines.ts`)

One more line each for: `spin.last`, `land.LOGIC`, `land.MEMORY`, `land.COMPUTE`, `land.ANALYZE`, `land.IDENTIFY`,
`memorise`, `right.both`, `wrong.both`, `claim`, `hold`, `stays`, `best`, `solo.done`, `duel.p1`, `duel.p2`, `draw`.
Suggested shapes: "Last spin of the night, make it count." / "Logic round. Think it through." / "Both of you, spot on!" /
"Neither of you got that one." / "That square is yours." / "It's a draw. Shake hands, contestants."

### The Coach (6 lines; movement play's space check, `lib/move/spaceVoice.ts`)

One more each for `coach.space.intro`, `.left`, `.right`, `.feet`, `.arms`, `.still`: "Let's get you set up in the frame." /
"A small step to your left." / "A small step to your right." / "Feet in the picture, please." / "Arms out wide for me." /
"Hold still for just a second."

### The crowd (12 lines: 2 more `crowd.defense` per crowd voice)

"Defense! Defense!" / "Lock him up!" / "Get a hand up!" / "Stay in front!" (each crowd voice in its own persona).

### The hoopers (9 lines: 1 more each for `player.trash.stop`, `player.defense`, `player.check`, per hooper)

"Not today." / "I got him." / "Check it."

### The rivals (10 lines: 1 more each for `player.dunk.jab` and `player.dunk.respect`, per rival)

In each rival's persona (`cast.ts`): a jab ("That all you got?") and a respect line ("Okay. That was real.").

---

_How these were found: the thin pools from the rendered bank indexes (`public/audio/voice/v1/*/*.json`, every moment and
tier with fewer than 3 lines, the dunk-name clips excluded); the browser-voice lines from every `speechSynthesis` caller in
`app/` and `lib/`. The counts change as lines are added; the runtime logs (`window.__FEL_VOICE_GAPS__`) show what a real
session actually hit._
