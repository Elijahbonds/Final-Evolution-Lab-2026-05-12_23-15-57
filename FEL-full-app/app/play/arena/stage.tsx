'use client';

// /play/arena — the Physics Arena on the real ModeHarness. Mounts MODES.physics_arena (basketball 1v1 on Havok) and starts it as
// soon as it is ready (a practice court, not a ranked match: no START screen). Over the scene: the score, the last call (a make,
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
import { ARENA_HREF, physicsHoopsOn, povOn, SHIPPED_ONEVONE_HREF } from '@/lib/babylon/arena/arenaConfig';

/** The arena's sports so far (docs/PHYSICS-ARENA-PLAN.md §5): `?sport=` picks one. */
const SPORTS = [
  { id: 'hoops', mode: ARENA_MODE_ID, label: '1v1', keys: 'Move WASD · Sprint Shift · Shoot hold L, let go at the top · Jump J · Pass K · Reach I · Cross Q · View C' },
  { id: 'threes', mode: ARENA_3V3_MODE_ID, label: '3v3', keys: 'Move WASD · Sprint Shift · Shoot hold L · Jump J · Pass K (toward the stick) · Call for it / reach I · Cross Q · View C' },
  { id: 'threepoint', mode: ARENA_3PT_MODE_ID, label: '3-Point', keys: 'Shoot hold L (or J), let go at the top of the jump · View C' },
] as const;
function sportOf(search: string): (typeof SPORTS)[number] {
  let id = 'hoops';
  try { id = new URLSearchParams(search).get('sport') ?? 'hoops'; } catch { /* hoops */ }
  return SPORTS.find((x) => x.id === id) ?? SPORTS[0];
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
    const def = MODES[sport.mode];
    if (!canvas || !physicsHoopsOn()) return;
    if (!def) { setErr('the arena is not registered'); return; }
    const bus = new InputBus();
    busRef.current = bus;
    let stop: (() => void) | null = null;
    let disposed = false;
    runMode(def, {
      canvas,
      input: bus,
      onPhase: (p, d) => {
        if (disposed) return;
        setPhase(p);
        if (p === 'error') setErr(String(d));
        // a practice court: straight in (next tick: the harness takes a press only once it is in 'ready')
        if (p === 'ready') setTimeout(() => { if (!disposed) { bus.emit({ t: 'button', btn: 'START', pressed: true }); bus.emit({ t: 'button', btn: 'START', pressed: false }); } }, 50);
      },
      onHud: (u) => { if (!disposed) setHud((h) => ({ ...h, ...u })); },
      guest: !signedIn,
      resultSink: async () => {},   // a practice place: no session, no pay
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
            {SPORTS.map((x) => (
              <a key={x.id} href={`${ARENA_HREF}?sport=${x.id}`} aria-current={sport?.id === x.id ? 'page' : undefined}
                className={`inline-flex min-h-[44px] items-center rounded-full px-3 text-base font-bold ${sport?.id === x.id ? 'bg-white text-black' : 'text-white'}`}>{x.label}</a>
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
          {!touch && (
            <p className="absolute inset-x-0 bottom-3 text-center text-base text-white/70">{sport?.keys}</p>
          )}
        </>
      )}
      {touch && busRef.current && phase === 'playing' && sport && <TouchOverlay bus={busRef.current} modeId={sport.mode} visible />}
    </div>
  );
}
