# Character Creation System (v1) — audit + build status

Audited per the spec's own §5 ("capture before build"). **The blocker is resolved and the data foundation
is built** — §10 steps 1, 3, 4 and 5. What remains is the generic editor screen, the live preview binding,
and the sections with no substrate yet.

## The blocker, settled (owner, 2026-09-14)

**The 0–99 attribute model collided with PRQ.** `lib/prq.ts` defines 8 measured axes and is documented as
*the* gating primitive — "other systems read it; they do not duplicate its logic". The spec added ~45
attributes on a parallel scale, several the same quantity under another name.

**Decision: PRQ sets the CEILING; the editor spends underneath it.** Training in the real world raises what
a body attribute can reach; the build decides how points are distributed under that cap. Real work moves
the number, and a slider in a character creator can never claim you got faster.

The split fell out principled rather than convenient: PRQ measures a **body**, so it caps bodies (speed,
strength, vertical, stamina, agility, block, perimeter D) and has no business capping a jump shot, a post
hook or court vision. Those are skill — `prqAxis: null`.

**And the half that matters more than the cap: no PRQ means no ceiling.** The full 0–99, exactly as in a
game with no fitness layer. PRQ is upside for those who have it and never a tax on those who do not.
`lib/creator/schema/ceilings.ts`, swept by a test over every row.

**Durability: built, performance language only** (owner, same day). Every glossary line is about how the
body performs under repetition; a test greps the whole tab for injury/pain/risk/diagnosis wording.

## Built

| layer | file | note |
|---|---|---|
| row types + derived tabs | `schema/types.ts` | tabs derive first-seen from the data, never declared |
| attributes (51 rows, 6 tabs) | `schema/attributes.ts` | each row names the PRQ axis that caps it, or null |
| PRQ ceilings | `schema/ceilings.ts` | no profile ⇒ no cap; skill never capped |
| traits (42 rows, 6 tabs) | `schema/traits.ts` | every one a **tiered multiplier over a hook that already exists**, each hook verified present first |
| resolver + budgets | `schema/resolve.ts` | reports, never refuses; violations vs warnings |
| Athlete Profile | `schema/athleteProfile.ts` | deterministic, migrating, unknown-key-preserving |
| the spec's own acceptance test | `schema/dataDriven.test.ts` | adds a new attribute and trait *in the test* and runs every consumer against them |

Resolved along the way: the spec's `[MISSING TOP ROW]` in Durability was the **hip** pair; `Tab 1 [MISSING]`
in Traits is **All**, derived rather than authored.

## Still to build

1. **The generic editor screen** (§10 step 2) — tab strip, row list, stepper, preview pane, glossary modal.
   Every section above is a config of this one component. Nothing else should be written until it exists,
   or sections start growing bespoke UI.
2. **Live preview binding** (§10 step 6) — last, deliberately; it consumes everything above.
3. **Sections with no substrate**: Tendencies (table shape ready, rows not authored), Hot Zones, Ink,
   Vitals, and the Mechanics slots — which should sit on `MOVE_HANDLE`'s existing attribute gating rather
   than inventing a second one.

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
