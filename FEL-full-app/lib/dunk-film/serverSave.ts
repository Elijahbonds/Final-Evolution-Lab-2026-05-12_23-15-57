// Film dunk → POST /api/mirror/dunks.
//
// #103 saved when the person TAPPED "18 or older". That tap is not a verified age. Elijah's rule: the server
// keeps numbers only for a verified adult (User.dobYear, verifiedAdult in lib/privacy/verifiedAdult.ts) who has
// the AB-04 opt-in on. This function is the only place the film page posts. Self-reported 18+, under 18, and
// "rather not say" post nothing.

import type { AgeBand } from '@/lib/screen/age';
import { isKid } from '@/lib/screen/age';
import type { DunkHistoryBody } from './history';

export function dunkNumbersLeaveDevice(input: {
  selfReportedAge: AgeBand | null;
  serverVerifiedAdult: boolean;
  optedIn: boolean;
  checked: boolean;
}): boolean {
  if (isKid(input.selfReportedAge)) return false;
  if (input.serverVerifiedAdult !== true) return false;
  if (input.optedIn !== true || input.checked !== true) return false;
  return true;
}

export async function postDunkNumbers(args: {
  selfReportedAge: AgeBand | null;
  serverVerifiedAdult: boolean;
  optedIn: boolean;
  checked: boolean;
  bodies: DunkHistoryBody[];
  runIdFor: (index: number) => string;
  fetchImpl?: typeof fetch;
}): Promise<{ kept: number; posted: boolean; refused: string }> {
  if (!dunkNumbersLeaveDevice(args)) return { kept: 0, posted: false, refused: '' };
  const fetchImpl = args.fetchImpl ?? fetch;
  let kept = 0;
  let refused = '';
  for (let i = 0; i < args.bodies.length; i++) {
    try {
      const res = await fetchImpl('/api/mirror/dunks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...args.bodies[i], runId: args.runIdFor(i) }),
      });
      if (res.ok) kept += 1;
      else refused = refused || `The history did not keep it (${res.status}). The card stays on this device.`;
    } catch {
      refused = 'The history could not be reached. The card stays on this device.';
    }
  }
  return { kept, posted: true, refused };
}
