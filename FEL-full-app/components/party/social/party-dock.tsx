'use client';
// THE PARTY DOCK (PARTY-CHAT lane, 2026-10-13) — mounted once, in the root layout, OUTSIDE <Providers>, so it is never
// remounted: not by a client navigation, not by Providers swapping its session tree on the Quick Screen paths. That is
// what lets a party (and its voice) carry on from page to page and into every game.
//
//   - After a FULL reload it rejoins the stored party (lib/party/social/persist.ts) as the same member.
//   - It draws the floating bar, the panel, the "Joining X…" countdown and the caption strip, and nothing at all when
//     you are not in a party.
//   - The tuck rule (lib/party/social/tuck.ts): hidden while a game is PLAYING (the play screen is the HUD alone),
//     tucked into the pause menu / results, a floating bar everywhere else.
//   - It tells the party what this page is doing ("Playing Downtown").
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { Mic, MicOff, Users } from 'lucide-react';
import { partyClient } from '@/lib/party/social/client';
import { captionText, inParty, type PartyState } from '@/lib/party/social/state';
import { dockPlace, type DockPlace } from '@/lib/party/social/tuck';
import { activityLine } from '@/lib/party/social/activity';
import { recallPlayerName } from '@/lib/party/playerName';
import { sessionStore } from '@/lib/babylon/core/sessionStore';
import { isQuickScreenPath } from '@/lib/screen/routes';
import { useParty } from './use-party';
import { Avatar } from './party-bits';
import { PartyPanel } from './party-panel';
import { TalkButton, useVoice } from './party-voice';

export function PartyDock() {
  const pathname = usePathname() || '/';
  const s = useParty();
  const view = useSyncExternalStore(sessionStore.subscribe, sessionStore.view, sessionStore.view);
  const phase = view.phase;
  const modeId = view.modeId;
  const quick = isQuickScreenPath(pathname);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // the voice mesh listens from the start (a friend's offer must be answered even with the panel closed)
  const voice = useVoice();
  void voice;

  // a full reload: rejoin the stored party (never on the Quick Screen, which sends nothing before the age question)
  useEffect(() => {
    if (quick) return;
    partyClient().resumeStored(recallPlayerName());
  }, [quick]);

  // what this page is doing, for everyone's member list
  useEffect(() => {
    if (!inParty(s)) return;
    partyClient().setActivity(phase && phase !== 'loading' ? activityLine(modeId, pathname) : activityLine(null, pathname));
  }, [s.status, phase, modeId, pathname]);   // eslint-disable-line react-hooks/exhaustive-deps

  const place: DockPlace = dockPlace(phase, quick, inParty(s));
  // a game starting under the panel closes it: the play screen is the HUD alone
  useEffect(() => { if (place === 'hidden') setOpen(false); }, [place]);
  // a report: netd handed back a sealed slip; carry it to the app (stored once the pending SQL is applied)
  useEffect(() => {
    const r = s.reportSlip;
    if (!r) return;
    const c = partyClient();
    c.patch({ reportSlip: null });
    if (!r.slip) { c.patch({ notice: 'Thanks — they are blocked for you. Reports are not switched on here yet.' }); return; }
    void fetch('/api/party/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slip: r.slip }) })
      .then((res) => res.json().catch(() => ({})))
      .then((j: { stored?: boolean }) => c.patch({ notice: j.stored ? 'Report sent. Thanks — they are blocked for you.' : 'Thanks — they are blocked for you. Reports are not switched on here yet.' }))
      .catch(() => c.patch({ notice: "Couldn't send the report — they are still blocked for you." }));
  }, [s.reportSlip]);

  // the /party hub opens the panel by event (it lives in the page, the panel lives here)
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('fel:party-open', onOpen);
    return () => window.removeEventListener('fel:party-open', onOpen);
  }, []);

  return (
    <>
      {place !== 'hidden' ? <PartyBar s={s} place={place} onOpen={() => setOpen(true)} /> : null}
      {open && place !== 'hidden' ? <PartyPanel s={s} onClose={close} /> : null}
      {!quick && inParty(s) ? <Captions s={s} show={place !== 'hidden' && !open} /> : null}
    </>
  );
}

function PartyBar({ s, place, onOpen }: { s: PartyState; place: DockPlace; onOpen: () => void }) {
  const tucked = place === 'tucked';
  const v = useVoice();
  const others = s.members.filter((m) => m.peer !== s.you);
  const status = s.status === 'waiting' ? 'Waiting for the host…' : s.status === 'reconnecting' ? 'Reconnecting…' : `${s.members.length} in party`;
  return (
    <div
      data-testid="party-bar"
      data-place={place}
      className={tucked
        ? 'fixed left-1/2 top-[max(0.5rem,env(safe-area-inset-top))] z-[60] -translate-x-1/2'
        : 'fixed bottom-[calc(env(safe-area-inset-bottom)+76px)] left-3 z-40 md:bottom-4'}
    >
      <div className="flex items-center gap-1 rounded-full border border-white/15 bg-[#0b0e13]/90 p-1 pr-1.5 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open party panel. ${status}${others.length ? `: ${others.map((m) => m.name).join(', ')}` : ''}`}
          className="flex items-center gap-1.5 rounded-full py-0.5 pl-1 pr-2 hover:bg-white/10"
        >
          <span className="flex -space-x-2">
            {s.members.slice(0, 6).map((m) => <Avatar key={m.peer} name={m.name} pub={m.pub} size={tucked ? 22 : 26} dim={!m.connected} speaking={!!v.speaking[m.peer]} />)}
            {!s.members.length ? <Users className="h-5 w-5 text-white/70" /> : null}
          </span>
          <span className="whitespace-nowrap font-mono text-[11px] font-bold text-white/80">{status}</span>
        </button>
        {v.joined ? (
          <button type="button" data-testid="party-bar-mute" aria-pressed={v.muted} aria-label={v.muted ? 'Unmute your microphone' : 'Mute your microphone'}
            onClick={() => v.setMuted(!v.muted)}
            className={`rounded-full p-1.5 ${v.muted ? 'bg-rose-500/20 text-rose-300' : 'text-[#00FF9D] hover:bg-white/10'}`}>
            {v.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        ) : null}
        {v.joined && v.ptt && !v.muted ? <TalkButton v={v} compact /> : null}
      </div>
    </div>
  );
}

/**
 * CAPTIONS (accessibility): every quick-chat line and emote, in words, for a moment — and always to a screen reader
 * (an aria-live region, which draws nothing). While a game is playing nothing is DRAWN (the HUD rule) but the words are
 * still announced.
 */
function Captions({ s, show }: { s: PartyState; show: boolean }) {
  const [visible, setVisible] = useState<string | null>(null);
  const key = s.caption?.key ?? null;
  useEffect(() => {
    if (!s.caption) return;
    setVisible(captionText(s.caption));
    const t = setTimeout(() => setVisible(null), 4000);
    return () => clearTimeout(t);
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="sr-only" aria-live="polite" data-testid="party-caption-sr">{s.caption ? captionText(s.caption) : ''}</div>
      {show && visible ? (
        <div aria-hidden data-testid="party-caption" className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+122px)] left-3 z-40 max-w-[min(320px,calc(100vw-24px))] rounded-lg bg-black/80 px-3 py-1.5 text-sm text-white shadow md:bottom-16">
          {s.caption?.glyph ? <span className="mr-1">{s.caption.glyph}</span> : null}{visible}
        </div>
      ) : null}
    </>
  );
}
