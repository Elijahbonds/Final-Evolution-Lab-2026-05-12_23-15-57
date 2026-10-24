'use client';

// Share your week: the card as an image (GET /api/v1/progress-card/image), shown here first so the owner sees exactly
// what would leave the phone, then handed to the share sheet or saved, only on a tap (lib/capture/shareClip.ts: the app
// never posts). The image is made on the first tap, not on load: a person who never shares costs no render, and the
// second tap (Share) still runs inside a fresh gesture, which iPhone's share sheet requires.
//
// TEENS PRIVATE BY DEFAULT (owner 2026-10-22): an under-18 or unknown-age account has no name option at all, and the
// server refuses to draw one whatever is asked. An adult's name is off until they tick it (assumption: off by default).
import { useCallback, useEffect, useState } from 'react';
import { Download, Share2, ImageIcon, Loader2 } from 'lucide-react';
import { deliverClip, downloadBlob, type ShareEnv } from '@/lib/capture/shareClip';

export const SHARE_IMAGE_PATH = '/api/v1/progress-card/image';
export const SHARE_FILE_NAME = 'fel-my-week.png';
const SHARE_TITLE = 'My week on Final Evolution Lab';

type Phase =
  | { kind: 'idle' }
  | { kind: 'making' }
  | { kind: 'ready'; blob: Blob; url: string }
  | { kind: 'failed'; why: string };

export function shareImageUrl(withName: boolean): string {
  return `${SHARE_IMAGE_PATH}?name=${withName ? '1' : '0'}`;
}

function shareEnv(): ShareEnv {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  return {
    share: typeof nav.share === 'function' ? (d) => nav.share(d) : undefined,
    canShare: typeof nav.canShare === 'function' ? (d) => nav.canShare!(d) : undefined,
    download: downloadBlob,
  };
}

export function ShareWeek({ minor, phoneOnly }: { minor: boolean; phoneOnly: boolean }) {
  const [withName, setWithName] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [said, setSaid] = useState<string | null>(null);

  // a new choice of name is a new image; the old preview's memory is let go
  useEffect(() => () => { if (phase.kind === 'ready') URL.revokeObjectURL(phase.url); }, [phase]);

  const make = useCallback(async () => {
    setPhase({ kind: 'making' }); setSaid(null);
    try {
      const res = await fetch(shareImageUrl(!minor && withName), { cache: 'no-store', credentials: 'same-origin' });
      if (res.status === 429) { setPhase({ kind: 'failed', why: 'That’s a lot of images for now. Try again in a few minutes.' }); return; }
      if (!res.ok) { setPhase({ kind: 'failed', why: 'Couldn’t make the image. Try again.' }); return; }
      const blob = await res.blob();
      setPhase({ kind: 'ready', blob, url: URL.createObjectURL(blob) });
    } catch {
      setPhase({ kind: 'failed', why: 'Couldn’t make the image. Check your connection and try again.' });
    }
  }, [minor, withName]);

  const share = useCallback(async () => {
    if (phase.kind !== 'ready') return;
    const plan = await deliverClip(phase.blob, SHARE_FILE_NAME, SHARE_TITLE, shareEnv());
    setSaid(plan.kind === 'sheet' ? 'Shared.' : plan.kind === 'download' ? 'Saved to this device.' : null);
  }, [phase]);

  const save = useCallback(() => {
    if (phase.kind !== 'ready') return;
    downloadBlob(phase.blob, SHARE_FILE_NAME);
    setSaid('Saved to this device.');
  }, [phase]);

  const btn = 'inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold transition-colors disabled:opacity-50';
  return (
    <section aria-labelledby="share-week-h" className="mt-6 rounded-2xl border border-white/[0.07] bg-[#0c0c11] p-4">
      <h2 id="share-week-h" className="fel-heading text-[16px] font-bold text-white">Share your week</h2>
      <p className="mt-1 text-[12px] leading-snug text-white/50">
        An image of this card. You see it first; nothing is posted unless you share it.
        {phoneOnly && ' Numbers kept only on this phone aren’t on it.'}
      </p>
      {minor ? (
        <p data-share-name="never" className="mt-2 text-[12px] leading-snug text-white/50">Under 18, your name and photo are never on the image.</p>
      ) : (
        <label className="mt-3 flex min-h-11 items-center gap-2.5 text-[13px] text-white/75">
          <input type="checkbox" checked={withName} data-share-name="choice"
            onChange={(e) => { setWithName(e.target.checked); setPhase({ kind: 'idle' }); setSaid(null); }}
            className="h-4 w-4 accent-[#00E5FF]" />
          Put my name on it
        </label>
      )}
      {phase.kind !== 'ready' && (
        <button type="button" onClick={make} disabled={phase.kind === 'making'} data-testid="share-week-make"
          className={`${btn} mt-3 border border-[#00E5FF]/45 bg-[#00E5FF]/[0.1] text-white hover:bg-[#00E5FF]/20`}>
          {phase.kind === 'making' ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <ImageIcon aria-hidden className="h-4 w-4 text-[#00E5FF]" />}
          {phase.kind === 'making' ? 'Making the image…' : 'Make the image'}
        </button>
      )}
      {phase.kind === 'failed' && <p role="alert" className="mt-2 text-[12px] text-[#FF7A2F]">{phase.why}</p>}
      {phase.kind === 'ready' && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL of the image about to be shared */}
          <img src={phase.url} alt="Your week, as the image you would share" width={1080} height={1350}
            className="h-auto w-full max-w-[240px] rounded-xl border border-white/10" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={share} data-testid="share-week-share"
              className={`${btn} border border-[#00E5FF]/45 bg-[#00E5FF]/[0.14] text-white hover:bg-[#00E5FF]/25`}>
              <Share2 aria-hidden className="h-4 w-4 text-[#00E5FF]" /> Share
            </button>
            <button type="button" onClick={save} className={`${btn} border border-white/10 text-white/75 hover:bg-white/[0.05]`}>
              <Download aria-hidden className="h-4 w-4" /> Save
            </button>
          </div>
        </div>
      )}
      {said && <p role="status" className="mt-2 text-[12px] text-[#00FF9D]">{said}</p>}
    </section>
  );
}
