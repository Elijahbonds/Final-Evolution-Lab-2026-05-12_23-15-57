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
import { Users } from 'lucide-react';
import { partyClient } from '@/lib/party/social/client';
import { inParty, type PartyState } from '@/lib/party/social/state';
import { dockPlace, type DockPlace } from '@/lib/party/social/tuck';
import { activityLine } from '@/lib/party/social/activity';
import { recallPlayerName } from '@/lib/party/playerName';
import { sessionStore } from '@/lib/babylon/core/sessionStore';
import { isQuickScreenPath } from '@/lib/screen/routes';
import { useParty } from './use-party';
import { Avatar } from './party-bits';
import { PartyPanel } from './party-panel';

export function PartyDock() {
  const pathname = usePathname() || '/';
  const s = useParty();
  const view = useSyncExternalStore(sessionStore.subscribe, sessionStore.view, sessionStore.view);
  const phase = view.phase;
  const modeId = view.modeId;
  const quick = isQuickScreenPath(pathname);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

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
    </>
  );
}

function PartyBar({ s, place, onOpen }: { s: PartyState; place: DockPlace; onOpen: () => void }) {
  const tucked = place === 'tucked';
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
            {s.members.slice(0, 6).map((m) => <Avatar key={m.peer} name={m.name} pub={m.pub} size={tucked ? 22 : 26} dim={!m.connected} />)}
            {!s.members.length ? <Users className="h-5 w-5 text-white/70" /> : null}
          </span>
          <span className="whitespace-nowrap font-mono text-[11px] font-bold text-white/80">{status}</span>
        </button>
      </div>
    </div>
  );
}
