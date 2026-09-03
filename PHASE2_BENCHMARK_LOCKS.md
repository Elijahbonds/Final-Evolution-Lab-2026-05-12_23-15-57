# PHASE 2 — LOCK EVERY REMAINING BENCHMARK

**Objective**: Specify locked AAA reference titles for all 20+ modes. One sentence justification each.

**Status**: COMPLETE for the 18 modes below; later additions recorded in their own section.

## Modes with TBD Benchmarks (from MASTER_MODE_LIST)

From audit findings + MASTER_MODE_LIST:

| Mode | Current | Decision | Justification |
|------|---------|----------|---------------|
| Tennis | TBD | Mario Tennis Aces | Accessible arcade tennis with motion controls; matches FEL's party/accessible vibe + timing depth |
| Golf | TBD | PGA Tour 2K | Club selection + shot timing + course reading; proven 1v1 competitive golf formula |
| Soccer | TBD | Pro Evolution Soccer Penalty Mode | Penalty shootouts capture high-stakes pressure; full 11v11 out of scope for v1 |
| Baseball | TBD | MLB The Show (Hitting Mode) | Contact-based bat mechanics with dynamic PCI; proven single skill focus |
| Football | TBD | Madden NFL (Arcade Mode - simplified) | Pre-snap reads + carrier geometry + breakaway; street football variant |
| Gymnastics | TBD | Wii Sports Bowling (adapted) | Judged performance with timing windows; closest AAA analogue for "performance sport" |
| Dance Rhythm | TBD | Just Dance (simplified) | Choreography matching with score feedback; party game accessibility |
| Unreal Arena (orphaned) | TBD | RETIRE | Not in codebase; no bandwidth to implement in this pass |
| Velocity Kart (orphaned) | TBD | RETIRE | Not in codebase; racing doesn't fit FEL's action-sports focus |
| Aero Aces Flyer (orphaned) | TBD | RETIRE | Not in codebase; 3D flight sim too niche for v1 |

## Later Additions

Modes that shipped after this document was first written, locked since.

| Mode | Decision | Locked by | Justification |
|------|----------|-----------|---------------|
| Volleyball | **Nintendo Switch Sports — Volleyball** | Elijah, 2026-08-31 | Bump / set / spike is a three-touch sequence, which is exactly what `RallyCore`'s VOLLEYBALL config already models (`touchesPerSide: 3`); party-accessible timing depth over simulation |

> **Correction recorded.** `SESSION_STATUS_DASHBOARD.md` listed Volleyball's
> benchmark as *Wii Sports Resort*. That is wrong on its face — Wii Sports
> Resort has no volleyball mode (swordplay, archery, bowling, table tennis,
> basketball, golf, air sports, cycling, canoeing, wakeboarding, frisbee, power
> cruising). The claim also appeared nowhere in this file and nowhere in
> `VolleyballMode.ts`, unlike the board benchmarks, which are corroborated in
> code ("Skate 3 vocabulary", "SSX boost meter"). Treat the dashboard as
> unreliable for benchmark claims as well as status ones.

## Already-Locked Benchmarks (from audit)

✓ Dunk Contest → NBA Live 08 (optimized)  
✓ Basketball 1v1 → NBA 2K  
✓ Basketball 3v3 → NBA 2K  
✓ Karate VS → Soul Calibur  
✓ Karate Endless → Soul Calibur + Wave Survival (COD Zombies)  
✓ Skateboard → Skate 3  
✓ Surf → SSX  
✓ Snowboard → SSX  
✓ Court Carnival → Wii Sports Resort  
✓ Duel → Generic 1v1  
✓ Dunk Duel → NBA Live  
✓ Showdown → Tournament  
✓ Mixed Combat → MMA  

## PHASE 2 DECISION MATRIX

**Proposal for benchmarks (7 TBD + 3 orphaned):**

```
TIER A (TBD → LOCK):
  Tennis → Mario Tennis Aces
  Golf → PGA Tour 2K
  Soccer → PES Penalty Mode
  Baseball → MLB The Show (Hitting)
  Football → Madden NFL Arcade
  Gymnastics → Wii Sports Bowling Adapted
  Dance Rhythm → Just Dance

TIER B (ORPHANED → RETIRE):
  Unreal Arena → DELETE (not in codebase)
  Velocity Kart → DELETE (not in codebase)
  Aero Aces → DELETE (not in codebase)

POST-LOCK RETIREMENTS (owner decisions, 2026-09-01):
  Sprint → RETIRED from the v1 roster (no locked benchmark; offered options
    incl. Konami Track & Field cadence racing were declined). Route redirects
    to /play; the mode file stays in the registry for a future revival.
  Showdown → RETIRED from the v1 roster. Owner: "There's only supposed to be
    Karate VS, Karate Endless, Mixed Combat (Soul Calibur-like)" — and
    "karate vs is the storm mode". Showdown's Naruto-Storm identity therefore
    has no slot; Karate VS already carries the Storm reference. Route
    redirects to /play; mode file stays registered; Arena + Controller Link
    entries removed (a stake on a redirecting route is a trap).
  Duel (Weapon Duel) → RETIRED, same decision, same mechanics. The dojo
    venue card now lists Karate Endless / Karate VS only.
  (same day, locked by asking): Big Air → SSX (Big Air discipline) — was
    missing from every governing doc; locked, not invented.

POST-LOCK RE-LOCKS (owner decisions, 2026-09-01):
  Court Carnival → Mario Party / Pac-Man Fever (minigame-night gauntlet with
    a points race) — replaces the earlier Wii Sports Resort lock.
  Mixed Combat → Soul Calibur style (arena fighter) — replaces the earlier
    MMA lock; joins karate/karate-vs under the same reference family.
  Dunk Duel → the REAL-LIFE dunk contest platform. Owner, verbatim: "the
    head to head dunk contest is a real life actual footage dunk contest
    judged and scored by our AI's tracking PRQ, Flight Time, Dunk
    Difficulty." NOT a video-game duel — real footage, on-device AI tracking
    (the repo's MediaPipe pose pipeline + IRLCore flight physics), judged
    and scored from measured PRQ / flight time / dunk difficulty. The `dunk`
    mode stays "a normal video game" (the NBA Live 08 contest). The
    Babylon pass-and-play duel (signed off 8/8 same day) is the TRANSITIONAL
    occupant of /play/dunkduel until the IRL contest ships; DunkDuelMode.ts
    then stays in the tree like other superseded modes.
  Karate VS → confirmed as THE Storm mode ("karate vs is the storm mode") —
    its Soul Calibur / Naruto Storm lock stands as the family's Storm lane.
  Dance Rhythm → Class of 3000 music games (André 3000's Cartoon Network
    show — playful, instrument-stem mixing) — replaces the earlier
    Just Dance lock. Locked by asking, 2026-09-01.
```


## 2026-09-02 owner decisions — ship pass (from the two gap reports)

Asked as multiple choice, answered by the owner. These gate the 10-phase ship pass.

- **Character path:** forge GLB everywhere. Flip `PROCEDURAL_CHARACTERS` off, re-verify every mode on the real avatar, then skin/PBR/IK work lands on it.
- **Workstream order:** fidelity → modes to benchmark → Camp Blueprint.
- **Ship target:** desktop web 60 fps + mobile web 30 fps. Fidelity features carry a quality tier; mobile drops SSAO/shadows.
- **Movement:** code-driven movement + two-foot IK planting + hand IK for ball grip. No root-motion rewrite.
- **Lighting:** procedural IBL stays as v1; mount the post-pipeline; convert venues to PBR; cascaded shadows outdoors.
- **Curriculum:** Claude authors real lesson bodies + assessments from the story spine and PRQ pillars; owner reviews/replaces text later.
- **Facilitator Card:** a `CreatorCard` with `kind='facilitator'`.
- **Mentees may be minors:** guardian consent gate at intake; sessions blocked until consent.
- **Certification:** auto-graded assessment, 80% pass, owner revoke switch.
- **Resiliency metric:** retry rate after failed attempts (in-session retries after a fail + return sessions after a losing one).
- **Avatar builder scope (all four):** face + body morph-target sliders; more skin tones/hair/kits; photo-to-avatar likeness; better forge animation set.
- **Ship roster:** all 21 Babylon modes; Sprint/Showdown/Duel stay retired.
