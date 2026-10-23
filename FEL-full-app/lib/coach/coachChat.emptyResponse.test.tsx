// COACH-AI resilience: a successful provider response with no usable bytes must still resolve the pending assistant
// bubble into a clear retry line. The route can return an empty stream if the upstream closes cleanly without content.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findAll, textOf, settle } from '@/tests/helpers/driveRender';
import { mount } from '@/tests/helpers/hookRuntime';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const { hookedReact } = await import('@/tests/helpers/hookRuntime');
  return hookedReact(actual);
});

const ai = vi.hoisted(() => ({ state: 'available' as 'loading' | 'available' | 'coming_soon', mark: vi.fn() }));
vi.mock('@/lib/abacus/useAiStatus', () => ({ useAiStatus: () => [ai.state, ai.mark] }));

import { CoachChat } from '@/app/coach/_components/coach-chat';

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  ai.state = 'available';
  ai.mark = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const starters = (tree: unknown) =>
  findAll(tree as never, (el) => el.type === 'button' && el.props['data-test-ignore'] === 'sends-chat-message');

async function drain() {
  await settle();
  await settle();
  await settle();
}

describe('CoachChat empty provider responses', () => {
  it('turns a 200 with no body into a retry line, not a blank assistant bubble', async () => {
    fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const chat = mount(() => CoachChat());
    starters(chat.tree)[0].props.onClick();
    await drain();

    const text = textOf(chat.tree as never);
    expect(text).toContain("Sorry, I'm having trouble connecting right now. Try again in a moment.");
    expect(text).not.toContain('Coach is thinking...');
    chat.unmount();
  });

  it('turns an empty stream into the same retry line', async () => {
    fetchSpy = vi.fn(async () => new Response(new ReadableStream({ start(c) { c.close(); } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const chat = mount(() => CoachChat());
    starters(chat.tree)[0].props.onClick();
    await drain();

    const text = textOf(chat.tree as never);
    expect(text).toContain("Sorry, I'm having trouble connecting right now. Try again in a moment.");
    expect(text).not.toContain('Coach is thinking...');
    chat.unmount();
  });
});
