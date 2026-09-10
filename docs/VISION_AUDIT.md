# FEL Creative Vision — Traceability Audit (2026-09-10)

> Updated 2026-09-10. The three moves this audit recommended have landed:
> a real CI + deployment pipeline (docs/DEPLOYMENT.md), the mastery ladder
> surface (/mastery), and the precision-mode integration pass
> (lib/sports/match/*). Rows below reflect that; see the bottom of the file
> for what is still open.

Source of truth for "are we actually delivering the vision." Every claim is
backed by a module or test suite. Test evidence: 137 suites under scripts/,
discovered and run by `scripts/ci-suite.ts` (`yarn test`), all green — the
ten DB-backed suites included, against the Postgres service CI provides.
The suite list is no longer hand-maintained, so a new suite cannot be added
and silently never run.

## Global pillars

| Vision bar | Status | Evidence |
|---|---|---|
| Real skill expression | ✅ | Timing/positioning systems in every mode (Batting.contactEvent, TennisCore.resolveShotTiming, LandingSystem, FlickStick, ShotMeter) |
| Readable, honest systems | ✅ | Explainers everywhere (SwingReport.why, landing grades, tackle geometry, pitch reads "never confidently wrong"); zero dice-driven outcomes in play spaces |
| High-impact feedback | ✅ | gameFeel (hit-stop/shake/haptics), EffectsKit bursts, camera pulse beats, MomentumBus tier banners, CrowdEnergy audio scaling |
| Mode identity at AAA quality | ✅ per shipped mode | Distinct camera presets + ambient beds + anim trees per mode family (identity checks in camera-presets-tests, 43/43) |
| Progression with meaning | ✅ | PRQ engine + scoreScale + data-driven skill trees, now surfaced: /mastery reads band position, form trend and what moves each rung next (lib/mastery/mastery-ladder.ts, mastery-ladder-tests) |
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
| 6 | Baseball | bat-to-ball timing spectacle | ✅ full | plays a 3-inning game: outs, innings, base runners, walk-offs (BaseballGame). Fielding is still a resolved beat, not a played phase |
| 7 | Football | lane reading, breakaway | ✅ full | drives now resolve into a possession game with a scoreboard and overtime (FootballGame). The opponent's drive is a resolved beat |
| 8 | Soccer | penalty pressure now, open play next | ✅ full (PK) | real shootout: alternating kicks, early clinch, sudden death (SoccerShootout). Open play still unbuilt |
| 9 | Golf | control + course reading | ✅ full (9 holes) | plays a 9-hole round: strokes from the lie, par, pick-up cap, to-par card (GolfRound). 18 holes is a course-data change, not a code change |
| 10 | Tennis | rally control | ✅ full | best of three sets, two-game margin, tiebreak (TennisMatch) on top of the existing deuce/advantage points |
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

## Done since the last audit (2026-09-10)

1. ~~**Integration pass for precision modes**~~ — done. `lib/sports/match/*`
   supplies the structure the five modes were missing (point/game/set/match,
   stroke/hole/round, out/inning/game, kick/round/shootout,
   drive/possession/game); each live mode is wired to its engine and ends on
   the sport's own score. Covered by `match-structure-tests` (the rules) and
   `precision-integration-tests` (the wiring).
2. ~~**Mastery ladder surface**~~ — done. `/mastery`.
3. **Deployment** — the gap this audit did not record: there was no CI, no
   env template and no build gate at all. See `docs/DEPLOYMENT.md`.

## Recommended next moves (priority)

1. **Shareable highlights** — replay recorder exists for dunks; generalize.
2. **Played opponent phases** — every head-to-head precision mode now HAS an
   opponent, but their turn is a resolved beat (a simulated drive, half-inning
   or kick) rather than a phase you play against. Baseball fielding and
   football defense are the two that would gain most.
3. **Soccer open play** — the shootout is complete; the open-play cores from
   M5 are still not a mode.
4. **Golf's back nine** — GolfRound takes any hole list; an 18-hole card is
   course data plus venue art, not new code.
5. Remaining stubs (volleyball/gymnastics/brain-brawl/who-scene-it) if they
   make the v1.1 cut.
