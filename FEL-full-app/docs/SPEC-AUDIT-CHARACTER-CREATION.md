# Character Creation System (v1) — audit + gap table

Method per the spec's own §5 ("capture before build"). No code written. Fourteen sidebar sections mapped
onto what is on disk today.

## The one thing to settle before anything is built

**The 0–99 attribute model collides with PRQ.** `lib/prq.ts` defines 8 axes on 0–100 and is documented as
*the* gating primitive — "other systems read it; they do not duplicate its logic". This spec adds ~45
attributes on a parallel 0–99 scale, several of which are the same quantity under another name (Speed,
Strength, Stamina, Agility, Vertical ↔ PRQ speed/strength/endurance/agility/power).

Two numbers describing one athlete is the exact failure the shared-profile rule exists to prevent, and it
already bit this project once (the Creator Card's `prqSource: 'profile'` vs measured path). It needs an
explicit decision: **derived from PRQ**, **feeding PRQ**, or **deliberately separate with a stated reason**.
I would not start §2 until that is answered.

## Gap table

| Section | State | Reuse / note |
|---|---|---|
| Vitals | **Absent** | Not spec'd either (§5). |
| Appearance | **Partial** | `lib/facescan/slidersFromLandmarks.ts`, `components/closet/avatar-preview.tsx`, `characterPipeline`. Face sliders exist; a full appearance editor does not. |
| Body | **Partial** | MPFB2 → FEL body pipeline exists (macro bake, A-pose export). Measurements are not an editable schema. |
| Ink | **Absent** | — |
| Footwear / Gear | **Partial** | `lib/cosmetics.ts`, `lib/entitlements.ts`, `app/closet`. Ownership and equip exist; not an editor. |
| Accessories | **Partial** | Same as gear. |
| **Attributes** | **Conflicts** | PRQ (8 axes) is live and load-bearing. See above. Durability per-limb is **absent** entirely. |
| **Tendencies** | **Absent** | Nothing in the repo. |
| **Hot Zones** | **Absent** | Nothing in the repo. |
| **Mechanics** (anim slots) | **Partial, strong** | `clipRegistry`, `basketballTree`, `BoardTricks` (34-trick vocabulary), `HandleSystem` (11 moves, handle-gated). **The gating pattern the spec asks for already exists**: `MOVE_HANDLE` prices a move by attribute, `hasMove()` gates it. Extend that rather than inventing a slot system. |
| **Traits** (badges) | **Absent as a system** | ~45 traits listed. But several already exist as *mechanics*: Deep Handle ≈ `movesFor(handle)`, Breakdown Artist ≈ `ankleBreakOdds`, Contest King ≈ `groundContest`, Airspace Denial ≈ `aiBlockChance`, Brick Wall / Immovable ≈ `ContactSystem` + `MomentumBus`. The trait layer should be a *tiered multiplier over existing hooks*, not new gameplay. |
| Import / Export Athlete Profile | **Exists, reusable** | `lib/profile/sharedProfile.ts` — versioned, deterministic, lossless round-trip, refuses a FUTURE version rather than half-reading it. This is exactly §6's "deterministic versioned serialization" and should be extended, not rebuilt. |
| Finalize (cap/budget) | **Pattern exists** | `lib/babylon/combat/schools.ts` holds a `STYLE_BUDGET` with a convex-combination invariant and dominance tests. Same shape as the attribute/trait point cap. |
| Live preview binding | **Exists** | `/dev/mode/<key>` renders any mode with no auth; `characterPipeline.spawnNpc` rebinds a rig. |

## What §6 asks for that is genuinely missing

1. **A data-driven schema table.** Every list in the spec is currently either a TS union or absent. "Adding a
   trait = new row, zero code change" needs a registry the UI reads — that is real new work.
2. **The dependency graph** (attribute → mechanic → trait, validated on save). `evaluateUnlock` in
   `lib/profile/protocol.ts` is one declarative gate and the closest precedent.
3. **Per-limb durability → fatigue/injury.** Nothing exists, and it is the section most likely to attract
   clinical language — the platform-wide rule is performance/movement only, no diagnosis. A "Back: 62" that
   drives an injury sim needs the same estimated-not-measured discipline as the PRQ work.

## Recommended build order

1. Settle the PRQ ↔ attributes question (blocking).
2. Schema registry + serialization extension (everything else reads these).
3. Traits as tiered multipliers over the hooks that already exist.
4. Mechanics slots on top of `MOVE_HANDLE`'s gating.
5. Appearance / Body / Ink / Gear editors.
6. Tendencies + Hot Zones (new systems, no substrate).
7. Durability last, with the non-clinical guard built in from the first commit.
