'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { CalendarDays, Loader2, Users, Lock, Check, Sparkles, Dumbbell } from 'lucide-react';
import { newIdempotencyKey } from '@/lib/wallet/client';
import { BookingRow, HostingPanel, type BookingWithLink, type HostingSlot } from '@/components/sessions/join-links';

type GroupSlot = { sessionKey: string; host: string; startsAtIso: string; label: string; shards: number; capacity: number };
type PrivSlot = { sessionKey: string; startsAtIso: string; label: string; shards: number };
type Booking = BookingWithLink;

/** What the page says once a booking goes through: where the way in will be, not just "see you there". */
export const BOOKED_TOAST = 'Booked. Your join link will appear under Your upcoming sessions.';

/** What the page says when the server refuses a booking (409). The list reloads, so a taken slot drops off it. */
export const BOOKING_REFUSED: Record<string, string> = {
  session_full: 'That session is full.',
  slot_taken: 'Someone just booked that private slot. Pick another time.',
};

/**
 * QA P1-24 (2026-09-27): every Book button was live at 0 shards and the refusal came back only after the press (a 409
 * toast). A slot the wallet cannot pay for says so on the button: disabled, "Need N more shards", with the way to earn
 * them. An unknown balance (the wallet read failed) leaves it pressable; the server's check stays either way.
 */
export function bookState(price: number, balance: number | null): { short: number; disabled: boolean } {
  const short = balance === null ? 0 : Math.max(0, price - balance);
  return { short, disabled: short > 0 };
}

export function BookButton({ price, balance, isBooked, busy, color, textColor, onBook }: {
  price: number; balance: number | null; isBooked: boolean; busy: boolean; color: string; textColor: string; onBook: () => void;
}) {
  const { short, disabled } = bookState(price, balance);
  return (
    <>
      <button onClick={onBook} disabled={isBooked || busy || (disabled && !isBooked)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-bold transition disabled:opacity-70" style={{ backgroundColor: isBooked ? 'rgba(0,255,157,0.15)' : short > 0 ? 'rgba(255,255,255,0.08)' : color, color: isBooked ? '#00FF9D' : short > 0 ? 'rgba(255,255,255,0.6)' : textColor }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : isBooked ? <><Check className="h-4 w-4" /> Booked</> : short > 0 ? <>Need {short} more shard{short === 1 ? '' : 's'}</> : <><Sparkles className="h-4 w-4" /> Book · {price} shards</>}
      </button>
      {!isBooked && short > 0 && (
        <a href="/wallet" className="mt-1.5 block text-center text-[11px] text-cyan-300 underline">How to earn shards</a>
      )}
    </>
  );
}

export function SessionsView() {
  const [group, setGroup] = useState<GroupSlot[]>([]);
  const [priv, setPriv] = useState<PrivSlot[]>([]);
  const [privateOpen, setPrivateOpen] = useState(false);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [hosting, setHosting] = useState<HostingSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<string | null>(null);
  const [shards, setShards] = useState<number | null>(null);
  const [coachStore, setCoachStore] = useState(false);
  const [coaches, setCoaches] = useState<{ id: string; name: string }[]>([]);
  const [shareCoach, setShareCoach] = useState('');
  const [shareOn, setShareOn] = useState<Record<string, boolean>>({});
  const [sharedIds, setSharedIds] = useState<string[]>([]);

  const load = async () => {
    // the wallet's shard balance, for the Book buttons (QA P1-24); a failed read leaves it unknown
    fetch('/api/v1/wallet').then((r) => (r.ok ? r.json() : null)).then((w) => setShards(typeof w?.shards === 'number' ? w.shards : null)).catch(() => setShards(null));
    try {
      const res = await fetch('/api/v1/sessions');
      const j = await res.json();
      if (res.ok) {
        setGroup(j.group ?? []);
        setPriv(j.private ?? []);
        setPrivateOpen(!!j.privateOpen);
        setMyBookings(j.myBookings ?? []);
        setHosting(j.hosting ?? []);
        setCoachStore(!!j.coachStoreEnabled);
      }
      const status = await fetch('/api/account/scan-save');
      if (status.ok) {
        const s = await status.json();
        const list = s.verifiedAdult === true && s.optedIn === true && Array.isArray(s.coaches) ? s.coaches as { id: string; name: string }[] : [];
        setCoaches(list);
        setShareCoach((cur) => cur || list[0]?.id || '');
        setSharedIds(Array.isArray(s.sharedBookingIds) ? s.sharedBookingIds : []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const bookedKeys = new Set(myBookings.map((b) => b.sessionKey));

  const book = async (kind: 'group_workout' | 'private_1on1', sessionKey: string) => {
    setBooking(sessionKey);
    const share = coaches.length > 0 && shareOn[sessionKey] && shareCoach
      ? { shareWithCoach: true, coachId: shareCoach }
      : {};
    try {
      const res = await fetch('/api/v1/sessions/book', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotency_key: newIdempotencyKey(), kind, sessionKey, ...share }),
      });
      const j = await res.json();
      if (res.status === 403 && j?.error === 'minors_cannot_book_private') { toast.error('Private 1-on-1 sessions are for members 18+.'); return; }
      if (res.status === 409 && j?.needShards) { toast.error('Not enough shards. Earn by playing or exchange coins in the Wallet.'); return; }
      if (res.status === 409) { toast.error(BOOKING_REFUSED[j?.error] ?? 'Session unavailable.'); await load(); return; }
      if (!res.ok) throw new Error(j?.error || 'booking failed');
      toast.success(BOOKED_TOAST);
      await load();
    } catch (e: any) { toast.error(e?.message || 'Booking failed'); }
    finally { setBooking(null); }
  };

  const shareBox = (sessionKey: string) => coaches.length === 0 ? null : (
    <label className="mt-2 flex items-start gap-2 text-xs text-white/70">
      <input
        type="checkbox"
        checked={!!shareOn[sessionKey]}
        onChange={(e) => setShareOn((m) => ({ ...m, [sessionKey]: e.target.checked }))}
      />
      <span>
        Share with my coach
        {coaches.length > 1 ? (
          <select value={shareCoach} onChange={(e) => setShareCoach(e.target.value)} className="ml-2 bg-black text-white">
            {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : ` (${coaches[0].name})`}
      </span>
    </label>
  );

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-cyan-400" /></div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white"><CalendarDays className="h-6 w-6 text-cyan-400" /> Sessions</h1>
        <p className="text-sm text-white/50">Live group workouts and private 1-on-1 coaching with Elijah Bonds.</p>
      </div>

      {/* My bookings */}
      {myBookings.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-green-400">Your upcoming sessions</h2>
          <div className="space-y-2">
            {myBookings.map((b) => (
              <div key={b.id}>
                <BookingRow b={b} nowMs={Date.now()} />
                {sharedIds.includes(b.id) ? (
                  <button
                    type="button"
                    className="mb-2 text-xs font-bold text-white/60 underline"
                    onClick={() => {
                      void fetch('/api/account/coach-share', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bookingId: b.id, withdraw: true }),
                      }).then(() => load());
                    }}
                  >
                    Stop sharing with my coach
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Join links, for the slot's coach and admins only (the server sends null to everyone else) */}
      <HostingPanel rows={hosting} onChanged={load} />

      {/* Group workouts */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white/70"><Users className="h-4 w-4 text-cyan-400" /> Group Workouts — Wed &amp; Fri, 5:30 PM PT</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {group.map((s) => {
            const isBooked = bookedKeys.has(s.sessionKey);
            return (
              <motion.div key={s.sessionKey} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-white"><Dumbbell className="h-4 w-4 text-red-400" /> {s.label}</div>
                <div className="text-xs text-white/40">Hosted by {s.host} · up to {s.capacity} athletes</div>
                {shareBox(s.sessionKey)}
                <BookButton price={s.shards} balance={shards} isBooked={isBooked} busy={booking === s.sessionKey} color="#00E5FF" textColor="#050505" onBook={() => book('group_workout', s.sessionKey)} />
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Private 1-on-1. Hidden when the coach store is on; the store is the booking path. The route stays. */}
      {coachStore ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-white/70">Private 1-on-1</h2>
          <Link href="/coach/elijah" className="text-sm text-cyan-300 underline">Book with Elijah on the coach store</Link>
        </section>
      ) : <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white/70"><Lock className="h-4 w-4 text-purple-300" /> Private 1-on-1 (18+)</h2>
        {privateOpen ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {priv.map((s) => {
              const isBooked = bookedKeys.has(s.sessionKey);
              return (
                <motion.div key={s.sessionKey} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-purple-400/20 bg-purple-400/[0.05] p-4">
                  <div className="text-sm font-bold text-white">{s.label}</div>
                  <div className="text-xs text-white/40">Direct session with Elijah Bonds</div>
                  {shareBox(s.sessionKey)}
                  <BookButton price={s.shards} balance={shards} isBooked={isBooked} busy={booking === s.sessionKey} color="#A855F7" textColor="#fff" onBook={() => book('private_1on1', s.sessionKey)} />
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/50">Private 1-on-1 booking is closed for now. It opens again here automatically.</div>
        )}
      </section>}
    </div>
  );
}
