// ECONOMY-CAPS CYBER (k): every window hook assignment sits behind devOrAgentHooks / agentRunHooksAllowed / NODE_ENV guard.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = process.cwd();
const HOOKS = ['__FEL_DEV__', '__NEXUS_AGENT__', '__FEL_QA__', '__FEL_POSE_FEED__', '__FEL_BODY__', '__FEL_SPACE__'];

function files(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      if (name === 'node_modules' || name.startsWith('.next')) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) out.push(p);
    }
  };
  walk(join(ROOT, dir));
  return out;
}

describe('CYBER hook scan (ECONOMY-CAPS k)', () => {
  it('ModeHarness publishes __FEL_DEV__ only behind devOrAgentHooks', () => {
    const src = stripComments(readFileSync(join(ROOT, 'lib/babylon/core/ModeHarness.ts'), 'utf8'));
    expect(src).toMatch(/devOrAgentHooks\(\)/);
    expect(src).toMatch(/if \(probeHandle\) devWindow\.__FEL_DEV__ = probeHandle;/);
  });

  it('AgentBridge uses agentRunHooksAllowed in production', () => {
    const src = stripComments(readFileSync(join(ROOT, 'lib/babylon/core/AgentBridge.ts'), 'utf8'));
    expect(src).toMatch(/process\.env\.NODE_ENV === 'production'\) return agentRunHooksAllowed\(\)/);
  });

  it('assignments to probe hooks are gated or dev-only in app/lib/components', () => {
    const offenders: string[] = [];
    for (const p of [...files('app'), ...files('lib'), ...files('components')]) {
      const rel = relative(ROOT, p);
      if (rel.includes('agentRunHooks.ts') || rel.includes('cyberHooks.scan.test.ts')) continue;
      const src = stripComments(readFileSync(p, 'utf8'));
      for (const hook of HOOKS) {
        if (!src.includes(hook)) continue;
        const assigns = src.includes(`window.${hook}`) || src.includes(`${hook} =`) || src.includes(`${hook}__ =`);
        if (!assigns) continue;
        const gated = /devOrAgentHooks\(\)|agentRunHooksAllowed\(\)|NODE_ENV === 'development'|registerProdHookSync|feedHookAllowed/.test(src);
        if (!gated) offenders.push(`${rel} (${hook})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
