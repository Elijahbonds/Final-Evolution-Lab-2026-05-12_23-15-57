// KarateEndlessMode v5 — "AGENT WAVES." REPLACES the M45 file. A structural
// rebuild toward the third-person action-horde feel: you (and an ally)
// against escalating waves of identical, suited pursuers in a stylized
// digital arena. Four concrete systems, all new:
//   1. THIRD-PERSON OVER-THE-SHOULDER CAMERA — CameraDirector's new
//      'overShoulder' preset (M50), locked behind your facing direction
//      rather than the nearest-enemy midpoint, the way action games frame
//      combat instead of a fighting-game side-view.
//   2. CO-OP-READY ALLY — a second fighter built on PlayerSlot (M48): today
//      driven by a simple always-on AI (PartnerAISource), but because both
//      bodies already read from the same ControlSource abstraction, turning
//      this into real two-player co-op later is "implement
//      NetworkInputSource against a transport," not "rewrite combat." Same
//      honest scope boundary M48 drew for basketball.
//   3. DODGE WITH A REWARD WINDOW — quick-tap BLOCK (X) instead of holding
//      it: a directional dodge roll with real i-frames, and slipping a
//      strike at the last instant triggers a brief slow-motion beat local
//      to this mode (not a global engine hijack) — the "you weren't fast
//      enough" moment these games are built around.
//   4. HORDE-SCALE WAVES — bigger counts, faster ramp, and every new enemy
//      materializes with a glitch-burst spawn-in instead of just appearing.
//
// IP NOTE: built to match the requested FEEL (third-person combat vs waves
// of identical suited pursuers, a slow-motion dodge) using entirely
// original naming, dialogue-free enemies, and a cyan/white palette — no
// franchise names, characters, or their specific green-code visual motif
// appear anywhere in this file, consistent with this project's standing
// original-content-only rule (already enforced for NeuroArena/Who Scene It).

import { Vector3 } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { Mob, MobPool, STEERING_PRESETS } from '../core/MobSteering';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { CombatAnimTree, type CombatAnimInput, type StrikeWeight } from '../anim/combatTree';
import type { ControlSource, Intent } from '../core/PlayerSlot';
import { PlayerSlot, LocalInputSource } from '../core/PlayerSlot';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { Onlookers } from '../visual/Onlookers';
import { VenueKit } from '../visual/VenueKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';  // M74
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { KARATE_CONFIG as CFG } from './modeConfigs';
import {
  waveSpec, spawnRing, buyPerk, PERKS, DownRevive, REVIVE_RANGE,
  surroundedCount, crowdClear, CROWDCLEAR_RADIUS, inArc,
} from '../core/OnslaughtCore';

/**
 * Half-extent of the playable floor, INSET from the 24x24 mat.
 *
 * The camera's bounds come from the ground mesh, so a play area the same size as
 * the mat leaves it nowhere to stand: at the old ±8 on a 16x16 mat the camera was
 * clamped to ±6.8 and ended up 1.2m behind a player at the edge, putting them out
 * of frame. 7.5 on a 24x24 mat keeps 3.3m clear behind the overShoulder rig.
 */
/**
 * The fighter is held inside a DISC of this radius, not a square of this half-
 * width. A square clamp has corners, and a corner is the one place a
 * facing-derived camera at a 3.1m radius cannot swing behind its subject:
 * every [FEL-FRAME] this mode had left was a fighter pinned at (+-7.5, +-7.5).
 * Karate VS is fought on a disc for the same reason, and the venue now paints
 * this ring on the mat so the edge is seen rather than only felt.
 */
const ARENA_RADIUS = 7.5;
const STANCE = SPORT_CLIP.karateStance;
// ANIM-READABILITY (combat, 2026-09-07): the player and the partner are driven by the CombatAnimTree, the ONE owner of
// their clips — the same jumble Karate VS had (a per-frame stance / step play racing the strike's onEnd chain, the
// knockdown cut to 0.08 s by the per-frame stance, guard steps on the spot). The enemies stay on MobSteering's clips.
const IDLE_CLIP = 'karate_idle_stance';
const STRIKE_WEIGHT: Record<'A' | 'B' | 'Y', StrikeWeight> = { A: 'light', B: 'medium', Y: 'heavy' };
const IMPACT_SEC = 0.24, STRIKE_MAX_SEC = 1.5;
type Strike = { weight: StrikeWeight; clip: string; until: number } | null;
// THE HORDE GRAMMAR (owner lock 2026-09-03: Matrix Revolutions / Pirate
// Warriors). Every strike hits EVERYONE in its arc; the heavy LAUNCHES, and an
// airborne enemy is helpless and takes JUGGLE_DAMAGE_MULT. Before this each
// strike resolved against the single nearest enemy — a queue of duels.
const STRIKES = {
  A: { clip: SPORT_CLIP.karateJab, dmg: 12, range: 1.5, arcDeg: 100, launch: false },
  B: { clip: SPORT_CLIP.karateKick, dmg: 18, range: 1.9, arcDeg: 150, launch: false },
  Y: { clip: SPORT_CLIP.karateHeavy, dmg: 24, range: 1.6, arcDeg: 90, launch: true },
} as const;
/** The running hit count decays after this long without a hit (the Musou number). */
const HIT_CHAIN_MS = 1400;

// horde sizing — deliberately bigger/faster than the old wave-survival pace
// A+ identity P0 (PM brief 2026-09-06): ONE SOLID STRIKE DROPS A BODY. No enemy HP pool, no chip — the wave escalates
// by count and speed, never by sponge. (hpBase 22 / hpPerWave 4 made jab 12 / kick 18 chip and only heavy one-tapped.)
const WAVE = { base: 4, max: 12, growEvery: 1 };
const DODGE_TAP_MS = 220;          // hold longer than this = block, not dodge
const DODGE_IFRAME_SEC = 0.38;
const DODGE_DISTANCE = 3.2;
const PERFECT_DODGE_SLOWMO_SEC = 0.6;
const SLOWMO_SCALE = 0.28;

// M110 — CHI BURST. The chi meter (filled by hits/dodges) used to top out at
// 100 and do nothing. It now powers a screen-clearing special: at full chi,
// press R1 to knock back + heavily damage every enemy in range, then chi
// resets. Code-level rollback: flip CHI_BURST_ENABLED to false.
const CHI_BURST_ENABLED = true;
const CHI_BURST_RADIUS = 4.6;
const CHI_BURST_DAMAGE = 60;
const CHI_BURST_KNOCKBACK = 3.4;

interface Enemy { mob: Mob; hp: number; maxHp: number; /** launched: helpless and takes more until this timestamp */ airUntil: number }

// ── Ally: a self-contained AI ControlSource. Doesn't reuse PlayerSlot's
//    basketball-flavored AIBehavior (ball/hoop shape doesn't fit melee) —
//    this is the melee equivalent, same ControlSource contract so it slots
//    into PlayerSlot identically. ─────────────────────────────────────────
class PartnerAISource implements ControlSource {
  private cooldown = 0;
  constructor(private self: () => Vector3, private nearestEnemy: () => Vector3 | null, private range: number) {}
  poll(dt: number): Intent {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const target = this.nearestEnemy();
    const neutral: Intent = { moveX: 0, moveY: 0, sprint: false, action: false, actionHeld: 0, pass: false, steal: false };
    if (!target) return neutral;
    const to = target.subtract(this.self()); to.y = 0;
    const dist = to.length();
    if (dist > this.range) {
      const dir = to.normalize();
      return { ...neutral, moveX: dir.x, moveY: -dir.z, sprint: dist > 4 };
    }
    const attack = this.cooldown === 0;
    if (attack) this.cooldown = 0.9 + Math.random() * 0.4;
    return { ...neutral, action: attack };
  }
}

export const KarateEndlessMode: ModeDefinition = (() => {
  let karateVenue: VenueHandle | null = null;  // M74
  let crowd: Onlookers | null = null;   // L4 — the gauntlet's audience
  let player: SpawnedCharacter, partner: SpawnedCharacter;
  let playerSlot: PlayerSlot, partnerSlot: PlayerSlot, localSource: LocalInputSource;
  let pool: MobPool;
  let enemies: Enemy[] = [];
  let wave = 0, kos = 0, totalKos = 0, chi = 0;   // no player HP: one clean contact puts you DOWN (P0 identity)
  // Phase 8: perks, down/revive, crowd-clear
  const ownedPerks = new Set<string>();
  const myDown = new DownRevive();
  const partnerDown = new DownRevive();
  let revivingPartner = false;
  let coins = 0;                       // display mirror of server balance
  let dmgMult = 1, speedMult = 1;
  let shopOpen = false;
  let clockSec = 0;
  /** Server-authoritative spend: the client sends the perk id ONLY; the
   *  server owns price/balance. Offline/dev falls back to a local denial. */
  async function serverSpend(perkId: string, _cost: number): Promise<{ ok: boolean; reason?: string }> {
    try {
      const res = await fetch('/api/wallet/spend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: `onslaught_perk_${perkId}` }),
      });
      if (!res.ok) return { ok: false, reason: `server refused (${res.status})` };
      return { ok: true };
    } catch {
      return { ok: false, reason: 'offline — purchases disabled' };
    }
  }
  let striking = false, blocking = false, dodging = false, bursting = false;
  let meTree: CombatAnimTree, partnerTree: CombatAnimTree;
  let myStrike: Strike = null, pStrike: Strike = null, impactUntil = 0, outFlag = false;
  let hitCount = 0, lastHitAt = 0;                 // the Musou number
  let camCrowd = false;                             // H8: surrounded → the crowd preset
  let xHoldSec = -1, iframeSec = 0, slowMoSec = 0;
  let stickX = 0, stickY = 0;
  let lookX = 0, lookY = 0;   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)

  const facingVec = () => new Vector3(Math.sin(player.root.rotation.y), 0, Math.cos(player.root.rotation.y));

  async function spawnEnemy(ctx: ModeContext, angle: number, i: number): Promise<void> {
    const pos = new Vector3(Math.sin(angle) * 6, 0, Math.cos(angle) * 6);
    const char = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
      position: pos, yawRad: Math.atan2(-pos.x, -pos.z),
      tint: i % 2 ? '#1a1f26' : '#0d1117',            // dark suit, no franchise color palette
      scale: 0.95 + ((wave * 7 + i * 13) % 12) / 100,
      startClip: STANCE,
    });
    neverBindPose(char.animator, STANCE);
    installSafePlay(char.animator, 'agent');
    ctx.groundLock?.track(char.root, char.skeleton);
    // materialize, don't just appear
    char.root.scaling.scaleInPlace(0.001);
    EffectsKit.burst(ctx.scene, pos.add(new Vector3(0, 1, 0)), 'glitch');
    SoundKit.play('powerUp', { pitch: 1.6, volume: 0.25 });
    const t0 = performance.now();
    const targetScale = char.root.scaling.clone();
    const obs = ctx.scene.onBeforeRenderObservable.add(() => {
      const k = Math.min(1, (performance.now() - t0) / 320);
      char.root.scaling = Vector3.Lerp(new Vector3(0.001, 0.001, 0.001), targetScale, k);
      if (k >= 1) ctx.scene.onBeforeRenderObservable.remove(obs);
    });
    const archetype = (['striker', 'rusher', 'flanker'] as const)[i % 3];
    const mob = new Mob(char, STEERING_PRESETS[archetype]);
    mob.startPursuit();
    pool.add(mob);
    enemies.push({ mob, hp: 1, maxHp: 1, airUntil: 0 });   // one-knock: any land sets hp 0 → KO
  }

  async function spawnWave(ctx: ModeContext): Promise<void> {
    // between waves (not the first): the perk shop opens
    if (wave >= 1) {
      shopOpen = true;
      ctx.setHud({ banner: 'PERKS — d-pad to browse, A to buy, B to fight', perks: PERKS.map((p, i) => `${i + 1}=${p.label} ${p.costCoins}c`).join(' · '), coins });
    }
    wave++; kos = 0;
    SoundKit.play('powerUp', { pitch: 0.9, volume: 0.5 });   // wave-start horn
    SoundKit.play('crowdCheer', { volume: Math.min(0.3 + wave * 0.06, 0.9) });
    // horde size by tier: the desktop budget takes 20 bodies, a phone 12
    const spec = waveSpec(wave, ctx.scene.metadata?.felTier === 'mobile' ? 12 : 20);
    const count = spec.count;
    void spawnRing(wave, count);
    const proms: Promise<void>[] = [];
    for (let i = 0; i < count; i++) proms.push(spawnEnemy(ctx, (i / count) * Math.PI * 2 + wave, i));
    await Promise.all(proms);
    ctx.setHud({ wave, enemies: count, chi });
  }

  const nearest = (from: Vector3): Enemy | null =>
    enemies.reduce<Enemy | null>((best, e) =>
      !best || Vector3.Distance(e.mob.char.root.position, from) < Vector3.Distance(best.mob.char.root.position, from) ? e : best, null);

  function gainChi(ctx: ModeContext, amount: number): void {
    const before = chi;
    chi = Math.min(100, chi + amount);
    ctx.setHud({ chi });
    if (CHI_BURST_ENABLED && !bursting && before < 100 && chi >= 100) {
      ctx.setHud({ banner: 'CHI READY · R1' });
      setTimeout(() => ctx.setHud({ banner: '' }), 900);
    }
  }

  // M110 — spend a full chi bar: an AoE knockback + heavy damage that reuses the
  // existing landHit/ko/wave-clear path, so a burst can clear a wave cleanly.
  function chiBurst(ctx: ModeContext): void {
    if (!CHI_BURST_ENABLED || chi < 100 || striking || dodging || bursting || myDown.downed) return;   // a downed fighter cannot swing (the tree holds the floor)
    // Phase 8: surrounded 3+ makes this the CROWD-CLEAR finisher — bigger
    // radius read, brief invulnerability feel (dodge window), huge payoff.
    const surrounded = surroundedCount(player.root.position,
      enemies.map((e) => ({ id: 'e', pos: e.mob.char.root.position, hp: e.hp, airborneSec: 0 })));
    const isCrowdClear = surrounded >= 3;
    if (isCrowdClear) {
      ctx.setHud({ banner: 'CROWD CLEAR!' });
      ctx.feel?.impact?.(1);
      SoundKit.play('crowdCheer', { volume: 0.9 });
      ctx.camDirector?.pulse?.(0.8, 0.6);
    }
    bursting = true; chi = 0;
    ctx.setHud({ chi, banner: 'CHI BURST' });
    setTimeout(() => { ctx.setHud({ banner: '' }); }, 800);
    SoundKit.play('powerUp', { pitch: 0.8, volume: 0.6 });
    SoundKit.play('crowdCheer', { volume: 0.5 });
    ctx.feel?.impact?.(0.9);
    const origin = player.root.position.clone();
    EffectsKit.burst(ctx.scene, origin.add(new Vector3(0, 1.1, 0)), 'glitch');
    EffectsKit.burst(ctx.scene, origin.add(new Vector3(0, 0.4, 0)), 'sparks');
    striking = true;
    myStrike = { weight: 'finisher', clip: STRIKES.Y.clip, until: performance.now() + STRIKE_MAX_SEC * 1000 };   // the tree plays it; its settle ends the swing
    for (const e of [...enemies]) {
      const to = e.mob.char.root.position.subtract(origin); to.y = 0;
      const d = to.length();
      if (d > CHI_BURST_RADIUS) continue;
      const dir = d > 0.001 ? to.scale(1 / d) : facingVec();
      const from = e.mob.char.root.position.clone();
      const target = from.add(dir.scale(CHI_BURST_KNOCKBACK));
      const t0 = performance.now();
      const obs = ctx.scene.onBeforeRenderObservable.add(() => {
        const k = Math.min(1, (performance.now() - t0) / 260);
        e.mob.char.root.position = Vector3.Lerp(from, target, k);
        if (k >= 1) ctx.scene.onBeforeRenderObservable.remove(obs);
      });
      EffectsKit.burst(ctx.scene, from.add(new Vector3(0, 1, 0)), 'sparks');
      landHit(ctx, e, true);                                   // the burst launches every body it clears
    }
    chi = 0; ctx.setHud({ chi });
    bursting = false;
  }

  function strike(ctx: ModeContext, key: keyof typeof STRIKES): void {
    if (striking || blocking || dodging || myDown.downed) return;   // a downed fighter cannot swing (the tree holds the floor)
    striking = true;
    const s = STRIKES[key];
    const target = nearest(player.root.position);
    if (target) {
      const to = target.mob.char.root.position.subtract(player.root.position);
      player.root.rotation.y = Math.atan2(to.x, to.z);
    }
    SoundKit.play('whoosh');
    myStrike = { weight: STRIKE_WEIGHT[key], clip: s.clip, until: performance.now() + STRIKE_MAX_SEC * 1000 };   // the tree plays it; its settle ends the swing
    setTimeout(() => {
      // everyone in the arc, not the nearest one
      const origin = player.root.position;
      const hit = enemies.filter((e) => inArc(origin, player.root.rotation.y, e.mob.char.root.position, s.range, s.arcDeg));
      if (!hit.length) { if (performance.now() - lastHitAt > HIT_CHAIN_MS) { hitCount = 0; ctx.setHud({ hits: 0 }); } return; }
      const now = performance.now();
      if (now - lastHitAt > HIT_CHAIN_MS) hitCount = 0;
      for (const t of [...hit]) landHit(ctx, t, !!s.launch);   // one contact = one body down; heavy adds launch juice
      hitCount += hit.length; lastHitAt = now;
      ctx.setHud({ hits: hitCount });
      if (hit.length >= 3) ctx.feel?.impact?.(0.55);
    }, 150);
  }

  /** A land is a KO. Revolutions weight: the body drops on ONE solid strike — no damage math, no second hit to
   *  finish. A heavy (launch) strike lands harder for juice; it never needs a follow-up. */
  function landHit(ctx: ModeContext, t: Enemy, launch: boolean): void {
    t.hp = 0;
    gainChi(ctx, 8);
    ctx.feel?.impact?.(launch ? 0.55 : 0.35);
    EffectsKit.burst(ctx.scene, t.mob.char.root.position.add(new Vector3(0, 1.1, 0)), 'sparks');
    if (launch) EffectsKit.burst(ctx.scene, t.mob.char.root.position.add(new Vector3(0, 0.2, 0)), 'dust');
    ko(ctx, t);
  }

  function ko(ctx: ModeContext, e: Enemy): void {
    enemies = enemies.filter((x) => x !== e);
    kos++; totalKos++;
    e.mob.down();
    ctx.groundLock?.release(e.mob.char.root);
    SoundKit.play('crowdCheer', { volume: 0.4 });
    EffectsKit.burst(ctx.scene, e.mob.char.root.position.add(new Vector3(0, 1, 0)), 'glitch');
    const root = e.mob.char.root;
    const sink = ctx.scene.onBeforeRenderObservable.add(() => {
      root.position.y -= 0.012;
      root.scaling.scaleInPlace(0.94);
      if (root.position.y < -1.6) { ctx.scene.onBeforeRenderObservable.remove(sink); e.mob.char.dispose(); }
    });
    ctx.setHud({ kos: totalKos });
    if (enemies.length === 0) {
      SoundKit.play('whistle');
      ctx.setHud({ banner: `WAVE ${wave} CLEAR · ${kos} DOWN` });
      setTimeout(() => { ctx.setHud({ banner: '' }); void spawnWave(ctx); }, CFG.waveClearBeatMs);
    }
  }

  /** Once per frame: the player's and the partner's trees (ANIM-READABILITY — the one owner of their clips). */
  function animate(mySpeed01: number, partnerSpeed01: number): void {
    if (!meTree || !partnerTree) return;
    const t = performance.now();
    if (myStrike && t > myStrike.until) { striking = false; myStrike = null; }   // a strike the tree never settled (safety, never measured)
    if (pStrike && t > pStrike.until) pStrike = null;
    const mine: CombatAnimInput = {
      speed01: blocking || myDown.downed ? 0 : mySpeed01, dashing: false, hasWeapon: false,
      striking: myStrike?.weight ?? null, strikeClip: myStrike?.clip,
      blocking, dodging, parryFlash: false, guardImpactFlash: t < impactUntil,
      hitBy: null, down: myDown.downed, out: outFlag, ulting: false,
    };
    meTree.update(mine);
    partnerTree.update({
      speed01: partnerSpeed01, dashing: false, hasWeapon: false, striking: pStrike?.weight ?? null, strikeClip: pStrike?.clip,
      blocking: false, parryFlash: false, guardImpactFlash: false, hitBy: null, down: partnerDown.downed, out: false, ulting: false,
    });
  }

  function tryDodge(ctx: ModeContext): void {
    if (dodging || striking || myDown.downed) return;
    dodging = true;
    iframeSec = DODGE_IFRAME_SEC;
    const dir = Math.hypot(stickX, stickY) > 0.2
      ? new Vector3(stickX, 0, -stickY).normalize()
      : facingVec().scale(-1);            // no input = dodge backward
    SoundKit.play('whoosh', { pitch: 1.5, volume: 0.4 });
    const from = player.root.position.clone();
    const to = from.add(dir.scale(DODGE_DISTANCE));
    const t0 = performance.now();
    const obs = ctx.scene.onBeforeRenderObservable.add(() => {
      const k = Math.min(1, (performance.now() - t0) / 320);
      player.root.position = Vector3.Lerp(from, to, k);
      if (k >= 1) {
        ctx.scene.onBeforeRenderObservable.remove(obs);
        dodging = false;   // the tree's dodge settles on its own
      }
    });
  }

  return {
    modeId: 'karate', mood: 'dojoWarm', camPreset: 'overShoulder',

    async load(ctx) {
      // Build the arena FIRST so the M37 spawn guard sees a populated world
      // (>=8 meshes) and the dojoWarm ambient bed has somewhere to live.
      karateVenue = mountVenue(ctx, 'karate_endless', { keepGameplayCamera: true });
      // L4 — the Shadow Gauntlet is a gauntlet, and a gauntlet has an audience.
      // Ringed OUTSIDE the fighting disc (radius 7.5) and inside the mat (12),
      // so nobody stands anywhere the fight can reach. Instanced silhouettes,
      // never rigs: this mode already carries up to twelve pursuers plus an
      // ally, and L4's own rule is that a crowd must not compete with
      // characters for frame budget.
      crowd = new Onlookers(ctx.scene, Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2 + 0.22;
        return new Vector3(Math.sin(a) * 10.2, 0, Math.cos(a) * 10.2);
      }), '#3B2A52');
      if (!karateVenue) VenueKit.buildDojo(ctx.scene);
      EffectsKit.ambient(ctx.scene, 'dojo');
      player = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, { position: new Vector3(0, 0, 1.5), startClip: IDLE_CLIP });
      neverBindPose(player.animator, IDLE_CLIP);
      installSafePlay(player.animator, 'agent-player');
      ctx.groundLock?.track(player.root, player.skeleton);
      ctx.heroRef.current = player.root;

      partner = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, { position: new Vector3(1.6, 0, 0.8), tint: '#22d3ee', startClip: IDLE_CLIP });
      neverBindPose(partner.animator, IDLE_CLIP);
      installSafePlay(partner.animator, 'agent-partner');
      ctx.groundLock?.track(partner.root, partner.skeleton);
      meTree = new CombatAnimTree(player.animator);
      partnerTree = new CombatAnimTree(partner.animator);
      meTree.onSettle = (st) => { if (st.startsWith('strike_')) { striking = false; myStrike = null; } };
      partnerTree.onSettle = (st) => { if (st.startsWith('strike_')) pStrike = null; };
      myStrike = null; pStrike = null; impactUntil = 0; outFlag = false;

      localSource = new LocalInputSource();
      playerSlot = new PlayerSlot('player', localSource, true);
      partnerSlot = new PlayerSlot('partner', new PartnerAISource(
        () => partner.root.position, () => nearest(partner.root.position)?.mob.char.root.position ?? null, 1.6,
      ), false);

      pool = new MobPool();
      wave = 0; totalKos = 0; chi = 0; enemies = [];
      striking = false; blocking = false; dodging = false; xHoldSec = -1; iframeSec = 0; slowMoSec = 0;
      ctx.camDirector.snapTo(player.root.position, player.root.position.add(facingVec()));
      karateVenue?.hidePlaceholders();  // M74
      SoundKit.startAmbient('dojo');
      await spawnWave(ctx);
      ctx.setHud({ chi, hint: 'One strike drops a body · one clean hit drops YOU — quick-tap BLOCK to dodge, hold to guard · R1 = CHI BURST' });
    },

    onInput(ctx, e: FelInput) {
      SoundKit.unlock();
      localSource.feed(e);
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; }   // MODE-STICK-FACE: R stick → the director's look orbit
      if (e.t === 'button' && e.pressed) {
        if (e.btn === 'A' || e.btn === 'B' || e.btn === 'Y') strike(ctx, e.btn);
        if (e.btn === 'X') xHoldSec = 0;
        if (e.btn === 'R1') chiBurst(ctx);
      }
      if (e.t === 'button' && !e.pressed && e.btn === 'X') {
        const held = xHoldSec;
        xHoldSec = -1;
        if (held >= 0 && held * 1000 < DODGE_TAP_MS) tryDodge(ctx);
        blocking = false;
      }
    },

    update(ctx, dtReal) {
      clockSec += dtReal;
      if (hitCount > 0 && performance.now() - lastHitAt > HIT_CHAIN_MS) { hitCount = 0; ctx.setHud({ hits: 0 }); }
      // Phase 8: down/revive tick
      if (myDown.downed) {
        const near = Vector3.Distance(partner.root.position, player.root.position) <= REVIVE_RANGE;
        if (myDown.channel(dtReal, near)) {
          myDown.revive();
          SoundKit.play('powerUp', { pitch: 1.1 });
          ctx.setHud({ banner: 'REVIVED — BACK IN THE FIGHT' });   // the tree rises through the get-up
          setTimeout(() => ctx.setHud({ banner: '' }), 900);
        }
        if (myDown.bledOut(clockSec)) {
          return ctx.end(`WAVE_${wave}`, totalKos * 100 + wave * 50, { wave, kos: totalKos });
        }
      }
      if (partnerDown.downed) {
        if (revivingPartner && Vector3.Distance(player.root.position, partner.root.position) <= REVIVE_RANGE) {
          if (partnerDown.channel(dtReal, true)) {
            partnerDown.revive();
            SoundKit.play('powerUp', { pitch: 1.1 });
            ctx.setHud({ banner: 'PARTNER REVIVED!' });
            setTimeout(() => ctx.setHud({ banner: '' }), 900);
          } else {
            ctx.setHud({ revive: Math.round(partnerDown.channelSec / 3 * 100) });
          }
        } else {
          partnerDown.channel(dtReal, false);
          ctx.setHud({ revive: 0 });
        }
        if (partnerDown.bledOut(clockSec)) {
          ctx.setHud({ banner: 'PARTNER BLED OUT' });
        }
      }
      slowMoSec = Math.max(0, slowMoSec - dtReal);
      const dt = slowMoSec > 0 ? dtReal * SLOWMO_SCALE : dtReal;

      if (xHoldSec >= 0) {
        xHoldSec += dtReal;
        if (xHoldSec * 1000 >= DODGE_TAP_MS && !blocking && !dodging) blocking = true;   // the tree shows the block
      }
      iframeSec = Math.max(0, iframeSec - dtReal);

      playerSlot.poll(dt);
      partnerSlot.poll(dt);

      // MODE-STICK-FACE (2026-09-07): the stick is CAMERA-relative. The over-shoulder camera follows the FACING, so a
      // world-axis stick turned the fighter and the camera together until "right" meant "forward" (measured: stick-right
      // ran screen-LEFT once the camera had swung). Up = the camera's flat forward, right = screen right; no axis flipped.
      // The basis LATCHES while the stick is held (the over-shoulder camera swings behind every turn — a live basis
      // spun the fighter on the spot on a held stick-right: 0.26 m/s net, measured); a push runs straight.
      const vel = ctx.camDirector.stickWorldLatched(stickX, stickY).scaleInPlace(3);
      let mySpeed01 = Math.min(1, vel.length() / 3);   // the INTENT, striking or not: a strike that runs out under a held stick settles straight into the guard step
      if (!striking && !blocking && !dodging && vel.lengthSquared() > 0.05) {
        const before = player.root.position.clone();
        player.root.position.addInPlace(vel.scale(dt));
        // Inset from the mat so the camera always has somewhere to stand behind
        // the player — see ARENA_RADIUS.
        const pr = Math.hypot(player.root.position.x, player.root.position.z);
        if (pr > ARENA_RADIUS) {
          const k = ARENA_RADIUS / pr;
          player.root.position.x *= k;
          player.root.position.z *= k;
        }
        player.root.rotation.y = Math.atan2(vel.x, vel.z);
        if (dt > 0 && Vector3.Distance(before, player.root.position) / dt < 0.3) mySpeed01 = 0;   // pinned on the ring's edge: no stepping on the spot
      }

      // partner movement/attacks
      const pIntent = partnerSlot.intent;
      const pVel = new Vector3(pIntent.moveX, 0, -pIntent.moveY).scale(2.6);
      partner.root.position.addInPlace(pVel.scale(dt));
      partner.root.position.x = Math.max(-8, Math.min(8, partner.root.position.x));
      partner.root.position.z = Math.max(-8, Math.min(8, partner.root.position.z));
      if (pVel.lengthSquared() > 0.05) partner.root.rotation.y = Math.atan2(pVel.x, pVel.z);
      if (pIntent.action) {
        const t = nearest(partner.root.position);
        if (!pStrike) pStrike = { weight: 'light', clip: SPORT_CLIP.karateJab, until: performance.now() + STRIKE_MAX_SEC * 1000 };   // one jab per swing — the tree plays it
        if (t && Vector3.Distance(t.mob.char.root.position, partner.root.position) < 1.8) landHit(ctx, t, false);   // the partner's land drops a body too
      }

      // enemy contact — dodge i-frames make you untouchable; a hit landed
      // during the LAST 90ms of the i-frame window counts as a "perfect"
      // dodge and rewards the slow-mo beat
      const contacts = pool.update(dt, player.root.position, vel);
      for (const mob of contacts) {
        if (iframeSec > 0) {
          if (iframeSec < 0.09 && slowMoSec <= 0) {
            slowMoSec = PERFECT_DODGE_SLOWMO_SEC;
            SoundKit.play('powerUp', { pitch: 0.6 });
            ctx.setHud({ banner: 'PERFECT DODGE' });
            setTimeout(() => ctx.setHud({ banner: '' }), 700);
          }
          mob.onContactResolved();
          gainChi(ctx, 5);
          continue;
        }
        mob.onContactResolved();
        if (blocking) {
          // a guard ABSORBS the hit — pressure, not chip: no bar ticks down
          impactUntil = performance.now() + IMPACT_SEC * 1000; meTree.clearBeat('guard_impact');   // the guard is shoved back (readable)
          gainChi(ctx, 2); ctx.feel?.impact?.(0.2);
          SoundKit.play('impact', { pitch: 0.8, volume: 0.3 });
          continue;
        }
        // ONE CLEAN CONTACT PUTS YOU DOWN (P0 identity — no 3 / 10 chip, no HP bar as the loop).
        gainChi(ctx, 4);
        ctx.feel?.impact?.(0.6);
        if (myDown.downed) continue;                         // already down — nothing more to take
        if (!partnerDown.downed) {
          // Phase 8 co-op rule kept: DOWN (not out) while the partner stands — they can revive you
          myDown.down(clockSec);
          SoundKit.play('crowdGroan');   // the tree: knockdown → the floor until the revive, then the get-up
          striking = false; myStrike = null;
          ctx.setHud({ banner: 'YOU ARE DOWN — PARTNER CAN REVIVE YOU' });
        } else {
          SoundKit.play('crowdGroan');
          outFlag = true; striking = false; myStrike = null; animate(mySpeed01, pVel.length() / 2.6);   // KO: the tree's knockdown → floor
          return ctx.end(`WAVE_${wave}`, totalKos * 100 + wave * 50, { wave, kos: totalKos });
        }
      }

      // camera: locked behind the player's FACING (not the nearest enemy) —
      // pass a full-magnitude facing-direction vector as "velocity" so the
      // existing velocity-derived back-vector branch does the work (see
      // CameraDirector v2.4 header). Must stay near unit length: the branch
      // gates on lengthSquared() > 0.01, and the same vector also drives the
      // look-ahead target, which is exactly the desired effect here — the
      // camera looks slightly down the direction you're facing.
      crowd?.update(dt);
      // surrounded by three or more inside the crowd-clear radius: the camera
      // pulls back and up so the horde is the shot (preset change on the
      // transition only — setPreset re-derives the venue bounds)
      const surroundedNow = surroundedCount(player.root.position,
        enemies.map((e) => ({ id: 'e', pos: e.mob.char.root.position, hp: e.hp, airborneSec: 0 }))) >= 3;
      if (surroundedNow !== camCrowd) { camCrowd = surroundedNow; ctx.camDirector.setPreset(camCrowd ? 'crowd' : 'overShoulder'); }
      ctx.camDirector.look(lookX, lookY, dtReal);
      ctx.camDirector.update(player.root.position, facingVec(), nearest(player.root.position)?.mob.char.root.position ?? null);
      animate(mySpeed01, Math.min(1, pVel.length() / 2.6));
    },

    dispose() { crowd?.dispose(); crowd = null; karateVenue?.dispose(); karateVenue = null; player?.dispose(); partner?.dispose(); pool?.dispose(); playerSlot?.dispose(); partnerSlot?.dispose(); SoundKit.stopAmbient(); },
  };
})();

// HUD fields: no hp / partnerHp since the A+ identity P0 (one-knock both ways). Formerly: partnerHp (0-100 — currently
// cosmetic since the ally can't be knocked out in this pass; wire a real
// down-state if wanted). Existing fields (wave, enemies, hp, chi, kos,
// banner, hint) unchanged.
