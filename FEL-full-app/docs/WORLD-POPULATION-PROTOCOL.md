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
