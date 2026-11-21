'use client';

// lane/story (2026-11-21; docs/STORY-FINISH-PLAN.md; knob story.endCard): the card a finished chapter brings up. It says the chapter
// is complete, its recap, what it gave you (the Adventure XP its beats paid, the level, the spell, the gates it opened) and what comes
// next — the next chapter, or "to be continued" while the story has no chapter after it — with Keep exploring (the hub is free roam)
// and the way out (Venice or Play). Every word is data (lib/adventure/story/*.json): a DRAFT tag shows while the owner has not written
// them (the dialogue box's PLACEHOLDER rule).

import type { ChapterEnding } from '@/lib/babylon/adventure/story/progress';

const UNLOCK_WORDS: Record<string, string> = { fusion: 'Fusion with your partner', flight: 'Flight while fused' };
const spellWord = (id: string) => (id.startsWith('bolt.') ? `Your partner's ${id.slice(5)} bolt` : id);

export function StoryEndCard({ ending, exit, onExplore }: { ending: ChapterEnding; exit: { href: string; label: string }; onExplore: () => void }) {
  const gains = [
    `+${ending.xp} Adventure XP · level ${ending.level}`,
    ...ending.spells.map((s) => `Learned: ${spellWord(s)}`),
    ...ending.unlocked.map((u) => `Unlocked: ${UNLOCK_WORDS[u] ?? u}`),
  ];
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/80 p-4" data-testid="story-end-card" role="dialog" aria-label="Chapter complete">
      <div className="w-full max-w-md space-y-3 rounded-2xl border border-white/15 bg-black/80 p-5 font-sans text-white">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-black tracking-[0.3em] text-white/50">CHAPTER {ending.chapterNumber} COMPLETE</p>
          {ending.draft && (
            <span className="rounded bg-[#facc15] px-1.5 py-0.5 text-[12px] font-black text-black" data-testid="story-end-draft" title="Draft story text until the owner writes it">DRAFT</span>
          )}
        </div>
        <p className="text-lg font-black leading-tight">{ending.chapterTitle}</p>
        {ending.recap && <p className="text-base text-white/85" data-testid="story-end-recap">{ending.recap}</p>}
        <ul className="space-y-1 text-[14px] text-white/80" data-testid="story-end-gains">
          {gains.map((g) => <li key={g}>· {g}</li>)}
        </ul>
        {ending.next ? (
          <p className="text-[14px] text-white/80" data-testid="story-end-next">Next: <b>{ending.next.chapterTitle}</b></p>
        ) : ending.continued && (
          <div className="rounded-xl border border-[#a78bfa]/40 bg-[#a78bfa]/10 p-3" data-testid="story-end-continued">
            <p className="text-base font-black">{ending.continued.title}</p>
            {ending.continued.text && <p className="text-[14px] text-white/80">{ending.continued.text}</p>}
          </div>
        )}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <button type="button" data-testid="story-end-explore" onClick={(e) => { e.currentTarget.blur(); onExplore(); }}
            className="min-h-[44px] flex-1 rounded-xl bg-[#00E5FF] px-4 font-bold text-black">Keep exploring</button>
          <a href={exit.href} data-testid="story-end-exit"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-white/25 px-4 font-bold text-white/90">{exit.label}</a>
        </div>
      </div>
    </div>
  );
}
