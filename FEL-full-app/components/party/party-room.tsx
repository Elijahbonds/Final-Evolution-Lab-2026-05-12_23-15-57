'use client';
// THE PARTY ROOM — the TV screen for playing with friends (MULTIPLAYER lane, 2026-10-06).
//
// Owner, 2026-10-06: "Let's make joining and playing multiplayer way easier and encouraged" — a console game on a TV,
// often a phone held sideways and mirrored to it. So this is a console lobby, built to read from the sofa:
//
//   LOBBY    the join QR and the code, big; four player cards that fill as phones scan in and controllers press a
//            button; the game shelf (◀ ▶, or the first phone picks); START.
//   PLAYING  the game, full screen, with the code in a corner while a seat is open — a friend can still scan in, and
//            plays from the next game.
//   RESULTS  who won, REMATCH (same game, same room) or CHANGE GAME.
//
// The room (usePartyRoom) lives for the whole session, so nobody scans twice. It fits 844×390, the size of the
// sideways phone the owner mirrors to a TV.

import { useEffect, useMemo, useState } from 'react';
import dynamicImport from 'next/dynamic';
import Link from 'next/link';
import QRCode from 'qrcode';
import { ArrowLeft, Check, Gamepad2, Loader2, Share2, Smartphone, Trophy, X } from 'lucide-react';
import type { ComponentType } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { joinUrl } from '@/lib/controller-link/codes';
import { PARTY_MODES, playersBadge, styleLine } from '@/lib/party/catalog';
import { JOIN_PATH } from '@/lib/party/joinCode';
import { openSeatHint, PARTY_CAPACITY, SEAT_COLORS, type Seat } from '@/lib/party/seats';
import { turnStandings } from '@/lib/party/turns';
import { prqGrade } from '@/lib/prq';
import { usePartyRoom } from './use-party-room';

const loading = () => (
  <div className="grid h-full w-full place-items-center bg-black"><Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" /></div>
);

// The games, as their own pages mount them (each makes its own InputBus; the room reaches it through liveInputBuses).
const GAMES: Record<string, ComponentType<GameProps>> = {
  brainbrawl: dynamicImport(() => import('@/components/games/brainbrawl-babylon'), { ssr: false, loading }),
  who_scene_it: dynamicImport(() => import('@/components/games/who-scene-it-babylon'), { ssr: false, loading }),
  threepoint: dynamicImport(() => import('@/components/games/three-point-babylon'), { ssr: false, loading }),
  dunk: dynamicImport(() => import('@/components/games/dunk-babylon'), { ssr: false, loading }),
};

const GRADE = prqGrade(0);

/** Phones cannot open the host's own loopback address — the QR would point them at themselves. */
function loopbackHost(): boolean {
  return typeof window !== 'undefined' && /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(window.location.hostname);
}

export default function PartyRoomScreen({ initialMode }: { initialMode: string | null }) {
  const room = usePartyRoom(initialMode);
  const { mode, phase, code } = room;
  const [qr, setQr] = useState<string | null>(null);
  const [shared, setShared] = useState<'idle' | 'copied'>('idle');
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);

  const invite = useMemo(() => (code ? `${joinUrl(code)}?game=${encodeURIComponent(mode.id)}` : ''), [code, mode.id]);
  useEffect(() => {
    if (!code) { setQr(null); return; }
    // the QR opens the join page with the code already in it: scan, tap JOIN, play
    QRCode.toDataURL(joinUrl(code), { margin: 1, width: 360 }).then(setQr).catch(() => setQr(null));
  }, [code]);

  const share = async () => {
    if (!invite) return;
    try {
      if (navigator.share) { await navigator.share({ title: `Play ${mode.title} with me`, text: `Join my game — code ${code}`, url: invite }); return; }
    } catch { /* cancelled: fall through to copy */ }
    try { await navigator.clipboard.writeText(invite); setShared('copied'); setTimeout(() => setShared('idle'), 2500); } catch { /* no clipboard: the code is on screen */ }
  };

  const Game = GAMES[mode.id];
  const showGame = phase !== 'lobby' && !(phase === 'playing' && room.between) && !(phase === 'results' && mode.style === 'turns');
  const openSeats = room.table.seats.length < PARTY_CAPACITY;

  return (
    <main data-testid="party-room" data-phase={phase} className="fixed inset-0 overflow-hidden bg-[#05070c] text-white">
      {showGame && Game && (
        <div className="absolute inset-0">
          <Game key={room.gameKey} grade={GRADE} prq={0} onEnd={room.onGameEnd} />
        </div>
      )}

      {phase === 'lobby' && (
        <Lobby room={room} qr={qr} origin={origin} share={share} shared={shared} />
      )}

      {phase === 'playing' && room.between && (
        <div data-testid="party-up-next" className="absolute inset-0 z-50 grid place-items-center bg-[#05070c]">
          <div className="text-center">
            <p className="font-mono text-xs tracking-[0.4em] text-white/40">{mode.title.toUpperCase()} · UP NEXT</p>
            <p className="fel-heading mt-3 text-[min(12vh,72px)] font-black leading-none" style={{ color: room.turns ? (room.turns.players[room.turns.at]?.color ?? '#fff') : '#fff' }}>
              {room.banner.replace(/^UP NEXT · /, '')}
            </p>
            <p className="mt-4 font-mono text-sm text-white/50">Get the controller — your go starts in a moment</p>
          </div>
        </div>
      )}

      {phase === 'playing' && !room.between && (
        <>
          <button
            type="button"
            data-testid="party-end-game"
            onClick={room.backToLobby}
            className="absolute left-3 top-3 z-[60] rounded-full border border-white/15 bg-black/60 px-3 py-1 font-mono text-[10px] font-bold tracking-widest text-white/70 hover:text-white"
          >
            ◀ LOBBY
          </button>
          {room.turns && room.banner && (
            <div className="pointer-events-none absolute left-1/2 top-12 z-[55] -translate-x-1/2 rounded-lg border border-white/10 bg-black/70 px-4 py-1.5">
              <span className="fel-heading text-sm font-bold tracking-[0.15em] text-[#00E5FF]">{room.banner}</span>
            </div>
          )}
          {openSeats && code && (
            <div data-testid="party-dropin" className="pointer-events-none absolute bottom-3 right-3 z-[55] flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 p-1.5 pr-3">
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="" className="h-12 w-12 rounded bg-white p-0.5" />
              )}
              <span className="font-mono text-[10px] leading-tight text-white/70">
                JOIN · <span className="text-sm font-bold tracking-[0.2em] text-[#00E5FF]">{code}</span><br />
                scan, or press A on a pad
              </span>
            </div>
          )}
        </>
      )}

      {phase === 'results' && <Results room={room} share={share} shared={shared} />}

      {room.toast && (
        <div data-testid="party-toast" className="pointer-events-none absolute left-1/2 top-3 z-[70] -translate-x-1/2 rounded-full border border-[#00E5FF]/40 bg-black/80 px-5 py-2 font-mono text-sm font-bold text-[#00E5FF]">
          {room.toast}
        </div>
      )}
    </main>
  );
}

type Room = ReturnType<typeof usePartyRoom>;

function Lobby({ room, qr, origin, share, shared }: { room: Room; qr: string | null; origin: string; share: () => void; shared: 'idle' | 'copied' }) {
  const { mode, code, table } = room;
  const host = origin.replace(/^https?:\/\//, '');
  return (
    <div className="absolute inset-0 flex flex-col gap-[2vh] p-[2.5vh] sm:p-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/play" aria-label="Back to Play" className="rounded-full border border-white/10 p-1.5 text-white/60 hover:text-white"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <p className="font-mono text-[10px] tracking-[0.35em] text-white/40">PARTY ROOM</p>
            <h1 className="fel-heading text-[min(5vh,28px)] font-black leading-none">PLAY WITH FRIENDS</h1>
          </div>
        </div>
        <p className="hidden font-mono text-[11px] text-white/40 sm:block">Phones are controllers · pads work too · no app, no account</p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[auto_1fr] gap-[2.5vh]">
        {/* JOIN — the one thing a friend needs */}
        <section data-testid="party-join" className="flex min-h-0 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] p-[2vh]">
          {room.error ? (
            <div className="max-w-[220px] text-center text-xs text-[#ffd75e]">
              Phone link offline — {room.error}.
              <button type="button" onClick={room.retry} className="mt-2 block w-full rounded border border-[#ffd75e]/60 px-2 py-1 font-bold">RETRY</button>
              <p className="mt-2 text-white/50">Controllers plugged into this screen still work.</p>
            </div>
          ) : (
            <>
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img data-testid="party-qr" src={qr} alt={`Scan to join — code ${code}`} className="aspect-square h-[min(34vh,210px)] rounded-lg bg-white p-1.5" />
              ) : (
                <div className="grid aspect-square h-[min(34vh,210px)] place-items-center rounded-lg border border-white/10 text-[11px] text-white/40">Opening the room…</div>
              )}
              <p className="mt-[1.2vh] font-mono text-[10px] tracking-[0.3em] text-white/40">SCAN WITH A PHONE CAMERA</p>
              <p data-testid="party-code" className="font-mono text-[min(7vh,40px)] font-black leading-tight tracking-[0.18em] text-[#00E5FF]">{code || '······'}</p>
              <p className="text-center font-mono text-[10px] text-white/50">or open <span className="text-white/80">{host}{JOIN_PATH}</span></p>
              <button type="button" data-testid="party-share" onClick={share} disabled={!code}
                className="mt-[1.2vh] flex items-center gap-1.5 rounded-full border border-[#A855F7]/50 bg-[#A855F7]/10 px-3 py-1 text-[11px] font-bold text-[#c4a1ff] disabled:opacity-40">
                {shared === 'copied' ? <><Check className="h-3.5 w-3.5" /> INVITE COPIED</> : <><Share2 className="h-3.5 w-3.5" /> SEND INVITE</>}
              </button>
              {loopbackHost() && (
                <p className="mt-1.5 max-w-[220px] text-center text-[9px] leading-snug text-[#ffd75e]">Phones can’t open localhost — open this page by the computer’s network address to scan.</p>
              )}
            </>
          )}
        </section>

        <div className="flex min-h-0 flex-col gap-[2vh]">
          {/* PLAYERS */}
          <section data-testid="party-seats" className="grid grid-cols-4 gap-[1.2vh]">
            {Array.from({ length: PARTY_CAPACITY }, (_, i) => {
              const s = table.seats[i];
              return s ? <SeatCard key={s.key} seat={s} inGame={i < mode.maxPlayers} onRemove={() => room.removeSeat(s)} /> : <EmptySeat key={`empty-${i}`} index={i} hasPads={room.pads.length > 0} />;
            })}
          </section>
          {table.waiting.length > 0 && (
            <p className="-mt-[1vh] font-mono text-[10px] text-white/45">+{table.waiting.length} waiting for a seat: {table.waiting.map((w) => w.name).join(', ')}</p>
          )}

          {/* GAMES */}
          <section data-testid="party-games" className="min-h-0 flex-1">
            <div className="mb-1 flex items-center justify-between font-mono text-[10px] tracking-[0.25em] text-white/40">
              <span>PICK A GAME · ◀ ▶</span>
              <span className="hidden sm:inline">the first phone in can pick too</span>
            </div>
            <div className="grid h-[calc(100%-1.25rem)] grid-cols-4 gap-[1.2vh]">
              {PARTY_MODES.map((m, i) => {
                const on = i === room.modeIndex;
                return (
                  <button key={m.id} type="button" data-testid={`party-game-${m.id}`} aria-pressed={on} onClick={() => room.pickMode(i)}
                    className="flex min-h-0 flex-col justify-between overflow-hidden rounded-xl border p-[1.4vh] text-left transition-all"
                    style={{ borderColor: on ? m.color : 'rgba(255,255,255,0.08)', background: on ? `${m.color}1f` : 'rgba(255,255,255,0.02)', boxShadow: on ? `0 0 30px -12px ${m.color}` : 'none' }}>
                    <span className="block">
                      <span className="fel-heading block text-[min(3.6vh,18px)] font-bold leading-tight" style={{ color: on ? '#fff' : 'rgba(255,255,255,0.75)' }}>{m.title}</span>
                      <span className="mt-1 hidden text-[11px] leading-snug text-white/50 md:block">{m.blurb}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1 font-mono text-[9px] font-bold">
                      <span className="rounded px-1.5 py-0.5" style={{ background: `${m.color}33`, color: m.color }}>{playersBadge(m)}</span>
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-white/60">{styleLine(m)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <footer className="flex items-center justify-between gap-3">
        <p data-testid="party-banner" className="min-w-0 truncate font-mono text-[min(2.6vh,13px)] text-white/60">{room.banner}</p>
        <button type="button" data-testid="party-start" onClick={room.start} disabled={table.seats.length < mode.minPlayers}
          className="shrink-0 rounded-xl px-[3vh] py-[1.4vh] font-mono text-[min(3vh,15px)] font-black tracking-[0.15em] text-[#04202a] disabled:opacity-35"
          style={{ background: room.canStart ? '#00E5FF' : '#7dd3e0' }}>
          START {mode.title.toUpperCase()} ▶
        </button>
      </footer>
    </div>
  );
}

function SeatCard({ seat, inGame, onRemove }: { seat: Seat; inGame: boolean; onRemove: () => void }) {
  const Icon = seat.kind === 'pad' ? Gamepad2 : Smartphone;
  return (
    <div data-testid={`party-seat-${seat.label}`} data-ready={seat.ready ? '1' : '0'}
      className="relative overflow-hidden rounded-xl border bg-white/[0.04] p-[1.3vh]"
      style={{ borderColor: `${seat.color}88`, opacity: inGame ? 1 : 0.55 }}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: seat.color }} />
      <div className="flex items-center justify-between">
        <span className="font-mono text-[min(3.2vh,16px)] font-black" style={{ color: seat.color }}>{seat.label}</span>
        <Icon className="h-4 w-4 text-white/45" />
      </div>
      <p className="fel-heading mt-0.5 truncate text-[min(3.4vh,17px)] font-bold">{seat.name}</p>
      <p className={`font-mono text-[10px] font-bold ${!seat.connected ? 'text-[#ff6b3d]' : seat.ready ? 'text-[#4ade80]' : 'text-white/40'}`}>
        {!seat.connected ? 'RECONNECTING…' : seat.ready ? '✓ READY' : 'NOT READY'}{!inGame ? ' · NEXT GAME' : ''}
      </p>
      {seat.kind === 'phone' && !seat.connected && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${seat.name}`} className="absolute bottom-1 right-1 rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"><X className="h-3.5 w-3.5" /></button>
      )}
    </div>
  );
}

function EmptySeat({ index, hasPads }: { index: number; hasPads: boolean }) {
  return (
    <div data-testid={`party-seat-empty-${index + 1}`} className="rounded-xl border border-dashed border-white/15 p-[1.3vh]">
      <span className="font-mono text-[min(3.2vh,16px)] font-black" style={{ color: `${SEAT_COLORS[index]}66` }}>P{index + 1}</span>
      <p className="mt-0.5 text-[min(2.4vh,11px)] leading-snug text-white/40">{openSeatHint(hasPads)}</p>
    </div>
  );
}

function Results({ room, share, shared }: { room: Room; share: () => void; shared: 'idle' | 'copied' }) {
  const { mode, turns, result, inGame } = room;
  const rows = turns ? turnStandings(turns) : inGame.map((p, i) => ({
    ...p, score: i === 0 ? Number(result?.score ?? 0) : i === 1 ? Number(result?.opponentScore ?? 0) : null, place: 0,
  }));
  const best = Math.max(...rows.map((r) => r.score ?? -1));
  return (
    <div data-testid="party-results" className="absolute inset-0 z-[65] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0d14]/95 p-[3vh] text-center">
        <Trophy className="mx-auto h-[min(6vh,36px)] w-[min(6vh,36px)] text-[#FFD700]" />
        <p className="mt-1 font-mono text-[10px] tracking-[0.35em] text-white/40">{mode.title.toUpperCase()}</p>
        <h2 data-testid="party-winner" className="fel-heading text-[min(6vh,32px)] font-black leading-tight">{room.banner}</h2>
        <ul className="mt-[1.5vh] space-y-1">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between rounded-lg px-3 py-[0.8vh]" style={{ background: r.score === best && best >= 0 ? `${r.color}22` : 'rgba(255,255,255,0.03)' }}>
              <span className="font-mono text-sm font-bold" style={{ color: r.color }}>{r.label} <span className="text-white">{r.name}</span></span>
              <span className="font-mono text-lg font-black">{r.score ?? '—'}</span>
            </li>
          ))}
        </ul>
        <div className="mt-[2vh] grid grid-cols-2 gap-2">
          <button type="button" data-testid="party-rematch" onClick={room.rematch} className="rounded-xl bg-[#00E5FF] py-[1.4vh] font-mono text-sm font-black tracking-widest text-[#04202a]">REMATCH ▶</button>
          <button type="button" data-testid="party-change" onClick={room.backToLobby} className="rounded-xl border border-white/20 py-[1.4vh] font-mono text-sm font-bold tracking-widest text-white/80">CHANGE GAME</button>
        </div>
        <button type="button" onClick={share} className="mt-2 w-full rounded-xl border border-[#A855F7]/40 py-[1vh] font-mono text-[11px] font-bold text-[#c4a1ff]">
          {shared === 'copied' ? 'INVITE COPIED' : 'INVITE ONE MORE FRIEND'}
        </button>
        <p className="mt-1.5 font-mono text-[10px] text-white/35">A / Enter rematch · B / Backspace change game · party games are free play</p>
      </div>
    </div>
  );
}
