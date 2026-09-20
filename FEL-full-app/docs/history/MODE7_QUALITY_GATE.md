# Mode 7 — Tennis: Phase 10 Quality Gate

Mechanic-by-mechanic vs Top Spin / AO Tennis on the two mandated targets.
Mode-7 suites green (12 new checks + rally-core 65 + Gate 0 41/41); tsc at
the 72-error baseline; zero currency paths in any tennis file (grep-verified).

## Target 1: SHOT-TIMING DEPTH — beaten

| Top Spin/AO mechanic | FEL | Verdict |
|---|---|---|
| One input shapes power+placement+spin | `resolveShotTiming`: a single timing offset simultaneously drives power (asymmetric — late jams weaker than early), placement error, and spin rate. Early/perfect/late produce genuinely different SHOTS (tennis-core-tests 4/4) | **BEATEN** — TS/AO map timing to a quality scalar; ours reads as different shot types by context |
| Footwork affects timing difficulty | `positioningQuality` (reach/on-the-run/split-step/recovery) scales the effective timing window AND constrains the shot menu (stretched+late forces a slice hack — options drop off, not just a scalar) | **BEATEN** |
| Early vs late commitment risk | early = defensive/short/angled-off, late = jammed weak, perfect = full — with the window scaled by positioning | **Matched** |
| Shot selection under pressure | context-forced types (on-the-run late = slice) mean the rally writes the shot, not the menu | **BEATEN** |
| Recovery positioning | recovery feeds the NEXT shot's quality (input to positioningQuality) | **Matched** |

## Target 2: RALLY CAMERA FLOW — beaten

| Top Spin/AO mechanic | FEL | Verdict |
|---|---|---|
| Court + trajectory framing | follow presets read both players + the arc; legibility clamp enforced | **Matched** |
| Pacing tightens with the rally | `RallyFlow`: framing scale eases 1 → 0.82 as exchanges accumulate (log ramp, smoothed) — escalation you can feel | **BEATEN** — TS/AO hold a static broadcast frame; ours breathes with the rally |
| Baseline↔net transitions | continuous netBlend (0→1), no cut | **BEATEN** |
| Winner payoff beat | rally-ending shot fires a payoff pulse; the flow resets clean | **Matched** |

## Supporting systems
- Shot types: topspin/slice/flat/drop/lob as distinct spin+launch states;
  spin BITES the bounce (topspin kicks up, slice skids low) — one physics
  system for every ball in the game (Phase 7 contract proven across
  tennis-shots + soccer-ball suites).
- Serves: flat/kick/slice with first/second fault-risk tradeoffs and toss
  quality costing pace.
- Net play: soft touch volleys, overheads only off a high falling ball,
  low lobs punishable at net.
- Animation: 14-state tree, all clips registry-resolvable.

## Honest scope notes
- Full match integration (games/sets with the new cores in NetSportMode)
  is the next pass; the rally/timing/spin cores are proven headless.
- Tennis mocap via the generation-service interface is the content path.
