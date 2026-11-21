// lane/online-play: one shared game — who runs it, the 1v1 hand-over, the take-over when the runner leaves, the HUD and the end
// as each side reads them. Two (or three) NetSessions on an in-process relay that behaves as netd's does (every frame to the
// others, the sender stamped), driven by a fake ModeContext (no Babylon scene: the cast is not spawned, so no bodies are drawn).
import { describe, it, expect } from 'vitest';
import { NetSession } from '../../lib/net/NetSession';
import { NetPlay, GONE_MS, type PlayHooks } from '../../lib/net/play';
import type { NetMsg, Transport } from '../../lib/net/protocol';
import type { ModeContext } from '../../lib/babylon/core/ModeHarness';

function relay() {
  const peers = new Map<string, (m: NetMsg) => void>();
  const sent: NetMsg[] = [];
  return {
    sent,
    transport(id: string): Transport {
      return {
        send: (m) => { sent.push(m); for (const [p, h] of peers) if (p !== id) h({ ...m, from: id } as NetMsg); },
        onMessage: (h) => { peers.set(id, h); },
        close: () => { peers.delete(id); },
      };
    },
  };
}

function fakeCtx() {
  const hud: Record<string, unknown>[] = [];
  const ends: { outcome: string; score: number; stats: Record<string, number> }[] = [];
  const obs = { add: (f: () => void) => { renders.push(f); return f; }, remove: () => {} };
  const renders: (() => void)[] = [];
  const ctx = {
    scene: { onAfterRenderObservable: obs, onAfterAnimationsObservable: obs, onAfterPhysicsObservable: obs },
    setHud: (u: Record<string, unknown>) => { hud.push(u); },
    end: (outcome: string, score: number, stats: Record<string, number>) => { ends.push({ outcome, score, stats }); },
    heroRef: { current: null }, objectiveRef: { current: null }, camDirector: { update: () => {} },
  } as unknown as ModeContext;
  return { ctx, hud, ends, render: () => renders.forEach((f) => f()) };
}

function page(r: ReturnType<typeof relay>, id: string, mode: string, clock: { t: number }) {
  const session = new NetSession({ transport: r.transport(id), selfId: id, isAuthority: false, now: () => clock.t });
  const play = new NetPlay(session, mode, () => clock.t, 'room1');
  const f = fakeCtx();
  const took: { mine: number; theirs: number; why: string }[] = [];
  const score = { mine: 0, theirs: 0 };
  const hooks: PlayHooks = {
    cast: () => null,
    localIntent: () => ({ moveX: 1, moveY: 0, sprint: false, action: false, actionHeld: 0, pass: false, steal: false }),
    takeOver: (s, why) => { took.push({ ...s, why }); score.mine = s.mine; score.theirs = s.theirs; },
    scores: () => score,
  };
  play.bind(f.ctx, hooks);
  return { id, session, play, ...f, took, score, hooks };
}

describe('one shared game (1v1)', () => {
  const setup = () => {
    const r = relay(); const clock = { t: 1_000_000 };
    const host = page(r, 'h1', 'onevone', clock), guest = page(r, 'foe', 'onevone', clock);
    host.session.notePeers(['foe']); guest.session.notePeers(['h1']);
    host.play.opened(true); guest.play.opened(false);
    return { r, clock, host, guest };
  };

  it('the first page in runs it; the other draws (its mode is held) and sends its input', () => {
    const { r, host, guest } = setup();
    expect(host.play.role).toBe('run'); expect(guest.play.role).toBe('draw');
    expect(host.play.frame(host.ctx, 1 / 60, host.hooks)).toBe(false);
    expect(guest.play.frame(guest.ctx, 1 / 60, guest.hooks)).toBe(true);
    expect(r.sent.some((m) => m.t === 'input' && m.from === 'foe')).toBe(true);
    // and the running page reads it (the session is the authority while it runs)
    expect(host.session.intentFor('foe')?.moveX).toBe(1);
  });

  it('the HUD reaches the other side flipped: my 4 is their foeScore, YOUR BALL is THEIR BALL', () => {
    const { clock, host, guest } = setup();
    host.ctx.setHud({ score: 4, foeScore: 2, banner: 'YOUR BALL', shotMeterT: 0.5 });
    clock.t += 40; host.render();   // flushed at the tick
    const last = guest.hud[guest.hud.length - 1];
    expect(last).toEqual({ foeScore: 4, score: 2, banner: 'THEIR BALL' });
  });

  it('a turnover hands the game to the other page, with the score; it takes over from a check-up', () => {
    const { host, guest } = setup();
    host.score.mine = 5; host.score.theirs = 3;
    expect(host.play.handOff({ mine: 5, theirs: 3 }, 'THEIR BALL — DEFEND!')).toBe(true);
    expect(host.play.role).toBe('draw'); expect(guest.play.role).toBe('run');
    expect(guest.took).toEqual([{ mine: 3, theirs: 5, why: 'ball' }]);
    expect(guest.hud.some((u) => u.banner === 'YOUR BALL')).toBe(true);
    // and back
    expect(guest.play.handOff({ mine: 3, theirs: 5 })).toBe(true);
    expect(host.took).toEqual([{ mine: 5, theirs: 3, why: 'ball' }]);
    expect(host.play.role).toBe('run');
  });

  it('alone in the room there is nobody to hand to: the mode plays its own defence against the AI', () => {
    const r = relay(); const clock = { t: 1 };
    const solo = page(r, 'h1', 'onevone', clock);
    solo.play.opened(true);
    expect(solo.play.handOff({ mine: 0, theirs: 0 })).toBe(false);
    expect(solo.play.role).toBe('run');
  });

  it('the end: the runner\'s WIN is the other page\'s LOSS, with the scores from its side', () => {
    const { host, guest } = setup();
    host.score.mine = 11; host.score.theirs = 6;
    host.ctx.end('WIN', 11, { foeScore: 6 });
    expect(host.ends[0].outcome).toBe('WIN');
    expect(guest.ends[0]).toEqual({ outcome: 'LOSS', score: 6, stats: { foeScore: 11, online: 1 } });
  });

  it('the runner leaving: the drawing page takes the game on, with the score it last drew', () => {
    const { clock, host, guest } = setup();
    host.ctx.setHud({ score: 7, foeScore: 9 }); clock.t += 40; host.render();
    guest.play.receive({ t: 'world', from: 'h1', tick: 1, sent: 0, bodies: [], loose: [], seats: { h1: 0, foe: 1 }, teams: [0, 1] }, clock.t);
    guest.play.peerLeft('h1');
    expect(guest.play.role).toBe('run');
    expect(guest.took).toEqual([{ mine: 9, theirs: 7, why: 'left' }]);
  });

  it('a runner that goes silent (a dead tab netd has not noticed) is taken over after GONE_MS', () => {
    const { clock, guest } = setup();
    guest.play.receive({ t: 'world', from: 'h1', tick: 1, sent: 0, bodies: [], loose: [], seats: { h1: 0, foe: 1 }, teams: [0, 1] }, clock.t);
    clock.t += GONE_MS + 1;
    guest.play.frame(guest.ctx, 1 / 60, guest.hooks);
    expect(guest.play.role).toBe('run');
  });

  it('a runner that comes back after a take-over (a backgrounded phone) steps back: the newer hand-over runs', () => {
    const { clock, host, guest } = setup();
    guest.play.receive({ t: 'world', from: 'h1', tick: 1, sent: 0, bodies: [], loose: [], seats: {}, teams: [], epoch: 0 }, clock.t);
    guest.play.peerLeft('h1');   // taken over: the next hand-over
    expect(guest.play.role).toBe('run');
    // the old runner's page wakes up still running, at the old hand-over
    guest.play.receive({ t: 'world', from: 'h1', tick: 2, sent: 0, bodies: [], loose: [], seats: {}, teams: [], epoch: 0 }, clock.t);
    expect(guest.play.role).toBe('run');
    host.play.receive({ t: 'world', from: 'foe', tick: 9, sent: 0, bodies: [], loose: [], seats: {}, teams: [], epoch: 1 }, clock.t);
    expect(host.play.role).toBe('draw');
  });

  it('two pages running at once (a hand-over crossed a take-over): one steps back on the other\'s world', () => {
    const { host, guest } = setup();
    guest.play.receive({ t: 'poss', from: 'h1', to: 'foe', sent: 0, seq: 1, score: { h1: 0, foe: 0 } }, 0);
    expect(guest.play.role).toBe('run'); expect(host.play.role).toBe('run');
    guest.play.receive({ t: 'world', from: 'h1', tick: 1, sent: 0, bodies: [], loose: [], seats: {}, teams: [] }, 0);
    host.play.receive({ t: 'world', from: 'foe', tick: 1, sent: 0, bodies: [], loose: [], seats: {}, teams: [] }, 0);
    expect([host.play.role, guest.play.role].filter((x) => x === 'run')).toHaveLength(1);
  });
});

describe('3v3: the host runs it; teammates and rivals read it from their side', () => {
  it('a rival (net1) swaps the score, a teammate (net2) keeps it; the end flips for the rival only', () => {
    const r = relay(); const clock = { t: 5_000 };
    const host = page(r, 'h1', 'threevthree', clock), rival = page(r, 'net1', 'threevthree', clock), mate = page(r, 'net2', 'threevthree', clock);
    for (const p of [host, rival, mate]) p.session.notePeers(['h1', 'net1', 'net2']);
    host.play.opened(true); rival.play.opened(false); mate.play.opened(false);
    // the drawing pages learn the teams from a world (the running page's seats and teams)
    const w = { t: 'world' as const, from: 'h1', tick: 1, sent: 0, bodies: Array.from({ length: 6 }, () => ({ p: [0, 0, 0] as [number, number, number] })), loose: [], seats: { h1: 0, net1: 3, net2: 1 }, teams: [0, 0, 0, 1, 1, 1] };
    rival.play.receive(w, 0); mate.play.receive(w, 0);
    host.ctx.setHud({ score: 12, foeScore: 10, time: 61 }); clock.t += 40; host.render();
    expect(rival.hud[rival.hud.length - 1]).toEqual({ score: 10, foeScore: 12, time: 61 });
    expect(mate.hud[mate.hud.length - 1]).toEqual({ score: 12, foeScore: 10, time: 61 });
    host.score.mine = 21; host.score.theirs = 15;
    host.ctx.end('WIN', 21, {});
    expect(rival.ends[0].outcome).toBe('LOSS'); expect(rival.ends[0].score).toBe(15);
    expect(mate.ends[0].outcome).toBe('WIN'); expect(mate.ends[0].score).toBe(21);
  });
  it('3v3 never hands the game over on a turnover (the host runs every possession)', () => {
    const r = relay(); const clock = { t: 1 };
    const host = page(r, 'h1', 'threevthree', clock); page(r, 'net1', 'threevthree', clock);
    host.session.notePeers(['net1']); host.play.opened(true);
    expect(host.play.handOff({ mine: 0, theirs: 0 })).toBe(false);
  });
});

describe('a watcher draws and never runs', () => {
  it('a watcher first in the room: the host seat runs the game, the rival seat draws', () => {
    const r = relay(); const clock = { t: 1 };
    const host = page(r, 'h1', 'onevone', clock), guest = page(r, 'foe', 'onevone', clock);
    host.play.opened(false, 'wbench'); guest.play.opened(false, 'wbench');
    expect(host.play.role).toBe('run'); expect(guest.play.role).toBe('draw');
  });
  it('a watcher\'s card at the end is the final score, not a win or a loss', () => {
    const r = relay(); const clock = { t: 1 };
    const w = page(r, 'wbench', 'onevone', clock);
    w.play.opened(false, 'h1');
    w.play.receive({ t: 'end', from: 'h1', sent: 0, outcome: 'LOSS', score: {}, teamScore: [8, 11], team: { h1: 0, foe: 1 } }, 0);
    expect(w.ends[0]).toEqual({ outcome: 'FINAL', score: 11, stats: { foeScore: 8, online: 1, watched: 1 } });
  });
  it('a w… peer draws, sends no input, and does not take over when the runner leaves', () => {
    const r = relay(); const clock = { t: 1 };
    const w = page(r, 'wbench', 'onevone', clock);
    w.play.opened(true);   // even first in the room
    expect(w.play.role).toBe('draw');
    w.play.peerLeft('h1');
    expect(w.play.role).toBe('draw');
  });
});
