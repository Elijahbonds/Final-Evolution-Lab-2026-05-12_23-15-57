'use client';

import { useEffect, useMemo, useState } from 'react';

interface Slot { start: string; end: string }

function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso));
}

function timeLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** Lists free slots from the server and starts a test-mode Checkout for the chosen one. */
export function SlotPicker({ serviceId, timeZone }: { serviceId: string; timeZone: string }) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/creator/slots?service=${encodeURIComponent(serviceId)}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok || !Array.isArray(body?.slots)) {
          setLoadError(typeof body?.error === 'string' ? body.error : 'Booking is not open yet.');
          return;
        }
        setSlots(body.slots as Slot[]);
      })
      .catch(() => alive && setLoadError('Booking is not open yet.'));
    return () => { alive = false; };
  }, [serviceId]);

  const days = useMemo(() => {
    const groups = new Map<string, Slot[]>();
    for (const slot of slots ?? []) {
      const key = dayKey(slot.start, timeZone);
      groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    return [...groups.entries()];
  }, [slots, timeZone]);

  async function book() {
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/creator/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serviceId, slotStart: picked, email: email.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body?.url !== 'string') {
        // MERGE (2026-10-09): a closed store is 409 { error: 'store_closed', message } (STORE-READY B2).
        setError(body?.error === 'store_closed' && typeof body?.message === 'string'
          ? body.message
          : typeof body?.error === 'string' ? body.error : 'Checkout is not available yet.');
        setBusy(false);
        return;
      }
      window.location.href = body.url;
    } catch {
      setError('Checkout is not available yet.');
      setBusy(false);
    }
  }

  if (loadError) return <p className="mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">{loadError}</p>;
  if (!slots) return <p className="mt-3 text-sm text-white/50">Loading open times…</p>;
  if (slots.length === 0) return <p className="mt-3 text-sm text-white/60">No open times in the next few weeks.</p>;

  return (
    <div className="mt-3">
      <p className="text-[11px] text-white/40">Times shown in {timeZone.replace('_', ' ')}.</p>
      <div className="mt-3 space-y-4">
        {days.map(([day, daySlots]) => (
          <div key={day}>
            <p className="text-xs font-semibold text-white/70">{day}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {daySlots.map((slot) => (
                <button
                  key={slot.start}
                  type="button"
                  onClick={() => setPicked(slot.start)}
                  aria-pressed={picked === slot.start}
                  className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${picked === slot.start ? 'border-[#F5C518] bg-[#F5C518] text-black' : 'border-white/15 bg-white/5 text-white hover:border-[#F5C518]/60'}`}
                >
                  {timeLabel(slot.start, timeZone)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs text-white/60">
          Email for the receipt (optional)
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#F5C518]/70"
          />
        </label>
        <button
          type="button"
          onClick={book}
          disabled={!picked || busy}
          aria-busy={busy}
          className="rounded-md bg-[#F5C518] px-5 py-2 text-sm font-semibold text-black hover:bg-[#ffd84a] disabled:opacity-50"
        >
          {busy ? 'Opening checkout…' : 'Continue to checkout'}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-[#ff8b8b]">{error}</p> : null}
      <p className="mt-3 text-[11px] text-white/35">The time is held for about 30 minutes while you check out. Stripe test mode: no live card is charged.</p>
    </div>
  );
}
