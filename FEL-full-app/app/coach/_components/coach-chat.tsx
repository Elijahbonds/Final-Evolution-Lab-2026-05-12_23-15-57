'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Sparkles, RotateCcw } from 'lucide-react';
import { AiDisclosure } from '@/components/ai-disclosure';
import { AiComingSoon } from '@/components/ai-coming-soon';
import { isComingSoonResponse } from '@/lib/abacus/aiStatus';
import { useAiStatus } from '@/lib/abacus/useAiStatus';
// COACH-AI Phase 8 (2026-10-07): the reply is read line by line across chunks (plan item #11), only the last turns
// are sent within the server's caps, and a refusal (adults only, AI-sharing consent, rate, caps) says what it is.
import { readReplyStream } from '@/lib/coach/chatStream';
import { AI_CHAT_MAX_CHARS, AI_SHARE_COPY, chatRefusal, lastTurnsForRequest } from '@/lib/coach/aiChatGuard';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const STARTERS = [
  'Build me a warm-up routine for today',
  'What exercises improve my weakest stat?',
  'Explain the Throw-Catch methodology',
  'How do I progress to more advanced drills?',
];

export function CoachChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // ABACUS-KILL: nothing goes to /api/coach/chat unless /api/ai/status says the Coach is available.
  const [ai, markComingSoon] = useAiStatus('coach');
  // COACH-AI: the server's refusals that change what the chat shows. 'consent' holds the message to send once agreed.
  const [gate, setGate] = useState<null | 'adults_only' | { consent: string }>(null);
  const [consentBusy, setConsentBusy] = useState(false);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const replaceLast = (content: string) => setMessages((prev) => {
    const copy = [...prev];
    copy[copy.length - 1] = { role: 'assistant', content };
    return copy;
  });

  const sendMessage = async (text: string) => {
    if (!text.trim() || streaming || ai !== 'available' || gate === 'adults_only') return;
    const userMsg: Message = { role: 'user', content: text.trim().slice(0, AI_CHAT_MAX_CHARS) };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput('');
    setStreaming(true);

    // Add empty assistant message for streaming
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: lastTurnsForRequest(allMessages) }),
      });

      if (await isComingSoonResponse(res)) {
        markComingSoon();
        return;
      }

      if (!res.ok) {
        const err = (await res.json().catch(() => null))?.error;
        const refusal = chatRefusal(res.status, err);
        if (refusal.kind === 'adults_only') {
          setGate('adults_only');
          setMessages(messages);
        } else if (refusal.kind === 'consent') {
          // nothing was sent: take the turn back off the screen and hold it until the athlete agrees (or not)
          setGate({ consent: userMsg.content });
          setMessages(messages);
        } else {
          replaceLast(refusal.text);
        }
        return;
      }

      if (!res.body) return;
      const fullText = await readReplyStream(res.body, replaceLast);

      // If no text was extracted from SSE, the response might be raw text
      if (!fullText) replaceLast('Coach Bonds is thinking... try again.');
    } catch {
      replaceLast('Connection error. Please try again.');
    } finally {
      setStreaming(false);
    }
  };

  const agreeAndSend = async () => {
    if (!gate || gate === 'adults_only' || consentBusy) return;
    const pending = gate.consent;
    setConsentBusy(true);
    try {
      const r = await fetch('/api/coach/chat/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'grant' }) });
      if (r.status === 403) { setGate('adults_only'); return; }
      if (!r.ok) return;
      setGate(null);
      await sendMessage(pending);
    } finally {
      setConsentBusy(false);
    }
  };

  const withdrawSharing = async () => {
    const r = await fetch('/api/coach/chat/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revoke' }) }).catch(() => null);
    if (r?.ok) { setMessages([]); setGate(null); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const resetChat = () => {
    setMessages([]);
    setInput('');
  };

  if (gate === 'adults_only') {
    return (
      <div className="flex flex-col h-[calc(100vh-220px)] min-h-[400px] items-center justify-center text-center px-4" data-ai-adults-only>
        <Sparkles className="h-8 w-8 text-[#00E5FF] mb-3" />
        <p className="text-white/70 text-sm max-w-md">{chatRefusal(403, 'ai_coach_adults_only').text}</p>
      </div>
    );
  }

  if (ai === 'coming_soon') {
    return (
      <div className="flex flex-col h-[calc(100vh-220px)] min-h-[400px]">
        <AiComingSoon feature="coach" className="h-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[400px]">
      {/* Chat messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1 scroll-smooth">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00E5FF]/20 to-[#A855F7]/20 flex items-center justify-center mb-4 border border-[#00E5FF]/20">
              <Sparkles className="h-8 w-8 text-[#00E5FF]" />
            </div>
            <h3 className="fel-heading text-xl text-white mb-2">Coach Elijah Bonds</h3>
            <p className="text-white/50 text-sm max-w-md mb-6">
              Your personal Neuro-Performance Coach. I&apos;ll build workout plans from the Blueprint,
              adapted to your PRQ profile and goals.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  data-test-ignore="sends-chat-message"
                  onClick={() => sendMessage(s)}
                  disabled={ai !== 'available'}
                  className="text-left p-3 rounded-xl bg-[#16161a] border border-white/6 text-white/60 text-sm hover:border-[#00E5FF]/30 hover:text-white/80 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#00E5FF]/15 text-white border border-[#00E5FF]/20'
                    : 'bg-[#16161a] text-white/90 border border-white/6'
                }`}
              >
                {msg.role === 'assistant' && !msg.content && streaming && i === messages.length - 1 ? (
                  <div className="flex items-center gap-2 text-white/40">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Coach is thinking...
                  </div>
                ) : (
                  <>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    {msg.role === 'assistant' && msg.content && (
                      <div className="mt-2">
                        <AiDisclosure compact />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input area */}
      <div className="mt-3 flex-shrink-0">
        {gate && (
          <div className="mb-3 rounded-xl border border-[#00E5FF]/30 bg-[#00E5FF]/5 p-3 text-sm text-white/80 space-y-2" data-ai-share-consent>
            <p>{AI_SHARE_COPY}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setGate(null)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60">Not now</button>
              <button onClick={agreeAndSend} disabled={consentBusy} className="rounded-lg bg-[#00E5FF] px-3 py-1.5 text-xs font-medium text-black disabled:opacity-40">I agree, send it</button>
            </div>
          </div>
        )}
        {messages.length > 0 && (
          <div className="flex justify-between mb-2">
            <button onClick={withdrawSharing} className="text-xs text-white/30 hover:text-white/60 transition-colors">Stop sharing with the AI coach</button>
            <button
              onClick={resetChat}
              className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              New conversation
            </button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Coach Bonds anything..."
            rows={1}
            maxLength={AI_CHAT_MAX_CHARS}
            className="flex-1 resize-none rounded-xl bg-[#16161a] border border-white/10 px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00E5FF]/40 transition-colors"
            style={{ maxHeight: '120px' }}
            disabled={streaming || ai !== 'available'}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || streaming || ai !== 'available'}
            className="rounded-xl bg-[#00E5FF] px-4 py-3 text-black font-medium text-sm hover:bg-[#00E5FF]/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0"
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}