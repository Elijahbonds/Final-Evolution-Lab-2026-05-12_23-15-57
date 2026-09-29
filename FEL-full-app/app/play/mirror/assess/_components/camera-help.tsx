'use client';

// What to do when the camera does not start, as steps, not an error code (SCREEN-SHIP, Squad gate 4): a FULL-SCREEN
// card with a plain reason, a Retry that asks for the camera again, and a next step. Never a header banner: this card
// replaces the whole page. Local to this route (the header, body-play.tsx and the movement lane's files are untouched).
// The words PoseService gives (lib/pose/PoseService.ts explain()) are matched to a kind; anything else gets the general
// steps.
import { CameraOff } from 'lucide-react';
import { SYSTEM_FONT_STACK } from '@/lib/screen/ui';
import { DISCLAIMER } from '@/lib/screen/copy';

export type CameraProblem = 'denied' | 'missing' | 'busy' | 'insecure' | 'model' | 'other';

/** PoseService's reason → the kind of help. NotAllowedError says "refused"; NotFoundError says "No camera was found". */
export function cameraProblem(why: string | null): CameraProblem {
  const w = (why ?? '').toLowerCase();
  if (w.includes('refused')) return 'denied';
  if (w.includes('no camera')) return 'missing';
  if (w.includes('in use') || w.includes('could not start') || w.includes('stopped')) return 'busy';
  if (w.includes('https')) return 'insecure';
  if (w.includes('pose model')) return 'model';
  return 'other';
}

export const CAMERA_HELP: Record<CameraProblem, { title: string; reason: string; steps: string[]; next: string }> = {
  denied: {
    title: 'The camera is blocked',
    reason: 'This browser was told not to let this site use the camera.',
    steps: [
      'Open the site settings (the lock or camera icon beside the address).',
      'Set Camera to Allow for this site.',
      'On a phone: Settings → your browser → Camera → Allow.',
    ],
    next: 'Then press Try again.',
  },
  missing: {
    title: 'No camera was found',
    reason: 'This device did not offer a camera to the page.',
    steps: ['Plug in a webcam, or open this page on a phone.', 'If a camera is connected, unplug it and plug it back in.'],
    next: 'Or try on a phone with a camera: open the same address there.',
  },
  busy: {
    title: 'Another app is using the camera',
    reason: 'The camera is busy, or it stopped.',
    steps: ['Close other video apps and tabs (calls, other camera pages).', 'On a laptop, check no other app has the webcam light on.'],
    next: 'Then press Try again.',
  },
  insecure: {
    title: 'This page cannot reach the camera',
    reason: 'A browser only lends the camera to a secure (https) page.',
    steps: ['Open the page over https (the address should start with https://).'],
    next: 'Then press Try again.',
  },
  model: {
    title: 'The pose model did not load',
    reason: 'The body-tracking model (6–9 MB the first time) did not arrive.',
    steps: ['Check the connection; the model is kept after the first time.'],
    next: 'Then press Try again.',
  },
  other: {
    title: 'The camera did not start',
    reason: 'Something stopped the camera from starting.',
    steps: ['Reload the page.', 'Allow the camera when asked.'],
    next: 'If it still doesn\'t start, try another browser (Chrome, Safari or Edge).',
  },
};

export function CameraHelp({ why, onRetry, onBack }: { why: string | null; onRetry: () => void; onBack?: () => void }) {
  const kind = cameraProblem(why);
  const k = CAMERA_HELP[kind];
  return (
    <div data-camera-card={kind} role="alertdialog" aria-labelledby="camera-card-title"
      className="fixed inset-0 z-[60] overflow-y-auto bg-[#050505] text-white" style={{ fontFamily: SYSTEM_FONT_STACK }}>
      <div className="mx-auto flex min-h-full max-w-[560px] flex-col justify-center px-5 py-8">
        <CameraOff aria-hidden className="h-10 w-10 text-[#FFB020]" />
        <h1 id="camera-card-title" className="mt-3 text-[26px] font-black leading-tight">{k.title}</h1>
        <p className="mt-2 text-[16px] leading-snug text-white/85">{k.reason}</p>
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed text-white/80">
          {k.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <p className="mt-3 text-[15px] font-bold text-white">{k.next}</p>
        <button type="button" data-primary data-retry onClick={onRetry} className="mt-6 w-full rounded-full bg-[#00E5FF] px-6 py-3.5 text-[16px] font-black text-black">
          Try again
        </button>
        {onBack ? <button type="button" onClick={onBack} className="mt-2 w-full py-2 text-[14px] text-white/60">Back to the start</button> : null}
        <p className="mt-6 text-[12px] text-white/45">{DISCLAIMER}</p>
      </div>
    </div>
  );
}
