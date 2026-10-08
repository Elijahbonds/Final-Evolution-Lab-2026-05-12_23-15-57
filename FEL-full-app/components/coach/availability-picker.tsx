'use client';
// COACH-AI Phase 8 (2026-10-07): the coach sets one athlete's availability — Full / Limited / Out and, for Limited or
// Out, an optional return day. Three buttons and a date: there is no text box, so nothing typed here can become a
// diagnosis (lib/coach/availability.ts). Rendered by the Clients view only when the server says the feature is on.
import { useState } from 'react';
import { toast } from 'sonner';
import { AVAILABILITY_LABEL, AVAILABILITY_MAX_DAYS_AHEAD, AVAILABILITY_STATUSES, availabilityLine, todayDay, type Availability, type AvailabilityView } from '@/lib/coach/availability';

export const AVAILABILITY_API = '/api/coach/availability';

const TONE: Record<Availability, string> = {
  full: 'border-emerald-400/50 text-emerald-300 bg-emerald-400/10',
  limited: 'border-[#FFD700]/50 text-[#FFD700] bg-[#FFD700]/10',
  out: 'border-[#FF2D95]/50 text-[#FF2D95] bg-[#FF2D95]/10',
};

function maxDay(today: string): string {
  const t = Date.parse(`${today}T00:00:00Z`) + AVAILABILITY_MAX_DAYS_AHEAD * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function AvailabilityPicker({ clientId, value, onSaved }: { clientId: string; value: AvailabilityView; onSaved: (v: AvailabilityView) => void }) {
  const [busy, setBusy] = useState(false);
  const [returnBy, setReturnBy] = useState(value.returnBy ?? '');
  const today = todayDay();

  const save = async (status: Availability, day: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const body = status === 'full' || !day ? { clientId, status } : { clientId, status, returnBy: day };
      const r = await fetch(AVAILABILITY_API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { toast.error('Could not save availability'); return; }
      const j = await r.json();
      onSaved({ status: j.status, returnBy: j.returnBy ?? null });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1" data-availability={value.status}>
      <span className="text-[10px] uppercase tracking-wider text-white/35">Availability</span>
      {AVAILABILITY_STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          disabled={busy}
          aria-pressed={value.status === s}
          title={AVAILABILITY_LABEL[s].coach}
          onClick={() => save(s, s === 'full' ? '' : returnBy)}
          className={`rounded-md border px-2 py-0.5 text-[11px] ${value.status === s ? TONE[s] : 'border-white/10 text-white/50'}`}
        >
          {AVAILABILITY_LABEL[s].short}
        </button>
      ))}
      {value.status !== 'full' && (
        <label className="flex items-center gap-1 text-[11px] text-white/45">
          back
          <input
            type="date"
            min={today}
            max={maxDay(today)}
            value={returnBy}
            disabled={busy}
            onChange={(e) => { setReturnBy(e.target.value); void save(value.status, e.target.value); }}
            className="rounded bg-white/5 border border-white/10 px-1 py-0.5 text-white"
          />
        </label>
      )}
      <span className="sr-only">{availabilityLine(value, 'coach')}</span>
    </div>
  );
}
