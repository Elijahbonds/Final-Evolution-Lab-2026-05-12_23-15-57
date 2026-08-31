# World-Population Protocol — v1 (canonical)

**Status: RATIFIED 2026-08-30 by Elijah.** This is the protocol the Master Design
Bible §2 names and §7.4 requires.

The Master Design Bible §2 names this protocol and §7.4 makes "World-Population
Protocol applied" a condition for any mode to be signed off. **No such document
existed** — a search of this machine found it referenced only by files written
during the pass that produced this one. §7.4 was therefore unsatisfiable by
construction: no mode could reach 8/8, however good it was.

This was the same situation the 10-Phase Convergence Protocol was in, and it got
the same treatment: written, then ratified, so the gate is checkable. §7.4 is now
satisfiable.

**Scope (from §2):** how worlds and arenas are populated — crowd, ambience,
environmental detail. Applies on top of the 10-phase pass to any mode with an
open-world or arena environment. A mode with no environment (a quiz, a DAW) is
exempt and records that here.

---

## The governing rule

> **Populate for legibility first, atmosphere second.**
> Every element must survive the question: *does this help the player read the
> game?* If the answer is no, it is atmosphere, and atmosphere never competes
> with the thing the player is trying to see.

The failure this prevents is real and happened during 3PT's pass: the shooter was
framed against a wall of Venice Beach graffiti so busy that the ball, the rim and
the release bar all had to fight it. Detail was added; readability went down.

---

## L1 — Ground plane

The surface the mode is played on, with its regulation markings.

**Exit criteria**
- Playing surface exists and is the mode's real dimensions
- Regulation markings are present and **correct** — checked against the real
  sport, not eyeballed
- The surface reads as a surface at gameplay camera distance

**Building blocks:** `VenueKit.buildCourt / buildDojo / buildGridiron / buildPark /
buildSlope / buildWave / buildField`, `paintedGround`, `applyOceanCourt`

> Markings are gameplay, not decoration. 3PT's rack positions were a constant
> 6.75m radius until Phase 2; the real three-point line runs 6.71m in the corners
> to 7.24m at the top, and that difference is *why* the top-of-key rack is the
> hard one. A wrong marking is a wrong game.

## L2 — Play-critical props

Anything the player must see to understand the game state.

**Exit criteria**
- Every object the rules refer to is physically present and visible
- State the player needs is readable **from the object**, not only from the HUD
- Props update as state changes

> 3PT shipped without ball racks. The mode knew which shot was the money ball; the
> player could not, until it was already in their hands. Five racks that visibly
> deplete fixed it. **If the HUD is the only place a rule is visible, L2 is
> incomplete.**

## L3 — Boundary and enclosure

What tells the player where the world ends.

**Exit criteria**
- The playable area is visually bounded — no void at the edges
- The boundary reads from the gameplay camera, not just from above
- Nothing occludes the action from the camera's usual positions

**Building blocks:** `venueBox`, `mountBackdrop`, `paintOcean`, `paintBoardwalk`

## L4 — Crowd and life

Signals that the space is inhabited.

**Exit criteria**
- Crowd or life is present where the venue implies it (an arena has a crowd; a
  dawn beach may not)
- Crowd **reacts** to the big moment — a static crowd is set dressing
- Crowd cost is bounded; it must never compete with characters for frame budget

**Building blocks:** `paintBleachers(CROWD)`, `SoundKit.play('crowdCheer' | 'crowdGroan')`

> Reaction is the whole point. 3PT's crowd was silent on a made money ball —
> the single most exciting event in the mode — until Phase 7.

## L5 — Ambience and depth

Everything else: sky, distant scenery, foliage, signage, particles.

**Exit criteria**
- Backdrop and sky present, matching the venue mood
- Ambient audio bed running and appropriate to the venue
- **Nothing in this layer competes with L1–L2 for the player's attention**

**Building blocks:** `mountBackdrop`, `paintTrees`, `paintGraffiti`, `EffectsKit`,
`SoundKit.startAmbient('stadium' | 'dojo' | 'none')`

> This is the layer that most often hurts. Busy graffiti directly behind the rim
> is atmosphere placed where legibility was needed.

---

## Budget

Population must not cost the mode its frame budget. Check `PerfMonitor` with the
venue fully built:

- Draw calls and mesh count recorded before and after population
- No regression below the mode's target frame time on the mobile profile
- Crowd and foliage are the first things cut when the budget is tight

---

## Sign-off block (paste into the mode's concept lock)

```
World-Population Protocol — <mode>
  L1 ground plane .......... PASS / FAIL / N-A
  L2 play-critical props ... PASS / FAIL / N-A
  L3 boundary .............. PASS / FAIL / N-A
  L4 crowd and life ........ PASS / FAIL / N-A
  L5 ambience .............. PASS / FAIL / N-A
  budget ................... draws ___  meshes ___  frame ___ms
  legibility ............... does anything compete with L1-L2? ___
```

An exempt mode records `N-A` with the reason. A mode with an environment cannot
record `N-A`.

---

## Applied: Three-Point Shootout

```
L1 ground plane .......... PASS  Venice court + real NBA arc (6.71–7.24m)
L2 play-critical props ... PASS  5 racks deplete as shot; money ball gold
L3 boundary .............. PASS  venueBox + boardwalk + ocean
L4 crowd and life ........ PASS  bleacher crowd; cheers money balls and 4+ streaks
L5 ambience .............. PASS  backdrop, palms, stadium ambient bed
budget ................... draws 56  meshes 56  (dev pane throttled; re-measure on device)
legibility ............... PASS  graffiti muted (see VenueKit.paintGraffiti)
```

**This concern has been closed.** The graffiti was 14 fully-saturated neon
beziers directly behind the hoop. It now mixes 55% toward the wall colour, thinner
and fewer at half alpha — the wall still reads as Venice graffiti, but the rim and
ball no longer compete with it. This is the governing rule doing its job on the
very first mode it was applied to.

---

## Applied: Dunk Contest

```
L1 ground plane .......... PASS  16x28 court, halfcourt markings, regulation hoop
L2 play-critical props ... PASS  hoop/backboard/net, ball, selectable prop (alley-oop, obstacle)
L3 boundary .............. PASS  venue box + backdrop wall + banner; no void at the edges
L4 crowd and life ........ PASS  two crowd tiers; CrowdEnergy drives ambient level and cheer/groan
L5 ambience .............. PASS  dusk sky, palms, lamps, arena banner, stadium bed
budget ................... draws 53-90  meshes 53-90  frame 16.7ms @ 60fps
legibility ............... PASS  crowd texture rebuilt — see below
```

**The governing rule caught the same failure twice, in a different asset.**
`paintCrowd` scattered 900 fully-saturated neon dots at uniform random and used
the result as albedo *and* emissive. It read as confetti static rather than a
crowd, and on the dunk court a tier of it sits directly behind the hoop — where
the player looks on every attempt.

This is 3PT's graffiti wearing different clothes, and it took the same remedy:
spectators sit in **rows** (random scatter was the single biggest reason it read
as noise), each is a torso plus a head so the silhouette is a person, most are
mixed heavily toward the background with only ~1 in 8 wearing the venue accent
at strength, back rows recede for depth, and the emissive is halved.

> Worth recording as a pattern: both failures were *added detail* that reduced
> readability, and both sat directly behind the thing the player aims at. When
> this protocol is applied to a new mode, look behind the target first.

---

## Applied: Basketball 3v3

```
L1 ground plane .......... PASS  18x20 half court, offset so the baseline sits
                                 1.575m behind the rim; halfcourt markings;
                                 regulation 3.05m rim; real 6.71-7.24m arc
L2 play-critical props ... PASS  one basket with backboard and net, live ball
L3 boundary .............. PASS  court edges + stands + skyline; no void
L4 crowd and life ........ PASS  two stands, behind the basket and behind play
L5 ambience .............. PASS  night skyline, lamps, stadium bed
budget ................... draws 49  meshes 49  frame 16.7ms @ 60fps
legibility ............... PASS  stands moved 6m -> 10m behind the basket
```

**L1 failed on three separate counts** on a mode the bible lists as
shipped-standard: the basket was ~12m from where the mode shot, the rim was
built at 2.70m against a regulation 3.05m, and a half-court game was painted
with full-court markings so the key sat at the opposite end from the hoop.

> This is the strongest evidence yet for L1's rule that dimensions are checked
> against the REAL SPORT rather than eyeballed. Every one of the three was a
> pair of numbers that were each internally consistent and never compared: the
> mode's rim against the venue's hoop, the built rim height against ten feet,
> the painted markings against the geometry actually being played. None threw.
> `hoop-alignment-tests` now performs that comparison for every basketball mode.
