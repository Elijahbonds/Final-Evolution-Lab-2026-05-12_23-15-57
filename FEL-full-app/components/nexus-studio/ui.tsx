'use client';

// The Studio's small controls, on the app theme (`--fel-*`) and the TV-HUD palette (components/games/tv-hud/tokens.ts):
// dark glass plates, a hairline edge, cyan for focus and the selection, gold for the play subject.

import { useEffect, useState, type ReactNode } from 'react';

export const C = {
  bg: 'var(--fel-bg, #050505)',
  surface: 'var(--fel-surface, #0c0c11)',
  surface2: 'var(--fel-surface-2, #161d27)',
  line: 'var(--fel-line, #232c38)',
  text: 'var(--fel-text, #f2f5f9)',
  dim: 'var(--fel-text-dim, #8b97a5)',
  cyan: 'var(--fel-cyan, #00E5FF)',
  gold: 'var(--fel-gold, #FFD700)',
  emerald: 'var(--fel-emerald, #00FF9D)',
  ember: 'var(--fel-ember, #FF7A2F)',
  crimson: 'var(--fel-crimson, #FF3366)',
  violet: 'var(--fel-violet, #A855F7)',
} as const;

export function PanelTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pb-1.5 pt-3">
      <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.dim }}>{children}</h2>
      {right}
    </div>
  );
}

export function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="grid grid-cols-[92px_1fr] items-center gap-2 px-3 py-1 text-[12px]" title={hint}>
      <span className="truncate" style={{ color: C.dim }}>{label}</span>
      <span className="min-w-0">{children}</span>
    </label>
  );
}

const inputCls = 'w-full rounded-md border bg-transparent px-2 py-1 text-[12px] outline-none focus:border-[color:var(--fel-cyan)]';

/** A number that commits as you type (coalesced by the caller's group) and settles on blur. */
export function NumberField({ value, onChange, onDone, step = 0.1, min, max, disabled, label }: {
  value: number; onChange(v: number): void; onDone?(): void; step?: number; min?: number; max?: number; disabled?: boolean; label?: string;
}) {
  const [text, setText] = useState(fmt(value));
  useEffect(() => { setText(fmt(value)); }, [value]);
  return (
    <input
      type="number" inputMode="decimal" aria-label={label} className={inputCls} style={{ borderColor: C.line, color: C.text }}
      value={text} step={step} min={min} max={max} disabled={disabled}
      onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(n)) onChange(n); }}
      onBlur={() => { setText(fmt(value)); onDone?.(); }}
    />
  );
}
function fmt(n: number): string { return String(Math.round(n * 1000) / 1000); }

export function TextField({ value, onChange, onDone, disabled, label, maxLength = 60 }: { value: string; onChange(v: string): void; onDone?(): void; disabled?: boolean; label?: string; maxLength?: number }) {
  return (
    <input type="text" aria-label={label} className={inputCls} style={{ borderColor: C.line, color: C.text }} value={value} maxLength={maxLength} disabled={disabled}
      onChange={(e) => onChange(e.target.value)} onBlur={() => onDone?.()} />
  );
}

export function ColorField({ value, onChange, onDone, disabled, label }: { value: string; onChange(v: string): void; onDone?(): void; disabled?: boolean; label?: string }) {
  return (
    <span className="flex items-center gap-2">
      <input type="color" aria-label={label} value={value} disabled={disabled} className="h-6 w-9 cursor-pointer rounded border bg-transparent p-0" style={{ borderColor: C.line }}
        onChange={(e) => onChange(e.target.value)} onBlur={() => onDone?.()} />
      <code className="text-[12px]" style={{ color: C.dim }}>{value}</code>
    </span>
  );
}

export function Select<T extends string>({ value, options, onChange, disabled, label }: { value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange(v: T): void; disabled?: boolean; label?: string }) {
  return (
    <select aria-label={label} className={inputCls} style={{ borderColor: C.line, color: C.text, background: C.surface }} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange(v: boolean): void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className="relative h-5 w-9 rounded-full border transition-colors disabled:opacity-40" style={{ borderColor: on ? C.cyan : C.line, background: on ? 'rgba(0,229,255,0.25)' : 'transparent' }}>
      <span className="absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all" style={{ left: on ? 18 : 2, background: on ? C.cyan : C.dim }} />
    </button>
  );
}

export function ToolButton({ active, onClick, title, children, disabled, shortcut }: { active?: boolean; onClick(): void; title: string; children: ReactNode; disabled?: boolean; shortcut?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={shortcut ? `${title} (${shortcut})` : title} aria-label={title} aria-pressed={active}
      className="flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border px-2 text-[12px] transition-colors disabled:opacity-35"
      style={{ borderColor: active ? C.cyan : 'transparent', background: active ? 'rgba(0,229,255,0.14)' : 'transparent', color: active ? C.cyan : C.text }}>
      {children}
    </button>
  );
}

export function Plate({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border ${className}`} style={{ background: 'rgba(6, 9, 14, 0.66)', borderColor: 'rgba(255,255,255,0.12)', boxShadow: '0 2px 10px rgba(0,0,0,0.35)' }}>{children}</div>;
}
