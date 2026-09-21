'use client';

// BodyControl — the button that turns the camera into the controller, and the card that teaches the gestures.
//
// It lives in GameShell rather than in a mode, because body control is an input DEVICE: poseControl maps a body
// to the same four FelInput shapes a gamepad produces, and emitToLive posts them to whichever mode is running.
// Nothing in any mode file knows this exists.

import { useCallback, useEffect, useRef, useState } from 'react';
import { PersonStanding, X } from 'lucide-react';
import { PoseSource, type PoseSourceState } from '@/lib/input/poseSource';
import { GESTURE_BUTTON, GESTURE_LABEL, type Gesture } from '@/lib/input/poseControl';
import { emitToLive, type FelInput } from '@/lib/babylon/core/InputBus';

/** A bus-shaped object that posts to whatever mode is running, so PoseSource needs no reference to one. */
const LIVE_BUS = { emit: (e: FelInput) => emitToLive(e) } as unknown as ConstructorParameters<typeof PoseSource>[0];

const ORDER: Gesture[] = ['jump', 'raiseR', 'raiseL', 'raiseBoth', 'reachR', 'reachL'];

export function BodyControl({ compact = false }: { compact?: boolean }) {
  const srcRef = useRef<PoseSource | null>(null);
  const [state, setState] = useState<PoseSourceState>('idle');
  const [detail, setDetail] = useState('');
  const [body, setBody] = useState(false);
  const [showCard, setShowCard] = useState(false);

  useEffect(() => () => { srcRef.current?.stop(); srcRef.current = null; }, []);

  const toggle = useCallback(async () => {
    if (srcRef.current) { srcRef.current.stop(); srcRef.current = null; setShowCard(false); return; }
    const src = new PoseSource(LIVE_BUS, {
      onState: (s, d) => { setState(s); setDetail(d ?? ''); },
      onBody: setBody,
    });
    srcRef.current = src;
    setShowCard(true);
    const ok = await src.start();
    if (!ok) { srcRef.current = null; }
  }, []);

  const on = state !== 'idle' && state !== 'error';

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        aria-label={on ? 'Turn body control off' : 'Play with your body as the controller'}
        className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-[10.5px]
                    font-bold uppercase tracking-[0.12em] transition-colors ${compact ? '' : 'sm:px-3'}`}
        style={{
          borderColor: on ? 'rgba(0,255,157,0.45)' : 'rgba(255,255,255,0.12)',
          color: on ? '#00FF9D' : 'rgba(255,255,255,0.5)',
          background: on ? 'rgba(0,255,157,0.07)' : 'transparent',
        }}
      >
        <PersonStanding className="h-4 w-4" />
        {compact ? null : <span>Body</span>}
        {on && (
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: body ? '#00FF9D' : '#FFD700' }}
          />
        )}
      </button>

      {showCard && on && (
        <div className="pointer-events-auto fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-2xl border
                        border-white/12 bg-black/85 p-4 backdrop-blur-xl sm:inset-x-auto sm:right-4 sm:w-[340px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#00FF9D]">
                Body control
              </p>
              <p className="mt-1 text-[13px] font-semibold leading-tight text-white">
                {state === 'requesting' ? 'Asking for the camera…'
                  : state === 'loading' ? 'Loading the tracker…'
                  : state === 'calibrating' ? 'Stand still, whole body in frame'
                  : body ? 'You are in. Lean to move.'
                  : 'Step back — I cannot see you'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCard(false)}
              aria-label="Hide the gesture list"
              className="shrink-0 rounded-md p-1 text-white/40 transition-colors hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {state === 'live' && (
            <>
              <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                <li className="col-span-2 flex items-baseline justify-between gap-2 border-b border-white/[0.08] pb-1.5">
                  <span className="text-[12.5px] text-white/75">Lean / squat</span>
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-white/35">Move · charge</span>
                </li>
                {ORDER.map((g) => (
                  <li key={g} className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12.5px] text-white/75">{GESTURE_LABEL[g]}</span>
                    <span className="font-mono text-[10px] font-bold text-[#00E5FF]">{GESTURE_BUTTON[g]}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => srcRef.current?.recalibrate()}
                className="mt-3 w-full rounded-lg border border-white/12 py-2 font-mono text-[10px] font-bold
                           uppercase tracking-[0.14em] text-white/50 transition-colors hover:text-white"
              >
                Stand still to re-centre
              </button>
            </>
          )}
        </div>
      )}

      {state === 'error' && detail && (
        <span className="font-mono text-[10px] text-[#FF3366]">{detail}</span>
      )}
    </>
  );
}
