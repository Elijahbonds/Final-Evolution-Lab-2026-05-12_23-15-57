'use client';
// The party's words (PARTY-CHAT lane, 2026-10-13): the feed, quick chat, emotes and — for verified adults — typed chat.
//
// Teens (and guests, and anyone whose age is unknown) see presets and emotes only. The composer is not drawn for them,
// but that is courtesy: the SERVER refuses their typed text (server/netd/src/party.ts p_chat) and never delivers anyone's
// typed text to them. Adults' text is capped at CHAT_MAX_LEN and masked against the in-repo profanity list on the server;
// the same mask runs here only so you see what the party will see before you send it.
//
// The feed is a log with aria-live: a screen reader hears each new line, and every emote is announced in words.
import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { partyClient } from '@/lib/party/social/client';
import { QUICK_CHAT, EMOTES, CHAT_MAX_LEN, maskProfanity } from '@/server/netd/src/partyRules';
import type { PartyState } from '@/lib/party/social/state';

export function ChatSection({ s }: { s: PartyState }) {
  const c = partyClient();
  const [text, setText] = useState('');
  const feedRef = useRef<HTMLOListElement>(null);
  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight }); }, [s.feed.length]);
  const preview = maskProfanity(text.trim());
  const send = () => {
    const t = text.trim();
    if (!t || t.length > CHAT_MAX_LEN) return;
    if (c.chat(t)) setText('');
  };
  return (
    <section aria-label="Party chat" className="space-y-2">
      <h3 className="font-mono text-[10px] tracking-[0.25em] text-white/45">CHAT</h3>
      <ol
        ref={feedRef}
        role="log"
        aria-live="polite"
        aria-label="Party messages"
        data-testid="party-feed"
        className="max-h-56 min-h-[4rem] space-y-1 overflow-y-auto rounded-lg bg-black/30 p-2 text-sm"
      >
        {s.feed.length === 0 ? <li className="text-xs text-white/35">Nothing yet. Say hi! Messages aren&apos;t saved — they&apos;re gone when you leave.</li> : null}
        {s.feed.map((f) => (
          <li key={f.key} data-kind={f.kind} className={f.kind === 'system' ? 'text-xs italic text-white/45' : ''}>
            {f.kind === 'system' ? f.text : (
              <>
                <span className={`font-bold ${f.self ? 'text-[#00E5FF]' : 'text-white/85'}`}>{f.self ? 'You' : f.name}: </span>
                {f.kind === 'emote' ? (
                  <span><span aria-hidden className="text-lg leading-none">{f.glyph}</span> <span className="text-white/60">{f.text}</span></span>
                ) : (
                  <span className={f.kind === 'quick' ? 'text-[#facc15]' : 'text-white/90'}>{f.text}</span>
                )}
              </>
            )}
          </li>
        ))}
      </ol>

      <div role="group" aria-label="Quick chat" className="flex flex-wrap gap-1.5">
        {QUICK_CHAT.map((q) => (
          <button key={q.id} type="button" data-testid={`party-quick-${q.id}`} onClick={() => c.quick(q.id)}
            className="rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-xs text-white/85 hover:border-white/40">
            {q.text}
          </button>
        ))}
      </div>
      <div role="group" aria-label="Emotes" className="flex flex-wrap gap-1">
        {EMOTES.map((e) => (
          <button key={e.id} type="button" data-testid={`party-emote-${e.id}`} onClick={() => c.emote(e.id)} aria-label={`Send emote: ${e.label}`} title={e.label}
            className="rounded-lg px-1.5 py-1 text-xl leading-none hover:bg-white/10">
            <span aria-hidden>{e.glyph}</span>
          </button>
        ))}
      </div>

      {s.rights.text ? (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label className="sr-only" htmlFor="party-chat-input">Message the party</label>
          <input
            id="party-chat-input"
            data-testid="party-chat-input"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, CHAT_MAX_LEN))}
            maxLength={CHAT_MAX_LEN}
            placeholder="Message the party"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#00E5FF]/60"
          />
          <button type="submit" data-testid="party-chat-send" aria-label="Send message" disabled={!text.trim()} className="rounded-lg bg-[#00E5FF] px-3 text-black disabled:opacity-40">
            <Send className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <p data-testid="party-text-locked" className="text-xs text-white/45">Typed chat is for verified 18+ accounts. Quick chat and emotes work for everyone.</p>
      )}
      {s.rights.text && preview !== text.trim() && text.trim() ? <p className="text-[11px] text-white/40">The party will see: {preview}</p> : null}
      {s.rights.text ? <p className="text-[11px] text-white/35">{text.length}/{CHAT_MAX_LEN} · typed chat reaches 18+ members only</p> : null}
    </section>
  );
}
