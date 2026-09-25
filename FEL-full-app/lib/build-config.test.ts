import { describe, expect, it, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// HOTFIX (2026-09-24): the build config is the one file every page ships through, and two things in it were decided
// on purpose: the Abacus platform's client error reporter is gone, and the mic is allowed on our own pages.
// Neither is visible from a page until someone needs it — a reporter hook only fired with NEXT_OUTPUT_MODE=standalone,
// and a blocked mic only shows up as a feature that "doesn't work" — so both are pinned here.

const require = createRequire(import.meta.url);
const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const read = (p: string) => readFileSync(root(p), 'utf8');
const nextConfig = require('../next.config.js');

const savedOutputMode = process.env.NEXT_OUTPUT_MODE;
afterEach(() => {
  if (savedOutputMode === undefined) delete process.env.NEXT_OUTPUT_MODE;
  else process.env.NEXT_OUTPUT_MODE = savedOutputMode;
  // if the hook ever comes back, the standalone run below writes its script into the tree; fail, but leave no file
  // behind for a `git add -A` to pick up
  rmSync(root('__abacus_error_reporter.js'), { force: true });
});

describe('security headers', () => {
  it('keeps the baseline hardening headers', async () => {
    const [rule] = await nextConfig.headers();
    const h = new Map(rule.headers.map((x: { key: string; value: string }) => [x.key, x.value]));
    expect(rule.source).toBe('/(.*)');
    expect(nextConfig.poweredByHeader).toBe(false);
    expect(h.get('X-Content-Type-Options')).toBe('nosniff');
    expect(h.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(h.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(h.get('Content-Security-Policy')).toContain("frame-ancestors 'self'");
  });

  it('allows the camera and the mic on our own pages, and never geolocation', async () => {
    // OWNER (2026-09-24): Acting, Music vocals, the Flip recorder and voice chat all need getUserMedia({ audio }),
    // and `microphone=()` refused it on every page before any of them could ask.
    const [rule] = await nextConfig.headers();
    const policy = rule.headers.find((x: { key: string }) => x.key === 'Permissions-Policy')?.value;
    expect(policy).toBe('camera=(self), microphone=(self), geolocation=()');
  });
});

describe('no injected client error reporter', () => {
  it('leaves the client entry alone in a standalone build', async () => {
    // The removed hook only ran when NEXT_OUTPUT_MODE=standalone: it wrote __abacus_error_reporter.js and
    // prepended it to main-app. Run the webpack hook exactly that way and check the entry is untouched.
    process.env.NEXT_OUTPUT_MODE = 'standalone';
    const entry = async () => ({ 'main-app': ['./app-entry.js'], main: ['./main.js'] });
    const config = nextConfig.webpack({ output: {}, entry }, { isServer: false });
    expect(config.entry).toBe(entry);
    expect(await config.entry()).toEqual({ 'main-app': ['./app-entry.js'], main: ['./main.js'] });
    expect(existsSync(root('__abacus_error_reporter.js'))).toBe(false);
  });

  it('carries no beacon and no encoded script in its source', () => {
    const src = read('next.config.js');
    expect(src).not.toContain('sendBeacon');
    expect(src).not.toContain('writeFileSync');
    expect(src).not.toMatch(/config\.entry\s*=/);
    expect(src).not.toMatch(/Buffer\.from\(\s*['"][A-Za-z0-9+/=]{80,}['"]/);
  });
});

describe('the retired Abacus hosts', () => {
  it('routes nothing by an abacusai.app hostname', () => {
    // middleware.ts existed only to send nexusllm.abacusai.app to /studio; it was deleted with the host.
    if (existsSync(root('middleware.ts'))) expect(read('middleware.ts')).not.toContain('abacusai.app');
  });

  it('does not advertise them, or a CLI that is not in the tree, to agents', () => {
    // HOTFIX (2026-09-24): the manifest's `pipeline` block pointed agents at `node tools/nexus_agent.mjs`, which has
    // never been on this line of history. The CLI exists only on origin/cursor/app-quality-and-completion-4810
    // (9e32fd31, 2026-09-18), and the 2026-09-24 audit put it on its "drop" list. The block went with the hosts; if
    // that CLI is ever salvaged, the block comes back with it — the check below lets through any entryPoint that is
    // actually on disk.
    const raw = read('public/agent-manifest.json');
    const manifest = JSON.parse(raw);
    expect(raw).not.toContain('abacusai.app');
    const entry: string | undefined = manifest.pipeline?.entryPoint;
    if (entry) expect(existsSync(root(entry.replace(/^node\s+/, '')))).toBe(true);
  });
});
