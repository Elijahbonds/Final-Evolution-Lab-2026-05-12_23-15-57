'use client';

// HudMeter — the one bar every gauge draws with (A9.13): a fill (FLOW, ENERGY, SLINGSHOT, KINETIC), zones with names
// over them (the penalty's SOFT / DRIVEN / TOP BINS / OVER, the tennis window's EARLY → PERFECT, golf's accuracy band),
// tick lines with optional captions (golf's carry every tenth, the breakaway's evade lines), and markers (the moving
// needle, a locked power line) with an optional caption under one.
//
// PRESENTATION ONLY: every number is the host's (from the mode's HUD); the meter only clamps it to its own box. Fractions
// are 0..1 along the bar; `value` is on 0..max.
import type { CSSProperties, ReactNode } from 'react';
import { HUD_TEXT_ALPHA, clamp01, hudColor, hudType, meterPct, type HudSize, type HudTone } from './tokens';

export interface MeterSegment { from: number; to: number; tone?: HudTone; alpha?: number; label?: ReactNode; labelTone?: HudTone; edge?: boolean }
export interface MeterTick { at: number; major?: boolean; label?: ReactNode; labelTone?: HudTone; labelAlpha?: number; line?: boolean }
export interface MeterMarker { at: number; tone?: HudTone; width?: number; glow?: boolean; label?: ReactNode; labelTone?: HudTone; labelSize?: HudSize }

/** The thicknesses the hosts used (design px): a hairline gauge, the common bar, a thick bar, and the swing meters. */
export const METER_HEIGHT = { thin: 6, bar: 8, thick: 10, strip: 16, tall: 24, swing: 28 } as const;
export type MeterHeight = keyof typeof METER_HEIGHT;

const pc = (f: number) => `${Math.round(clamp01(f) * 10000) / 100}%`;

export function HudMeter({
  label, labelTone, labelAlpha, status, statusTone = 'text', layout = 'stack', value, max = 100, tone = 'you', fillAlpha = 1,
  fillStyle, height = 'bar', width = '7rem', segments, ticks, markers, framed = false, glow = false, round = true, className = '',
  title, children,
}: {
  label?: ReactNode;
  labelTone?: HudTone;
  labelAlpha?: number;
  /** A short state read after the label (READY, SLAM READY, LAND IT). */
  status?: ReactNode;
  statusTone?: HudTone;
  /** 'stack': label over the bar. 'inline': label, bar, status in one row. */
  layout?: 'stack' | 'inline';
  /** The fill, from the left, on 0..max. null / undefined: no fill (a zones-and-needle meter). */
  value?: number | null;
  max?: number;
  tone?: HudTone;
  fillAlpha?: number;
  /** A fill that is not a flat tone (a gradient the mode's state calls for). */
  fillStyle?: CSSProperties;
  height?: MeterHeight;
  /** The bar's width (any CSS length; design px are zoomed with the HUD). */
  width?: string;
  segments?: MeterSegment[];
  ticks?: MeterTick[];
  markers?: MeterMarker[];
  /** A hairline border round the bar (the swing meters). */
  framed?: boolean;
  /** Light the bar in its tone (full / ready). */
  glow?: boolean;
  round?: boolean;
  className?: string;
  title?: string;
  /** Extra layers inside the bar box (rare: a mode-specific overlay). */
  children?: ReactNode;
}) {
  const h = METER_HEIGHT[height];
  const radius = round ? (h <= 10 ? 999 : 6) : 2;
  const labelEl = label != null && label !== '' && (
    <span style={{ ...hudType('caption'), color: labelTone ? hudColor(labelTone, labelAlpha ?? 1) : hudColor('text', labelAlpha ?? HUD_TEXT_ALPHA.muted) }}>{label}</span>
  );
  const statusEl = status != null && status !== '' && (
    <span style={{ ...hudType('caption'), fontWeight: 800, color: hudColor(statusTone) }}>{status}</span>
  );
  const bar = (
    <div
      data-hud-meter-bar
      className="relative shrink-0"
      style={{
        width, height: h, borderRadius: radius,
        background: 'rgba(6, 9, 14, 0.62)',
        border: framed ? '1px solid rgba(255, 255, 255, 0.22)' : undefined,
        overflow: segments?.some((s) => s.label != null) || ticks?.some((t) => t.label != null) || markers?.some((m) => m.label != null) ? 'visible' : 'hidden',
        boxShadow: glow ? `0 0 12px ${hudColor(tone, 0.65)}` : undefined,
      }}
    >
      {segments?.map((s, i) => (
        <div key={`s${i}`} className="absolute inset-y-0" style={{ left: pc(s.from), width: pc(clamp01(s.to) - clamp01(s.from)), background: s.tone ? hudColor(s.tone, s.alpha ?? 0.5) : `rgba(255,255,255,${s.alpha ?? 0.06})` }}>
          {s.label != null && s.label !== '' && (
            <span className="absolute bottom-full left-1/2 mb-[2px] -translate-x-1/2 whitespace-nowrap" style={{ ...hudType('caption'), color: s.labelTone ? hudColor(s.labelTone) : hudColor('text', 0.7) }}>{s.label}</span>
          )}
          {s.edge && <div className="absolute inset-y-0 right-0 w-px" style={{ background: 'rgba(255,255,255,0.7)' }} />}
        </div>
      ))}
      {value != null && Number.isFinite(value) && (
        <div
          data-hud-meter-fill
          className="absolute inset-y-0 left-0 transition-[width] duration-150"
          style={{ width: meterPct(value, max), borderRadius: radius, background: hudColor(tone, fillAlpha), ...fillStyle }}
        />
      )}
      {ticks?.map((t, i) => (
        <div key={`t${i}`} className="absolute bottom-0 w-px" style={{ left: pc(t.at), height: t.major === false ? '50%' : '100%', background: t.line === false ? 'transparent' : t.major === false ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.7)' }} />
      ))}
      {ticks?.map((t, i) => t.label != null && t.label !== '' && (
        // anchored to the BAR's top, not the tick line: a minor tick is half height, and its caption sat inside the bar
        <span key={`tl${i}`} className="absolute bottom-full mb-[2px] -translate-x-1/2 whitespace-nowrap" style={{ left: pc(t.at), ...hudType('caption'), color: t.labelTone ? hudColor(t.labelTone, t.labelAlpha ?? 1) : hudColor('text', t.labelAlpha ?? 0.7) }}>{t.label}</span>
      ))}
      {markers?.map((m, i) => (
        <div
          key={`m${i}`}
          data-hud-meter-marker
          className="absolute inset-y-0 -translate-x-1/2"
          style={{ left: pc(m.at), width: m.width ?? 4, background: hudColor(m.tone ?? 'text'), boxShadow: m.glow ? `0 0 8px ${hudColor(m.tone ?? 'text')}` : undefined }}
        >
          {m.label != null && m.label !== '' && (
            <span className="absolute left-1/2 top-full mt-[2px] -translate-x-1/2 whitespace-nowrap" style={{ ...hudType(m.labelSize ?? 'label'), color: hudColor(m.labelTone ?? 'you') }}>{m.label}</span>
          )}
        </div>
      ))}
      {children}
    </div>
  );
  if (layout === 'inline') {
    return (
      <div data-hud-meter title={title} className={`flex items-center gap-[0.5em] ${className}`}>
        {labelEl}{bar}{statusEl}
      </div>
    );
  }
  return (
    <div data-hud-meter title={title} className={`flex flex-col gap-[0.25em] ${className}`}>
      {(labelEl || statusEl) && <div className="flex items-baseline gap-[0.5em]">{labelEl}{statusEl}</div>}
      {bar}
    </div>
  );
}

/** Pips: a row of small blocks lit up to a count (FREE RUN's flow tiers, golf's flicks). */
export function HudPips({ count, of, tone = 'you', tones, width = 20, height = 8 }: {
  count: number;
  of: number;
  tone?: HudTone;
  /** Per-pip tones (index 0 = the first pip), overriding `tone`. */
  tones?: HudTone[];
  width?: number;
  height?: number;
}) {
  const n = Math.max(0, Math.floor(of));
  return (
    <span data-hud-pips className="inline-flex items-center gap-[3px]">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="inline-block rounded-sm" style={{ width, height, background: i < count ? hudColor(tones?.[i] ?? tone) : 'rgba(255,255,255,0.15)' }} />
      ))}
    </span>
  );
}
