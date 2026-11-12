'use client';

// Two opt-ins, both off until checked. Under 18 there is nothing to opt into: the look stays on the device.

import type { StoredConsent } from '@/lib/creator/localLook';

export function LookConsent({
  adult, consent, onChange,
}: {
  adult: boolean;
  consent: StoredConsent;
  onChange: (next: StoredConsent) => void;
}) {
  if (!adult) {
    return (
      <p className="font-mono text-[12px] leading-relaxed text-white/50">
        Your look stays on this device. Nothing is uploaded.
      </p>
    );
  }
  return (
    <div className="space-y-1 font-mono text-base leading-relaxed text-white/60">
      <label className="flex min-h-11 cursor-pointer items-start gap-2 py-1">
        <input type="checkbox" checked={consent.saveLookNumbers}
          onChange={(e) => onChange({ saveLookNumbers: e.target.checked, modelTraining: e.target.checked && consent.modelTraining })}
          className="peer sr-only" />
        <span aria-hidden className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border border-white/40 leading-none text-transparent peer-checked:border-cyan-400 peer-checked:bg-cyan-400 peer-checked:text-black peer-disabled:opacity-40 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-300">✓</span>
        <span>Save face-slider and body-shape numbers on this account. Off until you check this. Pictures are never saved.</span>
      </label>
      <label className="flex min-h-11 cursor-pointer items-start gap-2 py-1">
        <input type="checkbox" checked={consent.modelTraining} disabled={!consent.saveLookNumbers}
          onChange={(e) => onChange({ ...consent, modelTraining: e.target.checked })}
          className="peer sr-only" />
        <span aria-hidden className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border border-white/40 leading-none text-transparent peer-checked:border-cyan-400 peer-checked:bg-cyan-400 peer-checked:text-black peer-disabled:opacity-40 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-300">✓</span>
        <span>Use those numbers to train models. Separate opt-in, off by default. Nothing trains unless this is checked.</span>
      </label>
    </div>
  );
}
