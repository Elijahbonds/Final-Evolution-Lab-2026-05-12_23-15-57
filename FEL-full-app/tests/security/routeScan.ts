// What each route file checks, read from its source (QG-06, the pre-launch security review, 2026-10-25).
//
// A static read, not a proof: it finds the CALLS a route makes (a session read, an admin gate, a signature check, a rate
// limit, a schema parse) in the route file and in the lib helpers it imports that are known to make them. It is the
// inventory docs/SECURITY-REVIEW.md is built on, and the guard in route-guard.test.ts: a new route that writes and checks
// nothing fails until a person reviews it and lists it with a reason.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const APP_ROOT = join(__dirname, '../..');

export type AuthKind = 'session' | 'admin' | 'role' | 'secret' | 'signature' | 'dev-only' | 'none';

export interface RouteFacts {
  file: string;            // app/api/x/route.ts
  path: string;            // /api/x
  methods: string[];       // GET POST …
  writes: boolean;         // exports POST, PUT, PATCH or DELETE
  auth: AuthKind[];        // every kind of check found
  rateLimit: boolean;
  validation: boolean;     // a schema parse or an explicit shape check helper
  bodyCap: boolean;        // reads a size cap before or while reading the body
  upload: boolean;         // handles a file or a signed upload URL
  secretCompare: 'timing-safe' | 'plain' | null;
  teenGate: boolean;       // calls one of the age / consent / teen gates (lib/privacy, lib/health, coach teen gate, adult buyer)
}

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Helpers that read the session (each one calls getServerSession on the route's behalf).
const SESSION_HELPERS = [
  'getServerSession', 'currentUser', 'requireUser', 'requireCrmAccess', 'denyUnlessCoachOrAdmin', 'requireCoach',
  'sessionUserId', 'signedInUserId', 'getViewer', 'creatorViewer', 'creatorContext', 'requireCampUser', 'storeBuyer',
  'requireSignedIn', 'withSession', 'coachBusinessViewer', 'currentUserId', 'requirePaidFacilitator', 'viewerId', 'getSessionUserId',
];
const ADMIN = /\brequireAdmin\b|role\s*[!=]==\s*['"]admin['"]|['"]admin['"]\s*[!=]==\s*\w*\.?role|requireCrmAccess|denyUnlessCoachOrAdmin/;
const ROLE = /\.role\b|isCoach\b|requireCoach|coachOf|isGuardian|guardianOf/;
const SECRET = /verify\w*Secret\(|authenticatePartnerKey|process\.env\.[A-Z_]*(SECRET|TOKEN|KEY)[A-Z_]*|CRON_SECRET|authorization['"]?\)/i;
const SIGNATURE = /webhooks\.constructEvent|constructEventAsync|verifySignature|stripe-signature/;
const DEV_ONLY = /NODE_ENV\s*!==\s*['"]development['"]|devOnly\(\)/;
const RATE = /rateLimit|RateLimit|checkRateLimits|hitBucket|finishRateLimit|runRateLimit|limitRefusal|tooMany|429/;
const VALIDATION = /\.safeParse\(|\.parse\(\s*(?:body|json|await)|z\.object|parseBody|validate[A-Z]\w*\(|isValid\w*\(|boundFormSummary|normalize\w*\(/;
const BODY_CAP = /content-length|MAX_BODY|maxBytes|bodyLimit|readCappedJson|\.length\s*>\s*\d{4,}|byteLength/i;
const UPLOAD = /formData\(\)|getSignedUrl|signedUrl|createSignedUploadUrl|presign|multipart|uploadUrl/i;
const SECRET_CMP_SAFE = /timingSafeEqual|safeEqual|constantTime|verify\w*Secret\(|authenticatePartnerKey/;
const TEEN_GATE = /\b(canWrite\w+|refuse\w+Write|scanSave\w*|teen\w*Gate\w*|isVerifiedAdult\w*|adultBuyerGate|verifiedAdult\w*|needsGuardian\w*|guardianGate|isMinor\w*|u13LockLog|ageScreen\w*|teenUploadGate)\b/;
const SECRET_CMP_PLAIN = /(?:SECRET|TOKEN|KEY)[A-Z_]*\s*(?:!==|===)|(?:!==|===)\s*process\.env\.[A-Z_]*(?:SECRET|TOKEN|KEY)|`Bearer \$\{process\.env/;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === 'route.ts') out.push(p);
  }
}

export function routeFiles(root = APP_ROOT): string[] {
  const out: string[] = [];
  walk(join(root, 'app'), out);
  return out.map((p) => relative(root, p).split('\\').join('/')).sort();
}

export function routePath(file: string): string {
  return '/' + file.replace(/^app\//, '').replace(/\/route\.ts$/, '').replace(/\([^/]+\)\//g, '');
}

export function scanSource(file: string, src: string): RouteFacts {
  const methods = [...src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/g)]
    .map((m) => m[1] ?? m[2]);
  for (const list of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const m of list[1].matchAll(/(?:\w+\s+as\s+)?\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)) methods.push(m[1]);
  }
  const uniq = [...new Set(methods)];
  const auth: AuthKind[] = [];
  if (SESSION_HELPERS.some((h) => new RegExp(`\\b${h}\\b`).test(src))) auth.push('session');
  if (ADMIN.test(src)) auth.push('admin');
  if (ROLE.test(src)) auth.push('role');
  if (SECRET.test(src)) auth.push('secret');
  if (SIGNATURE.test(src)) auth.push('signature');
  if (DEV_ONLY.test(src)) auth.push('dev-only');
  if (!auth.length) auth.push('none');
  return {
    file, path: routePath(file), methods: uniq, writes: uniq.some((m) => WRITE.has(m)), auth,
    rateLimit: RATE.test(src), validation: VALIDATION.test(src), bodyCap: BODY_CAP.test(src), upload: UPLOAD.test(src),
    secretCompare: SECRET_CMP_SAFE.test(src) ? 'timing-safe' : SECRET_CMP_PLAIN.test(src) ? 'plain' : null,
    teenGate: TEEN_GATE.test(src),
  };
}

export function scanAll(root = APP_ROOT): RouteFacts[] {
  return routeFiles(root).map((f) => scanSource(f, readFileSync(join(root, f), 'utf8')));
}

// ── the inventory table in docs/SECURITY-REVIEW.md ─────────────────────────────────────────────────────────────────
export const DOC = 'docs/SECURITY-REVIEW.md';
export const INVENTORY_START = '<!-- route-inventory:start (generated: npx tsx tests/security/inventory.ts --write) -->';
export const INVENTORY_END = '<!-- route-inventory:end -->';

/**
 * Write routes a person reviewed and found need no session: each one says what stands in for it. The guard
 * (route-guard.test.ts) fails on a write route that checks nothing and is not here.
 */
export const REVIEWED_PUBLIC_WRITES: Record<string, string> = {
  '/api/auth/[...nextauth]': 'NextAuth itself; the credentials POST is rate limited per email and trusted address (lib/rate-limits/login.ts)',
  '/api/signup': 'creates the account; zod-validated, rate limited per email (DB) and per address (memory, S-01)',
  '/api/guest': 'mints a guest cookie; refuses an age-blocked browser. Unlimited row creation: finding S-07',
  '/api/marketing/subscribe': 'closed unless NEXT_PUBLIC_JOIN_LAB_ENABLED; validated and rate limited per address',
  '/api/creator/inquiry': 'a contact form; rate limited per address in lib/creator (submitInquiry)',
  '/api/telemetry/crash': 'logs one bounded line per crash report; writes nothing. Unlimited: finding S-08',
  '/api/controller-link/rooms': 'a room for the phone-as-controller link; zod-validated, 6-character codes (887M), 2 h TTL. Finding S-06',
  '/api/controller-link/signal': 'WebRTC signalling inside a room; zod-validated, 200 messages a room. Finding S-06',
  '/api/coach-store/unlock/redeem': 'a teen redeems a 72-bit code bound to one device; the code is the credential (hash lookup)',
  '/api/coach-store/unlock/status': 'reads the same code + device pair; answers only active/inactive',
};

export function inventoryRow(r: RouteFacts): string {
  const auth = r.auth.filter((a) => a !== 'none').join(' + ') || (REVIEWED_PUBLIC_WRITES[r.path] ? 'public (reviewed)' : r.writes ? '**NONE**' : 'public read');
  const yes = (b: boolean) => (b ? 'yes' : '·');
  return `| \`${r.path}\` | ${r.methods.join(' ') || '—'} | ${auth} | ${yes(r.teenGate)} | ${yes(r.rateLimit)} | ${yes(r.validation)} | ${r.upload ? 'upload' : '·'} |`;
}

export function inventoryTable(rows: RouteFacts[]): string {
  return [
    INVENTORY_START,
    '',
    `${rows.length} route files (${rows.filter((r) => r.path.startsWith('/api/')).length} under /api). Columns are what the route FILE calls (tests/security/routeScan.ts); a check made inside a lib helper the route calls is not seen here, which is why the findings above were read by hand.`,
    '',
    '| Route | Methods | Auth | Age/consent gate | Rate limit | Validation | Upload |',
    '|---|---|---|---|---|---|---|',
    ...rows.map(inventoryRow),
    '',
    INVENTORY_END,
  ].join('\n');
}
