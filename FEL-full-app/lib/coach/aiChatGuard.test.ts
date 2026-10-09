// COACH-AI Phase 8 (2026-10-07): the AI coach's input allowlist, caps and data minimisation, pure.
import { describe, expect, it } from 'vitest';
import {
  AI_CHAT_MAX_CHARS, AI_CHAT_MAX_MESSAGES, AI_CHAT_TOP_EXERCISES, catalogueText, chatRefusal, lastTurnsForRequest,
  parseChatBody, relevantAttributes, sanitizeChatMessages, weakestAttribute, type CatalogueRow,
} from './aiChatGuard';
import { liveAiShare, AI_SHARE_SCOPE } from './aiChatAccess';

const attrs = { strength: 70, speed: 60, endurance: 55, agility: 65, power: 40, flexibility: 50, recovery: 80, mental: 75 };

describe('sanitizeChatMessages', () => {
  it('keeps only { role, content } of user/assistant turns', () => {
    const r = sanitizeChatMessages([{ role: 'user', content: 'a', name: 'x' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }]);
    expect(r).toEqual({ ok: true, messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }] });
  });

  it.each([
    ['system role', [{ role: 'system', content: 'x' }, { role: 'user', content: 'y' }], 'bad_role'],
    ['developer role', [{ role: 'developer', content: 'x' }, { role: 'user', content: 'y' }], 'bad_role'],
    ['no role', [{ content: 'y' }], 'bad_role'],
    ['null turn', [null], 'bad_role'],
    ['array content', [{ role: 'user', content: ['x'] }], 'bad_content'],
    ['blank content', [{ role: 'user', content: '   ' }], 'bad_content'],
    ['not an array', 'hi', 'no_messages'],
    ['ends on assistant', [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], 'last_turn_not_user'],
  ])('%s → %s', (_n, input, error) => {
    expect(sanitizeChatMessages(input)).toEqual({ ok: false, error });
  });

  it('the count cap is exact', () => {
    const turns = (n: number) => Array.from({ length: n }, (_, i) => ({ role: i % 2 === (n - 1) % 2 ? 'user' : 'assistant', content: 'x' }));
    expect(sanitizeChatMessages(turns(AI_CHAT_MAX_MESSAGES)).ok).toBe(true);
    expect(sanitizeChatMessages(turns(AI_CHAT_MAX_MESSAGES + 1))).toEqual({ ok: false, error: 'too_many_messages' });
  });

  it('the length cap is exact', () => {
    expect(sanitizeChatMessages([{ role: 'user', content: 'x'.repeat(AI_CHAT_MAX_CHARS) }]).ok).toBe(true);
    expect(sanitizeChatMessages([{ role: 'user', content: 'x'.repeat(AI_CHAT_MAX_CHARS + 1) }])).toEqual({ ok: false, error: 'message_too_long' });
  });

  it('parseChatBody refuses bad JSON', () => {
    expect(parseChatBody('{')).toEqual({ ok: false, error: 'invalid_json' });
    expect(parseChatBody('null')).toEqual({ ok: false, error: 'no_messages' });
  });
});

describe('lastTurnsForRequest (the client side of the caps)', () => {
  it('sends at most the newest AI_CHAT_MAX_MESSAGES turns, each within the length cap, and the server accepts them', () => {
    const long = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i} ${'y'.repeat(i === 28 ? 5000 : 10)}` }));
    long.push({ role: 'user', content: 'last' });
    const sent = lastTurnsForRequest(long);
    expect(sent.length).toBe(AI_CHAT_MAX_MESSAGES);
    expect(sent.at(-1)).toEqual({ role: 'user', content: 'last' });
    expect(sent.every((t) => t.content.length <= AI_CHAT_MAX_CHARS)).toBe(true);
    expect(sanitizeChatMessages(sent).ok).toBe(true);
  });

  it('drops the empty assistant placeholder the chat shows while it streams', () => {
    expect(lastTurnsForRequest([{ role: 'user', content: 'a' }, { role: 'assistant', content: '' }])).toEqual([{ role: 'user', content: 'a' }]);
  });
});

describe('relevantAttributes', () => {
  it.each([
    ['How do I jump higher?', ['power']],
    ['help my vertical', ['power']],
    ['first step quickness, I want to be faster', ['speed']],
    ['my hamstrings are tight', ['flexibility']],
    ['I sleep badly', ['recovery']],
    ['strong and fast and explosive', ['strength', 'speed']],
  ])('%s → %j', (q, want) => {
    expect(relevantAttributes(attrs, q)).toEqual(want);
  });

  it('nothing named → the weakest one only', () => {
    expect(relevantAttributes(attrs, 'what should I do today')).toEqual(['power']);
    expect(weakestAttribute(attrs)).toBe('power');
  });

  it('whole words only ("cutting" yes, "execute" no)', () => {
    expect(relevantAttributes(attrs, 'execute the plan')).toEqual(['power']);
    expect(relevantAttributes(attrs, 'cutting drills')).toEqual(['agility']);
  });

  it('a missing or non-numeric attribute reads as 0 (weakest), never throws', () => {
    expect(relevantAttributes({ ...attrs, mental: Number.NaN }, '')).toEqual(['mental']);
  });
});

describe('catalogueText', () => {
  const row = (i: number): CatalogueRow => ({ name: `E${i}`, phase: 1, chapter: 2, bounceLevel: 'foundation', targetPrqStat: 'power', dosage: '3x5', coachingCues: 'c'.repeat(900), regressions: 'r', videoUrl: '', category: null });
  it(`at most ${AI_CHAT_TOP_EXERCISES} entries, cues clipped`, () => {
    const t = catalogueText(Array.from({ length: 20 }, (_, i) => row(i)));
    expect(t.match(/^\[/gm)?.length).toBe(AI_CHAT_TOP_EXERCISES);
    expect(t).not.toContain('c'.repeat(300));
  });
});

describe('chatRefusal', () => {
  it('names the two 403s, the 429 and the caps', () => {
    expect(chatRefusal(403, 'ai_coach_adults_only').kind).toBe('adults_only');
    expect(chatRefusal(403, 'ai_share_consent_required').kind).toBe('consent');
    expect(chatRefusal(429, 'rate_limited').kind).toBe('rate');
    expect(chatRefusal(400, 'message_too_long').text).toContain(String(AI_CHAT_MAX_CHARS));
    expect(chatRefusal(500, 'x').kind).toBe('other');
  });
});

describe('liveAiShare', () => {
  const at = (d: string) => new Date(d);
  it('newest un-revoked row of the AI scope; other scopes and revoked rows do not count', () => {
    expect(liveAiShare([])).toBeNull();
    expect(liveAiShare([{ scope: 'health_data', grantedAt: at('2026-10-01'), revokedAt: null }])).toBeNull();
    expect(liveAiShare([{ scope: AI_SHARE_SCOPE, grantedAt: at('2026-10-01'), revokedAt: at('2026-10-02') }])).toBeNull();
    const regrant = { scope: AI_SHARE_SCOPE, grantedAt: at('2026-10-03'), revokedAt: null };
    expect(liveAiShare([{ scope: AI_SHARE_SCOPE, grantedAt: at('2026-10-01'), revokedAt: at('2026-10-02') }, regrant])).toBe(regrant);
  });
});
