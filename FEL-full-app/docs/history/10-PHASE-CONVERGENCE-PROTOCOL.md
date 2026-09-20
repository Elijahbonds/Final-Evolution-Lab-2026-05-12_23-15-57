# 10-Phase Convergence Protocol — v1 (canonical)

**Status: ratified 2026-08-30.** This is the protocol the Master Design Bible §2
and §7.2 refer to. It did not previously exist as a written document — a search
of this machine found three *other* ten-phase documents (the Babylon-era
animation **Remediation** Pass v2, and two pre-Babylon iOS/Swift/UE5 passes) and
none of them was this. It was drafted by Elijah, reviewed against evidence from
four modes taken through a real pass, and adopted.

## The governing rule

> **Every phase ends with a runnable proof — console output, a test result, a
> screenshot — not a claim. If a phase cannot be proven, stop and report.**

Carried over verbatim from the Remediation Pass, which added the reason:
*"The previous pass shipped code that did not change observable behavior."*
A phase marked complete on a claim is worse than one marked blocked, because it
removes the reason to look again.

## Two standing rules from the bible

- **§0 sequencing:** one mode at a time. Do not open parallel mode work or
  platform-abstraction work mid-pass.
- **§7.3 benchmark:** if no benchmark is locked, **stop and flag** — never invent
  one. A mode with no locked benchmark cannot enter Phase 1.

---

## Phase 0 — Platform Preconditions

**Checked once per platform state, NOT per mode.** These are properties of the
platform, so running them per mode re-answers the same question 24 times.

| Gate | Proof |
|---|---|
| Gate 0 — Mixamo 65-bone rig, `mixamorig:` naming | `npx tsx scripts/gate0-rig-tests.ts` |
| Five-tab shell — Lab/Train/Arena/Status/Profile | `components/bottom-nav.tsx` |
| Asset pipeline — Meshy → DeepMotion/SayMotion → Babylon, KTX2 | asset inventory |

Gate 0's **enforcement** stays per-mode: §1 says no animation-dependent work is
credited until it passes. That is an assertion, not a phase of work.

---

## Phase 1 — Concept Lock

Turn the benchmark into criteria that can be checked. Without this the later
phases have no fixed target and §10 has nothing to sign against.

**Exit criteria**
- Benchmark named and locked (or **stop** — §7.3)
- A written criteria list, each item checkable
- Deviations from the benchmark recorded, each one **fixed, deferred to a named
  phase, or ruled out of scope with a reason**
- Out-of-scope decisions written down — that is what makes it a *lock*

**Deliverable:** `docs/concept-lock/<mode>.md`
**Worked example:** `docs/concept-lock/threepoint.md` — 15 criteria, 6 deviations.

> Why this is Phase 1 and not Phase 2: 3PT was built *before* its benchmark was
> locked. "NBA 2K9 Three-Point Contest" then turned out to require a six-shooter
> field, qualifying, and a final — structural, not polish. The whole contest
> layer had to be retrofitted.

---

## Phase 2 — Core Mechanics + Tests

Controls, physics, and the core loop, **with deterministic tests written in the
same pass**. Not after.

**Exit criteria**
- The loop is playable start to finish
- Tuned constants live in named constants, not inline literals
- Headless tests assert the mechanic against the *real-world* reference where one
  exists, not against our own constants
- `npm test` green

> Assert against reality, not yourself: 3PT's arc test checks the rack radii
> against the **real NBA line** (6.71m corners, 7.24m top). Testing them against
> our own `RACK_R` would have happily confirmed a wrong number.

---

## Phase 3 — Camera & Framing

**The most common failure in this codebase.** A mode with perfect mechanics is
unshippable if you cannot see it.

**Exit criteria**
- The mode drives its own camera — `ModeHarness` *constructs* a `CameraDirector`
  but does not drive it. `snapTo()` at load, `update()` every frame.
- `objectiveRef` is the thing the player is aiming at, and is near enough to frame
- Hero visible in **every** phase of the mode
- No `[FEL-FRAME] hero off-screen` in the console

> Four real failures: snowboard white-out (FrameGuard NaN); 3PT staring at the
> boardwalk (camera never driven); 3PT framing degenerating (objective was the
> ball in the shooter's own hands); Sprint **still black** (objective was the
> finish line 100m away, so FrameGuard's auto-recenter re-framed the whole
> straight forever). **A byte-identical camera position in `[FEL-FRAME]` means
> the recenter loop.**

---

## Phase 4 — Reachability

A mode can pass every other phase and still not exist to a player.

**Exit criteria:** registry entry · `BABYLON_MODES` flag · route · host component ·
loader selects it · `MODE_INFO`/venue entry · appears in the build output

> `DuelMode` and `ShowdownMode` were both fully built, registered, and completely
> unreachable — no route, no host.

---

## Phase 5 — Input & Control Schema

**Exit criteria**
- `MODE_VERBS` entry whose key **exactly matches** the `modeId` passed to
  `TouchOverlay`
- Controller Link schema in `lib/controller-link/schemas/registry.ts`
- Every input path reaches the mode: keyboard, touch, gamepad, phone
- `npx tsx scripts/verb-key-alignment-tests.ts` green

> Karate VS rendered `modeId="karate_vs"` while the verbs were keyed
> `"karate-vs"`. A missing key does not throw — it falls through to a single
> generic ACTION button, so KICK/HEAVY/BLOCK were unreachable from touch and
> nothing reported it. **This class of bug degrades instead of failing**, which is
> why it gets its own phase and a permanent guard.

---

## Phase 6 — World Population

Per the World-Population Protocol (separate document), plus anything the
benchmark demands of the venue.

> 3PT: the five ball racks belong on court and visibly deplete — 2K9 shows them,
> and without them nothing tells the player which ball is worth double until it
> is already in their hands.

---

## Phase 7 — Audio

**Exit criteria:** action SFX · ambient bed · **the mode's big moment sounds
different from a routine one**

---

## Phase 8 — Polish

Juice, animation blending, VFX: `scorePop`, `feel.impact`, `camDirector.pulse`,
`lights.flashBeat`, reserved for moments that earn them.

---

## Phase 9 — Device Playtest & QA

**On a real device, through the shipping route — not a dev harness.**

> This is not optional rigour. Sprint's logic verified completely clean and it
> still renders black. Only a real playthrough catches that class of failure, and
> a dev-host pass will happily report success.

---

## Phase 10 — §7 Completion Checklist

The bible's eight-item sign-off, run honestly. **Report the failures.**

**Deliverable:** `docs/concept-lock/<mode>-signoff.md`
