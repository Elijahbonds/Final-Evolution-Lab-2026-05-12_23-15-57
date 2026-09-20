# FEL Creative Vision — Traceability Audit (2026-08-15)

Source of truth for "are we actually delivering the vision." Every claim is
backed by a module or test suite. Test evidence: 130 suites under scripts/;
all green except `arena-tests`/`creative-card-tests`/`economy-tests`, which
require a live DATABASE_URL (DB integration suites, environment-gated by
design — their pure-logic sections pass).

## Global pillars

| Vision bar | Status | Evidence |
|---|---|---|
| Real skill expression | ✅ | Timing/positioning systems in every mode (Batting.contactEvent, TennisCore.resolveShotTiming, LandingSystem, FlickStick, ShotMeter) |
| Readable, honest systems | ✅ | Explainers everywhere (SwingReport.why, landing grades, tackle geometry, pitch reads "never confidently wrong"); zero dice-driven outcomes in play spaces |
| High-impact feedback | ✅ | gameFeel (hit-stop/shake/haptics), EffectsKit bursts, camera pulse beats, MomentumBus tier banners, CrowdEnergy audio scaling |
| Mode identity at AAA quality | ✅ per shipped mode | Distinct camera presets + ambient beds + anim trees per mode family (identity checks in camera-presets-tests, 43/43) |
| Progression with meaning | ⚠️ partial | PRQ engine + scoreScale exist; skill trees (Story P2) are data-driven; in-game mastery ladder/signature profile not surfaced yet |
| Input integrity | ✅ | InputBuffer + coyote time, deduped play() calls, gate0 + movement suites |
| Session flow (fast restart) | ⚠️ partial | Modes self-reset; no explicit "one more run" UX audit done |
| Fair challenge scaling | ✅ | PRQ-biased difficulty (StoryProgression), difficulty-scaled AI brains |
| Signature moments | ✅ | Game-Breaker events + camera pulses + staged judge reveal; dunk replay |

## Mode-by-mode

| # | Mode | Vision fantasy | Built? | Gaps vs vision |
|---|---|---|---|---|
| 1 | Basketball 1v1 | street duel mind games | ✅ full (M1) | — |
| 2 | Dunk Contest | judged style mastery | ✅ full (M1, exceeds Live 07/08 per gate) | — |
| 3 | Basketball 3v3 | teamwork momentum | ✅ full (M1) | — |
| 4 | Karate H2H (Showdown/Duel) | timing + counters | ✅ full (M2; guard impact/substitution distinct) | — |
| 5 | Karate Endless | survival flow | ✅ full (M2: waves/CC/perks/revive) | — |
| 6 | Baseball | bat-to-ball timing spectacle | ✅ core (M6: PCI + explained contact) | full game-loop integration (fielding mode wiring) pending |
| 7 | Football | lane reading, breakaway | ✅ core (M4: pre-snap + carrier geometry) | full match mode integration pending |
| 8 | Soccer | penalty pressure now, open play next | ✅ PK mode + open-play cores (M5) | full match integration pending |
| 9 | Golf | control + course reading | ✅ full core (swing/ball/course/scorecard) | full 18-hole round mode pending |
| 10 | Tennis | rally control | ✅ core (M7: timing depth + rally cam) | full match integration pending |
| 11 | Volleyball | rally discipline | ⚠️ exists via NetSportMode config | no dedicated depth pass (not in directive order) |
| 12 | Gymnastics | judged artistry | ❌ stub only | not in v1 mode list |
| 13 | Surfing | flow-state style | ✅ core (M3: wave sim + judged heats) | — |
| 14 | Skateboarding | trick identity + lines | ✅ full (M3: gesture tricks + goals + gimmick) | — |
| 15 | Snowboarding | speed + style descent | ✅ full (M3: boost + course + pipe) | — |
| 16 | Brain Brawl | cognitive speed | ⚠️ exists (retrofit tests green) | no depth pass |
| 17 | Who Scene It | memory showdown | ⚠️ exists | no depth pass |
| 18 | Court Carnival | party chaos | ✅ exists (6-event pool, random draw) | — |
| 19 | Market Browse | identity curation | ⚠️ marketplace module exists | no vision-driven UX pass |

## Story/Garden (post-mode directives)
Hub scaffolding, PRQ progression, Rival circuit, Garden core, fusion/
Colosseum — all built and tested (P1–P5). P6 (Creator Card economy)
correctly deferred pending live server-authoritative wallet.

## Recommended next moves (priority)
1. **Integration pass for precision modes** — baseball/football/soccer/
   golf/tennis have proven cores but thin full-game loops. Wire cores into
   complete match experiences.
2. **Mastery ladder surface** — PRQ + skill trees exist; no player-facing
   "I can feel myself getting better" ladder UI yet (the vision's #1 quote).
3. **Shareable highlights** — replay recorder exists for dunks; generalize.
4. Remaining stubs (volleyball/gymnastics/brain-brawl/who-scene-it) if they
   make the v1.1 cut.
