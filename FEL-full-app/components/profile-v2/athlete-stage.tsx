'use client';

// The athlete at the top of the profile (lane/profile-character, owner 2026-10-27: "Make the profile show your actual
// character, not some stick figure"). Your own profile shows YOUR athlete — the body, saved look, hair and clothes every
// mode plays — and it does it by itself, with no button:
//
//   1. at once: the picture of your athlete this device kept the last time the 3D drew it (lib/profile-v2/athletePoster.ts,
//      posterStore.ts), if it still matches your look; otherwise the athlete's silhouette with the loading shimmer;
//   2. once the stage is near the screen (components/library/use-auto-open, the demos' autoplay) and the page has painted,
//      gone a second without a tap or scroll, and gone idle, the live 3D (athlete-3d.tsx, its own lazy chunk) loads underneath and fades in over the picture: it
//      idles, turns slowly, and a sideways drag turns it;
//   3. the 3D's first sure frame becomes the kept picture for next time (only when the look changed or none was kept).
//
// Another person's profile (`viewer`) shows the athlete's silhouette, still: the 3D would draw the SIGNED-IN visitor's own
// body (resolveIdentity reads the visitor's closet), and no public picture of another account's body exists — showing one
// is an owner call (docs/PROFILE-V2.md, "The athlete stage"), not something this stage does on its own.
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAutoOpen } from '@/components/library/use-auto-open';
import { AthleteSilhouette } from './athlete-silhouette';
import { DEVICE_LOOK_KEY, posterHash, posterStale, posterUsable, type PosterKey, type PosterRecord } from '@/lib/profile-v2/athletePoster';
import { dropPoster, readPoster, writePoster } from '@/lib/profile-v2/posterStore';

// the stage draws its own placeholder underneath, so the chunk's loading slot is empty
const Athlete3D = dynamic(() => import('./athlete-3d'), { ssr: false, loading: () => null });

const BOX = 'fel-surface relative h-[208px] w-full overflow-hidden lg:h-[300px]';
const FADE = { transitionDuration: 'var(--fel-dur-slow)' } as const;

const INPUTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
/** How long the page must go without a tap, key or scroll before the 3D starts loading (its load has long tasks a tap
 *  would wait behind; a person reading the profile gives it this gap within a second or two). */
const QUIET_MS = 1000;

/**
 * After the first paint, once nobody has touched the page for QUIET_MS, when the page next goes idle (Safari has no
 * requestIdleCallback: a short timeout instead). `cancel` stops it and removes its listeners.
 */
function whenQuiet(start: () => void): () => void {
  let last = performance.now();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;
  const touched = () => { last = performance.now(); };
  const stop = () => { done = true; if (timer) clearTimeout(timer); for (const e of INPUTS) window.removeEventListener(e, touched, true); };
  for (const e of INPUTS) window.addEventListener(e, touched, { capture: true, passive: true });
  const idle = () => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const go = () => { if (done) return; const wait = last + QUIET_MS - performance.now(); if (wait > 0) { timer = setTimeout(idle, wait); return; } stop(); start(); };
    if (ric) ric(go, { timeout: 2000 }); else timer = setTimeout(go, 300);
  };
  const painted = () => requestAnimationFrame(() => { timer = setTimeout(idle, 0); });
  if (document.readyState === 'complete') painted(); else window.addEventListener('load', painted, { once: true });
  return stop;
}

function deviceLook(): string | null {
  try { return window.localStorage.getItem(DEVICE_LOOK_KEY); } catch { return null; }
}

export function AthleteStage({ name, accent, viewer = false, poster }: { name: string; accent: string; viewer?: boolean; poster?: PosterKey | null }) {
  if (viewer) {
    return (
      <div className={BOX} data-athlete-state="viewer" role="img" aria-label={`${name}'s athlete`}>
        <AthleteSilhouette accent={accent} />
      </div>
    );
  }
  return <OwnStage name={name} accent={accent} poster={poster ?? null} />;
}

function OwnStage({ name, accent, poster }: { name: string; accent: string; poster: PosterKey | null }) {
  const { ref, open } = useAutoOpen<HTMLDivElement>();
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [posterShown, setPosterShown] = useState(false);
  const [mount3d, setMount3d] = useState(false);
  const [three, setThree] = useState<'loading' | 'live' | 'failed'>('loading');
  const kept = useRef<PosterRecord | null>(null);
  const hash = useRef<string | null>(null);
  const owner = poster?.owner ?? null;
  const stamp = poster?.stamp ?? null;

  // 1. the kept picture, at once — if it is this account's and still this look
  useEffect(() => {
    if (!owner || !stamp) return;
    let alive = true;
    let url: string | null = null;
    const h = posterHash(stamp, deviceLook());
    hash.current = h;
    void readPoster(owner).then((rec) => {
      if (!alive) return;
      if (posterUsable(rec, h)) {
        kept.current = rec;
        try { url = URL.createObjectURL(rec!.blob); setPosterUrl(url); } catch { /* no picture: the silhouette stays */ }
      } else if (rec) {
        void dropPoster(owner);   // another look's picture is never shown
      }
    });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [owner, stamp]);

  // 2. the live 3D: near the screen, after the first paint, a quiet second, and idle
  useEffect(() => {
    if (!open) return;
    return whenQuiet(() => setMount3d(true));
  }, [open]);

  const live = three === 'live';
  const state = live ? 'live' : posterShown ? 'poster' : three === 'failed' ? 'failed' : 'loading';
  return (
    <div ref={ref} className={BOX} data-athlete-state={state}>
      <div aria-hidden className="absolute inset-x-6 bottom-3 h-6 rounded-[50%]" style={{ background: `radial-gradient(closest-side, ${accent}33, transparent)` }} />
      {!posterShown && !live && (
        <div className="absolute inset-0">
          <AthleteSilhouette loading={three === 'loading'} accent={accent} />
        </div>
      )}
      {posterUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- a blob: URL from this device's own store
        <img src={posterUrl} alt={live ? '' : `${name}'s athlete`} decoding="async" data-athlete-poster
          onLoad={() => setPosterShown(true)} onError={() => setPosterUrl(null)}
          className={`pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity ${posterShown && !live ? 'opacity-100' : 'opacity-0'}`} style={FADE} />
      )}
      {mount3d && three !== 'failed' && (
        <div className={`absolute inset-0 transition-opacity ${live ? 'opacity-100' : 'opacity-0'}`} style={FADE}>
          <Athlete3D
            label={`${name}'s athlete in 3D. Drag sideways to turn.`}
            onLive={() => setThree('live')}
            onFailed={() => setThree('failed')}
            wantSnapshot={(idHash) => !!owner && !!hash.current && posterStale(kept.current, hash.current, idHash)}
            onSnapshot={({ blob, w, h, idHash }) => {
              if (!owner || !hash.current) return;
              const rec: PosterRecord = { hash: hash.current, idHash, blob, w, h, at: Date.now() };
              kept.current = rec;
              void writePoster(owner, rec);
            }}
          />
        </div>
      )}
      {three === 'failed' && !posterShown && (
        <p className="absolute inset-x-0 bottom-2 text-center text-[12px] text-fel-quiet">3D isn’t available on this device.</p>
      )}
    </div>
  );
}
