// bodyPlayChoice — which games offer body play, what the player chose, and what the Body button does (movement play,
// phase 4, 2026-09-25).
//
// OWNER'S DECISIONS (movement play rounds 3–5): "Play with your body" is a choice on each game's READY screen that runs
// the space check, and it is REMEMBERED PER GAME; the header's Body button is a shortcut to that choice. Only the games
// the body really drives offer it now (the nine P3 binds: skate, snow, surf, sprint, big air, free run, karate VS, mixed
// combat, showdown — the three fights reading the body's own strikes since P7); a game with a later phase (P5–P9) says body
// play is coming, and a game with none says nothing.
//
// The offer is read from the running game's card (sessionStore: the harness writes `drives` from bodySeamFor — the
// profile's bindings, or a mode's own onBody — and `later` from its row), never from a list of its own: when P5 gives
// the dunk an onBody, its READY offers body play with no change here.
//
// REMEMBERED only pre-selects: the camera never starts without a tap (that tap is also the one gesture that unlocks
// sound for a game the body starts, since the hands-up START presses nothing). One localStorage entry per game
// (fel-body-play-<registry key>, like fel-court- and fel-place-), the last thing the player did winning: turning the
// camera off remembers "off".
//
// Pure: storage is handed in (the page's localStorage by default), and a store that throws reads as "not chosen".
import type { BodyProfile } from '@/lib/input/bodyProfiles';

export const BODY_PLAY_KEY_PREFIX = 'fel-body-play-';

type Getter = Pick<Storage, 'getItem'>;
type Setter = Pick<Storage, 'setItem'>;
const pageStorage = (): (Getter & Setter) | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

/** The player chose body play for this game last time (absent, unreadable or throwing = no). */
export function readBodyPlay(key: string, store: Getter | null = pageStorage()): boolean {
  try { return store?.getItem(BODY_PLAY_KEY_PREFIX + key) === '1'; } catch { return false; }
}

/** Remember the choice for this game (a store that throws is ignored: the choice just isn't remembered). */
export function writeBodyPlay(key: string, on: boolean, store: Setter | null = pageStorage()): void {
  try { store?.setItem(BODY_PLAY_KEY_PREFIX + key, on ? '1' : '0'); } catch { /* private mode, full: not remembered */ }
}

/** The running game's card, as much of it as the choice needs (sessionStore's SessionView). */
export interface BodyCard {
  modeId: string | null;
  drives: boolean;
  later: BodyProfile['later'];
}

/** 'play': the READY choice. 'coming': a later phase gives it body play (said, never offered). null: nothing said. */
export type BodyPlayOffer = 'play' | 'coming' | null;
const COMING_PHASES: ReadonlySet<BodyProfile['later']> = new Set(['P5', 'P6', 'P7', 'P8', 'P9']);

export function bodyPlayOffer(v: BodyCard): BodyPlayOffer {
  if (v.modeId === null) return null;
  if (v.drives) return 'play';
  return COMING_PHASES.has(v.later) ? 'coming' : null;
}

/**
 * What the header's Body button does now:
 *   end            the camera is on: turn it off
 *   none           no game is running: the card says to open one
 *   coming         the game does not offer body play and a phase will: the card says so — no camera
 *   unavailable    the game does not offer body play and no phase will (a quiz, a game with no plan yet) — no camera
 *   begin-paused   mid-play: pause first (the same START every host's pause sends), then the check over the pause
 *   begin          READY (or loading, paused, ended): start the camera and run the check on the game screen
 */
export type BodyButtonAction = 'begin' | 'begin-paused' | 'end' | 'coming' | 'unavailable' | 'none';

export function bodyButtonAction(v: BodyCard & { phase?: string | null }, cameraOn: boolean): BodyButtonAction {
  if (cameraOn) return 'end';
  if (v.modeId === null) return 'none';
  const offer = bodyPlayOffer(v);
  if (offer === 'coming') return 'coming';
  if (offer === null) return 'unavailable';
  return v.phase === 'playing' ? 'begin-paused' : 'begin';
}

// ── the kicks opt-in (movement play P7, 2026-09-25) ──────────────────────────────────────────────────────────────────
// Spin and jump kicks are OPT-IN (owner: behind the space check's clearance): offered on the READY screen only once the
// check passed, only for a combat game the body plays; off by default and remembered per game (fel-body-kicks-<key>).
export const BODY_KICKS_KEY_PREFIX = 'fel-body-kicks-';
export const KICKS_OPT_IN_LABEL = 'Spin and jump kicks — need 2 m clear all round';
/** The combat games whose body play reads kicks (their onBody). */
export const FIGHT_GAME_KEYS: ReadonlySet<string> = new Set(['karate_vs', 'mixedcombat', 'showdown', 'duel', 'karate']);

/** The player turned spin and jump kicks on for this game (absent, unreadable or throwing = off). */
export function readBodyKicks(key: string, store: Getter | null = pageStorage()): boolean {
  try { return store?.getItem(BODY_KICKS_KEY_PREFIX + key) === '1'; } catch { return false; }
}
export function writeBodyKicks(key: string, on: boolean, store: Setter | null = pageStorage()): void {
  try { store?.setItem(BODY_KICKS_KEY_PREFIX + key, on ? '1' : '0'); } catch { /* not remembered */ }
}
/** The opt-in is offered: a combat game the body plays, once the space check has passed ('ready'). */
export function kicksOptInOffer(v: BodyCard & { key: string | null }, spaceStage: string | null): boolean {
  return !!v.key && FIGHT_GAME_KEYS.has(v.key) && v.drives && spaceStage === 'ready';
}

/**
 * Train → Drills' wake-up (P9). The space check OFFERS it once the space is set ("2-minute wake-up first?"): the owner's
 * call, routed to the drills when they exist. There is no /play/drills route yet (P9 builds it and sets this), so it
 * is null and the offer is hidden.
 */
export const WARMUP_HREF: string | null = null;
export const WARMUP_LABEL = '2-minute wake-up first?';

/** The wake-up link to show, once the space is set and only if the drills exist. */
export function warmupOffer(stage: string | null, href: string | null = WARMUP_HREF): { href: string; label: string } | null {
  return stage === 'ready' && href ? { href, label: WARMUP_LABEL } : null;
}
