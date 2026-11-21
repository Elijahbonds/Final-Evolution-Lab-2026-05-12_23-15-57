# Finishing the story (lane/story, 2026-11-21)

**Owner, 2026-11-21:** "Make sure the story and online play is finished." This lifts the story hold of 2026-11-12 and 2026-11-17
(recorded in `docs/OWNER-DECISIONS.md`). Online play is its own lane; this file is the story.

`assumption:` "the story" is **the Adventure's story** (`/play/adventure`): the one story the game has now, with Venice as its hub
(owner 2026-10-20 "Adventure REPLACES Story"; 2026-11-17 "Venice replaces the plain plaza hub as the Adventure's hub"). The old Story
mode, The Nexus Initiative (`/story`), is retired from the menu but not deleted (deleting it is the owner's call).

`assumption:` "finished" means finished **up to the last chapter that exists**, Chapter 1. Every chapter after it is the owner's
autobiography (ADVENTURE-PLAN Phase E), so it waits on the owner's text.

---

## 1. What the story is today, measured by playing it

How it was measured:
- **Headless, the whole chapter** (`lib/babylon/adventure/story/playthrough.test.ts`, `progress.test.ts`): a scripted player plays
  Chapter 1 through the real input path and every system — the hub, the gate, the rail, the wall run, the homing chain, two camps,
  the mid-boss, a choice, the boss, the first fusion, the flight home.
- **Continue, from every step** (`progress.test.ts`, `scripts/probes/story/resume-sweep.ts`): the chapter's saves are written to a
  device store, read back as a reload reads them, and the chapter is played on from each one.
- **In a browser, the real page** (`scripts/probes/story/story-rig.mts`): the real `/play/adventure` stage (picker, start screen, HUD,
  dialogue box, pause, end card) rendered on a 390 × 844 touch screen, the chapter played by the page's own `?demo=1` script, a
  picture of every screen; and the real Venice hub mode walked to the story gate. The pictures are in the lane's scratch folder; the
  contact sheet is `story-contact-sheet.jpg` there.

**The story, start to finish (Chapter 1, 16 beats):**

| # | Beat | What the player does |
|---|---|---|
| 1 | Home (scene) | The guide and the partner talk: 4 lines |
| 2 | Objective | Step through the first gate in the hub |
| 3 | Travel | Through the gate into World 1 |
| 4 | Dialogue | 2 lines on arrival |
| 5–7 | Objectives | Grind the rail across the gap; run the wall; chain across the chasm (homing dash) |
| 8 | Fight | Clear the camp (40 XP) |
| 9 | Boss | Beat the mid-boss (60 XP) |
| 10 | Scene | The partner's element becomes yours: you learn its bolt |
| 11 | Fight | Clear the second camp (50 XP) |
| 12 | Choice | "Side by side" or "I go first" (saved as a flag; nothing reads it yet) |
| 13 | Boss | Beat the chapter's boss (120 XP) |
| 14 | Scene | The first fusion: fusion and flight unlock |
| 15 | Travel | Fly home across the void |
| 16 | Scene | Home again (100 XP); "Rest. The next gate will wake soon." |

The first time, the player picks a partner (one of three creatures, or a character from their own Creator looks) and sees the
controls. The save is on the device (`fel.adventure.save.v1`), written at every beat and every 30 s; nobody's save goes to the
server yet (that needs the owner's database table).

## 2. Where a player hit a dead end, a placeholder, missing text, a broken link or a crash (measured, before this lane)

| # | What | How it was measured | Before |
|---|---|---|---|
| D1 | **A camp that can never be cleared.** A monster knocked off a camp's edge fell for ever, still alive, so the fight never ended: a soft lock. | Continue sweep: 48 resumes (16 saved steps × 3 seeds) | 3 of 48 never finished: a skitter at y −14,629, a swarm at y −14,246 (and one more), the player standing at the checkpoint for good |
| D2 | **No ending.** The last scene ends straight into the hub with no word that the chapter is over, what it gave you, or what comes next. | Browser rig, the chapter's end | See §2b |
| D3 | **The start screen always says START and Chapter 1's title**, mid-chapter and after it. The resume itself worked. | Browser rig, a reload mid-chapter and after the end | See §2b |
| D4 | **No way out of the page.** The start screen and the pause screen had no link back to Play or Venice. | Browser rig, every link on every screen | See §2b |
| D5 | **No way in.** `/play/adventure` was linked from nowhere; the Play tab's "Story" door opened the old Nexus story. | `lib/babylon/adventure/host/hiddenRoute.test.ts` held it unlinked | 0 doors |
| D6 | **No door from Venice**, the story's hub. | Venice's spots (`lib/adventure/venice/layout.ts`) | 0 doors |
| D7 | **Hub gates that say nothing.** After the chapter, two of the hub's three gates lead nowhere yet; walking into one does nothing and says nothing. | Headless: `runtime.gateAt()` in each | 2 silent gates |
| D8 | **Placeholders everywhere a name goes** (the hub, the guide, the warden, the worlds, the chapter, the bosses, the partner species) and the dialogue box's PLACEHOLDER tag on every line. | `lib/adventure/story/*.json`, the bestiary | By design until the owner names them |
| D9 | **No account reward.** The chapter pays Adventure XP into the save only; no account XP, no Lab Credits. | `app/play/adventure/stage.tsx` `resultSink` does nothing | Owner's decision (money) |

### 2b. The browser rig, before → after

(filled from `story-rig.json`, below in §5)

## 3. What "finished" needs

Sizes: S ≤ 1 day, M 2–4 days, L a week or more. Order is the build order.

| Order | Gap | Kind | Size | State |
|---|---|---|---|---|
| 1 | D1 the camp soft lock | Code | S | **Built** (knob `story.foeFallBack`) |
| 2 | D4 a way out of every screen | Code | S | **Built** |
| 3 | D2 the end card and "to be continued" | Code + owner words | S | **Built**, words `[DRAFT]` |
| 4 | D3 the start screen: START / CONTINUE / EXPLORE THE HUB | Code | S | **Built** (knob `story.startProgress`) |
| 5 | D5 the Play tab's Story door opens the Adventure | Code | S | **Built** (switch `NEXT_PUBLIC_STORY_DOOR=nexus` puts it back) |
| 6 | D6 the story gate in Venice, and the way back to it | Code | M | **Built** (knob `venue.storyDoor`) |
| 7 | D7 a shut gate says so | Code | S | **Built** (knob `story.shutGateLine`) |
| 8 | Continue proof from every step, and the story walk in a browser | Tests | S | **Built** |
| 9 | Names for everything marked `[PLACEHOLDER]` | **Owner** | — | Waiting (list in §4) |
| 10 | Chapter 1's 16 lines, its recap and "to be continued": the real words | **Owner** (or approve the drafts) | — | Waiting |
| 11 | Chapters 2 onward (the autobiography: ADVENTURE-PLAN Phase E) | **Owner** sends the chapters; then code M per chapter (world pieces, encounters, beats) | L | Waiting on the owner |
| 12 | Account XP and Lab Credits for a chapter | **Owner** decides the amounts (money); then code S | S | Waiting |
| 13 | The save on the account, across devices | **Owner** approves the `AdventureSave` table (a database change); then code M | M | Waiting (stop rule: a new table is the owner's) |
| 14 | Creature and boss bodies (today: placeholder shapes); the 3D Art agent's Kaelor, gym and rival models | **Owner / art** (the Grok `.glb` files are not in the repo) | L | Waiting |
| 15 | The story's worlds placed in Venice's zones (VENICE-HUB-PLAN V6: the hub's gates become Venice doors) | Code XL, needs names and art | XL | Later |
| 16 | Retire The Nexus Initiative for good (delete or redirect `/story`) | **Owner** (a deletion) | S | Waiting |
| 17 | Recorded voice for the lines (today: the browser's voice) | **Owner** | — | Waiting |

## 4. What the owner needs to give

**Names** (each is `[PLACEHOLDER]` in the data today):
- the mode's own name (the page says "The Adventure");
- the hub ("The Hub") and its three gates ("World 1", "World 2", "World 3");
- Chapter 1's title ("Chapter 1 — The First Gate");
- the two speakers: "Guide" and "Warden";
- the mid-boss ("Champion"), the boss ("Chapter 1 Warden") and the light spirits on the chain ("Wisp");
- the three partner creatures (cinderpup, strideraptor, gardenite: the Garden's working names);
- the Venice story gate ("The Story Gate").

**Words:**
- Chapter 1's 16 lines (`lib/adventure/story/chapters/01-first-gate.json`), written by an agent as placeholders;
- the end card's recap of Chapter 1 and the "To be continued" line (`[DRAFT]`, in the same file and in `index.json`);
- the autobiography chapters for Chapter 2 onward (Word, PDF or text, as ADVENTURE-PLAN says).

**Decisions:**
- the amounts a chapter pays to the account (XP, Lab Credits), or "none";
- the `AdventureSave` table, so a signed-in adult's story follows them across devices;
- whether The Nexus Initiative (`/story`) is deleted, redirected to the Adventure, or kept by its address (today: kept);
- whether the 3D Art agent's proposals (Kaelor and the four branches, the six companions, the Sanctuary, the rival, the keyframes
  K00–K17) become the story's cast; they are a proposal, not approved, and nothing here uses them.

**Art:** creature and boss bodies; the Grok models as `.glb` with a licence line.

## 5. Built in this lane (phase 2)

(filled in below)
