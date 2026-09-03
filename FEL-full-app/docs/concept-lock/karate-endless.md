# Concept Lock — Karate Endless (the horde brawler)

**Benchmark (LOCKED by the owner, 2026-09-03): the Matrix Revolutions burly brawl /
One Piece Pirate Warriors (Musou) horde grammar.** You face hordes and waves of
enemies, solo or co-op. Recorded in `PHASE2_BENCHMARK_LOCKS.md` (repo root).
This supersedes the earlier Soul Calibur + COD Zombies reading below, which is
kept as the record of the prior pass: its wave structure (A) and co-op (C)
criteria still hold under the new lock; its melee section (D) is retired — the
one-on-one Soul Calibur grammar belongs to Mixed Combat, and the Storm grammar
to Karate VS. Three modes, three mechanics.

**Mode id:** `karate` · **Implementation:** `lib/babylon/modes/KarateEndlessMode.ts`
**Route:** `/play/karate` · **Host:** `components/games/karate-babylon.tsx`

## H. The horde grammar (this pass — measured against the code, 2026-09-03)

| # | Criterion | Status | Where |
|---|---|---|---|
| H1 | Many enemies on screen at once, not a queue of duels | ✅ 6→20 (mobile 12) | `WAVE.base/max`; the horde fantasy wants ~8→20 on desktop, capped by tier on mobile |
| H2 | Every strike hits EVERYONE in its arc, not the nearest one | ✅ `inArc` per strike (2026-09-03) | `strike()` → `nearest()` single target; `OnslaughtCore.aoeTargets` exists and is unused |
| H3 | A launcher and a juggle: airborne enemies are helpless and take more | ✅ `launch` strikes set `airUntil` | `applyCCHit` / `JUGGLE_*` exist in the core, never called by the mode |
| H4 | A crowd-clear special when surrounded | ✅ | `surroundedCount` / `crowdClear` — the one core piece that is wired |
| H5 | A hit counter that climbs across the horde (the Musou number) | ✅ HITS badge, 1.4 s chain | `kos` only; no running hit count on the bezel |
| H6 | Waves escalate in count and toughness | ✅ | `waveSpec` |
| H7 | Co-op: a partner fights beside you, down-and-revive | ✅ | `PartnerAISource`, `DownRevive` |
| H8 | The camera frames a crowd, not a duel | ✅ `crowd` preset when surrounded | facing-derived `overShoulder`; needs a pull-back when surrounded |

**D-H1 — Strikes are single-target. → FIXED 2026-09-03 (horde pass).** Every strike resolves
through `aoeTargets` with a per-strike arc: jab a 100° arc at 1.5 m (light,
launches a staggered enemy), kick a 150° arc at 1.9 m with knockback, heavy a
launcher on the front arc. Airborne enemies take `JUGGLE_DAMAGE_MULT`.
**D-H2 — No hit counter. → FIXED 2026-09-03 (horde pass).** A running `hits` count that decays
after 1.4 s without a hit; the bezel shows it; the chi gain scales gently with it.
**D-H3 — Horde size. → FIX (Phase 5), tier-capped.** `WAVE.base 6 / max 20`
on desktop, `max 12` on mobile — measured against the frame budget.

---

## A. Wave survival — the Zombies structure

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | Discrete numbered waves, not a continuous stream | ✅ | `waveSpec()` |
| A2 | Each wave is bigger than the last | ✅ 4 → 12 | `WAVE.base/max/growEvery` |
| A3 | Enemies get tougher, not just more numerous | ✅ +4 HP/wave | `WAVE.hpBase/hpPerWave` |
| A4 | The wave number is the score you brag about | ✅ on the bezel | `WAVE n · n KO` |
| A5 | A run ends by being overwhelmed, not by a clock | ✅ | down with no revive |
| A6 | Enemies arrive visibly, not by appearing | ✅ glitch-burst spawn-in | `spawnRing()` |

## B. The economy — Zombies' actual loop

| # | Criterion | Status | Where |
|---|---|---|---|
| B1 | Killing pays a currency | ✅ | server wallet |
| B2 | The currency buys permanent-for-the-run upgrades | ✅ 5 perks | `PERKS` |
| B3 | Perks are meaningfully different, not tiers of one stat | ✅ HP / damage / speed / guard / juggle | `OnslaughtCore.ts` |
| B4 | **The player can see their balance** | ❌ **D1** | published, never rendered |
| B5 | **The player can see what a perk costs before buying** | ❌ **D1** | published, never rendered |
| B6 | Spending is server-authoritative, not client-trusted | ✅ | `/api/wallet/spend` |

## C. Co-op — the part that makes it Zombies and not a horde mode

| # | Criterion | Status | Where |
|---|---|---|---|
| C1 | A second fighter fights alongside you | ✅ | `PartnerAISource` |
| C2 | The ally is built on the same seam a human would use | ✅ `ControlSource` | `PlayerSlot` |
| C3 | Going down is a state, not instant death | ✅ | `DownRevive` |
| C4 | A downed fighter can be revived | ✅ | `REVIVE_RANGE` |
| C5 | **The ally's health is visible** | ❌ **D2** | `partnerHp` published, never rendered |
| C6 | **The revive prompt is visible** | ❌ **D2** | `revive` published, never rendered |

## D. The melee — Soul Calibur

| # | Criterion | Status | Where |
|---|---|---|---|
| D-1 | 3D arena movement, 8-way, not a 2D plane | ✅ | `PlayerSlot` + stick |
| D-2 | A strike vocabulary with distinct properties | ✅ | `STRIKES` |
| D-3 | Guard, and a reward for good defence | ✅ dodge i-frames + perfect-dodge slow-mo | `DODGE_*` |
| D-4 | Defence is a read, not a hold | ✅ tap ≤220ms = dodge, hold = block | `DODGE_TAP_MS` |
| D-5 | A meter-spend payoff move | ✅ chi burst | `CHI_BURST_*` |
| D-6 | Ring-out | N/A — see D5 below | `ARENA_HALF` clamps |
| D-7 | The camera frames combat like an action game, not a fighter | ✅ `overShoulder`, facing-derived | `CameraDirector` |

---

## E. Deviations

**D1 — The perk shop is unusable: no balance, no prices. → PHASE 8.**
The mode publishes `coins` and a formatted `perks` list, and the host
(`karate-babylon.tsx`) renders **hp, chi, wave, kos and banner** — nothing else.
So the shop opens with the banner *"PERKS — d-pad to browse, A to buy, B to
fight"* over a screen showing neither the perks nor the money. A points economy
whose points are invisible is the single largest miss against the Zombies half
of the benchmark: in that game the number in the corner is the whole loop.

**D2 — The ally's health and the revive prompt are invisible. → PHASE 8.**
`partnerHp` and `revive` are published every frame and never rendered. In a
down-and-revive co-op mode a player cannot see their partner failing, and cannot
see that a revive is available. Same root cause as D1: the host bezel predates
most of what the mode publishes. One fix.

**D3 — Frame warnings are intermittent and unexplained. → PHASE 3.**
Measured across four runs against an unchanged camera: **1, 0, 5, 1**. Noisy,
not steady — an earlier three-run sample reported "1 per run", which was too
small to support. Root-causing this is Phase 3 work in this pass.

**D4 — No World-Population pass has ever been run on this venue. → PHASE 6.**
The defects document says so explicitly.

**D5 — No ring-out. → RULED OUT OF SCOPE, with the reason.**
Ring-out is a Soul Calibur signature and Karate VS *does* implement it ("knock
them off the disc"). It is deliberately absent here because the two halves of
this benchmark disagree and the structure wins: a Zombies run ends when you are
overwhelmed, and an arena you can be knocked out of turns every wave into a
positioning puzzle against a boundary rather than a fight against a horde. The
arena clamps instead. Recorded so it reads as a decision rather than an
omission.

**D6 — The ally is AI-only; there is no second human. → OUT OF SCOPE (v1).**
Deliberate and already documented in the mode's own header: both bodies read
from `ControlSource`, so real co-op is "implement `NetworkInputSource` against a
transport", not a combat rewrite. That is a §6 feature, not a convergence-pass
item — §7.8 forbids pulling it in here.

**D7 — Perk effects are not visibly confirmed on the fighter. → OUT OF SCOPE (v1).**
Buying +15% damage changes a number with no visual tell. Zombies uses machines
and jingles; this would need an art pass beyond what the mode needs to be good.
