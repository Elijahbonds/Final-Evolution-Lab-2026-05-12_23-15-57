'use client';

// THE FIELD BOARD (dunk-next phase 5, 2026-10-06). Four dunkers, a cut to two, a final (core/DunkField): the standings, best first, with
// the cut line drawn under second place in the first round, the finalists marked through and the cut dunkers dimmed after it, and the
// champion in gold at the end. The mode sends it as one string on change only (core/DunkField.encodeField), so this never renders per
// frame. `compact` is the in-play corner board; the night card shows the full one.

import { decodeField, FINALISTS, type FieldRow } from '@/lib/babylon/core/DunkField';
import { HUD_TEXT_ALPHA, HudPlate, HudText, hudColor, type HudTone } from './tv-hud';

const STAGE_LABEL: Record<string, string> = { round1: 'FIRST ROUND · TOP 2 GO THROUGH', cut: 'THE CUT', final: 'THE FINAL', done: 'TONIGHT' };

/** A row's read: the champion in gold, a cut dunker dimmed and struck, the player's own row cyan, the field in plain body. */
function tone(r: FieldRow): { tone: HudTone; alpha: number; bold: boolean; struck: boolean } {
  if (r.state === 'champ') return { tone: 'score', alpha: 1, bold: true, struck: false };
  if (r.state === 'out') return { tone: 'text', alpha: 0.35, bold: false, struck: true };
  if (r.kind === 'player') return { tone: 'you', alpha: 1, bold: true, struck: false };
  return { tone: 'text', alpha: 0.8, bold: false, struck: false };
}

export function DunkFieldBoard({ value, compact = false }: { value: unknown; compact?: boolean }) {
  const f = decodeField(value);
  if (!f) return null;
  const size = compact ? 'caption' : 'label';
  return (
    <div data-fel-field={f.stage}>
      <HudPlate className={compact ? 'px-2 py-1' : 'px-3 py-2'}>
        <HudText as="div" size="caption" alpha={HUD_TEXT_ALPHA.faint} className="mb-0.5 uppercase tracking-[0.18em]">{STAGE_LABEL[f.stage] ?? ''}</HudText>
        {f.rows.map((r, i) => {
          const t = tone(r);
          return (
            <div key={r.name}>
              {f.stage === 'round1' && i === FINALISTS && <div className="my-0.5 border-t border-dashed" style={{ borderColor: hudColor('score', 0.6) }} aria-label="the cut line" />}
              <HudText as="div" size={size} tone={t.tone} alpha={t.alpha} className={`flex items-center justify-between gap-3 uppercase ${t.struck ? 'line-through' : ''}`} style={t.bold ? { fontWeight: 800 } : undefined}>
                <span>
                  {i + 1}. {r.name}
                  {r.kind === 'highlight' && r.state !== 'champ' ? <span className="ml-1 opacity-60">▸</span> : null}
                  {r.state === 'through' ? <span className="ml-1" style={{ color: hudColor('score') }}>✓</span> : null}
                  {r.state === 'champ' ? <span className="ml-1">★</span> : null}
                </span>
                <span className="tabular-nums">{r.total}</span>
              </HudText>
            </div>
          );
        })}
      </HudPlate>
    </div>
  );
}
