// lane/online-play: the remote player's input reaches the host's simulation whatever second each page opened in.
// Before this lane the host read the sender's tick numbers on its own clock: measured against a real netd
// (scripts/probes/online-play/match-room.mts A), a guest whose page opened 1.2 s after the host's reached it on 0 of 183 frames.
import { describe, it, expect } from 'vitest';
import { InputQueue, INPUT_CUSHION_TICKS, INPUT_MAX_LEAD_TICKS, orButtons } from '../../lib/net/NetClock';
import { NetSession } from '../../lib/net/NetSession';
import { TICK_MS, type Intent, type NetMsg, type Transport } from '../../lib/net/protocol';

const I = (o: Partial<Intent> = {}): Intent => ({ moveX: 0, moveY: 0, sprint: false, action: false, actionHeld: 0, pass: false, steal: false, ...o });

describe('two clocks', () => {
  it('a sender 36 ticks behind the host is read (the measured failure: 0 of 183 frames before)', () => {
    const q = new InputQueue();
    const hostAt = 141, senderAt = 105;   // the probe's own numbers
    let got = 0;
    for (let k = 0; k < 60; k++) {
      q.push(senderAt + k, I({ moveX: 1 }), hostAt + k);
      if (q.take(hostAt + k).intent?.moveX === 1) got++;
    }
    expect(got).toBeGreaterThan(55);
  });

  it('MUTATION: a sender AHEAD of the host, keyed without the arrival tick (offset 0), is never read', () => {
    const q = new InputQueue();
    let got = 0;
    for (let k = 0; k < 40; k++) { q.push(900 + k, I({ moveY: -1 }), undefined); if (q.take(10 + k).intent?.moveY === -1) got++; }
    expect(got).toBe(0);
  });

  it('a sender AHEAD of the host is read too', () => {
    const q = new InputQueue();
    let got = 0;
    for (let k = 0; k < 40; k++) { q.push(900 + k, I({ moveY: -1 }), 10 + k); if (q.take(10 + k + INPUT_CUSHION_TICKS).intent?.moveY === -1) got++; }
    expect(got).toBeGreaterThan(35);
  });

  it('a tap that lived one sender tick is not lost when the host steps over two ticks at once', () => {
    const q = new InputQueue();
    q.push(50, I(), 0);
    q.push(51, I({ action: true }), 1);
    q.push(52, I(), 2);
    // the host reads late: one take covers 50..52
    const r = q.take(2 + INPUT_CUSHION_TICKS);
    expect(r.intent?.action).toBe(true);
    expect(r.predicted).toBe(false);
    // and it fired once: the next take with nothing new repeats the merged frame by reference (a caller consumes the edge in place)
    const again = q.take(3 + INPUT_CUSHION_TICKS);
    expect(again.predicted).toBe(true);
    expect(again.intent).toBe(r.intent);
  });

  it('a burst after a stall re-learns the offset (the host is not left reading a third of a second late)', () => {
    const q = new InputQueue();
    q.push(0, I(), 100);
    // 20 ticks of input arrive in one go at host tick 101
    for (let k = 1; k <= 20; k++) q.push(k, I({ moveX: k / 20 }), 101);
    expect(q.depth(101)).toBeLessThanOrEqual(INPUT_MAX_LEAD_TICKS);
    // the read is within the band of the newest, not 20 ticks behind it
    expect(q.take(101 + INPUT_CUSHION_TICKS).intent!.moveX).toBeGreaterThanOrEqual((20 - INPUT_MAX_LEAD_TICKS) / 20);
  });

  it('orButtons: the newest axes, every button pressed in either', () => {
    const o = orButtons(I({ moveX: 0.5, sprint: false }), I({ moveX: -1, steal: true, sprint: true }));
    expect(o.moveX).toBe(0.5); expect(o.steal).toBe(true); expect(o.sprint).toBe(true); expect(o.action).toBe(false);
  });
});

describe('the sender keeps a one-frame tap', () => {
  it('a press on a frame that is not a send tick rides the next send', () => {
    const sent: NetMsg[] = [];
    let t = 1_000_000;
    const tr: Transport = { send: (m) => { sent.push(m); }, onMessage: () => {}, close: () => {} };
    const s = new NetSession({ transport: tr, selfId: 'foe', isAuthority: false, now: () => t });
    s.sendLocalIntent(I());                    // the tick's first frame: sent
    t += TICK_MS / 2; s.sendLocalIntent(I({ action: true }));   // a 60 fps frame inside the same tick: the tap
    t += TICK_MS; s.sendLocalIntent(I());      // the next tick: the tap must be in it
    const inputs = sent.filter((m) => m.t === 'input') as Extract<NetMsg, { t: 'input' }>[];
    expect(inputs).toHaveLength(2);
    expect(inputs[1].intent.action).toBe(true);
  });
});
