'use client';
// AcceptTrainerInvite — GROUP-BOOKING: one tap to accept the owner's trainer invite (POST /api/group-booking/trainer).
import { useState } from 'react';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { SHOP_LOOK as L } from '@/components/shop/look';
import { postJson } from '@/lib/group-booking/client';

export function AcceptTrainerInvite({ code }: { code: string }) {
  const [line, setLine] = useState<string | null>(null);
  const go = async () => {
    const r = await postJson(fetch, '/api/group-booking/trainer', { code });
    setLine(r?.status === 200 ? "You're on the team. The coach sets your gyms and hours." : r?.json.error === 'adults_only' ? 'Trainers need an adult account.' : 'This invite is not valid any more. Ask the coach for a new one.');
  };
  return (
    <div className="mt-6">
      {line ? <p role="status" className={L.lede}>{line}</p> : <div className={L.cta}><PrimaryCta onClick={() => { void go(); }}>Accept</PrimaryCta></div>}
    </div>
  );
}
