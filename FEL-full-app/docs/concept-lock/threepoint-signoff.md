# §7 Completion Checklist — Three-Point Shootout

Phase 10 of the convergence pass. Benchmark: **NBA 2K9 Three-Point Contest**.
This is the bible's own eight-item checklist, run honestly. Two items do not pass.

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified for this mode's animation set | ✅ 57 checks — the rig is the Mixamo 65-bone standard with `mixamorig:` bones |
| 7.2 | 10-Phase Convergence Protocol run in full | ⚠️ **Run against the reconstructed skeleton, not the canonical document** — see below |
| 7.3 | Benchmark parity against the locked reference | ✅ 15/15 criteria; deviations D1/D2/D3 fixed, D4/D5 ruled out of scope, **D6 needs a ruling** |
| 7.4 | World-Population Protocol applied | ⚠️ **Document not available.** The benchmark-driven part (ball racks) is done; the protocol itself was not applied because it was not available to apply |
| 7.5 | Five-tab shell conventions intact | ✅ Lab/Train/Arena/Status/Profile |
| 7.6 | vitest suite still 31/31 green | ❌ **Not satisfiable in this tree** — vitest is not installed and there are 3 test files, not 31 suites. Substituted: 252 deterministic headless checks, all green |
| 7.7 | No orphaned-mode work smuggled in | ✅ Nothing from §4.3 touched. Showdown was routed under an explicit mount instruction |
| 7.8 | No scope bleed into §6 features | ✅ Controller Link (§6.5) was separately commissioned; nothing else pulled forward |

## Verdict: **NOT signed off.** 6 of 8 pass.

Three blockers, none of which I can clear alone:

1. **7.2 — the 10-Phase Convergence Protocol document.** The pass ran against a
   reconstruction. §2 is explicit: *"do not improvise phase steps."* The work is
   real and the phases were sound, but calling this "the protocol, run in full"
   would be a false claim.

2. **7.6 — the 31/31 vitest baseline does not exist here.** That baseline
   belongs to the `/tmp/fel3` checkout described in §1. This tree has no vitest.
   Either that checkout is the real one, or the baseline needs restating for
   this tree.

3. **Phase 9 (device playtest) never ran.** Postgres is down and every `/play/*`
   route is auth-gated, so this mode has never been played through its shipping
   route on a real device — only through a dev host. Sprint's black screen is
   exactly what that gap lets through.

## Open ruling

**D6 — physics.** 3PT scores with `ShotArc`, a kinematic parabola, and uses zero
Havok. Believed correct for the benchmark (2K9 decides the make from the meter,
then animates it) but §1 states the stack is Havok. Needs an explicit call.

## What the pass actually produced

- **D1** — the arc was one radius (6.75m); now the real NBA line, 6.71m corners
  to 7.24m top, which is why the top-of-key rack is the hard one
- **D2** — the money ball was invisible; now gold and emissive, re-dressed per ball
- **D3** — no ball racks on court; now five racks that visibly deplete as shot
- **Phase 7/8** — money balls and 4+ streaks now trigger crowd, camera pulse and
  exposure flash instead of landing like a routine make
- **Phase 5 guard** — a permanent test that every mode's `TouchOverlay` modeId
  resolves in `MODE_VERBS`, so the Karate VS silent-degradation bug cannot recur
