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
import type { ControlSource, Intent } from '../core/PlayerSlot';
import { PlayerSlot, LocalInputSource } from '../core/PlayerSlot';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { VenueKit } from '../visual/VenueKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';  // M74
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { KARATE_CONFIG as CFG } from './modeConfigs';
import {
  waveSpec, spawnRing, buyPerk, PERKS, DownRevive, REVIVE_RANGE,
  surroundedCount, crowdClear, CROWDCLEAR_RADIUS,
} from '../core/OnslaughtCore';

const STANCE = SPORT_CLIP.karateStance;
const STRIKES = {
  A: { clip: SPORT_CLIP.karateJab, dmg: 12, range: 1.4 },
  B: { clip: SPORT_CLIP.karateKick, dmg: 18, range: 1.8 },
  Y: { clip: SPORT_CLIP.karateHeavy, dmg: 24, range: 1.5 },
} as const;

// horde sizing — deliberately bigger/faster than the old wave-survival pace
const WAVE = { base: 4, max: 12, growEvery: 1, hpBase: 22, hpPerWave: 4 };
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

interface Enemy { mob: Mob; hp: number; maxHp: number }

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
  let player: SpawnedCharacter, partner: SpawnedCharacter;
  let playerSlot: PlayerSlot, partnerSlot: PlayerSlot, localSource: LocalInputSource;
  let pool: MobPool;
  let enemies: Enemy[] = [];
  let wave = 0, kos = 0, totalKos = 0, playerHp = 100, partnerHp = 100, chi = 0;
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
  let xHoldSec = -1, iframeSec = 0, slowMoSec = 0;
  let stickX = 0, stickY = 0;

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
    enemies.push({ mob, hp: WAVE.hpBase + wave * WAVE.hpPerWave, maxHp: WAVE.hpBase + wave * WAVE.hpPerWave });
  }

  async function spawnWave(ctx: ModeContext): Promise<void> {
    // between waves (not the first): the perk shop opens
    if (wave >= 1) {
      shopOpen = true;
      ctx.setHud({ banner: 'PERKS — d-pad to browse, A to buy, B to fight', perks: PERKS.map((p, i) => `${i + 1}=${p.label} ${p.costCoins}c`).join(' · '), coins });
    }
    wave++; kos = 0;
    const spec = waveSpec(wave);
    const count = spec.count;
    void spawnRing(wave, count);
    const proms: Promise<void>[] = [];
    for (let i = 0; i < count; i++) proms.push(spawnEnemy(ctx, (i / count) * Math.PI * 2 + wave, i));
    await Promise.all(proms);
    ctx.setHud({ wave, enemies: count, hp: playerHp, chi });
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
    if (!CHI_BURST_ENABLED || chi < 100 || striking || dodging || bursting) return;
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
    player.animator.play(STRIKES.Y.clip, { onEnd: () => { striking = false; player.animator.play(STANCE, { loop: true, fadeSec: 0.12 }); } });
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
      landHit(ctx, e, CHI_BURST_DAMAGE);
    }
    chi = 0; ctx.setHud({ chi });
    bursting = false;
  }

  function strike(ctx: ModeContext, key: keyof typeof STRIKES): void {
    if (striking || blocking || dodging) return;
    striking = true;
    const s = STRIKES[key];
    const target = nearest(player.root.position);
    if (target) {
      const to = target.mob.char.root.position.subtract(player.root.position);
      player.root.rotation.y = Math.atan2(to.x, to.z);
    }
    SoundKit.play('whoosh');
    player.animator.play(s.clip, { onEnd: () => { striking = false; player.animator.play(STANCE, { loop: true, fadeSec: 0.12 }); } });
    setTimeout(() => {
      const t = nearest(player.root.position);
      if (!t || Vector3.Distance(t.mob.char.root.position, player.root.position) > s.range) return;
      landHit(ctx, t, s.dmg);
    }, 150);
  }

  function landHit(ctx: ModeContext, t: Enemy, dmg: number): void {
    t.hp -= Math.round(dmg * dmgMult);
    gainChi(ctx, 8);
    ctx.feel?.impact?.(0.35);
    EffectsKit.burst(ctx.scene, t.mob.char.root.position.add(new Vector3(0, 1.1, 0)), 'sparks');
    if (t.hp <= 0) ko(ctx, t); else t.mob.char.animator.play(SPORT_CLIP.karateHitReact, {});
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

  function tryDodge(ctx: ModeContext): void {
    if (dodging || striking) return;
    dodging = true;
    iframeSec = DODGE_IFRAME_SEC;
    const dir = Math.hypot(stickX, stickY) > 0.2
      ? new Vector3(stickX, 0, -stickY).normalize()
      : facingVec().scale(-1);            // no input = dodge backward
    SoundKit.play('whoosh', { pitch: 1.5, volume: 0.4 });
    const from = player.root.position.clone();
    const to = from.add(dir.scale(DODGE_DISTANCE));
    player.animator.play(SPORT_CLIP.footballJukeLeft, {});
    const t0 = performance.now();
    const obs = ctx.scene.onBeforeRenderObservable.add(() => {
      const k = Math.min(1, (performance.now() - t0) / 320);
      player.root.position = Vector3.Lerp(from, to, k);
      if (k >= 1) {
        ctx.scene.onBeforeRenderObservable.remove(obs);
        dodging = false;
        player.animator.play(STANCE, { loop: true });
      }
    });
  }

  return {
    modeId: 'karate', mood: 'dojoWarm', camPreset: 'overShoulder',

    async load(ctx) {
      // Build the arena FIRST so the M37 spawn guard sees a populated world
      // (>=8 meshes) and the dojoWarm ambient bed has somewhere to live.
      karateVenue = mountVenue(ctx, 'karate_endless', { keepGameplayCamera: true });
      if (!karateVenue) VenueKit.buildDojo(ctx.scene);
      EffectsKit.ambient(ctx.scene, 'dojo');
      player = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, { position: new Vector3(0, 0, 1.5), startClip: STANCE });
      neverBindPose(player.animator, STANCE);
      installSafePlay(player.animator, 'agent-player');
      ctx.groundLock?.track(player.root, player.skeleton);
      ctx.heroRef.current = player.root;

      partner = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, { position: new Vector3(1.6, 0, 0.8), tint: '#22d3ee', startClip: STANCE });
      neverBindPose(partner.animator, STANCE);
      installSafePlay(partner.animator, 'agent-partner');
      ctx.groundLock?.track(partner.root, partner.skeleton);

      localSource = new LocalInputSource();
      playerSlot = new PlayerSlot('player', localSource, true);
      partnerSlot = new PlayerSlot('partner', new PartnerAISource(
        () => partner.root.position, () => nearest(partner.root.position)?.mob.char.root.position ?? null, 1.6,
      ), false);

      pool = new MobPool();
      wave = 0; totalKos = 0; playerHp = 100; partnerHp = 100; chi = 0; enemies = [];
      striking = false; blocking = false; dodging = false; xHoldSec = -1; iframeSec = 0; slowMoSec = 0;
      ctx.camDirector.snapTo(player.root.position, player.root.position.add(facingVec()));
      karateVenue?.hidePlaceholders();  // M74
      SoundKit.startAmbient('dojo');
      await spawnWave(ctx);
      ctx.setHud({ hp: playerHp, partnerHp, chi, hint: 'Quick-tap BLOCK to dodge · hold BLOCK to guard · R1 = CHI BURST at full' });
    },

    onInput(ctx, e: FelInput) {
      SoundKit.unlock();
      localSource.feed(e);
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
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
        if (!dodging) player.animator.play(STANCE, { loop: true });
      }
    },

    update(ctx, dtReal) {
      clockSec += dtReal;
      // Phase 8: down/revive tick
      if (myDown.downed) {
        const near = Vector3.Distance(partner.root.position, player.root.position) <= REVIVE_RANGE;
        if (myDown.channel(dtReal, near)) {
          playerHp = Math.round(100 * myDown.revive());
          SoundKit.play('powerUp', { pitch: 1.1 });
          ctx.setHud({ hp: playerHp, banner: 'REVIVED — BACK IN THE FIGHT' });
          player.animator.play(STANCE, { loop: true });
          setTimeout(() => ctx.setHud({ banner: '' }), 900);
        }
        if (myDown.bledOut(clockSec)) {
          return ctx.end(`WAVE_${wave}`, totalKos * 100 + wave * 50, { wave, kos: totalKos });
        }
      }
      if (partnerDown.downed) {
        if (revivingPartner && Vector3.Distance(player.root.position, partner.root.position) <= REVIVE_RANGE) {
          if (partnerDown.channel(dtReal, true)) {
            partnerHp = Math.round(100 * partnerDown.revive());
            SoundKit.play('powerUp', { pitch: 1.1 });
            ctx.setHud({ partnerHp, banner: 'PARTNER REVIVED!' });
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
        if (xHoldSec * 1000 >= DODGE_TAP_MS && !blocking && !dodging) {
          blocking = true;
          player.animator.play(SPORT_CLIP.karateBlock, { loop: true });
        }
      }
      iframeSec = Math.max(0, iframeSec - dtReal);

      playerSlot.poll(dt);
      partnerSlot.poll(dt);

      const vel = new Vector3(stickX * 3, 0, -stickY * 3);
      if (!striking && !blocking && !dodging && vel.lengthSquared() > 0.05) {
        player.root.position.addInPlace(vel.scale(dt));
        player.root.position.x = Math.max(-8, Math.min(8, player.root.position.x));
        player.root.position.z = Math.max(-8, Math.min(8, player.root.position.z));
        player.root.rotation.y = Math.atan2(vel.x, vel.z);
        player.animator.play(SPORT_CLIP.moveLoop, { loop: true });
      } else if (!striking && !blocking && !dodging && vel.lengthSquared() <= 0.05) {
        player.animator.play(STANCE, { loop: true });
      }

      // partner movement/attacks
      const pIntent = partnerSlot.intent;
      const pVel = new Vector3(pIntent.moveX, 0, -pIntent.moveY).scale(2.6);
      partner.root.position.addInPlace(pVel.scale(dt));
      partner.root.position.x = Math.max(-8, Math.min(8, partner.root.position.x));
      partner.root.position.z = Math.max(-8, Math.min(8, partner.root.position.z));
      if (pVel.lengthSquared() > 0.05) partner.root.rotation.y = Math.atan2(pVel.x, pVel.z);
      partner.animator.play(pVel.lengthSquared() > 0.1 ? SPORT_CLIP.moveLoop : STANCE, { loop: true });
      if (pIntent.action) {
        const t = nearest(partner.root.position);
        partner.animator.play(SPORT_CLIP.karateJab, { onEnd: () => partner.animator.play(STANCE, { loop: true }) });
        if (t && Vector3.Distance(t.mob.char.root.position, partner.root.position) < 1.8) landHit(ctx, t, 10);
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
        playerHp -= blocking ? 3 : 10;
        gainChi(ctx, blocking ? 2 : 4);
        mob.onContactResolved();
        if (!blocking) { player.animator.play(SPORT_CLIP.karateHitReact, {}); ctx.feel?.impact?.(0.4); }
        ctx.setHud({ hp: Math.max(0, playerHp) });
        if (playerHp <= 0) {
          // Phase 8 co-op rule: go DOWN (not out) while the partner stands;
          // they can revive you. Both down (or no partner alive) = run over.
          if (!partnerDown.downed && partnerHp > 0 && !myDown.downed) {
            myDown.down(clockSec);
            playerHp = 0;
            SoundKit.play('crowdGroan');
            player.animator.play(SPORT_CLIP.karateKnockdown, {});
            ctx.setHud({ banner: 'YOU ARE DOWN — PARTNER CAN REVIVE YOU', hp: 0 });
          } else if (myDown.downed) {
            // already down and got hit again — nothing to do
          } else {
            SoundKit.play('crowdGroan');
            player.animator.play(SPORT_CLIP.karateKnockdown, { onEnd: () => {} });
            return ctx.end(`WAVE_${wave}`, totalKos * 100 + wave * 50, { wave, kos: totalKos });
          }
        }
      }

      // camera: locked behind the player's FACING (not the nearest enemy) —
      // pass a full-magnitude facing-direction vector as "velocity" so the
      // existing velocity-derived back-vector branch does the work (see
      // CameraDirector v2.4 header). Must stay near unit length: the branch
      // gates on lengthSquared() > 0.01, and the same vector also drives the
      // look-ahead target, which is exactly the desired effect here — the
      // camera looks slightly down the direction you're facing.
      ctx.camDirector.update(player.root.position, facingVec(), nearest(player.root.position)?.mob.char.root.position ?? null);
    },

    dispose() { karateVenue?.dispose(); karateVenue = null; player?.dispose(); partner?.dispose(); pool?.dispose(); playerSlot?.dispose(); partnerSlot?.dispose(); SoundKit.stopAmbient(); },
  };
})();

// HUD fields introduced: partnerHp (0-100, your ally's health — currently
// cosmetic since the ally can't be knocked out in this pass; wire a real
// down-state if wanted). Existing fields (wave, enemies, hp, chi, kos,
// banner, hint) unchanged.
