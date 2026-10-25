// No live credential is committed (QG-06, secrets). GitHub's secret scanning runs on GitHub; this runs everywhere the
// suite runs, over every tracked text file: known key shapes (Stripe live/restricted keys, webhook secrets, AWS, Google
// API keys, GitHub tokens, Slack tokens, private-key blocks, a database URL with a real-looking password), and any
// high-entropy literal assigned to a name like secret / token / password / api_key.
//
// Fixtures that LOOK like secrets on purpose (a test's fake private key, `s3cret` in a parser test) carry a placeholder
// word or live under a test file, and are allowed by ALLOW below — each line says why.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(__dirname, '../../..');
const BINARY = /\.(png|jpe?g|webp|gif|glb|gltf|bin|woff2?|ttf|otf|mp3|wav|ogg|m4a|mp4|webm|ico|gz|zip|pdf|ktx2|hdr|env|dds|wasm|onnx|tflite|task|psd|blend|fbx)$/i;
const SKIP = /(^|\/)(package-lock\.json|yarn\.lock)$|^FEL-full-app\/public\/_prisma\/|^FEL-full-app\/lib\/generated\//;

const SHAPES: Array<[string, RegExp]> = [
  ['Stripe live secret key', /\b[sr]k_live_[0-9A-Za-z]{16,}/],
  ['Stripe webhook secret', /\bwhsec_[0-9A-Za-z]{24,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{36}\b|github_pat_[0-9A-Za-z_]{40,}/],
  ['Slack token', /\bxox[baprs]-[0-9A-Za-z-]{20,}/],
  ['database URL with a password', /postgres(?:ql)?:\/\/[^:@/\s'"`]+:(?!PASSWORD@|\$\{|s3cr)[^@/\s'"`]{12,}@[a-z0-9.-]+\.[a-z]{2,}/i],
];
const ASSIGNED = /(?:secret|token|passw(?:or)?d|api[_-]?key|private[_-]?key|access[_-]?key|client[_-]?secret)[\w-]*["']?\s*[:=]\s*["'`]([A-Za-z0-9+/=_\-.]{24,})["'`]/gi;
const PLACEHOLDER = /placeholder|example|dummy|fake|test|generate|changeme|your[-_]|xxxx|redacted|sample|golden/i;

/** Lines that match on purpose. Path + a fragment of the line; each one is a fixture, not a credential. */
const ALLOW: Array<[RegExp, string]> = [];

function entropy(s: string): number {
  const n = new Map<string, number>();
  for (const c of s) n.set(c, (n.get(c) ?? 0) + 1);
  let h = 0;
  for (const v of n.values()) h -= (v / s.length) * Math.log2(v / s.length);
  return h;
}

/** A private key block with a real body (40+ base64 characters after the header, on the next line or after an escaped \n). */
const PRIVATE_KEY = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----(?:\\n|\s)+[A-Za-z0-9+/]{40,}/g;

export function findSecrets(file: string, text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PRIVATE_KEY)) out.push(`${file}:${text.slice(0, m.index).split('\n').length}: private key block`);
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (ALLOW.some(([re]) => re.test(`${file}:${line}`))) return;
    for (const [name, re] of SHAPES) if (re.test(line) && !PLACEHOLDER.test(line)) out.push(`${file}:${i + 1}: ${name}`);
    for (const m of line.matchAll(ASSIGNED)) {
      const v = m[1];
      if (entropy(v) >= 4.0 && !PLACEHOLDER.test(v) && !PLACEHOLDER.test(line)) out.push(`${file}:${i + 1}: a high-entropy value assigned to a secret-like name`);
    }
  });
  return out;
}

describe('no credential in the tree (QG-06)', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n').filter((f) => f && !BINARY.test(f) && !SKIP.test(f));

  it('reads the whole tree', () => { expect(files.length).toBeGreaterThan(5000); });

  it('no tracked file holds a live key, a private key, a real database password or a high-entropy secret', () => {
    const hits: string[] = [];
    for (const f of files) {
      let text: string;
      try { text = readFileSync(join(REPO, f), 'utf8'); } catch { continue; }
      if (text.length > 4_000_000 || text.includes('\u0000')) continue;
      hits.push(...findSecrets(f, text));
    }
    expect(hits).toEqual([]);
  });

  it('no env file other than .env.example is tracked', () => {
    expect(files.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith('.env.example'))).toEqual([]);
  });

  it('the detector catches what it is for (planted fixtures)', () => {
    const live = ['sk', 'live', '51Hx9QpLkS7dVb2N3mTqR8eYwZ'].join('_');
    expect(findSecrets('x.ts', `const key = '${live}';`)).not.toEqual([]);
    // each planted value is assembled at run time, so this file itself never holds the shape it tests for
    const begin = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
    expect(findSecrets('x.ts', `${begin}\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7`)).not.toEqual([]);
    expect(findSecrets('x.ts', `DATABASE_URL="postgresql://fel_admin:${'Xq9vLp2R'}${'t7Wm'}@db.prod-host.com:5432/fel"`)).not.toEqual([]);
    expect(findSecrets('x.ts', `apiToken: "${'q8Zr3LmV9xT2pW7n'}${'K4sB6yH1cD5fG0jA'}"`)).not.toEqual([]);
    expect(findSecrets('x.ts', `NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"`)).toEqual([]);
    expect(findSecrets('x.ts', `const k = 'sk_live_placeholder';`)).toEqual([]);
  });
});
