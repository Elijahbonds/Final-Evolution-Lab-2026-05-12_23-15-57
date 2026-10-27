'use client';

// "What do you want to learn?" — the onboarding picker, and the same grid when changing topics later.

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Motif } from './card-visual';
import type { Topic, TopicId } from '@/lib/knowledge/types';
import { TYPE } from '@/lib/design/type';

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
      <h1 className={`${TYPE.display} text-white`}>{title}</h1>
      {/* PREMIUM-UI P7: was 20 words ("Pick a few — bite-sized cards from these, mixed with quick reviews …") */}
      <p className={`${TYPE.small} mt-3 text-fel-soft`}>Pick a few. Change them any time.</p>
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
              className="fel-press relative flex min-h-[7.5rem] flex-col items-start gap-1.5 rounded-[20px] border p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 md:min-h-[9rem]"
              style={{
                borderColor: on ? t.accent : 'rgba(255,255,255,0.1)',
                background: on ? `linear-gradient(140deg, ${t.accent}26, rgba(255,255,255,0.02))` : 'var(--fel-elev-1)',
                boxShadow: 'var(--fel-highlight)',
              }}
            >
              <Motif motif={t.motif} accent={t.accent} size={36} />
              <span className={`${TYPE.body} font-semibold leading-tight text-white`}>{t.label}</span>
              <span className={`${TYPE.small} line-clamp-2 text-fel-dim`}>{t.blurb}</span>
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
            className="fel-press min-h-14 rounded-full border border-white/15 px-6 text-base font-bold text-white/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
            Cancel
          </button>
        )}
        <button
          type="button"
          data-pad-focus
          data-learn-start
          disabled={picked.length === 0}
          onClick={() => onDone(picked)}
          className="fel-press min-h-14 flex-1 rounded-full bg-gradient-to-b from-[#4df0ff] via-[#00E5FF] to-[#00c8e0] px-6 font-display text-[20px] font-extrabold uppercase tracking-[0.04em] text-[#021014] shadow-[0_10px_28px_-8px_rgba(0,229,255,0.55)] disabled:opacity-35 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {picked.length === 0 ? 'Pick at least one topic' : `${cta} · ${picked.length} topic${picked.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
