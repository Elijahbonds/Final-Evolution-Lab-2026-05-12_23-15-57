# Concept Lock — Karate Endless (Agent Waves)

**Benchmark (LOCKED): Soul Calibur + Wave Survival (COD Zombies).**
Locked in `PHASE2_BENCHMARK_LOCKS.md` (repo root, commit `d441f29`), in the
*Already-Locked (from audit)* list.

**This unblocks the mode.** `karate-endless-defects.md` states plainly that the
mode could not have a real pass because "§4.3 carries no benchmark", and that a
benchmark "still needs locking". That was true of the Master Design Bible's §4.3
and false of this repository — the lock existed the whole time, at the tracked
repo root, one level above `FEL-full-app`, which is why every search inside the
app missed it. The same file also settles Unreal Arena, and the same oversight
cost the board sports a phase each. That defect document stands as an accurate
record of its own pass; it is superseded on this one point only.

**Mode id:** `karate` · **Implementation:** `lib/babylon/modes/KarateEndlessMode.ts`
**Route:** `/play/karate` · **Host:** `components/games/karate-babylon.tsx`

**Reading a two-part benchmark.** COD Zombies supplies the *structure* — escalating
waves, a points economy, perk purchases, down-and-revive co-op, a run that ends
when you are overwhelmed. Soul Calibur supplies the *melee* — 3D arena combat with
strikes, guard, and movement that matters. Where the two disagree, the structure
criteria come from Zombies and the fight criteria from Soul Calibur, and this
document says which is which rather than blending them.

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
