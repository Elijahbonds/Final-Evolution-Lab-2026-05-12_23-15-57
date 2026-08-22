'use client';

/**
 * FEL Virtual Controller — Premium Build
 * ──────────────────────────────────────
 * An original, console-grade on-screen gamepad shared by every FEL mode.
 * Neon-on-glass FEL aesthetic with layered depth, specular gloss, spring press
 * physics, ripple bursts and differentiated haptics. Low-latency multi-touch
 * pointer input. Every press funnels through the synthetic-keyboard bridge
 * (lib/gamepad-bridge) so it drives all modes identically. Original design,
 * not a console emulator.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gamepad2, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import type { VCScheme, VCButton } from '@/lib/input-schemes';
import { pressKey, releaseKey } from '@/lib/gamepad-bridge';
import { resolveShoulders, resolveLook, SHOULDER_SLOTS, type ShoulderSlot } from '@/lib/input/controller-map';

/* Differentiated haptics — subtle taps for steering, punchier for actions. */
type Feel = 'dir' | 'action' | 'special' | 'hold';
function haptic(feel: Feel) {
  try {
    const v = (navigator as any)?.vibrate;
    if (!v) return;
    const pattern = feel === 'dir' ? 7 : feel === 'special' ? [9, 22, 12] : feel === 'hold' ? 18 : 14;
    v.call(navigator, pattern as number | number[]);
  } catch { /* unsupported */ }
}

const SPRING = { type: 'spring' as const, stiffness: 720, damping: 26, mass: 0.5 };

/* ── Ripple burst that fires each press ─────────────── */
function Ripple({ token, color }: { token: number; color: string }) {
  return (
    <AnimatePresence>
      {token > 0 && (
        <motion.span
          key={token}
          initial={{ opacity: 0.55, scale: 0.35 }}
          animate={{ opacity: 0, scale: 1.9 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.42, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ background: `radial-gradient(circle, ${color}66 0%, transparent 70%)` }}
        />
      )}
    </AnimatePresence>
  );
}

/* ── Premium circular face button ───────────────────── */
function FaceButton({
  label, color, active, token, onDown, onUp, size, long,
}: {
  label: string; color: string; active: boolean; token: number;
  onDown: () => void; onUp: () => void; size: number; long?: boolean;
}) {
  const down = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    onDown();
  }, [onDown]);
  const up = useCallback((e: React.PointerEvent) => { e.preventDefault(); onUp(); }, [onUp]);
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={() => {}}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={up}
      animate={{ scale: active ? 0.88 : 1 }}
      transition={SPRING}
      className="pointer-events-auto relative flex select-none touch-none items-center justify-center overflow-hidden rounded-full font-extrabold uppercase tracking-wide"
      style={{
        width: size, height: size,
        color: active ? '#050505' : color,
        fontSize: long ? Math.max(9, size * 0.15) : size * 0.2,
        lineHeight: 1.05,
        textShadow: active ? 'none' : `0 0 10px ${color}77`,
        border: `2px solid ${active ? color : color + '80'}`,
        background: active
          ? `radial-gradient(circle at 50% 38%, ${color} 0%, ${color}cc 60%, ${color}99 100%)`
          : `radial-gradient(circle at 50% 30%, ${color}2e 0%, rgba(10,11,15,0.9) 62%, rgba(4,5,7,0.96) 100%)`,
        boxShadow: active
          ? `0 0 26px ${color}cc, 0 0 8px ${color}, inset 0 -3px 10px rgba(0,0,0,0.35), inset 0 3px 8px ${color}66`
          : `0 6px 16px rgba(0,0,0,0.55), inset 0 2px 6px rgba(255,255,255,0.10), inset 0 -6px 12px rgba(0,0,0,0.55)`,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <Ripple token={token} color={color} />
      {/* specular gloss */}
      <span
        className="pointer-events-none absolute left-1/2 top-[9%] h-[34%] w-[64%] -translate-x-1/2 rounded-full"
        style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.34), transparent)', opacity: active ? 0.25 : 0.6, filter: 'blur(1px)' }}
      />
      <span className="relative z-10 px-1 text-center">{label}</span>
    </motion.button>
  );
}

/* ── Premium D-pad cross with analog-style nub ──────── */
function DPad({
  dir, pressed, tokens, onDown, onUp, size,
}: {
  dir: NonNullable<VCScheme['dir']>;
  pressed: Record<string, boolean>;
  tokens: Record<string, number>;
  onDown: (id: string, key: string, feel: Feel) => void;
  onUp: (id: string, key: string) => void;
  size: number;
}) {
  const CYAN = '#00E5FF';
  const arm = size * 0.34; // width of each cross arm
  // nub offset toward the active direction
  let nx = 0, ny = 0;
  if (pressed['d-left']) nx -= size * 0.16;
  if (pressed['d-right']) nx += size * 0.16;
  if (pressed['d-up']) ny -= size * 0.16;
  if (pressed['d-down']) ny += size * 0.16;

  const arms: { d: 'up' | 'down' | 'left' | 'right'; Icon: typeof ChevronUp; style: React.CSSProperties }[] = [
    { d: 'up', Icon: ChevronUp, style: { top: 0, left: '50%', transform: 'translateX(-50%)', width: arm, height: (size - arm) / 2 } },
    { d: 'down', Icon: ChevronDown, style: { bottom: 0, left: '50%', transform: 'translateX(-50%)', width: arm, height: (size - arm) / 2 } },
    { d: 'left', Icon: ChevronLeft, style: { left: 0, top: '50%', transform: 'translateY(-50%)', height: arm, width: (size - arm) / 2 } },
    { d: 'right', Icon: ChevronRight, style: { right: 0, top: '50%', transform: 'translateY(-50%)', height: arm, width: (size - arm) / 2 } },
  ];

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* cross body */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-full -translate-x-1/2 rounded-2xl" style={{ width: arm, background: 'linear-gradient(180deg, #16181f, #0a0b0f)', boxShadow: 'inset 0 2px 6px rgba(255,255,255,0.06), inset 0 -6px 14px rgba(0,0,0,0.6), 0 6px 16px rgba(0,0,0,0.5)' }} />
        <div className="absolute top-1/2 left-0 w-full -translate-y-1/2 rounded-2xl" style={{ height: arm, background: 'linear-gradient(90deg, #16181f, #0a0b0f)', boxShadow: 'inset 0 2px 6px rgba(255,255,255,0.06), inset 0 -6px 14px rgba(0,0,0,0.6), 0 6px 16px rgba(0,0,0,0.5)' }} />
      </div>
      {/* center nub (analog feel) */}
      <motion.span
        className="pointer-events-none absolute left-1/2 top-1/2 z-10 rounded-full"
        style={{ width: arm * 0.5, height: arm * 0.5, marginLeft: -(arm * 0.25), marginTop: -(arm * 0.25), background: 'radial-gradient(circle at 40% 35%, #2b2f3a, #0c0d12)', boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.12), 0 2px 6px rgba(0,0,0,0.6)' }}
        animate={{ x: nx, y: ny }}
        transition={SPRING}
      />
      {/* directional hit zones */}
      {arms.map(({ d, Icon, style }) => {
        const key = dir[d];
        if (!key) return null;
        const id = 'd-' + d;
        const on = !!pressed[id];
        return (
          <button
            key={d}
            type="button"
            aria-label={'D-pad ' + d}
            onClick={() => {}}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => { e.preventDefault(); try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {} onDown(id, key, 'dir'); }}
            onPointerUp={(e) => { e.preventDefault(); onUp(id, key); }}
            onPointerCancel={(e) => { e.preventDefault(); onUp(id, key); }}
            onPointerLeave={(e) => { e.preventDefault(); onUp(id, key); }}
            className="pointer-events-auto absolute z-20 flex select-none touch-none items-center justify-center overflow-hidden rounded-xl"
            style={{
              ...style,
              color: on ? '#050505' : CYAN,
              background: on ? `radial-gradient(circle, ${CYAN} 0%, ${CYAN}cc 70%)` : 'transparent',
              boxShadow: on ? `0 0 20px ${CYAN}bb, inset 0 0 10px ${CYAN}` : 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Ripple token={tokens[id] ?? 0} color={CYAN} />
            <Icon className="relative z-10" style={{ width: arm * 0.5, height: arm * 0.5, filter: on ? 'none' : `drop-shadow(0 0 6px ${CYAN}88)` }} />
          </button>
        );
      })}
    </div>
  );
}

/* ── Analog joystick ────────────────────────────────
   A draggable stick that reconciles its angle into the scheme's directional
   keys (up/down/left/right) and dispatches them through the same synthetic-
   keyboard bridge every mode already listens to. Supports 8-way (diagonals
   hold two keys). Falls back gracefully for schemes that only map some axes. */
function Joystick({
  dir, onDown, onUp, size, idPrefix = 'joy', tint = '#00E5FF',
}: {
  dir: NonNullable<VCScheme['dir']>;
  onDown: (id: string, key: string, feel: Feel) => void;
  onUp: (id: string, key: string) => void;
  size: number;
  /** Unique id namespace so a second (look) stick never collides with movement. */
  idPrefix?: string;
  tint?: string;
}) {
  const CYAN = tint;
  const R = size * 0.32;               // max nub travel radius
  const DEAD = 0.30;                    // fraction of R before a direction engages
  const baseRef = useRef<HTMLDivElement>(null);
  const [nub, setNub] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const held = useRef<Record<'up' | 'down' | 'left' | 'right', boolean>>({ up: false, down: false, left: false, right: false });

  const setDir = useCallback((d: 'up' | 'down' | 'left' | 'right', on: boolean) => {
    const key = dir[d];
    if (!key) return;
    if (on && !held.current[d]) { held.current[d] = true; onDown(idPrefix + '-' + d, key, 'dir'); }
    else if (!on && held.current[d]) { held.current[d] = false; onUp(idPrefix + '-' + d, key); }
  }, [dir, onDown, onUp, idPrefix]);

  const releaseAll = useCallback(() => {
    (['up', 'down', 'left', 'right'] as const).forEach((d) => setDir(d, false));
  }, [setDir]);

  const handle = useCallback((clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > R) { dx = (dx / dist) * R; dy = (dy / dist) * R; }
    setNub({ x: dx, y: dy });
    const fx = dx / R, fy = dy / R;
    setDir('left', fx < -DEAD);
    setDir('right', fx > DEAD);
    setDir('up', fy < -DEAD);
    setDir('down', fy > DEAD);
  }, [R, setDir]);

  const end = useCallback(() => {
    setActive(false);
    setNub({ x: 0, y: 0 });
    releaseAll();
  }, [releaseAll]);

  useEffect(() => () => { releaseAll(); }, [releaseAll]);

  return (
    <div
      ref={baseRef}
      aria-label="Movement joystick"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => { e.preventDefault(); try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {} setActive(true); haptic('dir'); handle(e.clientX, e.clientY); }}
      onPointerMove={(e) => { if (active) { e.preventDefault(); handle(e.clientX, e.clientY); } }}
      onPointerUp={(e) => { e.preventDefault(); end(); }}
      onPointerCancel={(e) => { e.preventDefault(); end(); }}
      className="pointer-events-auto relative select-none touch-none rounded-full"
      style={{
        width: size, height: size,
        background: 'radial-gradient(circle at 50% 42%, rgba(30,34,44,0.92), rgba(8,9,12,0.92))',
        border: `2px solid ${active ? CYAN + 'aa' : 'rgba(255,255,255,0.12)'}`,
        boxShadow: active
          ? `0 0 26px ${CYAN}55, inset 0 2px 10px rgba(0,0,0,0.6)`
          : '0 6px 18px rgba(0,0,0,0.55), inset 0 2px 10px rgba(0,0,0,0.55)',
      }}
    >
      {/* ring guide */}
      <div className="pointer-events-none absolute inset-[14%] rounded-full" style={{ border: '1px dashed rgba(255,255,255,0.10)' }} />
      {/* nub */}
      <motion.span
        className="pointer-events-none absolute left-1/2 top-1/2 z-10 rounded-full"
        style={{
          width: size * 0.42, height: size * 0.42,
          marginLeft: -(size * 0.21), marginTop: -(size * 0.21),
          background: active
            ? `radial-gradient(circle at 40% 35%, ${CYAN}, ${CYAN}88 60%, #0c0d12)`
            : 'radial-gradient(circle at 40% 35%, #2b2f3a, #0c0d12)',
          boxShadow: active ? `0 0 20px ${CYAN}aa, inset 0 1px 4px rgba(255,255,255,0.25)` : 'inset 0 1px 3px rgba(255,255,255,0.12), 0 3px 8px rgba(0,0,0,0.6)',
        }}
        animate={{ x: nub.x, y: nub.y }}
        transition={active ? { type: 'tween', duration: 0 } : SPRING}
      />
    </div>
  );
}

function JoystickResponsive(props: Omit<Parameters<typeof Joystick>[0], 'size'>) {
  const vw = useVW();
  const size = Math.min(vw * 0.42, 168);
  return <Joystick {...props} size={size} />;
}

/* Right-stick (look / camera). Smaller footprint; purple tint to read as the
   second stick. Dormant unless the active scheme declares `look`. */
function LookStickResponsive(props: Omit<Parameters<typeof Joystick>[0], 'size' | 'idPrefix' | 'tint'>) {
  const vw = useVW();
  const size = Math.min(vw * 0.30, 120);
  return <Joystick {...props} size={size} idPrefix="look" tint="#A855F7" />;
}

/* ── Shoulder trigger pill ──────────────────────────── */
function Trigger({
  label, color, active, token, onDown, onUp,
}: {
  label: string; color: string; active: boolean; token: number;
  onDown: () => void; onUp: () => void;
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={() => {}}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => { e.preventDefault(); try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {} onDown(); }}
      onPointerUp={(e) => { e.preventDefault(); onUp(); }}
      onPointerCancel={(e) => { e.preventDefault(); onUp(); }}
      onPointerLeave={(e) => { e.preventDefault(); onUp(); }}
      animate={{ scale: active ? 0.94 : 1 }}
      transition={SPRING}
      className="pointer-events-auto relative flex select-none touch-none items-center justify-center overflow-hidden rounded-xl px-7 py-2.5 text-xs font-extrabold uppercase tracking-widest"
      style={{
        color: active ? '#050505' : color,
        border: `2px solid ${active ? color : color + '80'}`,
        background: active
          ? `linear-gradient(180deg, ${color}, ${color}cc)`
          : `linear-gradient(180deg, ${color}22, rgba(8,9,12,0.9))`,
        boxShadow: active
          ? `0 0 24px ${color}bb, inset 0 -2px 8px rgba(0,0,0,0.3)`
          : `0 5px 14px rgba(0,0,0,0.5), inset 0 2px 5px rgba(255,255,255,0.08)`,
        textShadow: active ? 'none' : `0 0 8px ${color}66`,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <Ripple token={token} color={color} />
      <span className="relative z-10">{label}</span>
    </motion.button>
  );
}

export function VirtualController({ scheme }: { scheme: VCScheme }) {
  const [pressed, setPressed] = useState<Record<string, boolean>>({});
  const [tokens, setTokens] = useState<Record<string, number>>({});
  const [visible, setVisible] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const heldRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let coarse = false;
    try { coarse = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900; } catch {}
    setVisible(coarse);
  }, []);

  useEffect(() => () => { Object.values(heldRef.current).forEach((k) => releaseKey(k)); }, []);

  const down = useCallback((id: string, key: string, feel: Feel) => {
    if (heldRef.current[id]) return;
    heldRef.current[id] = key;
    pressKey(key);
    haptic(feel);
    setPressed((p) => ({ ...p, [id]: true }));
    setTokens((t) => ({ ...t, [id]: (t[id] ?? 0) + 1 }));
  }, []);

  const up = useCallback((id: string, key: string) => {
    if (!heldRef.current[id]) return;
    delete heldRef.current[id];
    releaseKey(key);
    setPressed((p) => ({ ...p, [id]: false }));
  }, []);

  const dir = scheme.dir;
  const hasDir = !!dir && (!!dir.up || !!dir.down || !!dir.left || !!dir.right);

  const byPos: Partial<Record<VCButton['pos'], VCButton>> = {};
  scheme.buttons.forEach((b) => { byPos[b.pos] = b; });

  // Unified shoulders (L1/R1/L2/R2) + optional right-stick (look) via the shared
  // controller map. Board spins / tennis lob-topspin now surface on touch too.
  const shoulders = resolveShoulders(scheme);
  const shoulderSlots: ShoulderSlot[] = SHOULDER_SLOTS.filter((s) => !!shoulders[s]);
  const look = resolveLook(scheme);

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        aria-label="Show controller"
        className="pointer-events-auto fixed bottom-4 right-4 z-[45] flex h-12 w-12 items-center justify-center rounded-2xl border border-[#00E5FF]/40 bg-black/70 text-[#00E5FF] backdrop-blur-md transition hover:border-[#00E5FF] hover:shadow-[0_0_22px_rgba(0,229,255,0.55)]"
        style={{ boxShadow: '0 6px 16px rgba(0,0,0,0.5), inset 0 1px 3px rgba(255,255,255,0.08)' }}
      >
        <Gamepad2 className="h-5 w-5" />
      </button>
    );
  }

  const single = scheme.buttons.length === 1 && scheme.buttons[0].pos === 'a';
  const feelFor = (b: VCButton): Feel => (b.color === '#A855F7' ? 'special' : b.hold ? 'hold' : 'action');

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[44] select-none">
      {/* glass scrim behind the tray */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44" style={{ background: 'linear-gradient(to top, rgba(4,5,7,0.72), rgba(4,5,7,0.28) 55%, transparent)' }} />

      {/* Top row: legend + hide */}
      <div className="pointer-events-none relative flex items-center justify-between px-3 pb-1.5">
        <button
          type="button"
          onClick={() => setShowLegend((s) => !s)}
          aria-label="Controls help"
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/75 backdrop-blur-md transition hover:border-[#00E5FF]/50 hover:text-[#00E5FF]"
        >
          <Info className="h-3 w-3" /> Controls
        </button>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Hide controller"
          className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white/60 backdrop-blur-md transition hover:border-white/40 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <AnimatePresence>
        {showLegend && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="pointer-events-none relative mx-auto mb-1.5 max-w-md px-4"
          >
            <div className="pointer-events-auto rounded-xl border border-[#00E5FF]/25 bg-black/80 px-3.5 py-2 text-center font-mono text-[11px] leading-snug text-white/80 backdrop-blur-md" style={{ boxShadow: '0 0 24px rgba(0,229,255,0.12)' }}>
              {scheme.hint}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative flex items-end justify-between gap-2 px-4 pb-5 sm:px-8">
        {/* LEFT: D-pad */}
        <div className="flex-shrink-0">
          {hasDir ? (
            <JoystickResponsive dir={dir!} onDown={down} onUp={up} />
          ) : (
            <span className="block" style={{ width: 'min(38vw,150px)' }} />
          )}
        </div>

        {/* RIGHT: shoulders + (optional look stick) + face buttons */}
        <div className="flex flex-shrink-0 flex-col items-end gap-3">
          {shoulderSlots.length > 0 && (
            <div className="flex items-center gap-2">
              {shoulderSlots.map((slot) => {
                const t = shoulders[slot]!;
                const id = 'sh-' + slot;
                return (
                  <Trigger
                    key={slot}
                    label={t.label}
                    color={t.color}
                    active={!!pressed[id]}
                    token={tokens[id] ?? 0}
                    onDown={() => down(id, t.key, t.hold ? 'hold' : 'action')}
                    onUp={() => up(id, t.key)}
                  />
                );
              })}
            </div>
          )}

          {scheme.trigger && (
            <Trigger
              label={scheme.trigger.label}
              color={scheme.trigger.color}
              active={!!pressed['trig']}
              token={tokens['trig'] ?? 0}
              onDown={() => down('trig', scheme.trigger!.key, 'hold')}
              onUp={() => up('trig', scheme.trigger!.key)}
            />
          )}

          <div className="flex items-end gap-3">
            {look && <LookStickResponsive dir={look} onDown={down} onUp={up} />}
            {single ? (
              <SingleButtonResponsive b={scheme.buttons[0]} pressed={pressed} tokens={tokens} onDown={down} onUp={up} />
            ) : (
              <FaceDiamondResponsive byPos={byPos} pressed={pressed} tokens={tokens} onDown={down} onUp={up} feelFor={feelFor} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Responsive wrappers (compute px sizes from viewport) ── */
function useVW() {
  const [vw, setVw] = useState(390);
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vw;
}

function DPadResponsive(props: Omit<Parameters<typeof DPad>[0], 'size'>) {
  const vw = useVW();
  const size = Math.min(vw * 0.40, 158);
  return <DPad {...props} size={size} />;
}

function SingleButtonResponsive({
  b, pressed, tokens, onDown, onUp,
}: {
  b: VCButton; pressed: Record<string, boolean>; tokens: Record<string, number>;
  onDown: (id: string, key: string, feel: Feel) => void; onUp: (id: string, key: string) => void;
}) {
  const vw = useVW();
  const size = Math.min(vw * 0.32, 128);
  const id = 'face-a';
  const feel: Feel = b.hold ? 'hold' : 'action';
  return (
    <FaceButton
      label={b.label}
      color={b.color}
      active={!!pressed[id]}
      token={tokens[id] ?? 0}
      onDown={() => onDown(id, b.key, feel)}
      onUp={() => onUp(id, b.key)}
      size={size}
      long={b.label.length > 6}
    />
  );
}

function FaceDiamondResponsive({
  byPos, pressed, tokens, onDown, onUp, feelFor,
}: {
  byPos: Partial<Record<VCButton['pos'], VCButton>>;
  pressed: Record<string, boolean>; tokens: Record<string, number>;
  onDown: (id: string, key: string, feel: Feel) => void; onUp: (id: string, key: string) => void;
  feelFor: (b: VCButton) => Feel;
}) {
  const vw = useVW();
  const box = Math.min(vw * 0.44, 176);
  const btn = box * 0.42;
  const slots: { pos: VCButton['pos']; style: React.CSSProperties }[] = [
    { pos: 'y', style: { top: 0, left: '50%', transform: 'translateX(-50%)' } },
    { pos: 'x', style: { left: 0, top: '50%', transform: 'translateY(-50%)' } },
    { pos: 'b', style: { right: 0, top: '50%', transform: 'translateY(-50%)' } },
    { pos: 'a', style: { bottom: 0, left: '50%', transform: 'translateX(-50%)' } },
  ];
  return (
    <div className="relative" style={{ width: box, height: box }}>
      {slots.map(({ pos, style }) => {
        const b = byPos[pos];
        if (!b) return null;
        const id = 'face-' + pos;
        return (
          <div key={pos} className="absolute" style={style}>
            <FaceButton
              label={b.label}
              color={b.color}
              active={!!pressed[id]}
              token={tokens[id] ?? 0}
              onDown={() => onDown(id, b.key, feelFor(b))}
              onUp={() => onUp(id, b.key)}
              size={btn}
              long={b.label.length > 5}
            />
          </div>
        );
      })}
    </div>
  );
}
