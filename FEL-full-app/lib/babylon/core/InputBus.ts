// InputBus — every input source (keyboard, touch overlay, Gamepad API) emits the
// same normalized FelInput events. Game logic ONLY subscribes here.

/** MOVEMENT PLAY P3 (2026-09-24): `'body'` marks an event the body floor made (lib/input/bodyFloor, through emitBody
 *  and the arbiter). Only the floor ever sets it, and the keyboard's events keep their exact shape (`'key'` or none). */
export type InputSrc = 'key' | 'body';
export type FelButton = 'A' | 'B' | 'X' | 'Y' | 'L1' | 'R1' | 'SELECT' | 'START' | 'LS' | 'RS';
export type FelInput =
  | { t: 'stick'; side: 'L' | 'R'; x: number; y: number; src?: 'body' }
  /** `src: 'key'` marks a keyboard ARROW: the arrows also drive the L stick (see onKey), so a mode whose d-pad
   *  means something else on the runway (the dunk's PROP) must skip keyboard d-pad presses — pad buttons 12–15,
   *  the touch d-pad and Controller Link carry no src and stay the real d-pad. */
  | { t: 'dpad'; dir: 'up' | 'down' | 'left' | 'right'; pressed: boolean; src?: InputSrc }
  /** `src: 'key'` on a BUTTON marks the keyboard's two shoulder keys (SHIFT = R1, F = L1). The hoops slot reads the
   *  tagged pair as its two TRIGGER verbs (turbo / post-up + intense D) because a keyboard has no analog triggers;
   *  every other reader sees the plain R1 / L1 it always did. A pad's shoulders carry no src.
   *  LS / RS (racing pass, 2026-09-23) are the STICK CLICKS — L3 / R3. The pad profiles always read them; the bus never
   *  emitted them, so the Free Run brief's L3 look-back / R3 lock-on had no input to hang on.
   *  HOTFIX (2026-09-24): `src: 'space'` marks the A the bus makes up when SPACE comes back up (see onKey). It is the run
   *  key's release, not a press of J / A, and the dunk modes must tell the two apart; guessing it from the R stream broke
   *  whenever an idle pad, the touch RUN hold or Controller Link wrote to that stream too. Every other reader sees a plain A.
   *  (P3 rebase, 2026-09-25: `'space'` is the keyboard's own tag, beside `'key'`; the body floor never sets it — InputSrc.) */
  | { t: 'button'; btn: FelButton; pressed: boolean; src?: InputSrc | 'space' }
  | { t: 'trigger'; side: 'L' | 'R'; value: number; src?: 'body' };
/** What a body floor emits (emitBody takes nothing else): every output carries `src: 'body'`. */
export type BodyOut = FelInput & { src: 'body' };

import { HAPTIC } from '../premium/Haptics';
import { KEY_SPACE_DOWN } from './StartWake';   // the space-down marker the READY gate wakes on
// Input & Presence Phase A: the pad is read through a PROFILE now. Everything below keeps its FelInput
// contract exactly — no mode file and no existing test changes — but the indices it reads are the profile's
// rather than a hardcoded Standard Gamepad table, and the stick deadzone is radial instead of per-axis.
import { profileFor, readPad, supportCheck, type CanonicalPad, type ControllerProfile } from '@/lib/input/profiles';
import { applyRemap, readRemap } from '@/lib/input/remap';
import { MAX_SLOTS } from '@/lib/input/PlayerSlots';
import { mergePads } from '@/lib/input/padMerge';
import { BodyArbiter, type HoldKey } from '@/lib/input/arbiter';
import type { BodyRead, BodyEvent, BodyEventKind } from '@/lib/pose/BodyReader';   // type-only; BodyReader imports lib/pose only
import type { BodyChannels } from '@/lib/pose/bodyChannels';                        // type-only

type Listener = (e: FelInput) => void;
type SlotListener = (e: FelInput, slot: number) => void;
type BodyListener = (p: BodyPacket) => void;
type PadDirName = 'up' | 'down' | 'left' | 'right';
const FEL_BUTTONS: readonly FelButton[] = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'SELECT', 'START', 'LS', 'RS'];
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
  // It is ALSO the keyboard's R2: the 2K map makes turbo a held trigger, and "shift to run" is the one keyboard
  // convention every player already has. It is NOT emitted as a trigger, though (suite pass, 2026-09-16): fifteen mode
  // files read the raw R trigger for something else entirely — the dunk's run-up, the shootout's wind-up, a board's
  // crouch, a throw's power — and a Shift that also pulled R2 started all of them. The hoops slot reads the
  // `src: 'key'` tag on this R1 instead (see PlayerSlot.LocalInputSource), so only the slot sees a turbo.
  shift: { t: 'button', btn: 'R1', pressed: true, src: 'key' },
  // F = L2 the same way: post-up on offence, intense D on defence, read off the tag by the hoops slot; a plain L1
  // (the plant / box-out) everywhere else.
  f: { t: 'button', btn: 'L1', pressed: true, src: 'key' },
  c: { t: 'button', btn: 'SELECT', pressed: true },
  // racing pass (2026-09-23): the stick clicks. V = L3 (look back, held), R = R3 (lock-on / who is around you).
  v: { t: 'button', btn: 'LS', pressed: true },
  r: { t: 'button', btn: 'RS', pressed: true },
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

/**
 * THE LIVE BUSES.
 *
 * Every mode constructs its own InputBus, so there is no singleton for an external input source to talk to.
 * Body control (lib/input/poseSource) needs one: it owns a camera at the shell level and has to reach whichever
 * mode is actually running.
 *
 * Membership is keyed on start() and stop(), which the bus already has and already calls, so a bus is registered
 * exactly while it is polling. Emitting into a torn-down mode is the bug this shape prevents — and it is the same
 * reason stop() clears held state: an input owner that outlives its game leaves buttons down forever.
 */
const LIVE = new Set<InputBus>();

/** The buses currently running. Newest last, because the most recently started one is the mode on screen. */
export function liveInputBuses(): InputBus[] {
  return [...LIVE];
}

/** Send an event to every running bus. Used by input sources that live outside a mode. */
export function emitToLive(e: FelInput): void {
  LIVE.forEach((b) => b.emit(e));
}

/**
 * MOVEMENT PLAY P3 (2026-09-24): THE BODY CHANNEL. What the camera reads is not a fifth FelInput shape — a mode that
 * wants the body's own facts (the take-off's instant, the apex, the stride) gets them whole, on the capture clock —
 * so it rides beside the input stream as one packet per camera frame. The harness turns it into ordinary FelInput
 * (tagged `src: 'body'`) only where a mode's profile binds a move, and pauses / starts the game on it.
 */
export interface BodyPacket {
  /** An absent read (present:false, fields null) = source live, nobody in frame. */
  read: BodyRead;
  events: readonly BodyEvent[];
  channels: BodyChannels;
  /** PoseFrame.arrive: when the frame reached the page (PoseService deps.now = performance.now). */
  arrivedAt: number;
  /** The publisher stopped (Body switched off, recalibrate, teardown): release, never pause. */
  final?: true;
}

/** One camera frame of body to every running bus: beside emitToLive, for the same reason (a camera outlives modes). */
export function publishBodyToLive(p: BodyPacket): void {
  LIVE.forEach((b) => b.publishBody(p));
}

/** How many lags per event kind bodyStats keeps (the newest): a probe's median, not a history. */
const BODY_STATS_KEEP = 256;

/**
 * MOVEMENT PLAY P3 (2026-09-24, the step-3 review): every body delivery is made to each listener on its own, and a
 * listener that throws is reported, not propagated. A body frame is a BATCH the rest of the seam has already committed
 * to — the floor marked its RT drop after the POP as sent, the session cleared its lost deadline — so a mode's onInput
 * throwing on the A used to abort the frame's remaining outputs and strand the crouch on RT in every pad frame after
 * it (and, from the render loop's floor tick, stop Babylon's loop for good). The camera's own path (PoseService) only
 * ever warned about it; now nothing downstream of the one failing listener is lost with it.
 */
function bodyFault(what: string, err: unknown): void {
  console.error(`[FEL-BODY] ${what}:`, err);
}

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
  // ── the body channel (MOVEMENT PLAY P3) ──
  private bodyListeners = new Set<BodyListener>();
  /** The latest packet since start(); null before any, and after a final one. */
  private latest: BodyPacket | null = null;
  private lastArrive = -Infinity;
  /** arrivedAt − ev.t per event kind (the newest BODY_STATS_KEEP), for probes. */
  private lags = new Map<BodyEventKind, number[]>();
  /** Composes the body with every other source; neutral (a pass-through) until the body writes something. */
  private readonly arbiter = new BodyArbiter((k) => this.holds(k));

  start(): void {
    // IDEMPOTENT (2026-09-15). A second start() on the same bus left the FIRST pollPads chain running: two poll loops, two
    // emits a frame, and — measured on football — a HELD trigger arriving as 1, 0, 1, 0 at ~17 Hz, which downstream reads
    // as seventeen presses a second (35 "presses" from one 2 s hold). Stop whatever is already running first.
    this.stop();
    // A fresh start never inherits held state: a key or button held across a stop / start would otherwise stay logically
    // down forever (ported from elijahbonds-fel-upgrade-pass "one input owner per game", 2026-09-12).
    this.held.clear();
    this.resetBody();   // …and no body state either: a new game starts from no source (body() === null)
    LIVE.add(this);
    this.spaceDownAt = 0;
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('gamepadconnected', this.onPad);
    window.addEventListener('gamepaddisconnected', this.onPadOff);
    this.syncPads(this.readPads());   // a pad plugged in BEFORE this page loaded never fires gamepadconnected — take it now
    this.pollPads();
  }
  stop(): void {
    LIVE.delete(this);
    // MOVEMENT PLAY P3: the body lets go with the mode. Reset BEFORE releaseAll, so the releases below go out exactly as
    // they always did rather than composed with a lean or a crouch nobody is running any more (the listeners are the
    // torn-down mode's; they are never sent a body release).
    this.resetBody();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('gamepadconnected', this.onPad);
    window.removeEventListener('gamepaddisconnected', this.onPadOff);
    cancelAnimationFrame(this.raf);
    this.releaseAll();
  }

  /**
   * Let go of EVERYTHING that is logically held.
   *
   * A window that has lost focus is delivered no keyup, and a pad that is unplugged delivers no falling edge — so
   * without this a held key or button stays down forever and the next session inherits it. (Ported from the upgrade
   * pass's "no stuck inputs"; adapted to this bus's merged pad + slot streams.)
   */
  private releaseAll(): void {
    const held = [...this.held];
    if (!held.length) return;
    if (held.some((k) => WASD.has(k))) this.emit({ t: 'stick', side: 'L', x: 0, y: 0 });
    if (held.includes(' ')) this.emit({ t: 'trigger', side: 'R', value: 0 });   // zero the charge; never fire it
    for (const key of held) {
      if (key.startsWith('pad_dpad_')) { this.emit({ t: 'dpad', dir: key.slice(9) as 'up' | 'down' | 'left' | 'right', pressed: false }); continue; }
      if (key.startsWith('pad_')) { this.emit({ t: 'button', btn: key.slice(4) as FelButton, pressed: false }); continue; }
      const mapped = KEYMAP[key];
      if (mapped && mapped.t === 'button') this.emit({ ...mapped, pressed: false });
      else if (mapped && mapped.t === 'dpad') this.emit({ ...mapped, pressed: false });
    }
    this.held.clear();
    this.spaceDownAt = 0;
  }

  // A blur releases the keys and the pad a hidden window can no longer see let go of — never the body: the camera still
  // sees it (P3 Z7), and the arbiter composes what releaseAll sends with whatever the body is still doing.
  private onBlur = (): void => { this.releaseAll(); };

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(e: FelInput): void {                        // touch overlay calls this directly
    // MOVEMENT PLAY P3: a body event is the floor's, already arbitrated (emitBody) — and nobody pressed anything: no
    // buzz. It must never go through external() either: that records it as a hand's value, and a lean or a crouch
    // that went back to 0 would stay composed into every event after it.
    if (e.src === 'body') { this.deliverBody(e); return; }
    if (e.t === 'button' && e.pressed) HAPTIC.tap();  // 10ms button-down buzz (throttled in Haptics) //TUNE(elijah)
    // MOVEMENT PLAY P3: the same event, untouched, while the body holds nothing (Z1); composed with it otherwise —
    // and tagged `src: 'body'` where the value it now carries is the body's (arbiter.ts, WHOSE EVENT IT IS)
    this.deliver(this.arbiter.external(e, this.gamepadActive));
  }
  /** Straight to the listeners: for an event already arbitrated (a body output, a folded pad trigger, a resync). */
  private deliver(e: FelInput): void {
    this.listeners.forEach((fn) => fn(e));
  }
  /** A floor output to the listeners, each on its own (bodyFault): one that throws takes nothing else with it. */
  private deliverBody(e: FelInput): void {
    this.listeners.forEach((fn) => { try { fn(e); } catch (err) { bodyFault(`a listener threw on a body ${e.t}`, err); } });
  }

  // ── the body channel (MOVEMENT PLAY P3, 2026-09-24) ──

  /** One camera frame of body: kept as the latest (cleared by a final one) and handed to every onBody listener. */
  publishBody(p: BodyPacket): void {
    this.latest = p.final ? null : p;
    this.lastArrive = p.arrivedAt;
    for (const ev of p.events) {
      let l = this.lags.get(ev.kind);
      if (!l) this.lags.set(ev.kind, (l = []));
      l.push(p.arrivedAt - ev.t);
      if (l.length > BODY_STATS_KEEP) l.shift();
    }
    // each on its own (bodyFault): a harness that throws on this frame must not cost another bus, or the source's own
    // snapshot, the frame
    this.bodyListeners.forEach((fn) => { try { fn(p); } catch (err) { bodyFault('a body listener threw', err); } });
  }
  onBody(fn: (p: BodyPacket) => void): () => void {
    this.bodyListeners.add(fn);
    return () => this.bodyListeners.delete(fn);
  }
  /** The latest packet: null = no source since start(), or after a final packet. */
  body(): BodyPacket | null { return this.latest; }
  /** arrivedAt of the latest packet (a final one included); -Infinity if none since start(). */
  lastBodyAt(): number { return this.lastArrive; }
  /** A body floor's output → the listeners, through the arbiter (§3). No haptic: nobody pressed anything. */
  emitBody(e: BodyOut): void {
    for (const out of this.arbiter.body(e, this.gamepadActive)) this.emit(out);
  }
  /** Re-emit the composed L/R sticks and triggers, past every on-change filter (a resume: P3 step 4b). */
  resync(): void {
    for (const e of this.arbiter.current()) this.deliver(e);
  }
  /** Per event kind: how late the page had it (arrivedAt − ev.t, ms) — the median and the 90th percentile. */
  bodyStats(): Partial<Record<BodyEventKind, { n: number; medMs: number; p90Ms: number }>> {
    const out: Partial<Record<BodyEventKind, { n: number; medMs: number; p90Ms: number }>> = {};
    this.lags.forEach((l, kind) => {
      if (!l.length) return;
      const s = [...l].sort((a, b) => a - b);
      const at = (q: number): number => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
      out[kind] = { n: s.length, medMs: at(0.5), p90Ms: at(0.9) };
    });
    return out;
  }
  /** start() / stop(): no packet, no lags, a neutral arbiter. The listeners stay subscribed, as on() ones do. */
  private resetBody(): void {
    this.arbiter.reset();
    this.latest = null;
    this.lastArrive = -Infinity;
    this.lags.clear();
  }
  /** The arbiter's view of `held`: the pad's and the keyboard's own edges, which the bus tracks exactly. */
  private holds(k: HoldKey): boolean {
    if (k.startsWith('d:')) {
      const dir = k.slice(2);
      return this.held.has(`pad_dpad_${dir}`) || this.held.has(`arrow${dir}`);
    }
    const btn = k.slice(2);
    if (this.held.has(`pad_${btn}`)) return true;
    for (const key of this.held) {
      const m = KEYMAP[key];
      if (m && m.t === 'button' && m.btn === btn) return true;
    }
    return false;
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
    // THE KEYBOARD'S TWO TRIGGERS (2K map, 2026-09-16) are SHIFT and F, mapped above as R1 / L1 tagged `src: 'key'`.
    // A keyboard has no analog triggers, so the two verbs that live on them need keys of their own or the scheme only
    // exists on a pad — which is exactly how the keyboard ended up unable to choose between a dunk and a layup: turbo
    // was inferred from stick magnitude, and a key is always full magnitude, so every keyboard drive was a sprint.
    if (key === ' ') {
      if (down) { this.spaceDownAt = performance.now(); this.emit({ t: 'trigger', side: 'R', value: KEY_SPACE_DOWN }); }
      else { this.emit({ t: 'trigger', side: 'R', value: 0 }); this.emit({ t: 'button', btn: 'A', pressed: true, src: 'space' }); }   // HOTFIX (2026-09-24): tagged — the run key's A, not J's
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
    // HOTFIX (2026-09-24): while SPACE is held the keyboard is pulling R too, and the two share ONE R stream. The merged pad
    // re-sends its trigger every frame, so an idle pad plugged in wrote R 0 between every Space depth — the dunk read that 0
    // as RUN let go and launched about three frames (~50 ms) after Space went down, and every hold-to-charge mode saw the
    // same flicker. While Space is held the frame's R is sent once, below, as the deeper of the two (a pad pulled deeper wins).
    const spaceHeld = this.held.has(' ');
    let padR = 0;
    // The merged hero. It also runs on the ONE frame after the last pad leaves, so that pad's latches are released.
    if (canons.length || this.mergedLive) {
      const canon = mergePads(canons);
      this.emitStick('L', canon.lx, canon.ly);
      this.emitStick('R', canon.rx, canon.ry);
      // MOVEMENT PLAY P3 (bug 3): still every frame (DunkDuel's RT start and the slot's turboSeen read the stream), but
      // FOLDED with the body's pull: the pad's exact event while the body pulls no deeper, the body's (tagged
      // `src: 'body'`, so the READY gate and the play evidence know whose it is) while it does. Delivered straight to
      // the listeners — folded already, it must never be taken for the pad's own value on the way (arbiter.foldTrigger).
      // While Space is held the pad's R is NOT sent here (the HOTFIX above): the one R a frame goes out below, as the
      // deeper of the Space depth and the pad, through emit() — a hand's value, which the arbiter composes like any other.
      this.deliver(this.arbiter.foldTrigger('L', canon.triggers.L));
      padR = canon.triggers.R;
      if (!spaceHeld) this.deliver(this.arbiter.foldTrigger('R', canon.triggers.R));
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
    if (spaceHeld) {
      const depth = Math.min(1, (performance.now() - this.spaceDownAt) / 1100);
      this.emit({ t: 'trigger', side: 'R', value: Math.max(depth, padR) });   // one R a frame (the HOTFIX above)
    }
    this.raf = requestAnimationFrame(this.pollPads);
  };
}
