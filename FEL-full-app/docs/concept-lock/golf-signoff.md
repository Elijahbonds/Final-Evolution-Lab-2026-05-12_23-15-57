# §7 Completion Checklist — Golf

Phase 10. Benchmark: **PGA Tour 2K**, locked in `PHASE2_BENCHMARK_LOCKS.md`.

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified | ✅ |
| 7.2 | 10-Phase Protocol run in full | ⚠️ **Phase 3 does not pass** |
| 7.3 | Benchmark parity | ✅ D1, D2, D3, D4, D5, D7, D8 built; D6 accepted |
| 7.4 | World-Population Protocol | ⚠️ **not run** |
| 7.5 | Shell conventions | ✅ |
| 7.6 | vitest green | ✅ 63 tests |
| 7.7 | No orphaned-mode work | ✅ |
| 7.8 | No §6 scope bleed | ✅ |

## Verdict: **NOT SIGNED OFF — 6 of 8.**

The mode is transformed and the two failing items are named rather than rounded.

---

## Built this pass

Every pillar the benchmark's own lock names, plus the two things that make golf
golf:

- **Clubs** — DRIVER / IRON / WEDGE differing in reach, launch **and
  forgiveness**, so a short club punishes a bad strike less. That trade is what
  stops the driver being the always-answer.
- **Wind** — shown before you commit, applied for the whole flight, so a long
  club spends longer in it.
- **The 2K stick swing**, added *alongside* 3-click as recommended and approved.
  Both end in one `strike()`.
- **Stroke play** — eagle/birdie/par/bogey against a per-hole par, and the ball
  is **played from where it lies**. A hole used to be one shot scored by
  proximity.
- **Putting** — inside 9m the putter is automatic, rolls along the ground, and is
  the least forgiving club in the bag, because on the green the line is the whole
  shot.
- **Out of bounds** — penalty stroke and a drop.
- Distances rescaled: a full driver carried ~240m at holes 42–70m out, so every
  shot sailed the green and a hole could never be completed.

## Phase 3 — DOES NOT PASS, and here is exactly where it stands

Frame warnings went 16 → 3 → 7 → 10 depending on run length (they scale with
shots taken, so the per-shot rate is roughly flat). **Four real defects were
found and fixed on the way, none of which was the whole story:**

1. **The camera was driven only during flight.** A Phase 3 violation outright,
   and the source of two `[FEL-WATCHDOG] still black after rescue` errors. Now
   updated every frame; those errors are gone and have not returned.
2. **`setFixedBehind(pos, 0, 'swing')` hard-coded a facing yaw of 0** — "the
   player always faces +Z", true only on the tee shot. It faces the pin now.
3. **The hole preview was never declared a cinematic.** `CameraDirector.suspended`
   exists for precisely this ("a replay, a rim cut, a cinematic… the hero being
   out of frame is then the authored shot, not a fault") and nothing in the
   project had ever set it. Golf's flyover sets it now.
4. **The director stayed in FIXED mode through the flight.** `setFixedBehind`
   switches to fixed for the address and golf never switched back, so
   `camDirector.update(ball.position, …)` during flight ignored the ball
   entirely and held the tee framing. The shot was never actually followed.

**What is left is a contradiction, and that is the next lead.** The guard reports
the player *behind the camera* — measured by the dot product of the view
direction, not inferred — at a moment when the geometry says otherwise: player
at `(0.5, 0, 30.4)`, camera at `(1.26, 2.10, 26.17)`, pin at `z ≈ 45`. The
camera is on the correct side and its target lerps toward the pin, so the player
should be 4.2m *in front* of it. Clip planes are normal (`1..10000`), there is
one camera (`active=cam guarded=cam`), and the viewport is normal. Something
orients that camera away from its target between the frame it is placed and the
frame the guard samples.

Two diagnostics were added along the way and both earned their place: FrameGuard
now reports **which side of the lens** the subject is on (measured, because
Babylon wraps behind-camera points to `z > 1`, which I first misread as "beyond
the far plane" and spent time chasing clip planes for), and it prints the clip
planes and active camera on any depth failure.

## Phase 6 — not run

No World-Population pass on the golf venue.

## Still open

1. **Phase 3** — the contradiction above.
2. **Phase 6** — never run.
3. **18 holes** (D6) — deliberately three with a clutch final; recorded as a
   choice, not a stand-in.
