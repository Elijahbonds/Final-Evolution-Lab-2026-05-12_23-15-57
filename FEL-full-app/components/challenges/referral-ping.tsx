'use client';

// CHALLENGES-2: settles any referral Lab Credits owed (POST /api/challenge/referral, exactly once per friend on the
// server), once per page view for a signed-in player, and says so only when this view paid something.

import { useEffect, useRef, useState } from 'react';

interface Answer {
  asFriend?: { status: string; amount?: number };
  asReferrer?: { status: string; amount?: number }[];
}

export function referralLine(a: Answer | null): string | null {
  if (!a) return null;
  const mine = a.asFriend?.status === 'granted' ? a.asFriend.amount ?? 0 : 0;
  const paid = (a.asReferrer ?? []).filter((r) => r.status === 'granted');
  const fromFriends = paid.reduce((n, r) => n + (r.amount ?? 0), 0);
  if (mine > 0 && fromFriends > 0) return `+${mine + fromFriends} Lab Credits: you and your friends finished a first week.`;
  if (mine > 0) return `+${mine} Lab Credits: you finished your first week. Your friend got the same.`;
  if (fromFriends > 0) return `+${fromFriends} Lab Credits: ${paid.length === 1 ? 'a friend' : `${paid.length} friends`} you challenged finished a first week. They got the same.`;
  return null;
}

export function ReferralPing() {
  const sent = useRef(false);
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    fetch('/api/challenge/referral', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((a: Answer | null) => setLine(referralLine(a)))
      .catch(() => {});
  }, []);
  if (!line) return null;
  return (
    <div className="rounded-xl border border-[#FFD700]/30 bg-[#FFD700]/10 px-4 py-3 text-center text-sm text-[#FFD700]" role="status" data-referral-paid>
      {line}
    </div>
  );
}
