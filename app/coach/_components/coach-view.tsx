'use client';

import { useState } from 'react';
import { MessageSquare, BookOpen, Video } from 'lucide-react';
import { CoachChat } from './coach-chat';
import { ExerciseCatalogue } from './exercise-catalogue';
import { FormFeedback } from './form-feedback';

const TABS = [
  { key: 'chat', label: 'Coach', icon: MessageSquare },
  { key: 'catalogue', label: 'Exercises', icon: BookOpen },
  { key: 'form', label: 'Form Check', icon: Video },
] as const;

type Tab = typeof TABS[number]['key'];

export function CoachView() {
  const [tab, setTab] = useState<Tab>('chat');

  return (
    <main className="mx-auto max-w-[900px] px-4 py-4">
      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl bg-[#0f0f13] p-1 mb-4 border border-white/6">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all ${
                active
                  ? 'bg-[#00E5FF]/15 text-[#00E5FF] shadow-[0_0_12px_rgba(0,229,255,0.2)]'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'chat' && <CoachChat />}
      {tab === 'catalogue' && <ExerciseCatalogue />}
      {tab === 'form' && <FormFeedback />}
    </main>
  );
}
