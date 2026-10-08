import { Sparkles } from 'lucide-react';
import { AI_COMING_SOON_MESSAGE, type AiFeature } from '@/lib/abacus/aiStatus';

/**
 * ABACUS-KILL: what the Coach and the Studio show while the AI switch is off. The copy is neutral: it names no
 * vendor and gives no reason.
 */
export function AiComingSoon({ feature, className = '' }: { feature: AiFeature; className?: string }) {
  return (
    <div
      role="status"
      data-ai-coming-soon={feature}
      className={`flex flex-col items-center justify-center px-4 text-center ${className}`}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#00E5FF]/20 bg-gradient-to-br from-[#00E5FF]/20 to-[#A855F7]/20">
        <Sparkles className="h-8 w-8 text-[#00E5FF]" />
      </div>
      <h3 className="fel-heading mb-2 text-xl text-white">Coming soon</h3>
      <p className="max-w-md text-sm text-white/50">{AI_COMING_SOON_MESSAGE[feature]}</p>
    </div>
  );
}
