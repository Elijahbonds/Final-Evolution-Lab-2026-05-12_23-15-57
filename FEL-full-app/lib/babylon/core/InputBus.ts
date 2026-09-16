// InputBus — every input source (keyboard, touch overlay, Gamepad API) emits the
// same normalized FelInput events. Game logic ONLY subscribes here.

export type FelInput =
  | { t: 'stick'; side: 'L' | 'R'; x: number; y: number }
  /** `src: 'key'` marks a keyboard ARROW: the arrows also drive the L stick (see onKey), so a mode whose d-pad
   *  means something else on the runway (the dunk's PROP) must skip keyboard d-pad presses — pad buttons 12–15,
   *  the touch d-pad and Controller Link carry no src and stay the real d-pad. */
  | { t: 'dpad'; dir: 'up' | 'down' | 'left' | 'right'; pressed: boolean; src?: 'key' }
  | { t: 'button'; btn: 'A' | 'B' | 'X' | 'Y' | 'L1' | 'R1' | 'SELECT' | 'START'; pressed: boolean }
  | { t: 'trigger'; side: 'L' | 'R'; value: number };

import { HAPTIC } from '../premium/Haptics';
import { KEY_SPACE_DOWN } from './StartWake';   // the space-down marker the READY gate wakes on
// Input & Presence Phase A: the pad is read through a PROFILE now. Everything below keeps its FelInput
// contract exactly — no mode file and no existing test changes — but the indices it reads are the profile's
// rather than a hardcoded Standard Gamepad table, and the stick deadzone is radial instead of per-axis.
import { profileFor, readPad, supportCheck, type CanonicalPad, type ControllerProfile } from '@/lib/input/profiles';
import { applyRemap, readRemap } from '@/lib/input/remap';
import { MAX_SLOTS } from '@/lib/input/PlayerSlots';
import { mergePads } from '@/lib/input/padMerge';

type Listener = (e: FelInput) => void;
type SlotListener = (e: FelInput, slot: number) => void;
type FelButton = 'A' | 'B' | 'X' | 'Y' | 'L1' | 'R1' | 'SELECT' | 'START';
type PadDirName = 'up' | 'down' | 'left' | 'right';
const FEL_BUTTONS: readonly FelButton[] = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'SELECT', 'START'];
const DPAD_DIRS: readonly PadDirName[] = ['up', 'down', 'left', 'right'];

/** One connected local pad, as the connect chips show it: `P{slot + 1} {name}`. */
export interface PadInfo {
  slot: number;
  /** The browser's gamepad index (not the player number). */
  index: number;
  id: string;
  profileId: string;
  name: string;
  /** The profile's own "does not work on this device" reason (the Switch 2 Pro on iOS), or null. */
  unsupported: string | null;
}
type PadsListener = (pads: PadInfo[]) => void;
/** One seated pad as it reads THIS frame (CONTROLLER-STICK-LIVE): what a probe polls to see a stick move. */
export interface PadState extends PadInfo {
  lx: number; ly: number; rx: number; ry: number;
  triggers: { L: number; R: number };
  /** FEL buttons and d-pad directions (`dpad_up` …) held right now. */
  held: string[];
}
interface HeldPad {
  index: number;
  id: string;
  profile: ControllerProfile;
  /** This frame's canonical read, kept whether or not anyone subscribes to the slot stream. */
  canon: CanonicalPad | null;
  lastL: { x: number; y: number } | null;
  lastR: { x: number; y: number } | null;
  trigL: number;
  trigR: number;
  held: Set<string>;
}

const KEYMAP: Record<string, FelInput> = {
  j: { t: 'button', btn: 'A', pressed: true },
  k: { t: 'button', btn: 'B', pressed: true },
  l: { t: 'button', btn: 'X', pressed: true },
  i: { t: 'button', btn: 'Y', pressed: true },
  q: { t: 'button', btn: 'L1', pressed: true },
  e: { t: 'button', btn: 'R1', pressed: true },
  // BOOST (FINISH-RELEASE, 2026-09-14): Shift is the keyboard's boost — the shared held R1 every speed mode burns on.
  shift: { t: 'button', btn: 'R1', pressed: true },
  c: { t: 'button', btn: 'SELECT', pressed: true },
  escape: { t: 'button', btn: 'START', pressed: true },
};
// Dunk keyboard hotfix (2026-09-07): the ARROWS are the L stick too. They were d-pad only, so on a mode whose d-pad
// is a picker (the dunk's PROP) ArrowUp cycled the prop instead of running at the rim while W ran — players use the
// arrows exactly like WASD. Held arrows and WASD sum into ONE L-stick vector (up = −y on every source); the arrows
// ALSO keep emitting their d-pad press/release tagged `src: 'key'`, because eleven keyboard surfaces read the arrow
// d-pad (the sprint masher, the quiz answers, the penalty dive, the pre-run pickers, the dunk's mid-air trick
// direction) and none of them may lose it. A mode that has both a stick and a d-pad picker skips `src === 'key'`.
const WASD = new Set(['w', 'a', 's', 'd']);
const ARROWS: Record<string, 'up' | 'down' | 'left' | 'right'> = { arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right' };

export class InputBus {
  private listeners = new Set<Listener>();
  private slotListeners = new Set<SlotListener>();
  private padListeners = new Set<PadsListener>();
  private held = new Set<string>();
  private raf = 0;
  /** Space doubles as R-trigger analog (hold-depth) for charge mechanics. */
  private spaceDownAt = 0;
  /** True while ANY local pad is held (the touch overlay hides on it). */
  public gamepadActive = false;

  start(): void {
    // IDEMPOTENT (2026-09-15). A second start() on the same bus left the FIRST pollPads chain running: two poll loops, two
    // emits a frame, and — measured on football — a HELD trigger arriving as 1, 0, 1, 0 at ~17 Hz, which downstream reads
    // as seventeen presses a second (35 "presses" from one 2 s hold). Stop whatever is already running first.
    this.stop();
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('gamepadconnected', this.onPad);
    window.addEventListener('gamepaddisconnected', this.onPadOff);
    this.syncPads(this.readPads());   // a pad plugged in BEFORE this page loaded never fires gamepadconnected — take it now
    this.pollPads();
  }
  stop(): void {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('gamepadconnected', this.onPad);
    window.removeEventListener('gamepaddisconnected', this.onPadOff);
    cancelAnimationFrame(this.raf);
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(e: FelInput): void {                        // touch overlay calls this directly
    if (e.t === 'button' && e.pressed) HAPTIC.tap();  // 10ms button-down buzz (throttled in Haptics) //TUNE(elijah)
    this.listeners.forEach((fn) => fn(e));
  }

  /**
   * The SLOT-TAGGED stream (CONTROLLER-UNIVERSAL-MULTI): every local pad as its own player, slot 0 = P1 … 3 = P4.
   * A multi-local mode subscribes HERE and ignores `on()` — `on()` carries every pad merged into one hero (padMerge)
   * plus the keyboard and the touch overlay, which is what every single-player mode wants.
   */
  onSlot(fn: SlotListener): () => void {
    this.slotListeners.add(fn);
    return () => this.slotListeners.delete(fn);
  }
  /** Feed one player's event from outside the local pads (a Controller Link relay, a test). */
  emitSlot(slot: number, e: FelInput): void {
    this.slotListeners.forEach((fn) => fn(e, slot));
  }
  /** The connected pads, for the connect chips. Called with the current roster at once, then on every change. */
  onPads(fn: PadsListener): () => void {
    this.padListeners.add(fn);
    fn(this.pads());
    return () => this.padListeners.delete(fn);
  }
  pads(): PadInfo[] {
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent ?? '';
    const out: PadInfo[] = [];
    this.slots.forEach((s, slot) => {
      if (!s) return;
      const support = supportCheck(s.profile, ua);
      out.push({ slot, index: s.index, id: s.id, profileId: s.profile.id, name: s.profile.name, unsupported: support.ok ? null : support.why });
    });
    return out;
  }
  /**
   * The seated pads WITH their live reading (CONTROLLER-STICK-LIVE, 2026-09-14). A QA eye polls this through
   * `__FEL_DEV__.input` on a production build: a chip with a stick that reads non-zero on a push is a pad that
   * drives the game, where `pads()` alone only proves the chip. Empty until the harness starts the bus (after load).
   */
  padState(): PadState[] {
    return this.pads().map((p) => {
      const c = this.slots[p.slot]?.canon;
      const held = c ? [...FEL_BUTTONS.filter((b) => c.buttons[b]), ...DPAD_DIRS.filter((d) => c.dpad[d]).map((d) => `dpad_${d}`)] : [];
      return { ...p, lx: c?.lx ?? 0, ly: c?.ly ?? 0, rx: c?.rx ?? 0, ry: c?.ry ?? 0, triggers: { L: c?.triggers.L ?? 0, R: c?.triggers.R ?? 0 }, held };
    });
  }

  private onKey = (ev: KeyboardEvent): void => {
    const key = ev.key.toLowerCase();
    const down = ev.type === 'keydown';
    if (down && this.held.has(key)) return;        // no key-repeat spam
    down ? this.held.add(key) : this.held.delete(key);

    const arrow = ARROWS[key];
    if (WASD.has(key) || arrow) {
      if (arrow) ev.preventDefault();   // a held arrow must not scroll the /try page under the canvas
      const h = (k: string) => (this.held.has(k) ? 1 : 0);
      const x = Math.max(-1, Math.min(1, h('d') + h('arrowright') - h('a') - h('arrowleft')));
      const y = Math.max(-1, Math.min(1, h('s') + h('arrowdown') - h('w') - h('arrowup')));
      this.emit({ t: 'stick', side: 'L', x, y });
      if (arrow) this.emit({ t: 'dpad', dir: arrow, pressed: down, src: 'key' });
      return;
    }
    if (key === ' ') {
      if (down) { this.spaceDownAt = performance.now(); this.emit({ t: 'trigger', side: 'R', value: KEY_SPACE_DOWN }); }
      else { this.emit({ t: 'trigger', side: 'R', value: 0 }); this.emit({ t: 'button', btn: 'A', pressed: true }); }
      return;
    }
    const mapped = KEYMAP[key];
    if (mapped) this.emit({ ...mapped, pressed: down } as FelInput);
  };

  // ── Gamepad adoption (DUNK-LIVE-INPUT-FAIL, 2026-09-07) ──
  // ROOT CAUSE of the live /try FAIL (L stick dead, R look dead, arms frozen, hero back-facing): the pad was adopted
  // ONLY on `gamepadconnected`, and a DualShock that was already plugged in when the page loaded never fires it —
  // the browser only raises the event for a pad that connects (or first reports a button press) AFTER the listener
  // is registered. So start() scans `navigator.getGamepads()`, and pollPads re-scans EVERY frame (Chrome fills the
  // slot only on the first button press — the scan catches it the frame it appears, and catches a re-plug after a
  // disconnect); a slot that goes null / `connected === false` without an event is dropped the same way.
  // `getGamepads()` is guarded — it throws in a document whose permissions policy denies the Gamepad API.
  //
  // ── FOUR PADS (CONTROLLER-UNIVERSAL-MULTI, 2026-09-14) ──
  // The bus held exactly ONE pad, so a second DualSense / Switch Pro in the room was invisible. Now every live
  // gamepad takes the lowest free player slot (the first pad is P1) and keeps it until it leaves — slots are NOT
  // compacted, so P2 stays P2 when P1's battery dies. Each pad is read through its OWN profile. Two streams:
  //   • on()      — all pads merged (padMerge: furthest push / deepest pull / any-held), plus keyboard and touch.
  //                 With one pad this is byte-for-byte the old single-pad stream.
  //   • onSlot()  — each pad's own edges tagged with its slot, for a mode that seats more than one player.
  private slots: (HeldPad | null)[] = Array.from({ length: MAX_SLOTS }, () => null);
  private onPad = (): void => { this.syncPads(this.readPads()); };
  private onPadOff = (): void => { this.syncPads(this.readPads()); };
  private readPads(): ReadonlyArray<Gamepad | null> {
    try { return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []; }
    catch { return []; }
  }
  /** Drop pads that left, seat pads that arrived. Returns the live Gamepad per held slot. */
  private syncPads(list: ReadonlyArray<Gamepad | null>): (Gamepad | null)[] {
    const live = new Map<number, Gamepad>();
    list.forEach((p, i) => { if (p && p.connected !== false) live.set(p.index ?? i, p); });
    let changed = false;
    this.slots.forEach((s, slot) => {
      if (s && !live.has(s.index)) { this.dropSlot(slot); changed = true; }
    });
    for (const [index, pad] of live) {
      if (this.slots.some((s) => s?.index === index)) continue;
      const free = this.slots.findIndex((s) => s === null);
      if (free < 0) break;                            // four players is the couch
      const profile = profileFor(pad);
      this.slots[free] = { index, id: pad.id || 'gamepad', profile, canon: null, lastL: null, lastR: null, trigL: -1, trigR: -1, held: new Set() };
      console.info(`[PAD] P${free + 1} adopted slot ${index}: ${pad.id || 'gamepad'} → profile "${profile.id}" (mapping ${pad.mapping || 'none'})`);
      changed = true;
    }
    this.gamepadActive = this.slots.some((s) => s !== null);
    if (changed) { const roster = this.pads(); this.padListeners.forEach((fn) => fn(roster)); }
    return this.slots.map((s) => (s ? live.get(s.index) ?? null : null));
  }
  /** A pad left: release everything IT was holding on its own slot stream. The merged stream re-derives next read. */
  private dropSlot(slot: number): void {
    const s = this.slots[slot];
    if (!s) return;
    this.slots[slot] = null;
    // a pad yanked mid-push must not leave its last stick / trigger / button latched in a multi-local mode
    if (s.lastL && (s.lastL.x !== 0 || s.lastL.y !== 0)) this.emitSlot(slot, { t: 'stick', side: 'L', x: 0, y: 0 });
    if (s.lastR && (s.lastR.x !== 0 || s.lastR.y !== 0)) this.emitSlot(slot, { t: 'stick', side: 'R', x: 0, y: 0 });
    if (s.trigL > 0) this.emitSlot(slot, { t: 'trigger', side: 'L', value: 0 });
    if (s.trigR > 0) this.emitSlot(slot, { t: 'trigger', side: 'R', value: 0 });
    for (const k of s.held) {
      if (k.startsWith('dpad_')) this.emitSlot(slot, { t: 'dpad', dir: k.slice(5) as PadDirName, pressed: false });
      else this.emitSlot(slot, { t: 'button', btn: k as FelButton, pressed: false });
    }
    console.info(`[PAD] P${slot + 1} dropped slot ${s.index}`);
  }
  // The MERGED pad's sticks are emitted ON CHANGE, like the keyboard's — a centred pad that emitted (0, 0) every
  // frame overwrote a held W / ArrowUp on every mode that keeps the last stick (all of them), so with a pad plugged in
  // the keyboard could never move the hero. Last writer wins between the two, exactly as before for two keyboards.
  private lastL: { x: number; y: number } | null = null;
  private lastR: { x: number; y: number } | null = null;
  /** The merged stream had at least one pad last frame. */
  private mergedLive = false;
  private emitStick(side: 'L' | 'R', x: number, y: number): void {
    const last = side === 'L' ? this.lastL : this.lastR;
    if (last && last.x === x && last.y === y) return;
    if (side === 'L') this.lastL = { x, y }; else this.lastR = { x, y };
    this.emit({ t: 'stick', side, x, y });
  }
  /** One pad's own edges on the slot stream: sticks and triggers on change, buttons on press / release. */
  private emitSlotPad(slot: number, s: HeldPad, c: CanonicalPad): void {
    if (!s.lastL || s.lastL.x !== c.lx || s.lastL.y !== c.ly) { s.lastL = { x: c.lx, y: c.ly }; this.emitSlot(slot, { t: 'stick', side: 'L', x: c.lx, y: c.ly }); }
    if (!s.lastR || s.lastR.x !== c.rx || s.lastR.y !== c.ry) { s.lastR = { x: c.rx, y: c.ry }; this.emitSlot(slot, { t: 'stick', side: 'R', x: c.rx, y: c.ry }); }
    if (s.trigL !== c.triggers.L) { s.trigL = c.triggers.L; this.emitSlot(slot, { t: 'trigger', side: 'L', value: c.triggers.L }); }
    if (s.trigR !== c.triggers.R) { s.trigR = c.triggers.R; this.emitSlot(slot, { t: 'trigger', side: 'R', value: c.triggers.R }); }
    for (const dir of DPAD_DIRS) {
      const key = `dpad_${dir}`, pressed = c.dpad[dir];
      if (pressed !== s.held.has(key)) { pressed ? s.held.add(key) : s.held.delete(key); this.emitSlot(slot, { t: 'dpad', dir, pressed }); }
    }
    for (const btn of FEL_BUTTONS) {
      const pressed = c.buttons[btn];
      if (pressed !== s.held.has(btn)) { pressed ? s.held.add(btn) : s.held.delete(btn); this.emitSlot(slot, { t: 'button', btn, pressed }); }
    }
  }

  private pollPads = (): void => {
    const live = this.syncPads(this.readPads());
    const canons: CanonicalPad[] = [];
    live.forEach((pad, slot) => {
      const s = this.slots[slot];
      if (!pad || !s) return;
      // ONE read per pad, through ITS profile: the indices, the axis order and the deadzone are all the pad's own.
      // A Switch Pro's bottom face button arrives here as A, the same as an Xbox pad's — before the profile layer it
      // arrived as B, on every Switch controller, with nothing in the tree able to notice.
      const canon = applyRemap(readPad(pad, s.profile), readRemap(s.profile.id));
      s.canon = canon;
      canons.push(canon);
      if (this.slotListeners.size) this.emitSlotPad(slot, s, canon);
    });
    // The merged hero. It also runs on the ONE frame after the last pad leaves, so that pad's latches are released.
    if (canons.length || this.mergedLive) {
      const canon = mergePads(canons);
      this.emitStick('L', canon.lx, canon.ly);
      this.emitStick('R', canon.rx, canon.ry);
      this.emit({ t: 'trigger', side: 'L', value: canon.triggers.L });
      this.emit({ t: 'trigger', side: 'R', value: canon.triggers.R });
      // the keyboard arrows and the touch overlay's d-pad already emit these same events, so a real
      // controller's physical d-pad feeds the identical path
      for (const dir of DPAD_DIRS) {
        const pressed = canon.dpad[dir];
        const key = `pad_dpad_${dir}`;
        if (pressed && !this.held.has(key)) { this.held.add(key); this.emit({ t: 'dpad', dir, pressed: true }); }
        if (!pressed && this.held.has(key)) { this.held.delete(key); this.emit({ t: 'dpad', dir, pressed: false }); }
      }
      for (const btn of FEL_BUTTONS) {
        const pressed = canon.buttons[btn];
        const key = `pad_${btn}`;
        if (pressed && !this.held.has(key)) { this.held.add(key); this.emit({ t: 'button', btn, pressed: true }); }
        if (!pressed && this.held.has(key)) { this.held.delete(key); this.emit({ t: 'button', btn, pressed: false }); }
      }
      this.mergedLive = canons.length > 0;
      if (!this.mergedLive) { this.lastL = null; this.lastR = null; console.info('[PAD] no pads held'); }
    }
    // Space analog charge depth while held (0→1 over 1.1s)
    if (this.held.has(' ')) {
      const depth = Math.min(1, (performance.now() - this.spaceDownAt) / 1100);
      this.emit({ t: 'trigger', side: 'R', value: depth });
    }
    this.raf = requestAnimationFrame(this.pollPads);
  };
}
