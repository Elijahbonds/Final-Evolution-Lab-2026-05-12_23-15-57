'use client';
// "Start together" (PARTY-CHAT lane, 2026-10-13). Owner: the HOST can pull everyone into a multiplayer mode — 5 s
// "Joining X…" with Cancel; decliners stay in the party; after the match everyone is still in the party.
//
// The modes are the ones with a real netd match seat today (server/netd/src/partyRules.ts ONLINE_MODES: the `?net=`
// call sites in OneVOneMode, ThreeVThreeMode, KarateEndlessMode). netd picks one match room for the party and each
// member's seat in it; this page only counts down and navigates — a CLIENT navigation, so the party (in the root
// layout) never unloads, and a full reload would resume it anyway.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';
import { partyClient } from '@/lib/party/social/client';
import { isHost, type PartyState } from '@/lib/party/social/state';
import { ONLINE_MODES } from '@/server/netd/src/partyRules';

export function StartSection({ s }: { s: PartyState }) {
  const [mode, setMode] = useState(ONLINE_MODES[0].id);
  const host = isHost(s);
  const pick = ONLINE_MODES.find((m) => m.id === mode)!;
  if (!host) {
    return <p className="text-xs text-white/45">The host can start a game for the whole party. Until then, play anything — the party comes with you.</p>;
  }
  const crowd = s.members.filter((m) => m.connected).length;
  return (
    <section aria-label="Start together" className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <h3 className="font-mono text-[10px] tracking-[0.25em] text-white/45">START TOGETHER</h3>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="party-start-mode">Game to start together</label>
        <select id="party-start-mode" data-testid="party-start-mode" value={mode} onChange={(e) => setMode(e.target.value)}
          className="min-w-0 flex-1 rounded-lg bg-white/10 px-2 py-2 text-sm outline-none">
          {ONLINE_MODES.map((m) => <option key={m.id} value={m.id} className="bg-[#0b0e13]">{m.title} · {m.humans} players</option>)}
        </select>
        <button type="button" data-testid="party-start-go" disabled={!!s.start && !s.start.declined && s.start.at > Date.now()}
          onClick={() => partyClient().startTogether(mode)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#facc15] px-3 text-sm font-bold text-black disabled:opacity-50">
          <Play className="h-4 w-4" /> Start
        </button>
      </div>
      <p className="text-[11px] text-white/45">
        Everyone gets 5 seconds to cancel. {pick.title} seats {pick.humans}{crowd > pick.humans ? ` — the first ${pick.humans} in the party play, everyone else stays in the party` : ''}.
      </p>
    </section>
  );
}

/** The "Joining X…" card everyone in the party gets. Shown over anything, even a game: the host asked for it. */
export function StartCountdown({ s }: { s: PartyState }) {
  const router = useRouter();
  const offer = s.start;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!offer) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [offer]);
  // at zero: in you go (a seat), or a word that you are staying (the mode is full, or you cancelled)
  useEffect(() => {
    if (!offer || offer.declined) return;
    const wait = Math.max(0, offer.at - Date.now());
    const go = setTimeout(() => {
      const c = partyClient();
      if (c.getState().start?.id !== offer.id || c.getState().start?.declined) return;
      c.patch({ start: null });
      if (!offer.seat) return;
      const q = new URLSearchParams({ net: offer.room, peer: offer.seat, party: '1' });
      router.push(`${offer.path}?${q.toString()}`);
      // the host's page connects first so the host is the match's authority (netd: first in holds it)
    }, wait + (offer.seat && !offer.seat.startsWith('h') ? 400 : 0));
    return () => clearTimeout(go);
  }, [offer?.id, offer?.declined]);   // eslint-disable-line react-hooks/exhaustive-deps
  // a declined offer's card closes itself once the moment has passed
  useEffect(() => {
    if (!offer?.declined) return;
    const t = setTimeout(() => partyClient().patch({ start: null }), Math.max(0, offer.at - Date.now()) + 1500);
    return () => clearTimeout(t);
  }, [offer?.id, offer?.declined]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!offer) return null;
  const left = Math.max(0, Math.ceil((offer.at - now) / 1000));
  const host = isHost(s);
  return (
    <div className="fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-[80] flex justify-center px-3" role="alertdialog" aria-live="assertive" aria-label={`Joining ${offer.title}`}>
      <div data-testid="party-start-countdown" className="w-full max-w-sm rounded-2xl border border-[#facc15]/40 bg-[#0b0e13]/95 p-3 text-white shadow-2xl backdrop-blur">
        {offer.declined ? (
          <p className="text-sm">You&apos;re sitting this one out — you&apos;re still in the party.</p>
        ) : !offer.seat ? (
          <p className="text-sm">The party is starting <b>{offer.title}</b>. It seats {ONLINE_MODES.find((m) => m.id === offer.mode)?.humans ?? 2} — you&apos;re staying in the party this time.</p>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#facc15] font-mono text-xl font-black text-black" aria-hidden>{left}</span>
            <p className="flex-1 text-sm font-bold">Joining {offer.title}… <span className="block text-xs font-normal text-white/55">with your party · {left} s</span></p>
            <button type="button" data-testid="party-start-cancel" onClick={() => partyClient().decline()} className="rounded-lg border border-white/25 px-3 py-2 text-sm font-bold">Cancel</button>
          </div>
        )}
        {host && !offer.declined && offer.at > now ? (
          <button type="button" data-testid="party-start-stop" onClick={() => { partyClient().cancelStart(); partyClient().patch({ start: null }); }} className="mt-2 w-full rounded-lg bg-white/10 py-1.5 text-xs">Stop it for everyone</button>
        ) : null}
      </div>
    </div>
  );
}
