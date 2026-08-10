'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { CalendarDays, Loader2, Users, Lock, Check, Sparkles, Dumbbell } from 'lucide-react';
import { newIdempotencyKey } from '@/lib/wallet/client';

type GroupSlot = { sessionKey: string; host: string; startsAtIso: string; label: string; shards: number; capacity: number };
type PrivSlot = { sessionKey: string; startsAtIso: string; label: string; shards: number };
type Booking = { id: string; kind: string; sessionKey: string; startsAt: string; shardsPaid: number };

export function SessionsView() {
  const [group, setGroup] = useState<GroupSlot[]>([]);
  const [priv, setPriv] = useState<PrivSlot[]>([]);
  const [privateOpen, setPrivateOpen] = useState(false);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/v1/sessions');
      const j = await res.json();
      if (res.ok) {
        setGroup(j.group ?? []);
        setPriv(j.private ?? []);
        setPrivateOpen(!!j.privateOpen);
        setMyBookings(j.myBookings ?? []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const bookedKeys = new Set(myBookings.map((b) => b.sessionKey));

  const book = async (kind: 'group_workout' | 'private_1on1', sessionKey: string) => {
    setBooking(sessionKey);
    try {
      const res = await fetch('/api/v1/sessions/book', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotency_key: newIdempotencyKey(), kind, sessionKey }),
      });
      const j = await res.json();
      if (res.status === 403 && j?.error === 'minors_cannot_book_private') { toast.error('Private 1-on-1 sessions are for members 18+.'); return; }
      if (res.status === 409 && j?.needShards) { toast.error('Not enough shards. Earn by playing or exchange coins in the Wallet.'); return; }
      if (res.status === 409) { toast.error(j?.error === 'session_full' ? 'That session is full.' : 'Session unavailable.'); return; }
      if (!res.ok) throw new Error(j?.error || 'booking failed');
      toast.success('Booked! See you there.');
      await load();
    } catch (e: any) { toast.error(e?.message || 'Booking failed'); }
    finally { setBooking(null); }
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-cyan-400" /></div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white"><CalendarDays className="h-6 w-6 text-cyan-400" /> Sessions</h1>
        <p className="text-sm text-white/50">Live group workouts with Elijah Bonds, seminars, and private 1-on-1 coaching.</p>
      </div>

      {/* My bookings */}
      {myBookings.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-green-400">Your upcoming sessions</h2>
          <div className="space-y-2">
            {myBookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-xl border border-green-400/20 bg-green-400/[0.05] px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-white"><Check className="h-4 w-4 text-green-400" /> {b.kind === 'private_1on1' ? 'Private 1-on-1' : 'Group Workout'}</div>
                <div className="text-xs text-white/50">{new Date(b.startsAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} PT</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Group workouts */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white/70"><Users className="h-4 w-4 text-cyan-400" /> Group Workouts — Wed &amp; Fri, 5:30 PM PT</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {group.map((s) => {
            const isBooked = bookedKeys.has(s.sessionKey);
            return (
              <motion.div key={s.sessionKey} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-white"><Dumbbell className="h-4 w-4 text-red-400" /> {s.label} PT</div>
                <div className="text-xs text-white/40">Hosted by {s.host} · up to {s.capacity} athletes</div>
                <button onClick={() => book('group_workout', s.sessionKey)} disabled={isBooked || booking === s.sessionKey} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-bold transition disabled:opacity-70" style={{ backgroundColor: isBooked ? 'rgba(0,255,157,0.15)' : '#00E5FF', color: isBooked ? '#00FF9D' : '#050505' }}>
                  {booking === s.sessionKey ? <Loader2 className="h-4 w-4 animate-spin" /> : isBooked ? <><Check className="h-4 w-4" /> Booked</> : <><Sparkles className="h-4 w-4" /> Book · {s.shards} shards</>}
                </button>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Private 1-on-1 */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white/70"><Lock className="h-4 w-4 text-purple-300" /> Private 1-on-1 (18+)</h2>
        {privateOpen ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {priv.map((s) => {
              const isBooked = bookedKeys.has(s.sessionKey);
              return (
                <motion.div key={s.sessionKey} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-purple-400/20 bg-purple-400/[0.05] p-4">
                  <div className="text-sm font-bold text-white">{s.label} PT</div>
                  <div className="text-xs text-white/40">Direct session with Elijah Bonds</div>
                  <button onClick={() => book('private_1on1', s.sessionKey)} disabled={isBooked || booking === s.sessionKey} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-bold transition disabled:opacity-70" style={{ backgroundColor: isBooked ? 'rgba(0,255,157,0.15)' : '#A855F7', color: isBooked ? '#00FF9D' : '#fff' }}>
                    {booking === s.sessionKey ? <Loader2 className="h-4 w-4 animate-spin" /> : isBooked ? <><Check className="h-4 w-4" /> Booked</> : <><Sparkles className="h-4 w-4" /> Book · {s.shards} shards</>}
                  </button>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/50">Private 1-on-1 booking opens automatically when no seminar is scheduled within 14 days. A seminar is currently on the calendar — grab a seat above.</div>
        )}
      </section>
    </div>
  );
}
