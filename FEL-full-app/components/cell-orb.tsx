'use client';

/**
 * CELL floating orb — mounts ONLY on Nexus surfaces (The Nexus Initiative /
 * story, and the Studio). CELL is the Nexus construct AI; the Coach AI is a
 * separate fitness assistant that lives on /coach. Keeping CELL scoped to Nexus
 * surfaces preserves the two-AI separation the design calls for.
 *
 * Streams from POST /api/cell/chat (SSE: meta|delta|done), the same backend the
 * full Studio uses. Zero-credit LLM via the server route.
 */

import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { X, Send, Loader2, Sparkles, Maximize2 } from 'lucide-react';

interface Msg { id: string; role: 'user' | 'cell'; content: string }

export function CellOrb() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = async () => {
    const msg = input.trim();
    if (!msg || busy) return;
    setInput('');
    const uid = `u-${Date.now()}`;
    const aid = `c-${Date.now()}`;
    setMessages((p) => [...p, { id: uid, role: 'user', content: msg }, { id: aid, role: 'cell', content: '' }]);
    setBusy(true);
    try {
      const res = await fetch('/api/cell/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, message: msg, role: 'architect' }),
      });
      if (!res.ok || !res.body) throw new Error('CELL unavailable');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let partial = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        partial += dec.decode(value, { stream: true });
        const lines = partial.split('\n');
        partial = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'meta' && evt.projectId) setProjectId(evt.projectId);
            if (evt.type === 'delta' && evt.content) {
              setMessages((prev) => prev.map((m) => (m.id === aid ? { ...m, content: m.content + evt.content } : m)));
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
            }
          } catch { /* ignore */ }
        }
      }
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === aid && !m.content ? { ...m, content: 'CELL is offline right now. Try the full Studio.' } : m)));
    } finally { setBusy(false); }
  };

  return (
    <>
      {/* Orb button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-24 right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full border border-[#A855F7]/50 bg-[#0F0F13] shadow-[0_0_28px_rgba(168,85,247,0.55)] transition hover:scale-105"
        aria-label="Open CELL"
      >
        <span className="absolute inset-0 animate-pulse rounded-full bg-[#A855F7]/20" />
        <Sparkles className="relative h-6 w-6 text-[#C79BFF]" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            className="fixed bottom-40 right-4 z-[60] flex h-[440px] w-[min(92vw,360px)] flex-col overflow-hidden rounded-2xl border border-[#A855F7]/40 bg-[#0B0B0F]/95 backdrop-blur-md"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#C79BFF]" />
                <span className="fel-heading text-sm font-bold text-white">CELL</span>
                <span className="rounded bg-[#A855F7]/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#C79BFF]">Nexus</span>
              </div>
              <div className="flex items-center gap-1">
                <Link href="/studio" className="rounded p-1 text-white/50 hover:text-white" aria-label="Open full Studio"><Maximize2 className="h-4 w-4" /></Link>
                <button onClick={() => setOpen(false)} className="rounded p-1 text-white/50 hover:text-white" aria-label="Close"><X className="h-4 w-4" /></button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {messages.length === 0 && (
                <div className="mt-6 text-center text-xs text-white/40">
                  <p className="mb-1 text-white/60">I&apos;m CELL, the Nexus construct.</p>
                  <p>Ask me to sketch a mode, a mechanic, or a training construct.</p>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-xs ${m.role === 'user' ? 'bg-[#A855F7] text-white' : 'bg-white/[0.06] text-white/85'}`}>
                    {m.content || (busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '')}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 border-t border-white/10 p-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask CELL…"
                className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-[#A855F7]/60 focus:outline-none"
              />
              <button onClick={send} disabled={busy || !input.trim()} className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#A855F7] text-white transition hover:bg-[#9333EA] disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
