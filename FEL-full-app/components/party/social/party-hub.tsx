'use client';
// /party — start a party, or join one by code, link or QR (PARTY-CHAT lane, 2026-10-13). The QR and the invite link
// open /party/<CODE>, which arrives here with the code filled in. The party itself lives in the root layout's dock, so
// once you are in, this page is just a doorway: go and play, the party comes with you.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Users } from 'lucide-react';
import { partyClient } from '@/lib/party/social/client';
import { inParty } from '@/lib/party/social/state';
import { parsePartyCode, PARTY_CODE_LEN, PARTY_MAX } from '@/server/netd/src/partyRules';
import { cleanPlayerName, recallPlayerName, rememberPlayerName, PLAYER_NAME_MAX } from '@/lib/party/playerName';
import { loginPath } from '@/lib/auth/safeNext';
import { useParty } from './use-party';
import { InviteBlock } from './party-bits';

export function LocalPartyFallback({ outdated = false }: { outdated?: boolean }) {
  const href = loginPath('/play/party');
  return (
    <section data-testid="party-local-fallback" className="space-y-3 rounded-xl bg-white/[0.06] p-4 text-sm text-white/70">
      <p role="status" data-testid={outdated ? 'party-outdated' : undefined}>
        {outdated
          ? 'Parties need a server update. Everything else works as usual.'
          : "Online parties aren't switched on here yet. Everything else works as usual."}
      </p>
      <p>
        Want to play with friends now? Sign in as the host and use the local party room for same-screen games with phones as controllers.
      </p>
      <Link href={href} className="inline-flex rounded-xl bg-[#00E5FF] px-4 py-2 font-bold text-black">
        Open local party room
      </Link>
    </section>
  );
}

export function PartyHub({ initialCode = '' }: { initialCode?: string }) {
  const s = useParty();
  const [name, setName] = useState('');
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [live, setLive] = useState(false);
  useEffect(() => { setName(recallPlayerName()); setLive(true); }, []);
  const parsed = parsePartyCode(code);
  const cleanName = cleanPlayerName(name);
  const c = typeof window === 'undefined' ? null : partyClient();
  const busy = s.status === 'connecting';

  const go = (what: 'create' | 'join') => {
    if (!c) return;
    rememberPlayerName(cleanName);
    if (what === 'create') c.create(cleanName);
    else if (parsed) c.join(parsed, cleanName);
  };

  // an invite link: join straight away when this device already has a name (one tap less), never twice
  const [autoTried, setAutoTried] = useState(false);
  useEffect(() => {
    if (!live || autoTried || !c || !initialCode || inParty(s) || s.status === 'outdated' || s.status === 'unavailable') return;
    const n = recallPlayerName();
    const pc = parsePartyCode(initialCode);
    setAutoTried(true);
    if (n && pc && s.code !== pc) c.join(pc, n);
  }, [live]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main data-live={live ? '1' : '0'} className="mx-auto flex min-h-[80dvh] w-full max-w-md flex-col gap-5 px-4 pb-28 pt-8 text-white">
      <div>
        <p className="font-mono text-xs tracking-[0.3em] text-white/40">PARTY</p>
        <h1 className="fel-heading mt-1 text-3xl font-black">Play with friends, together</h1>
        <p className="mt-1 text-sm text-white/55">Up to {PARTY_MAX} people. Chat, quick chat and emotes — and voice for 18+ accounts. Everyone plays their own game, or the host starts one for everybody. Nothing said in a party is recorded or kept.</p>
      </div>

      {s.status === 'unavailable' ? (
        <LocalPartyFallback />
      ) : s.status === 'outdated' ? (
        <LocalPartyFallback outdated />
      ) : inParty(s) ? (
        <section className="space-y-3" aria-label="Your party">
          {s.status === 'waiting' ? (
            <p role="status" data-testid="party-waiting" className="rounded-xl bg-white/[0.06] p-4 text-sm">You&apos;re at the door — the host will let you in.</p>
          ) : s.code ? <InviteBlock code={s.code} /> : <p className="flex items-center gap-2 text-sm text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Joining…</p>}
          <div className="flex gap-2">
            <button type="button" data-testid="party-open" onClick={() => window.dispatchEvent(new Event('fel:party-open'))} className="flex-1 rounded-xl bg-[#00E5FF] py-3 font-bold text-black">Open party</button>
            <Link href="/play" className="flex-1 rounded-xl border border-white/20 py-3 text-center font-bold">Go play</Link>
          </div>
          <p className="text-xs text-white/45">The party stays with you on every page and in every game.</p>
        </section>
      ) : (
        <>
          {s.notice ? <p role="alert" data-testid="party-notice" className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">{s.notice}</p> : null}
          <label className="block">
            <span className="mb-1 block text-xs font-bold tracking-wide text-white/60">YOUR PARTY NAME</span>
            <input
              data-testid="party-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 32))}
              maxLength={32}
              placeholder="NAME"
              autoComplete="off"
              className="w-full rounded-xl bg-white/10 px-4 py-3 font-mono text-lg font-bold uppercase tracking-wider outline-none focus:ring-2 focus:ring-[#00E5FF]/60"
            />
            <span className="mt-1 block text-[11px] text-white/40">Shown to the party as {cleanName || 'PLAYER'} — letters, numbers, up to {PLAYER_NAME_MAX}. Not your real name.</span>
          </label>
          <button type="button" data-testid="party-create" disabled={busy} onClick={() => go('create')}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#00E5FF] py-4 font-bold text-black disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-5 w-5" />} Start a party
          </button>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); go('join'); }}>
            <span className="block text-xs font-bold tracking-wide text-white/60">OR JOIN WITH A CODE</span>
            <div className="flex gap-2">
              <input
                data-testid="party-join-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 64))}
                aria-label="Party code"
                placeholder={'·'.repeat(PARTY_CODE_LEN)}
                autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
                className="min-w-0 flex-1 rounded-xl bg-white/10 px-3 py-3 text-center font-mono text-xl font-black tracking-[0.25em] text-[#00E5FF] outline-none focus:ring-2 focus:ring-[#00E5FF]/60"
              />
              <button type="submit" data-testid="party-join" disabled={busy || !parsed} className="rounded-xl border border-white/25 px-5 font-bold disabled:opacity-40">Join</button>
            </div>
            <p className="text-[11px] text-white/40">Got a link or a QR? Opening it brings you here with the code filled in.</p>
          </form>
        </>
      )}
    </main>
  );
}
