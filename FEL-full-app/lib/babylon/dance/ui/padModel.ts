// padModel — THE CYPHER'S PHONE PAD, as data (lane/dance-extras, 2026-10-14; owner: "all four wanted, redesigned for MATCH").
//
// WHAT WAS THERE. The dance room's touch deck was TouchOverlay's whole generic rig — two thumbsticks, a d-pad and a button
// diamond whose four verbs were labelled "TAP / B / X / Y" (modeVerbs.ts). Every verb was technically on the glass (A and B
// tap; in MATCH X and Y do too; a freeze is held by keeping the finger down; ▲ ▼ ◀ ▶ and Y drive the pick screen), but a
// player could not tell: nothing said which button is which move family, nothing said Y toggles MATCH on the pick screen, and
// the two sticks (which the room never reads: modeVerbs `rStick: null`, and the L stick does nothing in a song) sat over the
// picture. In a 374 x 234 portrait stage that rig covers the lane's hit ring.
//
// WHAT THIS IS. The same verbs and nothing else: every press this pad makes is the FelInput MODE_VERBS.dance already
// names (`{t:'button', btn:'A'|'B'|'X'|'Y', pressed}` — the exact event a gamepad's face button and the keyboard's J K L I
// send), every release is `{...press, pressed:false}` (so a freeze is held for as long as the finger is down, exactly as a
// held pad button), and the pick screen's ◀ ▶ ▲ ▼ are the d-pad's own events. It judges nothing, adds no window, and
// reaches no code but InputBus: DanceMode.onInput cannot tell a thumb from a pad. padModel.test.ts holds all of that.
//
// WHAT IT ADDS IS ONLY WHAT THE PLAYER SEES: the four buttons are split into two thumb pairs (A B under the left thumb,
// X Y under the right — the lane and the dancer keep the middle), each named for the MATCH family it carries (derived from
// chartPlay.FAMILY_BUTTON, so a re-mapped family re-labels the pad), in the TV HUD's palette; on the pick screen the same
// buttons are START and MATCH on/off and the d-pad strip appears; inside a freestyle section (dance/freestyle.ts) each
// carries the move it will dance.
import type { FelInput } from '../../core/InputBus';
import { MODE_VERBS } from '../../ui/modeVerbs';
import { FAMILY_BUTTON } from '../chartPlay';
import type { DanceClip } from '../../core/DanceCore';

export type PadSlot = 'A' | 'B' | 'X' | 'Y';
/** Left thumb, then right thumb — the order buttons sit on the glass. */
export const PAD_LEFT: readonly PadSlot[] = ['A', 'B'];
export const PAD_RIGHT: readonly PadSlot[] = ['X', 'Y'];
export const PAD_SLOTS: readonly PadSlot[] = [...PAD_LEFT, ...PAD_RIGHT];

/**
 * What the pad is for right now (the room publishes it through padStore, DanceMode.publishPad):
 *   'pick'  the pick screen — ◀ ▶ browse, ▲ ▼ the level, A / B start, Y toggles MATCH (X toggles FREE DANCE where it is offered);
 *   'any'   a song with MATCH off — A and B tap (the room reads A or B), X and Y do nothing, so they are drawn hollow;
 *   'match' a song with MATCH on — every button is a tap and the family it carries matters;
 *   'free'  inside a FREESTYLE section — every button dances the move it names, MATCH is not asked.
 * Anything else (no key yet, junk) is 'any', the state that asks the least of the player.
 */
export type DancePadMode = 'pick' | 'any' | 'match' | 'free';
export const DANCE_PAD_MODES: readonly DancePadMode[] = ['pick', 'any', 'match', 'free'];

export interface DancePadState {
  mode: DancePadMode;
  /** The pick screen: is MATCH on (Y reads "MATCH ON" / "MATCH OFF"). */
  matchOn: boolean;
  /** 'free' only: the move each button will dance on its next press (its name is what the button prints). */
  free: Partial<Record<PadSlot, string>>;
  /**
   * lane/dance-extras-2: the pick screen's FREE DANCE switch on X (dance/freeDance.ts) — on, off, or null where free dance is not
   * offered (an Arena duel, a challenge, the ladder, a head-to-head chart: freeDanceBlock), when X stays an empty socket.
   */
  freeDance: boolean | null;
}

export const DEFAULT_PAD_STATE: DancePadState = { mode: 'any', matchOn: false, free: {}, freeDance: null };

/** The pick screen's X, by the free-dance switch (lane/dance-extras-2). */
export const FREE_DANCE_LABEL = { on: 'FREE ON', off: 'FREE OFF' } as const;

// ── what each button carries ─────────────────────────────────────────────────────────────────────────────────────────

/** The family names the pad prints (the lane prints the clip's own name; this is the family it belongs to). */
export const FAMILY_LABEL: Record<DanceClip['category'], string> = {
  toprock: 'TOP ROCK', bounce: 'BOUNCE', footwork: 'FOOTWORK', power: 'POWER', wave: 'WAVE', transition: 'SPIN', freeze: 'FREEZE',
};

/** A freeze is held through its beats: the button that carries it says so (chartPlay #13). */
export const HOLD_LABEL = 'HOLD';

/** The families a button carries in MATCH, from the one map the judge uses (chartPlay.FAMILY_BUTTON). */
export function familiesOf(slot: PadSlot): DanceClip['category'][] {
  return (Object.keys(FAMILY_BUTTON) as DanceClip['category'][]).filter((f) => FAMILY_BUTTON[f] === slot);
}

export interface PadButton {
  slot: PadSlot;
  /** The big print. */
  label: string;
  /** The small print under it. */
  sub: string;
  /** false = an empty socket (drawn hollow, cannot be pressed). */
  live: boolean;
  /** The slot colour (modeVerbs: A cyan, B ember, X violet, Y gold — the same on every mode's pad). */
  color: string;
  /** What a touch down sends (null when not live) — MODE_VERBS.dance's own event for the slot. */
  down: FelInput | null;
  /** What a lift sends: the same event, released. */
  up: FelInput | null;
}

const SLOT_INDEX: Record<PadSlot, number> = { A: 0, B: 1, X: 2, Y: 3 };

/** The verb the room's registry names for a slot (the pad never invents an event). */
export function verbFor(slot: PadSlot): { color: string; down: FelInput } {
  const v = MODE_VERBS.dance.buttons[SLOT_INDEX[slot]];
  return { color: v.color, down: v.emit as FelInput };
}

/** The pad's four buttons for a state, left thumb first. Pure. */
export function padButtons(state: DancePadState): PadButton[] {
  return PAD_SLOTS.map((slot): PadButton => {
    const { color, down } = verbFor(slot);
    const press = (label: string, sub: string): PadButton => ({ slot, label, sub, live: true, color, down, up: { ...down, pressed: false } as FelInput });
    const socket: PadButton = { slot, label: '', sub: '', live: false, color, down: null, up: null };
    switch (state.mode) {
      case 'pick':
        if (slot === 'A' || slot === 'B') return press('START', slot);
        if (slot === 'Y') return press(state.matchOn ? 'MATCH ON' : 'MATCH OFF', 'Y');
        // lane/dance-extras-2: X switches FREE DANCE where it is offered; anywhere else X does nothing on the pick screen
        if (slot === 'X' && state.freeDance !== null && state.freeDance !== undefined) return press(state.freeDance ? FREE_DANCE_LABEL.on : FREE_DANCE_LABEL.off, 'X');
        return socket;
      case 'match':
        return press(slot, [...familiesOf(slot).map((f) => FAMILY_LABEL[f]), ...(familiesOf(slot).includes('freeze') ? [HOLD_LABEL] : [])].join(' · '));
      case 'free':
        return press(state.free[slot] ?? slot, slot);
      default:   // 'any': A and B tap, X and Y are not read during a song
        return slot === 'A' || slot === 'B' ? press('TAP', slot) : socket;
    }
  });
}

/** The pick screen's strip: the d-pad events the room reads there (DanceMode.onInput, phase 'pick'). */
export interface PickKey { dir: 'left' | 'right' | 'up' | 'down'; glyph: string; label: string }
export const PICK_KEYS: readonly PickKey[] = [
  { dir: 'left', glyph: '◀', label: 'SONG' },
  { dir: 'right', glyph: '▶', label: 'SONG' },
  { dir: 'down', glyph: '▼', label: 'LEVEL' },
  { dir: 'up', glyph: '▲', label: 'LEVEL' },
];
export const pickEvent = (dir: PickKey['dir'], pressed: boolean): FelInput => ({ t: 'dpad', dir, pressed });

// ── geometry (design px, before the stage's own fit scale) ───────────────────────────────────────────────────────────

/**
 * A button's box in each deck layout (design px). The pairs are split so a thumb rests on each, which leaves the middle of
 * the stage — the dancer and the lane's hit ring — clear; a button is wide enough to print its family under the letter.
 * Portrait is the 374 x 234 box a phone's 16:10 stage makes (TouchOverlay.fitDeck scales it into what is visible).
 */
export const PAD_BUTTON = {
  portrait: { w: 76, h: 56 },
  landscape: { w: 96, h: 64 },
  compact: { w: 88, h: 60 },
} as const;
export type PadDeck = keyof typeof PAD_BUTTON;
export const PAD_GAP_PX = 8;
export const PAD_MARGIN_PX = 12;
/** The pick screen's keys (◀ ▶ SONG above the left pair, ▼ ▲ LEVEL above the right), pick screen only. */
export const PICK_KEY = { w: 44, h: 40 } as const;
/**
 * The host's control-hint line (the pick screen's "◀ ▶ TRACK · ▲ ▼ LEVEL · Y MATCH · A START", components/games/timing-prompt) is drawn
 * about 64 px up the stage and ~24 px tall, centred. On a portrait stage the two key pairs sit in the corners of its width and
 * would clip its ends, so the pick keys ride this far higher there (measured on the real room: the keys ended 11 px into the line);
 * sideways the line sits above nothing and the keys clear it as they are.
 */
export const PICK_RAISE_PX: Record<PadDeck, number> = { portrait: 28, compact: 0, landscape: 0 };

export interface Rect { x: number; y: number; w: number; h: number }
export const rectArea = (r: Rect): number => Math.max(0, r.w) * Math.max(0, r.h);
export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Where the pad's two thumb pairs sit in a stage `w` x `h` (stage coordinates, y down), for a deck layout, with no
 * safe-area inset and no fit scale. The pairs sit in the bottom corners; nothing is drawn between them in a song. On the
 * pick screen the two key pairs add `pick` rects above them.
 */
export function padRects(w: number, h: number, deck: PadDeck): { left: Rect; right: Rect; pickLeft: Rect; pickRight: Rect } {
  const b = PAD_BUTTON[deck];
  const pw = 2 * b.w + PAD_GAP_PX;
  const y = h - PAD_MARGIN_PX - b.h;
  const kw = 2 * PICK_KEY.w + PAD_GAP_PX;
  const ky = y - PAD_GAP_PX - PICK_KEY.h - PICK_RAISE_PX[deck];
  return {
    left: { x: PAD_MARGIN_PX, y, w: pw, h: b.h },
    right: { x: w - PAD_MARGIN_PX - pw, y, w: pw, h: b.h },
    pickLeft: { x: PAD_MARGIN_PX, y: ky, w: kw, h: PICK_KEY.h },
    pickRight: { x: w - PAD_MARGIN_PX - kw, y: ky, w: kw, h: PICK_KEY.h },
  };
}
