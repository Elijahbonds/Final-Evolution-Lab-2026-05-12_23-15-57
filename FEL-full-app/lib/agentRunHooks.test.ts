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

  it('production: registerProdHookSync runs on/off when the gate flips (on a loopback host)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubGlobal('window', { location: { hostname: 'localhost' } });
    const { setAgentRunHooksAllowed, registerProdHookSync } = await import('./agentRunHooks');
    const on = vi.fn();
    const off = vi.fn();
    registerProdHookSync(on, off);
    setAgentRunHooksAllowed(true);
    expect(on).toHaveBeenCalledTimes(1);
    setAgentRunHooksAllowed(false);
    expect(off).toHaveBeenCalledTimes(1);
  });

  it('production: ?agent=1 on the DEPLOYED domain does not arm the hooks (the hostname re-check)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubGlobal('window', { location: { hostname: 'final-evolution-lab.web.app' } });
    const { setAgentRunHooksAllowed, registerProdHookSync, agentRunHooksAllowed } = await import('./agentRunHooks');
    const on = vi.fn();
    registerProdHookSync(on, vi.fn());
    // the marker flips, the installers stay shut off-domain (the feed handles never publish)
    setAgentRunHooksAllowed(true);
    expect(on).not.toHaveBeenCalled();
    expect(agentRunHooksAllowed()).toBe(true);   // the gate flag still flips; only the install is held
  });
});
