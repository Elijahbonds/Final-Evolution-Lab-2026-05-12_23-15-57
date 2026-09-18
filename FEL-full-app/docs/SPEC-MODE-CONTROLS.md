# SPEC — Mode Controls / Move-List Audit

**Date:** 2026-09-05 (PT)  
**Repo:** FEL-full-app @ babylon9-aaa-rendering  
**Base HEAD:** `f34b1ec` (Athlete LOOK: track elijah-rival.glb…)  
**Scope:** Pad verbs (`lib/babylon/ui/modeVerbs.ts`), HUD hints (`lib/babylon/modes/*`), legacy CONTROLS overlays (`MODE_BINDINGS`), carnival event copy.  
**Do-not-regress:** Dunk soft #1 hold-to-run · Venice DualShock overlay layout.

---

## Fixes landed this pass (local commit)

| Pri | Change | File |
|-----|--------|------|
| P0 | dunk + dunkduel pad **Y** label `CHARGE` → **`RUN`** (emit still `RT` hold) | `lib/babylon/ui/modeVerbs.ts` |
| P1 | football: **JUKE R** moved to **Y** (`emit Y`); **TRUCK** hold moved to **B** (`RT` hold). SPIN stays gamepad/keyboard-only (concept lock). | `lib/babylon/ui/modeVerbs.ts` |
| test | dunkduel depth test expects `RUN` not `CHARGE` | `scripts/dunkduel-depth-tests.ts` |
| copy | dunk-babylon comment: pad's RUN button | `components/games/dunk-babylon.tsx` |

DunkMode / DunkDuelMode hold-run logic **not** touched.

---

## Audit table (Babylon shell + TouchOverlay)

Legend: **PASS** = UI copy matches actual input · **FAIL** = wrong/leftover language · **SOFT** = jargon or shared-deck mismatch, playable.

| modeId | UI copy shown | Actual input | Result | Fix note |
|--------|---------------|--------------|--------|----------|
| **dunk** | HUD: `HOLD to run — then tap jump`; pad Y **RUN** [hold]→RT; A SLAM; B STYLE; X PROP | RT hold = run-up; release/tap jump; A = slam QTE | **PASS** (post-fix) | Soft #1 HUD already correct; pad was CHARGE → **RUN** |
| **dunkduel** | HUD: `HOLD to run`; pad Y **RUN** [hold]; X CHAIR; A SLAM; B STYLE | Same run-up + slam; X arms chair | **PASS** (post-fix) | Pad CHARGE → **RUN** |
| **football** | Pad: HURDLE / JUKE L / JUKE R / TRUCK[hold]; HUD: HOLD TRUCK | A hurdle, X/Y juke L/R, RT truck, B spin (kb/pad) | **PASS** (post-fix) | Was: B labeled JUKE R emitting Y |
| **karate** | JAB/KICK/BLOCK/HEAVY; hint tap/hold BLOCK | Face buttons match | **PASS** | |
| **karate_vs** | Same as karate | Same | **PASS** | |
| **onevone** | SHOOT[hold], BLOCK, STEAL, BOX OUT; HUD L1/LT BOX OUT | RT shot meter; L1 brace; A block; X steal | **PASS** | |
| **threevthree** | SHOOT[hold], PASS, STEAL, BLOCK; HOLD SHOOT green | Matches | **PASS** | |
| **carnival** (deck) | GO / TRICK / POWER / CHARGE[hold] | Shared 4-button deck across events | **PASS** deck | Per-event copy below |
| carnival · slam_rush | `HOLD CHARGE, release near the top for a make` | RT hold = power meter, release near ~0.85 | **PASS** | Real charge meter (not run-up) — keep CHARGE |
| carnival · strike_storm | `Mash GO / TRICK / POWER` | A/B/Y attacks; pad labels GO/TRICK/POWER | **PASS** (post-fix) | Hint aligned to pad verbs |
| carnival · trick_gauntlet | `POP, flip…` | A jump, B/Y flips, RT pump; X spin unused on deck | **SOFT** | X spin missing from 4-btn budget (documented) |
| carnival · hot_shot | `Aim, GO to power, GO to shoot` | A twice (aim→power→shoot); pad GO | **PASS** (post-fix) | Hint uses GO |
| carnival · coin_storm | Sprint the pattern | Stick move + pickups | **PASS** | |
| carnival · counter_strike | `tap GO at the last instant` | A in window | **PASS** | |
| **skateboard** | POP/FLIP/GRAB/PUMP; PUMP for speed | Matches | **PASS** | |
| **snowboard_slalom** | JUMP/SPIN/GRAB/TUCK | Matches | **PASS** | |
| **surf** | AIR/CUTBACK/GRAB/CARVE | Matches | **PASS** | |
| **tennis** | DRIVE/SLICE/DROP/LOB | Matches | **PASS** | |
| **golf** | SWING/CLUB; meter hints | A swing, B club | **PASS** | |
| **volleyball** | HIT/BLOCK | A hit, B block | **PASS** | |
| **mixedcombat** | STRIKE/KICK/GUARD/HEAVY | Matches loadout fight | **PASS** | |
| **duel** | FISTS/BLADE/BLOCK/STAFF | Select then fight verbs | **PASS** | |
| **showdown** | JAB/KICK/GUARD/ULTIMATE; L1/R1/SELECT in hint | Shoulders kb/pad only | **PASS** | Hint already discloses |
| **gymnastics** / **bigair** | FLIP+STICK / SPIN+STOMP; d-pad cadence | AirSession d-pad strides | **PASS** | |
| **sprint** | inert diamond; alternate D-PAD | Cadence only | **PASS** | |
| **threepoint** | SHOOT | A release | **PASS** | |
| **dance** | TAP | A/B on beat | **PASS** | |
| **derby** / **penalty** | SWING / STRIKE | TimingSport A | **PASS** | |
| **soccer** (legacy SoccerMode) | Power up and shoot | Simple power shot | **PASS** (basic) | Precision penalty uses KICK language — OK |

---

## Legacy Three.js CONTROLS overlays (`lib/scene/input-manager.ts` MODE_BINDINGS)

Used by dunk-game-3d / three-v-three-3d / karate-versus-3d / three-point-3d boot overlays — **not** the Babylon DualShock pad.

| Binding key | Copy | Actual (legacy scene) | Result | Fix note |
|-------------|------|----------------------|--------|----------|
| basketball_dunk | SPACE / TAP: **Hold run / tap jump** | Plain-language overlay (Babylon path is hold-to-run) | **PASS** (copy) | Display only; do not put CHARGE back on Babylon pad. |
| basketball_3v3 | Pass lanes + Shoot | Scene-local | **SOFT** | Separate from threevthree Babylon |
| basketball_h2h | Shoot / Release | 3PT-ish | **SOFT** | |
| karate_versus | Slash/Heavy/Kick/Guard | Scene-local | **SOFT** | Labels differ from Babylon JAB/KICK/BLOCK/HEAVY |

---

## Controller Link schemas (phone companion)

| mode | Label still CHARGE? | Note |
|------|---------------------|------|
| dunk / dunkduel | **No** (`action: 'charge', label: 'RUN'`) | Action id stays `charge` (adapter→RT). Display label **RUN** matches pad. |
| football | JUKE R on Y + TRUCK hold | Already matched; modeVerbs now aligned |
| carnival | CHARGE hold | Correct for slam_rush meter |

---

## Remaining FAIL backlog (Gameplay)

1. ~~carnival hot_shot hint KICK→GO~~ **done**  
2. ~~carnival strike_storm hint → GO/TRICK/POWER~~ **done**  
3. ~~Controller Link dunk/dunkduel CHARGE→RUN~~ **done** (display only; action id `charge`)  
4. ~~Legacy MODE_BINDINGS basketball_dunk "Charge / Jump"~~ **done** → Hold run / tap jump  
5. Optional: dunk-game.tsx canvas string `HOLD … TO CHARGE` (pre-Babylon canvas).

---

## DualShock / soft #1 regression check

- TouchOverlay still uniform diamond + sticks; only labels/emits changed.  
- dunk/dunkduel **emit** still `RT(1)` + `hold: true` — hold ring unchanged.  
- DunkMode hints still "HOLD to run" — untouched.  
- football gamepad B still SPIN via LocalInputSource; touch B is now honest TRUCK hold.

---

## Sources grepped

`HOLD CHARGE`, `controlScheme`, move list, `MODE_VERBS`, `MODE_BINDINGS`, `setHud({ hint`, `TouchOverlay`, `game-shell`, `components/games/*`, `lib/babylon/modes/*`, `lib/babylon/ui/modeVerbs.ts`, `lib/controller-link/schemas/registry.ts`.
