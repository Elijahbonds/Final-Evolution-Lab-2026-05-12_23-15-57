'use client';
// MyGroupSessions — GROUP-BOOKING: the signed-in person's booked group seats and 1:1s, each with Cancel (the owner's rule
// line says free or "counts as used" before the tap), and their make-up credits: a missed or cancelled package session
// with the open Friday/Saturday slots at the group's gym this week or next (one tap books it).
import { useCallback, useEffect, useState } from 'react';
import { SHOP_LOOK as L } from '@/components/shop/look';
import { GROUP_COPY as T, errorLine, MAKEUP_REFUSAL_COPY } from '@/lib/group-booking/copy';
import { ME_API, postJson } from '@/lib/group-booking/client';

interface Seat { id: string; title: string; kind: 'regular' | 'makeup'; gymName: string; dayLabel: string; time: string; status: string; cancel: 'free' | 'late' | 'started' }
interface Credit { seatId: string; missed: string; options: { date: string; hour: number; label: string; left: number }[] }
interface OneOnOne { id: string; startsAt: string; gymName: string; trainerName: string; status: string; priceLabel: string; cancel: 'free' | 'late' | 'started' }
interface Mine { available: boolean; seats?: Seat[]; makeups?: Credit[]; oneOnOne?: OneOnOne[]; cancelLine?: string }

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });

/** compact (EVERY-SCREEN P5, on Train): only when something is booked, so cancelling is Train → Cancel → confirm, with the
 *  rule on screen before the first tap; the full list (and "none booked yet") stays on /groups. */
export function MyGroupSessions({ compact = false }: { compact?: boolean } = {}) {
  const [mine, setMine] = useState<Mine | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(ME_API).then((r) => (r.ok ? r.json() : { available: false })).then(setMine).catch(() => setMine({ available: false }));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!mine?.available) return null;
  const act = async (body: Record<string, unknown>, okLine: string) => {
    const r = await postJson(fetch, ME_API, body);
    const code = String(r?.json.error ?? '');
    setMsg(r && r.status < 300 ? (r.json.late ? 'Cancelled. This one counts as used.' : okLine) : (MAKEUP_REFUSAL_COPY as Record<string, string>)[code] ?? errorLine(code));
    setConfirm(null);
    load();
  };
  const seats = mine.seats ?? [], credits = (mine.makeups ?? []).filter((c) => c.options.length), ones = mine.oneOnOne ?? [];
  if (compact && !seats.some((x) => x.status === 'booked') && !ones.some((x) => x.status === 'booked')) return null;
  return (
    <section className={L.section} data-my-group-sessions>
      <h2 className={L.sectionTitle}>{T.mine}</h2>
      {/* EVERY-SCREEN P5: on Train the owner's cancel rule comes first, above the Cancel buttons */}
      {compact && mine.cancelLine ? <p className={L.lede} data-cancel-rule>{mine.cancelLine}</p> : null}
      {!seats.length && !ones.length ? <p className={L.lede}>{T.noneMine}</p> : null}
      <ul className={L.rows}>
        {seats.map((s) => (
          <li key={s.id}>
            <div className={L.row}>
              <span>{s.title}{s.kind === 'makeup' ? ` · ${T.makeup}` : ''}<span className="block text-xs text-fel-soft">{s.dayLabel} · {s.time} · {s.gymName}{s.status !== 'booked' ? ` · ${s.status}` : ''}</span></span>
              {s.status === 'booked' && s.cancel !== 'started'
                ? confirm === s.id
                  ? <button type="button" className={L.rowSide} onClick={() => { void act({ action: 'cancel', seatId: s.id }, 'Cancelled.'); }} data-action="confirm-cancel">{s.cancel === 'free' ? 'Cancel free' : 'Cancel · counts as used'}</button>
                  : <button type="button" className={L.rowSide} onClick={() => setConfirm(s.id)} data-action="cancel">Cancel</button>
                : null}
            </div>
          </li>
        ))}
        {ones.map((s) => (
          <li key={s.id}>
            <div className={L.row}>
              <span>1:1 with {s.trainerName}<span className="block text-xs text-fel-soft">{when(s.startsAt)} · {s.gymName} · {s.priceLabel}</span></span>
              {s.status === 'booked' && s.cancel !== 'started'
                ? confirm === s.id
                  ? <button type="button" className={L.rowSide} onClick={() => { void act({ action: 'cancel_1on1', id: s.id }, 'Cancelled.'); }}>{s.cancel === 'free' ? 'Cancel free' : 'Cancel · counts as used'}</button>
                  : <button type="button" className={L.rowSide} onClick={() => setConfirm(s.id)}>Cancel</button>
                : null}
            </div>
          </li>
        ))}
      </ul>
      {credits.length ? (
        <div className="mt-6" data-makeups>
          <h3 className={L.sectionTitle}>Make up a session</h3>
          {credits.map((c) => (
            <div key={c.seatId} className="mt-3">
              <p className={L.cardLine}>Missed: {c.missed}</p>
              <div className={`${L.chips} mt-2`}>
                {c.options.map((o) => (
                  <button key={`${o.date}-${o.hour}`} type="button" className={L.chip} data-makeup-slot={`${o.date}-${o.hour}`}
                    onClick={() => { void act({ action: 'makeup', seatId: c.seatId, date: o.date, hour: o.hour }, 'Make-up booked.'); }}>{o.label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {!compact && mine.cancelLine ? <p className={`${L.lede} mt-4`} data-cancel-rule>{mine.cancelLine}</p> : null}
      {msg ? <p role="status" className={L.alert}>{msg}</p> : null}
    </section>
  );
}
