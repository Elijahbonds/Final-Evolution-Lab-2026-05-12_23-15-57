'use client';

// THE FIELD BOARD (dunk-next phase 5, 2026-10-06). Four dunkers, a cut to two, a final (core/DunkField): the standings, best first, with
// the cut line drawn under second place in the first round, the finalists marked through and the cut dunkers dimmed after it, and the
// champion in gold at the end. The mode sends it as one string on change only (core/DunkField.encodeField), so this never renders per
// frame. `compact` is the in-play corner board; the night card shows the full one.

import { decodeField, FINALISTS, type FieldRow } from '@/lib/babylon/core/DunkField';

const STAGE_LABEL: Record<string, string> = { round1: 'FIRST ROUND · TOP 2 GO THROUGH', cut: 'THE CUT', final: 'THE FINAL', done: 'TONIGHT' };

function tone(r: FieldRow): string {
  if (r.state === 'champ') return 'text-[var(--fel-gold)] font-bold';
  if (r.state === 'out') return 'text-white/35 line-through decoration-white/25';
  if (r.kind === 'player') return 'text-[var(--fel-cyan)] font-bold';
  return 'text-white/80';
}

export function DunkFieldBoard({ value, compact = false }: { value: unknown; compact?: boolean }) {
  const f = decodeField(value);
  if (!f) return null;
  return (
    <div className={`fel-panel font-mono ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-2 text-[11px]'}`} data-fel-field={f.stage}>
      <p className="mb-0.5 text-[9px] uppercase tracking-[0.18em] text-white/45">{STAGE_LABEL[f.stage] ?? ''}</p>
      {f.rows.map((r, i) => (
        <div key={r.name}>
          {f.stage === 'round1' && i === FINALISTS && <div className="my-0.5 border-t border-dashed border-[var(--fel-gold)]/60" aria-label="the cut line" />}
          <div className={`flex items-center justify-between gap-3 uppercase ${tone(r)}`}>
            <span>
              {i + 1}. {r.name}
              {r.kind === 'highlight' && r.state !== 'champ' ? <span className="ml-1 text-white/30">▸</span> : null}
              {r.state === 'through' ? <span className="ml-1 text-[var(--fel-gold)]">✓</span> : null}
              {r.state === 'champ' ? <span className="ml-1">★</span> : null}
            </span>
            <span className="tabular-nums">{r.total}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
