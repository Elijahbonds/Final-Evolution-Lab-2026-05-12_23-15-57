// QA A1-02: hoops3v3 posted `played: false` on a finished, full-length game (won, 6–12, ran to the 90s horn) while every
// other mode posted true. Root cause: hoops3v3 (and onevone) are the only modes that give the agent bridge a real
// ControlSource — act() then pushes the intent straight into PlayerSlot (AgentControlSource.ts) and never touches the
// DOM or InputBus, so GameShell's window-event count and sessionStore's record both stay at 0 even though the game
// was played start to finish through the bridge's own documented "same Intent shape a human press produces" path.
// agentPlayEvidence() (AgentBridge.ts) is a third, independent count of that path, read by GameShell alongside the
// other two (game-shell.tsx `played:`).
import { afterEach, describe, expect, it } from 'vitest';
import { installAgentBridge, agentPlayEvidence } from './AgentBridge';
import type { ControlSource, Intent } from './PlayerSlot';

function stubWindow(query: string): void {
  (globalThis as unknown as { window: unknown }).window = {
    location: { search: query },
    sessionStorage: (() => {
      const store = new Map<string, string>();
      return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
      };
    })(),
  };
}

function fakeControl(pushed: unknown[]): ControlSource {
  return {
    push: (intent: unknown) => { pushed.push(intent); },
    poll: () => ({ moveX: 0, moveY: 0, sprint: false, action: false, actionHeld: 0, pass: false, steal: false }) as Intent,
    dispose: () => {},
  };
}

describe('agentPlayEvidence (QA A1-02)', () => {
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('is 0 until the bridge is enabled and attached', () => {
    expect(agentPlayEvidence()).toBe(0);
  });

  it('counts act() calls that reach a real ControlSource — the same intent path a human press takes', async () => {
    stubWindow('?agent=1');
    const bridge = installAgentBridge([]);
    expect(bridge).not.toBeNull();
    const pushed: unknown[] = [];
    bridge!.attach({ scene: {} as never, modeId: 'threevthree', control: fakeControl(pushed) });
    expect(agentPlayEvidence()).toBe(0);
    await bridge!.act({ moveX: 1 }, 5);
    await bridge!.act({ moveX: 1 }, 5);
    await bridge!.act({ moveX: 1 }, 5);
    expect(pushed.length).toBe(3);
    expect(agentPlayEvidence()).toBeGreaterThanOrEqual(3);
  });

  it('never counts a mode with no agent ControlSource — nothing reached the game', async () => {
    stubWindow('?agent=1');
    const bridge = installAgentBridge([]);
    bridge!.attach({ scene: {} as never, modeId: 'someMode' });
    await bridge!.act({ moveX: 1 }, 5);
    await bridge!.act({ moveX: 1 }, 5);
    await bridge!.act({ moveX: 1 }, 5);
    expect(agentPlayEvidence()).toBe(0);
  });

  it('a fresh attach (a new run) drops the previous run\'s evidence', async () => {
    stubWindow('?agent=1');
    const bridge = installAgentBridge([]);
    const pushed: unknown[] = [];
    bridge!.attach({ scene: {} as never, modeId: 'threevthree', control: fakeControl(pushed) });
    await bridge!.act({ moveX: 1 }, 5);
    await bridge!.act({ moveX: 1 }, 5);
    await bridge!.act({ moveX: 1 }, 5);
    expect(agentPlayEvidence()).toBeGreaterThanOrEqual(3);
    bridge!.attach({ scene: {} as never, modeId: 'threevthree', control: fakeControl(pushed) });
    expect(agentPlayEvidence()).toBe(0);
  });
});
