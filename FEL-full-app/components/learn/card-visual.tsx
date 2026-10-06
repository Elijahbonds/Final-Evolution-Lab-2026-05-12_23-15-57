'use client';

// CardVisual — every picture on a Knowledge Feed card, drawn in code. No images, no URLs: a stat, a few bars, a
// side-by-side, a cycle, a timeline, or one of the topic emblems below. Text-heavy shapes are HTML (they wrap and
// read at TV distance); the emblems are SVG strokes in the topic's accent.

import type { MotifId, Visual } from '@/lib/knowledge/types';

export function CardVisual({ visual, accent, compact = false }: { visual: Visual; accent: string; compact?: boolean }) {
  switch (visual.kind) {
    case 'stat':
      return (
        <div className="text-center" data-visual="stat">
          <div className="font-black leading-none tracking-tight" style={{ color: accent, fontSize: compact ? '2rem' : 'clamp(2.4rem, 7vw, 5rem)' }}>
            {visual.value}
          </div>
          <div className="mt-2 text-white/60" style={{ fontSize: compact ? '0.75rem' : 'clamp(0.85rem, 1.6vw, 1.15rem)' }}>{visual.caption}</div>
        </div>
      );
    case 'bars': {
      const max = Math.max(...visual.items.map((i) => i.value), 0) || 1;
      const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString('en-US') : String(v));
      return (
        <figure className="w-full" data-visual="bars">
          <div className="space-y-2">
            {visual.items.map((it) => (
              <div key={it.label} className="grid grid-cols-[minmax(5.5rem,34%)_1fr] items-center gap-3">
                <span className="truncate text-right text-[13px] text-white/70 md:text-base">{it.label}</span>
                <span className="flex items-center gap-2">
                  <span className="h-4 rounded-full md:h-6" style={{ width: `${Math.max(3, (it.value / max) * 78)}%`, background: `linear-gradient(90deg, ${accent}, ${accent}aa)` }} />
                  <span className="font-mono text-[12px] tabular-nums text-white/80 md:text-sm">{fmt(it.value)}{visual.unit ?? ''}</span>
                </span>
              </div>
            ))}
          </div>
          {visual.caption && <figcaption className="mt-3 text-center text-[12px] text-white/50 md:text-sm">{visual.caption}</figcaption>}
        </figure>
      );
    }
    case 'compare':
      return (
        <div className="grid w-full grid-cols-2 gap-3" data-visual="compare">
          {([visual.left, visual.right] as const).map((side, i) => (
            <div key={i} className="rounded-2xl border p-3 text-center md:p-5"
              style={{ borderColor: i === 0 ? 'rgba(255,255,255,0.14)' : `${accent}66`, background: i === 0 ? 'rgba(255,255,255,0.03)' : `${accent}12` }}>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] md:text-sm" style={{ color: i === 0 ? 'rgba(255,255,255,0.55)' : accent }}>{side.label}</div>
              <div className="mt-1.5 text-[15px] font-semibold leading-snug text-white md:text-xl">{side.text}</div>
            </div>
          ))}
        </div>
      );
    case 'cycle':
      return (
        <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2" data-visual="cycle">
          {visual.steps.map((s, i) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="rounded-full border px-3 py-1.5 text-[13px] font-semibold text-white md:px-4 md:py-2 md:text-lg"
                style={{ borderColor: `${accent}77`, background: `${accent}14` }}>{s}</span>
              <span aria-hidden className="text-white/40">{i < visual.steps.length - 1 ? '→' : '↺'}</span>
            </span>
          ))}
        </div>
      );
    case 'timeline':
      return (
        <div className="relative w-full" data-visual="timeline">
          <div className="absolute left-[6%] right-[6%] top-[1.05rem] h-px md:top-[1.35rem]" style={{ background: `${accent}66` }} />
          <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${visual.points.length}, minmax(0, 1fr))` }}>
            {visual.points.map((p) => (
              <li key={p.at + p.label} className="flex flex-col items-center px-1 text-center">
                <span className="font-mono text-[11px] font-bold text-white/70 md:text-sm">{p.at}</span>
                <span className="my-1 h-2.5 w-2.5 rounded-full md:h-3.5 md:w-3.5" style={{ background: accent, boxShadow: `0 0 10px ${accent}` }} />
                <span className="text-[12px] leading-tight text-white/85 md:text-base">{p.label}</span>
              </li>
            ))}
          </ol>
        </div>
      );
    case 'motif':
      return <Motif motif={visual.motif} accent={accent} size={compact ? 64 : undefined} />;
  }
}

/** The topic emblems: a few strokes each, sized to the card. */
export function Motif({ motif, accent, size }: { motif: MotifId; accent: string; size?: number }) {
  const common = { fill: 'none', stroke: accent, strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const soft = { fill: `${accent}22`, stroke: 'none' };
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={`${motif} illustration`} data-visual="motif"
      style={{ width: size ?? 'clamp(96px, 22vw, 200px)', height: size ?? 'clamp(96px, 22vw, 200px)', filter: `drop-shadow(0 0 18px ${accent}44)` }}>
      <circle cx="60" cy="60" r="54" {...soft} />
      {MOTIF_PATHS[motif](common)}
    </svg>
  );
}

type Stroke = { fill: string; stroke: string; strokeWidth: number; strokeLinecap: 'round'; strokeLinejoin: 'round' };

const MOTIF_PATHS: Record<MotifId, (p: Stroke) => JSX.Element> = {
  brain: (p) => (<g {...p}><path d="M60 30c-8-8-24-4-24 8-10 2-12 16-4 22-6 8 0 20 10 20 2 8 12 12 18 6V30z" /><path d="M60 30c8-8 24-4 24 8 10 2 12 16 4 22 6 8 0 20-10 20-2 8-12 12-18 6" /><path d="M46 48c4 2 6 6 6 10M74 48c-4 2-6 6-6 10M44 70c5-1 9 1 12 5M76 70c-5-1-9 1-12 5" /></g>),
  coin: (p) => (<g {...p}><ellipse cx="60" cy="48" rx="28" ry="10" /><path d="M32 48v24c0 6 12 10 28 10s28-4 28-10V48" /><path d="M32 60c0 6 12 10 28 10s28-4 28-10" /></g>),
  column: (p) => (<g {...p}><path d="M30 36h60l-6-8H36z" /><path d="M38 36v46M50 36v46M70 36v46M82 36v46" /><path d="M28 88h64M32 82h56" /></g>),
  atom: (p) => (<g {...p}><circle cx="60" cy="60" r="5" fill={p.stroke} /><ellipse cx="60" cy="60" rx="34" ry="12" /><ellipse cx="60" cy="60" rx="34" ry="12" transform="rotate(60 60 60)" /><ellipse cx="60" cy="60" rx="34" ry="12" transform="rotate(120 60 60)" /></g>),
  heart: (p) => (<g {...p}><path d="M60 88S30 70 30 50c0-10 8-17 16-17 6 0 11 3 14 9 3-6 8-9 14-9 8 0 16 7 16 17 0 20-30 38-30 38z" /><path d="M34 60h14l5-9 7 18 6-12 4 3h16" /></g>),
  clock: (p) => (<g {...p}><circle cx="60" cy="62" r="28" /><path d="M60 46v16l11 8" /><path d="M52 28h16M60 28v6" /></g>),
  scale: (p) => (<g {...p}><path d="M60 30v56M42 88h36M34 40h52" /><path d="M34 40l-12 24h24zM86 40l-12 24h24z" /></g>),
  quote: (p) => (<g {...p}><path d="M34 70c0-14 6-22 16-26M34 70a8 8 0 1 0 16 0 8 8 0 1 0-16 0" /><path d="M66 70c0-14 6-22 16-26M66 70a8 8 0 1 0 16 0 8 8 0 1 0-16 0" /></g>),
  chip: (p) => (<g {...p}><rect x="38" y="38" width="44" height="44" rx="6" /><rect x="50" y="50" width="20" height="20" rx="2" /><path d="M48 30v8M60 30v8M72 30v8M48 82v8M60 82v8M72 82v8M30 48h8M30 60h8M30 72h8M82 48h8M82 60h8M82 72h8" /></g>),
  note: (p) => (<g {...p}><path d="M50 80V36l32-8v44" /><circle cx="42" cy="80" r="8" /><circle cx="74" cy="72" r="8" /><path d="M50 46l32-8" /></g>),
  leaf: (p) => (<g {...p}><path d="M32 86c0-34 22-54 56-54 0 34-20 56-54 56" /><path d="M32 86c14-14 26-26 40-38M50 68h14M58 58l-2-12" /></g>),
  planet: (p) => (<g {...p}><circle cx="60" cy="60" r="20" /><ellipse cx="60" cy="60" rx="40" ry="11" transform="rotate(-20 60 60)" /><circle cx="94" cy="30" r="2" fill={p.stroke} /><circle cx="26" cy="92" r="1.5" fill={p.stroke} /></g>),
  book: (p) => (<g {...p}><path d="M60 40c-8-6-18-8-28-8v50c10 0 20 2 28 8 8-6 18-8 28-8V32c-10 0-20 2-28 8z" /><path d="M60 40v50" /><path d="M40 46h12M40 56h12M68 46h12M68 56h12" /></g>),
  wheel: (p) => (
    <g>
      {['#e8463c', '#f39c32', '#f4d03f', '#58b947', '#2e86de', '#8e44ad'].map((c, i) => {
        const a0 = (i * 60 - 90) * (Math.PI / 180);
        const a1 = ((i + 1) * 60 - 90) * (Math.PI / 180);
        const r = 34;
        return <path key={c} d={`M60 60L${60 + r * Math.cos(a0)} ${60 + r * Math.sin(a0)}A${r} ${r} 0 0 1 ${60 + r * Math.cos(a1)} ${60 + r * Math.sin(a1)}z`} fill={c} opacity={0.9} />;
      })}
      <circle cx="60" cy="60" r="10" fill="#050505" />
      <path d="M60 22v-6M60 98v6" stroke={p.stroke} strokeWidth={2} strokeLinecap="round" />
    </g>
  ),
  perspective: (p) => (<g {...p}><path d="M20 58h80" strokeWidth={1.5} /><path d="M28 96L60 58l32 38" /><path d="M20 76l40-18M100 76L60 58M44 96l16-38M76 96L60 58" strokeWidth={1.5} opacity={0.7} /><circle cx="60" cy="58" r="3" fill={p.stroke} /></g>),
  thirds: (p) => (<g {...p}><rect x="24" y="30" width="72" height="60" rx="3" /><path d="M48 30v60M72 30v60M24 50h72M24 70h72" strokeWidth={1.5} opacity={0.6} /><circle cx="72" cy="50" r="6" fill={p.stroke} /></g>),
};
