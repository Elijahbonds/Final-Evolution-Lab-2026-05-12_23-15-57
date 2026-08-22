# Mode 4 — Football: Phase 1 Audit & Benchmark

Gate 0 re-verified for football clips (41/41 incl. juke/spin/stiff-arm/
tackle/celebrate). Existing football suites green (retrofit 5, cam).

## 1. What exists today

- `FootballRushMode.ts` (310, v5) — endless street-rush runner: juke/spin/
  hurdle/truck evade moves with i-frames, TRUCK power answer (defender
  knockdown), STYLE CHAIN (variety-scored evade strings), flanker AI,
  breakaway, coins. Built on MobSteering + authored football clips
  (juke/spin/stiff-arm/fall/spike already in the clip registry).
- `FootballMode.ts` (128) — lighter precision/field variant.
- NO pre-snap phase, play calling, formations, audibles, or motion
  anywhere. NO passing (QB throw/catch). NO line/blocking play. NO
  down/distance structure. Rush is a runner, not football-the-sport.
- Reusable: ContactSystem (Havok bodies + momentum exchange + brace),
  CourtMovement weight model, MomentumBus, JudgePanel, CameraDirector,
  FootPlant IK.

## 2. Benchmark: Madden pre-snap (beat on CLARITY)

1. **Formation display** — see both lines/sets at a glance, labeled.
2. **Play-call flow** — fast, readable selection with intent (run/pass,
   concept), not a spreadsheet.
3. **Defensive read tool** — coverage shell / box count / blitz tells that
   a studied player can actually exploit.
4. **Audibles** — change the play/assignment post-read with low friction.
5. **Pre-snap motion** — move a receiver; watch the coverage respond (man
   vs zone tell).

## 3. Benchmark: Madden open-field movement (beat on FEEL)

1. **Build-based athletic profile** — speed/weight/agility tradeoffs
   (scat back vs power back), not one-size-fits-all.
2. **Distinct moves** — juke (lateral), spin (through contact), stiff-arm
   (reject a reach), truck (win a head-on).
3. **Ball-carrier vision** — readable lanes; blocks you can actually use.
4. **Tackle-breaking** — outcomes from timing/angle/momentum, not dice.
5. **Momentum through cuts** — plant-and-cut cost (we own this already:
   CourtMovement).

## 4. Gap list

| Mechanic | Current | Gap |
|---|---|---|
| Pre-snap phase | none | Formation/play-call/snap state machine (P2) |
| Defensive read | none | Coverage shell + box-count read tool (P2) |
| Audibles/motion | none | (P3) |
| Build profiles | none (one runner) | CarrierBuild table (P4) |
| Move set | juke/spin/hurdle/truck (runner) | formalize per-build moves, distinct windows (P4) |
| Passing | none | QB drop-back, lead-pass, route, contested catch (P5) |
| Blocking | none | Havok line matchups, lane open/close (P6) |
| Defense play | AI chasers only | coverage/rush/tackle/contest (P7) |
| Down/distance | none | small-scope: 4-down series scoring (P5+) |
