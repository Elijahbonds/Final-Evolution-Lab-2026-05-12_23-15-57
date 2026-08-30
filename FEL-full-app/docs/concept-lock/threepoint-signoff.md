# §7 Completion Checklist — Three-Point Shootout

Phase 10 of the convergence pass. Benchmark: **NBA 2K9 Three-Point Contest**.
This is the bible's own eight-item checklist, run honestly. One item does not pass.

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified for this mode's animation set | ✅ 58 checks — the rig is the Mixamo 65-bone standard with `mixamorig:` bones |
| 7.2 | 10-Phase Convergence Protocol run in full | ✅ Protocol ratified as canonical v1 (`docs/10-PHASE-CONVERGENCE-PROTOCOL.md`) after confirming no such document existed; the pass was run against it |
| 7.3 | Benchmark parity against the locked reference | ✅ 15/15 criteria; D1/D2/D3 fixed, D4/D5/D6 all ruled |
| 7.4 | World-Population Protocol applied | ❌ **The document does not exist.** A search of this machine finds it referenced only by files written during this pass. The benchmark-driven part (ball racks on court, depleting as shot) is done. Needs the same treatment the 10-Phase Protocol got: write and ratify one, or drop the gate |
| 7.5 | Five-tab shell conventions intact | ✅ Lab/Train/Arena/Status/Profile |
| 7.6 | vitest suite still green | ✅ `npm test` — 4 files, 47 tests green (vitest installed and wired; the 31/31 figure belongs to the `/tmp/fel3` checkout, not this tree) |
| 7.7 | No orphaned-mode work smuggled in | ✅ Nothing from §4.3 touched. Showdown was routed under an explicit mount instruction |
| 7.8 | No scope bleed into §6 features | ✅ Controller Link (§6.5) was separately commissioned; nothing else pulled forward |

## Verdict: 7 of 8 pass. One gate remains.

**§7.4 is the only failing gate**, and it fails because the World-Population
Protocol has never been written. It cannot be "applied" until it exists.

Also still true, though not a §7 item: **Phase 9 (device playtest) has not been
run for this mode.** Postgres is now up and the guest route proves real
playthroughs work, but `/play/threepoint` needs an account. Sprint is the
standing argument for not skipping it — its logic verified clean while the frame
was black, and only a real playthrough would have caught that.

## Rulings recorded

**D6 — physics. ACCEPTED (Elijah, 2026-08-30).** Kinematic `ShotArc` is correct
for this benchmark; 2K9 decides the make from the meter and animates it. §1's
"Havok" is the platform default, not a per-mode requirement.

## What the pass actually produced

- **D1** — the arc was one radius (6.75m); now the real NBA line, 6.71m corners
  to 7.24m top, which is why the top-of-key rack is the hard one
- **D2** — the money ball was invisible; now gold and emissive, re-dressed per ball
- **D3** — no ball racks on court; now five racks that visibly deplete as shot
- **Phase 7/8** — money balls and 4+ streaks now trigger crowd, camera pulse and
  exposure flash instead of landing like a routine make
- **Phase 5 guard** — a permanent test that every mode's `TouchOverlay` modeId
  resolves in `MODE_VERBS`, so the Karate VS silent-degradation bug cannot recur
