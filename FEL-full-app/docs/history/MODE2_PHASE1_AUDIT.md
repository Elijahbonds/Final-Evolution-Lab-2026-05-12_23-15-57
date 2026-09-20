# Mode 2 — Karate Combat Suite: Phase 1 Audit & Benchmark

Gate 0 re-verified for karate: 30/30 (karate stance/strikes/kick/react/
knockdown all play with measured bone motion). Existing combat suites
green: combat-tests 21, karate-clash, karate-endless-economy 36.

## 1. What exists today

### Shared combat base
- `lib/babylon/core/FightCore.ts` (193 lines) — AttackDef table (range/
  startup/stun/knockback/chi per move), KARATE_ATTACKS + STAFF_ATTACKS
  (fists fast/short vs staff long/slow — a real tradeoff), SPECIAL_ATTACK
  (full-chi ring-out tool), FighterState (hp/guard gauge/chi/stun/stagger/
  combo bookkeeping), `resolveStrike()` (whiff/parried-160ms/blocked-chip/
  guard-break-stagger/hit), combo damage scaling, RivalFightBrain AI
  (spacing, circling, reactive guard, difficulty-scaled cooldowns).
- `lib/babylon/modes/KarateVSMode.ts` (320) — 1v1 duel on FightCore.
- `lib/babylon/modes/MixedCombatMode.ts` (439) — fists-vs-staff duel.
- `lib/babylon/modes/KarateEndlessMode.ts` (405, v5) — wave-based horde
  mode: over-shoulder cam, co-op-ready ally via PlayerSlot, dodge-roll
  with i-frames + slow-mo reward window, glitch-burst spawns, MobSteering.
- Mode 1 shared systems now available: MomentumBus (Game-Breaker),
  JudgePanel, CameraDirector (+ 'fight'/'overShoulder' presets, pulse
  beats), ContactSystem (Havok), FootPlant, SoundKit ambient levels.

### NOT present (gaps driving the phases)
- No stance system; no 8-way run plane; no dash-cancel.
- No weapon-attachment layer (staff is a *stat table*, not an equipped
  weapon mesh with moveset swap).
- No substitution/counter (Naruto-style) — parry exists, guard impact as
  a distinct no-sell mechanic does not.
- No ultimate/cinematic finisher system; no support-assist; no
  destructible environment beats.
- No ring-out victory in current duels (SPECIAL has knockback, but no
  out-of-bounds condition in KarateVS).
- Endless: no perk/upgrade shop between waves, no down/revive state,
  no server-authoritative wave/reward calls (all local).
- No server round structure via Judge/Scoring in duels (rounds are local).

## 2. Benchmark: Naruto Ultimate Ninja Storm (Showdown)

1. **Dash-cancel movement** — chakra dash closes huge distances instantly,
   cancelable mid-combo; traversal IS the combat verb.
2. **Chakra resource management** — fills in combat, spent on dashes,
   substitutions, ultimates; empty chakra = vulnerable.
3. **Substitution/counter** — teleport-counter when about to be hit;
   costs resource, punishable if read.
4. **Support assists** — a second character flashes in to extend/interrupt.
5. **Cinematic ultimate cuts** — camera leaves gameplay framing entirely
   for the ultimate; it's a scene, not an attack.
6. **Destructible arena beats** — big hits deform/break the stage.

## 3. Benchmark: Soul Calibur (Duel Mode)

1. **8-way run plane** — full-circle strafe movement around a locked
   opponent; spacing on a disc, not a line.
2. **Weapon-specific movesets** — range/speed/power identity per weapon;
   the matchup is the weapon, not the skin.
3. **Guard impact** — perfectly-timed deflect that no-sells and opens a
   punish; distinct risk/reward from block and parry.
4. **Ring-outs** — positional instant-win condition; edge pressure is
   its own game.
5. **Round structure** — best-of-N with visible round markers.
6. **Stance identity** — characters read differently at a glance.

## 4. Benchmark: Matrix Revolutions + COD Zombies (Endless Onslaught)

1. **Crowd-control combat** — AOE strikes, juggles, and a crowd-clear
   finisher when surrounded; short bursts of feeling unstoppable.
2. **Escalating waves** — count + speed + hp ramp per round; readable
   wave-start/wave-clear beats.
3. **Between-round perk shop** — spend earned currency on upgrades;
   build identity over a run.
4. **Solo viability** — nothing requires a second player.
5. **Down-and-revive co-op** — KO'd player can be picked up by the ally;
   both down = run over.
6. **Horde readability** — many enemies, but tells stay readable and the
   frame holds (MobSteering + procedural athletes help here).

## 5. Gap list per sub-mode

### Shared core (Phases 2–5)
| Mechanic | Current | Gap |
|---|---|---|
| Stances | none | StanceSystem: 3 stances modulating range/speed/moves |
| 8-way run | none | movement mode with lock-on strafe disc |
| Dash-cancel | dodge-roll (endless only) | generalize: dash with i-frames + combo-cancel, chi cost |
| Weapon layer | stat tables only | WeaponRig: attach mesh to hand bone + moveset swap |
| Guard impact | parry only (160ms) | separate tighter window, no-sell + punish state |
| Substitution | none | chi-cost teleport counter w/ cooldown + punish window |
| Resource meter | chi (exists, flat) | formalize as shared ResourceMeter framework |
| Hit reactions | stun/stagger numbers | weight-scaled reaction layers (light/med/heavy/finisher) |

### Showdown (Phase 6): all six Storm mechanics missing except chi base —
needs dash-cancel traversal, ultimate+camera-cut, assist calls, one
destructible beat.
### Duel (Phase 7): needs 8-way plane, 3rd weapon identity (fists/staff
exist), guard impact, ring-out bounds, best-of-N via JudgePanel.
### Endless (Phase 8): waves exist; needs CC combat (AOE/juggle/crowd-clear),
perk shop (server-authoritative — will wire to existing /api/wallet/spend
pattern), down/revive for the ally slot, solo balance pass. Co-op remains
local-ally AI until a transport exists (NetworkInputSource seam, per the
repo's documented honest-scope boundary) — flagged for the quality gate.
