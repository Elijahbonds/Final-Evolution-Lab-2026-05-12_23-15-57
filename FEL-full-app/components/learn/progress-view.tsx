'use client';

// The progress sheet: streak, today's goal, XP, mastered cards, each topic's progress, and what you saved. All of it
// lives on this device (lib/knowledge/storage.ts) — said on the sheet, with a way to clear it.

import { Flame, Trophy, Sparkles, Bookmark, Trash2, X } from 'lucide-react';
import { DAILY_GOAL, doneToday, liveStreak } from '@/lib/knowledge/day';
import { masteredCount, topicProgress, type LearnState } from '@/lib/knowledge/state';
import { topicById } from '@/lib/knowledge/topics';
import type { Card, TopicId } from '@/lib/knowledge/types';
import { TestYourself } from './feed-card';

export function GoalRing({ done, goal = DAILY_GOAL, size = 40, accent = '#00FF9D' }: { done: number; goal?: number; size?: number; accent?: string }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, done / goal);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={4} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={accent} strokeWidth={4} strokeLinecap="round"
        strokeDasharray={`${c * f} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

export function ProgressView({
  state, today, catalog, locked = {}, synced = false, onClose, onChangeTopics, onUnsave, onClear,
}: {
  state: LearnState;
  today: number;
  catalog: Card[];
  /** Cards of a topic a guest can't see yet (the Playbook preview, lib/knowledge/access). */
  locked?: Partial<Record<TopicId, number>>;
  /** Synced to the account (KNOWLEDGE-FEED v2: a verified adult). The privacy note says where the data lives. */
  synced?: boolean;
  onClose: () => void;
  onChangeTopics: () => void;
  onUnsave: (id: string) => void;
  onClear: () => void;
}) {
  const done = doneToday(state.today, today);
  const streak = liveStreak(state.streak, today);
  const saved = state.saved.map((id) => catalog.find((c) => c.id === id)).filter((c): c is Card => !!c);
  const headlineOf = (c: Card) => (c.type === 'quiz' ? c.question : c.headline);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-20 md:px-8" data-learn-progress>
      <div className="flex items-center justify-between">
        <h1 className="text-[clamp(1.6rem,4vw,2.6rem)] font-black text-white">Your learning</h1>
        <button type="button" data-pad-focus onClick={onClose} aria-label="Close progress"
          className="grid h-11 w-11 place-items-center rounded-full bg-white/8 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat icon={<Flame className="h-5 w-5 text-orange-400" />} value={String(streak)} label={`day streak · best ${state.streak.best}`} />
        <Stat icon={<GoalRing done={done} size={28} />} value={`${Math.min(done, DAILY_GOAL)}/${DAILY_GOAL}`} label="cards today" />
        <Stat icon={<Trophy className="h-5 w-5 text-[#FFD166]" />} value={String(masteredCount(state))} label="quiz cards mastered" />
        <Stat icon={<Sparkles className="h-5 w-5 text-[#00E5FF]" />} value={String(state.xp)} label="learning XP" />
      </div>

      <h2 className="mt-8 text-sm font-bold uppercase tracking-[0.18em] text-white/50">Topics</h2>
      <ul className="mt-3 space-y-2.5">
        {state.topics.map((id) => {
          const t = topicById(id);
          const p = topicProgress(state, id, catalog);
          return (
            <li key={id} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3" data-progress-topic={id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-bold text-white md:text-lg">{t.label}</span>
                <span className="font-mono text-[12px] text-white/55 md:text-sm">{p.seen}/{p.total} seen · {p.mastered}/{p.quizzes} mastered</span>
              </div>
              {(locked[id] ?? 0) > 0 && <p className="mt-1 text-[12px] md:text-sm" style={{ color: t.accent }}>+{locked[id]} more when you sign in</p>}
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${p.total ? (p.seen / p.total) * 100 : 0}%`, background: t.accent }} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" data-pad-focus onClick={onChangeTopics}
          className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
          Change topics
        </button>
        <TestYourself accent="#C58BFF" />
      </div>

      <h2 className="mt-8 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-white/50"><Bookmark className="h-4 w-4" /> Saved</h2>
      {saved.length === 0 ? (
        <p className="mt-2 text-sm text-white/45">Nothing saved yet — tap the bookmark on any card.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {saved.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/8 px-3.5 py-2.5">
              <span>
                <span className="block text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: topicById(c.topic).accent }}>{topicById(c.topic).label}</span>
                <span className="text-[15px] text-white/90">{headlineOf(c)}</span>
              </span>
              <button type="button" data-pad-focus onClick={() => onUnsave(c.id)} aria-label="Remove from saved"
                className="shrink-0 rounded-full p-2 text-white/50 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-sm text-white/55">
        {synced ? (
          <p data-learn-synced>Your progress is saved to your account, so it follows you to other devices. Learning XP also counts toward your account XP, up to a daily limit. Nothing is shared, and there are no followers or comments.</p>
        ) : (
          <p>Your progress is stored only on this device. Nothing here is shared or uploaded, and there are no followers or comments.</p>
        )}
        <button type="button" data-pad-focus onClick={onClear}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-rose-400/30 px-3.5 py-1.5 text-[13px] font-bold text-rose-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200">
          <Trash2 className="h-3.5 w-3.5" /> {synced ? 'Clear my learning data here and on my account' : 'Clear my learning data on this device'}
        </button>
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-3">
      <div className="flex items-center gap-2">{icon}<span className="text-2xl font-black text-white md:text-3xl">{value}</span></div>
      <p className="mt-1 text-[12px] text-white/50 md:text-sm">{label}</p>
    </div>
  );
}
