'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Sparkles, RotateCcw } from 'lucide-react';
import { AiDisclosure } from '@/components/ai-disclosure';

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

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || streaming) return;
    const userMsg: Message = { role: 'user', content: text.trim() };
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
        body: JSON.stringify({ messages: allMessages }),
      });

      if (!res.ok) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: 'Sorry, I\'m having trouble connecting right now. Try again in a moment.' };
          return copy;
        });
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) { setStreaming(false); return; }

      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        // Parse SSE data chunks
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (delta) {
                fullText += delta;
                setMessages((prev) => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: 'assistant', content: fullText };
                  return copy;
                });
              }
            } catch {
              // Non-JSON chunk, could be raw text passthrough
              if (data.trim() && data !== '[DONE]') {
                fullText += data;
                setMessages((prev) => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: 'assistant', content: fullText };
                  return copy;
                });
              }
            }
          }
        }
      }

      // If no text was extracted from SSE, the response might be raw text
      if (!fullText) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: 'Coach Bonds is thinking... try again.' };
          return copy;
        });
      }
    } catch {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: 'Connection error. Please try again.' };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
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
        {messages.length > 0 && (
          <div className="flex justify-end mb-2">
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
            className="flex-1 resize-none rounded-xl bg-[#16161a] border border-white/10 px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00E5FF]/40 transition-colors"
            style={{ maxHeight: '120px' }}
            disabled={streaming}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || streaming}
            className="rounded-xl bg-[#00E5FF] px-4 py-3 text-black font-medium text-sm hover:bg-[#00E5FF]/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0"
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}