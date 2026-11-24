'use client';

// TouchOverlay — THE single touch control component. Mounted ONCE by the
// harness route; every legacy in-canvas button set must be deleted.
// Portrait: DS-style bottom deck. Landscape: translucent side overlay.
// Emits FelInput through the SAME bus keyboard/gamepad use; buttons emit
// press AND release; hold buttons stream analog trigger 0→1; sticks stream
// a normalized vector and recenter on lift.
//
// UNIFORM CONTROLLER LAYOUT — every mode renders the exact same rig: left
// stick + d-pad on the left, right stick + A/B/X/Y diamond on the right.
// Modes differ only in what each control DOES (modeVerbs.ts), never in
// which controls are on screen — the console-emulator feel the whole point
// of this file is to guarantee. A slot a given mode has no use for keeps its
// place in the diamond but renders HOLLOW: a thin dashed ring, no letter, no
// label, not pressable — an empty socket, never a control (owner decision
// 2026-09-05, "hide now, build later").

import React, { useEffect, useRef, useState } from 'react';
import type { InputBus } from '../core/InputBus';
import { MODE_VERBS, type VerbButton } from './modeVerbs';
import { touchDeckLayout, type TouchDeckLayout } from '@/lib/ui/consoleView';
import { dpadLayout, TOUCH_DPAD_TAP_ON, DPAD_OLD_ARM_PX } from './dpadTap';   // hoops-items: the d-pad at a 44 px tap target
// THE CYPHER'S PAD (lane/dance-extras, 2026-10-14): dance draws its own thumb pairs in place of the generic rig below — the
// same overlay (bus, safe-area, fit), the same verbs (MODE_VERBS.dance); see lib/babylon/dance/ui/padModel.ts (what each button is) and padStore.ts (what the room tells it).
import { DancePad } from '@/lib/babylon/dance/ui/DancePad';
import { TurboPad } from './TurboPad';
import { feel } from '@/lib/feel-panel/feel';
import { useSlotRef, useUprightZones } from '@/components/games/hud-zones';   // look-screens A2 (ui.hudZonesUpright): the deck slot
import { DECK_HINT_MODES, deckFadeOverBody } from '@/lib/ui/hudZones';   // look-screens A2 (ui.deckFadeOverBody, ships at 1 = solid)
import { TOUCH_FLOAT_STICK, FLOAT_BASE_PX, FLOAT_RADIUS_PX, FLOAT_ZONE_W, FLOAT_ZONE_H, floatStickVector, floatKnobOffset } from './floatStick';   // lane/move-feel-2: the floating MOVE stick   // hoops round 2 (owner 2026-10-23): R2 on the touch deck, for the modes whose R2 is the turbo

// setPointerCapture throws NotFoundError if the browser has already dropped
// the pointer session by the time the handler runs (seen on some mobile
// WebViews on a fast tap-and-release) — capture is a nice-to-have (keeps the
// drag tracking a finger that slides off the control), never a precondition
// for the input itself, so a failure here must never block the emit below it.
function safeCapture(el: Element, pointerId: number): void {
  try { el.setPointerCapture(pointerId); } catch { /* session already gone — fine */ }
}

// CONTROLLER-UNIVERSAL-MULTI: phone-screen mirroring (iPhone Safari → Control Center → Screen Mirroring) is played in
// landscape, where the notch and the home indicator own the edges. The verbs sit at least the safe-area inset in from
// them; env() is 0 wherever there is no inset, so desktop and portrait keep their 12 px.
const SAFE_LEFT: React.CSSProperties = { left: 'max(0.75rem, env(safe-area-inset-left))', bottom: 'max(0.75rem, env(safe-area-inset-bottom))' };
const SAFE_RIGHT: React.CSSProperties = { right: 'max(0.75rem, env(safe-area-inset-right))', bottom: 'max(0.75rem, env(safe-area-inset-bottom))' };
// CONSOLE VIEW (2026-10-06): the compact deck side by side is wider than the stack, so it draws at 85 % from its own
// corner — the right half was otherwise 252 px of an 844 px phone and its right stick sat on the mode's bottom hint.
// A transform, not zoom: the stick reads its own getBoundingClientRect against clientX, and both follow a transform.
// The 64 px verbs draw at 54 px, still above the 44 pt touch minimum.
const COMPACT_SCALE = 0.85;
const COMPACT_LEFT: React.CSSProperties = { ...SAFE_LEFT, transform: `scale(${COMPACT_SCALE})`, transformOrigin: 'bottom left' };
const COMPACT_RIGHT: React.CSSProperties = { ...SAFE_RIGHT, transform: `scale(${COMPACT_SCALE})`, transformOrigin: 'bottom right' };

/**
 * QA P1-10 (2026-09-27): the deck lives inside the mode's 16:10 stage (overflow hidden). A 390-wide phone's stage is ~234 px
 * tall and the right column (boost, diamond, stick) is ~306 px, so its top buttons were cut off; sideways and on a desktop
 * the stage runs past the bottom of the screen, and the bottom-anchored deck went with it. Pure: how far to LIFT a column
 * (the stage below the viewport) and how much to SCALE it (to fit what is visible of the stage), margins kept.
 */
export function fitDeck(stage: { top: number; bottom: number }, viewportH: number, columnH: number, margin = 12): { lift: number; scale: number } {
  const visBottom = Math.min(stage.bottom, viewportH);
  const room = Math.max(0, visBottom - Math.max(stage.top, 0) - 2 * margin);
  return { lift: Math.max(0, stage.bottom - visBottom), scale: columnH > 0 ? Math.min(1, room / columnH) : 1 };
}

/** Any touch input at all: a touchscreen laptop keeps its deck; a mouse-and-keyboard machine or a TV browser does not. */
function hasTouch(): boolean {
  try {
    return (navigator.maxTouchPoints ?? 0) > 0 || window.matchMedia('(any-pointer: coarse)').matches || 'ontouchstart' in window;
  } catch { return true; }   // unknown: keep the deck, as before
}

export function TouchOverlay(props: { bus: InputBus; modeId: string; visible: boolean; overrides?: Partial<Record<'A' | 'B' | 'X' | 'Y', Partial<VerbButton>>> }) {
  const cfg = MODE_VERBS[props.modeId] ?? MODE_VERBS.default;
  // CONSOLE VIEW (2026-10-06): a phone held sideways stacks each stick BESIDE its buttons, not under them ('compact',
  // lib/ui/consoleView.ts) — stacked, the right side was 318 px of a 390 px screen, a wall up the edge of the picture.
  // A screen with no touch at all (a laptop or console browser on a TV) draws no deck: nothing can press it ('none').
  const [deck, setDeck] = useState<TouchDeckLayout>(() => touchDeckLayout(window.innerWidth, window.innerHeight, hasTouch()));
  // QA P1-10: each column is lifted and scaled into the visible stage (fitDeck), on top of the layout above
  const root = useRef<HTMLDivElement>(null), colL = useRef<HTMLDivElement>(null), colR = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ lift: 0, l: 1, r: 1 });

  useEffect(() => {
    const onR = () => {
      setDeck(touchDeckLayout(window.innerWidth, window.innerHeight, hasTouch()));
      const stage = root.current?.parentElement?.getBoundingClientRect();
      if (!stage) return;
      const l = fitDeck(stage, window.innerHeight, colL.current?.offsetHeight ?? 0), r = fitDeck(stage, window.innerHeight, colR.current?.offsetHeight ?? 0);
      setFit((f) => (f.lift === l.lift && f.l === l.scale && f.r === r.scale ? f : { lift: l.lift, l: l.scale, r: r.scale }));
    };
    onR();
    window.addEventListener('resize', onR);
    window.addEventListener('scroll', onR, { passive: true });
    return () => { window.removeEventListener('resize', onR); window.removeEventListener('scroll', onR); };
  }, [props.visible, deck]);
  const landscape = deck !== 'portrait';
  const compact = deck === 'compact';
  // look-screens A2: on an upright phone a mode that reads no d-pad gets no ghost d-pad — its place in the column is kept (so the
  // stick and TURBO stay where they were) and becomes the deck's slot, where the host's hint line is drawn (in the camera's bottom
  // band, under no body). `zones` is false on the server and the first render: the ghost is drawn until the client knows.
  const zones = useUprightZones();
  const deckSlot = useSlotRef('deck');
  const fade = !landscape && zones ? deckFadeOverBody() : 1;

  if (!props.visible || props.bus.gamepadActive || deck === 'none') return null;
  const lifted = (side: React.CSSProperties, k: number, origin: string): React.CSSProperties =>
    ({ ...side, bottom: `calc(max(0.75rem, env(safe-area-inset-bottom)) + ${fit.lift}px)`, transform: `scale(${k})`, transformOrigin: origin });
  const cs = compact ? COMPACT_SCALE : 1;

  if (props.modeId === 'dance') {
    return <DancePad bus={props.bus} deck={deck === 'compact' ? 'compact' : deck === 'landscape' ? 'landscape' : 'portrait'}
      fit={{ lift: fit.lift, left: fit.l, right: fit.r }} leftRef={colL} rightRef={colR} />;
  }

  // CALL FOR THE BALL (Elijah item 2): a mode can retitle (never re-emit) a slot per frame — e.g. 3v3's PASS
  // becomes BALL! off the ball. The emit, hold and hollow-socket rules are untouched; only label/color move.
  const ov = props.overrides;
  const buttons = (ov
    ? (['A', 'B', 'X', 'Y'] as const).map((k, i) => (ov[k] ? { ...cfg.buttons[i], ...ov[k] } : cfg.buttons[i]))
    : cfg.buttons) as [VerbButton, VerbButton, VerbButton, VerbButton];

  return (
    <div ref={root} data-touch-deck className={landscape
      ? 'pointer-events-none absolute inset-0 z-30'
      : 'pointer-events-none absolute inset-x-0 bottom-0 z-30 h-[44vh] bg-gradient-to-t from-black/85 to-transparent'}>
      {/* compact: the stick in the corner and the d-pad inboard of it (row-reverse keeps the DOM order) */}
      <div ref={colL} className={`pointer-events-auto absolute bottom-3 left-3 flex gap-2 ${compact ? 'flex-row-reverse items-end' : 'flex-col items-center'}`} style={lifted(compact ? COMPACT_LEFT : SAFE_LEFT, cs * fit.l, 'bottom left')}>
        {DEAD_DPAD.has(props.modeId) && feel('touch.dpadTapOn', TOUCH_DPAD_TAP_ON) >= 0.5
          ? (zones && !landscape
            ? (DECK_HINT_MODES.has(props.modeId)
              ? <div ref={deckSlot.ref} {...deckSlot.attr} className="pointer-events-none relative h-[72px] w-[172px]" />
              : <div aria-hidden="true" className="pointer-events-none h-[72px] w-[72px]" />)
            : <HollowDPad />)
          : <DPad bus={props.bus} layout={deck} />}
        {DEAD_L_STICK.has(props.modeId) ? <HollowStick /> : FLOAT_STICK_MODES.has(props.modeId) && feel('touch.floatStick', TOUCH_FLOAT_STICK) > 0 ? <FloatStick bus={props.bus} /> : <AnalogStick bus={props.bus} side="L" label="MOVE" />}
      </div>
      {compact ? (
        // compact: the diamond in the corner with the boost pill over it, the right stick inboard of the diamond
        <div ref={colR} className="pointer-events-auto absolute bottom-3 right-3 flex flex-row items-end gap-2" style={lifted(COMPACT_RIGHT, cs * fit.r, 'bottom right')}>
          {cfg.rStick === null ? <HollowStick /> : <AnalogStick bus={props.bus} side="R" label={cfg.rStick} />}
          <div className="flex flex-col items-center gap-2">
            {cfg.boost && <BoostPill bus={props.bus} />}
            {cfg.turbo && <TurboPad bus={props.bus} shape="pill" />}
            <ButtonDiamond bus={props.bus} buttons={buttons} />
          </div>
        </div>
      ) : (
        <div ref={colR} className="pointer-events-auto absolute bottom-3 right-3 flex flex-col items-center gap-2" style={lifted(SAFE_RIGHT, fit.r, 'bottom right')}>
          {cfg.boost && <BoostPill bus={props.bus} />}
          {cfg.turbo && landscape && <TurboPad bus={props.bus} shape="pill" />}
          {/* portrait: TURBO beside the diamond, inboard and out of the column's flow — the column keeps its size (a phone's stage has no
              height to spare: fitDeck already scales it), so the diamond and the stick stay exactly where they were */}
          {fadeCluster(fade, cfg.turbo && !landscape
            ? <div className="relative"><div className="absolute right-full top-1/2 mr-2 -translate-y-1/2"><TurboPad bus={props.bus} shape="round" /></div><ButtonDiamond bus={props.bus} buttons={buttons} /></div>
            : <ButtonDiamond bus={props.bus} buttons={buttons} />)}
          {cfg.rStick === null ? <HollowStick /> : <AnalogStick bus={props.bus} side="R" label={cfg.rStick} />}
        </div>
      )}
    </div>
  );
}

/** look-screens A2 (ui.deckFadeOverBody): the action cluster (the diamond and TURBO, not the stick) at the fade's opacity; at 1 it is
 *  returned untouched (no wrapper), today's deck exactly. */
function fadeCluster(fade: number, cluster: React.ReactNode): React.ReactNode {
  return fade < 1 ? <div data-deck-fade style={{ opacity: fade }}>{cluster}</div> : cluster;
}

function AnalogStick({ bus, side, label }: { bus: InputBus; side: 'L' | 'R'; label: string }) {
  const zone = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);

  const setVec = (x: number, y: number) => {
    bus.emit({ t: 'stick', side, x, y });
    if (knob.current) knob.current.style.transform = `translate(${x * 28}px, ${y * 28}px)`;
  };

  const onMove = (e: React.PointerEvent) => {
    if (active.current !== e.pointerId || !zone.current) return;
    const r = zone.current.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    const k = len > 1 ? 1 / len : 1;
    setVec(dx * k, dy * k);
  };

  return (
    <div ref={zone}
      onPointerDown={(e) => { active.current = e.pointerId; safeCapture(e.target as Element, e.pointerId); onMove(e); }}
      onPointerMove={onMove}
      onPointerUp={() => { active.current = null; setVec(0, 0); }}
      onPointerCancel={() => { active.current = null; setVec(0, 0); }}
      className="fel-chrome-glass relative h-24 w-24 touch-none rounded-full border border-white/15 bg-white/5 backdrop-blur-sm">
      <div ref={knob}
        className="absolute left-1/2 top-1/2 -ml-6 -mt-6 h-12 w-12 rounded-full bg-white/20 shadow-lg transition-transform duration-75" />
      <span className="absolute inset-0 flex items-center justify-center text-[12px] font-black tracking-widest text-white/50">
        {label}
      </span>
    </div>
  );
}

/** lane/move-feel-2 (owner 2026-11-17): the modes whose MOVE stick floats (lib/babylon/ui/floatStick; knob `touch.floatStick`, 0 = the fixed
 *  stick): the two hoops modes, where the diagnosis measured it. Every other mode keeps the fixed stick. */
export const FLOAT_STICK_MODES: ReadonlySet<string> = new Set(['onevone', 'threevthree', 'venice_hub', 'coast_zone']);   // venice-v1: the hub walks on the courts' stick; coast-islands: the zone walks on the hub's

/** THE FLOATING MOVE STICK (lane/move-feel-2): a zone the thumb lands in; the stick's centre appears under the thumb (so the first contact
 *  is a standstill), 1.5× today's base, full speed at its rim, a 10 % dead zone (floatStick.ts). At rest a faint base shows where to put
 *  the thumb. The zone's own transform (the deck's fit / compact scale) is read from its rect, so the travel scales with what is drawn. */
function FloatStick({ bus }: { bus: InputBus }) {
  const zone = useRef<HTMLDivElement>(null), base = useRef<HTMLDivElement>(null), knob = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null), origin = useRef({ x: 0, y: 0, k: 1 });
  const rest = { x: FLOAT_ZONE_W / 2, y: FLOAT_ZONE_H / 2 };
  const draw = (cx: number, cy: number, kx: number, ky: number, on: boolean) => {
    if (base.current) { base.current.style.transform = `translate(${cx - FLOAT_BASE_PX / 2}px, ${cy - FLOAT_BASE_PX / 2}px)`; base.current.style.opacity = on ? '1' : '0.45'; }
    if (knob.current) knob.current.style.transform = `translate(${cx + kx - 24}px, ${cy + ky - 24}px)`;
  };
  const local = (e: React.PointerEvent) => {   // the pointer in the zone's own (unscaled) px
    const r = zone.current!.getBoundingClientRect(); const k = r.width / FLOAT_ZONE_W || 1;
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k, k };
  };
  const onDown = (e: React.PointerEvent) => {
    if (active.current !== null || !zone.current) return;
    active.current = e.pointerId; safeCapture(e.target as Element, e.pointerId);
    const p = local(e); origin.current = p;
    draw(p.x, p.y, 0, 0, true);
    bus.emit({ t: 'stick', side: 'L', x: 0, y: 0 });   // a landing thumb is a standstill
  };
  const onMove = (e: React.PointerEvent) => {
    if (active.current !== e.pointerId || !zone.current) return;
    const p = local(e), o = origin.current; const dx = p.x - o.x, dy = p.y - o.y;
    const v = floatStickVector(dx, dy, FLOAT_RADIUS_PX); const kOff = floatKnobOffset(dx, dy, FLOAT_RADIUS_PX);
    bus.emit({ t: 'stick', side: 'L', x: v.x, y: v.y });
    draw(o.x, o.y, kOff.x, kOff.y, true);
  };
  const onUp = (e: React.PointerEvent) => {
    if (active.current !== e.pointerId) return;
    active.current = null; bus.emit({ t: 'stick', side: 'L', x: 0, y: 0 }); draw(rest.x, rest.y, 0, 0, false);
  };
  useEffect(() => { draw(rest.x, rest.y, 0, 0, false); return () => { if (active.current !== null) bus.emit({ t: 'stick', side: 'L', x: 0, y: 0 }); }; }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={zone} data-float-stick aria-label="Move: put your thumb anywhere here" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      className="relative touch-none select-none" style={{ width: FLOAT_ZONE_W, height: FLOAT_ZONE_H }}>
      <div ref={base} className="fel-chrome-glass pointer-events-none absolute left-0 top-0 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm" style={{ width: FLOAT_BASE_PX, height: FLOAT_BASE_PX }}>
        <span className="absolute inset-0 flex items-center justify-center text-[12px] font-black tracking-widest text-white/50">MOVE</span>
      </div>
      <div ref={knob} className="pointer-events-none absolute left-0 top-0 h-12 w-12 rounded-full bg-white/25 shadow-lg" />
    </div>
  );
}

/** The R stick's socket on a mode that reads nothing from it (MODE-STICK-FACE, 2026-09-07): the same 96 px footprint
 *  so the diamond above it never moves, a dashed ring at 30 % like an inert verb — an empty socket, not a control. */
/** gameplay-clean (2026-10-28): the modes whose LEFT stick moves nothing — a timed swing, a d-pad sprint, two quizzes. The deck
 *  drew a live MOVE stick there that answered with nothing (the audit's photographs: baseball's bottom-left); it is the
 *  inert dashed ring now, like an unbound right stick. touchOverlayFit.test.ts holds each to its mode file reading no L stick. */
export const DEAD_L_STICK: ReadonlySet<string> = new Set(['baseball', 'sprint', 'brainbrawl', 'who_scene_it']);

/** hoops-items (2026-11-18, dpadTap.ts): the modes whose D-PAD does nothing on the touch deck — 1v1 reads no d-pad at all and 3v3 only answers
 *  it with "MOVE WITH THE STICK". The owner's rule for a slot a mode does not use (2026-09-05: it keeps its place and renders HOLLOW, not
 *  pressable; DEAD_L_STICK did the same for the stick) applies: an inert dashed cross where the 24 px arrows were — no tap target under 44 px,
 *  the same 72 px in the column, so the floating stick and TURBO keep their places (a 44 px d-pad there would cover TURBO upright: measured,
 *  dpad.mjs). touchOverlayFit.test.ts holds each to its mode file using no d-pad as a verb. With touch.dpadTapOn 0: the old 24 px cross. */
export const DEAD_DPAD: ReadonlySet<string> = new Set(['onevone', 'threevthree']);

function HollowDPad() {
  const arm = 'absolute rounded-sm border border-dashed border-white';
  return (
    <div aria-hidden="true" data-dpad-shape="hollow" className="pointer-events-none relative h-[72px] w-[72px] opacity-30">
      <div className={`${arm} left-1/2 top-0 h-6 w-6 -translate-x-1/2`} /><div className={`${arm} bottom-0 left-1/2 h-6 w-6 -translate-x-1/2`} />
      <div className={`${arm} left-0 top-1/2 h-6 w-6 -translate-y-1/2`} /><div className={`${arm} right-0 top-1/2 h-6 w-6 -translate-y-1/2`} />
    </div>
  );
}

function HollowStick() {
  return <div aria-hidden="true" className="pointer-events-none h-24 w-24 rounded-full border border-dashed border-white opacity-30" />;
}

function DPad({ bus, layout }: { bus: InputBus; layout: TouchDeckLayout }) {
  const press = (dir: 'up' | 'down' | 'left' | 'right') => () => bus.emit({ t: 'dpad', dir, pressed: true });
  const release = (dir: 'up' | 'down' | 'left' | 'right') => () => bus.emit({ t: 'dpad', dir, pressed: false });
  // hoops-items (dpadTap.ts): the arrows at a 44 px tap target as drawn — a row of four upright, a 44 / 52 px cross otherwise
  const big = dpadLayout(layout, feel('touch.dpadTapOn', TOUCH_DPAD_TAP_ON) >= 0.5);
  if (big.arm !== DPAD_OLD_ARM_PX) {
    const a = big.arm;
    const cell = 'flex touch-none select-none items-center justify-center border border-white/15 bg-white/8 text-[16px] text-white/60 active:bg-white/25 active:text-white';
    const arrow = (dir: 'up' | 'down' | 'left' | 'right', glyph: string, label: string, style: React.CSSProperties, round: string) => (
      <button key={dir} type="button" aria-label={label} data-dpad={dir} className={`${cell} ${round}`} style={{ width: a, height: a, ...style }}
        onPointerDown={press(dir)} onPointerUp={release(dir)} onPointerCancel={release(dir)} onPointerLeave={release(dir)}>{glyph}</button>
    );
    if (big.shape === 'row') {
      return (
        <div data-dpad-shape="row" className="flex" style={{ width: big.w, height: big.h }}>
          {arrow('left', '◀', 'D-pad left', {}, 'rounded-l-md')}{arrow('up', '▲', 'D-pad up', {}, '')}
          {arrow('down', '▼', 'D-pad down', {}, '')}{arrow('right', '▶', 'D-pad right', {}, 'rounded-r-md')}
        </div>
      );
    }
    return (
      <div data-dpad-shape="cross" className="relative" style={{ width: big.w, height: big.h }}>
        {arrow('up', '▲', 'D-pad up', { position: 'absolute', left: a, top: 0 }, 'rounded-t-md')}
        {arrow('down', '▼', 'D-pad down', { position: 'absolute', left: a, bottom: 0 }, 'rounded-b-md')}
        {arrow('left', '◀', 'D-pad left', { position: 'absolute', left: 0, top: a }, 'rounded-l-md')}
        {arrow('right', '▶', 'D-pad right', { position: 'absolute', right: 0, top: a }, 'rounded-r-md')}
        <div className="absolute rounded-sm bg-white/5" style={{ left: a, top: a, width: a, height: a }} />
      </div>
    );
  }
  const seg = 'absolute flex touch-none select-none items-center justify-center border border-white/15 bg-white/8 text-[12px] text-white/50 active:bg-white/25 active:text-white';
  return (
    <div className="relative h-[72px] w-[72px]">
      <button
        className={`${seg} left-1/2 top-0 h-6 w-6 -translate-x-1/2 rounded-t-md`}
        onPointerDown={press('up')} onPointerUp={release('up')} onPointerCancel={release('up')} onPointerLeave={release('up')}
      >▲</button>
      <button
        className={`${seg} bottom-0 left-1/2 h-6 w-6 -translate-x-1/2 rounded-b-md`}
        onPointerDown={press('down')} onPointerUp={release('down')} onPointerCancel={release('down')} onPointerLeave={release('down')}
      >▼</button>
      <button
        className={`${seg} left-0 top-1/2 h-6 w-6 -translate-y-1/2 rounded-l-md`}
        onPointerDown={press('left')} onPointerUp={release('left')} onPointerCancel={release('left')} onPointerLeave={release('left')}
      >◀</button>
      <button
        className={`${seg} right-0 top-1/2 h-6 w-6 -translate-y-1/2 rounded-r-md`}
        onPointerDown={press('right')} onPointerUp={release('right')} onPointerCancel={release('right')} onPointerLeave={release('right')}
      >▶</button>
      <div className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white/5" />
    </div>
  );
}

// BOOST (FINISH-RELEASE, 2026-09-14): one held control in every speed mode. Emits R1 down on press and R1 up on release,
// exactly what RB on a pad and Shift on a keyboard send, so the mode reads one input for all three.
function BoostPill({ bus }: { bus: InputBus }) {
  const [held, setHeld] = useState(false);
  const down = (e: React.PointerEvent) => { safeCapture(e.target as Element, e.pointerId); navigator.vibrate?.(12); setHeld(true); bus.emit({ t: 'button', btn: 'R1', pressed: true }); };
  const up = () => { if (!held) return; setHeld(false); bus.emit({ t: 'button', btn: 'R1', pressed: false }); };
  return (
    <button onPointerDown={down} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
      className="h-[46px] w-[148px] touch-none select-none rounded-full border-2 text-[12px] font-black tracking-[0.25em] text-white transition-transform duration-75 active:scale-95"
      style={{ borderColor: '#22d3ee', background: held ? '#22d3eecc' : '#22d3ee26', boxShadow: held ? '0 0 26px #22d3ee' : '0 0 14px #22d3ee55' }}>
      BOOST
    </button>
  );
}

// Fixed Xbox-style diamond: Y top, X left, B right, A bottom. Position and
// per-slot color are ALWAYS the same across every mode — only the label and
// what pressing it does change. A slot a mode leaves unassigned keeps its
// position (so bound slots never move) and renders as a hollow socket.
const SLOT_POS: Record<'A' | 'B' | 'X' | 'Y', string> = {
  Y: 'left-1/2 top-0 -translate-x-1/2',
  X: 'left-0 top-1/2 -translate-y-1/2',
  B: 'right-0 top-1/2 -translate-y-1/2',
  A: 'left-1/2 bottom-0 -translate-x-1/2',
};
const SLOT_ORDER: Array<'A' | 'B' | 'X' | 'Y'> = ['Y', 'X', 'B', 'A'];

function ButtonDiamond({ bus, buttons }: { bus: InputBus; buttons: [VerbButton, VerbButton, VerbButton, VerbButton] }) {
  const bySlot: Record<'A' | 'B' | 'X' | 'Y', VerbButton> = { A: buttons[0], B: buttons[1], X: buttons[2], Y: buttons[3] };
  return (
    <div className="relative h-[148px] w-[148px]">
      {SLOT_ORDER.map((slot) => (
        <div key={slot} className={`absolute ${SLOT_POS[slot]}`}>
          <Verb bus={bus} def={bySlot[slot]} slot={slot} />
        </div>
      ))}
    </div>
  );
}

function Verb({ bus, def, slot }: { bus: InputBus; def: VerbButton; slot: 'A' | 'B' | 'X' | 'Y' }) {
  const holdRaf = useRef(0);
  const downAt = useRef(0);
  const inert = def.emit === null;
  const [holdV, setHoldV] = useState(0);   // pad acceptance #1: the HOLD cue — the ring fills while the hold is down

  // HOLLOW SOCKET. An inert slot is not a button: no letter (a bare "X" reads
  // as a control), no label, no glow, nothing to press. A thin dashed ring at
  // 30% keeps the diamond's shape so the bound slots stay where the thumb
  // expects them. Same 64 px footprint as a live verb.
  if (inert) {
    return (
      <div className="relative">
        <div aria-hidden="true"
          className="pointer-events-none h-[64px] w-[64px] rounded-full border border-dashed border-white opacity-30" />
      </div>
    );
  }

  const press = (e: React.PointerEvent) => {
    if (inert) return;
    safeCapture(e.target as Element, e.pointerId);
    navigator.vibrate?.(10);
    // PHONE CONTROLS (FINISH-RELEASE, 2026-09-15): a HOLD verb used to stream the RIGHT trigger whatever it was bound to — so
    // the kart's BRAKE (LT) and DRIFT (the X button, held) both drove the throttle on a phone, and aero's rudder did too.
    // A held TRIGGER verb streams ITS trigger; a held BUTTON verb is simply pressed down and released.
    if (def.hold && def.emit!.t === 'button') {
      bus.emit(def.emit!);
      setHoldV(1);
    } else if (def.hold) {
      const side = def.emit!.t === 'trigger' ? def.emit!.side : 'R';
      downAt.current = performance.now();
      const stream = () => {
        const v = Math.min(1, (performance.now() - downAt.current) / 1100);
        bus.emit({ t: 'trigger', side, value: Math.max(0.01, v) });
        setHoldV(v);
        holdRaf.current = requestAnimationFrame(stream);
      };
      stream();
    } else {
      bus.emit(def.emit!);
    }
  };

  const release = () => {
    if (inert) return;
    if (def.hold && def.emit!.t === 'button') {
      setHoldV(0);
      bus.emit({ ...def.emit!, pressed: false });
    } else if (def.hold) {
      cancelAnimationFrame(holdRaf.current);
      setHoldV(0);
      bus.emit({ t: 'trigger', side: def.emit!.t === 'trigger' ? def.emit!.side : 'R', value: 0 });   // release = launch
    } else if (def.emit!.t === 'button' || def.emit!.t === 'dpad') {
      bus.emit({ ...def.emit!, pressed: false });
    }
  };

  const color = def.color;
  return (
    <div className="relative">
      {def.hold && (
        <span className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 text-[12px] font-black tracking-[0.2em] text-white/60">HOLD</span>
      )}
    <button
      onPointerDown={press} onPointerUp={release} onPointerCancel={release}
      className="h-[64px] w-[64px] touch-none select-none rounded-full border-2 text-[12px] font-black tracking-wide text-white transition-transform duration-75 active:scale-90 active:brightness-150"
      style={{ borderColor: color, background: def.hold && holdV > 0 ? `conic-gradient(${color}cc ${Math.round(holdV * 360)}deg, ${color}22 0)` : `${color}22`, boxShadow: `0 0 18px ${color}44` }}>
      {def.label || slot}
    </button>
    </div>
  );
}

// MOUNT (harness route component):
//   <TouchOverlay bus={inputBus} modeId={modeId} visible={phase === 'playing'} />
// DELETE every other on-screen control (grep: PUNCH/HEAVY circle set, PWR/FLSH/
// SIG/CHARGE/SLAM in-canvas set, the old gamepad FAB deck). One overlay. Ever.
