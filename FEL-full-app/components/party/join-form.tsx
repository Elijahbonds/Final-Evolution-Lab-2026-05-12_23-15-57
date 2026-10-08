'use client';
// The type-a-code join (MULTIPLAYER lane, 2026-10-06). One box, one button. The code is checked as it is typed
// (lib/party/joinCode.ts), then against the live rooms, and a good one goes straight to the controller page — the
// same page the QR opens, with the code in it.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { joinCodeHint, parseJoinCode } from '@/lib/party/joinCode';
import { lookupRoom } from '@/lib/controller-link/transport/signaling';
import { ROOM_CODE_LEN } from '@/lib/controller-link/codes';

export function JoinForm({ initialCode = '' }: { initialCode?: string }) {
  const router = useRouter();
  const [text, setText] = useState(initialCode.toUpperCase());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const parsed = parseJoinCode(text);

  const go = async (raw = text) => {
    const r = parseJoinCode(raw);
    if (!r.ok) { setProblem(joinCodeHint(r)); return; }
    setBusy(true); setProblem(null);
    try {
      const room = await lookupRoom(r.code);
      if (!room) { setProblem('No game with that code right now — is the party screen still open on the TV?'); return; }
      router.push(`/controller/${r.code}`);
    } catch {
      setProblem("Can't reach the game server — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  // a pasted invite (?code=…) goes straight in
  const [live, setLive] = useState(false);
  useEffect(() => { setLive(true); if (initialCode && parseJoinCode(initialCode).ok) void go(initialCode); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main data-live={live ? '1' : '0'} className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-[#07090d] px-6 text-white">
      <div className="text-center">
        <p className="font-mono text-xs tracking-[0.3em] text-white/40">JOIN A GAME</p>
        <h1 className="fel-heading mt-2 text-3xl font-black">Type the code on the TV</h1>
        <p className="mt-1 text-sm text-white/50">Your phone becomes the controller. No app, no account.</p>
      </div>
      <form className="flex w-full max-w-xs flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void go(); }}>
        <input
          data-testid="join-code"
          value={text}
          onChange={(e) => { setText(e.target.value.toUpperCase().slice(0, 64)); setProblem(null); }}
          placeholder={'·'.repeat(ROOM_CODE_LEN)}
          aria-label="Room code"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          className="w-full rounded-xl bg-white/10 px-4 py-4 text-center font-mono text-3xl font-black tracking-[0.3em] text-[#00E5FF] outline-none placeholder:text-white/20 focus:ring-2 focus:ring-[#00E5FF]/60"
        />
        <button type="submit" data-testid="join-go" disabled={busy || !parsed.ok}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#00E5FF] px-6 py-4 font-bold text-black disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} JOIN
        </button>
        <p data-testid="join-problem" className="min-h-[2.5em] text-center text-xs text-[#ffd75e]">
          {problem ?? (text && !parsed.ok && parsed.problem !== 'too-short' ? joinCodeHint(parsed) : '')}
        </p>
      </form>
      <p className="max-w-xs text-center text-[11px] text-white/35">Hosting? Open <span className="text-white/60">Play → Party</span> on the screen everyone can see.</p>
    </main>
  );
}
