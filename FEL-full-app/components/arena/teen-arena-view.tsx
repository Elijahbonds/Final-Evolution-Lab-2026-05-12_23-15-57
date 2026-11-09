'use client';

/**
 * components/arena/teen-arena-view.tsx — ARENA-AGE-1 practice Arena for teen and unknown-age accounts.
 * Rendered only when app/arena/page.tsx decided the band on the server. House rivals only (no open lobby, no join), no
 * entry picker, no pot or house-cut lines. All user text comes from lib/arena-teen-copy.ts (DRAFT, Elijah to review).
 * Older entry duels an account already had stay playable or cancellable here (PM decision 3).
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Play, Bot, Trophy, X } from 'lucide-react';
import { WALLET_REFRESH_EVENT } from '@/components/wallet-chip';
import { TEEN_ARENA_COPY as C } from '@/lib/arena-teen-copy';

interface Mode { key: string; name: string; venue: string; href: string }
interface Row {
  id: string; mode: string; name: string; href: string; feeLc: number; rakePercent: number; status: string;
  myScore: number | null; mySubmitted: boolean; iWon: boolean | null; pastExpiry?: boolean; unlistedMode?: boolean;
}

/** A practice duel row is entry 0 with no house cut; anything else is an older entry duel. Pure, tested. */
export function isPracticeRow(r: Pick<Row, 'feeLc' | 'rakePercent'>): boolean {
  return r.feeLc === 0 && r.rakePercent === 0;
}

/** The row's label. Pure, tested. */
export function practiceRowLabel(r: Pick<Row, 'status' | 'iWon' | 'mySubmitted' | 'pastExpiry'>): string {
  if (r.status === 'ACTIVE' && !r.mySubmitted && !r.pastExpiry) return C.rowLive;
  if (r.status === 'SETTLED') return r.iWon ? C.rowWon : C.rowLost;
  if (r.status === 'VOIDED' && r.mySubmitted) return C.rowTie;
  return C.rowClosed;
}

export function TeenArenaView({ prize, dailyCap, birthYearHref }: { prize: number; dailyCap: number; birthYearHref: string | null }) {
  const [modes, setModes] = useState<Mode[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [balance, setBalance] = useState(0);
  const [pick, setPick] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null);

  const flash = useCallback((kind: 'err' | 'ok', text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      const [c, l] = await Promise.all([fetch('/api/arena/config'), fetch('/api/arena/list')]);
      if (c.ok) {
        const j = await c.json();
        const ms: Mode[] = (j.modes ?? []).filter((m: Mode) => m.key !== 'music');
        setModes(ms);
        setBalance(Number(j.balance) || 0);
        setPick((p) => p || ms[0]?.key || '');
      }
      if (l.ok) {
        const j = await l.json();
        setRows(j.mine ?? []);
        if (Number(j.reclaimed) > 0) window.dispatchEvent(new Event(WALLET_REFRESH_EVENT));
      }
    } catch { /* best effort */ }
  }, []);

  useEffect(() => { (async () => { setLoading(true); await load(); setLoading(false); })(); }, [load]);

  async function play() {
    if (!pick) return;
    setBusy('play');
    try {
      const r = await fetch('/api/arena/teen-match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: pick }),
      });
      const j = await r.json();
      if (!r.ok) { flash('err', j?.detail || C.startFailed); setBusy(null); return; }
      flash('ok', C.ready(j.rival?.name ?? 'Your rival'));
      window.location.href = `${j.href}?arena=${j.matchId}`;
    } catch { flash('err', C.networkError); setBusy(null); }
  }

  async function cancelOlder(id: string) {
    setBusy(id);
    try {
      const r = await fetch('/api/arena/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchId: id }) });
      const j = await r.json();
      if (!r.ok) flash('err', j?.detail || C.networkError);
      else { flash('ok', C.olderCancelled); window.dispatchEvent(new Event(WALLET_REFRESH_EVENT)); await load(); }
    } catch { flash('err', C.networkError); } finally { setBusy(null); }
  }

  if (loading) {
    return <div className="mt-10 flex items-center justify-center gap-2 font-mono text-sm text-white/60"><Loader2 className="h-4 w-4 animate-spin" />{C.starting}</div>;
  }

  const practice = rows.filter(isPracticeRow);
  const older = rows.filter((r) => !isPracticeRow(r) && (r.status === 'WAITING' || r.status === 'ACTIVE'));

  return (
    <div className="mt-6 space-y-8" data-arena-band="teen">
      {birthYearHref && (
        <div className="rounded-xl border border-[#00E5FF]/30 bg-[#00E5FF]/5 px-5 py-4 text-sm text-white/80" data-arena-birth-year>
          {C.birthYearBanner}{' '}
          <a className="font-bold text-[#00E5FF] underline" href={birthYearHref}>{C.birthYearLink}</a>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 px-5 py-4">
        <div className="text-sm text-white/80">{C.prizeLine(prize, dailyCap)}</div>
        <div className="font-mono text-sm text-[#FFD700]">{C.balance(balance)}</div>
      </div>

      {notice && (
        <div className={`rounded-lg border px-4 py-2.5 text-sm ${notice.kind === 'err' ? 'border-[#FF3366]/40 text-[#FF3366]' : 'border-[#00FF9D]/40 text-[#00FF9D]'}`}>{notice.text}</div>
      )}

      <section className="fel-card rounded-xl border border-white/10 bg-[#0B0B0F] p-5">
        <div className="text-sm font-bold uppercase tracking-wider text-white/70">{C.chooseGame}</div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {modes.map((m) => (
            <button key={m.key} onClick={() => setPick(m.key)}
              className={`min-h-[44px] rounded-lg border px-3 py-2 text-left text-sm ${pick === m.key ? 'border-[#00E5FF] bg-[#00E5FF]/10 text-white' : 'border-white/10 text-white/70'}`}>
              <div className="font-bold">{m.name}</div>
              <div className="truncate text-xs text-white/60">{m.venue}</div>
            </button>
          ))}
        </div>
        <button onClick={play} disabled={!pick || busy !== null}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#00FF9D] px-5 py-2.5 font-mono text-sm font-bold text-black disabled:opacity-40">
          {busy === 'play' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
          {C.play}
        </button>
        <p className="mt-2 max-w-xl text-sm text-white/60">{C.rivalNote}</p>
      </section>

      <section>
        <div className="flex items-center gap-2"><Trophy className="h-5 w-5 text-[#00E5FF]" /><h2 className="fel-heading text-xl font-bold text-white">{C.myDuels}</h2></div>
        {practice.length === 0 ? (
          <p className="mt-3 text-sm text-white/60">{C.none}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {practice.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3 text-sm text-white/80">
                <span>{r.name} &middot; {practiceRowLabel(r)}</span>
                {r.status === 'ACTIVE' && !r.mySubmitted && !r.pastExpiry && !r.unlistedMode && (
                  <a href={`${r.href}?arena=${r.id}`} className="inline-flex items-center gap-1 font-mono font-bold text-[#00FF9D]"><Play className="h-4 w-4" />{C.playRound}</a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {older.length > 0 && (
        <section>
          <h2 className="fel-heading text-lg font-bold text-white">{C.olderTitle}</h2>
          <ul className="mt-3 space-y-2">
            {older.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-4 py-3 text-sm text-white/80">
                <span>{r.name} &middot; {C.olderEntry(r.feeLc)}</span>
                {r.status === 'WAITING' ? (
                  <button onClick={() => cancelOlder(r.id)} disabled={busy !== null} className="inline-flex items-center gap-1 font-mono font-bold text-[#FFD700]"><X className="h-4 w-4" />{C.olderCancel}</button>
                ) : !r.mySubmitted && !r.pastExpiry && !r.unlistedMode ? (
                  <a href={`${r.href}?arena=${r.id}`} className="inline-flex items-center gap-1 font-mono font-bold text-[#00FF9D]"><Play className="h-4 w-4" />{C.olderPlay}</a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
