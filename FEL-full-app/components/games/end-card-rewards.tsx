'use client';

import { useState } from 'react';
import { Check, Gift } from 'lucide-react';

/**
 * QA (PM ruling 2026-09-28, replacing the P0-03 server-resend CLAIM): pure client-side reveal.
 *
 * ECONOMY-SESSIONS-HARDEN already put this run's payout in the session's own response (game-shell.tsx's `recap` /
 * `recapCoins`, filled the moment `/api/sessions` answers) — there is no separate earn report left to claim or
 * re-send, and asking for one again would risk a second grant against the new, session-transaction-keyed server.
 * CLAIM here never touches the network: tapping it only flips a local flag and plays a confirm beat over numbers
 * that were already on screen. REPLAY closes the results card (game-shell.tsx unmounts this on a new run), so the
 * next run's CLAIM always starts unclaimed — no state to carry over or reset by hand.
 */
export function EndCardClaim() {
  const [claimed, setClaimed] = useState(false);
  if (claimed) {
    return (
      <span className="fel-heading flex flex-1 items-center justify-center gap-2 rounded-md border border-[#FFD700]/50 bg-[#FFD700]/10 py-3 text-base font-bold text-[#FFD700]">
        <Check className="h-4 w-4" /> CLAIMED
      </span>
    );
  }
  return (
    <button
      onClick={() => setClaimed(true)}
      className="fel-heading flex flex-1 items-center justify-center gap-2 rounded-md border border-[#FFD700]/50 bg-[#FFD700]/10 py-3 text-base font-bold text-[#FFD700] transition-all hover:bg-[#FFD700]/20 active:scale-95"
    >
      <Gift className="h-4 w-4" /> CLAIM
    </button>
  );
}
