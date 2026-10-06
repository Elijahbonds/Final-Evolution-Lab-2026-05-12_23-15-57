# Dunk, next: the modern Flight Night

**Owner, 2026-10-06** (after playing Dunk on a TV): *"The dunk game mode needs lots of improvements gameplay wise to feel more
fun. Like the inspirator but better. Like a modern day version that maximized its true potential."*

The inspiration is NBA Live 07/08's dunk contest ("the locked benchmark", `core/DunkSystem.ts:1-16`) and the televised Slam Dunk
Contest. Lane `lane/dunk-next`, branched from `lane/improve-hoops` (its 20 owner-picked items are already in). Paths below are under
`lib/babylon/` unless they say otherwise.

## 1. What is fun today, and what is not

The loop: walk-out → pick style / prop / call on the runway → hold to run → push 1-2 → take-off → air tricks → SLAM on NOW! →
iron, hang, land → triple cut → five judges → the rival's turn → the next dunk.

**Fun now.** The body work is very good: 17 tricks plus the 720, named chains and signatures (`core/DunkSystem.ts:443-479`), a
real slam window with an honest rim (`core/DunkCard.ts:84`), 32 props, the triple cut, the MC, and the free-throw-line dunk.

**Not fun yet:**

| | The problem | Where |
|---|---|---|
| 1 | **The air is a menu, not a performance.** A trick press *arms* the trick, and the mode fires it on its beat and paces its clip to the slam. When you press does not matter as long as it is early. The only timing skill in the flight is one slam press. There is nothing to master between take-off and the rim. | `modes/DunkMode.ts:2571-2620` (`airButton`), `:2673` (`trickRate`), `core/DunkCard.ts:63` (execution is the slam alone) |
| 2 | **The beats are invisible.** The cue table has three beats (RISE 0.3, HANG 0.7, PRE-SLAM 1.0) and the slam at 1.25. You only see them as words in a refusal ("ARM IT BY THE HANG"). Only the slam has a tick. | `core/DunkSystem.ts:184-216`, `modes/DunkMode.ts:2033-2041` |
| 3 | **Originality is barely judged.** The judges remember only an exact `style_prop_tricks` string, and each dunker separately. Throwing your rival's dunk back at him is "fresh". A new idea earns +0.5 difficulty, which saturates and goes unseen, and the crowd does not react to it. | `modes/DunkMode.ts:4022-4024`, `:4331-4341`, `core/DunkCard.ts:59-61` |
| 4 | **A tie is silently the player's.** `cardWon` returns `>=`, so there is no dunk-off: the one moment the event is famous for. | `core/ContinuousNight.ts:44` |
| 5 | **Dead time.** Each rival dunk plays the full pipeline: run-up, flight, landing, triple cut (~2.1 s, +0.9 s poster) and a 5.1 s reveal. That is about 13 s each, four times a night, and you can only hurry the cut and the reveal. | `modes/DunkMode.ts:4396`, `core/DunkCuts.ts:23-29`, `core/JudgePanel.ts:169-186` |
| 6 | **The field is one rival.** The night is you against one rival, 2 rounds of 2 dunks, with no cut and no final, even though five rival bodies exist. | `modes/DunkMode.ts:309,314`, `core/DunkRivals.ts:45-51` |
| 7 | **The runway is a wall of controls.** It has nine inputs (B, X, the d-pad, L1, R1, Y, L2, RT, Y on the run). The idle tips help, but the first jump still carries everything. | `modes/DunkMode.ts:1402-1468` |
| 8 | **Failure is fast but flat.** A miss costs a 1.4 s beat, then you walk back to the start. | `modes/DunkMode.ts:121,3982` |

## 2. The modern version

**Core verbs** (pad / keyboard / touch: the existing map, unchanged):
- **Approach and take-off**: run (RT / hold), steer (L stick), bend the J (Y on the run), one or two feet (L2), take-off spot
  (the stripe is judged). Already expressive. The next win is reading it: the take-off spot on the floor and the foot on the HUD.
- **The air is a four-beat bar: RISE · HANG · PRE · SLAM.** Each beat is heard as a tick on a rising scale (tick, tick, tick,
  NOW!) and seen as a pip on a beat strip. A trick thrown **on a beat** it may fire on is **ON THE BEAT**. Each one pays
  execution, and the judges see it. Every trick on its beat plus an on-time slam is a **PERFECT FLIGHT**: style, the crowd
  erupts, and the strip goes gold. A newcomer can still press early, the trick still fires, and nothing is lost. That keeps the
  game readable for a first-timer and gives a dunker a ceiling: three tricks, three beats, a perfect slam.
- **Hang time is spent, not given.** It stays the run-up's call (air budget, trick capacity). Later: a pump in the hang that
  buys a beat at the cost of the slam window.
- **The finish has risk** (exists): every trick narrows the slam window, an early slam hits iron, and a hold is a rim hang.
- **Originality is judged and cheered.** Every dunk breaks into *elements*: tricks, the chain, the runway trick, the prop,
  the foot, the range, the side, the rim hang. The night remembers who showed each one first. A dunk's **freshness** is
  the share of it nobody has shown tonight. It pays style. The crowd *ooh*s a first-time trick in the air. Copying the other
  dunker is called out and pays nothing.
- **Failure is funny and fast.** A miss is one beat. Later: a skippable blooper replay of a clank and a "SHAKE IT OFF" retry
  straight from the line.

**Structure:**
- **The night builds:** hype carries across dunks (exists). Freshness makes four dunks need four ideas. A tie is settled by
  a **dunk-off**: one dunk each, repeated while tied, and not added to the staked total.
- Next: a **four-dunker field**: round one, a cut to two, the final, with the other two dunkers shown as broadcast highlights.
- **Practice / freestyle** (exists, R1): instant retry, no judges. It gains the beat strip, and **challenges** later: set pieces
  such as "from the stripe", "over five" or "720 off the bounce", with target cards and unlocks.

## 3. Ranked phases (fun gained per effort)

**Status (2026-10-06):** phases 1–7 are built on `lane/dunk-next` (commits name them); the dunk-off is endless (owner decision); staked and ladder nights are the classic night (owner decision). Phase 8 is next.

| # | Phase | Effort | Acceptance |
|---|---|---|---|
| **1 ✓** | **FLIGHT BEATS.** The four-beat bar: audible and visible beats, trick presses graded ON THE BEAT / early / off the beat, flow paying execution, PERFECT FLIGHT, the rival hitting beats when his nerve is clean, a beat-strip HUD, and practice telling you your beats | M | Pure `core/DunkBeats.ts` with vitest: grading per cue window, the tolerance, flow and perfect flight, and the strip encode/decode round trip. `dunkCard` gains optional `beatExec` / `flowStyle` inputs and is byte-for-byte unchanged when they are absent. Wiring scan. Mutation-checked. **TUNED: beat tolerance ±0.08 clip s (× TV factor), +0.4 execution a beat (max +1.2), +1 style for a perfect flight.** |
| **2 ✓** | **ORIGINALITY.** The night's shared element memory, freshness into style, a first-time-tonight banner and crowd *ooh* in the air, copied elements called out, the runway tip naming what is still fresh, and freshness on the judges' why-line | M | Pure `core/DunkOriginality.ts` with vitest: elements, freshness weights, who-showed-first, copy detection, the reset per night. Wired into `finishAttempt` for both dunkers. **TUNED: freshness up to +1.5 style; a copied dunk gets 0.** |
| **3 ✓** | **DUNK-OFF.** A tie after the final plays one dunk each (three attempts, as ever), not added to the staked total. Repeat while tied. **Owner decision 2026-10-06: endless dunk-offs** — from the third, level totals go to the judges' declared tiebreak (EXECUTION, then DIFFICULTY, then STYLE, one criterion more each dunk-off, named before the dunk); a hard safety cap at 12 settles a dead-level one on each dunker's best dunk of the night, then the player — **the cap's last resort is owner-approved (2026-10-06)**. | M | Pure `dunkOffDecide` / `dunkOffVerdict` in `ContinuousNight` with tests (cap, criteria, NaN-safe). The card still holds 4 attempts and the score still equals the card's total, so `arena-score-integrity` is unchanged. Wiring scan. |
| **4 ✓** | **Rival highlights.** A rival dunk can be skipped from his runway to his card (B, the K key, or the host's SKIP chip). `core/DunkRivalSim` judges the plan he is ON (not re-rolled: the live rival rolls the same `rollRivalAttempt`) through the real flight, slam curve, beats, originality, card, panel and stakes, off his last measured take-off; his card comes up as a highlight (named, cheered, the five cards at the hurried rate). Already judged → the cut ends and the reveal hurries. Cuts ~10 s per rival dunk. | M | The sim's card equals what `dunkCard` + `judgeDunk` give for his plan (vitest); the roll equals the old inline plan for the same random stream; B on his runway skips (scan). |
| **5 ✓** | **Four-dunker field + cut + final** (casual nights only — a staked or ladder night is the classic one-rival night: owner 2026-10-06). You + the rival on the floor (live, skippable) + two more as broadcast highlights (`core/DunkRivalSim`), two dunks each; the standings board with the cut line; the top two go to a final on their night totals; a level final goes to the endless dunk-off. Cut → the final plays as highlights and the night card says who won it. | L | Pure `core/DunkField` with vitest (field, strict cut order, highlight nerve, the final-as-highlights loop and its cap, the board's wire format); wiring scan. The card still holds ≤ 4 attempts; a staked card always holds 4 (owner decision below: staked nights are classic). |
| **6 ✓** | **Challenges + unlocks** (fan #19, #11). On the practice runway L1 (Q, or the chip) picks one of six original set pieces — FROM THE STRIPE 40, OVER THREE 42, 720 OFF THE BOUNCE 43, PERFECT FLIGHT WITH A PROP 41, ONE FOOT OFF THE BASELINE 39, TWO ON THE BEAT 44 — and sets up its prop; the next dunk is checked and carded (the contest's card in a neutral room; never the night's). Won nights open a ladder on the device (BOUNCE OOP → IT'S OVER call → OVER FIVE → DUBBLE UP 6–10 → OOP OFF THE BUS; two cleared challenges open the SPLITS call); a locked prop or call is named with what opens it. Courts are not gated (the lobby picks the court). No currency, no payout. | M | Pure `core/DunkChallenges` (table, checker, card; targets reachable clean and not reachable sloppy) and `core/DunkUnlocks` (ladder, never-mutating records, storage that never throws, dev override) with vitest; wiring scan. |
| **7 ✓** | **Take-off read** (owner 2026-10-06). On the run the HUD reads the take-off you would get going up NOW — `TAKE-OFF ONE-FOOT · FROM THE STRIPE · BASELINE` — in the judges' own words, and a bar on the floor under the feet (gold at the stripe, cyan at the elbow, white in the paint) marks the spot; a soft tick when it crosses into a new zone. At the take-off the bar stays where he left the floor through the flight and the replay. `core/DunkTakeoffRead.takeoffRead` is the ONE function the run and `launchDunk` both judge with. Building it exposed a scoring bug, fixed in its own commit: `approachAngle` read every take-off on DunkMode's runway as BASELINE (+0.8). | S | Pure `core/DunkTakeoffRead` with vitest (equals `approachBonus` everywhere on the runway; stripe → elbow → paint in order; the foot; the side; the wire); the angle fix's test runs the mode's own `DUNK_CONFIG` and fails on the old line; wiring scan. |
| **8a ✓** | **Hang pump** (owner 2026-10-06: "a timed press that extends hang a little and adds style, with a clear cue; tuned so it can't break the slam window"). RUN pressed again in the air (RT · Space · the phone's RUN) inside ±0.12 clip s of the HANG beat — the HUD says HANG PUMP while it would pay — slows the flight clock to 0.4× for 250 ms (the hang 150 ms longer: the rise's own gameplay slow-mo) and pays style: +0.5 ON the beat, +0.2 off it; once a flight. **It cannot touch the slam window**: everything in the flight is on the clip clock, which a slow-mo never moves; and the pump's slow is cut to end 0.03 clip s before this flight's slam read opens (TV and first-jump widening included) — a pump with no room left is refused. The player's only (the rival does not pump yet). | M | Pure `core/DunkHangPump` with vitest (the reach, clean / loose, every refusal; for every legal window — TV 1–2, the first-jump widening, style taps, any trick tax — every accepted pump is over before the read opens; the card's style stays ≤ 10); wiring scan (the read is the update's own sums). Needs the owner's eye: it is feel. |
| 8b | **Blooper retry** | S | |

Not here: a judges' table in 3D, the night lighting, a replay theatre (presentation lanes); the shared shell / TV layout
(`lane/console-view`); phone voting and lobbies (`lane/multiplayer`).

**OWNER DECIDED (2026-10-06): staked and ladder nights play the classic format** — one rival, four dunks for the player, exactly as
the staked card has always been, so every staked card is equal. The four-dunker field (cut + final) is for **casual nights only**.
A run is staked when its URL carries `?arena=` (an Arena stake), `?mp=` (an async challenge), `?c=` (a challenge link) — the keys
the other hoops modes read as head-to-head (`modes/onevoneRules.HEAD_TO_HEAD_PARAMS`) — or `?signature=` (the weekly Signature
ladder). `core/DunkField.nightFormat` decides it per night (`FIELD_ON` is gone); tests pin that a staked night never runs the
field, a casual night does, and a staked card always holds four dunks (`arena-score-integrity` `DUNK_CONTEST_ATTEMPTS`).
The write-up the owner decided on, for the record:

**Owner decision (phase 5): what a CUT night stakes.** The field changes what a night's card can hold. A player who reaches the
final dunks four times (the card is unchanged); a player cut after the first round dunks twice, so the staked card holds **two**
judged dunks and the score is their total (~70–95 instead of ~150–190). Every integrity check still holds as written — the card has
≤ 4 attempts, each under its ceiling, and the score is the card's total — so `lib/arena-score-integrity.ts` and the server cap are
**unchanged**. But a ladder or a staked duel now compares a cut night's two-dunk card with a finalist's four-dunk card. Built
default: the card holds what you dunked. Alternatives, each a small change: (a) keep this; (b) a staked / ladder run plays the
old one-rival night (the mode would need to be told it is staked; `FIELD_ON` in `DunkMode.ts` is today's global switch); (c) the cut player keeps dunking a two-dunk
"consolation" round that counts on the card but cannot win the night. The owner chooses.

**Arena integrity.** The staked score stays the sum of at most four judged dunks: 5 judges × 10 × the stakes scale. Beats and
freshness move cards inside 6–10, never past them, and the dunk-off is never added to the total. `lib/arena-score-integrity.ts`
needs no change, and the server cap is untouched.
