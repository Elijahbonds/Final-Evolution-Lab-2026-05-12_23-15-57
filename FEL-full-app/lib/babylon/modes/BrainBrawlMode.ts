// BrainBrawlMode — A+ mission #11 (2026-09-06): the DOM trivia deck becomes a Babylon party mode. Owner benchmark: Trivia
// Crack category wheel × Big Brain Academy graded cognitive minigames; readable from a couch (Mario Party).
//
// A spinnable wheel of five categories on the Neuro Arena stage; landing on one launches THAT category's challenge — a
// timed interactive minigame (sequence, memory grid, arithmetic, rotation, odd-one-out…) graded on speed AND accuracy, never
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
//
// BRAINBRAWL-RESIDUAL (2026-09-24) — the eye graded 252548b at ~4.5 of 7.5; its HARD items and the Features review's:
//   · A REAL SET (party/BrainBrawlStage): an LED wall lit from inside instead of a sunset photo over a black wall, a stage
//     deck, the wheel raised into the top of the frame with its wedges NAMED, bulbs, pegs and a flapper that ticks, textured
//     risers, slim lecterns with a light ring, a buzzer dome and a score screen, and two audience galleries with people in
//     them. The camera is unchanged; the set is built to its measured shot. The podiums stand 1.6 m further forward (the
//     contestant reads ~1.3× bigger) and the lectern no longer hides the body to the chin.
//   · THE PODIUMS AND A HOST TALK: DOC VOLT (an original host) stands centre stage and calls the show on a rendered voice
//     (party/brainBrawlLines.ts, VoiceKit, captioned), gesturing as he talks; the contestants answer in speech bubbles with
//     the gesture that goes with each line (party_talk on a line of their own).
//   · ONE PRESS TO PLAY: with one pad connected, the splash's A starts a solo match at once; otherwise the PLAYERS pick opens
//     on 1P and A confirms — no six-second auto-start either way.
//   · GO AGAIN IN PLACE: the host runs the mode `continuous`, so the finish reports its card without parking the harness,
//     and REPLAY (the shell's button) restarts straight into round one's spin with the same players (replayBrainBrawl).
//
// BRAINBRAWL-POLISH-2 (2026-09-24) — the eye re-graded b3d498e at ~6.5 of 7.5; its polish list:
//   · THE HOST WAS BEHIND THE CARD from the expose to the reveal (he stood centre stage, in the card's column). His mark is
//     stage right of the card now (BrainBrawlStage.HOST_AT), so he is in view for the whole match.
//   · THE WHOLE PODIUM IS IN THE SHOT: Brain Brawl's camera (CAM_ANCHOR / CAM_OBJECTIVE, the mode's own subject and objective
//     for the shared 'court' follow — no preset changed) stands back far enough that the lecterns' feet, the risers and a strip
//     of floor are inside the frame.
//   · FEET ON THE RISER in every clip (party/podiumFeet): the toe joints floated 0.6–6.7 cm over the riser top.
//   · SCORE POPS a player can read: the shared 3D pop was dark-on-dark and drawn behind the gallery bodies; the verdict now
//     pops on the card layer beside each podium, outboard (pop1/pop2), bright and outlined.
//   · LINES THAT MATCH THE GAME: the spinner only wishes for (or dreads) a category the wheel can still land on, and a replay
//     starts clean (no round-two line on round one, no talk carried over from the last match).

import { Vector3, Matrix, TransformNode, type Scene } from '@babylonjs/core';
import type { HudValue, ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { refuse } from '../core/Refusal';   // MECHANICS PASS: a press that cannot act is answered
import { Onlookers } from '../visual/Onlookers';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { readPlaceLook } from '../nexus/placeLooks';
import { SoundKit } from '../audio/SoundKit';
import { VoiceKit } from '../audio/mic/VoiceKit';
import { Contestants, type PodiumSpot } from '../party/Contestants';
import { buildStage, SEATS, HOST_AT, HOST_CENTRE, WHEEL, GALLERY, type StageHandle } from '../party/BrainBrawlStage';
import { BB_HOST, SEAT_LINES, hostLines, pickFrom, spinLines, type HostMoment, type SeatBeat } from '../party/brainBrawlLines';
import { plantFeet, type PodiumFeet } from '../party/podiumFeet';
import { EffectsKit } from '../visual/EffectsKit';
import {
  CATEGORIES, CATEGORY_COLOR, mulberry32, makeChallenge, challengeScore, freshClaims, spinWheel, resolveClaim, claimedBy,
  matchWinner, boardRows, wheelLanding, wheelPool, verdicts, claimLine, SOLO_BEST_KEY, type Category, type Challenge, type Tier, type Verdict,
} from '../core/BrainBrawlCore';

type Phase = 'pick' | 'spin' | 'expose' | 'answer' | 'result' | 'done';
const MAX_ROUNDS = 15;
/** The spin, then the LANDING beat: the wheel stopped, the category named — before the card goes up. */
const SPIN_S = 2.2, LAND_S = 0.7;
/** Everyone is in: the slap lands and reads before the reveal. */
const LOCK_BEAT_S = 0.4;
/** The result holds this long on its own; a face press moves on after RESULT_SKIP_S (the verdict has had its beat). */
const RESULT_S = 3.2, RESULT_SKIP_S = 0.9;
/** A speech bubble's life on screen, and a score pop's. */
const BUBBLE_S = 1.9, POP_S = 1.8;
/** What the podium bodies and the host stand on: the riser's top cap (BrainBrawlStage: riser + 2 mm) and the stage deck. */
const RISER_TOP = SEATS.riser + 0.002, DECK_TOP = 0.012;
/**
 * Brain Brawl's camera (POLISH-2 N7). The eye found the lecterns' feet and the risers cut off by the bottom of the frame: with
 * the wheel's pin just under the top bar, the old shot (0, 4.02, 6.63) had ~45° of view for ~50° of set. These are the MODE's
 * subject and objective for the shared 'court' follow (no preset is changed): the follow settles ~1.5 m further back and
 * ~0.3 m lower, at its 6° pitch floor, so the pin stays under the top bar and the riser's foot and a strip of floor are in.
 */
const CAM_ANCHOR = new Vector3(0, 1.1, 0.1), CAM_OBJECTIVE = new Vector3(0, 2.29, -2.8);
const FACE: Array<'A' | 'B' | 'X' | 'Y'> = ['A', 'B', 'X', 'Y'];
const DPAD: Array<'up' | 'right' | 'down' | 'left'> = ['up', 'right', 'down', 'left'];
/** P1 / P2 — the same cyan and gold the host's scoreboard and option dots use. */
const SEAT_COLOR = ['#22d3ee', '#facc15'];
const LIGHT: Record<'armed' | 'locked' | Verdict | 'winner' | 'dim', string> = {
  dim: '', armed: '', locked: '#ffffff', correct: '#22c55e', wrong: '#ef4444', timeout: '#64748b', winner: '#fbbf24',
};
/** The studio's PA: a short room, a light horn (VoiceKit's 'canopy' preset — the least driven of the five). */
const PA = 'canopy';

/**
 * How far out the seats can stand and still be IN the frame. The camera holds a vertical FOV, so its width is the canvas
 * aspect's: ±3 m sits at ~18 % / 82 % of a 16:10 stage at the seats' depth — and off the edge of a portrait phone, where
 * game-surface.css stands every stage 84svh tall. The seats go to ~68 % of the half-width at their depth, never wider
 * than SEATS.spread: ±3.0 m on a desktop, ~±1.3 m on a phone.
 */
function stageSpread(scene: Scene, z: number): number {
  const cam = scene.activeCamera as (Scene['activeCamera'] & { fov?: number }) | null;
  if (!cam) return SEATS.spread;
  const aspect = scene.getEngine().getAspectRatio(cam);
  const depth = Vector3.Dot(new Vector3(0, SEATS.riser + 1.3, z).subtract(cam.position), cam.getForwardRay(1).direction);
  const halfW = Math.tan((cam.fov ?? 0.8) / 2) * aspect * Math.max(1, depth);
  return Math.max(0.9, Math.min(SEATS.spread, halfW * 0.68));
}

/** The seats. The camera looks down −z, so world +x is SCREEN-LEFT: P1 (cyan, the scoreboard's left) stands at +x. A solo
 *  player takes P1's side of the stage; the host has the middle. */
const FACE_Z = 6.6;
/** A portrait phone's card is the full width of the stage and covers its bottom ~40 %: there the seats stand back either side
 *  of the wheel's column (z −4), which lifts the heads above the card's top edge (measured at 390×844). */
const PORTRAIT_Z = -4.0;
function stageSpots(scene: Scene): PodiumSpot[] {
  const cam = scene.activeCamera;
  const z = cam && scene.getEngine().getAspectRatio(cam) < 1 ? PORTRAIT_Z : SEATS.z;
  const spread = stageSpread(scene, z);
  const yawTo = (x: number): number => Math.atan2(0 - x, FACE_Z - z);
  return [
    { at: new Vector3(spread, SEATS.riser, z), yaw: yawTo(spread) },
    // P2's tint picks a body from MODE_CAST.brainbrawl (a clothed studio cast — the old whole-roster hash landed on a
    // shirtless beach body)
    { at: new Vector3(-spread, SEATS.riser, z), yaw: yawTo(-spread), tint: '#8b1e2d' },
  ];
}

/** The host's mark for this frame's shape: stage right of the card on a landscape stage, turned a little toward the middle of
 *  the audience; centre stage on a portrait phone (its frame ends inside the podiums). */
function hostSpot(scene: Scene): PodiumSpot {
  const cam = scene.activeCamera;
  const at = cam && scene.getEngine().getAspectRatio(cam) < 1 ? HOST_CENTRE : HOST_AT;
  return { at: at.clone(), yaw: Math.atan2(0 - at.x, FACE_Z - at.z), tint: '#243b6b' };
}

interface St {
  scene: Scene; ctx: ModeContext; phase: Phase; autoBegin: boolean; players: number; pickShown: boolean; firstTick: boolean;
  rnd: () => number; seen: Set<string>; claims: Record<Category, number | null>; played: Set<Category>;
  scores: number[]; round: number; tier: Tier; matches: number;
  venue: VenueHandle | null; stage: StageHandle | null;
  /** The audience, one crowd per gallery. */
  crowd: Onlookers[]; anchor: TransformNode | null; wheel: TransformNode | null;
  spinT: number; spinFrom: number; spinTo: number; landed: boolean; category: Category | null; lastRoll: number; tickAt: number;
  challenge: Challenge | null; clock: number; exposeT: number; answers: (number | null)[]; answerTimes: number[];
  lockT: number; resultT: number; resultAge: number; hurried: boolean; thought: boolean[];
  best: number;
  /** One per seat, spawned when the seat is in play (P2 only for a duel): a HIDDEN body that is still animating trips
   *  SkinningGuard's stall check (no bone moves in its first 45 frames) and is forced onto CPU skinning. */
  cast: (Contestants | null)[];
  spawning: boolean[];
  host: Contestants | null;
  spots: PodiumSpot[];
  /** Where the host stands now (hostSpot). */
  hostAt: PodiumSpot;
  /** Feet on the riser / the deck, one per body (party/podiumFeet): seats 0 and 1, then the host. */
  feet: (PodiumFeet | null)[];
  timers: ReturnType<typeof setTimeout>[];
  /** Speech: each seat's bubble and its clock, the host's last line, what each said last (no back-to-back repeats). */
  say: { text: string; t: number; n: number }[]; hostN: number; lastSaid: Map<string, string>;
  /** Each seat's score pop and its clock (R1: the verdict on the card layer, beside the podium). */
  pops: { t: number; n: number }[];
  anchorsAt: number; anchorKey: string;
}
const states = new WeakMap<Scene, St>();
const live = new Set<St>();

/**
 * GO AGAIN, in place (the Features review's HARD, 2026-09-24): REPLAY on the shell's end card used to bump the shell's game key
 * — the whole engine disposed and rebooted to TAP TO START, then the PLAYERS pick, then a six-second wait. The host now runs
 * this mode `continuous` (the finish reports its card and the harness keeps playing), so REPLAY lands here: every finished
 * Brain Brawl on the page starts again at round one's spin with the same players. False when there was none to restart.
 */
export function replayBrainBrawl(): boolean {
  let n = 0;
  for (const S of live) if (!S.scene.isDisposed && S.phase === 'done') { restartMatch(S); n++; }
  return n > 0;
}
let restartMatch: (S: St) => void = () => {};

export const BrainBrawlMode: ModeDefinition = (() => {
  const st = (ctx: ModeContext): St | undefined => states.get(ctx.scene);
  const names = (S: St): string[] => (S.players > 1 ? ['P1', 'P2'] : ['YOU']);
  /** A timeout that dies with the scene — the end-of-match hand-off must not fire into a disposed harness. */
  const later = (S: St, ms: number, fn: () => void): void => { S.timers.push(setTimeout(() => { if (!S.scene.isDisposed) fn(); }, ms)); };

  // ── speech ──────────────────────────────────────────────────────────────────────────────────────────────────────
  /** The host says a line of `moment`: voiced on the PA when the bank is in and the voice is on, captioned either way, and
   *  he talks with his body (present on the openers, talk on the rest). */
  function host(S: St, moment: HostMoment, gesture: 'talk' | 'present' = 'talk'): void {
    const pool = hostLines(moment); if (!pool.length) return;
    const line = pickFrom(pool, S.rnd, pool.find((l) => l.id === S.lastSaid.get(moment)));
    S.lastSaid.set(moment, line.id);
    S.hostN++;
    S.ctx.setHud({ hostSay: line.text, hostName: BB_HOST.name, hostN: S.hostN });
    const clip = `${BB_HOST.cast}/${line.id}`;
    const sec = VoiceKit.line(clip)?.sec ?? 1.4;
    void VoiceKit.play({ cast: BB_HOST.cast, role: 'mc', channel: 'booth', clips: [clip], caption: line.text, speaker: BB_HOST.name, sec, priority: 2, interrupt: true, pan: 0, gain: 1 }, PA)
      .then((played) => logMic(line.text, clip, played));
    S.host?.perform(0, gesture === 'present' ? 'party_present' : 'party_talk', { fadeSec: 0.2, then: 'idle_stand' });
  }

  /** A contestant says something: a bubble over their podium, and — when the line is theirs alone — the talk gesture. `pool`
   *  replaces the beat's own lines when they depend on the game (the spin's: spinLines). */
  function speak(S: St, seat: number, beat: SeatBeat, gesture = false, pool: readonly string[] = SEAT_LINES[beat]): void {
    if (seat >= S.players) return;
    const key = `${seat}:${beat}`;
    const text = pickFrom(pool, S.rnd, S.lastSaid.get(key));
    S.lastSaid.set(key, text);
    const b = S.say[seat]; b.text = text; b.t = BUBBLE_S; b.n++;
    S.ctx.setHud({ [`say${seat + 1}`]: text, [`sayN${seat + 1}`]: b.n });
    if (gesture) act(S, seat, 'party_talk', { fadeSec: 0.15, then: 'idle_stand' });
  }

  /**
   * A seat's score pops (R1). The shared JuiceKit pop was a dark green "+94" / dark red "WRONG" drawn in the 3D scene 2.35 m over
   * the podium — low contrast, and partly behind the gallery bodies. The pop is the card layer's now: bright, outlined, always
   * in front, beside the podium on its outboard side (anchorPop: the card's side put P2's pop over the host's head), and gone
   * after POP_S.
   */
  function pop(S: St, seat: number, text: string, tone: Verdict): void {
    const p = S.pops[seat]; p.t = POP_S; p.n++;
    S.ctx.setHud({ [`pop${seat + 1}`]: text, [`popTone${seat + 1}`]: tone, [`popN${seat + 1}`]: p.n });
  }

  /** Where the bubbles hang: above each seat's head and beside the host's, projected through the live camera (% of the
   *  canvas) — and where each seat's score pops (at the shoulder, a metre outboard: clear of the card and the host; a metre
   *  inboard when outboard would put the pop's plate off the frame's edge, as on a portrait phone). */
  function anchors(S: St): void {
    const cam = S.scene.activeCamera; if (!cam) return;
    const eng = S.scene.getEngine(), w = eng.getRenderWidth(), h = eng.getRenderHeight();
    if (!w || !h) return;
    const vp = cam.viewport.toGlobal(w, h);
    const at = (p: Vector3): string => { const q = Vector3.Project(p, Matrix.Identity(), S.scene.getTransformMatrix(), vp); return `${(q.x / w * 100).toFixed(1)},${(q.y / h * 100).toFixed(1)}`; };
    const out: Record<string, HudValue> = {};
    const edge = 72 / Math.max(1, eng.getRenderingCanvas()?.clientWidth || w) * 100;   // half the widest pop plate, in % of the frame
    S.spots.forEach((sp, i) => {
      out[`anchor${i + 1}`] = at(sp.at.add(new Vector3(0, 2.02, 0)));
      const outboard = at(sp.at.add(new Vector3(Math.sign(sp.at.x) * 0.95, 1.45, 0))), x = parseFloat(outboard);
      out[`anchorPop${i + 1}`] = x >= edge && x <= 100 - edge ? outboard : at(sp.at.add(new Vector3(-Math.sign(sp.at.x) * 0.95, 1.45, 0)));
    });
    // the host's bubble hangs BESIDE his head on the stage's side (the P2 podium's bubble is above P2, just outboard of him);
    // over his head on a portrait phone, where he has the centre
    const side = S.hostAt.at.x !== 0;
    out.anchorHost = at(S.hostAt.at.add(new Vector3(side ? 0.28 : 0, side ? 1.72 : 2.05, 0)));
    out.hostBubble = side ? 'left' : 'above';
    const key = JSON.stringify(out);
    if (key !== S.anchorKey) { S.anchorKey = key; S.ctx.setHud(out); }
  }

  // ── the stage ───────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * The audience does not cast shadows. Measured on the new set: 276 draws a frame before it, 672 with it — twelve gallery
   * bodies and the host, each drawn again into every shadow cascade. The galleries stand 5–8 m back on dark risers where a
   * shadow reads as nothing; the podiums and the host keep theirs. Run while the bodies are still arriving (async spawns).
   */
  function trimCrowdShadows(S: St): void {
    const inGallery = (x: number, z: number) => Math.abs(x) > GALLERY.x0 - 0.3 && z < GALLERY.rows[0].z + 0.6;
    for (const l of S.scene.lights) {
      const map = (l.getShadowGenerator?.() as { getShadowMap?: () => { renderList: { getAbsolutePosition(): Vector3 }[] | null } | null } | null)?.getShadowMap?.();
      if (!map?.renderList) continue;
      map.renderList = map.renderList.filter((m) => { const p = m.getAbsolutePosition(); return !inGallery(p.x, p.z); });
    }
  }

  /** Put the seats where the frame can see them (stageSpread) — at mount, and again whenever the canvas changes shape (a
   *  phone turned on its side). The bodies move with their podiums; y stays where the spawn's ground snap put it. */
  function restage(S: St): void {
    S.spots = stageSpots(S.scene);
    S.spots.forEach((spot, i) => {
      const p = S.stage?.lecterns[i];
      if (p) { p.seatRoot.position.set(spot.at.x, 0, spot.at.z); p.seatRoot.rotation.y = spot.yaw; }
      const body = S.cast[i]?.at(0)?.root;
      if (body) { body.position.x = spot.at.x; body.position.z = spot.at.z; body.rotation.y = spot.yaw; }
    });
    S.hostAt = hostSpot(S.scene);
    const host = S.host?.at(0)?.root;
    if (host) { host.position.x = S.hostAt.at.x; host.position.z = S.hostAt.at.z; host.rotation.y = S.hostAt.yaw; }
    ((S.scene.metadata ??= {}) as { qaHost?: number[] }).qaHost = [S.hostAt.at.x, S.hostAt.at.z];   // QA: the host's mark
    // QA: where the seats stand, for the probe's body finder (agent-only reads, like qaAnswer)
    ((S.scene.metadata ??= {}) as { qaSeats?: number[][] }).qaSeats = S.spots.map((sp) => [sp.at.x, sp.at.z]);
    S.anchorKey = ''; S.anchorsAt = 0;
  }

  /**
   * The audience: rigged onlookers on the gallery rows either side of the wheel, facing the stage — seated only when the frame
   * is wide enough to show the galleries (a portrait phone's frame ends inside the podiums; a body nobody draws is never
   * skinned, so SkinningGuard reads it as stalled and forces it onto the CPU — measured: 12 of 12 on a 390×844 stage). A phone
   * turned sideways seats them then.
   */
  function seatAudience(S: St): void {
    if (S.crowd.length || !S.stage) return;
    const cam = S.scene.activeCamera; if (!cam) return;
    if (S.scene.getEngine().getAspectRatio(cam) < 1.2) return;
    S.crowd = S.stage.crowd.map((spots, i) => new Onlookers(S.scene, spots, i ? '#f472b6' : '#7c3aed', new Vector3(0, 1.6, -1.5)));
    for (const ms of [1500, 3500, 7000, 12000]) later(S, ms, () => trimCrowdShadows(S));   // the onlookers land over a few seconds
  }

  /** Only the seats in play are on the stage: pressing ▶ on the pick screen brings P2's podium up beside the wheel. */
  function seats(S: St): void {
    S.stage?.lecterns.forEach((p, i) => p.seatRoot.setEnabled(i < S.players));
    for (let i = 0; i < 2; i++) {
      if (i < S.players) spawnSeat(S, i);
      S.cast[i]?.at(0)?.root.setEnabled(i < S.players);
    }
    screens(S);
  }

  function spawnSeat(S: St, i: number): void {
    if (S.cast[i] || S.spawning[i] || !S.spots[i]) return;
    S.spawning[i] = true;
    void Contestants.spawn(S.scene, [S.spots[i]], i ? 'brainbrawl-p2' : 'brainbrawl', { accessories: false }).then((c) => {
      S.spawning[i] = false;
      if (S.scene.isDisposed) { c.dispose(); return; }
      S.cast[i] = c; restage(S); seats(S); pose(S);   // restage: the canvas may have changed shape while it loaded
      const body = c.at(0); if (body) S.feet[i] = plantFeet(S.scene, body, RISER_TOP);   // N8: both feet on the riser, every clip
    });
  }

  /** Seat `i` performs a clip (Contestants.perform on that seat's body). */
  const act = (S: St, i: number, clip: string, opts?: { loop?: boolean; then?: string; fadeSec?: number }): void => S.cast[i]?.perform(0, clip, opts);

  function light(S: St, seat: number, state: keyof typeof LIGHT): void {
    const p = S.stage?.lecterns[seat]; if (!p) return;
    const hex = LIGHT[state] || SEAT_COLOR[seat];
    p.light(hex, state === 'dim' ? 0.28 : state === 'armed' ? 0.8 : 1.3);
  }

  /** The lectern screens: the seat's tag and score. */
  function screens(S: St): void {
    S.stage?.lecterns.forEach((l, i) => l.screen(S.players > 1 ? `P${i + 1}` : 'YOU', S.scores[i] ?? 0));
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

  /** The PLAYERS pick: 1P focused, A confirms, ◀ ▶ moves the focus. No countdown — it waits for the player. */
  function showPick(ctx: ModeContext, S: St): void {
    S.pickShown = true;
    const opt = (n: number, label: string) => (S.players === n ? `▸ ${label} ◂` : `  ${label}  `);
    ctx.setHud({
      banner: `${opt(1, '1P SOLO')}   ${opt(2, '2P DUEL')}`,
      hint: `A starts ${S.players > 1 ? 'the duel · P1 faces, P2 arrows' : `solo · five categories · best ${S.best}`} · ◀ ▶ choose`,
      players: S.players, prompt: '', display: '', board: null, boardTitle: '', phase: 'pick',
    });
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
    // N5: what the wheel can land on, read BEFORE the spin — the spinner's wish names only one of these
    const wish = spinLines(wheelPool(pseudo, spinner), S.rnd);
    const { category, fullTurns } = spinWheel(S.rnd, pseudo, spinner);
    S.category = category; S.landed = false; S.spinT = 0;
    S.spinFrom = S.wheel ? S.wheel.rotation.z : 0;
    S.spinTo = wheelLanding(S.spinFrom, category, fullTurns);   // an ABSOLUTE stop: the named wedge under the pin
    S.phase = 'spin'; S.challenge = null; S.answers = names(S).map(() => null);
    for (let i = 0; i < S.players; i++) light(S, i, 'dim');
    pose(S);
    SoundKit.play('whoosh', { pitch: 0.9 });
    S.pops.forEach((p) => { p.t = 0; });   // the last verdict's pops do not ride into the spin
    hud(ctx, S, { banner: S.players > 1 ? `${names(S)[spinner]} SPINS` : 'SPIN', hint: '', board: null, boardTitle: '', reveal: -1, verdictP1: '', verdictP2: '', pop1: '', pop2: '' });
    // the host opens the match, then calls every spin; the spinner wishes it on
    if (S.round === 1) host(S, S.matches > 1 ? 'again' : S.players > 1 ? 'intro.duel' : 'intro.solo', 'present');
    else host(S, S.players === 1 && S.played.size === CATEGORIES.length - 1 ? 'spin.last' : 'spin', 'present');
    later(S, 350, () => { if (S.phase === 'spin') speak(S, spinner, 'spin', true, wish); });
  }

  /** The wheel has stopped: name the wedge under the pin — the one beat the spin was for. */
  function land(ctx: ModeContext, S: St): void {
    S.landed = true;
    if (S.wheel) S.wheel.rotation.z = S.spinTo;
    const cat = S.category!;
    SoundKit.play('uiTick', { pitch: 1.35, volume: 0.7 });
    ctx.juice.flash(CATEGORY_COLOR[cat], 110, 0.45);
    S.stage?.flash(CATEGORY_COLOR[cat], 1);
    hud(ctx, S, { banner: cat, hint: S.claims[cat] !== null && S.players > 1 ? `held by ${names(S)[S.claims[cat]!]} — take it` : '' });
    host(S, `land.${cat}` as HostMoment);
  }

  function launch(ctx: ModeContext, S: St): void {
    const cat = S.category!;
    S.challenge = makeChallenge(cat, S.tier, S.rnd, S.seen);
    S.answers = names(S).map(() => null); S.answerTimes = names(S).map(() => 0);
    S.clock = S.challenge.timeLimitSec;
    S.exposeT = S.challenge.exposureSec;
    S.lockT = -1; S.hurried = false; S.thought = [false, false];
    S.phase = S.exposeT > 0 ? 'expose' : 'answer';
    // QA INTENT (2026-09-15): the answer key on the scene's metadata, read only by the mechanics probe's intent driver through the
    // agent-only __FEL_QA__.scene() — a player who KNOWS the answer is the bar a random masher must lose to. RESIDUAL: the whole
    // card as the player sees it too, so the probe can re-read it independently (BrainBrawlCore.solveCard) on every question.
    const meta = (ctx.scene.metadata ??= {}) as { qaAnswer?: number; qaCard?: { prompt: string; display: string[]; options: string[]; answer: number } };
    meta.qaAnswer = S.challenge.answer;
    meta.qaCard = { prompt: S.challenge.prompt, display: [...S.challenge.display], options: [...S.challenge.options], answer: S.challenge.answer };
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
    later(S, 230, () => S.stage?.lecterns[player]?.buzz());   // the dome punches when the hand lands on it
    light(S, player, 'locked');
    SoundKit.play('thud', { volume: 0.55, pitch: 1.25 });
    speak(S, player, 'lock');
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
    const fast = (i: number) => vs[i] === 'correct' && S.answerTimes[i] / c.timeLimitSec >= 0.7;
    // the verdicts land together, on the bodies, the lecterns, the bubbles and the card
    vs.forEach((v, i) => {
      act(S, i, v === 'correct' ? 'party_yes' : v === 'wrong' ? 'party_facepalm' : 'party_shrug', { fadeSec: 0.1 });
      light(S, i, v);
      pop(S, i, v === 'correct' ? `+${roundScores[i]}` : v === 'wrong' ? 'WRONG' : 'TIME', v);
      const stole = i === claimant && before !== null && before !== claimant;
      speak(S, i, v === 'correct' ? (stole ? 'steal' : fast(i) ? 'rightFast' : 'right') : v === 'wrong' ? 'wrong' : 'timeout');
    });
    screens(S);
    const anyRight = vs.includes('correct');
    if (anyRight) SoundKit.play('score', { volume: 0.6, pitch: 1.1 });
    else if (vs.every((v) => v === 'timeout')) SoundKit.play('clang', { volume: 0.5, pitch: 0.6 });
    else SoundKit.play('miss', { volume: 0.55, pitch: 0.9 });
    if (claimant >= 0 && before !== claimant) {   // a new claim or a steal gets the confetti; a defended hold does not
      EffectsKit.burst(ctx.scene, new Vector3(WHEEL.x, WHEEL.y, WHEEL.z + 0.3), 'confetti');
      ctx.juice.flash(CATEGORY_COLOR[c.category], 120);
      S.stage?.flash(CATEGORY_COLOR[c.category], 1);
      SoundKit.play('crowdCheer', { volume: 0.35 });
      for (const cr of S.crowd) cr.cheer(0.8);
    } else if (!anyRight) ctx.juice.flash('#ef4444', 90, 0.35);
    // the host's call: the verdict in a solo match; in a duel, what happened to the category
    if (S.players === 1) host(S, vs[0] === 'correct' ? (fast(0) ? 'right.fast' : 'right') : vs[0] === 'wrong' ? 'wrong' : 'timeout');
    else if (claimant >= 0 && before !== null && before !== claimant) host(S, 'steal');
    else if (claimant >= 0 && before === claimant) host(S, 'hold');
    else if (vs.every((v) => v === 'correct')) host(S, 'right.both');
    else if (vs.every((v) => v === 'timeout')) host(S, 'timeout');
    else if (!anyRight) host(S, before !== null ? 'stays' : 'wrong.both');
    else host(S, 'claim');
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
        if (w >= 0) speak(S, i, i === w ? 'win' : 'lose');
      }
      host(S, w === 0 ? 'duel.p1' : w === 1 ? 'duel.p2' : 'draw', 'present');
      hud(ctx, S, { ...clear, banner: w >= 0 ? `${names(S)[w]} TAKES THE BRAWL${onPoints ? ' · ON POINTS' : ''}` : 'DRAW', board: boardRows(S.claims, S.scores, names(S)), boardTitle: 'FINAL', hint: '' });
    } else {
      const newBest = p1 > S.best;
      if (newBest) { S.best = p1; saveBest(p1); }
      const claimed = claimedBy(S.claims, 0).length;
      outcome = claimed >= 4 ? 'win' : 'complete';
      // the podium tells the truth about the run: a win or a new best throws the V; one claim or none hangs the head
      if (outcome === 'win' || newBest) { act(S, 0, 'party_win_in', { then: 'party_win' }); light(S, 0, 'winner'); speak(S, 0, 'win'); }
      else if (claimed <= 1) { act(S, 0, 'party_lose', { loop: true, fadeSec: 0.25 }); speak(S, 0, 'lose'); }
      else act(S, 0, 'idle_stand', { loop: true, fadeSec: 0.25 });
      host(S, newBest ? 'best' : 'solo.done', 'present');
      hud(ctx, S, { ...clear, banner: newBest ? `NEW BEST · ${p1}` : `COMPOSITE · ${p1}`, board: boardRows(S.claims, S.scores, names(S)), boardTitle: `${claimed} / 5 CLAIMED · best ${S.best}`, hint: '' });
    }
    SoundKit.play('whistle'); if (outcome === 'win') { SoundKit.play('crowdCheer'); for (const cr of S.crowd) cr.cheer(1); }
    const stats = { players: S.players, p2score: p2, claims: claimedBy(S.claims, 0).length, p2claims: claimedBy(S.claims, 1).length, rounds: S.round, best: S.best };
    // a CONTINUOUS host (the game shell, GO AGAIN in place) gets the card and keeps the stage; anything else ends the session
    later(S, 1800, () => (ctx.continuous ? ctx.card(outcome, p1, stats) : ctx.end(outcome, p1, stats)));
  }

  /** GO AGAIN: a fresh match on the same stage, same players, straight into round one's spin (replayBrainBrawl). */
  restartMatch = (S: St): void => {
    for (const t of S.timers) clearTimeout(t);
    S.timers = [];
    S.claims = freshClaims(); S.played = new Set(); S.round = 0; S.tier = 1; S.challenge = null; S.category = null;
    S.matches++;
    // N9: the last match's talk goes with it — the bubbles, the pops and the host's caption — so round one of the rematch
    // opens clean (its opener is an 'again' line, none of which names a round). The no-repeat memory (lastSaid) STAYS: 'again'
    // is only ever said as a rematch's opener, so its entry is all that keeps two openers in a row apart, and each seat's
    // first spin line likewise differs from its last one
    S.say.forEach((b) => { b.t = 0; b.text = ''; });
    S.pops.forEach((p) => { p.t = 0; });
    S.phase = 'pick';   // begin() starts from the pick; the pick itself is never shown
    S.ctx.setHud({ board: null, boardTitle: '', banner: '', hint: '', say1: '', say2: '', pop1: '', pop2: '', hostSay: '', round: 0 });
    begin(S.ctx, S);
  };

  function logMic(caption: string, clip: string, played: boolean): void {
    console.info(`[MIC] ${BB_HOST.cast}${played ? '' : ' (caption only)'}: ${caption}`);
    if (typeof window === 'undefined') return;
    const w = window as unknown as { __FEL_MIC__?: { t: number; cast: string; clips: string[]; caption: string; played: boolean }[] };
    (w.__FEL_MIC__ ??= []).push({ t: Math.round(performance.now()), cast: BB_HOST.cast, clips: [clip], caption, played });
    if (w.__FEL_MIC__.length > 80) w.__FEL_MIC__.shift();
  }

  return {
    modeId: 'brainbrawl', mood: 'nightGame', camPreset: 'court',

    async load(ctx: ModeContext) {
      const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('players') : null;
      const S: St = {
        scene: ctx.scene, ctx, phase: 'pick', autoBegin: !!q, players: Math.max(1, Math.min(2, Number(q ?? 1) || 1)), pickShown: false, firstTick: true,
        rnd: mulberry32(Date.now() % 1000003), seen: new Set(), claims: freshClaims(), played: new Set(), scores: [0], round: 0, tier: 1, matches: 1,
        venue: null, stage: null, crowd: [], anchor: null, wheel: null, cast: [null, null], spawning: [false, false], host: null,
        spinT: 0, spinFrom: 0, spinTo: 0, landed: false, category: null, lastRoll: 0, tickAt: 0,
        challenge: null, clock: 0, exposeT: 0, answers: [null], answerTimes: [0], lockT: -1, resultT: 0, resultAge: 0, hurried: false, thought: [false, false],
        best: loadBest(), spots: [], hostAt: { at: HOST_AT.clone(), yaw: 0 }, feet: [null, null, null], timers: [],
        say: [{ text: '', t: 0, n: 0 }, { text: '', t: 0, n: 0 }], hostN: 0, lastSaid: new Map(), pops: [{ t: 0, n: 0 }, { t: 0, n: 0 }], anchorsAt: 0, anchorKey: '',
      };
      states.set(ctx.scene, S); live.add(S);
      S.venue = mountVenue(ctx, 'brain_brawl', { keepGameplayCamera: true, look: readPlaceLook('brainbrawl') }); S.venue?.hidePlaceholders();
      // the venue spec's two stand-in podiums (x ±3, z 2) sat below the old shot; the camera that holds the whole podium (N7)
      // saw them as big pink and violet discs in the bottom corners. The set has its own risers and lecterns.
      for (const n of S.venue?.built.root.getChildTransformNodes(true) ?? []) if (n.name.startsWith('prop_podium_')) n.setEnabled(false);
      // the set, built to the camera's shot (BrainBrawlStage): the LED wall, the deck, the wheel, the podiums, the galleries
      S.stage = buildStage(ctx.scene, SEAT_COLOR);
      S.wheel = S.stage.wheel;
      S.anchor = new TransformNode('bb_anchor', ctx.scene); S.anchor.position.copyFrom(CAM_ANCHOR);
      // the 'court' preset and its snap, on Brain Brawl's own subject and objective (POLISH-2 N7: the whole podium in the shot)
      ctx.heroRef.current = S.anchor; ctx.objectiveRef.current = CAM_OBJECTIVE.clone();
      ctx.camDirector.setPreset('court');
      ctx.camDirector.snapTo(S.anchor.position, CAM_OBJECTIVE.clone());
      // the stage at mount, beside the wheel in the camera's shot (stageSpots — after the snap, which it measures): the
      // contestant is there when the player arrives, and the pick screen's ◀ ▶ puts P2's podium up or takes it down (seats)
      S.spots = stageSpots(ctx.scene);
      restage(S);
      seats(S);
      // the host, on his mark stage right of the card (hostSpot; a studio body from MODE_CAST.brainbrawl, dressed, no sports
      // accessories), standing on the deck
      S.hostAt = hostSpot(ctx.scene);
      void Contestants.spawn(ctx.scene, [S.hostAt], 'brainbrawl-host', { accessories: false }).then((c) => {
        if (ctx.scene.isDisposed) { c.dispose(); return; }
        S.host = c; restage(S);
        const body = c.at(0); if (body) S.feet[2] = plantFeet(ctx.scene, body, DECK_TOP);
      });
      // the host's voice: one bank, fetched now and never awaited (a missing bank is a caption without audio)
      void VoiceKit.load([{ cast: BB_HOST.cast, group: BB_HOST.group }]);
      seatAudience(S);
      ctx.scene.getEngine().onResizeObservable.add(() => { if (!S.scene.isDisposed) { restage(S); seatAudience(S); } });
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
      for (const cr of S.crowd) cr.update(dt);
      // the set: the flapper and bulbs follow the wheel's speed; a peg under the flapper ticks (at most every 45 ms)
      const roll = S.wheel ? S.wheel.rotation.z : 0;
      const speed = dt > 0 ? Math.abs(roll - S.lastRoll) / dt : 0; S.lastRoll = roll;
      const now = performance.now();
      if (S.stage?.tick(dt, speed) && speed > 0.3 && now - S.tickAt > 45) { S.tickAt = now; SoundKit.play('uiTick', { volume: 0.22, pitch: 1.7 + Math.min(0.6, speed * 0.02) }); }
      // the bubbles fade on their own clock; the anchors follow the camera (and a resized canvas)
      S.say.forEach((b, i) => { if (b.t > 0) { b.t -= dt; if (b.t <= 0) ctx.setHud({ [`say${i + 1}`]: '' }); } });
      S.pops.forEach((p, i) => { if (p.t > 0) { p.t -= dt; if (p.t <= 0) ctx.setHud({ [`pop${i + 1}`]: '' }); } });
      S.anchorsAt -= dt; if (S.anchorsAt <= 0) { S.anchorsAt = 0.5; anchors(S); }
      if (S.phase === 'done') return;
      if (S.phase === 'pick') {
        if (S.autoBegin) { begin(ctx, S); return; }
        // ONE PRESS TO PLAY (the eye: "start takes two confirmations" — TAP TO START, then the pick, then 6 s on its timer).
        // The first playing frame is the frame after the splash's press. One pad: that press was the player saying go —
        // a solo match starts now. Otherwise (none, or two to share) the pick is up on 1P and waits for A: no timer.
        if (S.firstTick) {
          S.firstTick = false;
          if (ctx.input.pads().length === 1 && S.players === 1) { begin(ctx, S); return; }
          showPick(ctx, S);
        }
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
        const c = S.challenge!;
        // the room keeps talking while the clock runs: a thinker mutters once, the host calls the last three seconds
        for (let i = 0; i < S.players; i++) if (!S.thought[i] && S.answers[i] === null && S.clock < c.timeLimitSec * 0.6) { S.thought[i] = true; if (S.rnd() < 0.6) speak(S, i, 'think'); }
        if (!S.hurried && S.clock <= 3 && c.timeLimitSec > 5 && S.answers.some((a) => a === null)) { S.hurried = true; host(S, 'hurry'); }
        if (Math.floor((S.clock + dt) * 4) !== Math.floor(S.clock * 4)) hud(ctx, S);
        return;
      }
      if (S.phase === 'result') { S.resultAge += dt; S.resultT -= dt; if (S.resultT <= 0) afterResult(ctx, S); }
    },

    dispose() {
      setTimeout(() => {
        for (const S of live) if (S.scene.isDisposed) {
          for (const t of S.timers) clearTimeout(t);
          for (const f of S.feet) f?.dispose(); S.feet = [null, null, null];
          for (const c of S.cast) c?.dispose(); S.cast = [null, null];
          S.host?.dispose(); S.host = null;
          for (const cr of S.crowd) cr.dispose(); S.crowd = [];
          live.delete(S);
        }
        if (live.size === 0) { SoundKit.stopAmbient(); VoiceKit.stopAll(); }
      }, 0);
    },
  };
})();
