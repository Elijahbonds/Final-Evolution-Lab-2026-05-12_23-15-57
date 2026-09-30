'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

// MIRROR-COACH P5 (2026-09-29): the accept action is a CLICK, calling GET /api/v1/camp/consent?token=… from JS —
// deliberately not a plain link straight to that URL. A link-preview crawler (iMessage, WhatsApp, Slack unfurling a
// shared text) fetches whatever URL was actually shared; sharing THIS page's URL means a crawler only ever loads a
// page that reads and displays the request (app/consent/guardian/[token]/page.tsx does no write on render), and the
// write happens only if a human taps this button, which no crawler does.
//
// MIRROR-COACH P6 (2026-09-29): a PLAYER-requested link (flow="player") accepts with PATCH and a JSON body instead —
// the route's accept for the link a minor holds, which needs a signed-in adult account and may carry that account's
// birth year the one time it has none (askBirthYear). A camp link (the default) calls the same GET it always did.

export type AcceptFlow = 'camp' | 'player';

/** The request each flow sends. Pure, so a node test can pin it: the camp flow's call is P5's, unchanged. */
export function acceptRequest(flow: AcceptFlow, token: string, birthYear?: number | null): { url: string; init?: RequestInit } {
  if (flow === 'camp') return { url: `/api/v1/camp/consent?token=${encodeURIComponent(token)}` };
  return {
    url: '/api/v1/camp/consent',
    init: {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(birthYear != null ? { token, birthYear } : { token }),
    },
  };
}

/** P5's two strings, kept word for word for the camp flow — whose accept rules did not change, so neither does its copy. */
const CAMP_SELF_BLOCKED =
  "This has to be confirmed by your parent or guardian, not you — you're currently signed in as the athlete this is for. Sign out first, or have them open this link on their own phone or account.";
const LINK_INVALID = 'That link is no longer valid — ask them to send you a new one.';

/** What a refusal says, by flow and the route's error code (lib/consent/guardianAccept.ts PLAYER_ACCEPT_REFUSALS + P5's). */
export function acceptErrorCopy(flow: AcceptFlow, code: unknown): string {
  // MIRROR-COACH P5 FIX (2026-09-29, code review): self_accept_blocked means "you're signed in as the athlete this
  // consent is for" — the generic copy would send someone straight back to asking for a new link instead of the one
  // thing that fixes it: a DIFFERENT person, on their own account.
  if (flow === 'camp') return code === 'self_accept_blocked' ? CAMP_SELF_BLOCKED : LINK_INVALID;
  switch (code) {
    // P6: "sign out first" is no longer a way through for a player link (signed out is refused), so it is not offered.
    case 'self_accept_blocked':
      return "This has to be confirmed by your parent or guardian, not you — you're currently signed in as the athlete this is for. Have them open this link on their own phone, signed in to their own account.";
    case 'guardian_sign_in_required':
      return 'Sign in to your own FEL account first (or make one — it’s free), then open this link again.';
    case 'guardian_birth_year_required':
      return 'Add your birth year above to confirm.';
    case 'birth_year_invalid':
      return 'That birth year doesn’t look right — four digits, like 1984.';
    case 'guardian_not_adult':
      return 'The person confirming has to be an adult. A parent or guardian can confirm from their own account.';
    default:
      return LINK_INVALID;
  }
}

export function AcceptButton({ token, flow = 'camp', askBirthYear = false }: { token: string; flow?: AcceptFlow; askBirthYear?: boolean }) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [birthYear, setBirthYear] = useState('');

  const yearReady = !askBirthYear || /^\d{4}$/.test(birthYear);

  const accept = async () => {
    setState('working');
    setError(null);
    try {
      const { url, init } = acceptRequest(flow, token, askBirthYear ? Number(birthYear) : null);
      const res = await fetch(url, init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(acceptErrorCopy(flow, body?.error));
        setState('error');
        return;
      }
      setState('done');
    } catch {
      setError('No connection. Try again in a moment.');
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <p className="mt-6 inline-flex items-center gap-2 rounded-xl border border-[#00FF9D]/40 bg-[#00FF9D]/10 px-5 py-3 font-bold text-[#00FF9D]">
        <Check className="h-4 w-4" /> Confirmed
      </p>
    );
  }

  return (
    <>
      {askBirthYear && (
        <label className="mt-6 flex w-full max-w-xs flex-col gap-1.5 text-left">
          <span className="text-xs text-white/60">Your birth year — the person confirming has to be an adult. It&apos;s saved to your own FEL account.</span>
          <input
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            placeholder="e.g. 1984"
            inputMode="numeric"
            className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-[15px] text-white outline-none"
          />
        </label>
      )}
      <button
        type="button"
        onClick={accept}
        disabled={state === 'working' || !yearReady}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#00E5FF] px-6 py-3 font-bold text-[#050505] transition-transform hover:scale-[1.02] disabled:opacity-60"
      >
        {state === 'working' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Yes, I&apos;m their parent or guardian
      </button>
      {error && <p className="mt-3 max-w-xs text-xs text-[#FF3366]">{error}</p>}
    </>
  );
}
