'use client';

// /play/arena — the Physics Arena on the real ModeHarness. Mounts MODES.physics_arena (basketball 1v1 on Havok) and starts it as
// soon as it is ready (no START screen). Each finished game is posted as a server run when signed in (XP and progress, no LC; arena.xpOn). Over the scene: the score, the last call (a make,
// a board, a lost handle), the release timing of your last shot, the POV switch, and the touch deck on a phone.
// With arena.physicsHoops 0 the arena's basketball is the shipped 1v1, so this page sends you there.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { runMode, InputBus, type ModePhase, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { ARENA_MODE_ID } from '@/lib/babylon/modes/PhysicsArenaMode';
import { ARENA_3PT_MODE_ID } from '@/lib/babylon/modes/PhysicsArena3ptMode';
import { ARENA_3V3_MODE_ID } from '@/lib/babylon/modes/PhysicsArena3v3Mode';
import { ARENA_SOCCER_MODE_ID } from '@/lib/babylon/modes/PhysicsArenaSoccerMode';
import { ARENA_SOCCER_3V3_MODE_ID } from '@/lib/babylon/modes/PhysicsArenaSoccer3v3Mode';
import { ARENA_HREF, arenaSoccer3v3On, arenaSoccerOn, physicsHoopsOn, povOn, SHIPPED_ONEVONE_HREF, xpOn } from '@/lib/babylon/arena/arenaConfig';
import { ARENA_SESSION_KEY, finishArenaRun, startArenaRun } from '@/lib/babylon/arena/arenaRun';
import type { FinishDeps } from '@/lib/sessions/finishOutbox';

/** The shell's own finish transport (game-shell.tsx FINISH_DEPS): the outbox in this browser, retries on a timer. */
const FINISH_DEPS: FinishDeps = { fetch: (url, init) => fetch(url, init), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
const finishStore = (): Storage | null => { try { return window.localStorage; } catch { return null; } };
const queryFlag = (k: string): boolean => { try { return new URLSearchParams(window.location.search).get(k) === '1'; } catch { return false; } };

/** The arena's sports so far (docs/PHYSICS-ARENA-PLAN.md §5): `?sport=` picks one. */
const SPORTS = [
  { id: 'hoops', mode: ARENA_MODE_ID, label: '1v1', keys: 'Move WASD · Sprint Shift · Shoot hold L, let go at the top · Jump J · Pass K · Reach I · Cross Q · View C' },
  { id: 'threes', mode: ARENA_3V3_MODE_ID, label: '3v3', keys: 'Move WASD · Sprint Shift · Shoot hold L · Jump J · Pass K (toward the stick) · Call for it / reach I · Cross Q · View C' },
  // look pass (LOOK-PASS-AUDIT finding 12 c): "3-Point" wrapped to two lines on an upright phone; there it reads "3PT"
  { id: 'threepoint', mode: ARENA_3PT_MODE_ID, label: '3-Point', short: '3PT', keys: 'Shoot hold L (or J), let go at the top of the jump · View C' },
  // plan §9 (arena.soccer): soccer 1v1 in the cage
  // (the keys: J is A, the pass; K is B and I is Y, both the tackle: InputBus KEYMAP)
  { id: 'soccer', mode: ARENA_SOCCER_MODE_ID, label: 'Soccer', keys: 'Move WASD · Sprint Shift · Shoot hold L, let go to strike · Pass hold J · Tackle K · Curl: the stick across the aim · View C' },
] as const;
/** plan §9 slice 2 (arena.soccer3v3): the Soccer tab plays 3v3 with keepers. Its games are not posted yet (its XP is a later step). */
const SOCCER_3V3 = { mode: ARENA_SOCCER_3V3_MODE_ID, keys: 'Move WASD · Sprint Shift · Shoot hold L · Pass hold J (toward the stick) · Tackle K · Call for it I · Switch player Q · View C' };
/** The mode a sport mounts, and its key line. */
const played = (x: (typeof SPORTS)[number]): { mode: string; keys: string } => (x.id === 'soccer' && arenaSoccer3v3On() ? SOCCER_3V3 : x);
/** The tabs on show: soccer only with arena.soccer. */
const shownSports = () => SPORTS.filter((x) => x.id !== 'soccer' || arenaSoccerOn());
function sportOf(search: string): (typeof SPORTS)[number] {
  let id = 'hoops';
  try { id = new URLSearchParams(search).get('sport') ?? 'hoops'; } catch { /* hoops */ }
  return shownSports().find((x) => x.id === id) ?? SPORTS[0];
}

export function ArenaStage({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [err, setErr] = useState<string | null>(null);
  const [touch, setTouch] = useState(false);
  const [hud, setHud] = useState<Record<string, HudValue>>({});
  const [pov, setPov] = useState(false);
  const [sport, setSport] = useState<(typeof SPORTS)[number] | null>(null);
  // XP and progress (owner 2026-11-24): what the server paid for the last game, shown for a moment
  const [xpNote, setXpNote] = useState<string | null>(null);
  useEffect(() => { setSport(sportOf(window.location.search)); }, []);

  useEffect(() => { try { setTouch(window.matchMedia('(pointer: coarse)').matches); } catch { setTouch(false); } }, []);
  useEffect(() => { setPov(povOn()); }, []);
  // a probe's run (?agent=1): the arena's seam (window.__ARENA__); lib/agentRunHooks honours it on a loopback host only
  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get('agent') === '1') void import('@/lib/agentRunHooks').then((m) => m.setAgentRunHooksAllowed(true)); } catch { /* not a probe */ }
  }, []);
  // arena.physicsHoops 0: the arena's basketball is the shipped 1v1
  useEffect(() => { if (!physicsHoopsOn()) router.replace(SHIPPED_ONEVONE_HREF); }, [router]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!sport) return;
    const def = MODES[played(sport).mode];
    if (!canvas || !physicsHoopsOn()) return;
    if (!def) { setErr('the arena is not registered'); return; }
    const bus = new InputBus();
    busRef.current = bus;
    let stop: (() => void) | null = null;
    let disposed = false;
    // each game is one server run: started as play begins, finished (and the next one started) when the game ends. Signed out or
    // with arena.xpOn 0, nothing is posted (a practice court).
    const key = ARENA_SESSION_KEY[sport.id];
    const posting = signedIn && xpOn() && played(sport).mode !== ARENA_SOCCER_3V3_MODE_ID;
    const runOpts = { agent: queryFlag('agent'), playtest: queryFlag('playtest') };
    let run: Promise<string | null> | null = null;
    runMode(def, {
      canvas,
      input: bus,
      onPhase: (p, d) => {
        if (disposed) return;
        setPhase(p);
        if (p === 'error') setErr(String(d));
        // a practice court: straight in (next tick: the harness takes a press only once it is in 'ready')
        if (p === 'ready') setTimeout(() => { if (!disposed) { bus.emit({ t: 'button', btn: 'START', pressed: true }); bus.emit({ t: 'button', btn: 'START', pressed: false }); } }, 50);
        if (p === 'ready' && posting && !run) run = startArenaRun(key, runOpts);
      },
      onHud: (u) => { if (!disposed) setHud((h) => ({ ...h, ...u })); },
      guest: !signedIn,
      resultSink: async () => {},   // the arena never ends a session: each game is a card (below), and play goes on
      // a finished game: its run is finished with the game's play log (the server rebuilds the score), the next game's run starts
      cardSink: async (res) => {
        if (!posting || disposed) return;
        const started = run;
        run = startArenaRun(key, runOpts);
        const runId = started ? await started : null;
        if (!runId) return;
        const paid = await finishArenaRun(runId, key, res, FINISH_DEPS, finishStore());
        if (disposed || !paid) return;
        setXpNote(paid.paid ? `+${paid.xp} XP` : paid.reason === 'PLAYTEST' || paid.reason === 'AGENT' ? 'Practice run: no XP' : 'No XP for this game');
        setTimeout(() => { if (!disposed) setXpNote(null); }, 3500);
      },
    }).then((s) => { if (disposed) s(); else stop = s; })
      .catch((e) => { if (!disposed) setErr(String(e?.message ?? e)); });
    return () => { disposed = true; stop?.(); };
  }, [signedIn, sport]);

  const toggleView = () => {
    const bus = busRef.current;
    if (!bus) return;
    bus.emit({ t: 'button', btn: 'SELECT', pressed: true });
    bus.emit({ t: 'button', btn: 'SELECT', pressed: false });
  };
  const inPov = hud.arenaPov === 1;
  const banner = typeof hud.arenaBanner === 'string' ? hud.arenaBanner : '';
  const timing = typeof hud.arenaTiming === 'string' ? hud.arenaTiming : '';

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none outline-none" aria-label="Physics Arena: basketball one on one on real physics" tabIndex={0} />
      {err && <p role="alert" className="absolute inset-x-4 top-[4.25rem] rounded-lg bg-black/80 p-3 text-base">The arena did not load. {err}</p>}
      {phase === 'loading' && !err && <p className="absolute inset-x-0 top-1/2 text-center text-base text-white/80">Building the arena…</p>}
      {phase === 'playing' && (
        <>
          <div data-testid="arena-score" className="absolute right-3 top-3 z-10 rounded-full bg-black/60 px-4 py-2 text-base font-bold tabular-nums">
            {sport?.id === 'threepoint'
              ? <><span className="sr-only">Points, then seconds left: </span>{String(hud.arenaScore ?? '0')} · {String(hud.arenaClock ?? 60)}s</>
              : <><span className="sr-only">Score, you then rival: </span>{String(hud.arenaScore ?? '0–0')}</>}
          </div>
          <nav aria-label="Arena sport" className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 gap-1 rounded-full bg-black/60 p-1">
            {shownSports().map((x) => (
              <a key={x.id} href={`${ARENA_HREF}?sport=${x.id}`} aria-current={sport?.id === x.id ? 'page' : undefined} aria-label={x.label}
                className={`inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full px-2.5 text-base font-bold sm:px-3 ${sport?.id === x.id ? 'bg-white text-black' : 'text-white'}`}>
                {'short' in x ? <><span aria-hidden className="sm:hidden">{x.short}</span><span aria-hidden className="hidden sm:inline">{x.label}</span></> : x.label}
              </a>
            ))}
          </nav>
          {pov && (
            <button type="button" data-testid="arena-pov" onClick={toggleView} aria-pressed={inPov}
              className="absolute right-3 top-[3.75rem] z-10 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-black/60 px-4 text-base font-bold">
              {inPov ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />} {inPov ? 'Court view' : 'POV'}
            </button>
          )}
          {inPov && <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />}
          {banner && <p role="status" className="absolute inset-x-0 top-[22%] text-center text-2xl font-black drop-shadow">{banner}</p>}
          {timing && <p className="absolute inset-x-0 bottom-[38%] text-center text-base font-bold text-white/85 drop-shadow">Release: {timing}</p>}
          {xpNote && <p role="status" data-testid="arena-xp" className="absolute inset-x-0 top-[30%] text-center text-xl font-black text-[#FFD166] drop-shadow">{xpNote}</p>}
          {!touch && (
            <p className="absolute inset-x-0 bottom-3 text-center text-base text-white/70">{sport ? played(sport).keys : ''}</p>
          )}
        </>
      )}
      {touch && busRef.current && phase === 'playing' && sport && <TouchOverlay bus={busRef.current} modeId={played(sport).mode} visible />}
    </div>
  );
}
