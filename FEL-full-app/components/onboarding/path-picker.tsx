'use client';

// PathPicker — ONB-01: "What did you come for?", five answers, one tap. Used by the sign-up form and by /welcome.
//
// Teach is held for anyone who is not a verified adult (lib/onboarding/firstWin.ts pickerOptions): it shows, greyed,
// with "For adults (18+)", and cannot be picked. A teen account is set up for play and training, with no public anything.

import { BookOpen, Dumbbell, Gamepad2, Shirt, Users } from 'lucide-react';
import type { OnboardingPath } from '@/lib/onboarding/firstRun';
import { TEACH_HELD_LINE, pickerOptions } from '@/lib/onboarding/firstWin';

const ICONS: Record<OnboardingPath, typeof Gamepad2> = {
  play: Gamepad2, train: Dumbbell, learn: BookOpen, teach: Users, create: Shirt,
};

export function PathPicker({ value, onChange, adult }: {
  value: OnboardingPath;
  onChange: (path: OnboardingPath) => void;
  /** Verified adult? null = not known yet (the age step is not done): teach stays held until it is. */
  adult: boolean | null;
}) {
  const options = pickerOptions({ adult });
  return (
    <div data-path-picker>
      <p id="path-picker-label" className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
        What did you come for?
      </p>
      <div role="radiogroup" aria-labelledby="path-picker-label" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {options.map((o) => {
          const on = value === o.path;
          const Icon = ICONS[o.path];
          return (
            <button
              key={o.path}
              type="button"
              role="radio"
              aria-checked={on}
              aria-disabled={o.held || undefined}
              disabled={o.held}
              data-path={o.path}
              data-held={o.held ? 'true' : undefined}
              onClick={() => { if (!o.held) onChange(o.path); }}
              className="min-h-[76px] rounded-2xl border p-3.5 text-left transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-45"
              style={{
                borderColor: on ? `${o.accent}66` : 'rgba(255,255,255,0.10)',
                background: on ? `${o.accent}10` : 'rgba(255,255,255,0.02)',
              }}
            >
              <Icon aria-hidden className="h-[18px] w-[18px]" style={{ color: on ? o.accent : 'rgba(255,255,255,0.45)' }} strokeWidth={2.2} />
              <span className="fel-heading mt-2 block text-[14px] font-bold leading-none text-white">{o.label}</span>
              <span className="mt-1.5 block text-[11.5px] leading-snug text-white/60">{o.held ? TEACH_HELD_LINE : o.line}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
