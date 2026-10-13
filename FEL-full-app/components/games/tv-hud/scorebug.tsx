'use client';

// The scorebug family (A9.13): the plate every readout sits on, the chip (a label and a value), and the scorebug — the
// broadcast score strip (YOU 3 – 1 THEM · 30–15 · 4 STRAIGHT) whose numbers swell when they change.
//
// PRESENTATION ONLY: every piece renders what the host hands it. Nothing here reads a mode, a score rule or a timer.
import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { HUD_PLATE, HUD_TEXT_ALPHA, hudColor, hudPop, hudType, type HudSize, type HudTone } from './tokens';
import { useHudReducedMotion } from './use-hud-motion';

/** The plate: dark glass with a hairline edge. `accent` draws a tone along its left edge (a side's colour). */
export function HudPlate({ children, className = '', style, accent, as = 'div', ...rest }: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  accent?: HudTone;
  as?: 'div' | 'span';
  title?: string;
  'data-hud'?: string;
}) {
  const Tag = as;
  return (
    <Tag
      data-hud-plate
      className={className}
      style={{
        background: HUD_PLATE.background,
        border: HUD_PLATE.border,
        borderRadius: HUD_PLATE.radius,
        boxShadow: accent ? `inset 3px 0 0 ${hudColor(accent)}, ${HUD_PLATE.shadow}` : HUD_PLATE.shadow,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** HUD text at a step of the 10-foot scale, in a palette tone (and alpha). The building block for one-off reads. */
export function HudText({ children, size = 'label', tone = 'text', alpha = 1, className = '', style, as = 'span', ...rest }: {
  children?: ReactNode;
  size?: HudSize;
  tone?: HudTone;
  alpha?: number;
  className?: string;
  style?: CSSProperties;
  as?: 'span' | 'div';
  title?: string;
  'data-hud'?: string;
}) {
  const Tag = as;
  return (
    <Tag className={className} style={{ ...hudType(size), color: hudColor(tone, alpha), ...style }} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * A chip: an optional small label, then the value, on a plate. `tone` colours the value; the label is the muted body
 * colour unless `labelTone` says otherwise. `glow` lights the chip in its tone (a ready state). `plate={false}` drops
 * the glass for a chip that sits inside another plate.
 */
export function HudChip({
  label, children, tone = 'text', alpha = 1, labelTone, size = 'label', labelSize = 'caption', plate = true, glow = false,
  fill, className = '', style, title, ...rest
}: {
  label?: ReactNode;
  children?: ReactNode;
  tone?: HudTone;
  alpha?: number;
  labelTone?: HudTone;
  size?: HudSize;
  labelSize?: HudSize;
  plate?: boolean;
  glow?: boolean;
  /** Tint the plate itself in the tone at this alpha (a state chip: BREAKAWAY, TARGETS). */
  fill?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
  'data-hud'?: string;
}) {
  const body = (
    <>
      {label != null && label !== '' && (
        <span style={{ ...hudType(labelSize), color: labelTone ? hudColor(labelTone) : hudColor('text', HUD_TEXT_ALPHA.muted) }}>{label}</span>
      )}
      {children != null && <span style={{ ...hudType(size), color: hudColor(tone, alpha) }}>{children}</span>}
    </>
  );
  const cls = `inline-flex items-baseline gap-[0.4em] whitespace-nowrap px-[0.75em] py-[0.25em] ${className}`;
  const tint: CSSProperties = fill != null ? { background: hudColor(tone, fill) } : {};
  const lit: CSSProperties = glow ? { boxShadow: `0 0 10px ${hudColor(tone, 0.6)}, 0 0 0 1px ${hudColor(tone, 0.7)}` } : {};
  if (!plate) return <span data-hud-chip className={cls} style={{ ...tint, ...lit, ...style }} title={title} {...rest}>{body}</span>;
  return (
    <HudPlate as="span" data-hud={rest['data-hud']} title={title} className={cls} style={{ ...tint, ...lit, ...style }}>
      {body}
    </HudPlate>
  );
}

/** A number that swells when it changes (keyed on the value), in the display face. `pop={false}` for one that ticks. */
export function ScoreValue({ value, size = 'score', tone = 'text', pop = true, className = '', style }: {
  value: ReactNode;
  size?: HudSize;
  tone?: HudTone;
  pop?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const reduced = useHudReducedMotion();
  const s: CSSProperties = { ...hudType(size), color: hudColor(tone), display: 'inline-block', fontVariantNumeric: 'tabular-nums', ...style };
  if (!pop) return <span data-hud-value className={className} style={s}>{value}</span>;
  const p = hudPop(reduced);
  return (
    <motion.span key={String(value)} data-hud-value className={className} style={s} initial={p.initial} animate={p.animate} transition={'transition' in p ? p.transition : undefined}>
      {value}
    </motion.span>
  );
}

/** One cell of a scorebug: a label over (or beside) its number. */
export function ScoreCell({ label, value, tone = 'text', labelTone, size = 'score', pop = true, inline = false, className = '' }: {
  label?: ReactNode;
  value: ReactNode;
  tone?: HudTone;
  labelTone?: HudTone;
  size?: HudSize;
  pop?: boolean;
  /** Label beside the value instead of over it (a one-row bug). */
  inline?: boolean;
  className?: string;
}) {
  return (
    <span data-hud-cell className={`inline-flex ${inline ? 'items-baseline gap-[0.35em]' : 'flex-col items-center leading-none'} ${className}`}>
      {label != null && label !== '' && (
        <span style={{ ...hudType('caption'), color: labelTone ? hudColor(labelTone) : hudColor('text', HUD_TEXT_ALPHA.muted) }}>{label}</span>
      )}
      <ScoreValue value={value} size={size} tone={tone} pop={pop} />
    </span>
  );
}

/** The thin rule between scorebug cells. */
export function ScoreDivider({ children = '·' }: { children?: ReactNode }) {
  return <span aria-hidden style={{ ...hudType('label'), color: hudColor('text', HUD_TEXT_ALPHA.faint) }}>{children}</span>;
}

/**
 * The scorebug: one plate, its cells in a row. The host places it (a corner, top-centre); the bug never positions
 * itself, so a migrated host keeps every readout where it was.
 */
export function Scorebug({ children, className = '', accent, title, ...rest }: {
  children: ReactNode;
  className?: string;
  accent?: HudTone;
  title?: string;
  'data-hud'?: string;
}) {
  return (
    <HudPlate data-hud={rest['data-hud'] ?? 'scorebug'} accent={accent} title={title} className={`inline-flex items-center gap-[0.6em] px-[0.8em] py-[0.3em] ${className}`}>
      {children}
    </HudPlate>
  );
}
