# Mode 2 — Karate Combat Suite: Phase 10 Quality Gate

Mechanic-by-mechanic accounting per sub-mode. Test suites cited are all
green at this commit (147 checks across 10 Mode-2 suites + Mode 1 battery).

## Shared core (what made three modes one system)

- CombatMovement (8/8): stances (orthodox/cat/rooted), free + 8-way run
  planes, dash-cancel with real i-frames — all on Mode 1's weight model.
- StrikeSystem (7/7): frame-data strikes (100ms readability floor lint),
  cancel-window combos with input buffering, WeaponRig (same state machine
  for fists/staff/blade).
- DefenseSystem (6/6): block / parry (160ms) / guard impact (90ms + flick)
  / substitution (chi, cooldown, punish window) — provably distinct.
- ResourceMeter + CombatAnimTree (5/5): shared chakra/chi framework;
  17-state combat blend tree, all states registry-resolvable.

## Showdown vs Naruto Ultimate Ninja Storm

| Storm mechanic | FEL | Verdict |
|---|---|---|
| Dash-cancel movement | CombatMovement dash (0.16s i-frames, 12 chi, cooldown), legal mid-combo-recovery | **Matched** |
| Chakra management | ResourceMeter CHAKRA: action gains + regen, partial spends (dash/sub), full-bar ultimate | **Matched** |
| Substitution counter | Teleport behind incoming strike, 25 chi, 3s cooldown, 0.6s read-and-punish window | **Exceeded** — Storm's substitution isn't punishable on a read; ours is |
| Support assists | Ally blinks in, lands a combo-extending hit, 9s cooldown | **Matched at scope** |
| Cinematic ultimate | Camera-CUT to fixed wide, push-in beat, resolve — leaves gameplay framing entirely | **Matched** |
| Destructible beat | Ultimate launch shatters the north gate (mesh destroyed, juice stack) | **Matched at scope** |

(showdown-mode-tests 3/3: registry contract, interlocked systems, economics)

## Duel Mode vs Soul Calibur

| SC mechanic | FEL | Verdict |
|---|---|---|
| 8-way run plane | Orbit/radial disc, facing hard-locked, radius held under orbit (combat-movement-tests D) | **Matched** |
| Weapon movesets | fists/blade/staff: range 1.6/1.9/2.6, startup 0.12/0.13/0.20s, distinct cancel chains — one controller (duel-mode-tests 6/6) | **Matched at scope** (3 weapons vs SC's roster) |
| Guard impact | 90ms + directional flick, no-sells heavies, long punish window, distinct stinger/pulse; stricter than parry by test | **Exceeded in readability** — the flick requirement makes intent visible |
| Ring-outs | Raised disc, real knockback impulses, instant round end | **Matched** |
| Round structure | Best-of-3 with staged round markers | **Matched** |
| Stance identity | 3 stances with speed/range/move-tag tradeoffs | **Matched at scope** |

## Endless Onslaught vs Matrix Revolutions + COD Zombies

| Benchmark mechanic | FEL | Verdict |
|---|---|---|
| Crowd control | AOE arc/radius strikes, juggle launches (+50% airborne damage), crowd-clear finisher when 3+ surround (onslaught-core-tests 8/8) | **Matched at scope** |
| Escalating waves | Deterministic waveSpec ramp (count/hp/speed) + spawn ring — server-parity seedable | **Matched** |
| Perk shop | Between-wave shop; purchases route through `/api/wallet/spend` (server owns price/balance; client sends perk id only) | **Exceeded in integrity** — Zombies is client-trusted; ours is server-authoritative |
| Solo viability | All mechanics function without the partner (tests prove systems never require co-op) | **Matched** |
| Down-and-revive | 30s bleed-out, 3s in-range channel, 40% HP restore; both down = run over | **Matched** |
| Horde readability | MobSteering + procedural athletes + high/wide onslaught camera | **Matched at scope** |

## Architecture / non-negotiables
- Server-authoritative economy: grep-verified zero client coin/shard minting;
  the only spend path is the injected server call. **Caveat:** the onslaught
  perk catalog (`onslaught_perk_*`) must be registered in the server-side
  card catalog before purchases will succeed in production — flagged as a
  server config follow-up, not a client bug.
- Co-op: local AI partner via PlayerSlot (documented NetworkInputSource
  seam). **No transport exists in this repo — packet-loss/latency
  simulation flagged as a follow-up requiring the Abacus backend's
  transport contract.**
- Rig/loading: canonical unprefixed Mixamo via Gate 0 gate (30/30 incl.
  karate clip chain); LoadAssetContainerAsync + instantiateModelsToScene
  everywhere.
- tsc: 72 errors, identical to baseline (zero introduced).

## Follow-ups (logged)
- Server catalog entries for onslaught perks.
- Networked co-op transport + loss simulation.
- Combat mocap via the generation-service interface (current clips are
  aliases on the shared fighter rig — readable, but bespoke combat mocap
  is the content upgrade path).
