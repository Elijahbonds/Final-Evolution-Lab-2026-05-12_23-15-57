# Karate Endless — defect pass (NOT a convergence pass)

**Mode id:** `karate` · **Implementation:** `lib/babylon/modes/KarateEndlessMode.ts`

## Why this is not a sign-off

`KarateEndlessMode` is listed in the Master Design Bible under **§4.3 — Orphaned /
Divergent Modes, Retire-or-Mount Decision Required**, with an explicit
instruction:

> *"Do not run a completion pass on these until Elijah makes an explicit
> retire-or-mount call... treating them as active backlog risks exactly the
> scope-drift failure mode flagged in Section 0."*

Elijah asked for this mode directly on 2026-08-31, which is read here as the
**mount call**, and it is recorded so §7.7 ("no orphaned-mode work smuggled in")
stays auditable on the other five sign-offs.

Two things follow, and they are why this file is not a sign-off:

1. **§4.3 carries no benchmark.** §7.3 is explicit that a mode without a locked
   benchmark cannot enter Phase 1, and that a benchmark must never be invented.
   So no parity claim is made here and no §7 checklist is run.
2. **This is a defect pass only** — the known faults are fixed and verified, and
   nothing is claimed beyond that.

**A benchmark still needs locking before this mode can have a real pass.**

---

## Fixed

**F1 — The camera was pinned against the mat edge.**
The camera's bounds are derived from the ground mesh. The mat was 16×16, the
player clamped to ±8 — exactly the mat's half-extent — and the bounds clamped the
camera to ±6.8. A player at the edge therefore had the camera 1.2m behind them
and themselves out of frame. **Every `[FEL-FRAME]` line this mode produced was a
hero at ±8.**

The mat is now 24×24 and the play area is inset to ±7.5, leaving 3.3m clear
behind the `overShoulder` rig. A wave brawler with five enemies wanted the space
regardless. Same root cause as Karate VS's D7 and the two half-court basketball
venues, and now covered for both karate modes by `fight-balance-tests`.

**F2 — The host did not defer its harness start.**
`karate-babylon.tsx` called `runMode` immediately: the StrictMode double-mount
that rendered 3v3 as an empty void and the Dunk guest path black.

## Checked and deliberately NOT changed

**Forward is correct here.** Karate VS had `-stickY` inverted and it was fixed
there, so the obvious move was to repeat it. It would have been wrong: this
mode's camera is **facing-derived** (`snapTo(pos, pos + facingVec())`) and the
facing comes from the same `-stickY`, so the two are self-consistent — pressing
up turns the fighter and the camera swings in behind. Verified before touching
it, not assumed from the pattern.

**It does not use `FightCore`.** The Karate VS sign-off originally claimed this
mode "shares FightCore, so it inherits the reactive-guard fix". That was wrong —
it imports nothing from `FightCore` and has its own combat. The claim is
corrected in that document.

## Verified after the fixes

Three runs through `/dev/mode/karate` and one through the shipping route
`/play/karate`, logged in:

```
waves 1 -> 2 reached, 5-6 KOs per run, perk shop and chi burst live
[FEL-FRAME] 0   MISSING CLIP 0   errors 0     (all four runs)
```

## Still open

1. **No locked benchmark** — the blocker on a real pass.

## §4.3 resolved: three of the four never existed

Elijah asked what `UnrealArenaMode` was, saying he never wrote it. He is right.

`UnrealArenaMode`, `VelocityKartGrandPrixMode` and `AeroAcesFlyerMode` appear
**only in markdown audit paperwork** — never in a `.ts` or `.tsx` file anywhere in
the repository. There is no route, no host, no registry entry and no reference of
any kind in source. A previous audit had already reached the same conclusion and
said so plainly:

> `Unreal Arena ❌ NOT FOUND in codebase`
> `UnrealArenaMode: FORMALLY RETIRED (not in codebase)`

The bible's §4.3 inherited those three entries from that paperwork and still
lists them as awaiting a retire-or-mount decision. **They cannot be mounted;
there is nothing to mount.** They should be struck from §4.3 rather than carried
as backlog — carrying phantom entries is itself the scope-drift §0 warns about.

That leaves `KarateEndlessMode` as the only real §4.3 mode, and it is now
mounted (this document). **§4.3 is closed.**
2. **No World-Population pass, no §7 checklist** — deliberately, per the above.
3. **Not tested on real hardware**, same as every other mode.
