# Basketball modes — ship report

**Streetball 1v1 · Basketball 3v3 · Dunk Contest.**
Benchmark: **NBA 2K** (1v1, 3v3) and **optimized NBA Live 08** (Dunk), bible §4.1.

All three have been through the 10-Phase Convergence Protocol, are signed off
8/8 individually, and have now had a joint finalization pass. This is the
summary of where they actually stand — including what is not finished.

---

## Verified, on this build

Every number below was measured, not asserted.

| | 1v1 | 3v3 | Dunk |
|---|---|---|---|
| Route | `/play/onevone` | `/play/threevthree` | `/play/dunk` + **`/try` (guest)** |
| **Phase 9 on the SHIPPING route** | ✅ logged in, 2–2 / 6–0 / **12–0** | ✅ logged in, **8–8 / 8–4** | ✅ `/try`, full contest |
| `[FEL-FRAME]` | **0** | **0** | **0** (3 consecutive runs) |
| MISSING CLIP | **0** | **0** | **0** |
| Console errors | **0** | **0** | **0** (guest 401s reported separately) |
| Frame time | 16.7ms @ 60fps | 16.7ms @ 60fps | 16.7ms @ 60fps |
| Draw calls | 37 | 56 | 34 |

`npm test` — 4 files, **56 tests green**.

## Shared systems these three now agree on

The recurring failure across all three was **two numbers describing one thing,
never compared**. Each is now a single source with a test across every mode:

- **The rim.** All three shot at rims 10–12m from their own visible hoop, at a
  height of 2.70m against a regulation 3.05m. `basketball-rules-tests` diffs
  every mode's rim against its venue's hoop props.
- **The arc.** Three independent flat-radius constants (6.75, 6.7, and 3PT's
  original) for a line that runs 6.71m in the corners and 7.24m at the top.
  Now `threePointRadius()` / `isThree()` in `BasketballCore`.
- **Scoring.** 1v1 and 3v3 both awarded **1 point for a dunk** while jumpers
  scored 2 or 3 — in files whose own comments record that exact bug being fixed
  for the jump-shot branch only.
- **Forward.** Every input source reports up-stick as negative; the movement
  layer means the opposite. Humans walked backwards while AI moved correctly.
  Normalised once in `LocalInputSource`.
- **The camera box.** `mountVenue` computed camera bounds from ground *size*,
  ignoring the *offset* the half-court venues need — pinning the camera and
  dropping the hero out of frame.
- **Framing.** Dunk framed against the ball *in the dunker's own hand*, the
  failure the protocol records against 3PT.

## Balance — the last thing that made them unshippable

Both non-dunk modes were technically clean and still not games:

- **1v1's opponent could not get the ball.** The rebound was a deterministic
  distance check and the shooter is always closest. `foeScore` was 0 in every
  run ever played. Now a contest, with BOX OUT worth a body length.
  Missing every shot loses 0–2; shooting well wins 6–2.
- **Dunk was decided before your second attempt.** A blown dunk scored zero
  while the rival rolled a ~43 card every time — "down 48" after one round.
  A miss is now judged (near the panel's floor of 30, which is the real event's
  scale) and the rival blows one ~18% of the time. Skill curve, asserted:
  **40% → 25% win, 60% → 50%, 80% → 77%.**

## Not finished — stated plainly

1. ~~Phase 9 for 1v1 and 3v3 ran through `/dev/mode/*`~~ — **CLOSED.** All three
   are now playtested through `/play/*`, logged in as an ordinary player via the
   real `/login` form. `scripts/ensure-playtest-user.ts` creates the account;
   nothing bypasses the gate. 1v1 finished 12–0 past its target of 11 and 3v3
   finished 8–8, both on the shipping host with its own `GameShell` chrome.
2. **No test on real hardware.** Everything here is desktop Chromium plus one
   emulated mobile viewport. Thermals, GPU behaviour and true touch latency are
   unverified for all three.
3. **`DunkDuelMode` sets `judgeReveal` and its host renders nothing** — its judge
   cards are invisible. It is a fourth mode, outside this pass, and it inherits
   the five-judge panel.
4. **Karate Endless has a pre-existing `[FEL-FRAME]` issue**, and its forward
   direction is **unverified** — its hero never moved under the test harness, so
   the platform stick fix is neither confirmed nor refuted there.
5. **`game-data` venue names disagree with the venue specs** in several modes
   (cosmetic).
6. **Dunk D2 (four-competitor field) and D7 (alley-oops)** remain ruled out of
   scope / deferred, as recorded in the concept lock.

## Where the proof lives

`docs/concept-lock/` — `onevone.md`, `threevthree.md`, `dunk.md` and each
`-signoff.md`. The 3v3 sign-off's Phase 3 section documents its own two wrong
answers before the right one, deliberately.
