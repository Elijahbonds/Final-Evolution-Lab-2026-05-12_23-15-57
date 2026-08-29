# Mode 7 — Tennis: Phase 1 Audit & Benchmark

Gate 0 holds (41/41; tennis forehand/serve alias the shared rig).

## 1. What exists today

- `RallyCore.ts` (230, DELIBERATELY Babylon-free) — the shared net-sport
  engine: `gradeSwing` timing bands (perfect/good/early/late/miss — early
  and late are DISTINCT and push the ball to different depths),
  QUALITY_POWER, flight math, tennis scoring. Suites green
  (court-rally 9/9, rally-outcome 56/56).
- `TennisMode.ts` — a config over `NetSportMode` (one touch per side,
  deuce/advantage, first to 4 games).
- `SoccerBall` (Mode 5) — real Magnus/drag/grass ball; tennis reuses with
  a felt-court tune.
- No positioning-quality model, no shot types (topspin/slice/flat/drop/
  lob), no serve mechanics, no volleys/overheads, no rally camera system,
  no split-step/footwork model.

## 2. Benchmark: Top Spin/AO — shot-timing depth (beat it)

1. **One timing input shapes power+placement+spin simultaneously** —
   early = defensive/short/angled-off, perfect = full, late = jammed/weak.
2. **Positioning changes the window** — set feet widen it; stretching
   narrows it and caps the shot menu.
3. **Commitment risk** — early commitment is safer but weaker; late is
   risky but bigger.
4. **Shot selection under pressure** — the same timing input yields
   different shot TYPES by context (on-the-run vs set).
5. **Recovery positioning** — after the shot, getting back is part of the
   next shot's quality.

## 3. Benchmark: rally camera flow (beat it)

1. **Framing reads court + trajectory** — both players and the ball's arc
   legible every shot.
2. **Pacing tightens with rally length** — camera pushes in as the rally
   builds (escalation you can feel).
3. **Baseline↔net transitions are smooth** — one continuous language, not
   two games spliced.
4. **Winner payoff beat** — the rally-ending shot gets a camera moment.

## 4. Gap list

| Mechanic | Current | Gap |
|---|---|---|
| Timing depth | gradeSwing bands + power | timing drives placement + spin too (P3) |
| Positioning quality | none | footwork/set-feet model (P2) |
| Shot types | none | topspin/slice/flat/drop/lob via Magnus (P4) |
| Serve | none | toss + flat/kick/slice + fault risk (P5) |
| Net play | none | volley windows + overheads + approach (P6) |
| Rally camera | fixed 'court' preset | rally-flow director with escalation (P9) |
