'use client';

import { useState, type ReactNode } from 'react';
import { signOut } from 'next-auth/react';
import {
  AGE_BLOCK_COOKIE,
  AGE_BLOCK_STORAGE_KEY,
  AGE_BLOCK_VALUE,
  AGE_DATE_INVALID,
  AGE_INVALID,
  AGE_QUESTION,
  AGE_TURN_AWAY,
  ageBlockCookieHeader,
  ageScreenOutcome,
  birthDateFor,
  birthYearOptions,
} from '@/lib/privacy/ageScreen';

/** True when this browser already carries the block cookie or the same constant in localStorage. */
export function ageBlockPresent(): boolean {
  if (typeof document !== 'undefined') {
    const hit = document.cookie.split(';').some((part) => {
      const [name, value] = part.trim().split('=');
      return name === AGE_BLOCK_COOKIE && value === AGE_BLOCK_VALUE;
    });
    if (hit) return true;
  }
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(AGE_BLOCK_STORAGE_KEY) === AGE_BLOCK_VALUE) return true;
  } catch { /* a blocked store is not an error */ }
  return false;
}

/** Write the constant flag in both places. Neither value is an age, an id, or a timestamp. */
export function writeAgeBlockFlag(): void {
  try { localStorage.setItem(AGE_BLOCK_STORAGE_KEY, AGE_BLOCK_VALUE); } catch { /* ignore */ }
  try { document.cookie = ageBlockCookieHeader(); } catch { /* ignore */ }
}

/** The neutral turn-away. No reason, no cutoff, no link back to sign-up or a parent step. */
export function AgeTurnAway() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] px-3 py-6 sm:px-4">
      <div className="fel-panel relative w-full max-w-md rounded-2xl p-5 text-center sm:p-8">
        <p className="text-sm text-white/70">{AGE_TURN_AWAY}</p>
      </div>
    </div>
  );
}

/**
 * The birth-date question. Signup: a blocked year writes the flag and makes no request. Account (an existing sign-in
 * with no year on file): every locked year, including a block, is posted to /api/account/birth-year.
 * FN-BOX-1b (2026-10-19): the month and day are asked beside the year, and the full date travels with it as
 * `birthDate` ('YYYY-MM-DD'). The block rule still reads the year alone, first: an under-13 year is turned away whatever
 * the month and day say. Any other year needs a real, past date before it locks.
 */
/**
 * look-screens A3 (ui.firstRunCard, lib/ui/firstRun.ts): the sign-up card's frame — its glow, its panel and the owner's crest — around
 * /try's birth-date step, so the guest's first question looks like /signup's. Layout only: the question, its words and its rule are
 * AgeStep's, unchanged. `on` false: the children exactly as before (no element added).
 */
export function AgeCard({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    <div data-age-card className="relative mx-auto w-full max-w-md px-1">
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#00E5FF]/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-[#A855F7]/10 blur-[120px]" />
      </div>
      <div className="fel-panel relative w-full rounded-2xl p-5 sm:p-8">
        {/* a plain img: the crest is a small static file (public/brand), and next/image needs the app's config the guest shell's tests do not load */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/crest-light.png" alt="" width={132} height={140} className="mx-auto mb-4 h-[72px] w-auto opacity-90 sm:h-[92px]" />
        {children}
      </div>
    </div>
  );
}

export function AgeStep({
  mode,
  onLocked,
  onBlocked,
  nextPath = '/',
  ready = true,
}: {
  mode: 'signup' | 'account';
  onLocked?: (year: number, birthDate: string) => void;
  onBlocked?: () => void;
  nextPath?: string;
  /** PERF-834-LCP (a): false while the page has not hydrated — Continue stays disabled (a tap before handlers attach is lost). */
  ready?: boolean;
}) {
  const [away, setAway] = useState(ageBlockPresent);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [locked, setLocked] = useState<number | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (away) return <AgeTurnAway />;

  const onContinue = async () => {
    if (busy || locked !== null) return;
    const n = Number(year);
    const outcome = year === '' ? 'invalid' : ageScreenOutcome(n);
    if (outcome === 'invalid') {
      setInvalid(AGE_INVALID);
      return;
    }
    const birthDate = outcome === 'blocked' ? null : birthDateFor(n, Number(month), Number(day));
    if (outcome !== 'blocked' && birthDate === null) {
      setInvalid(AGE_DATE_INVALID);
      return;
    }
    setInvalid(null);
    setLocked(n);
    if (mode === 'signup') {
      if (outcome === 'blocked') {
        writeAgeBlockFlag();
        onBlocked?.();
        setAway(true);
        return;
      }
      onLocked?.(n, birthDate as string);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/account/birth-year', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(birthDate ? { birthYear: n, birthDate } : { birthYear: n }),
      });
      if (outcome === 'blocked' || res.status === 403) {
        writeAgeBlockFlag();
        await signOut({ redirect: false });
        onBlocked?.();
        setAway(true);
        return;
      }
      if (res.ok && typeof window !== 'undefined') window.location.assign(nextPath);
    } catch { /* leave the year locked; there is no edit and no second try past a block */ }
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <p className="text-center text-sm text-white/70">{AGE_QUESTION}</p>
      {locked === null ? (
        <select
          aria-label="Birth year"
          value={year}
          onChange={(e) => { setYear(e.target.value); setInvalid(null); }}
          className="w-full rounded-md border border-white/10 bg-[#16161A] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-[#00E5FF]/60"
        >
          <option value="" disabled>Select year</option>
          {birthYearOptions().map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      ) : (
        <p className="rounded-md border border-white/10 bg-[#16161A] px-4 py-3 text-sm text-white">{locked}</p>
      )}
      {locked === null ? (
        <div className="flex gap-3">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={12}
            placeholder="Month"
            aria-label="Month"
            value={month}
            onChange={(e) => { setMonth(e.target.value); setInvalid(null); }}
            className="w-1/2 rounded-md border border-white/10 bg-[#16161A] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-[#00E5FF]/60"
          />
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            placeholder="Day"
            aria-label="Day"
            value={day}
            onChange={(e) => { setDay(e.target.value); setInvalid(null); }}
            className="w-1/2 rounded-md border border-white/10 bg-[#16161A] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-[#00E5FF]/60"
          />
        </div>
      ) : null}
      {invalid ? <p className="text-xs text-white/50">{invalid}</p> : null}
      {locked === null ? (
        <button
          type="button"
          onClick={onContinue}
          disabled={busy || !ready}
          className="fel-heading flex w-full items-center justify-center rounded-md bg-[#00E5FF] py-3 text-lg font-bold text-black transition-all hover:bg-[#00E5FF]/85 disabled:opacity-50"
        >
          Continue
        </button>
      ) : null}
    </div>
  );
}
