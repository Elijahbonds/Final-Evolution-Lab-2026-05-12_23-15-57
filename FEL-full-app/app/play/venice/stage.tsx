'use client';

// /play/venice — the Venice hub on the real ModeHarness (VENICE V1). Mounts MODES.venice_hub and starts it as soon as it is
// ready (a place to walk, not a match: no START screen). Over the scene: the walk-up card when the player stands at a court
// (its game in one tap, and "Play with your party" for the party's host on the two courts with a party seat), the touch deck
// with the floating stick on a phone, and the party bar (the root layout's, on every page). Nothing else on screen.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Play, Users } from 'lucide-react';
import { runMode, InputBus, type ModePhase } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hubUi } from '@/lib/adventure/venice/hubUi';
import { launchHref, launchRoute, PARTY_MODE_FOR_SPOT, writeReturn } from '@/lib/adventure/venice/hubReturn';
import { MODE_INFO } from '@/lib/game-data';
import { partyClient } from '@/lib/party/social/client';
import { isHost } from '@/lib/party/social/state';

const MODE_KEY = 'venice_hub';

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
  const modeOptions = spot ? spot.modes.map((mode) => ({ mode, name: MODE_INFO[mode]?.name ?? mode })) : [];
  const partyMode = spot ? PARTY_MODE_FOR_SPOT[spot.id] : undefined;
  const crowd = party.members.filter((m) => m.connected).length;
  const canPartyStart = !!partyMode && isHost(party) && crowd >= 2;

  const play = (mode: string) => {
    if (!spot) return;
    writeReturn({ id: spot.id, route: launchRoute(spot, mode) }, Date.now());
    router.push(launchHref(spot, mode));
  };
  const playParty = () => {
    if (!spot || !partyMode) return;
    writeReturn(spot, Date.now());
    partyClient().startTogether(partyMode);
  };

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none outline-none" aria-label="Venice Beach: walk to a court to play" tabIndex={0} />
      {/* the way back (every-screen: no dead end) — the Play shelf, where every game is still one tap */}
      <Link href="/play" data-testid="venice-back" aria-label="Back to Play"
        className="absolute left-3 top-3 z-10 inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-full bg-black/60 px-3 text-base font-bold text-white">
        <ChevronLeft aria-hidden className="h-5 w-5" /> Play
      </Link>
      {err && <p role="alert" className="absolute inset-x-4 top-[4.25rem] rounded-lg bg-black/80 p-3 text-base">The courts did not load. {err}</p>}
      {phase === 'loading' && !err && <p className="absolute inset-x-0 top-1/2 text-center text-base text-white/80">Heading to the courts…</p>}
      {spot && phase === 'playing' && (
        <div data-testid="venice-walkup" className="absolute inset-x-4 top-[4.25rem] mx-auto max-w-sm rounded-2xl border border-white/15 bg-black/75 p-3 backdrop-blur">
          <p className="text-base font-bold">{spot.label.replace('[PLACEHOLDER] ', '')}</p>
          <div className="mt-2 flex flex-col gap-2">
            {modeOptions.map((o) => (
              <button key={o.mode} type="button" data-testid={`venice-play-${o.mode}`} onClick={() => play(o.mode)}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#facc15] px-4 text-base font-bold text-black">
                <Play aria-hidden className="h-4 w-4" /> Play {o.name}
              </button>
            ))}
            {canPartyStart && (
              <button type="button" data-testid="venice-party" onClick={playParty}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/25 px-4 text-base font-bold text-white">
                <Users aria-hidden className="h-4 w-4" /> Play with your party
              </button>
            )}
          </div>
        </div>
      )}
      {touch && busRef.current && phase === 'playing' && <TouchOverlay bus={busRef.current} modeId={MODE_KEY} visible />}
    </div>
  );
}
