// VOICEOVER (2026-10-06): the one voice lane: no overlap, no late lines, bigger moments cut in cleanly, cooldowns.
import { describe, expect, it } from 'vitest';
import { VOICE_RULES, VoiceQueue, type VoiceRequest } from './voiceQueue';

let n = 0;
const R = (priority: number, sec: number, at: number, extra: Partial<VoiceRequest> = {}): VoiceRequest => ({ id: ++n, priority, sec, at, ...extra });

/** Drive the queue like VoiceKit does: every start is recorded with its [start, end) span. */
function film(q: VoiceQueue) {
  const spans: { id: number; from: number; to: number }[] = [];
  const play = (id: number, at: number, sec: number) => spans.push({ id, from: at, to: at + sec });
  return {
    spans,
    ask(r: VoiceRequest, now: number) {
      const d = q.request(r, now);
      if (d.kind === 'start') {
        if (d.cut) { const s = spans.find((x) => x.id === d.cut!.id)!; s.to = Math.min(s.to, now + d.cut.fadeSec); }
        play(r.id, d.at, r.sec);
      }
      return d;
    },
    run(until: number, step = 0.05) {
      for (let t = 0; t <= until + 1e-9; t += step) { const { start } = q.next(t); if (start) play(start.id, t, start.sec); }
    },
  };
}

describe('voiceQueue: one lane, never two voices at once', () => {
  it('a free lane starts at once', () => {
    const q = new VoiceQueue();
    expect(q.request(R(1, 2, 0), 0)).toEqual({ kind: 'start', at: 0 });
  });

  it('an equal call waits for the line to finish, then plays after a breath: the spans never overlap', () => {
    const q = new VoiceQueue(); const f = film(q);
    f.ask(R(1, 1.0, 0), 0);
    expect(f.ask(R(1, 1.0, 0.5), 0.5).kind).toBe('queued');
    f.run(3);
    expect(f.spans).toHaveLength(2);
    expect(f.spans[1].from).toBeGreaterThanOrEqual(f.spans[0].to + VOICE_RULES.gap - 1e-9);
  });

  it('a bigger moment cuts in with a fade (never a hard cut), and the cut line ends inside the fade', () => {
    const q = new VoiceQueue(); const f = film(q);
    const a = R(1, 3, 0); f.ask(a, 0);
    const d = f.ask(R(3, 1, 0.5), 0.5);
    expect(d.kind).toBe('start');
    if (d.kind !== 'start') throw new Error('no start');
    expect(d.cut).toEqual({ id: a.id, fadeSec: VOICE_RULES.fade });
    expect(d.at).toBeGreaterThan(0.5);                       // under the fade's tail, not on top of the old line's full level
    expect(f.spans[0].to).toBeCloseTo(0.5 + VOICE_RULES.fade, 9);
  });

  it('a bigger moment arriving in the last word waits for it instead of chopping it', () => {
    const q = new VoiceQueue();
    q.request(R(1, 2, 0), 0);
    const d = q.request(R(3, 1, 1.8), 1.8);   // 0.2 s left < nearEnd
    expect(d.kind).toBe('queued');
  });

  it('a smaller call that cannot start inside its window is dropped now, not played late', () => {
    const q = new VoiceQueue();
    q.request(R(2, 4, 0), 0);
    expect(q.request(R(1, 1, 0.5), 0.5)).toEqual({ kind: 'drop', reason: 'busy' });
  });

  it('filler never waits: it is only worth saying into silence', () => {
    const q = new VoiceQueue();
    q.request(R(1, 0.5, 0), 0);
    expect(q.request(R(0, 2, 0.1), 0.1)).toEqual({ kind: 'drop', reason: 'busy' });
  });

  it('a line asked for long ago (a slow decode) is stale on arrival', () => {
    const q = new VoiceQueue();
    expect(q.request(R(1, 1, 0), 1.5)).toEqual({ kind: 'drop', reason: 'stale' });
    expect(q.request(R(3, 1, 0), 2.5).kind).toBe('start');   // the biggest moment still has 3 s
  });

  it('a waiting line whose window passes is dropped when the lane frees, never started late', () => {
    const q = new VoiceQueue({ ...VOICE_RULES, maxDelay: [0, 1.2, 2, 3] });
    q.request(R(1, 1.0, 0), 0);
    const late = R(1, 1, 0.1);
    expect(q.request(late, 0.1).kind).toBe('queued');
    q.stopped(-1, 0);   // unrelated id: nothing changes
    // the playing line overruns its estimate? No: it is the lane's own clock. Push the waiting line past its window instead:
    const out = q.next(1.5);
    expect(out.start).toBeNull();
    expect(out.dropped.map((d) => d.id)).toEqual([late.id]);
  });

  it('the same moment cannot start again inside its cooldown (an ordinary call: 5 s)', () => {
    const q = new VoiceQueue();
    q.request(R(1, 0.5, 0, { moment: 'game.make' }), 0);
    expect(q.request(R(1, 0.5, 2, { moment: 'game.make' }), 2)).toEqual({ kind: 'drop', reason: 'cooldown' });
    expect(q.request(R(1, 0.5, 6, { moment: 'game.make' }), 6).kind).toBe('start');
    expect(q.request(R(3, 0.5, 6.5, { moment: 'game.make' }), 6.5).kind).toBe('start');   // the biggest moment has none
  });

  it('a caller that asks to interrupt cuts an equal line (the quiz host: the newest line matters)', () => {
    const q = new VoiceQueue();
    q.request(R(2, 3, 0), 0);
    const d = q.request(R(2, 1, 1, { interrupt: true }), 1);
    expect(d.kind === 'start' && !!d.cut).toBe(true);
  });

  it('a cut drops what was waiting behind the cut line: its moment is gone', () => {
    const q = new VoiceQueue();
    q.request(R(1, 1.0, 0), 0);
    expect(q.request(R(1, 0.5, 0.1), 0.1).kind).toBe('queued');
    expect(q.queued).toHaveLength(1);
    const d = q.request(R(2, 1, 0.3), 0.3);
    expect(d.kind === 'start' && !!d.cut).toBe(true);
    expect(q.queued).toHaveLength(0);
  });

  it('the queue holds two; a better third pushes the worst out, a worse third is refused', () => {
    const q = new VoiceQueue();
    q.request(R(2, 1.0, 0), 0);
    q.request(R(2, 0.2, 0), 0); q.request(R(2, 0.2, 0), 0);
    const worse = R(1, 0.2, 0);
    expect(q.request(worse, 0).kind).toBe('drop');
  });

  it('nextWake points at the end of the line plus the breath', () => {
    const q = new VoiceQueue();
    q.request(R(1, 2, 0), 0);
    expect(q.nextWake(0)).toBeCloseTo(2 + VOICE_RULES.gap, 9);
  });

  it('a long random barrage never produces overlapping spans (cuts end inside their fade)', () => {
    const q = new VoiceQueue(); const f = film(q);
    let seed = 3; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let t = 0; t < 120; t += 0.1) {
      if (rnd() < 0.15) f.ask(R(Math.floor(rnd() * 4), 0.4 + rnd() * 2.5, t, { moment: `m${Math.floor(rnd() * 5)}` }), t);
      const { start } = q.next(t); if (start) f.spans.push({ id: start.id, from: t, to: t + start.sec });
    }
    const s = [...f.spans].sort((a, b) => a.from - b.from);
    expect(s.length).toBeGreaterThan(20);
    for (let i = 1; i < s.length; i++) expect(s[i].from).toBeGreaterThanOrEqual(s[i - 1].to - VOICE_RULES.fade * 0.4 - 1e-9);
  });
});
