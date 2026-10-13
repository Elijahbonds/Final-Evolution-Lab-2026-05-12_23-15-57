// fel-netd — the PSN-style party's shared rules (PARTY-CHAT lane, 2026-10-13).
//
// One file both sides read: netd ENFORCES these (party.ts), and the app imports the same file to draw its quick-chat
// buttons, emotes, caps and the profanity preview, so a button the client shows is always one the server accepts.
//
// IMPORT-FREE ON PURPOSE. The app's webpack resolves this file through `@/server/netd/src/partyRules`, and netd's own
// ESM build needs `.js` extensions on relative imports that webpack would not map back to `.ts`. So nothing here
// imports anything; the one number it shares with room.ts (the six-player cap) is pinned equal by a test instead.
//
// Owner, 2026-10-09 (PSN-style party): voice + text with quick-chat + emotes, no video; up to 6 (netd MAX_PLAYERS);
// teens (under 18 or unknown age) get NO voice and NO free text — presets and emotes only, enforced server-side.

/** The party cap. Equal to room.ts MAX_PLAYERS (tests/party-chat/netd-party.test.ts pins it). */
export const PARTY_MAX = 6;

/** The join-code alphabet: lib/controller-link/codes.ts CODE_ALPHABET (no 0/O/1/I/L), pinned equal by a test. */
export const PARTY_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const PARTY_CODE_LEN = 6;

/** A typed / pasted party code → the code, or null. Forgiving on case, spaces, dashes and a pasted /party/<code> link. */
export function parsePartyCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const link = /\/party\/([A-Za-z0-9-]+)/.exec(raw);
  const code = (link ? link[1] : raw).toUpperCase().replace(/[\s-]+/g, '');
  if (code.length !== PARTY_CODE_LEN) return null;
  for (const c of code) if (!PARTY_CODE_ALPHABET.includes(c)) return null;
  return code;
}

// ── limits ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Longest free-text message (characters, after trimming). */
export const CHAT_MAX_LEN = 200;
/** Largest party frame the server reads at all (an SDP offer with a few codecs is ~4–6 KB). */
export const PARTY_FRAME_MAX_BYTES = 16_000;
/** A member whose socket dropped keeps their place (and the host keeps the crown) this long: a page reload rejoins. */
export const RESUME_GRACE_MS = 30_000;
/** How long the "Joining X…" countdown runs before everyone who did not cancel is pulled in. */
export const START_COUNTDOWN_MS = 5_000;
/** A knock (waiting to be let in) is dropped after this long. */
export const KNOCK_TTL_MS = 120_000;
/** At most this many people may wait at the door at once. */
export const KNOCK_MAX = 4;

/** Token buckets: `burst` at once, refilled to `burst` over `perMs`. Per member, per kind. */
export const RATE = {
  chat: { burst: 5, perMs: 10_000 },
  quick: { burst: 8, perMs: 10_000 },
  control: { burst: 10, perMs: 10_000 },
  // a voice join trickles ~10–20 ICE candidates per peer, and a mesh of six has five peers
  signal: { burst: 200, perMs: 10_000 },
  status: { burst: 10, perMs: 10_000 },
} as const;
export type RateKind = keyof typeof RATE;

export interface Bucket { tokens: number; at: number }

/** Take one token, refilling first. Pure apart from mutating the bucket it is handed. */
export function takeToken(b: Bucket, kind: RateKind, now: number): boolean {
  const { burst, perMs } = RATE[kind];
  const refill = ((now - b.at) / perMs) * burst;
  b.tokens = Math.min(burst, b.tokens + Math.max(0, refill));
  b.at = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

export function freshBucket(kind: RateKind, now: number): Bucket {
  return { tokens: RATE[kind].burst, at: now };
}

// ── quick chat and emotes: what EVERYONE may say ──────────────────────────────────────────────────────────────────────

export interface QuickLine { id: string; text: string }

/** Preset lines. The only words a teen account can put in a party. Short, kind, game-shaped. */
export const QUICK_CHAT: readonly QuickLine[] = [
  { id: 'hi', text: 'Hey!' },
  { id: 'gg', text: 'GG!' },
  { id: 'nice', text: 'Nice one!' },
  { id: 'ready', text: "I'm ready" },
  { id: 'one_more', text: 'One more?' },
  { id: 'brb', text: 'Be right back' },
  { id: 'lets_go', text: "Let's go!" },
  { id: 'good_luck', text: 'Good luck!' },
  { id: 'well_played', text: 'Well played' },
  { id: 'thanks', text: 'Thanks!' },
  { id: 'oops', text: 'Oops!' },
  { id: 'bye', text: 'Gotta go — bye!' },
];

export interface Emote { id: string; glyph: string; label: string }

/** Emotes. `label` is what a screen reader and the caption line say. */
export const EMOTES: readonly Emote[] = [
  { id: 'fire', glyph: '🔥', label: 'Fire' },
  { id: 'clap', glyph: '👏', label: 'Applause' },
  { id: 'laugh', glyph: '😂', label: 'Laughing' },
  { id: 'wow', glyph: '😮', label: 'Wow' },
  { id: 'thumbs', glyph: '👍', label: 'Thumbs up' },
  { id: 'hundred', glyph: '💯', label: 'One hundred' },
  { id: 'flex', glyph: '💪', label: 'Flex' },
  { id: 'trophy', glyph: '🏆', label: 'Trophy' },
];

export const quickLine = (id: unknown): QuickLine | null => QUICK_CHAT.find((q) => q.id === id) ?? null;
export const emoteById = (id: unknown): Emote | null => EMOTES.find((e) => e.id === id) ?? null;

// ── reports ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Why a member may report someone. Fixed ids: nothing typed rides along with a report. */
export const REPORT_REASONS: readonly { id: string; label: string }[] = [
  { id: 'harassment', label: 'Bullying or harassment' },
  { id: 'hate', label: 'Hate or slurs' },
  { id: 'sexual', label: 'Sexual talk' },
  { id: 'threat', label: 'Threats or danger' },
  { id: 'cheating', label: 'Cheating' },
  { id: 'other', label: 'Something else' },
];
export const REPORT_REASON_IDS = REPORT_REASONS.map((r) => r.id);

// ── "Start together": the modes a party can be pulled into ───────────────────────────────────────────────────────────

/**
 * Modes with a real `?net=<room>` seat today (lib/net/attach.ts attachNetplay call sites). `guestPeer` is the peer id the
 * mode reads its remote human from (OneVOneMode sourceFor('foe'), ThreeVThreeMode 'net1', KarateEndlessMode 'partner'),
 * so the second seat must connect under that id. Each seats TWO humans today; the rest of the party stays in the party.
 */
export interface OnlineMode { id: string; title: string; path: string; humans: number; guestPeer: string }

export const ONLINE_MODES: readonly OnlineMode[] = [
  { id: 'onevone', title: '1v1 Streetball', path: '/play/onevone', humans: 2, guestPeer: 'foe' },
  { id: 'threevthree', title: '3v3', path: '/play/threevthree', humans: 2, guestPeer: 'net1' },
  { id: 'karate', title: 'Karate Endless (co-op)', path: '/play/karate', humans: 2, guestPeer: 'partner' },
];

export const onlineMode = (id: unknown): OnlineMode | null => ONLINE_MODES.find((m) => m.id === id) ?? null;

// ── names ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The jersey plate rule (lib/closet/wearable-catalog.ts sanitizeJersey): A–Z 0–9 space hyphen, 12, upper case. */
export function cleanPartyName(raw: unknown): string {
  const s = String(typeof raw === 'string' ? raw : '').trim().toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 12).trim();
  return s.replace(/\s{2,}/g, ' ');
}

// ── profanity mask (adults' free text) ──────────────────────────────────────────────────────────────────────────────
//
// An in-repo list (no dependency). Adults may swear mildly ("damn", "hell" pass); strong profanity and slurs are masked
// with asterisks, server-side, before anyone receives the line. Matching is per word, after folding case and
// look-alike characters (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s, !→i) and, as a second try, collapsing repeated letters
// ("fuuuck"). STEMS match the start of a word ("fucking"); WORDS match a whole word only, so "assist" and "cockpit"
// stay clean. Spaced-out letters ("f u c k") are not caught — noted, not claimed.

const STEMS = [
  'fuck', 'fuk', 'fck', 'motherf', 'shit', 'sht', 'bitch', 'cunt', 'asshole', 'bastard', 'whore', 'slut', 'twat',
  'wank', 'pussy', 'dickhead', 'cocksuck', 'nigg', 'faggot', 'retard', 'tranny', 'wetback', 'raghead', 'towelhead',
];
const WORDS = [
  'ass', 'asses', 'arse', 'dick', 'dicks', 'cock', 'cocks', 'cum', 'jizz', 'fag', 'fags', 'chink', 'chinks', 'spic',
  'spics', 'kike', 'kikes', 'gook', 'gooks', 'coon', 'coons', 'dyke', 'dykes', 'beaner', 'beaners', 'nazi', 'rape',
  'rapist', 'kys',
];
/** Real words a stem would otherwise catch. */
const ALLOW = new Set(['niggle', 'niggles', 'niggling', 'shitake', 'shiitake']);

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '|': 'l' };
const fold = (w: string): string => [...w.toLowerCase()].map((c) => LEET[c] ?? c).join('').replace(/[^a-z]/g, '');
const collapse = (w: string): string => w.replace(/(.)\1+/g, '$1');
const STEMS_C = STEMS.map(collapse);
const WORDS_C = WORDS.map(collapse);

/** Is this one word (as typed) on the list? */
export function isProfane(word: string): boolean {
  const f = fold(word);
  if (!f || ALLOW.has(f)) return false;
  const c = collapse(f);
  if (STEMS.some((s) => f.startsWith(s)) || STEMS_C.some((s) => c.startsWith(s))) return true;
  return WORDS.includes(f) || WORDS_C.includes(c);
}

/** The line with every listed word replaced by asterisks of the same length. */
export function maskProfanity(text: string): string {
  // a "word" here includes the look-alike characters, so "sh1t" and "@ss" are one word, not two
  return text.replace(/[A-Za-z0-9@$!|]+/g, (w) => (isProfane(w) ? '*'.repeat(w.length) : w));
}

/** Free text as the server relays it: whitespace folded, control characters out, capped, masked. Null = nothing left. */
export function cleanChatText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (s.length > CHAT_MAX_LEN) return null;   // refused, not cut: the client caps the box, so this is a modified client
  return maskProfanity(s);
}
