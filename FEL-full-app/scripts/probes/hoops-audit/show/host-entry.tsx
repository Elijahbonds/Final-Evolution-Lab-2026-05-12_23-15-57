// hoops-audit-show (2026-11-12): THE REAL HOOPS SCREENS on a bare page (no Next server) — GameShell around the mode's own
// Babylon host, exactly as app/play/<mode>/_components/loader.tsx mounts it, with the app's CSS and fonts (scripts/a11y/rig.mts
// buildRig). It is what a player sees: the start card, the HUD, the pause, the results card. Read-only probe page; it changes
// nothing in the app.
//   ?mode=onevone|threevthree|threepoint|dunk|dunkduel|carnival
// What it adds around the real page, for the probe (show.mts) to read:
//   * /api/* answered in the page (a signed-in profile, an agent run, everything else 404) — there is no server here;
//   * window.__SFX: every SoundKit.play(name) with the page clock (the synthesised sounds: what the game actually asked to hear);
//   * window.__END(won): calls the shell's own onEnd with a plausible result, so the REAL results card can be photographed
//     without playing a whole game on a software-GL box (marked as such in the audit).
import { createElement as h, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { GameShell, type GameProps } from '@/components/games/game-shell';
import BasketballBabylon from '@/components/games/basketball-babylon';
import ThreeVThreeBabylon from '@/components/games/three-v-three-babylon';
import ThreePointBabylon from '@/components/games/three-point-babylon';
import DunkBabylon from '@/components/games/dunk-babylon';
import DunkDuelBabylon from '@/components/games/dunkduel-babylon';
import CarnivalBabylon from '@/components/games/carnival-babylon';
import { prqGrade } from '@/lib/prq';
import { SoundKit } from '@/lib/babylon/audio/SoundKit';
import { setAgentRunHooksAllowed } from '@/lib/agentRunHooks';

type W = Window & { __PATH: string; __SESSION: unknown; __SFX: { t: number; name: string; vol?: number; tag?: string; pan?: number }[]; __END?: (won: boolean) => void; __SK?: unknown };
const w = window as unknown as W;
w.__SFX = [];
const q = new URLSearchParams(location.search);
const key = q.get('mode') ?? 'onevone';
w.__PATH = `/play/${key}`;
w.__SESSION = { user: { id: 'probe', name: 'Probe', email: 'probe@example.invalid' }, expires: '2099-01-01' };
setAgentRunHooksAllowed(true);

// the server, answered in the page: a signed-in profile; an agent run; every other route a quiet 404
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(url, location.href).pathname;
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (path === '/api/profile') return json({ prq: 50, grade: prqGrade(50), prqDisplay: { score: 50, measured: 3, total: 5 }, profile: { userId: 'probe' } });
  if (path === '/api/sessions/start') return json({ runId: 'probe-run', agentRun: true });
  if (path.startsWith('/api/')) return json({ error: 'probe rig: no server' }, 404);
  return realFetch(input, init);
};

// every synthesised cue the game asks for, on the page clock
// (hoops-sound, 2026-11-12: + who asked — the dribble's player / ai / pass — and the pan; and SoundKit itself, for its sample state)
const play = SoundKit.play.bind(SoundKit) as (name: string, opts?: { volume?: number; tag?: string; pan?: number }) => void;
w.__SK = SoundKit;
(SoundKit as unknown as { play: typeof play }).play = (name, opts) => {
  if (w.__SFX.length < 20000) w.__SFX.push({ t: Math.round(performance.now()), name, vol: opts?.volume, tag: opts?.tag, pan: opts?.pan });
  return play(name, opts);
};

const HOSTS: Record<string, { mode: string; title: string; venue: string; Game: ComponentType<GameProps> }> = {
  onevone: { mode: 'hoops1v1', title: 'ONES', venue: 'Venice Beach Court', Game: BasketballBabylon as ComponentType<GameProps> },
  threevthree: { mode: 'hoops3v3', title: 'THREES', venue: 'Venice Beach Court', Game: ThreeVThreeBabylon as ComponentType<GameProps> },
  threepoint: { mode: 'threePoint', title: '3-POINT', venue: 'Venice Beach Court', Game: ThreePointBabylon as ComponentType<GameProps> },
  dunk: { mode: 'dunkContest', title: 'FLIGHT NIGHT', venue: 'Venice Beach Court', Game: DunkBabylon as ComponentType<GameProps> },
  dunkduel: { mode: 'dunkduel', title: 'PROVE IT', venue: 'Venice Beach Court', Game: DunkDuelBabylon as ComponentType<GameProps> },
  carnival: { mode: 'carnival', title: 'GAME NIGHT', venue: 'Venice Beach Carnival', Game: CarnivalBabylon as ComponentType<GameProps> },
};
const host = HOSTS[key] ?? HOSTS.onevone;
// the shell's own onEnd, kept so the probe can end the run on the real results card
const Wrapped = (p: GameProps) => {
  w.__END = (won: boolean) => p.onEnd({
    score: won ? 11 : 7, opponentScore: won ? 7 : 11, won, duration: 312, headline: won ? 'GAME WON' : 'GAME OVER',
    outcome: won ? 'WIN' : 'LOSS', stats: { foeScore: won ? 7 : 11 },
  } as Parameters<GameProps['onEnd']>[0]);
  return h(host.Game, p);
};
createRoot(document.getElementById('root')!).render(h(GameShell, { mode: host.mode, title: host.title, venue: host.venue, Game: Wrapped, ownControls: true }));
