import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const nextConfig = require('../next.config.js');

describe('Next.js production config', () => {
  it('keeps baseline browser hardening headers enabled', async () => {
    const headerRules = await nextConfig.headers();
    const headers = new Map(headerRules[0].headers.map((header: { key: string; value: string }) => [header.key, header.value]));

    expect(nextConfig.poweredByHeader).toBe(false);
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(headers.get('Content-Security-Policy')).toContain("frame-ancestors 'self'");
    expect(headers.get('Permissions-Policy')).toContain('camera=(self)');
  });

  it('does not inject generated client error reporters into standalone bundles', () => {
    const source = readFileSync(join(process.cwd(), 'next.config.js'), 'utf8');

    expect(source).not.toContain('__abacus_error_reporter');
    expect(source).not.toContain('sendBeacon');
    expect(source).not.toMatch(/Buffer\.from\(['"][A-Za-z0-9+/=]{80,}['"],\s*['"]base64['"]\)/);
  });
});
