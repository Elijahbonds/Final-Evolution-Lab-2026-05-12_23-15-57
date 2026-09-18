# Concept Lock — Karate VS

**Benchmark (LOCKED, bible §4.1): Soul Calibur / Naruto Storm.**
**Mode id:** `karate_vs` · **Implementation:** `lib/babylon/modes/KarateVSMode.ts`

Phase 1 of the convergence pass. Both named references are **3D arena fighters**,
not 2D plane fighters: the fighters circle each other in an open space, and the
camera is what makes that legible. The criteria below are what those games do.

---

## A. Match format

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | Best-of-three rounds | ✅ | `ROUNDS_TO_WIN = 2` |
| A2 | Health bars for both fighters | ✅ | `hp` / `foeHp` |
| A3 | A meter that gates a special | ✅ | chi → `SPECIAL_ATTACK` at `CHI_MAX` |
| A4 | Round timer, higher HP wins on time | ✅ | 120s, `endRound(meState.hp >= foeState.hp)` |
| A5 | An arena with bounds, not a corridor | ✅ | `ARENA_HALF = 7.5` |

## B. The fighting itself

| # | Criterion | Status |
|---|---|---|
| B1 | Light / heavy / kick attack vocabulary | ✅ `KARATE_ATTACKS` + JAB / KICK / HEAVY |
| B2 | Blocking, and guard that can break | ✅ `guard` / `foeGuard` |
| B3 | **Parry** — a timed block that punishes | ✅ 160ms window, attacker staggers |
| B4 | Combos that scale and read on screen | ✅ `COMBO xN — N DMG` |
| B5 | A super that spends the meter | ✅ full chi turns HEAVY into the DRAGON |
| B6 | Impact feedback — hitstop, slow-mo | ✅ `SLOWMO_SEC` / `SLOWMO_SCALE` |

## C. What makes it a 3D arena fighter

| # | Criterion | Status |
|---|---|---|
| C1 | **Both fighters readable at once** | ✅ **D2 FIXED** — three-quarter view |
| C2 | Free movement in the arena, not a lane | ✅ 2-axis stick movement inside `ARENA_HALF` |
| C3 | The camera keeps the opponent framed | ✅ aims at the midpoint, off-axis |
| C4 | Forward means toward the opponent | ✅ **D1 FIXED** |

---

## D. Deviations

**D1 — Pressing forward walks you AWAY from the opponent. → FIX in Phase 2.**
The player spawns at z +2.2 facing a rival at z −2.2, and the camera sits behind
the player looking down −z, so "up" on screen is −z. The mode computes
`new Vector3(stickX, 0, -stickY)`, and every input source reports up-stick as
**negative**, so W yields +z — backwards.

This is the third distinct site of the same platform disagreement (1v1 and 3v3
were the others), and it is **not** fixed by the `LocalInputSource` normalisation
that closed those two: Karate VS reads `stickX`/`stickY` **raw** from `onInput`
and never goes through the adapter. Worth recording precisely, because it is the
evidence that fixing the seam did not fix every consumer — only the ones that use
the seam.

**D2 — One fighter hides the other. → FIX in Phase 3.**
`camPreset: 'fight'` has `fitTwo: true`, which places the camera on the line
**between** the two fighters — directly behind the player, with the rival beyond
them. In the baseline capture the red opponent is almost entirely occluded by the
blue player. Soul Calibur and Naruto Storm both hold an off-axis three-quarter
view precisely so both fighters, and the space between them, stay readable. This
is the single most benchmark-defining thing about the mode and it is the one
thing the camera does not do.

**D3 — The host does not defer its harness start. → FIX in Phase 4.**
`karate-vs-babylon.tsx` calls `runMode` immediately, the same StrictMode
double-mount that rendered 3v3 as an empty void and made the Dunk guest path
black. `[FEL-SPAWN] karate-vs: OK` is already logging **twice** per load.

**D4 — No Nexus venue mapping. → ASSESS in Phase 6.**
`NexusVenue` maps `karate → karate_endless` and has no entry for `karate_vs`, so
it falls back to `VenueKit`'s dojo. The baseline renders at **20 meshes**, which
is thin for an arena that the benchmark treats as a character in its own right.

**D5 — Ring-out. → RULED OUT OF SCOPE.**
Soul Calibur's signature loss condition is being knocked out of the arena. Naruto
Storm has no such rule, the benchmark names both, and `ARENA_HALF` currently
clamps rather than eliminates. Recorded as a decision, not an oversight.

---

## E. Exit criteria

Parity when A1–A5, B1–B6 and C1–C4 hold, with D5 ruled.

**Currently: 16 of 16 criteria hold** (B7 added below), with D5 ruled and D4
recorded.

---

## D6 — The rival could not be hit. → FIXED. *(found in Phase 2, the worst of them)*

| # | Criterion | Status |
|---|---|---|
| B7 | The rival is beatable | ✅ **fixed** |

`RivalFightBrain`'s reactive guard rolled `difficulty * 0.5` on **every frame**
the player was mid-swing. A jab's startup is 120ms and a kick's 180ms, so at
60fps that is 7–11 rolls per attack: at difficulty 0.6 the rival guarded about
**98%** of everything thrown at it.

Measured live, a run of kicks came back `blocked / blocked / blocked / parried /
whiff` — **not one HIT** — and across a full match the player dealt **zero
damage** while their own HP fell to 13. That is not a hard opponent, it is an
unbeatable one, and nothing reported it because every individual system was
behaving exactly as written: the brain guarded, `resolveStrike` returned
`blocked`, the HUD showed a healthy rival. Only the scoreline said anything, and
only if you read it.

Rolling once on the rising edge of a wind-up makes the number mean what it
reads as — a 30% chance to read the attack and guard it. Fights now finish
82–37, 44–37 and 25–73 across runs: won and lost.

`fight-balance-tests` guards it, and asserts the tell that would catch the old
shape returning — **a slow attack must not be easier to guard than a fast one**.
With the per-frame roll restored it fails at 98%, and at 76% vs 100% by startup
length.

## D7 — The camera collapsed against the dojo wall. → FIXED.

Every `[FEL-FRAME]` line this mode produced was a fighter at exactly
`z = ±ARENA_HALF` with the camera crushed 0.3m behind them. The dojo floor is
18×18 (half-extent 9) and `ARENA_HALF` was **7.5**, leaving 1.5m for a camera
that pulls back 4.2. A fighter backed into the boundary left it nowhere to go.

`ARENA_HALF` is now 4.5 — a 9m square, about the size of a Soul Calibur ring —
which keeps 4.5m clear behind either fighter. Three runs afterwards: 0 lines.
