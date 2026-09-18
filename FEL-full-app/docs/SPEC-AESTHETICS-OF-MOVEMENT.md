# AESTHETICS OF MOVEMENT — the brief (owner, 2026-09-12)

Owner's words, kept verbatim, because the reference points ARE the spec. "Clean animations" is
unfalsifiable; "Street Vol 2 x 2K" is not.

## The north star

> "do an aesthetics of movement pass"
> "that goes for dribble moves too, should feel like street vol 2 or 3" / "x 2k"
> "if you have max ball ahndle you should feel like allen iverson x steezo"
> "ankle breakers, body bag dunks, chest to chest dunked on"
> "putbacks"
> "i should feel like ray allen from he got game when i shoot, like wii resort lol"

Decoded into what each reference actually demands:

| Reference | What it means mechanically |
|---|---|
| **NBA Street Vol 2/3** | Readable exaggerated silhouette; moves CHAIN without returning to idle; personality per body; the move is legible from the stands, not just correct |
| **x 2K** | Grounded weight; real footplant; momentum costs on a cut; you cannot change direction for free |
| **Iverson x Steezo (MAX handle)** | Handle is the gate: at max you get the tight low crossover, the chain, the ankle-breaker. At base you do not. This ties movement expression to PRQ upgrades — the thing subscribers pay to keep |
| **Ankle breakers** | A beaten defender STUMBLES or goes down. The floor state already exists (meFloored/foeFloored + karate_get_up) |
| **Body-bag dunk / chest-to-chest dunked on** | Contact dunk where the defender is IN the animation, reacting — not a dunk played next to a bystander. ContactSystem + posterize already exist |
| **Ray Allen / Wii Sports Resort (the shot)** | Effortless, pure, repeatable. A signature-smooth release, a crisp GREEN moment, tactile swish feedback. Simple to perform, juicy to land |

## Why the handle gate matters commercially

Max handle feeling like Iverson is the clearest possible answer to "why subscribe" — the upgrade is
not a number on a sheet, it is a move you can see and feel. Keep that link explicit:
`lib/progression/upgradeGate.ts` gates attributes, so gating MOVE AVAILABILITY off the same
effective attribute makes the paywall legible rather than arbitrary.

## Already on disk (extend, do not rebuild)

- `ContactSystem`, posterize floor states, `karate_get_up` — the body-bag dunk's foundation
- `HoopsMoves.ts` — post-up (`canPostUp`/`postYaw`/`bball_post_up`) already exists
- `PostureLayer` / `HoopsPosture` / `Biomech` — the posture spine the silhouette work rides on
- `RimPhysics.ts` + `LooseBall.ts` (NEW, this pass) — the miss and the rebound are physical now
- Putbacks — DONE this pass in 1v1 (`securePutback` / `foePutback`)

## Queue, in order

1. **Basketball 10-phase** (in progress): rim bounce DONE, loose ball DONE, putbacks DONE (1v1).
   Remaining: port to 3v3 / 3PT / dunk; contact dunks; verify post-up reachability.
2. **Fighting modes**: combat / karate_vs / karate_endless — movement, animations, FX, PRQ upgrades.
3. **Aesthetics of movement** (this brief) — dribble chains, handle gate, ankle breakers, shot feel.
4. **Aero Aces + karting** — maps, gameplay. NOT A REPAIR: see below.

## Aero Aces / Velocity Kart — the honest state

Both were "retired by decision, do not resurrect" (`docs/ASSESSMENT-2026-09-04.md:42`,
`MASTER_MODE_LIST.md:51,77`) and have NEVER existed in this codebase. `MODE_IMPLEMENTATION_MAP.txt:18`
records aero-aces-flyer as "Not found in app/play". So building them is a from-scratch build of a
flight model and a kart handling model, each with maps and a gameplay loop — not a fix to something
broken. Owner asked for them on 2026-09-12 ("aero aces, karting? maps? gameplay? those after"), which
supersedes the retirement, but the cost is new-mode cost.

## Late additions to the brief (same session)

> "off the backboard dunks, step throughs, triple threat"

Checked against the tree rather than assumed:

| Ask | State on disk | Work |
|---|---|---|
| **Off-the-backboard dunk** | EXISTS — `DunkLob.glassLobVelocity` (DUNK-GLASS-BOUNCE, throw band 2.4–4 m; nearer = clank) but only the dunk contest calls it | PORT to 1v1 / 3v3 as a self-lob off the glass into a dunk |
| **Step-through** | EXISTS — `HoopsMoves` footwork legs ("the step-through's one") and it fires off a bitten pump fake | VERIFY reachability + silhouette, do not rebuild |
| **Spin / pivot** | EXISTS — `planSpin`, monotonic eased `spinYaw`, real planted pivot foot | — |
| **Triple threat** | **MISSING.** No jab step, no triple-threat stance, no pivot-from-standstill | BUILD: the stance, the jab, the pivot out of it, and the three exits (shot / drive / pass) that give it its name |

Triple threat is the one genuinely absent piece here, and it is the stance the whole half-court game
starts from in 2K — worth building properly rather than faking with a held idle.

> "spin move gathers"

The spin is a real pivot already (`planSpin`, eased `spinYaw`, planted foot) but it DEAD-ENDS: it
finishes, `spinCooldown` arms, and the player must start a fresh shot input. A spin that gathers is
the Street Vol 2 chain point — the pivot's exit momentum feeds straight into the shot gather, so
spin→gather→finish is one continuous action instead of three separate presses. This is the single
clearest example of the "moves CHAIN without returning to idle" requirement.

> "put a ref that enforces rules via a handbook"

A REF is the right next structural move and it has a natural home: rule calls are currently scattered
as inline literals across the modes — the charge, the foul in the air, the and-one, make-it-take-it,
and (added 2026-09-12) the out-of-bounds dead ball. Each mode re-implements the ones it happens to
care about, which is why 3v3 and 1v1 disagree about what a board even means.

Shape to build: a declarative HANDBOOK (data — the rule, its call, its banner, its consequence) and a
`Ref` that reads it and emits calls. The modes report events ("ball left the floor", "foul-speed
contact into a set body", "shot released past the line") and the Ref decides. That makes the rules
auditable in one place, testable without a scene, and consistent across hoops modes — and it is the
honest place to put the 2K-style whistle the owner is asking for.

Candidate first handbook entries, all of which already exist as scattered code: out of bounds, charge,
shooting foul / and-one, make-it-take-it, backcourt, travel (missing), three-second (missing),
goaltending (missing), loose-ball foul (missing).

> "let people choose their ball on the same screen as their map, look at the meshy assets, hoopbus and rainbow balls"

The court/venue splash picker already exists (Venice + Blossom Park / Orbit / Canopy / Rooftop) and the
Meshy ball exports are already in-game (hoop / balls / decks / hoopbus via the bake-prop pipeline). So
this is a picker extension plus asset wiring, not new tech: put ball selection on the SAME screen as
the map so one choice-screen covers both, and surface the rainbow balls and the hoopbus.

## Status at the end of the 2026-09-12 run

Everything in the queue above was built. What was VERIFIED in a running mode, and what was not:

| Item | State |
|---|---|
| Rim bounce / readable misses | DONE, proven live in 1v1, 3v3 and 3PT |
| Rebounds, ball-body collisions, putbacks | DONE, proven live (`tipped off foe1`, chest-to-chest plants) |
| Ref + handbook | DONE; `out_of_bounds` proven live. Three-seconds wired + unit-tested, NOT seen firing |
| Handle / chains / ankle breakers | DONE, proven live: baseline chain depth 2 vs max 4, hard break floors the defender |
| Triple threat + spin gathers | DONE, proven live; jab odds decay 0.64 -> 0.35 within a possession |
| Contact dunks (body bag, chest to chest) | DONE, proven live via a probe seam |
| Off-the-backboard dunk | DONE, proven live (2 of 2 glass-held attempts) |
| Placeholder-body audit | CLEAN, and now guarded by a test |
| Ball picker on the map screen | DONE; skin proven applied live. Picker UI NOT seen rendering (auth wall + a pre-existing WebGL error on the only ungated route) |
| Fighter style / routes (karate_vs, mixedcombat) | DONE; TRIPLE (3-step) proven live in mixedcombat |
| Aero Aces | BUILT + enabled; flies, gate passed. Full course NOT completed by the autopilot |
| Velocity Kart | BUILT + enabled; drives, drifts, 100% boost, TWO LAPS completed |
| Karate Endless routes | DONE (owner asked for it after the first pass). Ported on the HORDE's terms: the payoff is arc and reach, not damage, because Endless is one-strike-one-body by owner lock. Proven live — baseline reaches only CRUSHER, upgraded reaches TRIPLE / SWEEP / CRUSHER, one clear took 3 bodies |

## Dynamic posture + aesthetics of movement (2026-09-12, after the first table)

| Item | State |
|---|---|
| Dynamic posture (bank / lean / exertion) on 1v1, 3v3, dunk runway | DONE, measured ON THE BONES: spine2 roll swept 29.79 deg (1v1), 42.13 (3v3), 10.57 (dunk runway, peaks within a degree of the designed cap) |
| Lateral lean at all | This did not exist before — every authored hoops stance is pitch-only |
| Stride matching (foot slide) | DONE and measured: planted-foot travel 38% -> 30% of body motion (1v1), 36% (3v3). Reference speed calibrated by sweep, not guessed |
| Foot slide fully solved | NO. The rate clamps cap the correction; the remainder is the clips' own foot trajectories, which is an authoring fix rather than a code one. The probe reports the number so the next pass can see if it moved |
