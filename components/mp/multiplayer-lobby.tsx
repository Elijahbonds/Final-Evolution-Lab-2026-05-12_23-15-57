'use client';

/**
 * components/mp/multiplayer-lobby.tsx — async multiplayer hub.
 *
 * Three flows, all ASYNC (not realtime):
 *   • Challenge a friend online — post your best score for a mode, share a code.
 *   • Accept a code — your best score is matched against theirs and settled.
 *   • Local pass-and-play — two players on one device, scores entered by hand.
 *
 * Scores for online challenges are pulled server-side from your own recorded
 * sessions, so you must have played a mode before you can challenge with it.
 */

import { useEffect, useState } from 'react';
import { Swords, Copy, Check, Loader2, Users, Radio, Trophy, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { MP_MODES, mpModeLabel } from '@/lib/mp/match-core';
import { syncWalletBalances } from '@/lib/wallet/client';

interface MatchRow {
  id: string; code: string; mode: string; kind: string; status: string;
  hostName: string; hostScore: number | null;
  guestName: string | null; guestScore: number | null;
  role: string; youWon: boolean; winnerId: string | null;
}

type Tab = 'online' | 'join' | 'local';

export function MultiplayerLobby() {
  const [tab, setTab] = useState<Tab>('online');
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [prefillCode, setPrefillCode] = useState('');

  const loadMatches = () => {
    fetch('/api/v1/mp/list')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.matches) setMatches(d.matches); })
      .catch(() => {});
  };
  useEffect(loadMatches, []);

  // Deep link: /multiplayer?code=ABC123 opens the Accept tab pre-filled.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const c = params.get('code');
      if (c) { setPrefillCode(c.toUpperCase()); setTab('join'); }
    } catch { /* no-op */ }
  }, []);

  return (
    <div className="mx-auto max-w-[820px] px-4 py-8">
      <div className="flex items-center gap-2">
        <Swords className="h-6 w-6 text-[#FF3366]" />
        <h1 className="fel-heading text-3xl font-bold text-white">
          VERSUS <span className="text-[#FF3366]">ARENA</span>
        </h1>
      </div>
      <p className="mt-1 font-mono text-xs text-white/50">
        Async challenges — play on your own time. Winner banks shards, both players earn coins.
      </p>

      <div className="mt-5 flex gap-2">
        <TabBtn active={tab === 'online'} onClick={() => setTab('online')} icon={<Radio className="h-4 w-4" />} label="Challenge online" />
        <TabBtn active={tab === 'join'} onClick={() => setTab('join')} icon={<Share2 className="h-4 w-4" />} label="Accept a code" />
        <TabBtn active={tab === 'local'} onClick={() => setTab('local')} icon={<Users className="h-4 w-4" />} label="Pass & play" />
      </div>

      <div className="mt-5">
        {tab === 'online' && <OnlinePanel onDone={loadMatches} />}
        {tab === 'join' && <JoinPanel onDone={loadMatches} initialCode={prefillCode} />}
        {tab === 'local' && <LocalPanel onDone={loadMatches} />}
      </div>

      <h2 className="mt-10 fel-heading text-xl font-bold text-white">Your matches</h2>
      <div className="mt-3 space-y-2">
        {matches.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/50">
            No matches yet. Create a challenge above to get started.
          </p>
        ) : (
          matches.map((m) => <MatchCard key={m.id} m={m} />)
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
        active ? 'bg-[#FF3366] text-white' : 'border border-white/10 bg-white/[0.03] text-white/60 hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ModeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white"
    >
      {MP_MODES.map((m) => (
        <option key={m.key} value={m.key} className="bg-[#0a0a0a]">{m.label}</option>
      ))}
    </select>
  );
}

function OnlinePanel({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState(MP_MODES[0].key);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [hostScore, setHostScore] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/v1/mp/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(d?.error === 'invalid_mode' ? 'Pick a valid mode' : 'Could not create challenge'); return; }
      setCode(d.code); setHostScore(d.hostScore);
      onDone();
      if (!d.hostScore) toast.message('Heads up: your best score for this mode is 0 — play it first for a real challenge.');
    } finally { setBusy(false); }
  };

  const link = code ? `${typeof window !== 'undefined' ? window.location.origin : ''}/multiplayer?code=${code}` : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); toast.success('Challenge link copied!'); setTimeout(() => setCopied(false), 1600); }
    catch { toast.error('Copy failed — long-press to copy.'); }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <label className="font-mono text-[11px] uppercase tracking-wider text-white/50">Choose a mode</label>
      <div className="mt-2"><ModeSelect value={mode} onChange={setMode} /></div>
      <button
        onClick={create}
        disabled={busy}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#00E5FF] px-5 py-3 font-bold text-black transition-transform hover:scale-[1.03] disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
        Create challenge
      </button>

      {code && (
        <div className="mt-5 rounded-xl border border-[#00E5FF]/25 bg-[#00E5FF]/[0.06] p-4">
          <p className="text-sm text-white/70">
            Your challenge for <span className="font-semibold text-white">{mpModeLabel(mode)}</span> is live — your score to beat:{' '}
            <span className="font-black text-[#00E5FF]">{hostScore ?? 0}</span>.
          </p>
          <div className="mt-3 flex items-stretch gap-2">
            <div className="flex-1 truncate rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white/80">{link}</div>
            <button onClick={copy} className="inline-flex items-center gap-2 rounded-lg bg-[#00E5FF] px-3 py-2 font-semibold text-black">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 font-mono text-[11px] text-white/40">Code: {code}</p>
        </div>
      )}
    </div>
  );
}

function JoinPanel({ onDone, initialCode = '' }: { onDone: () => void; initialCode?: string }) {
  const [code, setCode] = useState(initialCode);
  useEffect(() => { if (initialCode) setCode(initialCode); }, [initialCode]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const join = async () => {
    if (busy || !code.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/v1/mp/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = d?.error === 'not_found' ? 'No challenge with that code'
          : d?.error === 'cannot_join_own' ? "You can't accept your own challenge"
          : d?.error === 'already_taken' ? 'That challenge was already played'
          : 'Could not join challenge';
        toast.error(msg); return;
      }
      setResult(d);
      onDone();
      // A settle may have granted the guest coins/shards — refresh the HUD.
      if (d.balances) syncWalletBalances(d.balances);
      toast[d.youWon ? 'success' : 'message'](d.youWon ? 'You won the challenge! Shards banked.' : d.outcome === 'tie' ? 'Dead heat — it’s a tie!' : 'Challenge settled — better luck next time!');
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <label className="font-mono text-[11px] uppercase tracking-wider text-white/50">Enter a challenge code</label>
      <div className="mt-2 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. K7QP2M"
          maxLength={10}
          className="flex-1 rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono uppercase tracking-widest text-white placeholder:text-white/30"
        />
        <button onClick={join} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#FF3366] px-5 py-3 font-bold text-white transition-transform hover:scale-[1.03] disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}Accept
        </button>
      </div>
      <p className="mt-2 font-mono text-[11px] text-white/40">Your best recorded score for that mode is used automatically.</p>

      {result && (
        <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-center gap-2">
            <Trophy className={`h-5 w-5 ${result.youWon ? 'text-[#FFD700]' : 'text-white/40'}`} />
            <span className="font-bold text-white">{mpModeLabel(result.mode)} — {result.outcome === 'tie' ? 'Tie' : result.youWon ? 'You won' : 'You lost'}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <ScoreBox name={result.hostName} score={result.hostScore} />
            <ScoreBox name={result.guestName} score={result.guestScore} />
          </div>
        </div>
      )}
    </div>
  );
}

function LocalPanel({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState(MP_MODES[0].key);
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [p2name, setP2name] = useState('Player 2');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const submit = async () => {
    if (busy) return;
    const hostScore = Number(p1), guestScore = Number(p2);
    if (!Number.isFinite(hostScore) || !Number.isFinite(guestScore) || hostScore < 0 || guestScore < 0) {
      toast.error('Enter both scores (0 or higher).'); return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/v1/mp/local', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, hostScore, guestScore, guestName: p2name }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error('Could not record match'); return; }
      setResult(d);
      onDone();
      if (d.balances) syncWalletBalances(d.balances);
      toast.success('Local match recorded! Coins banked.');
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <label className="font-mono text-[11px] uppercase tracking-wider text-white/50">Mode</label>
      <div className="mt-2"><ModeSelect value={mode} onChange={setMode} /></div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="font-mono text-[11px] uppercase tracking-wider text-white/50">Your score</label>
          <input value={p1} onChange={(e) => setP1(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="0" className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white" />
        </div>
        <div>
          <label className="font-mono text-[11px] uppercase tracking-wider text-white/50">Opponent score</label>
          <input value={p2} onChange={(e) => setP2(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="0" className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white" />
        </div>
      </div>
      <div className="mt-3">
        <label className="font-mono text-[11px] uppercase tracking-wider text-white/50">Opponent name</label>
        <input value={p2name} onChange={(e) => setP2name(e.target.value)} maxLength={40} className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white" />
      </div>
      <button onClick={submit} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#00FF9D] px-5 py-3 font-bold text-black transition-transform hover:scale-[1.03] disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}Record match
      </button>

      {result && (
        <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-center gap-2">
            <Trophy className={`h-5 w-5 ${result.youWon ? 'text-[#FFD700]' : 'text-white/40'}`} />
            <span className="font-bold text-white">{result.outcome === 'tie' ? 'Tie game' : result.youWon ? 'You won' : `${result.guestName} won`}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <ScoreBox name={result.hostName} score={result.hostScore} />
            <ScoreBox name={result.guestName} score={result.guestScore} />
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreBox({ name, score }: { name: string | null; score: number | null }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-center">
      <div className="truncate text-xs text-white/60">{name ?? '—'}</div>
      <div className="text-2xl font-black text-white">{score ?? 0}</div>
    </div>
  );
}

function MatchCard({ m }: { m: MatchRow }) {
  const settled = m.status === 'settled';
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">{mpModeLabel(m.mode)}</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] uppercase text-white/50">{m.kind}</span>
          {settled && (
            <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${m.youWon ? 'bg-[#FFD700]/15 text-[#FFD700]' : 'bg-white/10 text-white/50'}`}>
              {m.winnerId ? (m.youWon ? 'Won' : 'Lost') : 'Tie'}
            </span>
          )}
          {!settled && <span className="rounded-full bg-[#00E5FF]/15 px-2 py-0.5 font-mono text-[10px] uppercase text-[#00E5FF]">{m.status}</span>}
        </div>
        <div className="mt-1 font-mono text-[11px] text-white/40">
          {m.hostName} {m.hostScore ?? 0} — {m.guestScore ?? 0} {m.guestName ?? 'waiting…'} · code {m.code}
        </div>
      </div>
    </div>
  );
}