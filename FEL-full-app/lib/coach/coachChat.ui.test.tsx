// COACH-AI Phase 8 (2026-10-07): the Coach tab's chat sends only what the hardened route accepts. No DOM here
// (tests/helpers/driveRender.ts): the request a starter makes is read off the fetch spy.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drive, findAll, settle } from '@/tests/helpers/driveRender';
import { AI_CHAT_MAX_CHARS, sanitizeChatMessages } from './aiChatGuard';

const ai = vi.hoisted(() => ({ state: 'available' as 'loading' | 'available' | 'coming_soon', mark: vi.fn() }));
vi.mock('@/lib/abacus/useAiStatus', () => ({ useAiStatus: () => [ai.state, ai.mark] }));

import { CoachChat } from '@/app/coach/_components/coach-chat';

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  ai.state = 'available';
  fetchSpy = vi.fn(async () => new Response(JSON.stringify({ error: 'ai_share_consent_required' }), { status: 403 }));
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

const starters = (tree: any) => findAll(tree, (el) => el.type === 'button' && el.props['data-test-ignore'] === 'sends-chat-message');

describe('CoachChat', () => {
  it('the box is capped at the server\'s per-turn length', () => {
    const { tree } = drive(() => CoachChat());
    const box = findAll(tree, (el) => el.type === 'textarea')[0];
    expect(box.props.maxLength).toBe(AI_CHAT_MAX_CHARS);
  });

  it('a starter posts one user turn that the server allowlist accepts (no empty assistant placeholder, no extra fields)', async () => {
    drive(() => CoachChat(), [(tree) => starters(tree)[0].props.onClick()]);
    await settle();
    await settle();
    const call = fetchSpy.mock.calls.find((c) => String(c[0]) === '/api/coach/chat');
    expect(call).toBeTruthy();
    const body = JSON.parse(String((call![1] as RequestInit).body));
    expect(body.messages).toEqual([{ role: 'user', content: 'Build me a warm-up routine for today' }]);
    expect(sanitizeChatMessages(body.messages).ok).toBe(true);
  });

  it('a consent refusal does not mark the AI as coming soon', async () => {
    drive(() => CoachChat(), [(tree) => starters(tree)[0].props.onClick()]);
    await settle();
    await settle();
    expect(ai.mark).not.toHaveBeenCalled();
  });
});
