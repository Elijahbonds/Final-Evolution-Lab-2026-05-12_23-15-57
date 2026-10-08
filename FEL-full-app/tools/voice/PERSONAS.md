# Voice personas: the brief for each voice (IMPROVE, 2026-10-06)

The owner's decision (2026-10-06): new voices come from a **licensed AI voice service**, any provider. This page is what to
pick or design in that service for each voice in the script (`tools/voice/script/*.csv`, the `voice` column). Each persona is
an **original character**. Pick a stock or designed voice that fits the description; never a voice cloned from a real person,
never a voice described or marketed as "sounds like" someone, never a celebrity preset. Accents are neutral: no regional or
ethnic accent is asked for anywhere. A persona's flavour lives in the words, not in an accent.

**One voice per persona, for all of its lines.** The bank already has every voice rendered offline (Kokoro). New lines in a
new provider voice next to old Kokoro lines would sound like two people. Either re-voice the whole persona (export its
existing lines with `import-voices.mts --export <voice>`, see `README.md`) or keep its new lines on the same provider voice for
good. Record which provider voice ID each persona uses in the table at the bottom, so a later batch matches.

**Two voices have a pending creator card** (`lib/babylon/audio/mic/cast.ts`, `card`): `boardwalk` and `coach`. A real person
may sign to voice them. If one signs, their own takes replace the provider's (`scripts/mic/build-mic.mts` puts a signed card's
recordings first). Until then the provider voice must not imitate that person.

**For every voice:** clean studio read, no music, no effects, no added reverb (the game adds the court PA and the room).
Same mic distance and level across a batch. Export mono or stereo WAV at 24 kHz or more (MP3, M4A, AIFF and FLAC also import).
Name each file by the row's `id`. Keep each line within its row's `max_sec`: the voice lane drops a line that cannot start in
time, so a slow read is a missing line.

| | |
|---|---|
| Pace words | **brisk**: about 3 words a second; **easy**: about 2.5; **slow**: about 2 |
| Delivery column | the row's own note ("hyped, short", "the countdown: even, one per second") overrides the persona's default |

---

## The pages (the Coach's voice): Mirror, Quick Screen, Prove It, movement play

### `coach` · COACH
- **Who:** a calm, exact movement coach who has watched a thousand jumps. Warm, direct, never harsh. One fix at a time, with the
  reason in a few words. Says what was right before what to fix. Never lectures.
- **Voice:** an adult woman, 30s to 40s, mid register, clear and close. Energy low to medium: present, not peppy.
- **Pace:** easy. Commas are real pauses. The countdown is even, one number a second.
- **Heard in:** the Mirror coach (form cues, framing, the movement screen), the Quick Screen, Prove It, the movement-play space
  check and the form reads after a jump. It is in the player's ear, not on a PA.
- **Avoid:** cheerleading, fitness-instructor sing-song, whispering, ASMR closeness.
- **Prove It:** the same voice, a notch brighter: "Go when ready" and "Next up!" are court-side calls. The athlete's name is never
  spoken; it is shown on screen.

## The hoops MCs (one per court, on the PA): Flight Night, Dunk Duel, Downtown 3PT, 1v1, 3v3, Court Carnival

### `boardwalk` · BOARDWALK (Venice Beach, the lead mic)
- **Who:** the streetball hype MC who has worked the beach court for years. Rapid-fire and rhythmic, half-rhyming. Gives
  everyone a nickname on the spot ("the kid", "sneakers"). Pulls the crowd into call-and-response. Roasts the play, never the
  person. His own bits: "Boardwalk approved!", "Tide is coming in!", "Sand in your shoes!".
- **Voice:** an adult man, 30s to 40s, low to mid register, big and raspy-warm. Energy high.
- **Pace:** brisk; punchy stresses, a grin you can hear.
- **Avoid:** imitating any real streetball announcer. A creator card for this mic is pending (see above).

### `unclejune` · UNCLE JUNE (Blossom Park)
- **Who:** a park elder who has called games under the cherry trees since before the players were born. Slow burn, dry wit,
  one-sentence proverbs, a grandparent's warmth. Understated on ordinary plays; truly loses it on a great one. Calls the player
  "sprout".
- **Voice:** an older man, 60s to 70s, low register, warm, a little gravel. Energy low with rare big peaks.
- **Pace:** slow to easy; lets a beat land before the punchline.

### `nova` · NOVA (Orbit)
- **Who:** the arena announcer of a court floating under the stars. Big, crisp, dramatic, with a space-mission vocabulary
  (liftoff, launch window, re-entry, mission control). Calls the player "cadet". Treats a dunk like a launch and a miss like a
  scrubbed mission.
- **Voice:** an adult woman, 30s, mid register, bright and polished arena voice. Energy high and controlled.
- **Pace:** brisk; clean consonants; the drama is in the emphasis, not the volume.

### `moss` · MOSS (Canopy Court)
- **Who:** the forest court's MC. Laid-back and easygoing, full of nature images (roots, branches, birds scattering). Chuckles a
  lot. Hype builds slowly, then a big joyful shout on the best plays. Teases with a grin. Calls the player "friend".
- **Voice:** an adult man, late 20s to 30s, mid register, relaxed and smiling. Energy medium, with joyful peaks.
- **Pace:** easy; a laugh ("ha") is a real, short laugh.

### `velvet` · VELVET (Night Rooftop)
- **Who:** the host of the after-hours rooftop run. A smooth late-night radio voice: calm, cool, jazz-club timing. Savage
  one-liners delivered almost under the breath, the city as her audience ("the skyline saw that"). Rarely raises her voice, so
  when she does it means something.
- **Voice:** an adult woman, 30s to 40s, low register, smooth and close. Energy low and cool.
- **Pace:** easy, with deliberate pauses; never shouted.

### `scoop` · SCOOP (the courtside sidekick, every court)
- **Who:** the stats-and-gossip guy on the second mic. Quick, excitable, a little nerdy. Answers the MC ("Told you!", "Put that
  on a shirt!"), knows every regular, keeps a notebook of who owes who a rematch. Never talks over the MC.
- **Voice:** an adult man, 20s, mid to high register, quick and bright. Energy high, light.
- **Pace:** brisk, the fastest voice on the mic. A `dunk.make` line is followed by the dunk's name in the same breath, so leave
  it open, not final.

## The crowd (short shouts from the stands; the game filters and pans them)

Each is two or three words, shouted from the seats: raw, not studio-polished. A little distance in the read is right.

| Voice | Who | Voice |
|---|---|---|
| `crowd_a` | a front-row regular who has seen everything | woman, 30s, loud, confident |
| `crowd_b` | a big-voiced fan with friends, easily impressed | man, 30s, booming |
| `crowd_c` | a teenager filming everything on a phone | young woman, late teens, excited |
| `crowd_d` | a jolly older fan who heckles with love | man, 60s, hearty |
| `crowd_e` | a hooper waiting for next, judging every play | woman, 20s, sharp |
| `crowd_f` | a visitor who just found the court and cannot believe it | man, 30s, delighted |

## The players (on the court, dry, mid-game)

Short and natural, as if said mid-play. No announcer polish.

| Voice | Who | Voice |
|---|---|---|
| `cass` | dunk rival: never misses, never amazes; steady, dry, a little smug about consistency | man, 20s, flat and even |
| `ty` | dunk rival: power all night; few words, heavy ones | man, 20s, deep, slow |
| `pilot` | dunk rival: reads the room, then takes it; calm and calculating | man, 20s, cool, measured |
| `zo` | dunk rival: here for the highlight, plays to the phones | man, early 20s, playful, quick |
| `stack` | dunk rival: goes for the impossible one first; wild, fearless, laughs at danger | man, early 20s, loud, laughing |
| `hooper_a` | a court regular: confident, chirpy, talks after a bucket | man, 20s, bright |
| `hooper_b` | a court regular: quiet, gritty, a defender first | man, 20s to 30s, low, terse |
| `hooper_c` | a court regular: a sharp-shooter with a quick tongue | woman, 20s, quick, teasing |

## The rooms' hosts

### `bb_host` · DOC VOLT (Brain Brawl)
- **Who:** the quiz-show host with a spark of the mad professor. Quick, bright, warm, fond of a pun, never cruel to a wrong
  answer. Big on the reveal, brisk between beats.
- **Voice:** an adult man, 40s to 50s, mid register, theatrical and crisp. Energy medium-high.
- **Accent:** neutral, like every voice here. The quiz-show flavour is in the words ("splendid", "maths"), not an accent.
- **Pace:** brisk. A landing line (`land.*`) has about 0.7 s before the card appears: the shortest reads in the script.
- **By hand:** his lines live in `lib/babylon/party/brainBrawlLines.ts`; the importer prints what to add there.

### `stoop` · STOOP (the Cypher, dance) and `okta` · PROFESSOR OKTA (the Groove Academy)
No new lines in this script (every one of their moments already has four). For a whole re-voice (`--export stoop` / `okta`):
- **Stoop:** the block-party MC on the front stoop with a mic and a folding chair. Warm, loud, knows everyone, call-and-response.
  An adult man, 30s, mid register, a little gravel, energy high, pace brisk.
- **Okta:** the Academy's mentor. Calm, precise, a little playful; talks about music like a conversation, never lectures. An
  adult man, 40s to 50s, low to mid register, unhurried, energy low to medium, pace easy.

---

## The provider voice used for each persona (fill in when chosen)

| Voice | Provider | Provider voice ID / name | Settings (stability, style, speed) | Licence reference | Date |
|---|---|---|---|---|---|
| coach | | | | | |
| boardwalk | | | | | |
| unclejune | | | | | |
| nova | | | | | |
| moss | | | | | |
| velvet | | | | | |
| scoop | | | | | |
| bb_host | | | | | |
| crowd_a … crowd_f | | | | | |
| cass, ty, pilot, zo, stack | | | | | |
| hooper_a … hooper_c | | | | | |
