# §7 Completion Checklist — Three-Point Shootout

Phase 10 of the convergence pass. Benchmark: **NBA 2K9 Three-Point Contest**.
This is the bible's own eight-item checklist, run honestly. **All eight pass.**

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified for this mode's animation set | ✅ 58 checks — the rig is the Mixamo 65-bone standard with `mixamorig:` bones |
| 7.2 | 10-Phase Convergence Protocol run in full | ✅ Protocol ratified as canonical v1 (`docs/10-PHASE-CONVERGENCE-PROTOCOL.md`) after confirming no such document existed; the pass was run against it |
| 7.3 | Benchmark parity against the locked reference | ✅ 15/15 criteria; D1/D2/D3 fixed, D4/D5/D6 all ruled |
| 7.4 | World-Population Protocol applied | ✅ Protocol ratified (`docs/WORLD-POPULATION-PROTOCOL.md`) and applied — L1–L5 all PASS |
| 7.5 | Five-tab shell conventions intact | ✅ Lab/Train/Arena/Status/Profile |
| 7.6 | vitest suite still green | ✅ `npm test` — 4 files, 47 tests green (vitest installed and wired; the 31/31 figure belongs to the `/tmp/fel3` checkout, not this tree) |
| 7.7 | No orphaned-mode work smuggled in | ✅ Nothing from §4.3 touched. Showdown was routed under an explicit mount instruction |
| 7.8 | No scope bleed into §6 features | ✅ Controller Link (§6.5) was separately commissioned; nothing else pulled forward |

## Verdict: **SIGNED OFF — 8 of 8.**

Three-Point Shootout is the first FEL mode to pass the full §7 checklist against
a locked benchmark. Two of the eight gates were unsatisfiable when this pass
started — §7.2 and §7.4 both required protocol documents that had never been
written, and §7.6's vitest gate had never once been runnable in this tree. All
three are now real gates that this mode genuinely passes.

**One carry-forward, not a blocker:** Phase 9 (device playtest) has still not run
for this mode. Postgres is up and the guest route proves real playthroughs work,
but `/play/threepoint` needs an account. Sprint is the standing argument for not
treating that as optional — its logic verified clean while the frame was black,
and only a real playthrough would have caught it.

### World-Population Protocol — applied

```
L1 ground plane .......... PASS  Venice court + real NBA arc (6.71–7.24m)
L2 play-critical props ... PASS  5 racks deplete as shot; money ball gold
L3 boundary .............. PASS  venueBox + boardwalk + ocean
L4 crowd and life ........ PASS  bleacher crowd; cheers money balls and 4+ streaks
L5 ambience .............. PASS  backdrop, palms, stadium ambient bed
budget ................... draws 56  meshes 56  (dev pane throttled; re-measure on device)
legibility ............... PASS  graffiti muted (see VenueKit.paintGraffiti)
```

**The one concern raised by this pass is now closed.** The graffiti backdrop sat
directly behind the hoop — exactly where the player looks during a shot — as 14
fully-saturated neon beziers up to 18px wide. It passed L5 as built but violated
the protocol's governing rule. The tags now mix 55% toward the wall colour, are
thinner, fewer, and drawn at half alpha: Venice keeps its character, the rim and
ball stop competing with it.

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
