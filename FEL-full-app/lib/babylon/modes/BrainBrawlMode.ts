// BrainBrawlMode — A+ mission #11 (2026-09-06): the DOM trivia deck becomes a Babylon party mode. Owner benchmark: Trivia
// Crack category wheel × Big Brain Academy graded cognitive minigames; readable from a couch (Mario Party).
//
// A spinnable wheel of five categories on the Neuro Arena stage; landing on one launches THAT category's challenge — a timed
// interactive minigame (sequence, memory grid, arithmetic, rotation, odd-one-out…) graded on speed AND accuracy, never
// multiple-choice trivia. Winning claims the category; all five wins the duel. Solo runs the five categories once for a
// composite score with a localStorage personal best. Content is generic and seeded (BrainBrawlCore) — nothing from the
// Blueprint, no spaced repetition, no feed mechanics, no backend. Per-scene state (the Carnival lesson).
//
// BRAINBRAWL-MAJOR (2026-09-24) — what a scripted match through the real host measured on b6d66d5, and what changed:
//   · THE WHEEL LIED. It spun from wherever it last stopped by the rest-angle of the new wedge, so from round two the pin
//     sat on a wedge BORDER (4 of 5 announced categories were not the wedge under the pin). It aims at an absolute angle
//     now (BrainBrawlCore.wheelLanding), and it does not tell you where it will stop: the HUD outlined the category for
//     every one of 830 spin frames. The category is announced when the wheel STOPS — the landing beat.
//   · NOBODY WAS ON SCREEN. The podiums stood at z 5, under and behind the 'court' camera (~z 6.6): 0 contestant pixels in
//     every frame. CAMERA HOLD leaves the camera alone; the PODIUMS moved into its shot — either side of the wheel, facing
//     the audience, with a lectern each whose light carries the state (armed / locked / right / wrong / winner).
//   · NO BODY LANGUAGE. idle_stand through all 645 answer-window frames and all 95 finish frames. The podium plays the
//     party suite now (anim/authored/party.ts): think while the clock runs, the buzzer slap on the lock-in, the fist pump,
//     the facepalm, the shrug on a time-out, the V for the winner and the hung head for the loser.
//   · THE ANSWER WAS NEVER SHOWN. The card vanished at the result, so "was I right, and what was it?" was a hint string. The
//     card stays up through the result with the answer marked and each pick marked (the host), and the points float up
//     from the podium that earned them.
//   · A DUEL LEAKED THE VERDICT: P1's celebrate/flinch played 260 ms after P1's press, while P2 was still answering. The buzz
//     shows who went for it; the verdicts land together at the reveal.
//   · DEAD TIME: every result held 2.8 s and refused every press ("NEXT QUESTION…"). A face press moves on after the verdict
//     has had a beat to read.
//   · HONEST BANNERS: a duel nobody wins does not "UNCLAIM" a category somebody holds (BrainBrawlCore.claimLine).

import { Vector3, MeshBuilder, StandardMaterial, Color3, TransformNode, type Mesh, type PBRMaterial, type Scene } from '@babylonjs/core';
import type { HudValue, ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { refuse } from '../core/Refusal';   // MECHANICS PASS: a press that cannot act is answered
import { Onlookers } from '../visual/Onlookers';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { readPlaceLook } from '../nexus/placeLooks';
import { SoundKit } from '../audio/SoundKit';
import { Contestants, type PodiumSpot } from '../party/Contestants';
import { EffectsKit } from '../visual/EffectsKit';
import { VenueKit } from '../visual/VenueKit';   // the house paint: a StandardMaterial clips to white under this rig (standardMaterialRatchet)
import { PODIUM_TOP_M, PODIUM_AHEAD_M } from '../anim/authored/party';
import {
  CATEGORIES, CATEGORY_COLOR, mulberry32, makeChallenge, challengeScore, freshClaims, spinWheel, resolveClaim, claimedBy,
  matchWinner, boardRows, wheelLanding, verdicts, claimLine, SOLO_BEST_KEY, type Category, type Challenge, type Tier, type Verdict,
} from '../core/BrainBrawlCore';

type Phase = 'pick' | 'spin' | 'expose' | 'answer' | 'result' | 'done';
const PICK_TIMEOUT_S = 6, MAX_ROUNDS = 15;
/** The spin, then the LANDING beat: the wheel stopped, the category named — before the card goes up. */
const SPIN_S = 2.2, LAND_S = 0.7;
/** Everyone is in: the slap lands and reads before the reveal. */
const LOCK_BEAT_S = 0.4;
/** The result holds this long on its own; a face press moves on after RESULT_SKIP_S (the verdict has had its beat). */
const RESULT_S = 3.2, RESULT_SKIP_S = 0.9;
const FACE: Array<'A' | 'B' | 'X' | 'Y'> = ['A', 'B', 'X', 'Y'];
const DPAD: Array<'up' | 'right' | 'down' | 'left'> = ['up', 'right', 'down', 'left'];
/** P1 / P2 — the same cyan and gold the host's scoreboard and option dots use. */
const SEAT_COLOR = ['#22d3ee', '#facc15'];
const LIGHT: Record<'armed' | 'locked' | Verdict | 'winner' | 'dim', string> = {
  dim: '', armed: '', locked: '#ffffff', correct: '#22c55e', wrong: '#ef4444', timeout: '#64748b', winner: '#fbbf24',
};
/** Where the podiums stand: either side of the wheel (it spans x ±1.6 at z −4.5), in the 'court' camera's shot, facing it,
 *  on a riser — so the upper body (where every gesture happens) clears the card across the bottom of the frame. `spread` is
 *  the widest they go; a narrow canvas pulls them in (stageSpread). */
const STAGE = { spread: 3.0, z: -2.0, faceZ: 6.6, riser: 0.8 };

/**
 * How far out the seats can stand and still be IN the frame. The camera holds a vertical FOV, so its width is the canvas
 * aspect's: ±3 m sits at 25 % / 75 % of a 16:10 stage — and 30 % off the edge of a portrait phone, where game-surface.css
 * stands every stage 84svh tall (measured: 0 of 2577 frames with the contestant on screen at 390×844). The seats go to
 * ~68 % of the half-width at their depth, never wider than STAGE.spread: ±3.0 m on a desktop, ±1.3 m on a phone (in front
 * of the wheel's lower rim — the pin and the top wedge stay clear).
 */
function stageSpread(scene: Scene): number {
  const cam = scene.activeCamera as (Scene['activeCamera'] & { fov?: number }) | null;
  if (!cam) return STAGE.spread;
  const aspect = scene.getEngine().getAspectRatio(cam);
  const depth = Vector3.Dot(new Vector3(0, STAGE.riser + 1.3, STAGE.z).subtract(cam.position), cam.getForwardRay(1).direction);
  const halfW = Math.tan((cam.fov ?? 0.8) / 2) * aspect * Math.max(1, depth);
  return Math.max(0.9, Math.min(STAGE.spread, halfW * 0.68));
}

/** The seats. The camera looks down −z, so world +x is SCREEN-LEFT: P1 (cyan, the scoreboard's left) stands at +x. A solo
 *  player takes P1's side of the stage — beside the wheel, not in front of it. */
function stageSpots(scene: Scene): PodiumSpot[] {
  const spread = stageSpread(scene);
  const yawTo = (x: number): number => Math.atan2(0 - x, STAGE.faceZ - STAGE.z);
  return [
    { at: new Vector3(spread, STAGE.riser, STAGE.z), yaw: yawTo(spread) },
    { at: new Vector3(-spread, STAGE.riser, STAGE.z), yaw: yawTo(-spread), tint: '#8b1e2d' },
  ];
}

interface Podium { seatRoot: TransformNode; top: PBRMaterial; front: PBRMaterial; seat: number }

interface St {
  scene: Scene; phase: Phase; pickSec: number; autoBegin: boolean; players: number;
  rnd: () => number; seen: Set<string>; claims: Record<Category, number | null>; played: Set<Category>;
  scores: number[]; round: number; tier: Tier;
  venue: VenueHandle | null;
  /** SCORECARD VISUALS (2026-09-15): an audience arc in front of the stage — the frame review read the room as a void. */
  crowd: Onlookers | null; anchor: TransformNode | null; wheel: TransformNode | null;
  spinT: number; spinFrom: number; spinTo: number; landed: boolean; category: Category | null;
  challenge: Challenge | null; clock: number; exposeT: number; answers: (number | null)[]; answerTimes: number[];
  lockT: number; resultT: number; resultAge: number;
  best: number;
  // BODIES AT THE PODIUMS (2026-09-13). Phase 0 measured this mode at ZERO skeletons: a wheel, a card and
  // nobody. Its benchmark is Mario Party readability — a spectator understands it in three seconds — and
  // with no bodies there is no way to see WHO answered, which in a two-player buzz game is the mechanic.
  /** One per seat, spawned when the seat is in play (P2 only for a duel): a HIDDEN body that is still animating trips
   *  SkinningGuard's stall check (no bone moves in its first 45 frames) and is forced onto CPU skinning. */
  cast: (Contestants | null)[];
  spawning: boolean[];
  spots: PodiumSpot[];
  lecterns: Podium[];
  timers: ReturnType<typeof setTimeout>[];
}
const states = new WeakMap<Scene, St>();
const live = new Set<St>();

export const BrainBrawlMode: ModeDefinition = (() => {
  const st = (ctx: ModeContext): St | undefined => states.get(ctx.scene);
  const names = (S: St): string[] => (S.players > 1 ? ['P1', 'P2'] : ['YOU']);
  /** A timeout that dies with the scene — the end-of-match hand-off must not fire into a disposed harness. */
  const later = (S: St, ms: number, fn: () => void): void => { S.timers.push(setTimeout(() => { if (!S.scene.isDisposed) fn(); }, ms)); };

  function buildWheel(ctx: ModeContext, S: St): void {
    const root = new TransformNode('bb_wheel', ctx.scene);
    root.position.set(0, 2.6, -4.5);
    root.rotation.x = Math.PI / 2 * 0.15;
    const disc = MeshBuilder.CreateCylinder('bb_wheel_disc', { diameter: 3.2, height: 0.12, tessellation: 40 }, ctx.scene);
    // SCORECARD VISUALS (2026-09-15): #1B1330 on a #171034 stage under a 0.45 ambient is a black disc in a black room —
    // the frame review has called this "a dark void with a blue slab" since rc10, and the rc19 mid frame is a wheel you
    // cannot see turning. The face carries its own value now, so the thing the whole mode is named for reads.
    const dm = new StandardMaterial('bb_wheel_mat', ctx.scene); dm.diffuseColor = Color3.FromHexString('#2E2358'); dm.emissiveColor = Color3.FromHexString('#4A3A86'); disc.material = dm;
    disc.parent = root; disc.rotation.x = Math.PI / 2;
    CATEGORIES.forEach((cat, i) => {
      const a = (i + 0.5) / CATEGORIES.length * Math.PI * 2;   // BrainBrawlCore.wedgeAngle — the landing math reads the same layout
      const wedge: Mesh = MeshBuilder.CreateBox(`bb_wedge_${cat}`, { width: 0.7, height: 0.7, depth: 0.1 }, ctx.scene);
      // AND THE FIVE CATEGORIES WERE BEHIND IT. The wedges sat at z −0.1 in the wheel's frame — the far side of a solid
      // 3.2 m disc from the camera — so every spin showed a blank circle and the category you landed on was a HUD word
      // with nothing on the wheel to match it. They belong on the face, proud of it.
      wedge.parent = root; wedge.position.set(Math.sin(a) * 1.05, Math.cos(a) * 1.05, 0.11); wedge.rotation.z = -a;
      const m = new StandardMaterial(`bb_wedge_mat_${cat}`, ctx.scene);
      m.diffuseColor = Color3.FromHexString(CATEGORY_COLOR[cat]); m.emissiveColor = Color3.FromHexString(CATEGORY_COLOR[cat]).scale(0.8); wedge.material = m;
    });
    const pin = MeshBuilder.CreateBox('bb_wheel_pin', { width: 0.16, height: 0.5, depth: 0.16 }, ctx.scene);
    pin.position.set(0, 2.6 + 1.85, -4.5); const pm = new StandardMaterial('bb_pin_mat', ctx.scene); pm.emissiveColor = Color3.White(); pin.material = pm;
    S.wheel = root;
  }

  /** A lectern in front of each contestant: the buzzer's top and a front stripe the audience (the camera) sees. The light
   *  IS the state — armed in the seat's colour, white when locked, green / red / slate at the reveal, gold for the winner. */
  function buildLecterns(ctx: ModeContext, S: St): void {
    S.lecterns = S.spots.map((spot, seat) => {
      // one node per seat at the spot's FOOT, facing the seat's way: the riser and the lectern hang off it, so one switch
      // shows or hides the seat and one move restages it
      const seatRoot = new TransformNode(`bb_seat_${seat}`, ctx.scene);
      seatRoot.position.set(spot.at.x, 0, spot.at.z); seatRoot.rotation.y = spot.yaw;
      const root = new TransformNode(`bb_lectern_${seat}`, ctx.scene); root.parent = seatRoot;
      const depth = 0.36;
      // the riser the seat stands on (its top is the spot's y): under the body and the lectern both
      const riser = MeshBuilder.CreateBox(`bb_riser_${seat}`, { width: 1.2, height: spot.at.y, depth: 1.3 }, ctx.scene);
      riser.parent = seatRoot; riser.position.set(0, spot.at.y / 2, 0.2);
      riser.material = VenueKit.paint(ctx.scene, `bb_riser_mat_${seat}`, '#241c46', 0.1);
      root.position.set(0, spot.at.y, PODIUM_AHEAD_M + depth / 2 - 0.1);
      const body = MeshBuilder.CreateBox(`bb_lectern_body_${seat}`, { width: 0.84, height: PODIUM_TOP_M - 0.03, depth }, ctx.scene);
      body.parent = root; body.position.y = (PODIUM_TOP_M - 0.03) / 2;
      body.material = VenueKit.paint(ctx.scene, `bb_lectern_mat_${seat}`, '#1f1a3a', 0.1);
      const topMesh = MeshBuilder.CreateBox(`bb_lectern_top_${seat}`, { width: 0.9, height: 0.03, depth: depth + 0.04 }, ctx.scene);
      topMesh.parent = root; topMesh.position.y = PODIUM_TOP_M - 0.015;
      const top = VenueKit.paint(ctx.scene, `bb_lectern_topmat_${seat}`, '#000000', 0); topMesh.material = top;   // the light: emissive only (light())
      const stripe = MeshBuilder.CreateBox(`bb_lectern_stripe_${seat}`, { width: 0.72, height: 0.14, depth: 0.02 }, ctx.scene);
      stripe.parent = root; stripe.position.set(0, PODIUM_TOP_M * 0.72, depth / 2 + 0.011);
      const front = VenueKit.paint(ctx.scene, `bb_lectern_frontmat_${seat}`, '#000000', 0); stripe.material = front;
      return { seatRoot, top, front, seat };
    });
    for (const p of S.lecterns) light(S, p.seat, 'dim');
  }

  /** Put the seats where the frame can see them (stageSpread) — at mount, and again whenever the canvas changes shape (a
   *  phone turned on its side). The bodies move with their podiums; y stays where the spawn's ground snap put it. */
  function restage(S: St): void {
    S.spots = stageSpots(S.scene);
    S.spots.forEach((spot, i) => {
      const p = S.lecterns[i];
      if (p) { p.seatRoot.position.set(spot.at.x, 0, spot.at.z); p.seatRoot.rotation.y = spot.yaw; }
      const body = S.cast[i]?.at(0)?.root;
      if (body) { body.position.x = spot.at.x; body.position.z = spot.at.z; body.rotation.y = spot.yaw; }
    });
    // QA: where the seats stand, for the probe's body finder (agent-only reads, like qaAnswer)
    ((S.scene.metadata ??= {}) as { qaSeats?: number[][] }).qaSeats = S.spots.map((sp) => [sp.at.x, sp.at.z]);
  }

  /** Only the seats in play are on the stage: pressing ▶ on the pick screen brings P2's podium up beside the wheel. */
  function seats(S: St): void {
    for (const p of S.lecterns) p.seatRoot.setEnabled(p.seat < S.players);
    for (let i = 0; i < 2; i++) {
      if (i < S.players) spawnSeat(S, i);
      S.cast[i]?.at(0)?.root.setEnabled(i < S.players);
    }
  }

  function spawnSeat(S: St, i: number): void {
    if (S.cast[i] || S.spawning[i] || !S.spots[i]) return;
    S.spawning[i] = true;
    void Contestants.spawn(S.scene, [S.spots[i]], i ? 'brainbrawl-p2' : 'brainbrawl').then((c) => {
      S.spawning[i] = false;
      if (S.scene.isDisposed) { c.dispose(); return; }
      S.cast[i] = c; restage(S); seats(S); pose(S);   // restage: the canvas may have changed shape while it loaded
    });
  }

  /** Seat `i` performs a clip (Contestants.perform on that seat's body). */
  const act = (S: St, i: number, clip: string, opts?: { loop?: boolean; then?: string; fadeSec?: number }): void => S.cast[i]?.perform(0, clip, opts);

  function light(S: St, seat: number, state: keyof typeof LIGHT): void {
    const p = S.lecterns[seat]; if (!p) return;
    const hex = LIGHT[state] || SEAT_COLOR[seat];
    const k = state === 'dim' ? 0.28 : state === 'armed' ? 0.7 : 1;
    const c = Color3.FromHexString(hex).scale(k);
    p.top.emissiveColor = c; p.front.emissiveColor = c;
  }

  function hud(ctx: ModeContext, S: St, extra: Record<string, HudValue> = {}): void {
    const c = S.challenge;
    const onCard = S.phase === 'expose' || S.phase === 'answer' || S.phase === 'result';
    const showOpts = S.phase === 'answer' || S.phase === 'result';
    ctx.setHud({
      players: S.players, round: S.round, tier: S.tier, phase: S.phase,
      // no spoiler: the category is named when the wheel STOPS, not the moment it starts turning
      category: S.category && S.landed ? S.category : '', categoryColor: S.category && S.landed ? CATEGORY_COLOR[S.category] : '',
      claims: CATEGORIES.map((cat) => `${cat}:${S.claims[cat] ?? '-'}`).join(','),
      prompt: c && onCard ? c.prompt : '',
      display: c && (S.phase === 'expose' || (showOpts && c.exposureSec === 0)) ? c.display.join('\n') : '',
      optA: c && showOpts ? c.options[0] : '', optB: c && showOpts ? c.options[1] : '',
      optX: c && showOpts ? c.options[2] : '', optY: c && showOpts ? c.options[3] : '',
      clock: S.phase === 'answer' ? Math.max(0, Math.ceil(S.clock)) : null,
      clockFrac: S.phase === 'answer' && c ? Math.max(0, Math.min(1, S.clock / c.timeLimitSec)) : null,
      score: S.scores[0], p2score: S.scores[1] ?? 0,
      answeredP1: S.answers[0] !== null && S.phase === 'answer', answeredP2: S.answers[1] !== null && S.players > 1 && S.phase === 'answer',
      // what each seat picked: shown on the card for the player's OWN lock-in (solo) and at the reveal (both)
      pickP1: S.answers[0] ?? -1, pickP2: S.players > 1 ? (S.answers[1] ?? -1) : -1,
      best: S.best,
      ...extra,
    });
  }

  function loadBest(): number { try { return Number(localStorage.getItem(SOLO_BEST_KEY) ?? 0) || 0; } catch { return 0; } }
  function saveBest(v: number): void { try { localStorage.setItem(SOLO_BEST_KEY, String(v)); } catch { /* private mode */ } }

  function showPick(ctx: ModeContext, S: St): void {
    const left = Math.max(0, Math.ceil(PICK_TIMEOUT_S - S.pickSec));
    ctx.setHud({ banner: `PLAYERS   ◀  ${S.players}  ▶`, hint: `${S.players > 1 ? 'duel · same challenge, higher score claims · P1 faces, P2 arrows' : `solo · five categories, one composite · best ${S.best} · ◀ ▶ adds a player`} · any face button starts · auto in ${left}s`, players: S.players, prompt: '', display: '', board: null, boardTitle: '', phase: 'pick' });
  }

  function begin(ctx: ModeContext, S: St): void {
    if (S.phase !== 'pick') return;
    S.scores = names(S).map(() => 0);
    seats(S);
    spin(ctx, S);
  }

  /** The podium's standing pose for the phase — so a body that arrives late (async spawn) or a seat that has finished its
   *  one-shot is never left in the wrong state. */
  function pose(S: St): void {
    for (let i = 0; i < S.players; i++) {
      if (S.phase === 'expose' || (S.phase === 'answer' && S.answers[i] === null)) act(S, i, 'party_think', { loop: true, fadeSec: 0.3 });
      else if (S.phase === 'answer') act(S, i, 'party_locked', { loop: true });
      else if (S.phase === 'spin' || S.phase === 'pick') act(S, i, 'idle_stand', { loop: true, fadeSec: 0.3 });
    }
  }

  function spin(ctx: ModeContext, S: St): void {
    S.round++;
    S.tier = (S.round <= 2 ? 1 : S.round <= 4 ? 2 : 3) as Tier;
    // solo: the wheel walks the five categories once (played = claimed for the spin's purposes)
    const pseudo = { ...S.claims } as Record<Category, number | null>;
    if (S.players === 1) for (const c of S.played) pseudo[c] = 0;
    const spinner = S.players > 1 ? (S.round - 1) % 2 : 0;
    const { category, fullTurns } = spinWheel(S.rnd, pseudo, spinner);
    S.category = category; S.landed = false; S.spinT = 0;
    S.spinFrom = S.wheel ? S.wheel.rotation.z : 0;
    S.spinTo = wheelLanding(S.spinFrom, category, fullTurns);   // an ABSOLUTE stop: the named wedge under the pin
    S.phase = 'spin'; S.challenge = null; S.answers = names(S).map(() => null);
    for (let i = 0; i < S.players; i++) light(S, i, 'dim');
    pose(S);
    SoundKit.play('whoosh', { pitch: 0.9 });
    hud(ctx, S, { banner: S.players > 1 ? `${names(S)[spinner]} SPINS` : 'SPIN', hint: '', board: null, boardTitle: '', reveal: -1 });
  }

  /** The wheel has stopped: name the wedge under the pin — the one beat the spin was for. */
  function land(ctx: ModeContext, S: St): void {
    S.landed = true;
    if (S.wheel) S.wheel.rotation.z = S.spinTo;
    const cat = S.category!;
    SoundKit.play('uiTick', { pitch: 1.35, volume: 0.7 });
    ctx.juice.flash(CATEGORY_COLOR[cat], 110, 0.45);
    hud(ctx, S, { banner: cat, hint: S.claims[cat] !== null && S.players > 1 ? `held by ${names(S)[S.claims[cat]!]} — take it` : '' });
  }

  function launch(ctx: ModeContext, S: St): void {
    const cat = S.category!;
    S.challenge = makeChallenge(cat, S.tier, S.rnd, S.seen);
    S.answers = names(S).map(() => null); S.answerTimes = names(S).map(() => 0);
    S.clock = S.challenge.timeLimitSec;
    S.exposeT = S.challenge.exposureSec;
    S.lockT = -1;
    S.phase = S.exposeT > 0 ? 'expose' : 'answer';
    // QA INTENT (2026-09-15): the answer key on the scene's metadata, read only by the mechanics probe's intent driver through the
    // agent-only __FEL_QA__.scene() — a player who KNOWS the answer is the bar a random masher must lose to
    ((ctx.scene.metadata ??= {}) as { qaAnswer?: number }).qaAnswer = S.challenge.answer;
    SoundKit.play('uiTick', { pitch: 1.2 });
    for (let i = 0; i < S.players; i++) light(S, i, S.phase === 'answer' ? 'armed' : 'dim');
    pose(S);
    // the category was named at the landing and rides on the card's chip: the banner clears so the card has the room
    hud(ctx, S, { banner: '', hint: S.exposeT > 0 ? 'memorise…' : answerHint(S), reveal: -1 });
  }

  const answerHint = (S: St): string => (S.players > 1 ? 'P1: A B X Y · P2: ▲ ▶ ▼ ◀' : 'A B X Y answer');

  function answer(ctx: ModeContext, S: St, player: number, choice: number): void {
    if (S.phase !== 'answer' || !S.challenge || player >= S.players || S.answers[player] !== null) return;
    S.answers[player] = choice; S.answerTimes[player] = S.clock;
    // THE BUZZ, not the verdict: the slap on the buzzer shows who went for it; right or wrong waits for the reveal, so a
    // duel partner still answering reads nothing off it (the celebrate used to land 260 ms after P1's press)
    act(S, player, 'party_buzz', { then: 'party_locked', fadeSec: 0.06 });
    light(S, player, 'locked');
    SoundKit.play('thud', { volume: 0.55, pitch: 1.25 });
    hud(ctx, S);
    if (S.answers.every((a) => a !== null)) S.lockT = LOCK_BEAT_S;   // everyone is in: the slap lands, then the reveal
  }

  function resolve(ctx: ModeContext, S: St): void {
    const c = S.challenge!;
    const vs = verdicts(S.answers, c.answer);
    const roundScores = names(S).map((_, i) => challengeScore(vs[i] === 'correct', S.answerTimes[i], c.timeLimitSec, c.tier));
    roundScores.forEach((v, i) => { S.scores[i] += v; });
    const before = S.claims[c.category];   // who held it going in — the banner says HOLDS / TAKES / STAYS WITH from this
    const claimant = resolveClaim(S.claims, c.category, roundScores);
    S.played.add(c.category);
    // the verdicts land together, on the bodies, the lecterns and the card
    vs.forEach((v, i) => {
      act(S, i, v === 'correct' ? 'party_yes' : v === 'wrong' ? 'party_facepalm' : 'party_shrug', { fadeSec: 0.1 });
      light(S, i, v);
      const spot = S.spots[i];
      if (spot) ctx.juice.scorePop(spot.at.add(new Vector3(0, 2.15, 0)), v === 'correct' ? `+${roundScores[i]}` : v === 'wrong' ? 'WRONG' : 'TIME', v === 'correct' ? '#4ade80' : v === 'wrong' ? '#f87171' : '#94a3b8');
    });
    const anyRight = vs.includes('correct');
    if (anyRight) SoundKit.play('score', { volume: 0.6, pitch: 1.1 });
    else if (vs.every((v) => v === 'timeout')) SoundKit.play('clang', { volume: 0.5, pitch: 0.6 });
    else SoundKit.play('miss', { volume: 0.55, pitch: 0.9 });
    if (claimant >= 0 && before !== claimant) {   // a new claim or a steal gets the confetti; a defended hold does not
      EffectsKit.burst(ctx.scene, new Vector3(0, 3, -4.5), 'confetti');
      ctx.juice.flash(CATEGORY_COLOR[c.category], 120);
      SoundKit.play('crowdCheer', { volume: 0.35 });
    } else if (!anyRight) ctx.juice.flash('#ef4444', 90, 0.35);
    S.phase = 'result'; S.resultT = RESULT_S; S.resultAge = 0;
    hud(ctx, S, {
      banner: claimLine(before, c.category, claimant, names(S)),
      hint: `${roundScores.map((v, i) => `${names(S)[i]} ${vs[i] === 'correct' ? `+${v}` : vs[i] === 'wrong' ? 'wrong' : 'out of time'}`).join(' · ')} · A next`,
      reveal: c.answer, verdictP1: vs[0], verdictP2: vs[1] ?? '', gainP1: roundScores[0], gainP2: roundScores[1] ?? 0,
      board: boardRows(S.claims, S.scores, names(S)), boardTitle: S.players > 1 ? 'FIRST TO FIVE' : `${S.played.size} / 5 PLAYED`,
    });
  }

  function afterResult(ctx: ModeContext, S: St): void {
    if (S.phase !== 'result') return;
    const winner = matchWinner(S.claims, S.players);
    const soloDone = S.players === 1 && S.played.size >= CATEGORIES.length;
    if (winner >= 0 || soloDone || S.round >= MAX_ROUNDS) { finish(ctx, S, winner); return; }
    spin(ctx, S);
  }

  function finish(ctx: ModeContext, S: St, winner: number): void {
    if (S.phase === 'done') return;
    S.phase = 'done';
    const p1 = S.scores[0], p2 = S.scores[1] ?? 0;
    let outcome = 'complete';
    const clear = { prompt: '', display: '', optA: '', optB: '', optX: '', optY: '', reveal: -1 };
    if (S.players > 1) {
      const onPoints = winner < 0;
      const w = winner >= 0 ? winner : p1 > p2 ? 0 : p2 > p1 ? 1 : -1;
      outcome = w === 0 ? 'win' : 'complete';
      for (let i = 0; i < 2; i++) {
        if (w < 0) act(S, i, 'party_shrug');
        else if (i === w) act(S, i, 'party_win_in', { then: 'party_win' });   // up the FRONT into the V: a straight fade sweeps a T
        else act(S, i, 'party_lose', { loop: true, fadeSec: 0.25 });
        light(S, i, w === i ? 'winner' : 'dim');
      }
      hud(ctx, S, { ...clear, banner: w >= 0 ? `${names(S)[w]} TAKES THE BRAWL${onPoints ? ' · ON POINTS' : ''}` : 'DRAW', board: boardRows(S.claims, S.scores, names(S)), boardTitle: 'FINAL', hint: '' });
    } else {
      const newBest = p1 > S.best;
      if (newBest) { S.best = p1; saveBest(p1); }
      const claimed = claimedBy(S.claims, 0).length;
      outcome = claimed >= 4 ? 'win' : 'complete';
      // the podium tells the truth about the run: a win or a new best throws the V; one claim or none hangs the head
      if (outcome === 'win' || newBest) { act(S, 0, 'party_win_in', { then: 'party_win' }); light(S, 0, 'winner'); }
      else if (claimed <= 1) act(S, 0, 'party_lose', { loop: true, fadeSec: 0.25 });
      else act(S, 0, 'idle_stand', { loop: true, fadeSec: 0.25 });
      hud(ctx, S, { ...clear, banner: newBest ? `NEW BEST · ${p1}` : `COMPOSITE · ${p1}`, board: boardRows(S.claims, S.scores, names(S)), boardTitle: `${claimed} / 5 CLAIMED · best ${S.best}`, hint: '' });
    }
    SoundKit.play('whistle'); if (outcome === 'win') SoundKit.play('crowdCheer');
    later(S, 1800, () => ctx.end(outcome, p1, { players: S.players, p2score: p2, claims: claimedBy(S.claims, 0).length, p2claims: claimedBy(S.claims, 1).length, rounds: S.round, best: S.best }));
  }

  return {
    modeId: 'brainbrawl', mood: 'nightGame', camPreset: 'court',

    async load(ctx: ModeContext) {
      const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('players') : null;
      const S: St = {
        scene: ctx.scene, phase: 'pick', pickSec: 0, autoBegin: !!q, players: Math.max(1, Math.min(2, Number(q ?? 1) || 1)),
        rnd: mulberry32(Date.now() % 1000003), seen: new Set(), claims: freshClaims(), played: new Set(), scores: [0], round: 0, tier: 1,
        venue: null, crowd: null, anchor: null, wheel: null, cast: [null, null], spawning: [false, false], spinT: 0, spinFrom: 0, spinTo: 0, landed: false, category: null,
        challenge: null, clock: 0, exposeT: 0, answers: [null], answerTimes: [0], lockT: -1, resultT: 0, resultAge: 0, best: loadBest(),
        spots: [], lecterns: [], timers: [],
      };
      states.set(ctx.scene, S); live.add(S);
      S.venue = mountVenue(ctx, 'brain_brawl', { keepGameplayCamera: true, look: readPlaceLook('brainbrawl') }); S.venue?.hidePlaceholders();
      S.crowd = new Onlookers(ctx.scene, Array.from({ length: 12 }, (_, i) => {
        const a = -0.9 + (i / 11) * 1.8;   // an arc across the front of the stage, facing the wheel
        return new Vector3(Math.sin(a) * 7.5, 0, 4.2 + Math.cos(a) * 2.2);
      }), '#7c3aed', new Vector3(0, 1.4, -1.5));
      buildWheel(ctx, S);
      S.anchor = new TransformNode('bb_anchor', ctx.scene); S.anchor.position.set(0, 1.4, -1.5);
      ctx.heroRef.current = S.anchor; ctx.objectiveRef.current = new Vector3(0, 2.6, -4.5);
      ctx.camDirector.setPreset('court');
      ctx.camDirector.snapTo(S.anchor.position, new Vector3(0, 2.6, -4.5));
      // the stage at mount, beside the wheel in the camera's shot (stageSpots — after the snap, which it measures): the
      // contestant is there when the player arrives, and the pick screen's ◀ ▶ puts P2's podium up or takes it down (seats)
      S.spots = stageSpots(ctx.scene);
      buildLecterns(ctx, S);
      restage(S);
      seats(S);
      ctx.scene.getEngine().onResizeObservable.add(() => { if (!S.scene.isDisposed) restage(S); });
      SoundKit.startAmbient('stadium');
      if (!S.autoBegin) showPick(ctx, S);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      const S = st(ctx); if (!S) return;
      const face = e.t === 'button' && e.pressed && FACE.includes(e.btn as 'A');
      if (S.phase === 'pick') {
        if (e.t === 'dpad' && e.pressed && (e.dir === 'left' || e.dir === 'right')) { S.players = e.dir === 'right' ? Math.min(2, S.players + 1) : Math.max(1, S.players - 1); SoundKit.play('uiTick', { volume: 0.3 }); seats(S); showPick(ctx, S); }
        else if (face) begin(ctx, S);
        return;
      }
      if (S.phase === 'result') {
        // the verdict has had its beat: a press (either seat) moves the match on instead of being refused for 2.8 s
        const p2 = e.t === 'dpad' && e.pressed && S.players > 1;
        if (face || p2) { if (S.resultAge >= RESULT_SKIP_S) { SoundKit.play('uiTick', { volume: 0.3, pitch: 0.9 }); afterResult(ctx, S); } }
        return;
      }
      if (S.phase !== 'answer') {
        // MECHANICS PASS: an answer button between questions was silently dropped (64 % of presses) — say what is happening
        if (face && S.phase !== 'done') refuse(ctx, S.phase === 'expose' ? 'MEMORISE…' : S.phase === 'spin' ? (S.landed ? `${S.category}…` : 'SPINNING…') : 'NEXT QUESTION…');
        return;
      }
      if (e.t === 'button' && e.pressed) {
        const i = FACE.indexOf(e.btn as 'A' | 'B' | 'X' | 'Y');
        if (i >= 0 && S.answers[0] !== null) refuse(ctx, 'LOCKED IN');
        else if (i >= 0) answer(ctx, S, 0, i);
      }
      else if (e.t === 'dpad' && e.pressed && S.players > 1) {
        const i = DPAD.indexOf(e.dir);
        if (i >= 0 && S.answers[1] !== null) refuse(ctx, 'P2 LOCKED IN');
        else if (i >= 0) answer(ctx, S, 1, i);
      }
    },

    update(ctx: ModeContext, dt: number) {
      const S = st(ctx); if (!S) return;
      S.crowd?.update(dt);
      if (S.phase === 'done') return;
      if (S.phase === 'pick') {
        const was = Math.ceil(PICK_TIMEOUT_S - S.pickSec);
        S.pickSec += dt;
        if (S.autoBegin || S.pickSec >= PICK_TIMEOUT_S) { begin(ctx, S); return; }
        if (Math.ceil(PICK_TIMEOUT_S - S.pickSec) !== was) showPick(ctx, S);   // the auto-start counts down where it can be read
        return;
      }
      if (S.phase === 'spin') {
        S.spinT += dt;
        const k = Math.min(1, S.spinT / SPIN_S), ease = 1 - Math.pow(1 - k, 3);
        if (S.wheel && !S.landed) S.wheel.rotation.z = S.spinFrom + ease * (S.spinTo - S.spinFrom);
        if (!S.landed && S.spinT >= SPIN_S) land(ctx, S);
        if (S.spinT >= SPIN_S + LAND_S) launch(ctx, S);
        return;
      }
      if (S.phase === 'expose') {
        S.exposeT -= dt;
        if (S.exposeT <= 0) { S.phase = 'answer'; for (let i = 0; i < S.players; i++) light(S, i, 'armed'); hud(ctx, S, { hint: answerHint(S) }); }
        return;
      }
      if (S.phase === 'answer') {
        if (S.lockT >= 0) { S.lockT -= dt; if (S.lockT <= 0) resolve(ctx, S); return; }   // the clock stops when everyone is in
        S.clock -= dt;
        if (S.clock <= 0) { S.clock = 0; resolve(ctx, S); return; }
        if (Math.floor((S.clock + dt) * 4) !== Math.floor(S.clock * 4)) hud(ctx, S);
        return;
      }
      if (S.phase === 'result') { S.resultAge += dt; S.resultT -= dt; if (S.resultT <= 0) afterResult(ctx, S); }
    },

    dispose() {
      setTimeout(() => {
        for (const S of live) if (S.scene.isDisposed) { for (const t of S.timers) clearTimeout(t); for (const c of S.cast) c?.dispose(); S.cast = [null, null]; S.crowd?.dispose(); S.crowd = null; live.delete(S); }
        if (live.size === 0) SoundKit.stopAmbient();
      }, 0);
    },
  };
})();
