# The Sanctuary: the partner's home garden (plan, lane/sanctuary)

**The owner, verbatim (2026-11-25):** "Let's improve the sanctuary to feel like the chao gardens and improve the whole partner
customizable monster partner experience." This is the owner's go for the Sanctuary (it was on hold: "don't start Kaelor or the
Sanctuary without the owner's go"). Recorded in `docs/OWNER-DECISIONS.md` (2026-11-25).

**What "chao gardens" means here: a feel benchmark only**, as every benchmark game is in this repo (`docs/world-concepts/README.md`
§5: "Chao Garden is already renamed the Sanctuary"). We take the *feel*, and nothing else:

- a cozy home garden where your creature partners live, wander and react to you;
- you feed, pet, play with and train them;
- care visibly shapes how they grow and evolve;
- small cosmetic exhibitions, such as races;
- a strong attachment loop: you come back because *they* are there.

Nothing is copied: no name, creature design, art, UI, sound, item name or exact mechanic. The garden is built on our own partner
system (the Evolution Garden's species and stages, the Adventure's partner and its save), from the kits already in the repo.

---

## 1. What exists today (read from the code, 2026-11-25, `lane/finish-release` at `d42217a2`)

| Piece | Where | What it gives the Sanctuary |
|---|---|---|
| Species, stats, stages | `lib/babylon/core/EvolutionGarden.ts` `SPECIES`, `Companion`, `trainFromEvent` | Three placeholder species (cinderpup, strideraptor, gardenite), each with base stats, a **training bias** per play family (court, combat, board, precision, rhythm) and three stage labels. A stage comes at 25 × n training XP. |
| Branch flavour | `lib/babylon/core/FusionColosseum.ts` `evolutionBranch` | The top stat picks a line: War (strength, power), Swift (speed, agility), Sage (the rest). `[TUNE]` names, used by nothing yet. |
| The partner | `lib/babylon/adventure/partner/` (`defs`, `species`, `evolution`, `index`, `brain`, `fusion`) | `PartnerDef` (a creature or a character, a name, an element, 8 attributes, a bond 0..100, moves). Creatures train from Adventure play through the Garden's own bias (`trainCreature`, scaled by `ADVENTURE_TRAINING_SCALE` 0.1) and evolve one stage at a time. Bond sets the fusion tier. |
| The save | `lib/babylon/adventure/save/` | The Adventure save on the device (`fel.adventure.save.v1`), sanitised field by field; the account copy waits on the owner's table (`ADVENTURE_SERVER_SAVE_ENABLED` false). **Story flags** (up to 256, id-safe keys, a number, a boolean or a string of up to 256 characters) already carry the Coast's creature log and quests without a schema change or a version bump. |
| The picker | `components/adventure/PartnerPicker.tsx`, `lib/babylon/adventure/story/party.ts` | First run: a creature (one of the three species) or a character (a Creator slot plus an element), and a name (sanitised). Written to the device save. |
| A partner in a place | `lib/adventure/coast/zonePartner.ts`, `zoneLife.ts`, `CoastZoneMode.ts` | The Coast walks with the save's partner (or a loaned default that is never saved) and keeps it caught up. Its creatures wander near home (`CreatureHerd`, deterministic). |
| The body | `lib/babylon/adventure/world/view.ts` `buildCreatureBody` | A capsule and a sphere in the element's colour, scaled by stage, a flat wing from stage 2. Owned by look-world; the Sanctuary reads it and does not edit it. |
| The BR's partner | `lib/babylon/adventure/br/bond.ts` | A partner as a summon, shards as stages for a match. Not used by the Sanctuary. |
| Kits | `public/models/props/nature/` (Kenney CC0: oak, default and detailed trees, bushes, rocks, grass, a fence), the grass ground texture (`visual/groundTextures`), the `park` backdrop | Enough to dress a 60 × 60 m garden with no new art. |

## 2. What is missing for a great partner experience

1. **A home.** The partner exists only as a follower in fights and walks. There is no place where it simply *lives*.
2. **Care.** Nothing you do *for* the partner exists: no feeding, petting or play. Bond grows only from fights.
3. **Growth you can see.** Training is invisible (a number in the save). The body has one shape per stage, the same for every
   species and every way it was raised. Two players' partners look alike.
4. **It is not yours.** A name at first run, nothing else: no colour, no accessory, no card that shows who it is.
5. **A reason to come back.** No mood that asks for you, no small events to show off a partner you raised.
6. **Doors.** Nothing links the story, the Coast or the picker to a partner's home.

## 3. The design

### 3.1 The space (slice 1)
`/play/sanctuary`, a 60 × 60 m walled garden, laid out after the greybox (`docs/world-concepts/partner-garden-greybox.jpg`):

- **centre:** the feeding plaza (a round stone plaza with a fruit basket);
- **north-west:** a half court with a 10 ft rim (the exhibitions start there later);
- **north-east:** a pond (not walkable: the edge turns you back, as the Coast's water does);
- **east:** a climb wall with ledges (dressing in slice 1; a training spot in slice 3);
- **west:** a sand pit;
- **south:** a rest shelter (where tired creatures sleep) and the gate;
- **fruit trees** around the plaza; **crystals** as glowing procedural shapes.

The player walks it on the Adventure host exactly as on the Coast (movement only: no fights), with the same camera rig, input
mapper and touch deck. Nothing shipped is retuned.

**Who lives there.** Your partner (the save's; a player with no partner yet is offered the existing picker on the spot, and until
then walks with the Coast's loaned default, never saved). Beside it, **residents**: the two Garden species you did not pick, as
hatchlings, so the garden is never empty, and each Coast creature you have **met** comes to visit (the owner's "one partner plus a
creature log (befriend; later phases)"). `assumption:` residents are cared for but do not fight or fuse; only the partner does.

**Garden life** (pure, deterministic, `lib/sanctuary/life.ts`): each creature wanders inside its home area, idles, sits, and
**sleeps** at the shelter when its energy runs low (or at night later). When you come near it **notices you** ("!"): a creature that
likes you runs over and greets you (a hop and a heart), a shy one looks and keeps its distance. Your partner **follows** you when
you call it, and wanders on its own when you let it go.

### 3.2 Care (slice 2)
Walk up to a creature: a card shows its name, its mood and its hearts, and three actions.

- **Feed.** Fruit grows on the garden's trees; walk under a tree to pick what is ripe (a basket of up to 6). Three placeholder
  fruits, by colour (`[PLACEHOLDER]` red, blue and gold), each leaning growth a different way in slice 3. A fed creature eats
  (a chewing bob, crumbs, a heart). A full one turns its head away and nothing is wasted.
- **Pet.** It wiggles; hearts rise. A sleeping creature wakes up happy.
- **Play.** You throw a ball; it runs after it, brings it back and bounces.

**The readout and the rules** (cozy, nothing punishing, nothing random or paid):

- **Mood** 0..100 (shown as a word and a face: happy, content, sleepy, hungry). Care lifts it; it drifts slowly back to "content"
  while you are away. It never drops to sad from neglect alone.
- **Fullness** 0..100: a fruit fills 30; it empties over about 3 hours of real time. Below 30 the creature is hungry and says so.
- **Affinity** (hearts, 0..5 from 0..100): it only grows. Each kind of care has a small cooldown and a daily soft cap, so ten
  minutes of tapping is not worth more than a visit a day. That is what makes the loop an attachment loop and not a grind.
- **Saved** in the Adventure save as one story flag per creature (`sanctuary.c.<id>`, a short string), the Coast log's way: no
  schema, no save version, device only under the save policy.

### 3.3 Growth that shows (slice 3)
- **Care trains.** Each care action becomes a Garden training event through the Garden's own `trainFromEvent`, so each species'
  bias decides what it grows into: the red fruit is `combat` (power), the blue `board` (agility), the gold `precision`
  (mental), play is `court` (speed), and the climb wall (a short timed run with your partner) is `board`. Scaled like the
  Adventure's events (`sanctuary.careTrainScale`), with a daily cap, so a stage takes days of care, not one visit.
- **The branch** is the existing `evolutionBranch` rule: the top stat picks War, Swift or Sage (the code's `[TUNE]` words, shown
  as placeholders).
- **The body shows it.** A new procedural body (`lib/sanctuary/body.ts`, the Sanctuary's own; the shipped placeholder is not
  edited): one silhouette per species (a four-legged pup, a two-legged strider, a round sprout), eyes, and per stage more size
  and longer limbs. Per branch: **War** grows horns and mass, **Swift** longer legs, ears or fins and bigger wings, **Sage** a
  glowing crest. All code on primitives, no new art.
- **Care moves the bond** (the fusion tier) behind its own switch.

### 3.4 Make it yours (slice 4)
- **The name**, editable on the card (the jersey-name sanitiser, as the picker uses).
- **A tint** from a short list, and **accessories** built from primitives (a scarf, a bow, a cap, a bell). Every one is free and
  chosen, never random or bought; some open with affinity (a heart count), none with money.
- **The partner card**: the body in a small turntable, the name, species, stage, branch, hearts, the top three stats and the days
  together. Shareable later (outward-facing is the owner's).

### 3.5 Garden Exhibitions (slice 5)
Cosmetic runs between partners and residents on a fixed course around the garden (the sand pit, the climb wall, the pond's edge).
The result comes from the creatures' stats and a fixed course: no luck roll, no currency, no XP, no item. A ribbon flag on the
card for a win, and that is all. `[PLACEHOLDER]` "Garden run".

### 3.6 Persistence (slice 6)
Everything above lives in the Adventure save: the partner's growth in `PartnerDef` (as the Adventure already writes it), and the
garden's own state in `sanctuary.*` story flags. A guest's stays on the device; a signed-in player's goes to the account only
when the owner turns the Adventure account save on. **No schema change.** If the flags outgrow the 256-flag cap, the next step is
a `sanctuary` field in the save (a version bump with a migration test), still not a table.

### 3.7 Doors (slice 7)
A "Visit the Sanctuary" door from the Adventure's end card, from the Coast (a gate sign by the Landing), and from the picker's
confirmation ("Meet them at the Sanctuary"). Behind one switch, off until the owner OKs the listing.

---

## 4. The slices, their switches and their bars

Every slice is behind a feel knob (`lib/feel-panel/knobs.ts`, group "Sanctuary"). Off restores the slice before it exactly. The
route stays unlisted (noindex, in no mode list or picker) until the owner OKs the listing.

| # | Slice | Knob(s), shipped value | Ships | The bar |
|---|---|---|---|---|
| 1 | The space | `sanctuary.residentsOn` 1 (residents; 0 = your partner only), `sanctuary.noticeM` 7 (how near a creature notices you) | **ON** at its own unlisted route | Phone rig (390 × 844, DPR 3, CPU ×4 for load, 3 runs a side, interleaved with **tennis** as the control): time to move and p95 frame time within the control's noise; draw calls ≤ 450 and active meshes ≤ 300 (the Adventure's phone budget). Pictures: arrival, the plaza, the pond. Headless: the life sim is deterministic, keeps every creature in its area and out of the pond, and a creature that likes you reaches you. |
| 2 | Care | `sanctuary.careOn` 1, `sanctuary.fruitRegrowSec` 45, `sanctuary.basketMax` 6 | **ON** (no rewards: mood, fullness and affinity live only in the garden) | Headless care sim: a scripted visit (pick, feed, pet, play) moves mood, fullness and affinity the expected way; the save round-trips through the real sanitiser; 1,000 pets in a minute stay under the cap; 3 hours away empties fullness and leaves affinity alone; no key outside `sanctuary.*` changes. Rig: p95 with care running within the slice-1 noise. Picture: hearts over a petted partner. |
| 3 | Growth that shows | `sanctuary.careTrainOn` **0** (care trains the partner's stats and stage), `sanctuary.careTrainScale` 0.1, `sanctuary.careBondOn` **0**, `sanctuary.growthLookOn` 1 (the branch body) | Body **ON**; training and bond **OFF**: they are progression (XP-like), the owner's call | Headless 30-day sim per species × three care diets: stages arrive on the Garden's thresholds, the diet picks the branch, the same inputs replay the same partner, one day can never move more than one stage. Contact sheet: 3 species × 3 stages × 3 branches. |
| 4 | Make it yours | `sanctuary.renameOn` 1, `sanctuary.tintOn` **0**, `sanctuary.accessoriesOn` **0** | Rename and card **ON**; tint and accessories **OFF** (palette and art direction are the owner's) | Save round trip; the sanitiser rejects junk; nothing paid or random (a test walks every unlock and finds only affinity gates). Picture: the card. |
| 5 | Exhibitions | `sanctuary.exhibitionsOn` **0** until measured | ON only when the bar holds | Deterministic race sim (same stats, same result); the save's only change is a `sanctuary.*` ribbon flag; phone p95 during a race within the control's noise. |
| 6 | Persistence | — | with each slice | Save stays under its 48 KB cap with every flag set; corrupt flags read as defaults. |
| 7 | Doors | `sanctuary.doorsOn` **0** | **OFF** until the owner OKs the listing | Every door lands on the garden and back; the every-screen score of `/play/sanctuary` is not below `/play/coast`'s. |

The measuring scripts live in `scripts/probes/sanctuary/`; the headless sims are vitest files beside the code (`lib/sanctuary/`)
and a `scripts/sanctuary-tests.ts` suite (ci-suite finds it).

## 5. Files

New, the lane's: `lib/sanctuary/**` (pure: layout, life, care, growth, save, the page store; Babylon: the garden view and the
body), `lib/babylon/modes/SanctuaryMode.ts`, `app/play/sanctuary/**`, `scripts/sanctuary-tests.ts`, `scripts/probes/sanctuary/**`,
this file. Shared, additive only: `lib/babylon/modes/registry.ts` (one row, not enabled) and its drift test's dev-only list,
`lib/feel-panel/knobs.ts` + `knobs.test.ts` + `docs/FEEL-PANEL.md`, `docs/LANES.md`, `docs/OWNER-DECISIONS.md`, and the per-mode
tables a new mode needs (clip scope, touch verbs, phone budget). Read only: the partner code, the save, the Coast's prop loader,
the shipped creature body. Slice 7 touches the picker and the Coast's and story's end screens, one door each, behind its knob.

## 6. For the owner

**Questions (each has a default the lane takes meanwhile, reversible):**
1. **Names.** "The Sanctuary" (the concept doc's name), the fruits, the mood words, the residents, the branch lines (the code's
   War / Swift / Sage), "Garden run". All `[PLACEHOLDER]` until you name them.
2. **Does care train the partner?** Recommended yes (slice 3 ON): it is what makes care matter. It moves the partner's fight
   stats and stage, so it waits for you. And should care raise the bond (the fusion tier)? Recommended yes, capped per day.
3. **Residents.** The two species you did not pick live there as hatchlings, and Coast creatures you met visit. Recommended as
   built; the alternative is your partner alone until more partners exist.
4. **Tint and accessories.** Which colours and which accessories (slice 4 builds a small set, OFF). Your palette call.
5. **The listing.** When the garden gets its door on Play, Venice, the Coast and the story (slice 7, OFF).
6. **The cast.** Kaelor and the six companions stay proposals; the garden uses the three existing species. Say if you want any
   of the proposals built as partners (that needs art).

**Art the garden would like (not built, no new assets added):** creature bodies (one per species, three stages, rigged for a
walk, eat, sleep and happy cycle), a fruit set, a shelter, a climb wall and a pond edge, care sounds (a crunch, a purr, a chirp),
accessory meshes. Until then everything is code on primitives and the Kenney nature kit.

## 7. Log
- 2026-11-25: plan written (this file). Slices 1 and 2 next.
