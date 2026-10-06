'use client';
// The phone in a party room (MULTIPLAYER lane, 2026-10-06): the player's own card, the game the TV picked, READY, and —
// for the first phone in — the game pick and START. Drawn from the PartyView the TV sends this phone only
// (lib/party/protocol.ts), so it holds nobody's id. Between games this replaces the controls; during a game it is one
// line above them.

import type { ControllerClient } from '@/lib/controller-link/client';
import type { PartyView } from '@/lib/party/protocol';

export function PhonePartyPanel({ party, client, onLeave }: { party: PartyView; client: ControllerClient | null; onLeave: () => void }) {
  const me = party.seats.find((s) => s.you) ?? null;
  const tone = me?.color ?? '#6b7280';
  const send = (cmd: Parameters<ControllerClient['command']>[0]) => client?.command(cmd);

  if (party.phase === 'playing') {
    return (
      <div data-testid="phone-party-strip" className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 font-mono text-[11px]" style={{ borderColor: `${tone}66` }}>
        <span className="font-black" style={{ color: tone }}>{party.seat ?? 'NEXT'}{me ? ` · ${me.name}` : ''}</span>
        <span className="truncate text-white/60">
          {!party.seat ? 'You’re in from the next game' : party.mode.style === 'turns' ? (party.yourGo ? 'YOUR GO!' : party.note || 'Watch the TV') : party.mode.title}
        </span>
      </div>
    );
  }

  return (
    <div data-testid="phone-party-panel" className="flex flex-col gap-4">
      <div className="rounded-2xl border p-4 text-center" style={{ borderColor: `${tone}88`, background: `${tone}14` }}>
        <p className="font-mono text-[10px] tracking-[0.3em] text-white/40">{party.seat ? 'YOU ARE' : 'WAITING FOR A SEAT'}</p>
        <p data-testid="phone-party-seat" className="fel-heading text-4xl font-black" style={{ color: tone }}>{party.seat ?? 'NEXT UP'}</p>
        {me && <p className="font-mono text-sm text-white/80">{me.name}</p>}
      </div>

      <div className="text-center">
        <p className="font-mono text-[10px] tracking-[0.3em] text-white/40">{party.phase === 'results' ? 'JUST PLAYED' : 'UP NEXT'}</p>
        <div className="mt-1 flex items-center justify-center gap-3">
          {party.captain && party.phase === 'lobby' && (
            <button type="button" data-testid="phone-party-prev" onClick={() => send('prev')} className="rounded-lg bg-white/10 px-4 py-2 text-xl">◀</button>
          )}
          <div>
            <p data-testid="phone-party-mode" className="fel-heading text-2xl font-black">{party.mode.title}</p>
            <p className="font-mono text-[10px] text-white/50">{party.mode.players} · {party.mode.style === 'turns' ? 'TAKE TURNS' : 'SAME TIME'}</p>
          </div>
          {party.captain && party.phase === 'lobby' && (
            <button type="button" data-testid="phone-party-next" onClick={() => send('next')} className="rounded-lg bg-white/10 px-4 py-2 text-xl">▶</button>
          )}
        </div>
      </div>

      {party.note && <p data-testid="phone-party-note" className="text-center text-sm text-white/70">{party.note}</p>}

      {party.phase === 'lobby' && (
        <>
          <button type="button" data-testid="phone-party-ready" onClick={() => send(me?.ready ? 'unready' : 'ready')}
            className="rounded-xl py-5 text-xl font-black tracking-widest"
            style={me?.ready ? { background: '#4ade80', color: '#052e16' } : { background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>
            {me?.ready ? '✓ READY' : 'TAP WHEN READY'}
          </button>
          {party.captain && (
            <button type="button" data-testid="phone-party-start" disabled={!party.canStart} onClick={() => send('start')}
              className="rounded-xl bg-[#00E5FF] py-4 text-lg font-black tracking-widest text-[#04202a] disabled:opacity-35">
              START ▶
            </button>
          )}
        </>
      )}

      {party.phase === 'results' && (party.captain ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" data-testid="phone-party-rematch" onClick={() => send('rematch')} className="rounded-xl bg-[#00E5FF] py-4 font-black tracking-widest text-[#04202a]">REMATCH</button>
          <button type="button" onClick={() => send('lobby')} className="rounded-xl border border-white/20 py-4 font-bold text-white/80">CHANGE GAME</button>
        </div>
      ) : <p className="text-center text-xs text-white/45">The first player picks what’s next.</p>)}

      <ul className="flex flex-wrap justify-center gap-1.5">
        {party.seats.map((s) => (
          <li key={s.label} className="rounded-full border px-2.5 py-0.5 font-mono text-[10px]" style={{ borderColor: `${s.color}88`, color: s.color, fontWeight: s.you ? 900 : 400 }}>
            {s.label} {s.name}{s.ready ? ' ✓' : ''}
          </li>
        ))}
        {party.waiting > 0 && <li className="font-mono text-[10px] text-white/40">+{party.waiting} waiting</li>}
      </ul>

      <button type="button" data-testid="phone-party-leave" onClick={onLeave} className="mx-auto font-mono text-[10px] tracking-widest text-white/35 underline">LEAVE THE ROOM</button>
    </div>
  );
}
