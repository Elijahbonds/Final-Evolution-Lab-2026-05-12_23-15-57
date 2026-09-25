'use client';
// MOTION & FLASHES — the in-app side of reduced motion (HOTFIX 2026-09-24).
//
// The games follow the device's "reduce motion" setting by default. This is the override, both ways: REDUCED for a player
// who wants the calm version without changing their phone, FULL for one whose phone says reduce but wants the show. It
// lives on the Profile tab (the app's settings surface) and, compact, in the corner of every mode's boot splash, so a
// guest on /try can reach it before the first flash. The choice is read at the moment each effect fires, so it applies
// to the very next one — no reload.
//
// A `?motion=` link override (QA; in production it can only calm) outranks the stored choice for as long as the page is
// open. The control says so instead of showing a choice the games are not following.
import { useEffect, useState } from 'react';
import {
  MOTION_PREFS, motionUrlOverride, onMotionChange, osPrefersReducedMotion, resolveReducedMotion, storedMotionPref,
  writeMotionPref, type MotionPref,
} from '@/lib/a11y/reducedMotion';

const LABEL: Record<MotionPref, string> = { system: 'Match device', reduce: 'Reduced', full: 'Full' };
const SHORT: Record<MotionPref, string> = { system: 'AUTO', reduce: 'REDUCED', full: 'FULL' };

/** The chip's next step: AUTO → REDUCED → FULL → AUTO. */
export function nextMotionPref(pref: MotionPref): MotionPref {
  return MOTION_PREFS[(MOTION_PREFS.indexOf(pref) + 1) % MOTION_PREFS.length];
}

/** The one line under the picker: what is in force now, and why. `url` = a `?motion=` link override in force. */
export function motionStatus(pref: MotionPref, osReduces: boolean, url: MotionPref | null = null): string {
  if (url) {
    const held = resolveReducedMotion(url, osReduces);
    return `This page's link (?motion=${url}) is holding ${held ? 'reduced' : 'full'} motion. Your choice applies once you leave it.`;
  }
  const on = resolveReducedMotion(pref, osReduces);
  if (pref === 'system') return osReduces ? 'Your device asks for reduced motion, so the games are calm.' : 'Your device has no motion preference, so the games play in full.';
  return on ? 'Reduced, whatever your device says.' : 'Full, whatever your device says.';
}

/** What the splash chip shows and does, from the stored choice, the device and any link override. */
export function motionChip(pref: MotionPref, osReduces: boolean, url: MotionPref | null = null): {
  text: string; ariaLabel: string; next: MotionPref | null; reduced: boolean;
} {
  if (url) {
    // the link decides while this page is open: the chip says so and does not pretend a tap changes it
    const reduced = resolveReducedMotion(url, osReduces);
    return { text: `MOTION: LINK · ${reduced ? 'REDUCED' : 'FULL'}`, ariaLabel: `Motion and flashes: ${reduced ? 'reduced' : 'full'}, set by this page's link.`, next: null, reduced };
  }
  const reduced = resolveReducedMotion(pref, osReduces);
  const next = nextMotionPref(pref);
  return {
    text: `MOTION: ${pref === 'system' ? `AUTO · ${reduced ? 'REDUCED' : 'FULL'}` : SHORT[pref]}`,
    ariaLabel: `Motion and flashes: ${LABEL[pref]}${pref === 'system' ? ` (${reduced ? 'reduced' : 'full'})` : ''}. Change to ${LABEL[next]}.`,
    next, reduced,
  };
}

export function MotionSetting({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  // first paint = the default; the stored choice, the device and the link are read after mount (no hydration mismatch)
  const [pref, setPref] = useState<MotionPref>('system');
  const [os, setOs] = useState(false);
  const [url, setUrl] = useState<MotionPref | null>(null);
  useEffect(() => {
    const sync = () => { setPref(storedMotionPref()); setOs(osPrefersReducedMotion()); setUrl(motionUrlOverride()); };
    sync();
    return onMotionChange(sync);
  }, []);
  const pick = (p: MotionPref) => { if (p === pref) return; writeMotionPref(p); setPref(p); };

  if (compact) {
    // ONE chip, in the splash's corner: the splash's centre column is already full on a phone held sideways, so this
    // stays out of it. A tap steps AUTO → REDUCED → FULL → AUTO.
    const chip = motionChip(pref, os, url);
    return (
      <button type="button" disabled={chip.next === null}
        // HOTFIX (2026-09-24): blur after the step, as the splash's start button does. A clicked <button> keeps focus,
        // and the browser activates a focused button on Enter and on Space's keyup, so the next key press stepped the
        // setting again (REDUCED on to FULL) without the player touching the chip.
        onClick={(e) => { e.currentTarget.blur(); if (chip.next) pick(chip.next); }}
        aria-label={chip.ariaLabel}
        title={url ? 'Set by this page\'s link.' : chip.reduced ? 'Reduced: no flashes or shake, shorter hit-stops. Same game timing.' : 'Full: flashes, shake and slow-mo on the big moments.'}
        className={`${className} rounded-full border px-3 py-1 text-[10px] font-black tracking-wider transition ${chip.reduced ? 'border-white/60 bg-white/10 text-white' : 'border-white/30 text-white/70 hover:bg-white/10'}`}>
        {chip.text}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5" role="group" aria-labelledby="motion-setting-heading">
      <h3 id="motion-setting-heading" className="fel-heading mb-1 text-lg font-bold text-white">MOTION &amp; FLASHES</h3>
      <p className="mb-4 text-xs text-white/40">
        Reduced turns off screen flashes and camera shake in every game, and cuts hit-stops and slow-motion to a blink.
        Only the picture changes: every window, timer and score is the same. A slow-mo you are timing a press inside
        (the dunk&apos;s hang) keeps its length for that reason.
      </p>
      <div className="flex flex-wrap gap-2">
        {MOTION_PREFS.map((p) => (
          <button key={p} type="button" onClick={() => pick(p)} aria-pressed={p === pref}
            className={`rounded-md border px-4 py-2 text-xs font-bold transition-colors ${p === pref ? 'border-[#00E5FF] bg-[#00E5FF]/15 text-[#00E5FF]' : 'border-white/15 text-white/60 hover:bg-white/[0.05] hover:text-white'}`}>
            {LABEL[p]}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11.5px] text-white/50" aria-live="polite">{motionStatus(pref, os, url)}</p>
    </div>
  );
}
