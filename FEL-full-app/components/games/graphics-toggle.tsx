'use client';

// GRAPHICS — Auto / Performance / Quality, for every mode at once (visual-foundation, 2026-10-06).
//
// The choice is read when a mode MOUNTS (scene/graphicsSetting.ts → QualityTier.detectRenderTier): switching a post pass
// on mid-game compiles a shader on the very frame it changes, so a change here applies on the next load, and the button
// that appears says so and does it. Its own component with a one-line mount in game-shell, so the shell's layout lanes
// never have to merge around it.

import { useEffect, useState } from 'react';
import { GRAPHICS_CHOICES, readGraphicsChoice, writeGraphicsChoice, parseGraphicsChoice, lastTierDecision, type GraphicsChoice } from '@/lib/babylon/scene/graphicsSetting';

const LABEL: Record<GraphicsChoice, string> = { auto: 'Auto', performance: 'Performance', quality: 'Quality' };

export function GraphicsToggle() {
  const [choice, setChoice] = useState<GraphicsChoice>('auto');
  const [loaded, setLoaded] = useState<GraphicsChoice | null>(null);
  const [tier, setTier] = useState<string>('');
  useEffect(() => {
    const c = readGraphicsChoice();
    setChoice(c); setLoaded(c);
    // the mode mounts after the shell: read the tier it got once it has had a moment to decide
    const t = window.setTimeout(() => setTier(lastTierDecision()?.tier ?? ''), 4000);
    return () => window.clearTimeout(t);
  }, []);
  const pending = loaded !== null && choice !== loaded;
  return (
    <span className="flex items-center gap-1.5">
      <label className="sr-only" htmlFor="fel-graphics">Graphics</label>
      <select
        id="fel-graphics"
        value={choice}
        title={tier ? `Graphics — running the ${tier} tier` : 'Graphics'}
        onChange={(e) => { const c = parseGraphicsChoice(e.target.value) ?? 'auto'; setChoice(c); writeGraphicsChoice(c); }}
        className="h-8 rounded-md border border-white/10 bg-[#050505] px-2 font-mono text-xs text-white/60
                   transition-colors hover:border-[#00E5FF]/50 hover:text-[#00E5FF]"
      >
        {GRAPHICS_CHOICES.map((c) => <option key={c} value={c}>{LABEL[c]}</option>)}
      </select>
      {pending && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-8 rounded-md border border-[#00E5FF]/60 px-2 font-mono text-xs text-[#00E5FF]"
        >
          Reload to apply
        </button>
      )}
    </span>
  );
}
