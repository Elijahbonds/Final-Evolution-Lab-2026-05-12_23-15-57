'use client';

// /play/venice — the Venice hub on the real ModeHarness (VENICE V1). Mounts MODES.venice_hub and starts it as soon as it is
// ready (a place to walk, not a match: no START screen). Over the scene: the walk-up card when the player stands at a court
// (its game in one tap, and "Play with your party" for the party's host on the two courts with a party seat), the touch deck
// with the floating stick on a phone, and the party bar (the root layout's, on every page). Nothing else on screen.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Users } from 'lucide-react';
import { runMode, InputBus, type ModePhase } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hubUi, wayfindingOn } from '@/lib/adventure/venice/hubUi';
import { hubHrefFor, launchChoices, launchNavigationHref, PARTY_MODE_FOR_SPOT, veniceActivity, writeReturn, writeReturnForHref } from '@/lib/adventure/venice/hubReturn';
import { MODE_INFO } from '@/lib/game-data';
import { partyClient } from '@/lib/party/social/client';
import { isHost } from '@/lib/party/social/state';
import { FirstVisitHint, MiniMap, useCardKeys, useFirstVisitHint } from './wayfinding';

const MODE_KEY = 'venice_hub';
const AGENT_MARK = 'fel-venice-agent';

export function VeniceStage({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [err, setErr] = useState<string | null>(null);
  const [touch, setTouch] = useState(false);
  const ui = useSyncExternalStore(hubUi.subscribe, hubUi.getSnapshot, hubUi.getSnapshot);
  const party = useSyncExternalStore(partyClient().subscribe, partyClient().getState, partyClient().getState);

  useEffect(() => { try { setTouch(window.matchMedia('(pointer: coarse)').matches); } catch { setTouch(false); } }, []);
  // phase 9 (venue.veniceWayfinding): the hint, the mini-map and the card's keys; read once on the client (0 = V1)
  const [wayfinding, setWayfinding] = useState(false);
  useEffect(() => { setWayfinding(wayfindingOn()); }, []);
  // a probe's run (?agent=1): the hub's walk seam (window.__VENICE__). lib/agentRunHooks honours it on a loopback host only.
  // The mark lasts the tab (sessionStorage), so a probe that goes hub → game → hub by the app's own links finds the seam again
  // (a game's session start resets the hook flag, and the way back carries no ?agent=1). Still loopback-only.
  useEffect(() => {
    try {
      const probe = new URLSearchParams(window.location.search).get('agent') === '1' || sessionStorage.getItem(AGENT_MARK) === '1';
      if (probe) { sessionStorage.setItem(AGENT_MARK, '1'); void import('@/lib/agentRunHooks').then((m) => m.setAgentRunHooksAllowed(true)); }
    } catch { /* not a probe */ }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const def = MODES[MODE_KEY];
    if (!canvas) return;
    if (!def) { setErr('the Venice hub is not registered'); return; }
    const bus = new InputBus();
    busRef.current = bus;
    let stop: (() => void) | null = null;
    let disposed = false;
    runMode(def, {
      canvas,
      input: bus,
      onPhase: (p, d) => {
        if (disposed) return;
        setPhase(p);
        if (p === 'error') setErr(String(d));
        // a place, not a match: walk in at once (next tick: the harness takes a press only once it is in 'ready')
        if (p === 'ready') setTimeout(() => { if (!disposed) bus.emit({ t: 'button', btn: 'START', pressed: true }); }, 50);
      },
      onHud: () => {},
      guest: !signedIn,
      resultSink: async () => {},   // the hub posts no session: the games it opens post their own
    }).then((s) => { if (disposed) s(); else stop = s; })
      .catch((e) => { if (!disposed) setErr(String(e?.message ?? e)); });
    return () => { disposed = true; stop?.(); };
  }, [signedIn]);

  const spot = ui.spot;
  const choices = spot ? launchChoices(spot, MODE_INFO) : [];
  const partyMode = spot ? PARTY_MODE_FOR_SPOT[spot.id] : undefined;
  const crowd = party.members.filter((m) => m.connected).length;
  const canPartyStart = !!partyMode && isHost(party) && crowd >= 2;
  const cardUp = !!spot && phase === 'playing';
  const [hint, dismissHint] = useFirstVisitHint(wayfinding && phase === 'playing', cardUp);

  const play = (href: string | undefined = choices[0]?.href) => {
    if (!spot || !href) return;
    // a court can offer more than one game (Court 3: Flight Night or Prove It; Court 4: Downtown or Game Night): the mark keeps
    // the page actually opened, so the end screen's way back still finds this court (cursor #616 / #620)
    writeReturnForHref(spot, href, Date.now());
    // the browser's Back from the game lands beside this court too (the hub reads ?spot=)
    try { window.history.replaceState(window.history.state, '', hubHrefFor(spot.id)); } catch { /* history is a convenience */ }
    router.push(launchNavigationHref(href, signedIn));
  };
  const playParty = () => {
    if (!spot || !partyMode) return;
    writeReturn(spot, Date.now());
    try { window.history.replaceState(window.history.state, '', hubHrefFor(spot.id)); } catch { /* history is a convenience */ }
    // every member comes back here: the host's activity names the court before the start offer goes out (hubReturn, phase 2)
    const c = partyClient();
    c.setActivity(veniceActivity(spot.id));
    c.startTogether(partyMode);
  };
  useCardKeys(wayfinding ? busRef.current : null, wayfinding && cardUp, () => play(), canPartyStart ? playParty : null);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none outline-none" aria-label="Venice Beach: walk to a court to play" tabIndex={0} />
      {/* the way back is the loader's (loader.tsx): in the server's HTML from the first paint, not after this chunk loads */}
      {err && <p role="alert" className="absolute inset-x-4 top-[4.25rem] rounded-lg bg-black/80 p-3 text-base">The courts did not load. {err}</p>}
      {phase === 'loading' && !err && <p className="absolute inset-x-0 top-1/2 text-center text-base text-white/80">Heading to the courts…</p>}
      {wayfinding && phase === 'playing' && <MiniMap active={spot?.id ?? null} />}
      {hint && !cardUp && <FirstVisitHint onDismiss={dismissHint} touch={touch} />}
      {cardUp && (
        <div data-testid="venice-walkup" className={`absolute inset-x-4 ${wayfinding ? 'top-[9.25rem]' : 'top-[4.25rem]'} mx-auto max-w-sm rounded-2xl border border-white/15 bg-black/75 p-3 backdrop-blur`}>
          <p className="text-base font-bold">{spot.label.replace('[PLACEHOLDER] ', '')}</p>
          <div className="mt-2 flex flex-col gap-2">
            {choices.map((choice, index) => (
              <button key={choice.mode} type="button" data-testid={index === 0 ? 'venice-play' : `venice-play-${choice.mode}`} onClick={() => play(choice.href)}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#facc15] px-4 text-base font-bold text-black">
                <Play aria-hidden className="h-4 w-4" /> {signedIn ? `Play ${choice.label}` : `Sign in to play ${choice.label}`}
                {index === 0 && wayfinding && !touch && <span className="ml-1 rounded border border-black/30 px-1 text-xs font-bold" aria-hidden>Enter · X</span>}
              </button>
            ))}
            {canPartyStart && (
              <button type="button" data-testid="venice-party" onClick={playParty}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/25 px-4 text-base font-bold text-white">
                <Users aria-hidden className="h-4 w-4" /> Play with your party
                {wayfinding && !touch && <span className="ml-1 rounded border border-white/30 px-1 text-xs font-bold" aria-hidden>Y</span>}
              </button>
            )}
          </div>
        </div>
      )}
      {touch && busRef.current && phase === 'playing' && <TouchOverlay bus={busRef.current} modeId={MODE_KEY} visible />}
    </div>
  );
}
