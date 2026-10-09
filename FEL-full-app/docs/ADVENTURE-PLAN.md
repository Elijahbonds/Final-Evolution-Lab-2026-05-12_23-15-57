# The Adventure: story mode and a no-guns Battle Royale (plan, 2026-10-06)

**Owner:** "I want to get the story mode built out and the battle royale built out. In the battle royale there's no
guns but we use all of the stuff from the story mode — your avatar, your partner, style, stats, energy, Mirror KH1 —
use autobiography, add rail grinding like from Sonic, Sonic Adventure Battle 2 controls and movement. Matrix combat /
Tekken / Storm combat — Path of Neo x Eragon — magic, Souls-like, Elden Ring — monster slayer. DBZ Kakarot type
movement x Superman Returns flight — have the flight be a thing once you fuse with your partner. Or you can ride your
partner if they can fly."

The Adventure is **one new mode with two faces**: a story you play through a hub and its worlds, and a Battle Royale
fought with exactly the same body, partner, moves, magic and stats. The story builds the toolkit; the BR is that
toolkit with eleven other people holding it. Every system is built once, in the shared core, and used by both.

## The owner's decisions (multiple choice, 2026-10-06)

| Question | Decision |
|---|---|
| What "Mirror KH1" means | **Both.** The Kingdom Hearts 1 *structure* (a hub, worlds you travel between, you and your partner as a party, lock-on action) **and** the app's Mirror camera (real moves power attacks and train stats). |
| The autobiography | The owner **sends the chapters** (Word, PDF or text). They are imported like the Neuro-Mechanic Playbook (docx → JSON) and become story chapters **kept true to the owner**. Until then, placeholders, clearly marked. |
| The partner | **Both, the player's choice:** an evolving creature (Evolution Garden base; flying forms can be ridden) **or** a second built character (a Creator slot). Either one fuses with the player, and **fusion grants flight**. |
| The Battle Royale | **Up to 6 real players** (the existing netd rooms) **plus bots, 12–16 fighters.** Bigger online play later, on a new server. |
| The world | **Both:** a KH1-style hub with separate worlds, **and** one big open world. Hub and worlds first; the open world (streaming) is a later phase; **the BR map is the first large map.** |
| The old stories | **Keep separate.** The Nexus Initiative stays as it is. The Adventure is a new mode. The Circuit's files may be reused as code; the Adventure is its own thing. |
| Build order | **Shared core first** (run, rail grind, flight, riding; lock-on combat; magic; partner and fusion; stats and energy), then the Story Chapter 1 world, then the BR prototype on a map built from the same pieces. |
| Magic | **"A and C":** elements plus mind powers (telekinesis, slow-time), learned through the story, powered by energy, levelling with stats; **and** partner magic: the partner's element is yours, and it grows when you fuse. |
| Phones | Phones 3–4 years old must stay **cool and smooth**. |

## The IP line (strict)

The games and films the owner named are **feel references only**. We take how something *feels to play* and build
our own version of it. **No names, characters, places, logos, music, sound effects, move names, spell names, creature
designs or lifted level designs ship.** The same rule as the Creator ("tools, never characters"). Every placeholder
name in code says `[PLACEHOLDER]` or `[TUNE]` until the owner names it.

| Feel reference | What we take: a feel or a verb | What never ships |
|---|---|---|
| The blue-hedgehog adventure games (SA2) | Momentum running, a spin jump, a homing dash that chains between targets, rails you land on and grind automatically, leaning for speed, hopping between rails | Characters, rings, springs' look, level layouts, music, names |
| The anime brawler with open flight | Free 3D flight: hover, ascend, descend, a dash burst; fights in the air | Characters, power names, energy-attack poses or names |
| The superhero flight film game | High-speed cruise with banked turns and a speed-blur | The character, the suit, the city |
| The bullet-time film and its game | Slow the world while you stay quick; wall runs; telekinesis | Characters, the code-rain look, quotes |
| The 3D fighting series | Input strings (light-light-heavy), launchers, juggles | Character names, move names, the announcer |
| The ninja arena fighter | Dash-cancel, a homing dash to the opponent, air strings after a launch | Characters, jutsu names, the chakra look |
| The dragon-rider book | Elemental magic that costs you, learned as the story goes; a bonded partner that grows | Names, the language, the dragon designs |
| The soulslike games | Stamina, dodge with invulnerability frames, parry, readable tells, bosses with phases | Bosses, items, UI, the death screen |
| KH1 | A hub and worlds, a party of two, lock-on action with a camera that follows the fight | Every character and world, keyblades, gummi ships |
| The monster-slayer games | Big monsters with weak points you lock onto | Monster designs and names |

## The pillars, and the verbs each one adds

**1. Movement.** Run with momentum (speed builds on flats, slopes add to it, a FLOW-style tier raises the top speed);
spin jump; **homing dash** (jump again in the air with a target in front: you snap to it, hit it and bounce off,
so targets chain); **rail grind** in the SA2 style (land on a rail and you grind automatically; lean into a curve
for speed and against it to lose speed and balance; lean and jump to hop to a parallel rail at a switch point; press
attack on a rail for a trick that pays points and energy); **wall run**. Riding a partner on the ground is a mount
with its own speed.

**2. Flight (fused only, or on a flying partner).** Free flight: hover, move in 3D, **ascend and descend**, a
**dash** burst, fight in the air. **Cruise**: hold dash past a threshold and you go high-speed with **banking** turns
and a widened camera. Flight costs energy (fused) or the partner's stamina (riding). It is never available unfused
and on foot.

**3. Lock-on combat.** Lock and circle a target (eight-way while locked); **Storm dash** (dash, and double-tap to
home onto the locked target); **strings** (light/heavy sequences with timing windows, launchers and air strings);
**slow-time** (a mind power: the world slows to about a third while you stay near full speed); **stamina** for every
attack, dodge, sprint and blocked hit; **dodge** with invulnerability frames and a perfect-dodge reward; **guard and
parry** (a press inside the parry window); **bosses with phases** and weak points you lock onto.

**4. Magic.** Elements (fire, water, earth, wind, lightning, ice, light, shadow) learned through the story; mind
powers (telekinesis, slow-time, barrier, foresight); **partner magic**: your element is your partner's, and its
power grows with the fusion tier. Every spell costs energy; four equipped slots.

**5. Partner.** A creature (evolving through stages; later stages can be ridden, the last can fly) **or** a built
character (a Creator slot). It fights beside you as an AI party member, takes a command (follow / engage / guard
me), revives you, **fuses** with you (flight, the partner's element at full power, a look change) and, as a creature,
**carries** you.

**6. Stats and energy.** PRQ is the base (HP and speed through `PrqVitals`, a guest is READY and never penalised);
an **Adventure level**; a **style** (a fighting school blend from `combat/schools.ts`); **HP, stamina, energy, poise**
and a **special** meter.

**7. Mirror (optional, never required).** With the camera on, real punches, kicks, guards and slips (the existing
`lib/pose/fightReader.ts` reads them) charge the **special** faster and give **training XP** to the Adventure's
stats. Everything Mirror charges also charges from normal play, so a player without a camera loses nothing but a
shortcut. Mirror output is labelled estimated engagement, never a measurement (owner rule), and it never writes PRQ.

**8. KH1 structure.** A **hub**; **worlds** reached through gates; each world one chapter (arrive, explore, rails,
story beats, a mid-boss, a boss, a save point, back to the hub). You and your partner are the party.

## Architecture

### The rule that shapes everything: the simulation is pure

Every system is split into a **sim** (plain TypeScript: data in, data out, a fixed step, no Babylon, no DOM, no
clock, no randomness except a seeded one passed in) and a **view** (Babylon: meshes, animation, particles, camera).
Three reasons, each of them load-bearing:

1. **Parallel lanes.** A1, A2 and A3 test their sims headless against fakes built from `contracts.ts`, without each
   other's code or a scene.
2. **The Battle Royale.** Host-authoritative play means one browser runs the sim for everyone and hands it to another
   when the host leaves (netd's authority handover); a pure sim's state is a plain object you can snapshot and send.
3. **The dedicated server later** runs the same sim in Node. Nothing to port.

The shared types live in **`lib/babylon/adventure/contracts.ts`** (pinned by `contracts.test.ts`).

### Folders

```
lib/babylon/adventure/
  contracts.ts            the shared types and tiny pure helpers (this plan's deliverable; frozen in Phase A)
  movement/   A1          ground, air, spin jump, homing dash, wall run, the movement state machine, riding
  rails/      A1          rail maths (arc length, sampling), grind, switch, trick, adapters from existing rails
  flight/     A1          free flight, cruise, the flight gate (fused / flying mount), flight camera hints
  combat/     A2          lock-on, strings, Storm dash, stamina, dodge, guard/parry, damage; monsters/, bosses/
  magic/      A2          spell table, casting, element and mind powers, partner magic
  partner/    A3          partner defs (creature / character), partner AI brain, fusion, evolution, identity
  stats/      A3          derived stats (PRQ, level, school, gear), energy regen, XP and levels, the Mirror hook
  save/       A3          the versioned save: sanitise, cap, migrate, device store, teen rule, server sync later
  host/       A4          AdventureHost (fixed step, system order, bus, clock), input mapper, camera, spatial grid
  world/      A4 → B      world pieces, the sandbox, then the hub and the Chapter 1 world
  story/      B → E       chapter runner, dialogue player, cutscenes, gates and quests
  br/         C → D       zone, loot, bots, match flow, then the net layer
lib/adventure/story/      story DATA (JSON): manuscript (generated), chapters (authored), index
scripts/adventure/        import-autobiography.ts (Phase E)
lib/babylon/modes/AdventureMode.ts      the ModeDefinition (A4), AdventureBRMode.ts (C)
app/dev/adventure/page.tsx              the sandbox (A4, dev only); app/play/adventure (B), app/play/adventure-br (C)
```

### What each module wraps or reuses

| Module | Reuses (read-only imports unless stated) |
|---|---|
| `movement/` | `lib/loco/movement.ts` (`arcadeParamsFromPRQ`: "low PRQ = KH1 base, high PRQ approaches Sonic-tier"), `core/FreeRunCore.ts` (`stepSpeed`, `steerAlpha`, `groundTurnRate`, `gradeDrop`), `core/FreeRunFlow.ts` (`FlowMeter` speed tiers, `REBOUND`), `core/MatrixFocus.ts` (`wallRunAvailableOn`, `wallRunOnAt`), `core/AirControl.ts` (spin momentum), `core/StormCombat.ts` (`DASH` timings), `core/PrqVitals.ts` (`prqSpeedMult`), `EvolutionGarden.MOUNT_SOCKET_BONE` (riding) |
| `rails/` | `core/RailMagnet.ts` (`qualifyRail`, `pickRail`, `nearestOnSegment`: the catch window), `core/GrindManual.ts` (`BalanceChannel`: the lean needle), `core/GroundRide.ts` (`GrindLine`, adapted to `RailSegment`), `modes/rideWorlds.ts` rails (adapter, so the skatepark and slope rails load as an Adventure network), `core/BoardTricks.ts` (trick scoring shape) |
| `flight/` | `core/FlightModel.ts` (`stepFlight`, `levelOut`, `clampFlight`: the banked cruise), `EvolutionGarden.FlightController` (mount stamina pattern), `racing/ArcadeFlight.ts` (camera feel) |
| `combat/` | `core/FightCore.ts` (`resolveStrike`, `FighterState`, `PARRY_WINDOW_MS`), `core/StrikeSystem.ts` (frame data, cancel windows), `core/HordeDynamics.ts` (input buffer, string book, crowd stun), `core/DefenseSystem.ts` (guard impact, substitution), `core/StormCombat.ts` (`XButtonReader`, `LAUNCH_AIR_SEC`), `core/NeoCombatCore.ts` (`EnemyBrain` tells, `SlowMoLatch`, `ComboTracker`), `core/CombatMovement.ts` (eight-way lock circling), `core/EvadeMoves.ts`, `core/DodgeRead.ts`, `core/ComboChain.ts`, `core/MookHealth.ts`, `core/OnslaughtCore.ts` (`aoeTargets`, `DownRevive`), `core/MobSteering.ts` (monster presets), `core/RivalCombatBrain.ts` (BR bots, rivals), `core/FighterStyle.ts` (`ratingsFrom`, `ROUTES`, `routeFor`), `combat/{schools,loadout,arsenal}.ts` |
| `magic/` | `core/ResourceMeter.ts` (energy tuning), `core/MatrixFocus.ts` (`FocusMeter`: slow-time), `NeoCombatCore.SlowMoLatch`, `OnslaughtCore.inArc`/`aoeTargets` (spell shapes), `FusionColosseum.COMPANION_MOVES` (`hitType: 'cast'` precedent) |
| `partner/` | `core/EvolutionGarden.ts` (`SPECIES`, `Companion`, `trainFromEvent`, `GardenEventBus`), `FusionColosseum.evolutionBranch` (its `fuse` is companion + companion and is **not** the player fusion), `core/PlayerSlot.ts` `ControlSource` shape and KarateEndless's partner AI pattern, `OnslaughtCore.DownRevive`, `core/playerIdentity.ts` + `lib/creator/look/slots.ts` (`readSlots`, `slotFace`; the closet's `?for=slots`) for a character partner |
| `stats/` | `lib/prq.ts`, `core/PrqVitals.ts` (`prqMaxHp`, `prqSpeedMult`, guest = READY), `core/FighterStyle.ts` (`ratingsFrom`), `combat/schools.ts` (`StyleBlend`), `lib/player-level.ts` (curve shape), `lib/pose/fightReader.ts` + `combat/bodyFight.ts` + `ModeContext.body()` / `onBody` (the Mirror hook) |
| `save/` | The Creator doc pattern (`lib/creator/look/*`: versioned, sanitised, size-capped), `lib/creator/lookPrivacy.ts` (`decideLookHold`) and `lib/age/ageRules.ts` (the teen rule), `lib/story-economy.ts` (`awardCredits` with a dedupe key) |
| `story/` | `core/StoryHub.ts` (`GateSystem`, `WorldGate`, `QuestDef`, `validateQuestManifest`), `core/RivalCircuit.ts` (the beat format), `lib/cinematic/timeline.ts` (`CinematicPlayer`), `core/captions.ts`, `audio/voice/*` (`voiceQueue`, `ttsVoice`, `bakedLine`), `core/StoryProgression.ts` (`biasForGrade`) |
| `world/` | `core/NavBounds.ts`, `visual/VenueProps` (thin instances), `public/models/maps/*.glb`, `public/models/story-hub.glb` (never loaded today), `scene/QualityTier.ts` |
| `br/` | `server/netd` (`MAX_PLAYERS = 6`, authority handover), `lib/net/{NetSession,NetClock,NetdTransport,protocol,attach}.ts`, the KarateEndless partner seat (`?net=`), `OnslaughtCore.DownRevive` (duos), `RivalCombatBrain` + `MobSteering` (bots) |

Nothing in Phase A edits these files. A lane that needs an export a core file lacks routes it (`docs/LANES.md` §3).

### How a mode hosts it

**No new harness.** `ModeHarness` (movement-play's file) already gives a mode its scene, quality tier, camera
director, input bus, PerfGovernor pacing, result sink, `body()` for the Mirror and the player ring. The Adventure is
an ordinary `ModeDefinition`, `lib/babylon/modes/AdventureMode.ts`, and inside it one **`AdventureHost`**
(`host/AdventureHost.ts`, A4):

- `load(ctx)`: build the world from pieces, spawn the player through `CharacterLibrary.spawn` (the identity layer
  dresses them), spawn the partner (a creature body, or the partner's Creator slot through the identity layer),
  load the save, create the systems.
- `onInput(ctx, e)`: `host/inputMap.ts` turns `FelInput` into a `MoveInput` for the local player.
- `update(ctx, dt)`: accumulate into a **fixed 60 Hz step**, and per step run the systems in this order:
  **input → partner brain (A3) → movement (A1) → combat and magic (A2) → stats (A3) → events**, then sync views once
  per frame. Slow-time and hit-stop arrive as `time:scale` events; only the host owns the clock.
- `onBody(ctx, ev)`: the Mirror hook (A3). Returns false when the Mirror is off, so the event is not counted.
- `ctx.stamina(v)` drives the player ring from the stamina pool; `ctx.setHud` carries HP, energy, special, lock.
- Story mode is continuous (`ctx.card`, never a cold remount per fight). A chapter's end posts a result.

**Field ownership** (in `contracts.ts`, on `AdventureActor`) is the rule that lets three lanes share one actor: A1
writes position, velocity, facing and the movement state; A2 writes HP, poise, stamina, lock, stun, i-frames and
impulses; A3 writes every max, energy regen, special, level, element, fusion. A4 adds a test that steps all three
systems and fails if any wrote a field it does not own.

**Contracts v2 (A4, 2026-10-06)** applied the Phase A lanes' requests, all optional: A1 also writes `spinning`, clears
`impulse` and `warp` after applying them, and never moves a fused partner; A2 also writes `moveLockSec` (A1 carries the
body without steering while it is > 0), `warp` (a substitution's spot), `maxSpeed` (a monster's exact preset) and the hp
a `revive` restores; A3 also owns a fused partner's `pos`/`vel` and the energy a rail trick pays; the spawner sets
`canFly`. New events: `telegraph`, `revive`; `rail:trick` carries `energy`. `LAUNCH_GRAVITY` is the one gravity a launched
body falls at. `time:scale` semantics are written down (one request per `byId`, the slowest wins, a cancel is
`sec: 0, world: 1, self: 1`, `world: 0, self: 0` is a hit-stop) and systems receive the unscaled dt. The table is
`ACTOR_FIELD_OWNERS` in `contracts.ts`; `host/ownership.test.ts` holds every system to it.

### Default controls (A4's mapper; every one rebindable)

| Pad | Keyboard | Ground | Air | Rail | Flight | Locked |
|---|---|---|---|---|---|---|
| L stick | WASD | run | drift | lean | move | circle |
| A | Space | jump | spin jump / homing dash | hop off (with lean: switch) | ascend (held) | jump |
| B | Shift | dash; hold = sprint | air dash | — | burst; hold = cruise | dodge; double-tap = homing dash to target |
| X / Y | J / K | light / heavy | air light / heavy | trick | light / heavy | strings |
| R1 | Q | lock on/off | — | — | lock | flick R stick = switch |
| L1 | E (held) | guard / parry | — | — | descend (held) | guard / parry |
| R2 | F | cast; with D-pad = pick slot | cast | cast | cast | cast |
| L2 | R (held) | slow-time | slow-time | slow-time | slow-time | slow-time |
| D-pad up / down | 1 / 2 | partner command / fuse, mount | | | unfuse / dismount | |

Touch: a stick, jump, dash, attack, and a radial for lock, magic, partner and fuse. Touch is the phone default, so
the radial is designed first, not last.

### Performance budgets (cooperating with PerfGovernor)

The phone ceiling is `lib/babylon/config/mobileBudget.json`: 600 draws, 400 active meshes, **16 skinned bodies**, 256
MB textures, 1,500 particles. Karate already reaches 22 bodies, so the Adventure plans below the ceiling, not at it.

| Budget | Phone (`QualityTier` 'mobile', 30 fps cap) | Desktop (60 fps) |
|---|---|---|
| Skinned bodies, story | ≤ 12 (player, partner, ≤ 10 enemies or a boss + 6) | ≤ 24 |
| Skinned bodies, BR | ≤ 16 in the scene (12 fighters + ≤ 4 summoned partners) | ≤ 24 (16 fighters + 8) |
| Full animation radius | 30 m | 60 m |
| Reduced (anim every 3rd frame, no shadow) | 30–55 m | 60–110 m |
| Impostor (frozen pose or billboard) | 55–90 m | 110–180 m |
| Culled | > 90 m | > 180 m |
| Always full, any distance | the player, the partner, the lock target, a boss | same |
| Draw calls / active meshes | ≤ 450 / ≤ 300 (75% of the ceiling) | ≤ 1,200 / ≤ 700 |
| Particles | ≤ 900, spell VFX pooled | ≤ 1,500 |
| Shadows | the player, the partner, a boss | all full-radius bodies |
| Physics | the sim is kinematic (no Havok per actor); Havok only for props, if at all | same |

- `host/BodyBudget.ts` (A4) gives every actor a fidelity each half-second by distance and priority. PerfGovernor
  levels 3 and 4 shrink the full radius by 30% and the body cap by 25%; ThermalWatch's hot verdict does the same.
- Spell and hit particles come from a pooled emitter set, scaled by the governor's `particles` lever.
- Every phase that adds content measures with `scripts/probes/_perf-sweep.mts` and adds or updates an `adventure`
  (and later `adventure-br`) row in `mobileBudget.json`.

## Data and saves

**One versioned document, device first.** `AdventureSave` (in `contracts.ts`, `version: 1`) holds the Adventure
level and XP, style, known and equipped spells, adventure stat training, the partner (`PartnerDef`), story progress
(chapter, beat, flags, worlds, cleared bosses, checkpoint), BR record and settings. It follows the Creator doc's
pattern: versioned, sanitised on every read, **size-capped at 48 KB**, with a migration step per version.

| What | Where | Phase |
|---|---|---|
| The save document | Device: `localStorage` key `fel.adventure.save.v1`, every access in try/catch, the page works without it | A3 |
| The save, signed in and adult | Server: a new additive table (below), the same document as JSON | B (owner's step) |
| Teens (under 18 or unknown age) | **Device only**, never uploaded, exactly as the Creator (`TEEN_DEVICE_LOOK_EVERYWHERE`) | A3 |
| A character partner's look | The player's own Creator slot (`face.creatorSlots`), read through the identity layer; the save holds only the slot id | A3 |
| Lab Credits | `awardCredits` with dedupe keys `adventure:<chapterId>` and `adventure:boss:<bossId>`, so a reward pays once | B |
| Account XP | The normal session result, mode `adventure` (econ-harden owns `app/api/sessions/*`; B routes the score rule) | B |
| PRQ | **Read only.** The Adventure never writes PRQ. Its own training lives in the save. | all |

**The Prisma change is the owner's step.** Phase B's PR carries pending, additive SQL for one table and a rollback
line, and nothing else; no lane runs `migrate` or `db push`.

```sql
-- pending (owner applies, docs/LANES.md §4): additive only
CREATE TABLE "AdventureSave" (
  "userId"    TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "version"   INTEGER NOT NULL,
  "doc"       JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- rollback: DROP TABLE "AdventureSave";
```

Until it lands, the device save is the save, and a signed-in player's progress stays on that device.

## Story

### The autobiography pipeline (Phase E; the format is fixed now so Phase B's placeholders match it)

1. **Import, faithful and mechanical.** `scripts/adventure/import-autobiography.ts <file>` reads `.docx` (unzip
   `word/document.xml`, as `scripts/education/import-playbook.ts` does), `.txt` or `.md`. PDF: the owner exports it to
   `.docx` or text, or the script calls `pdftotext` when it is installed; **no new dependency**. Output:
   `lib/adventure/story/manuscript/<nn>-<slug>.json`: the chapter's headings and paragraphs with stable ids
   (`p001`…) and a source hash. Generated; never hand-edited; re-run after every revision.
2. **Adapt, traceably.** `lib/adventure/story/chapters/<nn>-<slug>.json` is authored (by an agent, then the owner's
   review): the chapter's world, its beats (`cutscene`, `dialogue`, `objective`, `fight`, `boss`, `travel`,
   `choice`) and its lines. **Every line drawn from the book carries `sourceRef: "p012"`**, so "true to the owner" is
   checkable: a test fails when a `sourceRef` points at nothing, or when a chapter marked from the book has no
   `sourceRef` at all.
3. **Placeholders.** Until the text arrives, chapters carry `placeholder: true`, their titles start
   `[PLACEHOLDER]`, and the dialogue box shows a PLACEHOLDER tag on screen. A test fails if a placeholder chapter
   loses either mark.
4. `lib/adventure/story/index.json` orders chapters and maps each to a world.

### The dialogue and cutscene player (Phase B, `story/`)

- **Dialogue** (`story/dialogue.ts`, pure): a line queue with speaker, text, an optional voice, and auto-advance
  timing (about 2.8 words a second, at least 1.2 s), tap to finish a line, hold to skip a scene; choices for the
  rare branch. A small React overlay draws the box and portrait (`components/adventure/DialogueBox.tsx`).
- **Cutscenes** (`story/cutscene.ts`): `CinematicPlayer` from `lib/cinematic/timeline.ts` runs the camera track;
  its beats (`id: 'line'`, `payload: <lineId>`) drive the dialogue, clips and partner moves. The sim pauses; the
  camera hint is `cutscene`.
- **Captions** go through `core/captions.ts` as `critical`, always. **Voice** goes through `audio/voice/voiceQueue`:
  TTS (`ttsVoice`) for placeholders, recorded lines (`bakedLine`) when the owner records them.

## The Battle Royale

**Shape.** 12–16 fighters: **up to 6 humans** in a netd room (`MAX_PLAYERS = 6`) and **bots** to fill. A *fighter*
is one avatar. **Solos**: each fighter's partner travels bonded: it appears when summoned (one assist of about 8 s on
a cooldown, at most 4 summoned in the match at once, which is the body budget) and otherwise lives in your fusion and
your element. **Duos**: two fighters per team; the second seat is a friend or **your partner as a full fighter**
(the partner seat, as in KarateEndless). Downed duo members bleed out and can be revived (`DownRevive`).

**No guns. Loot is power:**

| Loot | Examples | Lasts |
|---|---|---|
| Abilities | a second homing chain, a longer cruise, a rail magnet, a wall-run extension | the match |
| Spells | element scrolls and mind-power scrolls, into the four slots | the match |
| Partner-evolution shards | push your partner a stage for the match (a ground mount becomes a flyer) | the match |
| Gear | melee weapons from `combat/arsenal.ts` (fists, blade, staff, gauntlet), armour (HP, poise), charms (energy regen), boots (speed) | the match |

Nothing found in a match carries out of it. Rewards at the end (XP, LC) go through the session route and its caps.

**The zone.** A shrinking circle in five phases (wait, shrink, wait…), damage per second rising each phase, plus a
**ceiling** that comes down with it so flight cannot hide above the storm. Zone damage is a `DamageEvent` with
`source: 'zone'`.

**The map.** Built from the same world pieces as the story: 64 m pieces on a grid, the first BR map about
**320 × 320 m** (5 × 5 pieces) for 12–16 fighters, with rail loops between landmarks so traversal is a weapon.
Fused flight and rails make it feel bigger than it is.

**Netplay (Phase D).** Host-authoritative, on netd as it is today: the host's browser runs the pure sim (players,
partners, bots, zone, loot) at 60 Hz and sends snapshots at netd's 30 Hz tick (`TICK_HZ`); peers send `MoveInput`
packed into a bitfield plus two quantised sticks. At 16 actors × about 24 bytes × 30 Hz that is about 12 KB/s per
peer. When the host leaves, netd hands authority to another peer, who continues from the last snapshot (the sim's
state is plain data). The Adventure's messages ride the existing `Transport` as one additive message type; the
protocol file is shared, so the change is routed. Bots run on the host; a phone in the lobby never hosts when a
desktop is present.

**What a dedicated server would add (later, not planned in detail).** The same sim in Node as the authority (no
host advantage, no handover hitch), interest management (send each peer only what is near it), more than 6 humans
per match, rooms that survive any player leaving, a shared room store (Redis or Firestore, the gap netd already
names), matchmaking, server-side validation against cheating. It needs an always-on service and its cost: an owner
decision.

## The open world (Phase F)

**Later**, but **built for now**, so nothing has to be torn up:

- Content is authored as **world pieces** (`world/pieces/*`): a 64 m footprint, its meshes (a GLB or a procedural
  builder), its rails, walls, spawns, nav polygons and LOD levels, all in local coordinates. The hub, the worlds and
  the BR map are made of pieces; the open world is the same pieces on a much bigger grid.
- Systems see the world only through `AdventureWorld` (`groundY`, `rails`, `walls`, `near`, `clear`). Nothing assumes
  one arena; nothing caches global mesh lists.
- Saves record a checkpoint as `{ worldId, spawnId }`, never raw coordinates.
- `host/` keeps a spatial grid for `near()`; it becomes the streaming index.
- Phase F adds: chunk streaming (256 m chunks of pieces; a 1-chunk ring loaded on a phone, 2 on desktop; async
  `AssetContainer` loads and disposal), terrain height tiles, LOD and impostors for far landmarks, a floating origin,
  and a cruise speed matched to streaming (40 m/s crosses a 256 m chunk in 6.4 s, so a chunk must load in under 3 s).

## Phases

Each phase is shippable and testable, and lands as a PR into `lane/finish-release` that the owner merges. Tuned
numbers in this plan are **starting values, marked [TUNE]**; every lane flags what it chose.

| Phase | Delivers | Done when |
|---|---|---|
| **0. Plan and contracts** (this commit) | This plan; `lib/babylon/adventure/contracts.ts` and its test | tsc clean; the contracts test green |
| **A1. Movement, rails, flight, riding** | The traversal sims and their views (below) | Its tests green; a headless run of a scripted course |
| **A2. Combat, magic, monsters, bosses** | The fight sims and their views (below) | Its tests green; a headless fight to a boss's last phase |
| **A3. Partner, fusion, stats, energy, saves, Mirror hook** | The party and progression sims (below) | Its tests green; a save round-trips; a teen's never leaves the device |
| **A4. Integration sandbox** | `host/`, the input mapper, the camera, `BodyBudget`, the sandbox world, `AdventureMode`, `/dev/adventure` | Run, grind, fly fused, ride, lock, fight, cast and fuse in one scene on a phone at 30 fps; the field-ownership test green; a perf row |
| **B. The hub and the Chapter 1 world** (placeholder story) | The hub with gates; World 1 from pieces; the dialogue and cutscene player; placeholder chapter 1 data; the device save as the save; the pending SQL for the server save; `/play/adventure` (unlisted until the owner says) | Chapter 1 played start to finish on a phone; the PLACEHOLDER marks visible |
| **C. The BR prototype, with bots** | `br/`: zone, loot tables, bot brain, match flow, the first 320 m map from pieces; `AdventureBRMode`; solos and duos offline | A full 12-fighter match on a phone within budget |
| **D. The BR online, 6 humans** | The net layer over netd (input packing, snapshots, interpolation, host handover), lobbies, bots filling | 6 real devices finish a match; a host leaving does not end it |
| **E. The autobiography** | `import-autobiography.ts`, the manuscript JSON, chapters 2–N adapted with `sourceRef`s, the owner's review | Every chapter's lines trace to the manuscript; placeholders gone |
| **F. The open world** | Streaming chunks, terrain, LOD, floating origin | Cruise across the map on a phone without a hitch |

## The Phase A lane split

Three lanes, three disjoint file sets. Each branch is cut from `lane/adventure` after this commit (so it has the
contracts) and opens its own PR. **assumption:** each lane's PR waits for this plan's PR to merge, then merges
`origin/lane/finish-release` before it opens.

**Shared files in Phase A.** `contracts.ts` is **frozen**: a lane that needs a change writes `contract request:` with
the field in its PR body, and A4 applies it (new fields are optional). Existing `core/`, `combat/`, `lib/prq.ts` and
the rest are **read-only imports**. No Phase A lane edits a file outside its folders, so the three PRs cannot
conflict. A missing export in a core file is routed to its holder (`docs/LANES.md` §3), never edited in place.

### A1: movement, rails, flight, riding (`lane/adventure-a1`)

- **Owns:** `lib/babylon/adventure/movement/**`, `lib/babylon/adventure/rails/**`, `lib/babylon/adventure/flight/**`.
- **Builds:** `movement/state.ts` (the `MovementState` machine, sole writer of `state`, reads `stunSec`, `hp`,
  `ridingId`, `wantsFlight`), `movement/ground.ts` (momentum run; [TUNE] jog 6 m/s, run 9, a FLOW-tier top of 14;
  slopes add gravity along the ground), `movement/air.ts` (spin jump, air dash), `movement/homing.ts` (candidates in
  a 45° cone within 9 m with line of sight, a 22 m/s snap, a bounce that chains), `movement/wallrun.ts`
  (`MatrixFocus` walls), `movement/riding.ts` (mount, dismount, the mount's speed from `PartnerDef`), `rails/railMath.ts`
  (arc length, sample position and tangent, Catmull-Rom for `smooth`), `rails/grind.ts` (auto-catch on landing inside
  `RailMagnet`'s window; lean with the curve +3 m/s², against it −4 m/s² and the `BalanceChannel` needle; a switch only
  inside its window; a trick for points and 4 energy; [TUNE] a 24 m/s rail top speed), `rails/adapters.ts`
  (`GrindLine` and `rideWorlds` rails → `RailNetwork`), `flight/free.ts` and `flight/cruise.ts` ([TUNE] free 14 m/s,
  ascend 8, descend 10, a 30 m/s dash for 0.35 s, cruise from 18 to 40 m/s, a 60° bank; energy 4/s free, 8/s cruise,
  10 a dash; at zero energy you glide down), `flight/gate.ts` (`flightSourceOf`), `movement/index.ts`
  (`createMovementSystem(opts): AdventureSystem`), and the views (`*/view.ts`: animation states through
  `CharacterAnimator` read-only, rail sparks, speed lines, camera hints `grind`, `flight`, `cruise`, `ride`).
- **Tests** (`*.test.ts` beside each file): the momentum curve and slope gain; the spin jump's apex; homing picks the
  nearest target in the cone, ignores one behind a wall and chains three; the wall run ends on time; every state
  transition, including `stunned` and `ko` from A2's fields; rail sampling against `polylineLength`; auto-catch only
  inside the window; lean gain and loss; a switch outside its window does nothing; the `rideWorlds` rails adapt and
  pass `validateRailNetwork`; flight refused unfused and on foot; a forced glide at zero energy; the ceiling clamp; a
  scripted 30 s course run headless with no NaN.
- **Hands to A4:** `createMovementSystem({ mountCanFly })`, `DEFAULT_FLIGHT: FlightParams`, `rails/railMath` for the
  world builders, and the view binders.

### A2: combat, magic, monsters, bosses (`lane/adventure-a2`)

- **Owns:** `lib/babylon/adventure/combat/**` (including `combat/monsters/` and `combat/bosses/`),
  `lib/babylon/adventure/magic/**`.
- **Builds:** `combat/lock.ts` (pick by distance, screen-centre and line of sight; switch with a stick flick; break
  past 25 m or out of sight for 1 s), `combat/stamina.ts` ([TUNE] 100 max from A3; light 10, heavy 22, dodge 18,
  sprint 8/s, a blocked hit 0.6 × its damage; regen 35/s after a 0.6 s pause; guard breaks at zero),
  `combat/strings.ts` (light/heavy strings from `FighterStyle.ROUTES` and `HordeDynamics`' buffer; launchers and air
  strings from `StormCombat`), `combat/dash.ts` (Storm dash and the homing dash to the lock), `combat/defense.ts`
  (dodge i-frames from `EvadeMoves`, perfect dodge from `DodgeRead`, guard and parry from `FightCore` and
  `DefenseSystem`), `combat/damage.ts` (builds and applies `DamageEvent`, `elementMultiplier`, emits `ko` once),
  `combat/monsters/` (five archetypes on `MobSteering` presets with `EnemyBrain` tells of at least 0.35 s: brute,
  skitter, caster, flyer, swarm), `combat/bosses/` (`BossDef`: phases by HP thresholds, i-frames and a camera beat at
  each change, weak points as `LockTarget.part`; one placeholder boss), `magic/spells.ts` (a starter table: one bolt
  per element, telekinesis, slow-time, barrier, foresight, all `[PLACEHOLDER]` names), `magic/cast.ts` (cast time,
  energy, cooldowns, the shapes), `magic/mind.ts` (telekinesis grab and throw, slow-time through `time:scale` [TUNE]
  world 0.32, self 0.92, as `MatrixFocus`), `magic/partner.ts` (partner spells take `PartnerDef.element` and scale
  with `FusionState.tier`), `combat/index.ts` and `magic/index.ts` (`createCombatSystem`, `createMagicSystem`), and
  the views (hit flashes and hit-stop through the harness's juice, pooled spell VFX within the particle budget, the
  lock reticle, camera hints `lock` and `boss`).
- **Tests:** lock picking, switching and breaking; every stamina cost and the regen pause; a guard break at zero; a
  string completes only inside its window; the homing dash lands on the lock; a parry inside 160 ms is `parried`, at
  170 ms is not; a dodge's i-frames give `dodged`; element multipliers reach the damage; slow-time drains energy and
  emits `time:scale`; a spell is refused when energy is short (no half-casts); every monster's tell is readable; a
  boss changes phase at its thresholds once each, invulnerable during the change; `ko` fires once.
- **Hands to A4:** `createCombatSystem()`, `createMagicSystem({ spells })`, the monster and boss defs, the view
  binders.

### A3: partner, fusion, stats, energy, saves, the Mirror hook (`lane/adventure-a3`)

- **Owns:** `lib/babylon/adventure/partner/**`, `lib/babylon/adventure/stats/**`, `lib/babylon/adventure/save/**`.
- **Builds:** `stats/derive.ts` (`ActorStats` from PRQ attributes and band, level, school and gear; [TUNE] HP =
  `prqMaxHp(100 + 8 × (level − 1), band)`, energy 100 + 4 × (level − 1), stamina max 100 + endurance / 5; a guest is
  READY), `stats/level.ts` (Adventure XP; [TUNE] next level at 100 + 60 × (level − 1), cap 50), `stats/regen.ts`
  (energy regen; `special` filling from damage dealt and taken), `stats/mirror.ts` (a `BodyEvent` from `fightReader`
  becomes `mirror:move`; it charges `special` up to twice as fast and gives training XP with a per-session cap; off by
  default; the same special is reachable without it), `partner/defs.ts` (creature species extending `SPECIES` with an
  element, a rideable and a flyable stage, all `[PLACEHOLDER]`; a character partner from a Creator slot),
  `partner/brain.ts` (the partner AI: follow, engage the player's lock, guard, revive; it **only emits `MoveInput`**,
  so it drives A1 and A2 without importing them), `partner/fusion.ts` (the meter fills from fighting together; fuse
  at full, [TUNE] 30 s plus 10 s per tier; the tier from bond; grants flight; the partner's body hides while fused),
  `partner/evolution.ts` (training from Adventure events through `trainFromEvent`), `partner/identity.ts` (a
  character partner's look from its slot, the device copy for a teen), `save/save.ts` (sanitise, cap at
  `ADVENTURE_SAVE_MAX_BYTES`, migrate), `save/deviceStore.ts` (try/catch around every access), `save/policy.ts` (the
  teen rule: not a verified adult → device only), `partner/index.ts` and `stats/index.ts` (`createPartnerSystem`,
  `createStatsSystem`).
- **Tests:** derived stats per band and level, a guest never below READY; the level curve; energy regen; special
  charges from play alone to full; Mirror charge is faster, capped, and needs the setting on; the partner brain's
  output is a valid `MoveInput` in every situation and it revives a downed player; fusion fills, fuses, times out,
  grants flight, and its tier follows bond; a creature evolves and becomes rideable, then flyable; a character
  partner resolves its slot; a save round-trips, an oversized one is refused, junk is refused, an old version
  migrates; a teen's save makes no network call.
- **Hands to A4:** `createPartnerSystem()`, `createStatsSystem()`, `deriveActorStats()`, `loadAdventureSave()` /
  `storeAdventureSave()`, `mirrorOnBody` for `AdventureMode.onBody`.

### A4: the integration sandbox (`lane/adventure`, after A1–A3 merge)

- **Owns:** `lib/babylon/adventure/host/**`, `lib/babylon/adventure/world/**`, `lib/babylon/adventure/contracts.ts`,
  `lib/babylon/modes/AdventureMode.ts`, `app/dev/adventure/page.tsx`.
- **Shared, additive:** one line in `lib/babylon/modes/registry.ts` (not in `ENABLED_BABYLON_MODES`), an `adventure`
  row in `mobileBudget.json`.
- **Tests:** the fixed-step order; the field-ownership test; a 60 s headless sandbox run (player, partner, six
  monsters, a boss) with no NaN and no stuck state; the input mapper; the BodyBudget fidelity picks.

## Decisions still open for the owner

1. **Names**: the mode's name, the hub's, the worlds', the partner species'. Everything is `[PLACEHOLDER]` until then.
2. **How much of the autobiography ships in the app**, and whether its derived JSON may be committed (the playbook
   keeps 3 paragraphs a section to protect the book). Also: real people in it, by name or renamed?
3. **Creature art**: where creature bodies come from (Meshy, as `story-hub.glb` was; Blender on the Mac; or
   procedural from the Creator's parts), and a **non-humanoid rig** for them (the 22-bone rule covers humanoids).
4. **Adventure level separate from the account level** (recommended, so sports play cannot level the story), or one.
5. **Mirror training XP stays inside the Adventure** (recommended) or ever feeds PRQ.
6. **The server save**: approve the additive `AdventureSave` table in Phase B, or stay device-only longer.
7. **BR rewards**: LC and XP payouts and caps, casual or ranked, any FEL Pro gate.
8. **BR fighters on phones**: 12 on a phone and 16 on desktop, as planned, or 16 everywhere at lower fidelity.
9. **Teens in the online BR**: allowed (others see the default look, since a teen's look never uploads), or offline only.
10. **When flight first unlocks**: **assumption:** the first fusion is the Chapter 1 boss's climax, so flight arrives
    at the end of Chapter 1 and the hub's upper level opens with it.
11. **Where the Adventure lives in the nav**: its own door, or under `/story` beside The Nexus Initiative.

_Sources: the owner's brief and answers (2026-10-06); the read-only recon of the story and BR building blocks
(2026-10-06); `docs/CREATOR-PLAN.md` (house style, teen rule); `docs/STORY_SPINE_DRAFT.md`; `FEL_STORY_MODE_SPEC.md`;
`docs/LANES.md`; `lib/babylon/config/mobileBudget.json`; `lib/babylon/core/PerfMonitor.ts`; `server/netd/src/room.ts`;
`lib/net/protocol.ts`; `lib/babylon/core/ModeHarness.ts`; the modules named in the reuse table._
