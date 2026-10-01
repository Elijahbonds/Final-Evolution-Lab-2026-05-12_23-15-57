import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('agentRunHooks (ECONOMY-CAPS CYBER k)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('production: closed by default; opens only when the server marker is set', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { agentRunHooksAllowed, setAgentRunHooksAllowed, devOrAgentHooks } = await import('./agentRunHooks');
    expect(agentRunHooksAllowed()).toBe(false);
    expect(devOrAgentHooks()).toBe(false);
    setAgentRunHooksAllowed(true);
    expect(agentRunHooksAllowed()).toBe(true);
    setAgentRunHooksAllowed(false);
    expect(agentRunHooksAllowed()).toBe(false);
  });

  it('development: always open regardless of the server marker', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { agentRunHooksAllowed, setAgentRunHooksAllowed } = await import('./agentRunHooks');
    expect(agentRunHooksAllowed()).toBe(true);
    setAgentRunHooksAllowed(false);
    expect(agentRunHooksAllowed()).toBe(true);
  });

  it('production: registerProdHookSync runs on/off when the gate flips', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { setAgentRunHooksAllowed, registerProdHookSync } = await import('./agentRunHooks');
    const on = vi.fn();
    const off = vi.fn();
    registerProdHookSync(on, off);
    setAgentRunHooksAllowed(true);
    expect(on).toHaveBeenCalledTimes(1);
    setAgentRunHooksAllowed(false);
    expect(off).toHaveBeenCalledTimes(1);
  });
});
