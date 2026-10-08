/**
 * The Adventure's input mapper (ADVENTURE PLAN A4, "Default controls (A4's mapper; every one rebindable)"):
 * FelInput events from the InputBus (pad, keyboard, touch, Controller Link) in, one MoveInput per fixed step out.
 * Pure: no Babylon, no DOM. The storage helpers at the bottom are the only side effects (try/catch, per viewer).
 *
 * HOW IT WORKS. `onInput(e)` keeps LEVELS (what is held now) and latches EDGES (what was pressed since the last step).
 * `fill(out, ctx)` writes a MoveInput for one step and clears the latched edges, so a press lands on exactly one step
 * however many steps a frame runs (two on a 30 fps phone). The same physical control can mean different things by
 * state, as the plan's table says: the L1 that guards on the ground descends in flight; A held ascends in flight.
 *
 * EVERY BINDING IS REBINDABLE: an action maps to a list of controls (`Bindings`), the defaults below follow the plan's
 * pad column, and `rebind(action, controls)` / `storeBindings` change them.
 *
 * THE KEYBOARD. The InputBus's key map is shared by every mode (core/InputBus KEYMAP), so the keyboard reaches this
 * mapper as the FelInput the bus makes of it: J = A, K = B, L = X, I = Y, Q = L1, E = R1, SHIFT = R1 (tagged 'key'),
 * F = L1 (tagged 'key'), R = R3, V = L3, SPACE = the R trigger's space marker, and the arrows double as the stick
 * (their d-pad copies, tagged 'key', are ignored here). The plan's keyboard column is honoured where the bus allows it:
 * SPACE jumps, SHIFT dashes, F casts, R is slow-time; and 1–4 are the d-pad (AdventureMode adds those four keys, which
 * no mode had bound). Where the bus has the key bound already, the bus wins: light / heavy are L / I (the plan asked for
 * J / K, which the bus sends as A / B = jump / dash), lock is E and guard Q (the plan had them the other way).
 */

import type { FelButton, FelInput } from '@/lib/babylon/core/InputBus';
import { KEY_SPACE_DOWN } from '@/lib/babylon/core/StartWake';
import { SPELL_SLOTS, type MoveInput, type MovementState } from '../contracts';

export const ADVENTURE_ACTIONS = [
  'jump', 'dash', 'light', 'heavy', 'lock', 'guard', 'cast', 'focus', 'partner', 'fuse', 'slotPrev', 'slotNext',
  'interact',
] as const;
export type AdventureAction = (typeof ADVENTURE_ACTIONS)[number];

/** One physical control. `src`: 'key' = only the keyboard's tagged copy, 'pad' = only an untagged one, absent = either. */
export type Control =
  | { kind: 'button'; btn: FelButton; src?: 'key' | 'pad' }
  | { kind: 'trigger'; side: 'L' | 'R' }
  | { kind: 'dpad'; dir: 'up' | 'down' | 'left' | 'right' }
  | { kind: 'space' };

export type Bindings = Record<AdventureAction, Control[]>;

const btn = (b: FelButton, src?: 'key' | 'pad'): Control => (src ? { kind: 'button', btn: b, src } : { kind: 'button', btn: b });

/**
 * The plan's pad column (A jump · B dash · X / Y light / heavy · R1 lock · L1 guard · R2 cast · L2 slow-time ·
 * D-pad up partner / down fuse-or-mount · D-pad left / right spell slot), plus the keyboard's tagged keys.
 * Owner decision (2026-10-06): D-pad DOWN is ONE button for fuse AND mount — fuse when the fusion meter is full or
 * already fused (then it unfuses), otherwise mount / dismount a rideable partner; D-pad UP is the partner command. A3's partner system consumes the press when it fuses or
 * unfuses; A1's riding reads it otherwise (and refuses to mount while the meter is full: movement/riding mountReason).
 */
export const DEFAULT_BINDINGS: Readonly<Bindings> = Object.freeze({
  jump: [btn('A', 'pad'), { kind: 'space' }],
  dash: [btn('B'), btn('R1', 'key')],
  light: [btn('X')],
  heavy: [btn('Y')],
  lock: [btn('R1', 'pad')],
  guard: [btn('L1', 'pad')],
  cast: [{ kind: 'trigger', side: 'R' }, btn('L1', 'key')],
  focus: [{ kind: 'trigger', side: 'L' }, btn('RS')],
  partner: [{ kind: 'dpad', dir: 'up' }],
  fuse: [{ kind: 'dpad', dir: 'down' }],
  slotPrev: [{ kind: 'dpad', dir: 'left' }],
  slotNext: [{ kind: 'dpad', dir: 'right' }],
  interact: [btn('LS')],
}) as Readonly<Bindings>;

/** A trigger counts as pressed past this. [TUNE] */
export const TRIGGER_ON = 0.5;
/** The keyboard keys AdventureMode turns into d-pad presses (none of them is in the shared bus map). */
export const DIGIT_DPAD: Readonly<Record<string, 'up' | 'down' | 'left' | 'right'>> = Object.freeze({ '1': 'up', '2': 'down', '3': 'left', '4': 'right' });

export interface FillContext {
  /** The camera's yaw (MoveInput.camYaw). */
  camYaw: number;
  /** The player's movement state: flight turns A held into ascend and L1 into descend. */
  state: MovementState;
  /** The save's setting: flight's stick y inverted. */
  invertFlightY?: boolean;
}

export interface InputMapper {
  onInput(e: FelInput): void;
  /** Write one step's MoveInput into `out` and clear the latched edges. */
  fill(out: MoveInput, ctx: FillContext): MoveInput;
  rebind(action: AdventureAction, controls: Control[]): void;
  bindings(): Readonly<Bindings>;
  /** The selected spell slot (0..3), as the HUD shows it. */
  slot(): number;
  /** Let go of everything (a pause, a blur): no held button survives it. */
  reset(): void;
}

const controlKey = (c: Control): string =>
  c.kind === 'button' ? `b:${c.btn}:${c.src ?? '*'}` : c.kind === 'trigger' ? `t:${c.side}` : c.kind === 'dpad' ? `d:${c.dir}` : 'space';

export function createInputMapper(o: { bindings?: Partial<Bindings> | null } = {}): InputMapper {
  const binds: Bindings = { ...DEFAULT_BINDINGS, ...(o.bindings ?? {}) } as Bindings;
  /** Held state per physical control id (button:btn:src, trigger, d-pad, space). */
  const held = new Set<string>();
  /** Actions pressed since the last fill. */
  const pressed = new Set<AdventureAction>();
  const stickL = { x: 0, y: 0 }, stickR = { x: 0, y: 0 };
  let trigL = 0, trigR = 0;
  let spaceHeld = false;
  let slot = 0;
  let pickSlot: number | null = null;

  /** Which actions a control drives (rebuilt on a rebind). */
  let byControl = new Map<string, AdventureAction[]>();
  const index = (): void => {
    byControl = new Map();
    for (const a of ADVENTURE_ACTIONS) {
      for (const c of binds[a] ?? []) {
        // a control bound without a src answers both a pad and a key copy: index both spellings
        const keys = c.kind === 'button' && !c.src ? [`b:${c.btn}:key`, `b:${c.btn}:pad`] : [controlKey(c)];
        for (const k of keys) { const l = byControl.get(k) ?? []; l.push(a); byControl.set(k, l); }
      }
    }
  };
  index();

  const isHeld = (a: AdventureAction): boolean => {
    for (const c of binds[a] ?? []) {
      if (c.kind === 'button') {
        if (c.src) { if (held.has(`b:${c.btn}:${c.src}`)) return true; }
        else if (held.has(`b:${c.btn}:key`) || held.has(`b:${c.btn}:pad`)) return true;
      } else if (c.kind === 'trigger') { if ((c.side === 'L' ? trigL : trigR) >= TRIGGER_ON) return true; }
      else if (c.kind === 'space') { if (spaceHeld) return true; }
      else if (held.has(controlKey(c))) return true;
    }
    return false;
  };

  /** A control went down or up: track it, and on the way down latch the actions it drives. */
  const set = (key: string, down: boolean): void => {
    const was = held.has(key);
    if (down) held.add(key); else held.delete(key);
    if (!down || was) return;
    for (const a of byControl.get(key) ?? []) pressed.add(a);
  };

  const dirSlot: Record<'up' | 'right' | 'down' | 'left', number> = { up: 0, right: 1, down: 2, left: 3 };

  return {
    onInput(e: FelInput): void {
      switch (e.t) {
        case 'stick': {
          const s = e.side === 'L' ? stickL : stickR;
          s.x = Number.isFinite(e.x) ? Math.max(-1, Math.min(1, e.x)) : 0;
          s.y = Number.isFinite(e.y) ? Math.max(-1, Math.min(1, e.y)) : 0;
          return;
        }
        case 'button': {
          if (e.src === 'space') return;   // SPACE's release A: the jump already happened on the space-down marker
          if (e.src === 'body') return;    // the body floor's verbs are the Mirror's (onBody), never a button here
          set(`b:${e.btn}:${e.src === 'key' ? 'key' : 'pad'}`, e.pressed);
          return;
        }
        case 'trigger': {
          if (e.side === 'R' && (e.value === KEY_SPACE_DOWN || spaceHeld)) {
            // the keyboard's SPACE rides the R trigger: its down marker, then a held depth, then 0 on release
            const down = e.value > 0;
            if (down && !spaceHeld) { spaceHeld = true; for (const a of byControl.get('space') ?? []) pressed.add(a); }
            else if (!down) spaceHeld = false;
            return;
          }
          const v = Number.isFinite(e.value) ? Math.max(0, Math.min(1, e.value)) : 0;
          const key = `t:${e.side}`;
          if (e.side === 'L') trigL = v; else trigR = v;
          set(key, v >= TRIGGER_ON);
          return;
        }
        case 'dpad': {
          if (e.src === 'key') return;     // the arrows are the stick here; 1–4 are the keyboard's d-pad
          // R2 held + a direction picks that slot directly ("cast; with D-pad = pick slot") and does nothing else
          if (e.pressed && isHeld('cast')) { pickSlot = dirSlot[e.dir]; held.add(`d:${e.dir}:pick`); return; }
          if (!e.pressed && held.has(`d:${e.dir}:pick`)) { held.delete(`d:${e.dir}:pick`); return; }
          set(`d:${e.dir}`, e.pressed);
          return;
        }
      }
    },

    fill(out: MoveInput, ctx: FillContext): MoveInput {
      const flying = ctx.state === 'flight';
      const invert = flying && ctx.invertFlightY ? -1 : 1;
      out.move.x = stickL.x;
      out.move.y = -stickL.y * invert;    // the bus's y is down-positive; MoveInput's +y is away from the camera
      out.camYaw = Number.isFinite(ctx.camYaw) ? ctx.camYaw : 0;
      out.look.x = stickR.x; out.look.y = stickR.y;
      out.jump = pressed.has('jump');
      out.jumpHeld = isHeld('jump');
      out.dash = pressed.has('dash');
      out.dashHeld = isHeld('dash');
      out.attackLight = pressed.has('light');
      out.attackHeavy = pressed.has('heavy');
      out.lock = pressed.has('lock');
      out.magic = pressed.has('cast');
      out.magicHeld = isHeld('cast');
      out.focusHeld = isHeld('focus');
      out.partner = pressed.has('partner');
      out.fuse = pressed.has('fuse');
      out.interactHeld = isHeld('interact');
      // flight: A held climbs and L1 held descends (the guard's button); on foot, L1 is the guard
      const l1 = isHeld('guard');
      out.ascendHeld = flying && out.jumpHeld;
      out.descendHeld = flying && l1;
      out.guardHeld = !flying && l1;
      out.lean = 0;   // A1 reads the rail lean and the flight bank off the stick (movement/input leanOf)
      // the spell slot: a direct pick (R2 + d-pad), else a step from left / right
      let next: number | null = null;
      if (pickSlot !== null) next = pickSlot;
      else if (pressed.has('slotNext')) next = (slot + 1) % SPELL_SLOTS;
      else if (pressed.has('slotPrev')) next = (slot + SPELL_SLOTS - 1) % SPELL_SLOTS;
      if (next !== null) slot = next;
      out.magicSlot = next;
      pickSlot = null;
      pressed.clear();
      return out;
    },

    rebind(action, controls) {
      if (!(ADVENTURE_ACTIONS as readonly string[]).includes(action)) return;
      binds[action] = sanitizeControls(controls);
      index();
    },
    bindings: () => binds,
    slot: () => slot,
    reset(): void {
      held.clear(); pressed.clear();
      stickL.x = stickL.y = stickR.x = stickR.y = 0;
      trigL = trigR = 0; spaceHeld = false; pickSlot = null;
    },
  };
}

// ── Rebinding storage (per viewer, per device: a convenience, never required) ─────────────────────────────────────

export const BINDINGS_KEY = 'fel.adventure.bindings.v1';
const BUTTONS: readonly FelButton[] = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'SELECT', 'START', 'LS', 'RS'];

/** Keep only well-formed controls (a stored binding is untrusted). */
export function sanitizeControls(v: unknown): Control[] {
  if (!Array.isArray(v)) return [];
  const out: Control[] = [];
  for (const c of v.slice(0, 6)) {
    if (!c || typeof c !== 'object') continue;
    const r = c as Record<string, unknown>;
    if (r.kind === 'button' && BUTTONS.includes(r.btn as FelButton) && r.btn !== 'START') {
      out.push(r.src === 'key' || r.src === 'pad' ? { kind: 'button', btn: r.btn as FelButton, src: r.src } : { kind: 'button', btn: r.btn as FelButton });
    } else if (r.kind === 'trigger' && (r.side === 'L' || r.side === 'R')) out.push({ kind: 'trigger', side: r.side });
    else if (r.kind === 'dpad' && ['up', 'down', 'left', 'right'].includes(r.dir as string)) out.push({ kind: 'dpad', dir: r.dir as 'up' });
    else if (r.kind === 'space') out.push({ kind: 'space' });
  }
  return out;
}

export interface BindingStorage { getItem(k: string): string | null; setItem(k: string, v: string): void }

function storage(): BindingStorage | null {
  try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null; } catch { return null; }
}

/** The stored rebinds (only the actions that differ), or null. Junk is dropped, never thrown. */
export function loadBindings(store: BindingStorage | null = storage()): Partial<Bindings> | null {
  if (!store) return null;
  try {
    const raw = store.getItem(BINDINGS_KEY);
    if (!raw || raw.length > 8192) return null;
    const j = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<Bindings> = {};
    for (const a of ADVENTURE_ACTIONS) if (a in j) { const c = sanitizeControls(j[a]); if (c.length) out[a] = c; }
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}

export function storeBindings(b: Partial<Bindings>, store: BindingStorage | null = storage()): boolean {
  if (!store) return false;
  try { store.setItem(BINDINGS_KEY, JSON.stringify(b)); return true; } catch { return false; }
}

/** The controls screen's rows for the shipped map (what pad, keyboard and touch press for each action). */
export const CONTROLS_SHEET: readonly { action: string; pad: string; keys: string; touch: string }[] = [
  { action: 'RUN / STEER / LEAN', pad: 'L STICK', keys: 'WASD · ARROWS', touch: 'STICK' },
  { action: 'JUMP · HOMING DASH (AIR) · HOP / SWITCH (RAIL) · CLIMB (FLIGHT)', pad: 'A', keys: 'SPACE · J', touch: 'JUMP' },
  { action: 'DASH · HOLD SPRINT · DODGE (LOCKED) · DOUBLE-TAP HOMING DASH · BURST / HOLD CRUISE (FLIGHT)', pad: 'B', keys: 'SHIFT · K', touch: 'DASH' },
  { action: 'LIGHT / HEAVY · TRICK (RAIL)', pad: 'X / Y', keys: 'L / I', touch: 'LIGHT / HEAVY' },
  { action: 'LOCK ON / OFF · FLICK R STICK TO SWITCH', pad: 'R1', keys: 'E', touch: 'RADIAL · LOCK' },
  { action: 'GUARD · PARRY ON THE PRESS · DESCEND (FLIGHT)', pad: 'L1', keys: 'Q', touch: 'RADIAL · GUARD' },
  { action: 'CAST · HOLD + D-PAD PICKS A SLOT', pad: 'R2', keys: 'F', touch: 'RADIAL · CAST' },
  { action: 'SLOW-TIME (HELD)', pad: 'L2 · R3', keys: 'R', touch: 'RADIAL · SLOW' },
  { action: 'PARTNER COMMAND', pad: 'D-PAD ▲', keys: '1', touch: 'RADIAL · PARTNER' },
  { action: 'FUSE / UNFUSE (METER FULL) · ELSE MOUNT / DISMOUNT', pad: 'D-PAD ▼', keys: '2', touch: 'RADIAL · FUSE' },
  { action: 'SPELL SLOT ◀ ▶', pad: 'D-PAD ◀ ▶', keys: '3 / 4', touch: 'D-PAD ◀ ▶' },
  { action: 'CAMERA', pad: 'R STICK', keys: '—', touch: 'R STICK' },
];
