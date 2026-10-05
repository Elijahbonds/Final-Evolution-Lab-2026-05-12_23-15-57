// The protocol gate's lines, drawn (MIRROR-COACH P8, 2026-09-29). lib/coach/protocolGate.ts decides and words them; the
// server sends them (lib/coach/todayServer.ts on Today, GET /api/coach/programs/:id/gates in the builder). These only
// render what they are handed — no rule lives here.
//   · <GateSwapLine>  on Today's card of a swapped item: "Easier step in place of Depth Drop to Vertical. <why>", and a
//     link when the why has somewhere to go (the health answers, the Quick Screen);
//   · <GateHeldList>  on Today, the items held back today (no ungated easier step on their ladder), one line each;
//   · <CoachGateLine> in the program builder under a gated item: what this client's Today does with it, and why.
import Link from 'next/link';
import { ShieldCheck, ShieldHalf } from 'lucide-react';
import type { TodayGateNote, TodayHeldItem } from '@/lib/coach/today';
import type { CoachGateView } from '@/lib/coach/protocolGate';

const LINK_WORDS: Record<string, string> = { '/play/mirror/assess': 'Take the jump test', '/play/mirror': 'Open your health answers' };
const linkWords = (href: string) => LINK_WORDS[href] ?? 'Open';

export function GateSwapLine({ note }: { note: TodayGateNote }) {
  return (
    <div className="flex items-start gap-1.5 rounded-md border border-[#FFD700]/20 bg-[#FFD700]/[0.05] px-2 py-1.5 text-xs text-white/75" data-protocol-gate={note.reason}>
      <ShieldHalf className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FFD700]/80" aria-hidden="true" />
      <span>
        <span data-gate-line>{note.line}</span>
        {note.href && <> <Link href={note.href} className="text-[#00E5FF] underline-offset-2 hover:underline" data-gate-href>{linkWords(note.href)}</Link></>}
      </span>
    </div>
  );
}

export function GateHeldList({ items }: { items: readonly TodayHeldItem[] }) {
  if (!items.length) return null;
  return (
    <div className="fel-card rounded-xl p-3 space-y-1.5" data-testid="protocol-held">
      {items.map((h) => (
        <div key={h.id} className="flex items-start gap-1.5 text-xs text-white/70" data-held={h.id} data-protocol-gate={h.reason}>
          <ShieldHalf className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FFD700]/80" aria-hidden="true" />
          <span>
            <span data-gate-line>{h.line}</span>
            {h.href && <> <Link href={h.href} className="text-[#00E5FF] underline-offset-2 hover:underline" data-gate-href>{linkWords(h.href)}</Link></>}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CoachGateLine({ gate }: { gate: CoachGateView }) {
  const open = gate.state === 'open' || gate.state === 'open_youth';
  const Icon = open ? ShieldCheck : ShieldHalf;
  return (
    <div className={`flex items-start gap-1.5 border-t border-white/6 px-2 py-1.5 text-[11px] ${open ? 'text-white/50' : 'text-[#FFD700]/85'}`} data-coach-gate={gate.state}>
      <Icon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /> <span>{gate.line}</span>
    </div>
  );
}
