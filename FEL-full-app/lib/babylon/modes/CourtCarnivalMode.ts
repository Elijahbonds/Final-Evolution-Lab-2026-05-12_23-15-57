// CourtCarnivalMode v3 — A+ mission #3 (2026-09-06; benchmark Wii Sports Resort floor + Mario Party readability).
//
// v2 drew a random four of six events and raced a rolled number. v3 keeps every event byte-identical and fixes the party:
//   * a player-count screen — solo against the rival, or two on one screen taking turns on the same event (pass-and-play,
//     the DunkDuel format: P1 plays, the event rebuilds, P2 plays, the result compares);
//   * the solo rival PLAYS ON THE BOARD: its score for an event ticks up through the event on a smoothstep, so the race
//     is watched, not revealed (CarnivalNight.rivalProgress);
//   * one body per role — the party-goers on the Carnival Court hub are hidden while an event runs (each event spawns
//     its own player), and come back for the result card and the finale, where they react;
//   * the Carnival Court is mounted as the HUB under the reveal, result and finale cards; events paint their own floor,
//     so the hub hides while they run;
//   * a SCOREBOARD between events (HudScoreCard rows: who took which event) and a readable reveal card (title + verb).
// The rules (seeded draw, rival ticker, banking, the champion) are pure in core/CarnivalNight.ts and tested.

import type { HudValue, ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import * as BABYLON from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { DEFAULT_HERO_URL } from '../core/athleteRoster';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { BeatOwner } from '../anim/beatOwner';
// BIOMECH-WAVE2 (2026-09-09) — the game-wide bar on the carnival hub (SPEC-FEL-BIOMECH-GAMEWIDE asks carnival for "G2 +
// G5 minimum; facing where loco exists"). Measured on 2942860: the host and the guest stand at FIXED yaws in
// `SPORT_CLIP.idle` for the whole night — they never look at each other, at the player, or at the event that is being
// played, and the result beats (the winner's celebrate, the loser's flinch) play on a body whose chest is still in the
// idle's shape. There is no loco here, so G1 is the OTHER BODY: the Posture Poses layer squares each of them onto the
// other, and the result windows finally read as a body (chest open and chin up / shoulders in and chin down).
import { mountPostureLayer, type PostureLayer } from '../anim/PostureLayer';
import { stagePose, STAGE_INPUT_IDLE, type StagePostureInput } from '../core/StagePosture';
import { refuse } from '../core/Refusal';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { readPlaceLook } from '../nexus/placeLooks';
import { allCarnivalEvents, type CarnivalEvent } from './carnivalEvents';
import {
  pickNight, rollRival, rivalMakeRate, rivalProgress, freshTally, bankEvent, nightChampion, nightBoard, type NightTally, EVENTS_PER_NIGHT,
} from '../core/CarnivalNight';
import { ModeMic } from '../audio/mic/ModeMic';   // THE MIC (2026-09-24): the MC calls Game Night, the stands react

type Phase = 'pick' | 'reveal' | 'playing' | 'handoff' | 'eventOver' | 'finale';
/** IMPROVE (2026-10-06): the pick screen's auto-start counts from the last ◀ ▶ ▲ ▼ change, never from the screen opening —
 *  a couch pair still reaching for "2" was handed a solo night at 6 s. Untouched, the screen waits for a face button. */
const PICK_TIMEOUT_S = 6;
const REVEAL_S = 2.0;
/** IMPROVE (2026-10-06): an event's FIRST card of the session is held for its rules (GO starts it), up to this long. */
const REVEAL_HOLD_MAX_S = 12;
/** A press inside this much of a card is a press carried over from what came before it, not a skip. */
const CARD_SKIP_MIN_S = 0.6;
/** The stall watchdog: the card WAITS for an event's build (a slow phone's first spawn can take seconds); one that has not
 *  landed in this long is abandoned and the event skipped. The old watchdog forced the attempt at 6 s into the build. */
const BUILD_BUDGET_S = 20;
const HANDOFF_S = 2.2;
const BOARD_S = 3.2;
/** Event ids whose rules card this session has shown (IMPROVE 2026-10-06: the first one is held, later ones are 2 s). */
const introSeen = new Set<string>();
/** The pick screen's ◀ ▶ options: a solo night, a two-player night, one event's PRACTICE. */
type PickOpt = 'solo' | 'duo' | 'practice';
const PICK_OPTS: readonly PickOpt[] = ['solo', 'duo', 'practice'];
/** The hub under the cards: the Carnival Court, framed by ITS OWN spec camera (every venue spec carries a designed
 *  establishing shot) with the party-goers on the spec's two actor spots. A hand-placed camera sat inside the map's
 *  geometry on two venues in a row; the spec's camera is the one that was authored to see the floor. */
const HUB_VENUE = 'court_carnival';
const HUB_SPOTS: [BABYLON.Vector3, BABYLON.Vector3] = [new BABYLON.Vector3(-1.5, 0, 5), new BABYLON.Vector3(1.5, 0, 2)];   // = VENUE_SPECS.court_carnival.actors

/** One line per event for the reveal card — the verb, not the rules. */
const BLURB: Record<string, string> = {
  slam_rush: 'Hold CHARGE, let go at the top — every make counts',
  strike_storm: 'Mash GO · TRICK · POWER on the bag',
  trick_gauntlet: 'Pop, flip, spin (stick + TRICK) — chain tricks for score',
  hot_shot: 'Aim for the corners, GO to power, GO to shoot — beat the keeper',   // IMPROVE (2026-10-06): hotShot has a keeper now
  coin_storm: 'Sprint the pattern — clear it and a fresh one drops',
  counter_strike: 'Read the wind-up, tap GO at the last instant',
};

/** THE MIC: events whose timing cue is a SOUND (the counter's wind-up whoosh). The booth is silent from the whistle until the
 *  clock runs out (no "go": the first wind-up comes 0.4–0.9 s after the whistle), and the stands stay quiet, so nothing talks
 *  over the cue the player is timing. */
const MIC_HELD: ReadonlySet<string> = new Set(['counter_strike']);
/** THE MIC's court: the carnival has no court pick, so its place look picks the MC (the rooftop look gets the rooftop's host;
 *  the Carnival Court and the Boardwalk get Venice's). */
const micCourt = (): string => (readPlaceLook('carnival')?.id === 'neon-block' ? 'rooftop' : 'venice');

/** Everything an instance owns. Keyed by the harness scene: a host that mounts twice (React strict mode: effect →
 *  cleanup → effect) runs two load()s that INTERLEAVE, and module-level state let the phantom's hub win over the live
 *  scene's (measured on /play/carnival: the live scene sat on the mood sky). */
interface St {
  scene: BABYLON.Scene;
  events: CarnivalEvent[];
  /** every event, in the pool's order (the PRACTICE picker's list) */
  pool: CarnivalEvent[];
  idx: number;
  phase: Phase;
  phaseSec: number;
  pickSec: number;
  /** IMPROVE (2026-10-06): a ◀ ▶ ▲ ▼ choice was made on the pick screen (the auto-start counts from it) */
  pickTouched: boolean;
  pickOpt: PickOpt;
  practiceIdx: number;
  /** a single-event PRACTICE night */
  practice: boolean;
  /** how long this event's card holds before the attempt starts by itself */
  revealHold: number;
  /** IMPROVE (2026-10-06): an event build is in flight (runAttempt never starts a second), how long it has run, and the
   *  attempt token a late build checks (the watchdog bumps it when it gives up on the build) */
  building: boolean;
  buildSec: number;
  attempt: number;
  /** 2P: P1's built event is kept for P2 and reset, not torn down and built again */
  kept: boolean;
  /** IMPROVE (2026-10-06): the last per-frame HUD pushed (clock + the rival ticker); a frame that changes neither pushes nothing */
  hudSecs: number;
  hudRival: number;
  /** the hub party-goers are animating (false while an event runs: parked, their posture layers off) */
  hubAwake: boolean;
  autoBegin: boolean;
  starting: boolean;
  current: CarnivalEvent | null;
  players: number;
  turn: number;
  turnPoints: [number, number];
  tally: NightTally;
  rivalTarget: number;
  ended: boolean;
  hub: VenueHandle | null;
  host: SpawnedCharacter | null;
  guest: SpawnedCharacter | null;
  /** ANIM-READABILITY (creative, 2026-09-07): the one owner of each party-goer's clips (idle + the result / finale beats). */
  hostBody: BeatOwner | null;
  guestBody: BeatOwner | null;
  /** BIOMECH-WAVE2: the Posture Poses layer on each party-goer, and the body each is fed. */
  hostPP: { layer: PostureLayer; dispose(): void } | null;
  guestPP: { layer: PostureLayer; dispose(): void } | null;
  hostBio: StagePostureInput;
  guestBio: StagePostureInput;
  anchor: BABYLON.TransformNode | null;
  /** A+ P0 juice latches: one event-win punch per event (reset when the next event starts), one champion punch per night. */
  eventLatch: boolean;
  champLatch: boolean;
  /** THE MIC: one per night. `micOpening` until the first event's card (the welcome is the pick screen's), `micOpened` once
   *  the welcome is said, `micQuiet` the dead time the booth / the stands are filling ('pick', 'board' or ''), `micClock` the
   *  five-seconds call of this attempt is said. */
  mic: ModeMic | null;
  micOpening: boolean;
  micOpened: boolean;
  micQuiet: string;
  micClock: boolean;
}

const states = new WeakMap<BABYLON.Scene, St>();
const live = new Set<St>();

export const CourtCarnivalMode: ModeDefinition = (() => {
  const st = (ctx: ModeContext): St | undefined => states.get(ctx.scene);
  const names = (S: St): [string, string] => (S.players > 1 ? ['P1', 'P2'] : ['YOU', 'RIVAL']);
  function setPhase(S: St, p: Phase): void {
    S.phase = p; S.phaseSec = 0;
    // G1: between results the two of them WATCH each other (and whatever is being played) instead of staring past it
    if (p !== 'eventOver' && p !== 'finale') { S.hostBio.celebrating = S.hostBio.dejected = false; S.guestBio.celebrating = S.guestBio.dejected = false; }
    S.hostBio.watching = S.guestBio.watching = true;
  }
  /** `winner` 0 = host, 1 = guest, null = a tie (both keep watching). */
  function setResult(S: St, winner: 0 | 1 | null): void {
    S.hostBio.celebrating = winner === 0; S.hostBio.dejected = winner === 1;
    S.guestBio.celebrating = winner === 1; S.guestBio.dejected = winner === 0;
  }

  // ── A+ P0 juice (PM brief CARNIVAL-A-PLUS-P0, 2026-09-07): Mario Party readability with Wii Sports weight. No slowMo, no
  // juice.impact({ slow }), no HoopJuice. The event's own chime, cheer and confetti stay; ONE thud (no feel + SoundKit stack).
  /** You took the event: latched hit-stop + shake + short flash + one low thud. Once per event. */
  function eventWinPunch(ctx: ModeContext, S: St): void {
    if (S.eventLatch) return; S.eventLatch = true;
    ctx.juice.hitStop(45); ctx.juice.shake(0.10, 140); ctx.juice.flash('#fff6dd', 90);
    SoundKit.play('impact', { pitch: 0.7, volume: 0.5 });
    console.info('[CARN-JUICE] event win punch');
  }
  /** The rival (or P2) took it: a soft flash only. */
  function rivalSoftFlash(ctx: ModeContext, tag: string): void { ctx.juice.flash('#ffd9d9', 70); console.info(`[CARN-JUICE] soft flash (${tag})`); }
  /** CARNIVAL CHAMPION: latched hit-stop + shake + gold flash; the cheer, confetti and celebrate stay. Once per night. */
  function championPunch(ctx: ModeContext, S: St): void {
    if (S.champLatch) return; S.champLatch = true;
    ctx.juice.hitStop(60); ctx.juice.shake(0.14, 160); ctx.juice.flash('#FFD700', 140);
    console.info('[CARN-JUICE] champion punch');
  }

  /** The hub stays mounted for the night. Disposing it and building court_carnival again on every event was the
   *  swap hitch: the venue, its map and its lights came back from scratch between stops. keepGameplayCamera hands
   *  the shot back at the one mount; hiding the root takes the hub off screen while an event paints its own floor.
   *  Assumption: the old sky-frame came from the venue camera at mount time, which keepGameplayCamera already
   *  restores. Venue map load does not assign scene.activeCamera. */
  function showHub(ctx: ModeContext, S: St, on: boolean): void {
    if (on) {
      if (!S.hub) { S.hub = mountVenue(ctx, HUB_VENUE, { keepGameplayCamera: true, look: readPlaceLook('carnival') }); S.hub?.hidePlaceholders(); }   // PLACE: the splash's pick
      S.hub?.built.root.setEnabled(true);
      // A FOLLOW camera around a still anchor, not a fixed shot: fixed mode places the camera but the frame guard
      // measured it aimed away ("hero BEHIND camera") and the frame sat on the sky. Follow aims every frame. The anchor
      // is the court's centre; the objective is the midpoint of the two actor spots, so the two-shot looks past the
      // centre at the party-goers with the court under them.
      if (!S.anchor || S.anchor.isDisposed()) S.anchor = new BABYLON.TransformNode('carnival_hub_anchor', ctx.scene);
      S.anchor.position.set(0, 1.2, 0);
      const mid = HUB_SPOTS[0].add(HUB_SPOTS[1]).scale(0.5); mid.y = 1.2;
      ctx.heroRef.current = S.anchor; ctx.objectiveRef.current = mid;
      ctx.camDirector.setPreset('court');
      ctx.camDirector.snapTo(S.anchor.position, mid);
    } else {
      S.hub?.built.root.setEnabled(false);
    }
    S.host?.root.setEnabled(on);
    S.guest?.root.setEnabled(on);
    wakeHub(ctx, S, on);
  }

  /** G1/G5: each party-goer squares onto the other's chest and holds a readable result silhouette. */
  function mountHubPosture(ctx: ModeContext, S: St): void {
    if (!S.host || !S.guest) return;
    const chestOf = (c: SpawnedCharacter): BABYLON.Vector3 => c.root.position.add(new BABYLON.Vector3(0, 1.32, 0));
    S.hostPP?.dispose(); S.guestPP?.dispose();
    S.hostPP = mountPostureLayer(ctx.scene, S.host.skeleton, S.host.root, () => {
      const g = S.guest; if (!g) return null;
      const { window, pose, legs } = stagePose(S.hostBio);
      const at = chestOf(g); return { pose, legs, aim: at, eyes: at, window };
    }, 'CARN-PP');
    S.guestPP = mountPostureLayer(ctx.scene, S.guest.skeleton, S.guest.root, () => {
      const h = S.host; if (!h) return null;
      const { window, pose, legs } = stagePose(S.guestBio);
      const at = chestOf(h); return { pose, legs, aim: at, eyes: at, window };
    }, 'CARN-PP-GUEST');
  }

  /**
   * IMPROVE (2026-10-06): a HIDDEN party-goer costs nothing. setEnabled(false) only stops the draw: both skinned bodies kept
   * playing their idle and both posture layers kept stepping on onAfterAnimations through every frame of every event.
   * Asleep, their clips are parked and their posture layers removed; awake, the idle loop and the layers come back (the
   * result beats are fired after the wake, so they land on a live body).
   */
  function wakeHub(ctx: ModeContext, S: St, on: boolean): void {
    if (on === S.hubAwake) return;
    S.hubAwake = on;
    if (on) {
      S.hostBody?.loop(SPORT_CLIP.idle); S.guestBody?.loop(SPORT_CLIP.idle);
      mountHubPosture(ctx, S);
    } else {
      S.hostBody?.reset(); S.guestBody?.reset();   // the token first: a beat cut by the park must not settle into its loop
      S.host?.animator.park(); S.guest?.animator.park();
      S.hostPP?.dispose(); S.hostPP = null; S.guestPP?.dispose(); S.guestPP = null;
    }
  }

  function hud(ctx: ModeContext, S: St, extra: Record<string, HudValue> = {}): void {
    ctx.setHud({
      score: S.tally.points[0],
      rivalScore: S.tally.points[1],
      players: S.players, eventNum: S.current || S.idx < S.events.length ? `${Math.min(S.idx + 1, S.events.length)}/${S.events.length}` : '',
      p1name: names(S)[0], p2name: names(S)[1],
      ...extra,
    });
  }

  // ── pick ────────────────────────────────────────────────────────────
  function showPick(ctx: ModeContext, S: St): void {
    const practice = S.pickOpt === 'practice';
    // IMPROVE (2026-10-06): PRACTICE — one event, solo vs the rival (the `?events=` single-event path, on the screen)
    ctx.setHud({
      banner: practice ? `PRACTICE   ▲  ${S.pool[S.practiceIdx]?.title ?? ''}  ▼` : `PLAYERS   ◀  ${S.players}  ▶`,
      hint: practice ? 'one event, solo vs the rival · ▲ ▼ picks the event · ◀ back · any face button starts'
        : S.players > 1 ? 'two on one screen · you take turns on every event · ▶ PRACTICE · any face button starts'
        : 'solo vs the rival · ◀ ▶ adds a player or PRACTICE · any face button starts',
      blurb: practice ? (BLURB[S.pool[S.practiceIdx]?.id ?? ''] ?? '') : '',
      board: null, boardTitle: '', players: S.players, score: 0, rivalScore: 0, eventNum: '',
    });
  }

  /** A ◀ ▶ (the option) or ▲ ▼ (PRACTICE's event) on the pick screen. Pure on the state; the caller redraws. */
  function pickStep(S: St, dir: 'left' | 'right' | 'up' | 'down'): boolean {
    if (dir === 'left' || dir === 'right') {
      const i = PICK_OPTS.indexOf(S.pickOpt), j = Math.max(0, Math.min(PICK_OPTS.length - 1, i + (dir === 'right' ? 1 : -1)));
      if (i === j) return false;
      S.pickOpt = PICK_OPTS[j];
      S.players = S.pickOpt === 'duo' ? 2 : 1;
      return true;
    }
    if (S.pickOpt !== 'practice' || !S.pool.length) return false;
    S.practiceIdx = (S.practiceIdx + (dir === 'down' ? 1 : -1) + S.pool.length) % S.pool.length;
    return true;
  }

  function begin(ctx: ModeContext, S: St): void {
    if (S.phase !== 'pick' || S.starting) return;
    S.starting = true;
    if (S.pickOpt === 'practice' && S.pool[S.practiceIdx]) { S.practice = true; S.players = 1; S.events = [S.pool[S.practiceIdx]]; }
    startEvent(ctx, S);
  }

  // ── an event ────────────────────────────────────────────────────────
  function startEvent(ctx: ModeContext, S: St): void {
    S.current = S.events[S.idx];
    S.turn = 0; S.turnPoints = [0, 0]; S.eventLatch = false; S.kept = false;   // a fresh event gets one win punch at most
    setPhase(S, 'reveal');
    // IMPROVE (2026-10-06): the card is the only rules text an event gets. The first time an event appears this session it
    // HOLDS (GO starts the event; it gives up after REVEAL_HOLD_MAX_S); after that it is the 2 s card, and GO skips it.
    // update() runs the card's clock now — the 2 s setTimeout ran on through a paused harness and left the watchdog to
    // guess whether the card or the build had stalled.
    const first = !S.autoBegin && !introSeen.has(S.current.id);   // a probe night (?players=) keeps the 2 s cards
    introSeen.add(S.current.id);
    S.revealHold = first ? REVEAL_HOLD_MAX_S : REVEAL_S;
    showHub(ctx, S, true);
    const blurb = BLURB[S.current.id] ?? '';
    hud(ctx, S, { banner: `${S.practice ? 'PRACTICE' : 'NEXT UP'}: ${S.current.title}`, blurb: first ? `${blurb}  ·  GO when ready` : blurb, board: null, boardTitle: '', hint: '' });
    SoundKit.play('powerUp');
    // SCORECARD FEEL: the night is four events, and the turn of one is the biggest beat the hub has (3 juice beats a minute)
    ctx.juice.flash('#ffd75e', 110);
    ctx.juice.callout(S.current.title, '#ffd75e', 900);
    // THE MIC names the event over its card. The first card ends the pick screen's welcome where it is (the player pressed
    // on, as the dunk's welcome stops when the player runs): queued behind the welcome and the Game Night intro, the name
    // was cut by the first whistle before it was ever said, and when the press beat the voices it jumped AHEAD of the intro.
    // Later cards wait a beat for the last result call to finish (equal priority) and cut the board's filler.
    if (S.micOpening) { S.micOpening = false; S.mic?.hush(); }
    S.mic?.say({ moment: 'carnival.event', tags: [`ev:${S.current.id}`], priority: 2 });
  }

  /** The attempt: build the event (or, for P2, reset the one P1 played) and blow the whistle. Never runs twice at once —
   *  the hand-off used to start a fresh build on every frame its build was still in flight. */
  async function runAttempt(ctx: ModeContext, S: St): Promise<void> {
    if (!S.current || S.building || S.phase === 'playing' || S.ended) return;
    const ev = S.current;
    showHub(ctx, S, false);                          // the event paints its own floor and spawns its own player
    ctx.setHud({ banner: '', blurb: '' });
    // HOOPS MOTION phase 3c (review): the bodies this event spawns are built for IT — the hoops smoothing and the overhead pole rule reach
    // only Slam Rush's (smoothKeys.hoopsMotionModeOf); the karate, coin, trick and goal events keep their core clips as their own modes do
    (ctx.scene.metadata ??= {}).felCarnivalEvent = S.current.id;
    if (S.kept && ev.reset) {
      S.kept = false;
      ev.reset(ctx);                                 // IMPROVE (2026-10-06): P2 plays P1's stage — nothing is spawned again
    } else {
      const token = ++S.attempt;
      S.building = true; S.buildSec = 0;
      try {
        await S.current.build(ctx);   // (S.current is `ev` here: the stamp above names the event this build spawns for)
      } catch (err) {
        console.error(`[FEL-CARNIVAL] ${ev.id} build failed — skipping the event`, err);
        if (token === S.attempt) skipEvent(ctx, S);
        return;
      }
      if (token !== S.attempt) { ev.teardown(); return; }   // the watchdog gave up on this build: what landed late goes
      S.building = false;
    }
    if (S.ended || S.scene.isDisposed) return;
    // IMPROVE (2026-10-06): the rival warms up through the night (CarnivalNight.rivalMakeRate)
    if (S.players === 1) S.rivalTarget = Math.round(rollRival(ev.rivalRange, Math.random, rivalMakeRate(S.idx, S.tally.won[0].length)) * ev.pointsPerUnit);
    setPhase(S, 'playing');
    S.hudSecs = -1;
    SoundKit.play('whistle');
    micGo(S);
    hud(ctx, S, { time: ev.durationSec, turnLabel: S.players > 1 ? `${names(S)[S.turn]} — GO` : '' });
  }

  /**
   * IMPROVE (2026-10-06): the stall watchdog's way out. It used to set 'playing' on an event whose build had not landed, and
   * the event's tick then threw every frame on its undefined player / meter (Hot Shot, Coin Storm). Now a hung or failed
   * build skips the event: the attempt token moves on (a build landing later tears itself down), nothing is banked, and the
   * night goes on to the next card.
   */
  function skipEvent(ctx: ModeContext, S: St): void {
    const ev = S.current;
    S.attempt++; S.building = false; S.kept = false;
    console.warn(`[FEL-CARNIVAL] watchdog: ${ev?.id ?? '?'} never finished building — skipping it`);
    try { ev?.teardown(); } catch { /* a half-built event: whatever did land is dropped with the scene */ }
    S.current = null;
    refuse(ctx, 'EVENT SKIPPED');
    advance(ctx, S);
  }

  function endAttempt(ctx: ModeContext, S: St): void {
    if (!S.current) return;
    S.mic?.release();   // THE MIC: a held event's clock is out; the booth may talk again
    const raw = S.current.tick(ctx, 0);
    const points = Math.round(raw * S.current.pointsPerUnit);
    // IMPROVE (2026-10-06): two on one screen, P1's event stays up for P2 (reset, not torn down and built again) when the
    // event can reset itself; the hand-off card plays over its stage
    const keep = S.players > 1 && S.turn === 0 && !!S.current.reset;
    if (!keep) S.current.teardown();
    S.turnPoints[S.turn] = points;
    if (S.players > 1 && S.turn === 0) {
      // pass the pad: same event, P2's turn
      S.turn = 1;
      S.kept = keep;
      setPhase(S, 'handoff');
      if (!keep) showHub(ctx, S, true);
      SoundKit.play('uiTick', { pitch: 1.1 });
      hud(ctx, S, { banner: `${S.current.title}: ${names(S)[0]} ${points}`, blurb: `${names(S)[1]} — YOUR TURN`, time: null, turnLabel: '' });
      S.mic?.say({ moment: 'carnival.handoff', priority: 2, crowd: { moment: 'crowd.hype', n: 1 } });   // THE MIC: pass the pad
      return;
    }
    if (S.players === 1) S.turnPoints[1] = S.rivalTarget;
    settleEvent(ctx, S);
  }

  function settleEvent(ctx: ModeContext, S: St): void {
    if (!S.current) return;
    const [a, b] = S.turnPoints;
    const w = bankEvent(S.tally, S.current.title, a, b);
    SoundKit.play('score');
    showHub(ctx, S, true);
    // the party-goers REACT to WHO took the event: the winner celebrates, the loser takes it on the chin; a tie shrugs
    const rivalTookIt = w === 1;
    const winnerBody = w === -1 ? null : rivalTookIt ? S.guestBody : S.hostBody;
    const loserBody = w === -1 ? null : rivalTookIt ? S.hostBody : S.guestBody;
    winnerBody?.beat(SPORT_CLIP.scoreCelebrate, { fadeSec: 0.12 });   // both settle back into SPORT_CLIP.idle on their own
    loserBody?.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.08 });
    // G5: the body under those beats — the winner's chest opens, the loser's closes (they used to play on the idle's shape)
    setResult(S, w === -1 ? null : rivalTookIt ? 1 : 0);
    if (w === 0) { EffectsKit.burst(ctx.scene, ctx.camera.position, 'confetti'); SoundKit.play('crowdCheer', { volume: 0.4 }); eventWinPunch(ctx, S); }
    else if (w === 1) { SoundKit.play('crowdGroan', { volume: 0.4 }); rivalSoftFlash(ctx, 'event'); }
    // THE MIC: the result is the night's best speech window (the board, then the next card: ~5 s) — who took it, and the
    // stands. Two on one screen, P2 taking it is still a player's win (the loss lines are about the rival).
    if (w === -1) S.mic?.say({ moment: 'carnival.tie', priority: 2, crowd: { moment: 'crowd.ooh', n: 1 } });
    else if (w === 0 || S.players > 1) S.mic?.say({ moment: 'carnival.eventwin', priority: 2, crowd: { moment: 'crowd.cheer', n: 2 } });
    else S.mic?.say({ moment: 'carnival.eventloss', priority: 2, crowd: { moment: 'crowd.groan', n: 1 } });
    const [n1, n2] = names(S);
    hud(ctx, S, {
      banner: `${S.current.title}: ${n1} ${a} · ${n2} ${b}`,
      blurb: w === -1 ? 'TIE — nobody takes it' : `${names(S)[w]} TAKES IT`,
      board: nightBoard(S.tally, names(S)),
      boardTitle: S.idx + 1 < S.events.length ? `NEXT — EVENT ${S.idx + 2} / ${S.events.length}` : 'FINAL EVENT DONE',
      time: null, turnLabel: '',
    });
    S.current = null;
    setPhase(S, 'eventOver');
  }

  function advance(ctx: ModeContext, S: St): void {
    if (S.ended) return;
    S.idx++;
    if (S.idx >= S.events.length) { finale(ctx, S); return; }
    startEvent(ctx, S);
  }

  function finale(ctx: ModeContext, S: St): void {
    if (S.ended) return;
    setPhase(S, 'finale');
    S.ended = true;
    SoundKit.play('whistle');
    const champ = nightChampion(S.tally);
    const won = champ === 0;
    if (won) { SoundKit.play('crowdCheer'); EffectsKit.burst(ctx.scene, ctx.camera.position, 'confetti'); championPunch(ctx, S); }
    else rivalSoftFlash(ctx, 'runner-up');
    const champBody = champ === 0 ? S.hostBody : S.guestBody;
    const runnerUpBody = champ === 0 ? S.guestBody : S.hostBody;
    champBody?.beat(SPORT_CLIP.scoreCelebrate, { fadeSec: 0.12 });
    runnerUpBody?.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.08 });
    setResult(S, champ === 0 ? 0 : 1);
    const [n1, n2] = names(S);
    hud(ctx, S, {
      banner: S.practice ? (won ? 'PRACTICE: YOU TOOK IT' : 'PRACTICE: THE RIVAL TOOK IT')
        : S.players > 1 ? `${names(S)[champ]} TAKES THE CARNIVAL` : (won ? 'CARNIVAL CHAMPION!' : 'RIVAL TAKES THE CARNIVAL'),
      blurb: `${n1} ${S.tally.points[0]} · ${n2} ${S.tally.points[1]}`,
      board: nightBoard(S.tally, names(S)), boardTitle: 'FINAL',
    });
    // THE MIC: the champion is called BEFORE ctx.end parks the harness (the voice plays on over the result screen). Two on
    // one screen, whoever takes it is the champion (the runner-up lines are about the rival).
    const champCall = won || S.players > 1;
    S.mic?.hush();
    S.mic?.say({ moment: champCall ? 'carnival.champion' : 'carnival.runnerup', priority: 3,
      crowd: champCall ? { moment: 'crowd.erupt', n: 3 } : { moment: 'crowd.groan', n: 1 } });
    ctx.end(won ? 'CHAMPION' : 'RUNNER_UP', S.tally.points[0], {
      rivalPoints: S.tally.points[1], events: S.events.length, players: S.players,
      eventsWon: S.tally.won[0].length, rivalEventsWon: S.tally.won[1].length, champion: champ, practice: S.practice ? 1 : 0,
    });
  }

  // ── THE MIC ─────────────────────────────────────────────────────────
  /** Every frame: the welcome once the voices are in (only before the first whistle — never mid-event), the mic's clock, and
   *  the booth's filler only on the result board / the stands' chatter on the board and the pick screen (dead time). */
  function micTick(ctx: ModeContext, S: St): void {
    const mic = S.mic; if (!mic) return;
    // the pick screen only: a welcome begun under the first card was cut by its whistle, and the stall watchdog can start
    // an event with no whistle at all (the welcome would have run over play)
    if (!S.micOpened && S.micOpening && S.phase === 'pick' && mic.ready && ctx.phase() === 'playing') {
      S.micOpened = true;   // the court's welcome, then Game Night (the first card cuts whatever is left of them)
      mic.say({ moment: 'intro.court', priority: 2, crowd: { moment: 'crowd.hype', n: 2 } });
      mic.then({ moment: 'carnival.intro', priority: 2 });
    }
    mic.update();
    const quiet = S.phase === 'eventOver' ? 'board' : S.phase === 'pick' ? 'pick' : '';
    if (quiet !== S.micQuiet) {
      S.micQuiet = quiet;
      mic.setFiller(quiet === 'board' ? ['filler.banter', 'filler.crowd'] : null);
      mic.setCrowdIdle(quiet ? 'crowd.idle' : null);
    }
  }
  /** The whistle: "Go!" The event's name may still be finishing: the go waits a beat for it or lets it go (equal priority).
   *  A held event gets no go at all: its first wind-up whoosh comes 0.4–0.9 s after the whistle, so a "Go!" landed right on
   *  the first cue the player times. The whistle is its go; the booth is cleared and held until the clock runs out. */
  function micGo(S: St): void {
    const mic = S.mic; if (!mic || !S.current) return;
    S.micClock = false;
    if (MIC_HELD.has(S.current.id)) { mic.hush(); mic.hold(S.current.durationSec + 1); return; }   // released at the end of the attempt
    mic.say({ moment: 'carnival.go', priority: 2, crowd: { moment: 'crowd.hype', n: 1 } });
  }

  return {
    modeId: 'carnival', mood: 'goldenHour', camPreset: 'court',

    async load(ctx: ModeContext) {
      const qs = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const q = qs?.get('players') ?? null;
      // `?events=slam_rush,counter_strike` names the night's draw in order (probes / dev); the seeded draw otherwise.
      // HOTFIX (2026-09-24): a named night is still EVENTS_PER_NIGHT events at most. The list was taken whole, so a URL
      // naming forty events played a forty-event night — on a staked Game Night that is a score no four-event night can
      // reach, and the Arena's check (lib/arena-score-integrity.ts) bounds a night by EVENTS_PER_NIGHT.
      const pool = allCarnivalEvents();
      const named = (qs?.get('events') ?? '').split(',').map((id) => pool.find((e) => e.id === id.trim())).filter((e): e is CarnivalEvent => !!e).slice(0, EVENTS_PER_NIGHT);
      const players = Math.max(1, Math.min(2, Number(q ?? 1) || 1));
      const S: St = {
        scene: ctx.scene, events: named.length ? named : pickNight(pool, Date.now() % 100000), pool, idx: 0, phase: 'pick', phaseSec: 0, pickSec: 0,
        pickTouched: false, pickOpt: players > 1 ? 'duo' : 'solo', practiceIdx: 0, practice: false, revealHold: REVEAL_S,
        building: false, buildSec: 0, attempt: 0, kept: false, hudSecs: -1, hudRival: -1, hubAwake: true,
        // Nothing is built before the harness is PLAYING: an event built inside load() had its camera reset by the
        // harness's own start-of-play step and the first event rendered sky (measured on /play/carnival?players=1).
        autoBegin: !!q, starting: false, current: null,
        players, turn: 0, turnPoints: [0, 0], tally: freshTally(), rivalTarget: 0,
        ended: false, hub: null, host: null, guest: null, hostBody: null, guestBody: null, anchor: null, eventLatch: false, champLatch: false,
        hostPP: null, guestPP: null, hostBio: { ...STAGE_INPUT_IDLE, watching: true }, guestBio: { ...STAGE_INPUT_IDLE, watching: true },
        mic: null, micOpening: true, micOpened: false, micQuiet: '', micClock: false,
      };
      states.set(ctx.scene, S); live.add(S);
      SoundKit.startAmbient('stadium');
      // THE MIC: the night's MC, the sidekick and the stands (the banks load in the background; nothing waits on them)
      S.mic = new ModeMic(ctx, { groups: ['carnival'], court: micCourt() });

      // THE HUB: the Carnival Court under the cards, party-goers on its actor spots — you (and P2 / the rival)
      S.host = await CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, { position: HUB_SPOTS[0].clone(), yawRad: Math.PI });
      installSafePlay(S.host.animator, 'carnival-host');
      S.hostBody = new BeatOwner(S.host.animator); S.hostBody.loop(SPORT_CLIP.idle);
      S.guest = await CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, { position: HUB_SPOTS[1].clone(), yawRad: 0, tint: '#ff2d78' });
      installSafePlay(S.guest.animator, 'carnival-guest');
      S.guestBody = new BeatOwner(S.guest.animator); S.guestBody.loop(SPORT_CLIP.idle);
      // G1/G5: each one squares onto the other's chest and holds a readable result silhouette
      mountHubPosture(ctx, S);
      if (process.env.NODE_ENV === 'development') {
        const dev = (window as unknown as { __FEL_DEV__?: { stagePosture?: unknown } }).__FEL_DEV__;
        if (dev) dev.stagePosture = {   // BIOMECH-WAVE2 probes — the HUB pair (each event spawns its own body, which dev.hero() points at)
          host: () => S.hostPP?.layer.get() ?? null, guest: () => S.guestPP?.layer.get() ?? null,
          bio: () => ({ host: { ...S.hostBio }, guest: { ...S.guestBio } }),
          aim: () => { const g = S.guest; return g ? { x: g.root.position.x, y: g.root.position.y + 1.32, z: g.root.position.z } : null; },
        };
      }
      if (S.scene.isDisposed) return;
      showHub(ctx, S, true);
      if (!S.autoBegin) showPick(ctx, S);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      const S = st(ctx); if (!S) return;
      SoundKit.unlock();
      if (S.phase === 'pick') {
        if (e.t === 'dpad' && e.pressed && (e.dir === 'left' || e.dir === 'right' || e.dir === 'up' || e.dir === 'down')) {
          S.pickTouched = true; S.pickSec = 0;   // IMPROVE (2026-10-06): the auto-start counts from the last choice
          if (pickStep(S, e.dir)) SoundKit.play('uiTick', { pitch: e.dir === 'right' || e.dir === 'down' ? 1.2 : 0.9, volume: 0.3 });
          showPick(ctx, S);
        } else if (e.t === 'button' && e.pressed && (e.btn === 'A' || e.btn === 'B' || e.btn === 'X' || e.btn === 'Y')) begin(ctx, S);
        return;
      }
      // SCORECARD CONTROLS (2026-09-15): between events — the reveal, the hand-off, the board — every press fell through to
      // nothing (21 % of the session's presses once the carnival could be measured at all). Each waiting phase says what
      // it is waiting for.
      if (S.phase !== 'playing' || !S.current) {
        // IMPROVE (2026-10-06): GO moves the night on — it starts the event from its card (the first card waits for it) and
        // skips the scoreboard. A press in a card's first CARD_SKIP_MIN_S is one carried over from before it.
        const go = e.t === 'button' && e.pressed && e.btn === 'A' && S.phaseSec >= CARD_SKIP_MIN_S;
        if (go && S.phase === 'reveal' && !S.building) { void runAttempt(ctx, S); return; }
        if (go && S.phase === 'eventOver') { advance(ctx, S); return; }
        if ((e.t === 'button' || e.t === 'dpad') && e.pressed) {
          refuse(ctx, S.phase === 'eventOver' ? 'GO — NEXT EVENT'
            : S.phase === 'handoff' ? 'PASS THE PAD'
            : S.phase === 'reveal' ? (S.building ? 'HERE COMES THE EVENT' : 'GO TO START')
            : 'THE NIGHT IS OVER');
        }
        return;
      }
      // THE WRONG BUTTON IS STILL A PRESS (SCORECARD FEEL, 2026-09-15). Each event is one verb, and the rest of the deck
      // used to fall into the floor — only 42 % of answered presses in the rc19 capture carried a sound or a pop, because
      // most presses were simply the wrong button for the event on screen. The event declares what it reads; anything
      // else is answered with the verb that would have worked, which is both a feel fix and the only teaching this
      // 15-second format has room for.
      const v = S.current.verbs;
      if (v && e.t === 'button' && e.pressed && !v.buttons.includes(e.btn ?? '')) { refuse(ctx, v.says); return; }
      // no carnival event reads the d-pad — every one of them steers with the stick — so a direction tapped on it was
      // the last silent press in the mode (9 % of the rc20 capture, all of them d-pad)
      if (e.t === 'dpad' && e.pressed) { refuse(ctx, v ? v.says : 'MOVE WITH THE STICK'); return; }
      S.current.onInput(ctx, e);
    },

    update(ctx: ModeContext, dt: number) {
      const S = st(ctx); if (!S || S.ended) return;
      S.phaseSec += dt;
      micTick(ctx, S);

      if (S.phase === 'pick') {
        if (S.pickTouched) S.pickSec += dt;
        if (S.autoBegin || (S.pickTouched && S.pickSec >= PICK_TIMEOUT_S)) begin(ctx, S);
        return;
      }

      if (S.phase === 'playing' && S.current) {
        S.current.tick(ctx, dt);
        const left = Math.max(0, S.current.durationSec - S.phaseSec);
        const secs = Math.ceil(left);
        // IMPROVE (2026-10-06): the clock and the rival ticker change about once a second; the HUD heard a fresh object every
        // frame. It is pushed when what it shows changes.
        const liveRival = S.players === 1 ? Math.round(S.rivalTarget * rivalProgress(S.phaseSec / S.current.durationSec)) : 0;
        if (secs !== S.hudSecs || liveRival !== S.hudRival) {
          S.hudSecs = secs; S.hudRival = liveRival;
          const extra: Record<string, HudValue> = { time: secs };
          if (S.players === 1) {
            // the rival plays on the board: their points for THIS event tick in through the event
            extra.rivalScore = S.tally.points[1] + liveRival;
            extra.rivalLive = liveRival;
          } else {
            extra.turnLabel = `${names(S)[S.turn]} — ${secs}s`;
          }
          ctx.setHud(extra);
        }
        if (!S.micClock && left <= 5 && left > 0) {
          S.micClock = true;   // THE MIC: once, at five seconds (not on a held event: the stands would cover the cue too)
          if (!MIC_HELD.has(S.current.id)) S.mic?.say({ moment: 'carnival.clock', priority: 2, crowd: { moment: 'crowd.hype', n: 2 } });
        }
        if (left <= 0) endAttempt(ctx, S);
        return;
      }

      // stall-proofing (IMPROVE 2026-10-06): a build that hangs past its budget is abandoned and the event skipped — the
      // watchdog used to force 'playing' on an event that had not finished building
      if (S.building) {
        S.buildSec += dt;
        if (S.buildSec > BUILD_BUDGET_S) skipEvent(ctx, S);
        return;
      }
      if (S.phase === 'reveal' && S.phaseSec >= S.revealHold) { void runAttempt(ctx, S); return; }
      if (S.phase === 'handoff' && S.phaseSec >= HANDOFF_S) { void runAttempt(ctx, S); return; }
      if (S.phase === 'eventOver' && S.phaseSec >= BOARD_S) { advance(ctx, S); return; }
    },

    dispose() {
      // No ctx here. The harness disposes the scene right after this call, which takes every mesh with it; the only
      // things to do by hand are the instance whose scene is GOING away — found on the next tick by `isDisposed` —
      // and the ambient bed, which stays up while another instance is still live (strict-mode phantom stop).
      setTimeout(() => {
        for (const S of live) if (S.scene.isDisposed) { S.ended = true; S.current = null; S.hostPP?.dispose(); S.hostPP = null; S.guestPP?.dispose(); S.guestPP = null; S.mic?.dispose(); S.mic = null; live.delete(S); }   // THE MIC stops with its night
        if (live.size === 0) SoundKit.stopAmbient();
      }, 0);
    },
  };
})();

// HUD fields: eventNum ('2/4'), score/rivalScore (running points; rivalScore ticks live in solo), rivalLive, players,
// p1name/p2name, turnLabel (2P: whose attempt and the clock), time (seconds left), banner (reveal / result / finale
// title), blurb (the reveal's verb line, the result's "P1 TAKES IT", the handoff's "P2 — YOUR TURN"), board +
// boardTitle (HudScoreCard rows between events and at the finale).
// modeVerbs: the 'carnival' entry (GO / TRICK / POWER / CHARGE) — each event maps its own buttons via onInput.
