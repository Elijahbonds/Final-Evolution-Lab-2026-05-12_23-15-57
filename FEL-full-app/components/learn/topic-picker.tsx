'use client';

// "What do you want to learn?" — the onboarding picker, and the same grid when changing topics later.

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Motif } from './card-visual';
import type { Topic, TopicId } from '@/lib/knowledge/types';

export function TopicPicker({
  topics, initial, onDone, title = 'What do you want to learn?', cta = 'Start learning', onCancel,
}: {
  topics: Topic[];
  initial: TopicId[];
  onDone: (picked: TopicId[]) => void;
  title?: string;
  cta?: string;
  onCancel?: () => void;
}) {
  const [picked, setPicked] = useState<TopicId[]>(initial.filter((t) => topics.some((x) => x.id === t)));
  const toggle = (id: TopicId) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 pb-10 pt-20 md:px-8" data-learn-picker>
      <h1 className="text-[clamp(1.8rem,4.5vw,3.2rem)] font-black leading-tight text-white">{title}</h1>
      <p className="mt-2 text-[clamp(0.95rem,1.8vw,1.3rem)] text-white/60">
        Pick a few — bite-sized cards from these, mixed with quick reviews of what you've learned. Change them any time.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 lg:gap-3.5">
        {topics.map((t) => {
          const on = picked.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              data-pad-focus
              data-topic={t.id}
              onClick={() => toggle(t.id)}
              className="relative flex min-h-[7.5rem] flex-col items-start gap-1.5 rounded-2xl border p-3.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 md:min-h-[9rem] md:p-4"
              style={{
                borderColor: on ? t.accent : 'rgba(255,255,255,0.1)',
                background: on ? `linear-gradient(140deg, ${t.accent}26, rgba(255,255,255,0.02))` : 'rgba(255,255,255,0.03)',
              }}
            >
              <Motif motif={t.motif} accent={t.accent} size={36} />
              <span className="text-[15px] font-bold leading-tight text-white md:text-lg">{t.label}</span>
              <span className="text-[12px] leading-snug text-white/50 md:text-sm">{t.blurb}</span>
              {on && (
                <span className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full text-black" style={{ background: t.accent }}>
                  <Check className="h-4 w-4" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="sticky bottom-0 mt-6 flex gap-3 bg-gradient-to-t from-[#050505] via-[#050505] to-transparent pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        {onCancel && (
          <button type="button" data-pad-focus onClick={onCancel}
            className="rounded-2xl border border-white/15 px-5 py-3.5 text-base font-bold text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
            Cancel
          </button>
        )}
        <button
          type="button"
          data-pad-focus
          data-learn-start
          disabled={picked.length === 0}
          onClick={() => onDone(picked)}
          className="flex-1 rounded-2xl bg-[#00FF9D] px-6 py-3.5 text-base font-black text-black transition-opacity disabled:opacity-35 focus:outline-none focus-visible:ring-2 focus-visible:ring-white md:text-lg"
        >
          {picked.length === 0 ? 'Pick at least one topic' : `${cta} · ${picked.length} topic${picked.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
