// PARTY-CHAT (2026-10-13), P5: what a screen reader and a teen account get from the party UI, rendered for real.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatSection } from '@/components/party/social/party-chat';
import { VoiceSection } from '@/components/party/social/party-voice';
import { EMPTY_PARTY, type PartyState } from '@/lib/party/social/state';
import { EMOTES, QUICK_CHAT } from '@/server/netd/src/partyRules';

const state = (adult: boolean): PartyState => ({
  ...EMPTY_PARTY, status: 'live', code: 'ABC234', you: 'm1', host: 'm1', rights: { text: adult, voice: adult },
  members: [{ peer: 'm1', name: 'ANA', pub: 'p1', host: true, connected: true, voice: false, muted: false, deafened: false, activity: null }],
  feed: [{ key: 'k', kind: 'emote', from: 'm2', name: 'BO', text: 'Applause', glyph: '👏', self: false, at: 1 }],
});

describe('the party UI, for a screen reader', () => {
  it('the feed is a polite live log, and an emote is read as words', () => {
    const html = renderToStaticMarkup(<ChatSection s={state(true)} />);
    expect(html).toMatch(/role="log"[^>]*aria-live="polite"|aria-live="polite"[^>]*role="log"/);
    expect(html).toContain('Applause');
    expect(html).toMatch(/<span aria-hidden="true" class="[^"]*">👏<\/span>/);
  });
  it('every emote button says what it sends; every quick-chat line is its own text', () => {
    const html = renderToStaticMarkup(<ChatSection s={state(true)} />);
    for (const e of EMOTES) expect(html).toContain(`aria-label="Send emote: ${e.label}"`);
    for (const q of QUICK_CHAT) expect(html).toContain(`>${q.text.replace(/'/g, '&#x27;')}</button>`);
    expect(html).toContain('<label class="sr-only" for="party-chat-input">Message the party</label>');
  });
});

describe('the party UI, for a teen account', () => {
  it('no typed-chat box and no voice — quick chat and emotes only', () => {
    const chat = renderToStaticMarkup(<ChatSection s={state(false)} />);
    expect(chat).not.toContain('party-chat-input');
    expect(chat).toContain('data-testid="party-text-locked"');
    expect(chat).toContain('data-testid="party-quick-gg"');
    const voice = renderToStaticMarkup(<VoiceSection s={state(false)} />);
    expect(voice).not.toContain('party-voice-join');
    expect(voice).toContain('data-testid="party-voice-locked"');
  });
  it('an adult gets both', () => {
    expect(renderToStaticMarkup(<ChatSection s={state(true)} />)).toContain('party-chat-input');
    expect(renderToStaticMarkup(<VoiceSection s={state(true)} />)).toContain('party-voice-join');
  });
});
