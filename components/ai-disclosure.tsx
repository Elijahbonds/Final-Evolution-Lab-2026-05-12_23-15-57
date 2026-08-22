'use client';

import { Info } from 'lucide-react';

/**
 * EU AI Act transparency disclosure. Rendered on AI-generated content surfaces:
 * - Coach chat assistant responses
 * - Studio builder/architect outputs
 */
export function AiDisclosure({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-white/30 border border-white/5">
        <Info className="h-2.5 w-2.5" />
        AI-generated
      </span>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-[10px] text-white/35 leading-relaxed">
      <Info className="mt-0.5 h-3 w-3 shrink-0 text-white/25" />
      <span>
        <strong className="font-semibold text-white/45">AI-generated guidance</strong> — responses are produced by a language model and may be inaccurate. Always verify with a qualified professional before acting on training or health advice.
      </span>
    </div>
  );
}
