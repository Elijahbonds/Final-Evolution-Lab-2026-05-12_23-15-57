// NetSportMode — the factory both net sports are built from.
//
// Tennis and volleyball share a loop: a ball crosses a net, the receiving side
// gets a timing window, and the rally ends on a miss, a net, or an out. Only
// scoring and touches-per-side differ. So this is written once as a factory
// and each mode is a config object — the same call BasketballCore made for
// 1v1 / 3v3 / dunk, and the reason volleyball cost a file rather than a week.
//
// All rally arithmetic lives in RallyCore (Babylon-free, 37 executed tests).
// This file owns meshes, input, animation and HUD, and nothing else.

import { nerve, standingOf, SKILL_FLOOR, SKILL_CEIL, type Standing } from '../core/Nerve';
import { Color3, DynamicTexture, MeshBuilder, PBRMaterial, Vector3 } from '@babylonjs/core';
import { answerFor, tellFor, rallyPace, SHOT_FACE } from '../core/tennisHud';
// TENNIS UPGRADE (owner, 2026-09-18: "football, tennis and soccer upgrades next"): the Wii read — WHEN you swing bends
// WHERE it goes, a landing ring on the far court shows the shot you are holding, the timing meter draws its bands, and
// the weather drifts the flight (shown before you commit).
import { aimFor, landingFor, windDrift, meterBandsFor } from '../core/TennisAim';
import { mountRing, type RingHandle } from '../visual/AimArrow';
import { WeatherKit } from '../core/WeatherKit';
import { readWeather } from '../nexus/weather';
import { mountWeatherFx, type WeatherFxHandle } from '../premium/WeatherFx';
import { ballKindFor, dressBall } from '../visual/meshyProps';
import type { AbstractMesh, Mesh, Scene } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay } from '../anim/clipRegistry';
import { NetAnimTree, TENNIS_CLIPS, VOLLEYBALL_CLIPS, NET_CONTACT_SEC, type NetClipSet } from '../anim/netTree';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { readPlaceLook } from '../nexus/placeLooks';
import { SoundKit } from '../audio/SoundKit';
import { refuse } from '../core/Refusal';   // MECHANICS PASS: a press that cannot act is answered
import { EffectsKit } from '../visual/EffectsKit';
import { Onlookers } from '../visual/Onlookers';
import { mountPostureLayer } from '../anim/PostureLayer';
import { fieldPose, netWindow, fieldBank, NET_REACH_M } from '../core/FieldPosture';
import {
  TENNIS_FOOTWORK, VOLLEY_FOOTWORK, FOOTWORK_IDLE, stepFootwork, splitTimed, splitBoostActive,
  reachOf, gradeAfterStretch, recoveryX, aiTargetX, MAX_REACH_M, type FootworkState,
} from '../core/CourtFootwork';

/** Seconds before the blocker can commit to the net again. */
const BLOCK_COOLDOWN_SEC = 7;

// ── The energy layer (Mario Tennis Aces) ────────────────────────────────────
// A gauge you fill by hitting the ball WELL and spend on a shot that can break
// the other player's racket. Aces also has Zone Speed and a trick-shot dash;
// both exist to help you REACH a ball, and this mode has no player positioning
// to reach with, so they are recorded as out of scope rather than faked.
export const ENERGY_MAX = 100;
export const ENERGY_PERFECT = 20;
export const ENERGY_GOOD = 9;
export const ENERGY_RALLY_WON = 10;
/** A Zone Shot costs the whole gauge — it is the payoff, not a rotation. */
export const ZONE_COST = 100;
/** Rackets each side can lose before the match is over. */
export const RACKETS = 3;
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import {
  gradeSwing, planShot, shotAt, judgeShot, TennisScore, VolleyScore, RallyState,
  volleyTouchFor, volleyCrosses, BLOCK_STUFF_WINDOW,
  type TennisShot,
  type RallyConfig, type Shot, type SwingQuality, type RallyFault, type VolleyTouch,
} from '../core/RallyCore';

export interface NetSportOptions {
  modeId: string;
  venueId: string;
  heroUrl: string;
  cfg: RallyConfig;
  /** 'tennis' uses games/deuce; 'volley' uses rally scoring to a target. */
  scoring: 'tennis' | 'volley';
  ballDiameter: number;
  ballTint: string;
  ambient: Parameters<typeof SoundKit.startAmbient>[0];
  /** L4 — line the court with spectators. Opt-in per mode so a mode that has
   *  not had a World-Population pass does not silently gain one. */
  crowd?: boolean;
  /** ARENA-10PHASE P5: a real beach under the court — sand to the horizon, the sea past the far baseline, a foam edge. The
   *  spec's 15 × 24 sand plate ended 3 m past the lines and every prop past it stood over the void ("floating bus and
   *  storefront", playtest d3d4a93). Volleyball only. */
  beach?: boolean;
  /** Aces' energy gauge, Zone Shot and racket break. Tennis only. */
  energy?: boolean;
  swingClip: string;
  /** 0–1. How reliably the AI returns; higher misses less. */
  aiSkill: number;
  hudLabels: { you: string; them: string };
}

/** ARENA-10PHASE P5 (2026-09-07): the beach the Beach Pro court sits on. Sand out to ±100 m (tiled ripple grain), the sea
 *  past the far baseline with a foam line where it meets the sand — so the prop set's shops, bus, palms and rocks all
 *  stand on ground, and the reverse angles have somewhere to look. */
function buildBeach(scene: Scene): { dispose(): void } {
  const sand = MeshBuilder.CreateGround('beach_sand', { width: 220, height: 220 }, scene);
  sand.position.y = -0.02; sand.isPickable = false; sand.receiveShadows = true;
  const tex = new DynamicTexture('beach_sand_tex', { width: 1024, height: 1024 }, scene, false);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  g.fillStyle = '#c7ab76'; g.fillRect(0, 0, 1024, 1024);   // SCORECARD VISUALS: a shade down — the goldenHour sand washed the frame out
  g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 3;
  for (let i = 0; i < 70; i++) { const y = (i / 70) * 1024; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 1024; x += 24) g.lineTo(x, y + Math.sin(x * 0.02 + i * 0.9) * 6); g.stroke(); }
  g.fillStyle = 'rgba(120,95,60,0.14)';
  for (let i = 0; i < 900; i++) g.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
  tex.update(); tex.uScale = 7; tex.vScale = 7;
  const sandM = new PBRMaterial('beach_sand_mat', scene);
  sandM.albedoTexture = tex; sandM.metallic = 0; sandM.roughness = 0.95; sandM.environmentIntensity = 0.6;
  sand.material = sandM;
  const sea = MeshBuilder.CreateGround('beach_sea', { width: 220, height: 140 }, scene);
  sea.position.set(0, 0.01, -118); sea.isPickable = false;
  const seaM = new PBRMaterial('beach_sea_mat', scene);
  seaM.albedoColor = Color3.FromHexString('#2a8fbd'); seaM.metallic = 0.1; seaM.roughness = 0.25; seaM.emissiveColor = Color3.FromHexString('#0f4f70').scale(0.25);
  sea.material = seaM;
  const foam = MeshBuilder.CreateCylinder('beach_foam', { diameter: 0.9, height: 220, tessellation: 8 }, scene);
  foam.rotation.z = Math.PI / 2; foam.position.set(0, 0.12, -48.5); foam.isPickable = false;
  const foamM = new PBRMaterial('beach_foam_mat', scene);
  foamM.albedoColor = Color3.White(); foamM.alpha = 0.75; foamM.metallic = 0; foamM.roughness = 0.6;
  foam.material = foamM;
  return { dispose() { sand.dispose(); sea.dispose(); foam.dispose(); tex.dispose(); sandM.dispose(); seaM.dispose(); foamM.dispose(); } };
}

/**
 * A NET YOU CAN SEE (SCORECARD VISUALS, 2026-09-15). The venue's `net` prop is a translucent white panel, and on bright
 * sand it vanished: the rc10 frame review could barely find the net the whole rally is played over. Two posts, a dark
 * mesh band hanging under a white tape at the height RallyCore plays to, spanning the court and a little past it.
 */
function buildReadableNet(scene: Scene, cfg: { halfWidth: number; netHeight: number }): { dispose(): void } {
  const span = cfg.halfWidth * 2 + 1.6, top = cfg.netHeight, band = Math.min(1, top * 0.42);
  const post = new PBRMaterial('rally_net_post_mat', scene);
  post.albedoColor = Color3.FromHexString('#e8e2d0'); post.metallic = 0.6; post.roughness = 0.35;
  const mesh = new PBRMaterial('rally_net_band_mat', scene);
  mesh.albedoColor = Color3.FromHexString('#1b2433'); mesh.metallic = 0; mesh.roughness = 0.9; mesh.alpha = 0.82;
  const tape = new PBRMaterial('rally_net_tape_mat', scene);
  tape.albedoColor = Color3.White(); tape.emissiveColor = Color3.White().scale(0.25); tape.metallic = 0; tape.roughness = 0.6;
  const made: Mesh[] = [];
  for (const sx of [-1, 1]) {
    const p = MeshBuilder.CreateCylinder('rally_net_post', { diameter: 0.1, height: top + 0.15, tessellation: 12 }, scene);
    p.position.set(sx * span / 2, (top + 0.15) / 2, 0); p.material = post; made.push(p);
  }
  const b = MeshBuilder.CreateBox('rally_net_band', { width: span, height: band, depth: 0.02 }, scene);
  b.position.set(0, top - band / 2, 0); b.material = mesh; made.push(b);
  const t = MeshBuilder.CreateBox('rally_net_tape', { width: span, height: 0.07, depth: 0.03 }, scene);
  t.position.set(0, top - 0.035, 0); t.material = tape; made.push(t);
  for (const m of made) { m.isPickable = false; m.receiveShadows = true; m.freezeWorldMatrix(); }
  return { dispose() { for (const m of made) m.dispose(); post.dispose(); mesh.dispose(); tape.dispose(); } };
}

export function createNetSportMode(o: NetSportOptions): ModeDefinition {
  let me: SpawnedCharacter, foe: SpawnedCharacter;
  let ball: AbstractMesh;
  let venue: VenueHandle | null = null;
  let beach: { dispose(): void } | null = null;      // P5
  let readableNet: { dispose(): void } | null = null;
  let crowdEnds: Onlookers | null = null;            // P5

  let rally: RallyState;
  let tennisScore: TennisScore | null = null;
  let volleyScore: VolleyScore | null = null;

  // flight state
  let shot: Shot | null = null;
  let crowd: Onlookers | null = null;
  let flightT = 0;                 // 0..1 across the current flight
  let contactArmed = false;        // the receiving side may swing
  let awaitingHuman = false;       // is the ball coming to us?
  /** What KIND of shot is in the air. A block only answers an attack, and an
   *  attack is harder to return than a dig — both need this. */
  let incomingTouch: VolleyTouch | undefined;
  /** One block attempt per incoming attack. */
  let blockSpent = false;
  /** The shot the player has selected for their NEXT contact (one-touch sports).
   *  Chosen by which button they swing with, so it is a decision made under the
   *  same time pressure as the timing itself. */
  let pendingShot: TennisShot = 'drive';
  /** A+ mission #6 (Mario Tennis): the opponent PICKS a shot — mostly drives, a slice, the odd lob or drop — so the
   *  tell on the incoming ball is a real read, not a label. */
  function pickAiShot(): TennisShot { const r = Math.random(); return r < 0.5 ? 'drive' : r < 0.75 ? 'slice' : r < 0.9 ? 'lob' : 'drop'; }
  /**
   * Seconds until the player can commit to the net again.
   *
   * A real block's cost is POSITIONAL: you commit to the net and leave the
   * court open behind you, so you cannot block every attack. This mode has no
   * player positioning at all — contact is pure timing — so that cost cannot be
   * expressed geometrically, and without it a well-timed block strictly
   * dominates the dig (measured: blocking every attack won 10-0 against 3-0 for
   * digging, at every timing window I tried). A cooldown is the honest
   * stand-in: the block is a resource you spend, not a default you hold.
   */
  let blockCooldown = 0;
  /** Aces' energy gauge, per side. [hero, opponent]. */
  let energy: [number, number] = [0, 0];
  /** Rackets left. Lose them all and the match ends there, mid-set. */
  let rackets: [number, number] = [RACKETS, RACKETS];
  /** Is the ball in flight a Zone Shot? It answers differently to everything. */
  let incomingZone = false;
  let aimX = 0;
  /** WII READ: the landing ring, the weather. */
  let landing: RingHandle | null = null;
  let weather: WeatherKit = new WeatherKit(); let weatherFx: WeatherFxHandle | null = null;
  // ANIM-READABILITY (net / precision, 2026-09-07): the tree is the ONE owner of each body's clips. The mode never calls
  // animator.play — it latches beats (swing / serve / block) and feeds the tree once per frame, every phase, with the
  // shuffle INTENT, so a beat that runs out under a held stick settles onto the shuffle (the per-frame shuffle play + the
  // swing's neverBindPose chain used to flash idle_stand for 0.08 s at every settle: a 0.33–0.47 m hand pop). The sport's
  // own ready bounce and ready shuffles replace idle_stand / the hanging strafe; the serve and the block are their own clips.
  const clips: NetClipSet = { ...(o.cfg.touchesPerSide > 1 ? VOLLEYBALL_CLIPS : TENNIS_CLIPS), swing: o.swingClip };
  let meTree: NetAnimTree, foeTree: NetAnimTree;
  let meSwing = false, meServe = false, meBlock = false, foeSwing = false;
  /** The serve: the ball leaves on the clip's contact beat (the trophy → overhead), not at the toss. */
  let serveIn = 0, serveTotal = 0, serveAim = 0; let serveFrom: Vector3 | null = null;
  let ended = false;
  let restSec = 0;                 // pause between points
  let heroStreak = 0;              // M107: consecutive points won → tension/hype
  // A+ P0 juice (PM brief NET-PRECISION-A-PLUS-P0, 2026-09-06): the GAME win is a latched hit-stop + shake + gold flash +
  // score pop — NO slowMo (juice.impact({ slow: true }) is forbidden here, same rule as the dunk). One thud per beat.
  let gameLatch = false;

  const HERO_SIDE = 1;             // hero defends +Z, opponent defends −Z

  // ── FOOTWORK (2026-09-13) ────────────────────────────────────────────────
  // This file used to say, in its own words, that Zone Speed and the trick-shot dash were out of scope because
  // "this mode has no player positioning to reach with". It does now. The old shuffle moved the body at a flat
  // 4 m/s with no momentum and, crucially, WITHOUT THE BALL CARING — every shot arrived in the stance wherever
  // the player happened to be standing, so planShot's careful depth and angle landed on nobody.
  const FOOT = o.cfg.touchesPerSide > 1 ? VOLLEY_FOOTWORK : TENNIS_FOOTWORK;
  let foot: FootworkState = { ...FOOTWORK_IDLE };
  /** Seconds since the OPPONENT last struck — the split step is timed against this. */
  let sinceOppStrike = Infinity;
  /** Where the player should recover to after their own shot (the bisector, not the middle). */
  let recoverTo = 0;
  /** How far the last contact was from the body, for the HUD and the posture window. */
  let lastReach = 0;
  let posture: { dispose(): void } | null = null;
  /** A mark on the player's own baseline showing the bisector to recover to. */
  let recoverMark: AbstractMesh | null = null;
  let swingingNow = false, splittingNow = 0;
  /** Reused so the per-frame camera feed allocates nothing. */
  const camVel = new Vector3();
  const camSubject = new Vector3();
  /** How much of the player's lateral travel the camera takes. The rest is pan. */
  const CAM_PAN_FRAC = 0.35;
  const camAim = new Vector3();   // the aim point: the ball, drawn toward a player who has strayed from the pan
  /** And it never leaves this box, whatever the player does — the scenery starts just past the sidelines. */
  const CAM_PAN_M = 2.6;

  function label(): string {
    if (tennisScore) return tennisScore.callFor(0);
    if (volleyScore) return `${volleyScore.points[0]} – ${volleyScore.points[1]}`;
    return '';
  }

  function pushHud(ctx: ModeContext): void {
    if (o.energy) {
      ctx.setHud({
        energy: Math.round(energy[0]),
        rackets: `${rackets[0]}/${RACKETS}`,
        foeRackets: `${rackets[1]}/${RACKETS}`,
      });
    }
    ctx.setHud({
      score: tennisScore ? tennisScore.games[0] : volleyScore!.points[0],
      foeScore: tennisScore ? tennisScore.games[1] : volleyScore!.points[1],
      callout: label(),
      // A+ mission #6 (Wii readability): the scoreboard chip — both sides' games, the umpire call, the streak
      call: tennisScore ? label() : '', streak: heroStreak, you: 'YOU', them: 'THEM',   // hudLabels are the point-flash strings, not side names
      weather: weather.describe(),
    });
  }

  // ARENA-10PHASE P6 (2026-09-07): ONE banner channel. Every flash used to arm its own clear timer, so a second banner inside
  // the first's window was wiped early by the first's timeout — and the point award ALSO fired a world-space scorePop
  // ("+1 YOUR POINT") at the net, which projects onto the same screen centre as the HUD banner ("THEY MISSED — YOUR POINT"):
  // the stacked banners in playtest d3d4a93's tennis-mid.png. The banner is the one text channel now; a new flash replaces
  // the old one and owns the clear.
  let bannerTimer: ReturnType<typeof setTimeout> | null = null;
  function flash(ctx: ModeContext, text: string, ms = 900): void {
    if (bannerTimer) clearTimeout(bannerTimer);
    ctx.setHud({ banner: text });
    bannerTimer = setTimeout(() => { bannerTimer = null; ctx.setHud({ banner: '' }); }, ms);
  }

  /** Award a point to `side` (0 = hero) and set up the next serve. */
  function awardPoint(ctx: ModeContext, side: 0 | 1, why: string): void {
    rally.end();
    shot = null;
    contactArmed = false;
    ctx.setHud({ incomingShot: '', incomingTell: '', answer: '' });
    if (o.energy) {
      energy[side] = Math.min(ENERGY_MAX, energy[side] + ENERGY_RALLY_WON);
    }
    const result = tennisScore ? tennisScore.award(side) : volleyScore!.award(side);
    pushHud(ctx);
    SoundKit.play(side === 0 ? 'score' : 'miss');
    // L4: they react to the point, or they are set dressing. Louder for the
    // home side, which is what a crowd at a beach court actually does.
    crowd?.cheer(side === 1 ? 1 : 0.35);
    crowdEnds?.cheer(side === 0 ? 1 : 0.35);   // P5: the end banks are the home crowd

    // M107 point feedback → ARENA-10PHASE P6: the point's TEXT lives in the banner alone (see flash); the feel hit, the
    // shake and the loss flash stay. The streak still builds tension across a game.
    const netPop = new Vector3(0, o.cfg.netHeight + 0.5, 0);
    if (side === 0) {
      heroStreak++;
      // A RALLY WON IS THIS MODE'S HIGHLIGHT. Net sports reported nothing into the Game-Breaker layer, so a
      // player taking six straight points sounded exactly like a player losing six. The streak is reported
      // SEPARATELY from the point because a run is worth more than the sum of its rallies.
      ctx.momentum.report({ kind: 'clean_run', weight: 12 });
      if (heroStreak >= 3) ctx.momentum.report({ kind: 'chain', weight: Math.min(20, 4 * heroStreak) });
      ctx.feel.impact(0.22);
      ctx.juice.shake(0.05, 90);   // A+ P0: a soft shake on your point — no slowMo, no hit-stop beyond the feel hit's own
      console.info('[NET-JUICE] point won');
    } else {
      heroStreak = 0;
      ctx.momentum.report({ kind: 'blunder', weight: -9 });
      ctx.juice.flash('#FF3366', 160);
    }

    if (result === 'match' || result === 'set') {
      ended = true;
      if (side === 0) gameWinPunch(ctx, netPop);   // A+ P0: was juice.impact(..., { slow: true }) — the forbidden slowMo; same punch without it
      else ctx.juice.flash('#FF3366', 260);
      flash(ctx, side === 0 ? 'GAME! — YOU WIN' : 'YOU LOSE', 2500);
      ctx.end(
        side === 0 ? 'WIN' : 'LOSS',
        tennisScore ? tennisScore.games[0] : volleyScore!.points[0],
        { streak: heroStreak },
      );
      return;
    }
    if (side === 0 && heroStreak >= 3) {
      flash(ctx, `STREAK ×${heroStreak} — ${why}`, 1100);
    } else {
      flash(ctx, `${why} — ${side === 0 ? o.hudLabels.you : o.hudLabels.them}`, 1100);
    }
    restSec = 1.4;
  }

  /** A+ P0: the GAME win — hit-stop + shake + gold flash + the GAME! pop, latched once. No slowMo. The score SFX + YOU WIN banner stay. */
  function gameWinPunch(ctx: ModeContext, at: Vector3): void {
    if (gameLatch) return;
    gameLatch = true;
    ctx.juice.hitStop(60);
    ctx.juice.shake(0.14, 150);
    ctx.juice.flash('#FFD700', 140);
    void at;   // P6: the GAME! text rides the YOU WIN banner (one text channel); the punch keeps its hit-stop, shake and flash
    console.info('[NET-JUICE] game win punch');
  }

  /** Begin a flight from `from` toward `toSide`, with a quality already graded. */
  function launch(
    _ctx: ModeContext, from: Vector3, toSide: -1 | 1, aim: number, q: SwingQuality,
    // NOT named `shot`: the module already has `let shot: Shot | null` for the
    // ball in flight, and shadowing it here made `shot = planned` assign to the
    // parameter instead of the flight state.
    touch?: VolleyTouch, tennisShot?: TennisShot, zone = false,
  ): boolean {
    const planned = planShot(o.cfg, { x: from.x, y: from.y, z: from.z }, toSide, aim, q, touch, tennisShot);
    if (!planned) return false;
    // A+ mission #6: the rally speeds up as it grows (tennis only; the three-touch sport keeps its pace)
    if (o.cfg.touchesPerSide === 1) planned.duration *= rallyPace(rally.touches);
    // WEATHER: a crosswind drifts the flight — the landing moves, and judgeShot below judges the DRIFTED landing, so a
    // ball aimed at the line in a wind goes wide; the HUD says the wind before every point
    if (o.cfg.touchesPerSide === 1) { const w = weather.flightWind(); if (Math.hypot(w.x, w.z) >= 0.5) { const d = windDrift(w, planned.duration); planned.to.x += d.x; planned.to.z += d.z; } }
    // the timing meter's bands for THIS flight (they scale with its duration)
    if (toSide > 0 && o.cfg.touchesPerSide === 1) { const b = meterBandsFor(planned.duration); _ctx.setHud({ shotMeterBands: `${b.okFrom.toFixed(3)},${b.goodFrom.toFixed(3)},${b.perfectFrom.toFixed(3)}` }); }
    // the tell describes THEIR ball; once ours is away it is stale
    if (toSide < 0 && o.cfg.touchesPerSide === 1) _ctx.setHud({ incomingShot: '', incomingTell: '', answer: '' });

    const fault: RallyFault | null = judgeShot(o.cfg, planned);
    shot = planned;
    flightT = 0;
    contactArmed = false;
    incomingTouch = touch;
    incomingZone = zone;
    blockSpent = false;
    // Who is receiving decides whether WE get a swing window this flight.
    awaitingHuman = toSide > 0;

    // WHERE TO RECOVER TO. Not the middle of the court: the bisector of the angles they can now hit into,
    // which shades toward the side you just hit to. Standing in the middle after a sharp cross-court is the
    // most common mistake a club player makes, and the marker is here so the player can learn the habit
    // rather than be told about it.
    if (toSide < 0) {
      recoverTo = recoveryX(planned.to.x, o.cfg.halfWidth);
      if (recoverMark) { recoverMark.position.x = recoverTo; recoverMark.isVisible = true; }
    } else if (recoverMark) {
      recoverMark.isVisible = false;                 // the ball is coming: play it, do not admire the marker
    }

    if (fault) {
      // The ball still flies — it just ends in a fault when it lands. Playing
      // the flight out is what makes a net-cord read as a near miss instead of
      // the ball vanishing.
      shot.duration *= 0.8;
      pendingFault = fault;
    } else {
      pendingFault = null;
    }
    return true;
  }

  let pendingFault: RallyFault | null = null;

  function serve(ctx: ModeContext): void {
    rally.serve(0);
    const from = new Vector3(me.root.position.x, 1.5, o.cfg.halfLength * 0.92);
    ball.position.copyFrom(from);
    meTree.clearBeat('serve'); meServe = true;
    SoundKit.play('uiTick', { pitch: 1.2, volume: 0.4 });
    // the ball is tossed now and struck on the serve's contact beat (update() launches it); the aim is drawn now
    serveFrom = from; serveAim = (Math.random() - 0.5) * 0.5; serveIn = serveTotal = NET_CONTACT_SEC[clips.serve] ?? 0;
    if (serveIn <= 0) { launch(ctx, from, -1, serveAim, 'good'); serveFrom = null; }
    flash(ctx, 'SERVE', 600);
  }

  /**
   * Where the opponent stands, for Nerve.
   *
   * Both scorers expose what it takes to win -- `gamesToWin` for tennis, `target` for volleyball -- so the
   * margin normalises without this file knowing which sport it is running. Lateness is how close the
   * LEADER is to closing it out, which is the honest reading of "how much time is left": at 3-0 in a
   * first-to-4 the match is nearly over whoever you ask.
   */
  function aiStanding(): Standing {
    const toWin = tennisScore ? tennisScore.gamesToWin : volleyScore!.target;
    const mine = tennisScore ? tennisScore.games[0] : volleyScore!.points[0];
    const theirs = tennisScore ? tennisScore.games[1] : volleyScore!.points[1];
    return standingOf(theirs, mine, toWin, Math.min(1, Math.max(mine, theirs) / Math.max(1, toWin)));
  }

  /** The opponent's return. Skill decides how often they find a good one. */
  function aiReturn(ctx: ModeContext): void {
    const roll = Math.random();
    // THE OPPONENT FEELS THE SCOREBOARD NOW. This read used the config's `aiSkill` unchanged, so the AI
    // swung exactly the same down 0-3 as up 3-0 -- the same constant-opponent problem RivalNerve solved for
    // the dunk contest and nowhere else. Nerve holds the invariant: a rival that presses when trailing pays
    // for it in errors, so falling behind is never strictly better than leading.
    //
    // THE INVARIANT HAS TO HOLD IN THE GAME, NOT JUST IN THE MODULE. Feeding nerve's `edge` into the skill
    // would have made a trailing opponent swing BETTER for free -- the exact trap Nerve refuses. So the
    // halves go where they honestly belong: `mistake` DIVIDES the skill here (a player chasing a set
    // shanks more), and `aggression` drives how hard they commit to the open court below. Down a set they
    // go for more and land less.
    const shift = nerve(aiStanding());
    const skill = Math.max(SKILL_FLOOR, Math.min(SKILL_CEIL, o.aiSkill / Math.max(0.5, shift.mistake)));
    let q: SwingQuality = roll > skill ? 'miss'
      : roll > skill * 0.75 ? 'late'
      : roll > skill * 0.45 ? 'good' : 'perfect';

    // A bump and a set are routine CONTROL touches. Errors in volleyball happen
    // on the attack and the serve-receive, not on the second ball -- and the
    // miss roll is per touch, so making the opponent play three of them
    // multiplied their error rate per rally by three. Measured: a competitive
    // 4-5 became 5-0 and 4-0 with the player barely touching the ball. The
    // attack keeps the full roll, because that is where the risk belongs.
    const aiTouchPeek = volleyTouchFor(rally.touches + 1, o.cfg.touchesPerSide);
    if (q === 'miss' && aiTouchPeek !== 'spike') q = 'good';

    // A ZONE SHOT is the hardest ball in the mode to answer, and failing to
    // answer it costs a RACKET rather than only a point. That is the stake the
    // gauge buys, and it is what makes banking energy meaningful.
    if (o.energy && incomingZone) {
      if (q !== 'perfect') {
        rackets[1] = Math.max(0, rackets[1] - 1);
        pushHud(ctx);
        ctx.juice.flash('#FFD700', 220);
        SoundKit.play('impact', { pitch: 0.8, volume: 0.7 });
        if (rackets[1] === 0) {
          ended = true;
          flash(ctx, 'RACKET BROKEN — YOU WIN', 2500);
          ctx.end('WIN', tennisScore ? tennisScore.games[0] : 0, { rackets: rackets[0] });
          return;
        }
        awardPoint(ctx, 0, 'RACKET DAMAGE');
        return;
      }
      flash(ctx, 'THEY HELD IT', 700);
    }

    // An ATTACK is harder to dig than a floated ball. Without this the spike is
    // only cosmetically the payoff shot: it would look different and win points
    // at exactly the same rate as a lob, which is not what the benchmark's
    // sequence is for. Receiving one degrades the return by a step.
    if (incomingTouch === 'spike') {
      if (q === 'perfect') q = 'good';
      else if (q === 'good') q = 'late';
      else if (q === 'late' && Math.random() < 0.45) q = 'miss';
      if (q === 'miss') { awardPoint(ctx, 0, 'KILL — THEY COULD NOT DIG IT'); return; }
    }

    if (q === 'miss') { awardPoint(ctx, 0, 'THEY MISSED'); return; }

    // The opponent plays the same sequence the player does. Leaving them on a
    // one-touch return while the player has to build three would not be a
    // difficulty setting, it would be a different sport on each side of the net
    // -- and the three-touch limit would still never fire over there.
    const aiIsVolley = o.cfg.touchesPerSide > 1;
    const aiTouchNo = rally.touches + 1;
    const aiTouch = volleyTouchFor(aiTouchNo, o.cfg.touchesPerSide);
    const aiCrosses = volleyCrosses(aiTouch);

    if (rally.touch() === 'fault') { awardPoint(ctx, 0, 'FOUR TOUCHES'); return; }
    if (aiCrosses) rally.cross();

    foeTree.clearBeat('swing'); foeSwing = true;
    SoundKit.play('uiTick', { pitch: 0.9, volume: 0.35 });
    EffectsKit.burst(ctx.scene, ball.getAbsolutePosition(), 'sparks');

    // The opponent plays the same economy. A gauge only one side can spend is a
    // handicap, not a mechanic.
    let aiZone = false;
    if (o.energy) {
      energy[1] = Math.min(ENERGY_MAX, energy[1] + (q === 'perfect' ? ENERGY_PERFECT : q === 'good' ? ENERGY_GOOD : 0));
      if (energy[1] >= ZONE_COST && (q === 'perfect' || q === 'good')) {
        aiZone = true;
        energy[1] = 0;
        flash(ctx, 'THEIR ZONE SHOT', 900);
        SoundKit.play('powerUp', { pitch: 1.2, volume: 0.6 });
        ctx.juice.flash('#FF3366', 200);
      }
    }
    // A self-pass on their side must NOT hand the human a swing window, which
    // is what toSide decides (awaitingHuman = toSide > 0).
    // A+ mission #6: the opponent picks a shot (tennis) and the HUD tells it, with the answer that beats it
    const aiShot: TennisShot | undefined = aiIsVolley ? undefined : pickAiShot();
    if (aiShot) ctx.setHud({ incomingShot: aiShot.toUpperCase(), incomingTell: tellFor(aiShot), answer: `${SHOT_FACE[answerFor(aiShot)]} · ${answerFor(aiShot).toUpperCase()}` });
    // AIM INTO THE SPACE THE PLAYER LEFT. This was `(Math.random() - 0.5) * 1.6` — a coin flip, which is the
    // only aim that makes sense when the player has no position to be out of. It now plays the open court,
    // committing harder the further out of position the player is, and never paints the line (AI_LINE_SAFETY):
    // an opponent who hits the chalk every ball is not playing tennis.
    sinceOppStrike = 0;                              // the split step is timed against THIS moment
    // NERVE's aggression half: how hard they commit to the open court. Chasing the match they go for the
    // bigger angle; protecting a lead they play it safer. Capped at 1 so AI_LINE_SAFETY still keeps them
    // off the chalk -- an opponent who paints the line every ball is not playing tennis, at any scoreline.
    const commit = Math.min(1, (q === 'perfect' ? 1 : q === 'good' ? 0.75 : 0.45) * shift.aggression);
    const aiIntent = aiCrosses
      ? aiTargetX(foot.x, o.cfg.halfWidth, commit) / o.cfg.halfWidth
      : (Math.random() - 0.5) * 1.6;                 // a self-pass is not aimed at the opponent
    launch(ctx, ball.getAbsolutePosition(), aiCrosses ? 1 : -1, aiIntent, q, aiIsVolley ? aiTouch : undefined, aiShot, aiZone);
  }

  /**
   * THE BLOCK — the defensive answer to an attack, and the last piece of the
   * benchmark's rally loop. It was meaningless while every touch was the same
   * hit; now that the attack exists and wins points, this is its counter-play.
   *
   * Real volleyball's rule is what makes it worth having: a block is NOT one of
   * your three touches, so stuffing an attack leaves your side a full rally
   * afterwards. Timing is graded the same way a swing is, so it is a read on
   * the attack rather than a button you hold.
   */
  function humanBlock(ctx: ModeContext): void {
    if (o.cfg.touchesPerSide <= 1) return;          // tennis has no such thing
    // SCORECARD CONTROLS (2026-09-15): three of these exits said nothing (a block with no ball coming, a second block on the
    // same attack, a block against a dig) — and the cooldown's HUD line repeated the same text, which reads as no change
    if (!shot || !awaitingHuman) { refuse(ctx, 'WAIT FOR THEIR ATTACK'); return; }
    if (blockSpent) { refuse(ctx, 'ALREADY BLOCKED'); return; }
    if (blockCooldown > 0) { refuse(ctx, 'NOT SET AT THE NET'); return; }
    if (incomingTouch !== 'spike') { refuse(ctx, 'BLOCK THE SPIKE, NOT THE DIG'); return; }          // you cannot block a dig
    blockSpent = true;
    blockCooldown = BLOCK_COOLDOWN_SEC;

    const dt = (flightT - 1) * shot.duration;
    const q = gradeSwing(dt);
    const at = ball.getAbsolutePosition();
    // A stuff demands a tighter read than a perfect swing does — see
    // BLOCK_STUFF_WINDOW. Anything less good touches the ball back into play.
    const stuffed = Math.abs(dt) <= BLOCK_STUFF_WINDOW;

    if (q === 'miss' || q === 'late') {
      // Jumped early or arrived under it — the attack goes through, and it goes
      // through BEHIND you. Committing to the block spends your contact: you do
      // not get to dig the same ball you just jumped at.
      //
      // Without that cost the block is free, and free is not a decision — the
      // driver simply blocked every incoming ball, because every ball that
      // crosses is the opponent's third touch and therefore an attack. The
      // choice the mode wants is dig (safe, builds your own attack) against
      // block (reads the spike, wins the point outright, loses it if you are
      // wrong).
      awaitingHuman = false;
      ctx.setHud({ shotType: 'BLOCK MISSED' });
      setTimeout(() => ctx.setHud({ shotType: '' }), 500);
      SoundKit.play('uiTick', { pitch: 0.7, volume: 0.3 });
      return;
    }
    if (q === 'early') {
      // NET TOUCH (Phase 6, 2026-09-03, the sign-off's carry-forward). An
      // early jump into the net is the real game's fault, and it was also a
      // bug: 'early' fell past the miss/late branch and landed in the STUFF
      // branch, so jumping too soon was rewarded with the point.
      awaitingHuman = false;
      shot = null;
      ctx.setHud({ shotType: 'NET TOUCH' });
      SoundKit.play('uiTick', { pitch: 0.6, volume: 0.35 });
      awardPoint(ctx, 1, 'NET TOUCH');
      return;
    }

    // A GOOD block is not a stuff. It touches the ball and puts it back over
    // as a free ball, so the rally continues from a position you have earned
    // rather than ending. Only a PERFECT read stuffs it for the point.
    //
    // Both halves are needed. With every successful block ending the rally the
    // play was dominant -- blocking every incoming attack won 10-0 -- and with
    // none of them ending it (the earlier inverted-award version) it looked
    // punishing for the wrong reason. This is the shape the benchmark has: a
    // read that is worth making and hard to make.
    if (!stuffed && (q === 'good' || q === 'perfect')) {
      meTree.clearBeat('block'); meBlock = true;
      EffectsKit.burst(ctx.scene, at, 'sparks');
      ctx.setHud({ shotType: 'BLOCK · TOUCH' });
      setTimeout(() => ctx.setHud({ shotType: '' }), 500);
      SoundKit.play('uiTick', { pitch: 1.2, volume: 0.45 });
      rally.cross();
      // A FREE BALL, not an attack. This launched a 'spike', which is the
      // hardest shot in the mode to dig -- so merely touching a block was
      // nearly as good as stuffing one, and blocking still beat digging 10-0.
      // A deflection off a block is a soft ball they get to build on.
      launch(ctx, at, -1, 0, 'late');
      return;
    }

    // A stuff: straight back down on their side, and the point.
    meTree.clearBeat('block'); meBlock = true;
    EffectsKit.burst(ctx.scene, at, 'sparks');
    ctx.juice.scorePop(at, 'STUFF!', '#00E5FF');
    ctx.feel.impact(0.5);          // A+ P0: ONE thud — feel.impact plays its own; the second impact SFX that stacked on it is gone
    ctx.juice.shake(0.16, 140);
    console.info('[NET-JUICE] stuff');
    shot = null;
    // SIDE 0 IS THE HERO. This read `1` — so every successful stuff handed the
    // point to the opponent, which is the reverse of what a block is for. It
    // also corrupted the balance reading it was measured with: "blocking
    // everything loses 2-8" was partly this bug, not the risk model.
    awardPoint(ctx, 0, 'STUFF BLOCK');
  }

  /** The human's swing. Called on the action edge. */
  function humanSwing(ctx: ModeContext): void {
    // MECHANICS PASS (2026-09-15): tennis X was silent 5 of 7 and volleyball 29 % of hits — a swing with no ball coming, or
    // one too early / out of reach, returned without a word. The rally game's whole read is timing, so timing is SAID.
    if (!shot || !awaitingHuman) { refuse(ctx, 'WAIT FOR THE BALL'); return; }
    // dt vs the ideal contact moment, which is the end of the flight
    const dt = (flightT - 1) * shot.duration;
    const timing = gradeSwing(dt);

    // THE STRETCH. Timing was the whole game here; now WHERE YOU ARE multiplies it. A perfect swing at full
    // stretch is not a perfect shot — you got your racket on it, which is not the same as hitting it — and a
    // ball further away than MAX_REACH_M cannot be touched at all, however well it was timed. This is the
    // line that makes planShot's placement mean something for the first time.
    lastReach = reachOf(foot.x, ball.position.x);
    const q = gradeAfterStretch(timing as 'perfect' | 'good' | 'early' | 'late' | 'miss', lastReach);

    if (q === 'miss') { refuse(ctx, lastReach > MAX_REACH_M ? 'OUT OF REACH' : dt < 0 ? 'TOO EARLY' : 'TOO LATE'); return; }   // early flail, or never got there; not a fault yet
    if (timing !== q) {
      ctx.setHud({ shotType: lastReach > NET_REACH_M ? 'STRETCHED' : 'REACHING' });
      setTimeout(() => ctx.setHud({ shotType: '' }), 450);
    }
    swingingNow = true;
    setTimeout(() => { swingingNow = false; }, 320);

    // WHICH touch this is decides what the swing DOES. Previously every human
    // swing called rally.cross(), and cross() zeroes the touch counter, so the
    // three-touch limit could never fire and all three touches were the same
    // shot sent over the net. Bump and set now stay on your own side and hand
    // you the next contact; only the spike crosses.
    // Only a MULTI-touch sport gets the bump/set/spike shaping. volleyTouchFor
    // returns 'spike' for touchesPerSide 1, which is correct for "this touch
    // crosses" and would be quietly wrong if it also reshaped the shot: tennis
    // would start every ball above the net on a flat arc. Tennis keeps the
    // original planShot behaviour by passing no touch at all.
    const isVolley = o.cfg.touchesPerSide > 1;
    const touchNo = rally.touches + 1;
    const touchKind = volleyTouchFor(touchNo, o.cfg.touchesPerSide);
    const crosses = volleyCrosses(touchKind);

    if (rally.touch() === 'fault') { awardPoint(ctx, 1, 'TOO MANY TOUCHES'); return; }
    if (crosses) rally.cross();

    meTree.clearBeat('swing'); meSwing = true;
    SoundKit.play('uiTick', { pitch: q === 'perfect' ? 1.6 : 1.1, volume: 0.5 });
    const swingPos = ball.getAbsolutePosition();
    // M107 swing juice: a crisp pop + hit-impact on a perfectly-timed contact so
    // good timing FEELS rewarded, not just scored.
    if (q === 'perfect') {
      EffectsKit.burst(ctx.scene, swingPos, 'sparks');
      ctx.juice.scorePop(swingPos, 'PERFECT!', '#00E5FF');
      ctx.feel.impact(0.4);        // A+ P0: the one thud (+ its own 50 ms freeze) — no extra hit-stop, no second impact SFX
      ctx.juice.shake(0.08, 90);
      console.info('[NET-JUICE] perfect swing');
    } else if (q === 'good') {
      ctx.juice.scorePop(swingPos, 'NICE', '#00FF9D');
    }
    // Name the touch. In a three-touch sport the player has to know which one
    // they are about to play, and the difference between a set and a spike is
    // the difference between building the point and winning it.
    const label = o.cfg.touchesPerSide > 1
      ? `${touchKind.toUpperCase()} · ${q.toUpperCase()}`
      : `${pendingShot.toUpperCase()} · ${q.toUpperCase()}`;
    ctx.setHud({ shotType: label, touch: o.cfg.touchesPerSide > 1 ? `${touchNo}/${o.cfg.touchesPerSide}` : '' });
    setTimeout(() => ctx.setHud({ shotType: '' }), 500);
    if (touchKind === 'spike' && q === 'perfect') {
      ctx.juice.shake(0.14, 130);   // A+ P0: the spike's extra impact SFX stacked a second thud on the PERFECT feel hit — shake only now
    }
    // Holding THEIR Zone Shot is the same test in reverse: anything short of a
    // perfect read costs you a racket, and the third one ends the match on the
    // spot rather than on the scoreboard.
    if (o.energy && incomingZone && q !== 'perfect') {
      rackets[0] = Math.max(0, rackets[0] - 1);
      pushHud(ctx);
      ctx.juice.flash('#FF3366', 240);
      SoundKit.play('impact', { pitch: 0.7, volume: 0.7 });
      if (rackets[0] === 0) {
        ended = true;
        flash(ctx, 'YOUR RACKET IS GONE', 2500);
        ctx.end('LOSS', tennisScore ? tennisScore.games[0] : 0, { rackets: 0 });
        return;
      }
      awardPoint(ctx, 1, 'RACKET DAMAGE');
      return;
    }

    // ENERGY. Earned by hitting the ball well — which is the same skill the
    // mode already grades, so the gauge rewards what it is teaching.
    let zone = false;
    if (o.energy) {
      energy[0] = Math.min(ENERGY_MAX, energy[0] + (q === 'perfect' ? ENERGY_PERFECT : q === 'good' ? ENERGY_GOOD : 0));
      // A ZONE SHOT is the DRIVE at a full gauge. Binding it to one shot rather
      // than firing automatically is what keeps it a decision: play a slice, a
      // drop or a lob at full energy and you are choosing to bank it.
      if (pendingShot === 'drive' && energy[0] >= ZONE_COST && (q === 'perfect' || q === 'good')) {
        zone = true;
        energy[0] = 0;
        flash(ctx, 'ZONE SHOT', 900);
        SoundKit.play('powerUp', { pitch: 1.5, volume: 0.6 });
        ctx.juice.shake(0.2, 160);
        ctx.feel.impact(0.6);
      }
      ctx.setHud({ energy: Math.round(energy[0]) });
    }

    // WII READ: in tennis WHEN you swing is WHERE it goes — early pulls it across your body, late pushes it the other way
    launch(ctx, swingPos, crosses ? -1 : 1, isVolley ? aimX : aimFor(aimX, dt), q,
      isVolley ? touchKind : undefined,
      isVolley ? undefined : pendingShot, zone);
  }

  return {
    modeId: o.modeId,
    mood: 'goldenHour',
    camPreset: 'net',   // see CameraDirector: 'hoops' is an isolation cam and a running net player outruns it

    async load(ctx: ModeContext) {
      venue = mountVenue(ctx, o.venueId, { keepGameplayCamera: true, look: readPlaceLook(o.venueId) });   // PLACE: the splash's pick (tennis / volleyball)   // M104 gap: tennis and volleyball rendered through the venue orbit camera — the hero sat at 44 px, cut off at the frame's bottom
      if (o.beach) beach = buildBeach(ctx.scene);   // P5: sand to the horizon, the sea past the far baseline
      if (o.cfg.touchesPerSide > 1) readableNet = buildReadableNet(ctx.scene, o.cfg);   // volleyball: a net you can see

      me = await CharacterLibrary.spawn(ctx.scene, o.heroUrl, {
        position: new Vector3(0, 0, o.cfg.halfLength * 0.85), yawRad: Math.PI, startClip: clips.ready });
      neverBindPose(me.animator, clips.ready); installSafePlay(me.animator, `${o.modeId}-me`);
      ctx.groundLock?.track(me.root, me.skeleton);
      meTree = new NetAnimTree(me.animator, clips);
      meTree.onSettle = (st) => { if (st === 'swing') meSwing = false; else if (st === 'serve') meServe = false; else if (st === 'block') meBlock = false; };

      foe = await CharacterLibrary.spawn(ctx.scene, o.heroUrl, {
        position: new Vector3(0, 0, -o.cfg.halfLength * 0.85), tint: '#ff2d78', startClip: clips.ready });
      neverBindPose(foe.animator, clips.ready); installSafePlay(foe.animator, `${o.modeId}-foe`);
      ctx.groundLock?.track(foe.root, foe.skeleton);
      foeTree = new NetAnimTree(foe.animator, clips);
      foeTree.onSettle = (st) => { if (st === 'swing') foeSwing = false; };
      meSwing = meServe = meBlock = foeSwing = false; serveIn = 0; serveFrom = null;

      // Real characters are in — drop the venue's placeholder bodies, or every
      // player is on the court twice.
      venue?.hidePlaceholders();

      ball = MeshBuilder.CreateSphere('ball', { diameter: o.ballDiameter }, ctx.scene);
      void dressBall(ball, ballKindFor(o.ballDiameter));   // Meshy ball skin (visual only; volleyball keeps its sphere)
      EffectsKit.ballTrail(ctx.scene, ball);
      SoundKit.startAmbient(o.ambient);
      if (o.crowd) {
        // Down both sidelines, derived from THIS court rather than hardcoded:
        // volleyball and tennis are very different sizes, and a fixed offset
        // that clears one sits inside the other. Always outside halfWidth, so
        // nobody stands anywhere a ball can legally land.
        const sideX = o.cfg.halfWidth + 3;
        const spread = o.cfg.halfLength * 0.62;
        const spots: Vector3[] = [];
        for (let i = 0; i < 12; i++) {
          const t = (i % 6) / 5;                       // 0..1 along the sideline
          spots.push(new Vector3(i < 6 ? -sideX : sideX, 0, -spread + t * spread * 2 + (i % 2) * 0.6));
        }
        crowd = new Onlookers(ctx.scene, spots, '#3E5A70');
        if (o.beach) {
          // P5: a second bank behind each baseline — the beach court's people read as a crowd, not four figures on a
          // sideline ("billboard" bodies, playtest d3d4a93). Outside the free zone, in the foe's backdrop and the hero's.
          const endZ = o.cfg.halfLength + 4.2;
          const ends: Vector3[] = [];
          for (let i = 0; i < 10; i++) { const t = (i % 5) / 4; ends.push(new Vector3(-5 + t * 10 + (i % 2) * 0.5, 0, i < 5 ? -endZ - (i % 2) * 0.8 : endZ + (i % 2) * 0.8)); }
          crowdEnds = new Onlookers(ctx.scene, ends, '#F25F5C');
        }
      }

      rally = new RallyState(o.cfg);
      tennisScore = o.scoring === 'tennis' ? new TennisScore(4) : null;
      volleyScore = o.scoring === 'volley' ? new VolleyScore(25) : null;
      ended = false; restSec = 0.8; shot = null; aimX = 0; heroStreak = 0; gameLatch = false;

      ctx.heroRef.current = me.root;
      // WEATHER (the start screen's chip; tennis only — the beach court has no chip yet) and the landing ring
      weather = WeatherKit.fromPick(o.cfg.touchesPerSide === 1 ? readWeather(o.modeId) : 'natural', 'court', Math.floor(Date.now() / 1000) % 100000);
      weatherFx?.dispose(); weatherFx = mountWeatherFx(ctx.scene, ctx.lights, weather, { tier: ctx.lights.tier });
      landing?.dispose(); landing = o.cfg.touchesPerSide === 1 ? mountRing(ctx.scene, '#22d3ee', 1.4) : null; landing?.show(false);
      // THE BODY. Neither net sport mounted a posture layer, so between shots the chest, the neck and the head
      // sat wherever the last swing clip left them — no ready position, no split step, and the eyes never on
      // the ball. FieldPosture's net windows are the ready / split / move / load / strike / reach / serve chain.
      foot = { ...FOOTWORK_IDLE }; sinceOppStrike = Infinity; recoverTo = 0; lastReach = 0;
      // the recovery mark: a flat chevron on the player's own baseline. Unlit and unpickable — it is a coaching
      // cue drawn on the court, not a thing in the world.
      recoverMark?.dispose();
      recoverMark = MeshBuilder.CreateDisc('recover_mark', { radius: 0.34, tessellation: 3 }, ctx.scene);
      recoverMark.rotation.x = Math.PI / 2;
      recoverMark.position.set(0, 0.02, HERO_SIDE * (o.cfg.halfLength - 0.5));
      const rm = new PBRMaterial('recover_mark_m', ctx.scene);
      rm.albedoColor = Color3.FromHexString('#ffd75e'); rm.emissiveColor = Color3.FromHexString('#ffd75e').scale(0.5);
      rm.metallic = 0; rm.roughness = 1; rm.alpha = 0.5;
      recoverMark.material = rm;
      recoverMark.isPickable = false;
      recoverMark.isVisible = false;
      posture?.dispose();
      posture = mountPostureLayer(ctx.scene, me.skeleton, me.root, () => {
        const w = netWindow({
          incoming: awaitingHuman && !!shot,
          serving: !!serveFrom,
          swinging: swingingNow,
          reachM: shot && awaitingHuman ? reachOf(foot.x, ball.position.x) : lastReach,
          speed: Math.abs(foot.vx),
          splitting: splittingNow > 0,
        });
        const { pose, legs } = fieldPose(w);
        // G1 for a ball sport is THE BALL — it moves, so the aim is a live position, never a fixed objective
        const at = ball ? ball.getAbsolutePosition() : new Vector3(0, o.cfg.netHeight, 0);
        return { pose, legs, aim: at, eyes: at, window: w };
      }, 'NET-PP');
      // FRAME THE PLAYER AGAINST THE BALL, not against the middle of the net.
      //
      // The objective was a fixed point at the net's centre, and the follow camera's fitTwo frames the hero
      // against whatever this is — so with the player pinned to the middle of the baseline it looked correct
      // and, the moment CourtFootwork let them run to the sideline, the camera stayed at x 0 and the player
      // left the frame (measured: hero x 7.1, cam x 0, projected −274 px on a 900 px view). `ball.position`
      // is a LIVE reference that the flight mutates in place, so the camera now tracks the rally the way a
      // broadcast does: both ends of the exchange stay in shot because the ball IS the other end.
      ctx.objectiveRef.current = ball.position;
      ctx.camDirector.snapTo(me.root.position, new Vector3(0, 1, 0));
      pushHud(ctx);
      assertSpawned(ctx.scene, { hero: me.root, minWorldMeshes: 6, modeId: o.modeId });
    },

    onInput(_ctx: ModeContext, e: FelInput) {
      // The baseline shuffle moves in update() (MODE-STICK-FACE, 2026-09-07): it stepped 12 cm per stick EVENT here —
      // 60/s on a pad (7 m/s), once per key on a keyboard — in a sliding idle_stand, and toward world +x, which is
      // screen-LEFT from behind the baseline (measured Δscreen −4.7 m on stick-right).
      if (e.t === 'stick' && e.side === 'L') aimX = e.x;
      if (e.t === 'trigger' && e.side === 'R' && e.value > 0.5) humanSwing(_ctx);
      // THE SPLIT STEP (L1). The highest-skill, lowest-visibility mechanic in tennis: hop just before the
      // opponent strikes so you land as they hit and can push either way. Timed against their contact — early
      // is forgiven, late is not — and it buys ONE faster first step, never a sprint button.
      if (e.t === 'button' && e.btn === 'L1' && e.pressed) {
        const timed = splitTimed(sinceOppStrike === Infinity ? Infinity : -sinceOppStrike);
        foot = { ...foot, sinceSplit: timed ? 0 : Infinity };
        splittingNow = 0.22;
        _ctx.setHud({ shotType: timed ? 'SPLIT' : '' });
        if (timed) { SoundKit.play('uiTick', { pitch: 1.8, volume: 0.3 }); setTimeout(() => _ctx.setHud({ shotType: '' }), 360); }
      }
      // In a ONE-touch sport the four face buttons are the four SHOTS: which
      // button you swing with is the shot you play, decided under the same time
      // pressure as the timing. In a multi-touch sport (volleyball) B is the
      // block instead, because there the vocabulary lives in the touch order.
      if (e.t === 'button' && e.pressed && o.cfg.touchesPerSide <= 1) {
        if (e.btn === 'A') { pendingShot = 'drive'; humanSwing(_ctx); }
        if (e.btn === 'B') { pendingShot = 'slice'; humanSwing(_ctx); }
        if (e.btn === 'X') { pendingShot = 'drop'; humanSwing(_ctx); }
        if (e.btn === 'Y') { pendingShot = 'lob'; humanSwing(_ctx); }
      } else if (e.t === 'button' && e.pressed) {
        if (e.btn === 'A') humanSwing(_ctx);
        if (e.btn === 'B') humanBlock(_ctx);
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      weather.update(dt); weatherFx?.update(dt);
      // WII READ: the landing ring — where the shot you are holding (the stick's aim, the button's shot, a perfect swing)
      // would drop on the far court, live while the ball is coming to you
      if (landing) {
        const show = !!shot && awaitingHuman && !!ball;
        landing.show(show);
        if (show && shot) { const l = landingFor(o.cfg, { x: shot.to.x, y: 1, z: shot.to.z }, -1, aimFor(aimX, 0), pendingShot); if (l) landing.set(l.x, l.z); }
      }

      // Baseline shuffle (MODE-STICK-FACE, 2026-09-07): lateral only (depth is fixed so the player is always in a
      // plausible receiving position), screen-relative (the camera's right), in the strafe clip — idle when the stick
      // centres, never over a swing. Runs between points too: a player repositions during the rest.
      if (me) {
        // REAL FOOTWORK. The stick is an INTENT now, not a per-frame displacement: the body accelerates, carries
        // momentum, takes longer to turn round than to start, and can be wrong-footed. Screen-relative as before
        // (the camera's right), because behind a baseline world +x is screen-LEFT.
        const intent = Math.abs(aimX) > 0.12 ? aimX * Math.sign(ctx.camDirector.rightFlat().x || 1) : 0;
        const before = foot.x;
        foot = stepFootwork({ ...foot, sinceOppStrike }, intent, dt, FOOT);
        sinceOppStrike += dt;
        me.root.position.x = foot.x;
        // lean INTO the run, the same rule the boards carry: a body that changes direction without banking
        // reads as a body on rails. Capped at 12° — a person is not a snowboard.
        me.root.rotation.z += (fieldBank(-foot.vx / FOOT.topSpeed, Math.abs(foot.vx) / FOOT.topSpeed) - me.root.rotation.z) * Math.min(1, 9 * dt);
        const step = foot.x - before;
        // THE CAMERA HAS TO FOLLOW NOW. This mode called snapTo() once at load and never update() again —
        // correct while the player was pinned to the middle of the baseline, and the exact mirror of the
        // defect the board pass found (those had update() and no snapTo). With footwork, a lateral sprint
        // left the camera at x 0 and the player at x 7.1, off the left edge of the frame, with FrameGuard
        // auto-recentering mid-rally. Fed the player's own velocity so the follow leads the run.
        // …but it PANS, it does not chase. Feeding the player's raw position walked the camera out to the
        // sideline and straight into the palm trees standing there (screenshotted: the frame was entirely
        // foliage). A tennis camera sits behind the middle of the baseline and turns; so the subject handed
        // to the director is the player's position with its lateral travel damped and clamped, which keeps
        // the camera inside the court's own footprint while the AIM still follows the rally.
        const camX = Math.max(-CAM_PAN_M, Math.min(CAM_PAN_M, foot.x * CAM_PAN_FRAC));
        camSubject.set(camX, me.root.position.y, me.root.position.z);
        camVel.set(foot.vx * CAM_PAN_FRAC, 0, 0);
        // …and the AIM keeps the player in it. The pan is damped (0.35 of the run, ±2.6 m) and the aim follows the ball, so a
        // player sprinting wide while the ball sat on the far side left the frame off its bottom corner — FrameGuard's
        // "hero off-screen (off BOTTOM)" on the rc7 gauntlet (hero x 5.5, subject x 1.9). The further the body strays from
        // the pan, the more of the aim point is pulled from the ball back toward the body (up to 60 %).
        const stray = Math.abs(foot.x - camX);
        if (ball) camAim.copyFrom(ball.position).scaleInPlace(1 - Math.min(0.6, Math.max(0, (stray - 1.5) / 3))).addInPlace(me.root.position.scale(Math.min(0.6, Math.max(0, (stray - 1.5) / 3))));
        ctx.camDirector.update(camSubject, camVel, ball ? camAim : null);
        const bodyRightX = Math.cos(me.root.rotation.y);
        // the tree owns the clips: the shuffle INTENT in the body frame, plus the beat latches — fed every frame, every phase
        meTree.update({ move: step ? (step * bodyRightX > 0 ? 1 : -1) : 0, swing: meSwing, serve: meServe, block: meBlock });
        foeTree.update({ move: 0, swing: foeSwing, serve: false, block: false });
      }

      if (splittingNow > 0) splittingNow = Math.max(0, splittingNow - dt);

      if (restSec > 0) {
        restSec -= dt;
        if (restSec <= 0) serve(ctx);
        return;
      }
      crowd?.update(dt); crowdEnds?.update(dt);
      if (blockCooldown > 0) blockCooldown = Math.max(0, blockCooldown - dt);
      if (serveFrom) {
        // the toss: the ball rises off the hand and the serve strikes it on the clip's contact beat
        serveIn -= dt;
        const u = serveTotal > 0 ? 1 - Math.max(0, serveIn) / serveTotal : 1;
        ball.position.set(serveFrom.x, serveFrom.y + 0.5 * Math.sin(Math.PI * u), serveFrom.z);
        if (serveIn <= 0) { const from = serveFrom; serveFrom = null; launch(ctx, from, -1, serveAim, 'good'); }
        return;
      }
      if (!shot) return;

      flightT += dt / shot.duration;
      const p = shotAt(shot, flightT);
      ball.position.set(p.x, p.y, p.z);

      // Arm the swing window once the ball is on its way in.
      if (!contactArmed && flightT > 0.55) contactArmed = true;

      // A REAL METER. This published `shotMeterT: 1` the moment the window
      // armed and 0 on landing -- a boolean wearing a meter's name. Nothing
      // rendered it (the basketball hosts publish a genuine ramp and draw a
      // bar; the timing host draws nothing), so a mode graded on contact
      // timing offered the player no timing cue at all, and no automated
      // driver could time a swing either: flights differ per touch, so a fixed
      // delay is wrong for all of them (bump 1.56s, set 1.88s, spike 0.88s).
      // Ramp it across the window, contact at 1.
      if (contactArmed && awaitingHuman) {
        ctx.setHud({
          shotMeterT: Math.max(0, Math.min(1, (flightT - 0.55) / 0.45)),
          // Tell the receiver an ATTACK is coming. You cannot decide to block
          // something you were not shown, and the block is a read on the spike
          // rather than a button you can hold down.
          incoming: o.cfg.touchesPerSide > 1 && incomingTouch === 'spike' ? 'SPIKE' : '',
        });
      }

      if (flightT < 1) return;

      // The flight has landed.
      ctx.setHud({ shotMeterT: 0, incoming: '', shotMeterBands: '' });
      if (pendingFault) {
        // Whoever last hit it committed the fault.
        const offender: 0 | 1 = awaitingHuman ? 1 : 0;
        const why = pendingFault === 'net' ? 'INTO THE NET'
          : pendingFault === 'long' ? 'LONG' : 'WIDE';
        awardPoint(ctx, (1 - offender) as 0 | 1, why);
        pendingFault = null;
        return;
      }

      if (awaitingHuman) {
        // It reached us and we never swung.
        awardPoint(ctx, 1, 'NO SWING');
      } else {
        aiReturn(ctx);
      }
    },

    dispose() {
      crowd?.dispose(); crowd = null;
      crowdEnds?.dispose(); crowdEnds = null; beach?.dispose(); beach = null; readableNet?.dispose(); readableNet = null;   // P5
      venue?.dispose(); venue = null;
      posture?.dispose(); posture = null;
      recoverMark?.dispose(); recoverMark = null;
      landing?.dispose(); landing = null; weatherFx?.dispose(); weatherFx = null;
      me?.dispose(); foe?.dispose();
      SoundKit.stopAmbient();
      shot = null; ended = true;
    },
  };
}

// HUD fields used: score, foeScore, callout (game score text — "40-30",
// "DEUCE", or "12 – 9"), banner, shotType, shotMeterT.
