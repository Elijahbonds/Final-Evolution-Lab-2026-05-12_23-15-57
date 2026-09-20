# Combat overhaul — assessment and plan

**2026-09-14.** Owner brief: *"the combat and karate vs modes need real work. There should be more movement,
rolling, dodging, running, jumping, more like storm and soul calibur. Karate endless should feel like neo
taking out waves of enemies or a one piece game where your hits hit waves of enemies and you can see their
health bar, you should have a health bar tied to prq and not get one tapped. way better visual fighting
mechanics and animations all around, better speed, smoother."*

Measured against the code, not against the brief's assumptions. Two parts of the brief are already built,
one is built and deliberately switched off, and one is a real, total gap.

---

## Status — C1, C2 and C3 shipped; C4 is next

| | gap | shipped |
|---|---|---|
| C1 | no roll, no jump, dodge in one mode of four | `EvadeMoves` (roll with i-frames that **end before the roll does**, jump), `DodgeRead` (a binary perfect-dodge reward). Wired into karate_vs, mixedcombat and endless. New `karate_roll` / `karate_jump` clips; block and parry rebuilt. |
| C2 | enemies dropped on one touch | `MookHealth` — **3 hits at wave 1** (owner), a shallow capped curve so one swing still clears a crowd, and a bar built on first damage. |
| C3 | PRQ tied to nothing | `PrqVitals` — max HP and speed from the band, spread capped at a fifth of a pool, guest = READY. `/api/profile` → host → harness → mode. |
| C4 | "better speed, smoother" — unmeasured | **measured and closed, 2026-09-20 — see below** |

Two things worth carrying forward from the build:

- **The roll went in the wrong place first.** I wrote it inside `CombatMovement`, then found only duel and
  showdown own one — the other three write velocity straight onto the root. `EvadeMoves` stands alone so a
  mode can adopt the verb without adopting a locomotion controller.
- **Karate endless keeps its own dodge.** It already had the best one in the game; giving it a second roll
  would have been two rolls fighting over one body. It took only the jump. Its perfect-read window moved
  into `DodgeRead` beside the duel's — **the two values still differ on purpose** (a horde is not one
  telegraph); what was wrong was two constants of the same name in two files.

---

## What is already true

**You cannot be one-tapped, and you already have a health bar.** `NeoCombatCore.VITALS` gives the player
100 HP, 18–26 damage per enemy strike (so **5–6 clean hits at wave 1, 4 by wave 9**), `hurtIframeSec 0.55`
after any clean hit so a horde cannot chain-stun you, a block chip that **floors at 1 and can therefore
never kill you**, and a revive at 40%. The file's own header says "DOWN only at 0". This concern is closed.

**Your hits already reach waves.** `for (const e of [...hit]) landHit(ctx, e, launches)` — one swing clears
every body in the arc, and landing three or more fires an extra `feel.impact`. The wave-clearing fantasy is
implemented.

**Enemies already carry health.** `interface Enemy { … hp: number; maxHp: number … }`. The fields are there.

---

## The four real gaps

### C1 — Movement. The biggest one, and total.

Grepped across all four combat modes (karate endless, karate_vs, mixedcombat, duel):

| verb | endless | karate_vs | mixedcombat | duel |
|---|---|---|---|---|
| jump | **0** | **0** | **0** | **0** |
| roll | **0** | **0** | **0** | **0** |
| dodge / evade | yes | **0** | **0** | **0** |

`CombatMovement` — the module all four share — exposes exactly `dash()` and a `sprint` flag. **There is no
jump and no roll anywhere in FEL's combat.** Soul Calibur is an eight-way run with a sidestep and a leap;
Storm is a dash-and-reposition game. Neither is reachable from the current verb set.

This is the work. It belongs in `CombatMovement` so all four modes get it at once, with clips authored the
way the dunk tricks are.

### C2 — Enemy health is switched OFF by an old design decision

`landHit` sets `t.hp = 0` unconditionally, commented *"Revolutions weight: the body drops on ONE solid
strike — no damage math, no second hit to finish."* That was a deliberate choice and it is the opposite of
what the brief asks for: One Piece wants enemies that **absorb** and a bar you can watch come down.

Reversing it is small — the fields exist — but it changes the mode's feel at the root, so wave counts,
enemy damage and the drop economy all need retuning with it. Bars need a renderer (billboard over each mob,
culled by distance and count).

### C3 — PRQ is not tied to anything in combat

`VITALS.maxHp` is the constant 100. `prqGrade()` already returns a **`speedMult` per band** (0.9 →1.15) and
nothing in any mode reads it. The client path exists — `/api/profile` returns `{ prq, grade }` and
`guest-dunk-shell` already calls `prqGrade(50)` for guests — so this is a host-passes-grade wiring job plus
a derivation, not new infrastructure.

Tie **max HP** and **movement speed** to the grade, keep the guest default at READY (1.0×) so a logged-out
player is never disadvantaged, and floor it so a RECOVERING athlete is never unplayable.

### C4 — "Better speed, smoother" needs measuring before it is claimed

The brief's last line is the one I cannot act on from source alone. Before tuning anything I will measure,
on a live loop: frame time under a full wave, the gap between a press and the first animated frame, and how
long a strike locks the body. "Smoother" that is not measured is just moving numbers around.

---

## Plan

**C1 → C4 → C2 → C3.**

1. **Movement** (`CombatMovement` + authored clips): roll with i-frames, a real jump, an eight-way run, and
   a sidestep. One module, four modes. Clips authored and pose-tested like the dunk tricks.
2. **Measure** what C4 asks about, so the tuning that follows is aimed at a number.
3. **Enemy health + bars** in karate endless, with the wave economy retuned around it.
4. **PRQ tie**, once the host path for the grade is in.

C2 changes how karate endless plays at the root, so I will confirm the retune direction with you before
shipping it rather than guessing how many hits a mook should take.

---

## What I need from you

Only one thing, and only when I reach C2: **how many hits should a standard enemy take at wave 1?** Three
is One Piece; one is what it does now. Everything else in this plan I can take.


---

## C4 — measured, 2026-09-20

The brief's last line was the one that could not be acted on from source alone, and this plan's own instruction was
to measure three things on a live loop before tuning anything. All three now have numbers.

**1 · The gap between a press and the first animated frame — this was the bug.**

Driven through the real `StrikeController` with the real arsenal timings, across 46 press offsets through a swing:

| | presses that came out |
|---|---|
| before | **25 / 46 (54%)** — and every one that failed was in the FIRST part of the swing |
| after | **45 / 46 (98%)**, mean wait 95 ms |

The buffer expired 140 ms after the PRESS while only being consumed when the swing reached `done`, 420 ms later. So
committing to a punch and pressing again — the most natural input in a fight — was the one case guaranteed to be
eaten, while a press in the last 140 ms landed. Lengthening the window alone changed nothing (250 ms and 400 ms both
measured 25/46); the fault was WHEN the queue was read, not how long it lived. The queue now outlives a swing and is
taken at the cancel point. The one press still dropped is on the swing's own first frame, which is the same input
counted twice.

**2 · Frame time under a full wave — not a problem, and worth saying so.**

Karate endless, 23 skinned bodies on screen, 478 sampled frames:

```
mean 16.7 ms · p95 17.3 · p99 17.7 · max 17.8 · frames over 33 ms: 0 · over 50 ms: 0
```

Locked 60 with the wave up. "Smoother" was never a frame-rate problem — it was the input one above. No tuning was
done here, because there is nothing in the numbers to tune.

**3 · How long a strike locks the body** — this is the same measurement as (1) from the body's side, and the same
fix answers it: the lock is unchanged, but it no longer swallows what you pressed during it.

One thing found along the way and removed: `HordeDynamics.canCancel` had zero callers and encoded a weaker rule than
the one karate endless actually runs (it knew about neither the hit beat nor the fighter's style scale). Deleted
rather than wired — a dead export that looks authoritative is how a weaker rule spreads.
