'use client';

// THE BEAT STRIP (dunk-next phase 1, 2026-10-06). The flight is a four-beat bar — RISE · HANG · PRE · SLAM (core/DunkBeats) —
// heard as a rising tick and drawn here: a pip per beat, lit as the flight crosses it, each trick under the beat it went off on
// (gold and starred when it was thrown ON the beat), the slam's read under the fourth, and the whole strip gold on a PERFECT
// FLIGHT. The mode sends it as one string on change only (a handful of writes a flight), so this never renders per frame.

import { BEAT_ORDER, BEAT_LABEL, decodeBeatStrip, type SlamZone, type BeatGradeKind } from '@/lib/babylon/core/DunkBeats';

const SLAM_WORD: Record<SlamZone, string> = { ontime: 'ON TIME', early: 'EARLY', late: 'LATE', cue: 'EARLY', miss: 'NO SLAM' };
const SLAM_TONE: Record<SlamZone, string> = {
  ontime: 'text-[var(--fel-gold)]', early: 'text-amber-300', late: 'text-amber-300', cue: 'text-amber-300', miss: 'text-red-400',
};
const MARK_TONE: Record<BeatGradeKind, string> = {
  onbeat: 'text-[var(--fel-gold)] font-bold', early: 'text-white/70', off: 'text-white/45 italic',
};

export function DunkBeatStrip({ value }: { value: unknown }) {
  const s = decodeBeatStrip(value);
  if (!s) return null;
  return (
    <div
      className={`fel-panel inline-flex items-start gap-2 px-3 py-1.5 font-mono transition-shadow ${s.perfect ? 'ring-2 ring-[var(--fel-gold)] shadow-[0_0_18px_rgba(255,215,94,0.45)]' : ''}`}
      data-fel-beats={s.at}
    >
      {BEAT_ORDER.map((b, i) => {
        const lit = i <= s.at, now = i === s.at;
        const marks = b === 'slam' ? [] : s.marks.filter((m) => m.beat === b);
        return (
          <div key={b} className="flex min-w-[3.4rem] flex-col items-center gap-0.5">
            <span
              className={`h-2.5 w-2.5 rounded-full transition-all duration-100 ${now ? 'scale-150' : ''} ${
                lit ? (s.perfect ? 'bg-[var(--fel-gold)]' : 'bg-[var(--fel-cyan)]') : 'bg-white/20'}`}
            />
            <span className={`text-[10px] tracking-[0.18em] ${lit ? 'text-white' : 'text-white/40'}`}>{BEAT_LABEL[b]}</span>
            {marks.map((m, k) => (
              <span key={k} className={`max-w-[7rem] truncate text-[10px] leading-tight ${MARK_TONE[m.grade]}`}>
                {m.grade === 'onbeat' ? '★ ' : ''}{m.label}
              </span>
            ))}
            {b === 'slam' && s.slam ? <span className={`text-[10px] font-bold leading-tight ${SLAM_TONE[s.slam]}`}>{SLAM_WORD[s.slam]}</span> : null}
          </div>
        );
      })}
      {s.perfect ? <span className="fel-heading self-center pl-1 text-sm font-black text-[var(--fel-gold)]">PERFECT FLIGHT</span> : null}
    </div>
  );
}
