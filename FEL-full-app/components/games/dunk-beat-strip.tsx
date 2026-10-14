'use client';

// THE BEAT STRIP (dunk-next phase 1, 2026-10-06). The flight is a four-beat bar — RISE · HANG · PRE · SLAM (core/DunkBeats) —
// heard as a rising tick and drawn here: a pip per beat, lit as the flight crosses it, each trick under the beat it went off on
// (gold and starred when it was thrown ON the beat), the slam's read under the fourth, and the whole strip gold on a PERFECT
// FLIGHT. The mode sends it as one string on change only (a handful of writes a flight), so this never renders per frame.

import { BEAT_ORDER, BEAT_LABEL, decodeBeatStrip, type SlamZone, type BeatGradeKind } from '@/lib/babylon/core/DunkBeats';
import { HudPlate, HudText, hudColor, type HudTone } from './tv-hud';

const SLAM_WORD: Record<SlamZone, string> = { ontime: 'ON TIME', early: 'EARLY', late: 'LATE', cue: 'EARLY', miss: 'NO SLAM' };
const SLAM_TONE: Record<SlamZone, HudTone> = { ontime: 'score', early: 'heat', late: 'heat', cue: 'heat', miss: 'danger' };
const MARK_STYLE: Record<BeatGradeKind, { tone: HudTone; alpha: number; bold?: boolean; italic?: boolean }> = {
  onbeat: { tone: 'score', alpha: 1, bold: true }, early: { tone: 'text', alpha: 0.7 }, off: { tone: 'text', alpha: 0.45, italic: true },
};

export function DunkBeatStrip({ value }: { value: unknown }) {
  const s = decodeBeatStrip(value);
  if (!s) return null;
  return (
    <div data-fel-beats={s.at} className="inline-flex">
      <HudPlate
        className="inline-flex items-start gap-2 px-3 py-1.5 transition-shadow"
        style={s.perfect ? { boxShadow: `0 0 0 2px ${hudColor('score')}, 0 0 18px ${hudColor('score', 0.45)}` } : undefined}
      >
        {BEAT_ORDER.map((b, i) => {
          const lit = i <= s.at, now = i === s.at;
          const marks = b === 'slam' ? [] : s.marks.filter((m) => m.beat === b);
          return (
            <div key={b} className="flex min-w-[3.4rem] flex-col items-center gap-0.5">
              <span
                className={`h-2.5 w-2.5 rounded-full transition-all duration-100 ${now ? 'scale-150' : ''}`}
                style={{ background: lit ? hudColor(s.perfect ? 'score' : 'you') : 'rgba(255, 255, 255, 0.2)' }}
              />
              <HudText size="caption" alpha={lit ? 1 : 0.4} className="tracking-[0.18em]">{BEAT_LABEL[b]}</HudText>
              {marks.map((m, k) => {
                const st = MARK_STYLE[m.grade];
                return (
                  <HudText key={k} size="caption" tone={st.tone} alpha={st.alpha} className={`max-w-[7rem] truncate ${st.italic ? 'italic' : ''}`} style={st.bold ? { fontWeight: 800 } : undefined}>
                    {m.grade === 'onbeat' ? '★ ' : ''}{m.label}
                  </HudText>
                );
              })}
              {b === 'slam' && s.slam ? <HudText size="caption" tone={SLAM_TONE[s.slam]} style={{ fontWeight: 800 }}>{SLAM_WORD[s.slam]}</HudText> : null}
            </div>
          );
        })}
        {s.perfect ? <HudText size="value" tone="score" className="self-center pl-1" style={{ fontWeight: 800 }}>PERFECT FLIGHT</HudText> : null}
      </HudPlate>
    </div>
  );
}
