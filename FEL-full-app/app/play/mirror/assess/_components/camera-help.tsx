'use client';

// What to do when the camera does not start, as steps, not an error code. Local to this route (the qa-fixes lane builds
// the shared helper separately). The words PoseService gives are matched to a kind; anything else gets the general steps.
import { CameraOff } from 'lucide-react';

type Kind = 'denied' | 'missing' | 'busy' | 'insecure' | 'model' | 'other';

export function cameraProblem(why: string | null): Kind {
  const w = (why ?? '').toLowerCase();
  if (w.includes('refused')) return 'denied';
  if (w.includes('no camera')) return 'missing';
  if (w.includes('in use') || w.includes('could not start') || w.includes('stopped')) return 'busy';
  if (w.includes('https')) return 'insecure';
  if (w.includes('pose model')) return 'model';
  return 'other';
}

const STEPS: Record<Kind, { title: string; steps: string[] }> = {
  denied: {
    title: 'The camera is blocked for this site',
    steps: [
      'Open the site settings (the lock or camera icon beside the address).',
      'Set Camera to Allow for this site.',
      'On a phone: Settings → your browser → Camera → Allow.',
      'Come back and press Try again.',
    ],
  },
  missing: {
    title: 'No camera was found',
    steps: ['Plug in a webcam, or open this page on a phone.', 'If a camera is connected, unplug it and plug it back in.', 'Press Try again.'],
  },
  busy: {
    title: 'Another app is using the camera',
    steps: ['Close other video apps and tabs (calls, other camera pages).', 'On a laptop, check no other app has the webcam light on.', 'Press Try again.'],
  },
  insecure: {
    title: 'This page cannot reach the camera',
    steps: ['Open the page over https (the address should start with https://).', 'Press Try again.'],
  },
  model: {
    title: 'The pose model did not load',
    steps: ['Check the connection; the model is 6–9 MB the first time and kept after that.', 'Press Try again.'],
  },
  other: {
    title: 'The camera did not start',
    steps: ['Reload the page.', 'Allow the camera when asked.', 'If it still fails, try another browser (Chrome, Safari or Edge).'],
  },
};

export function CameraHelp({ why, onRetry }: { why: string | null; onRetry: () => void }) {
  const k = STEPS[cameraProblem(why)];
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center gap-3">
        <CameraOff className="h-6 w-6 text-[#FFB020]" />
        <h2 className="text-[18px] font-black leading-tight text-white">{k.title}</h2>
      </div>
      {why ? <p className="mt-2 text-[12.5px] text-white/45">{why}</p> : null}
      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-[14px] leading-relaxed text-white/80">
        {k.steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <button type="button" onClick={onRetry} className="mt-5 rounded-full bg-[#00E5FF] px-5 py-2.5 text-[14px] font-bold text-black">
        Try again
      </button>
    </div>
  );
}
