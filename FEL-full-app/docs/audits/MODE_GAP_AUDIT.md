# Per-mode gap audit — goal · gameplay · visual · performance · multiplayer

**Date** 2026-09-12 · 22 enabled modes · suite 99 files / 843 tests green

**What is measured vs inferred.** Bundle sizes are from the production build. Test counts, opponent
slots and line counts are counted from source. Gameplay findings marked ✔ were verified this session
by reading the code or running a probe. **Per-mode frame rate was NOT measured** — there is no
captured profile for most modes, and I will not invent numbers. Visual notes for modes I have not
rendered are marked *unverified*.

---

## The headline gaps

| # | Gap | Severity |
|---|---|---|
| 1 | **19 of 22 modes cannot take a remote player.** Only 3 have an opponent slot. | high |
| 2 | **`/play/mirror` ships 2.03 MB** of first-load JS — 12× every other route (~160 kB). | high |
| 3 | **7 modes have zero tests**: threepoint, football, bigair, freerun, dance, volleyball, tennis, golf, who_scene_it. | medium |
| 4 | **No per-mode performance profile exists.** The Phase-3 anim budget gate cannot be judged. | medium |

---

## Multiplayer readiness — the real shape of gap #1

Netplay swaps a `PlayerSlot`'s `ControlSource` from AI to the wire. A mode can take a remote player
**only if it has an opponent slot**. Counted from source:

| Mode | Opponent slots | Netplay status |
|---|---|---|
| `onevone` | 3 | ✔ **wired** (`?net=<room>`) |
| `threevthree` | 2 | ready — same swap, not yet wired |
| `karate` (endless) | 2 | ready — co-op horde, not yet wired |
| `karate_vs`, `mixedcombat`, `dunkduel` | **0** | head-to-head by design but rival is scripted, **not** a slot |
| dunk, threepoint, skateboard, snowboard, surf, bigair, freerun, dance, golf, tennis, volleyball, who_scene_it | **0** | solo score-attack — see below |

**This is the honest answer to "make all modes multiplayer":** it is not one pass. Three tiers:

1. **Two modes are a small job** — `threevthree` and `karate` already have slots; each needs the
   same one-line swap 1v1 got, plus testing with two browsers.
2. **Three modes need refactoring first** — `karate_vs`, `mixedcombat`, `dunkduel` are head-to-head
   *in fiction* but drive the rival through bespoke scripted logic rather than a slot. Each needs its
   opponent converted to a `PlayerSlot` before netplay can touch it. That is real work per mode, and
   it risks the tuned fight behaviour those modes have.
3. **Twelve are solo score-attack** — skate, surf, dunk, dance, golf… There is no opponent to
   replace. "Multiplayer" for these means one of: **async challenge** (already shipping — all 22 are
   now challengeable), **shared-session racing** (both players in one world, new work), or **ghosts**
   (replay the rival's run alongside yours — cheapest convincing option, and a natural fit for
   skate/snowboard/surf/freerun).

---

## Per-mode detail

Legend — MP: ✔ wired · ○ slot-ready · ✗ needs refactor · − solo

| Mode | Lines | Tests | MP | Notes |
|---|---|---|---|---|
| **dunk** | 2265 | 3 | − | The most developed mode. Judging derives its band from `JUDGE_COUNT`, remembers repeated style+prop combos ✔. Venice court repainted. Solo by design; async challenge only. |
| **onevone** | 1725 | 3 | ✔ | Netplay wired. Carries the defence package + both move kits. Highest regression risk in the repo. |
| **threevthree** | 1665 | 3 | ○ | Tie now reports DRAW ✔. Two slots — next netplay target. |
| **threepoint** | 753 | **0** | − | No tests. Shootout; async only. |
| **dunkduel** | 744 | 2 | ✗ | Head-to-head fiction, scripted rival. Needs slot refactor. |
| **karate** (endless) | 951 | 2 | ○ | Two slots — **co-op** horde is the natural netplay shape here, not versus. |
| **karate_vs** | 473 | 3 | ✗ | ✔ Fixed this session: recorded **every win as a loss**. Needs slot refactor for netplay. |
| **mixedcombat** | 641 | 3 | ✗ | Same shape as karate_vs. |
| **football** | 583 | **0** | − | No tests. |
| **skateboard** | 767 | 2 | − | ✔ Two scoring bugs fixed (combo goal + buzzer paid unlanded pots). Best **ghost-race** candidate. |
| **snowboard_slalom** | 374 | 2 | − | Ghost-race candidate. |
| **surf** | 392 | 2 | − | Ghost-race candidate. |
| **bigair** | 288 | **0** | − | No tests. |
| **freerun** | 482 | **0** | − | No tests. Ghost-race candidate. |
| **dance** | 439 | **0** | − | No tests. "GOOD" for a zero-star run is generous wording; substance honest ✔. |
| **carnival** | 401 | 3 | − | Hub of mini-games. |
| **volleyball / tennis** | 31 / 27 | 0 | − | **Low lines is correct here** — thin configs over shared `NetSportMode` + `RallyCore`. The pattern the locomotion core is chasing ✔. |
| **golf** | 85 | 0 | − | Thin config over `precisionModes`. |
| **who_scene_it** | 251 | 0 | − | Quiz; async only. |

---

## Performance

**Measured (production build, first-load JS):**

| Route | First load | Verdict |
|---|---|---|
| `/play/mirror` | **2.03 MB** | ⚠️ 12× the norm — investigate before it ships to anyone |
| `/play/map-preview` | 362 kB | high, second outlier |
| `/play/carnival` | 192 kB | slightly heavy |
| `/play/dunkduel` | 175 kB | fine |
| every other `/play/*` | ~160 kB | healthy; Babylon is lazy-loaded per mode |
| shared baseline | 89.9 kB | healthy |

**Not measured:** runtime frame rate per mode, animation-pass ms, draw calls, VRAM. The only live
figures I have are incidental from probe screenshots (skate: 60 fps, 16.7 ms avg, 782 draws, ~205 MB
VRAM — and `draws 782 > 600` was flagged by the app's own dev HUD). **The Phase-3 gate "animation
pass ≤ 4 ms" remains unjudgeable** until `scene.instrumentation` is captured in a probe run — roughly
an hour of work, repeatedly deferred, and the honest top of the performance backlog.

---

## Visual

**Verified this session:** the landing page and `/try` guest funnel render well — strong hook, clean
venue picker, correct canvas sizing at dpr 2. Share cards now carry the real hook.

**From prior passes (this repo's own commit record):** Venice court repainted; ACES tone mapping,
bloom, SSAO2, cascaded shadow maps, PBR + procedural IBL all present; dynamic FOV added this session
for the two basketball cameras.

**Unverified:** I have not rendered the other 20 modes this session. My notes warn the in-app browser
pane cannot be trusted for mode rendering (it suspends rAF), so honest visual grading needs the
Playwright probe kit — `scripts/probes/` already has per-mode eye scripts for several of them.

---

## What I would do next, in order

1. **`/play/mirror`'s 2.03 MB** — one route is 12× the rest; likely an un-split import. Cheap to find.
2. **Instrument one probe run** for real ms/frame numbers, so performance stops being a guess.
3. **Netplay `threevthree` + `karate` co-op** — slot-ready, same one-line swap as 1v1.
4. **Ghost races** for skate/snow/surf/freerun — the cheapest convincing multiplayer for 12 solo modes.
5. **Tests for the 7 uncovered modes** — threepoint and football are the biggest (753 and 583 lines
   with zero coverage).
