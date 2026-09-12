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
