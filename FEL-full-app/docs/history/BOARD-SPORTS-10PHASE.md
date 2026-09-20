# BOARD SPORTS — THE 10-PHASE PASS (closed 2026-09-17)

Ten phases on skate, snow and surf, run end to end without checking in. This is the closing document:
what was actually broken, what each phase delivered, which of its own claims survive re-measurement, and
what is still unverified. Every number here was read off the source or produced by a test in this
worktree. Where a phase claimed something this pass could not confirm, it says so rather than rounding up.

## WHAT WAS BROKEN (Phase 1, re-checked)

The audit's headline holds. Measured again at `ccccab6`:

| | skate | snow | surf |
|---|---|---|---|
| grind lines, before | 14 | **1** (a ski-lift cable) | **0** |
| tricks in the table, before | 15 | 12 | 8 |
| did `fitsAir` gate anything? | **no** | yes | n/a |

Three defects, in order of how much they cost the player:

1. **Skate's trick hierarchy was inert.** Hang is `2v/g`; the raised ollie gave 0.93–1.31 s and the
   longest trick needed 0.72 s, so all 15 fit off flat ground. A 15-long list with no choosing in it.
2. **Snow and surf had nothing to ride.** One grind line between them, and it was scenery.
3. **The three ride worlds could not be tested at all.** Each builder makes a `DynamicTexture` on its
   first line, which needs a canvas. Verified by trying it, not assumed. That is why every layout this
   pass added is a pure data table beside its builder.

## WHAT EACH PHASE DELIVERED, AND WHETHER ITS CLAIM HOLDS

| # | commit | claim | re-measured | holds? |
|---|---|---|---|---|
| 1 | `dc3374a` | audit: surf 0 rails, snow 1, skate's hierarchy inert | as above | yes |
| 2 | `55ebbeb` | benchmarks re-locked to what the code builds | `docs/BOARD-SPORTS-BENCHMARKS.md` | yes |
| 3 | `00693ef` | 11 snow features, none on a gate | `SNOW_SLOPE.length` **11**, 6 carry rails | yes |
| 4 | `e571354` | 3 wave profiles, 3 sections each, sets of 3, 3 in the water | `WAVE_PROFILES` **3**, 3 sections each, `SET_SIZE` 3, `SWELLS_VISIBLE` 3 | yes |
| 5 | `6418645` | the pop gates skate's table again | skate air `airSec` **0.34 … 1.24 s** against a 0.93–1.31 s hang — the top of the table now needs a charged ollie | yes |
| 6 | `379769a` | a manual is harder than a grind and pays more | `KIND_DRIFT` manual 1.3 / nosemanual 1.45 vs grind 1.0; 60 / 72 pts per second | yes |
| 7 | `b5870d2` | the animation layer is guarded, not guessed | `boardTree.continuity.test.ts` | yes, with a caveat below |
| 8 | `77ba160` | the plaza's features get goals | `SKATE_GOALS` **7**, three of them plaza gaps (`plaza_hubba`, `plaza_gap`, `plaza_wallride`); `SKATE_PLAZA.rails` 8, three named | yes |
| 9 | `ccccab6` | the crowd was standing on the park | three real faults, below | yes |
| 10 | this one | suite and typecheck green, claims checked | below | see the two failures |

### Phase 9's three faults, since it is the one this document was written on top of

- **Skate:** a group stood at `fz -0.5` and the spine's centre is `fz -0.49`, 8.4 m wide — on it. Moved to
  `fz -0.62`. The test that caught it was itself wrong: it measured centre-to-centre against
  `max(width, depth)/2`, which is a disc. It now rotates the offset into the solid's own frame.
- **Snow:** the dist-188 kicker spans lateral −15.6 … −7.6 at night-park and a spectator stood at −14. At
  alpine-run the same pair cleared by **8 cm** — and the placement carried a `Math.random()` jitter of up
  to 1.5 m, so that 8 cm was luck, not margin.
- **Surf:** the sand runs z 123…153, but the water is drawn 4 m over its near edge, so the waterline is at
  z 127 — and six of nine beachgoers stood at z ≤ 127.4, in the wash, with 26 m of empty sand behind them.

## TWO DEFECTS PHASE 10 FOUND IN MY OWN EARLIER WORK

**`kart_air` was never a registered clip.** `KART_TRICKS` gave all four rows `clip: 'kart_air'`.
`BoardTricks`' own field comment says never to invent one, because an unregistered name renders the body
in **bind pose**. `clipScope.test.ts` could not catch it either: it checks names it *recognises* against a
mode's scope, so an invented name passes straight through. Fixed — the rows ride `board_tuck` (the nose
lift is a held pose) and `board_air` (the rotations, whose angle comes from `spinDeg`/`flipDeg`).

**`velocitykart`'s clip scope was empty while its closure named eight board clips.** Importing
`BoardTricks` into `KartAir` put the whole board table in the kart mode's import closure, and the kart's
scope allowed nothing, so `clipScope.test.ts` failed with eight violations. The kart driver throws board
tricks off a boosted ramp, so the honest fix is that the kart owns the board suite — not that the check be
relaxed. `velocitykart: { suites: ['board'] }`.

Note what this means for Phase 7's claim: the animation layer is *guarded*, and the guard held — it is
what caught both of these. But the kart's own trick animation has never played. `VelocityKartMode` parks
the driver's animator, so these four clips resolve to real motion the day it stops parking and not before.

## TEST AND TYPECHECK STATE

The suite is 269 files. Run in ten batches, because a single `vitest run` exceeds this shell's 180-second
ceiling and a backgrounded run does not survive the call.

- **265 files pass** — roughly 3,700 tests.
- The board and kart layer specifically: 79 tests across `skatePlaza`, `snowSlope` and `surfLineup`, and
  74 across `clipScope`, `KartAir`, `BoardTricks` and `BoardTrickGating`.
- **`npx tsc --noEmit`: 137 errors, none in `lib/babylon`.** All 137 are `TS7006` implicit-any in
  `app/**` route handlers and predate this lane.

### The four files that do not pass, and whose they are

| file | why | mine? |
|---|---|---|
| `lib/creator/schema/sections.test.ts` | `momentum_cross @ 30` not in the slot gates — from the hoops STICK HANDLE commit `350a6ea` | **no** |
| `lib/babylon/modes/Gate0FullValidation.test.ts` | `OneVOneMode`/`ThreeVThreeMode` lost `CharacterLibrary.spawn` in the hoops PlayerSlot refactor; zero calls at the lane base `5e4b62e` | **no** |
| `tests/progression/b2b.test.ts` | collection error: `@prisma/client did not initialize` — needs `prisma generate`, an environment step | **no** |
| `scripts/headless-checks.suite.test.ts` | **not run.** Exceeds the shell's 180-second limit on its own | unknown |

That last row is an honest gap, not a pass.

## WHAT IS STILL UNVERIFIED

**Nothing in this pass has run in a browser.** Not one frame. Everything above is measured off data tables
and pure functions, which is exactly why the layouts were extracted into data tables — but a measured
layout is not a seen layout. Specifically unconfirmed:

- Whether any of it *looks* right: the plaza's 20 solids, snow's 11 features, the three wave profiles.
- Whether the crowd positions read as people watching something, rather than as bodies in a field.
- Whether the raised ollie and the re-gated trick table feel right on a stick. Phase 5 proves the numbers
  gate; it cannot prove the gate is fun.
- Whether the kart's four tricks animate. They do not today — the driver's animator is parked.
- `SurfBreakMode` still does not consume `surfLineup`. The lineup model is built, tested and unused: the
  mode needs per-profile wave-mesh reshaping and per-swell instancing first. This is the largest piece of
  work the pass leaves open, and Phase 4 did not claim otherwise.
- `scripts/headless-checks.suite.test.ts`, above.

## THE RULE THIS PASS KEPT

Measure before changing. Every phase that found something found it by computing a number the code already
implied and comparing it to the claim — the 8 cm kicker margin, the z-127 waterline, the 0.72 s longest
trick against a 0.93 s hang. Four of the ten phases changed a test rather than the code it tested, and in
every one of those the test was the thing that was wrong: a 1-D snow clearance check, a disc-shaped plaza
clearance check, a surf air-count criterion that conflicted with an existing design test (the codebase's
intent won), and a balance channel that could not be measured because `Math.random()` sat inside it.

My own errors are left in the commits and in this table rather than edited out. There are more of them
here than I would like — two in Phase 10 alone, both mine, both from earlier phases in this same lane.
