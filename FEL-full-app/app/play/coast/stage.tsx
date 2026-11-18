'use client';

// /play/coast — the Coast & Islands on the real ModeHarness (phase A). Mounts MODES.coast_zone and starts it as soon as it is ready
// (a place to walk, not a match: no START screen). Over the scene: the way back to Venice (the corner link, always), the boat's card
// when the player stands at the boat on the dock, the touch deck with the floating stick on a phone, and the party bar (the root
// layout's, on every page). Nothing else on screen.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Ship } from 'lucide-react';
import { runMode, InputBus, type ModePhase } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { zoneUi } from '@/lib/adventure/coast/zoneUi';
import { veniceReturnHref } from '@/lib/adventure/coast/door';

const MODE_KEY = 'coast_zone';

export function CoastStage({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [err, setErr] = useState<string | null>(null);
  const [touch, setTouch] = useState(false);
  const [back, setBack] = useState('/play/venice');
  const ui = useSyncExternalStore(zoneUi.subscribe, zoneUi.getSnapshot, zoneUi.getSnapshot);

  useEffect(() => {
    try { setTouch(window.matchMedia('(pointer: coarse)').matches); } catch { setTouch(false); }
    setBack(veniceReturnHref(window.location.search));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const def = MODES[MODE_KEY];
    if (!canvas) return;
    if (!def) { setErr('the Coast is not registered'); return; }
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
      resultSink: async () => {},   // the zone posts no session
    }).then((s) => { if (disposed) s(); else stop = s; })
      .catch((e) => { if (!disposed) setErr(String(e?.message ?? e)); });
    return () => { disposed = true; stop?.(); };
  }, [signedIn]);

  const spot = ui.spot;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none outline-none" aria-label="The Coast: walk the beach and the islands" tabIndex={0} />
      {/* the way back (every-screen: no dead end) — Venice, where the boat came from */}
      <Link href={back} data-testid="coast-back" aria-label="Back to Venice"
        className="absolute left-3 top-3 z-10 inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-full bg-black/60 px-3 text-base font-bold text-white">
        <ChevronLeft aria-hidden className="h-5 w-5" /> Venice
      </Link>
      {err && <p role="alert" className="absolute inset-x-4 top-[4.25rem] rounded-lg bg-black/80 p-3 text-base">The coast did not load. {err}</p>}
      {phase === 'loading' && !err && <p className="absolute inset-x-0 top-1/2 text-center text-base text-white/80">Sailing to the coast…</p>}
      {spot && phase === 'playing' && (
        <div data-testid="coast-boat" className="absolute inset-x-4 top-[4.25rem] mx-auto max-w-sm rounded-2xl border border-white/15 bg-black/75 p-3 backdrop-blur">
          <p className="text-base font-bold">{spot.label.replace('[PLACEHOLDER] ', '')}</p>
          <button type="button" data-testid="coast-to-venice" onClick={() => router.push(back)}
            className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#facc15] px-4 text-base font-bold text-black">
            <Ship aria-hidden className="h-4 w-4" /> Back to Venice
          </button>
        </div>
      )}
      {touch && busRef.current && phase === 'playing' && <TouchOverlay bus={busRef.current} modeId={MODE_KEY} visible />}
    </div>
  );
}
