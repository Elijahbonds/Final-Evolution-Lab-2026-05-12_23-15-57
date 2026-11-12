'use client';

// The CLAIM button of the end card (see claim.ts: reveal-only — it grants nothing and makes no request). Before the press it
// is one gold button in the card's focus grid (pad, keyboard, touch like the rest); after it, the lines the run earned spring
// in one by one (instantly under reduced motion) and the sentence is said to a screen reader through a polite live region.
// REPLAY unmounts the card, so the next run's CLAIM always starts unclaimed.

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Gift } from 'lucide-react';
import { claimText, type ClaimLine } from './claim';

export function ClaimBar({ lines, ready, focused, instant, canPress, onClaim }: {
  lines: readonly ClaimLine[];
  /** The reveal has played out: before that the button is not there to press (disabled, out of the focus grid). */
  ready: boolean;
  focused: boolean;
  instant: boolean;
  /** The card's arming guard — a press carried over from the last second of play never claims. */
  canPress: () => boolean;
  /** Side effects of the press (the card's cue, confetti, focus); the claim itself changes nothing outside this component. */
  onClaim?: () => void;
}) {
  const [claimed, setClaimed] = useState(false);
  if (lines.length === 0) return null;
  const text = claimText(lines);
  return (
    <div data-end-claim={claimed ? 'claimed' : 'open'} className="flex flex-col gap-[0.4em]">
      {/* said once, on the press: a polite live region that already exists when its text arrives */}
      <p role="status" aria-live="polite" data-end-claim-text className="sr-only">{claimed ? text : ''}</p>
      {claimed ? (
        <motion.div
          initial={instant ? false : { scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 14, stiffness: 260 }}
          className="rounded-2xl border border-[#FFD700]/50 bg-[#FFD700]/10 px-[0.7em] py-[0.45em]"
        >
          <div className="fel-heading flex items-center gap-[0.4em] font-bold text-[#FFD700]"><Check className="h-[1.1em] w-[1.1em]" /> CLAIMED</div>
          <ul aria-hidden className="mt-[0.3em] flex flex-wrap gap-[0.4em]">
            {lines.map((l, i) => (
              <motion.li
                key={l.id}
                data-claim-line={l.id}
                initial={instant ? false : { y: 10, opacity: 0, scale: 0.8 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ type: 'spring', damping: 12, stiffness: 240, delay: instant ? 0 : 0.12 + i * 0.09 }}
                className="rounded-full border border-[#FFD700]/40 bg-black/30 px-[0.7em] py-[0.15em] font-display tabular-nums text-[0.9em] font-bold text-white"
              >
                {l.amount} <span className="font-normal text-white/65">{l.label}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      ) : (
        <button
          type="button"
          data-end-focus="claim"
          data-focused={focused}
          disabled={!ready}
          aria-label={`Claim your rewards: ${lines.map((l) => `${l.amount} ${l.label}`).join(', ')}`}
          onClick={(e) => { e.stopPropagation(); if (!canPress()) return; setClaimed(true); onClaim?.(); }}
          className="fel-heading flex items-center justify-center gap-[0.4em] rounded-xl border border-[#FFD700]/50 bg-[#FFD700]/10 px-[0.9em] py-[0.55em] text-[1em] font-bold text-[#FFD700] outline-none transition-[transform,box-shadow,background-color] duration-150 hover:bg-[#FFD700]/20 data-[focused=true]:scale-[1.04] data-[focused=true]:ring-4 data-[focused=true]:ring-[#FFD700] data-[focused=true]:ring-offset-2 data-[focused=true]:ring-offset-black disabled:opacity-0"
        >
          <Gift className="h-[1.1em] w-[1.1em]" /> CLAIM
        </button>
      )}
    </div>
  );
}
