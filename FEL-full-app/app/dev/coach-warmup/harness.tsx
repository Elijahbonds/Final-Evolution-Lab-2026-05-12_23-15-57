'use client';
// The dev harness's client half (MIRROR-COACH P6, 2026-09-29): the real WarmupPrep card over a fixed context, session
// and readiness level, with links to switch each. See page.tsx.
import Link from 'next/link';
import { WarmupPrep } from '@/components/coach/warmup-prep';
import { FALLBACK_WARMUP_CONTEXT, type SessionItemLike, type WarmupContext, type WarmupReadiness } from '@/lib/coach/warmup';
import { ZONE_WORDS } from '@/lib/coach/warmupContent';

const ADULT: WarmupContext = { isYouth: false, painDecision: null, zone: { id: 'foot', words: ZONE_WORDS.foot, checks: ['heelLine'] }, screen: 'flagged', screenAt: '2026-09-28T10:00:00.000Z', hardStopped: false };
const CONTEXTS: Record<string, WarmupContext> = {
  adult: ADULT,
  youth: { ...ADULT, isYouth: true, zone: { id: 'rib_thoracic', words: ZONE_WORDS.rib_thoracic, checks: ['shoulderLevel'] } },
  pain: { ...ADULT, painDecision: 'step_down_flag_coach' },
  fallback: FALLBACK_WARMUP_CONTEXT,
};
const ex = (id: string, order: number, section: string, pattern: string | null, isKeySet = false, jumpLand = false): SessionItemLike & { id: string } =>
  ({ id, order, section, isKeySet, coaching: { pattern: pattern ? { id: pattern as 'squat' } : null, jumpLand } });
const DAYS: Record<string, (SessionItemLike & { id: string })[]> = {
  squat: [ex('k', 1, 'key', 'squat', true), ex('a', 2, 'assist', 'lunge'), ex('c', 3, 'cooldown', 'breath')],
  untagged: [ex('k', 1, 'key', null, true), ex('a', 2, 'assist', 'pull')],
  // a coach's JUMP work in Prime (a Jump & Land row) — MIRROR-COACH P6 FIX: the pattern alone no longer counts
  prime: [ex('p', 0, 'prime', 'locomotion', false, true), ex('k', 1, 'key', 'hinge', true)],
  // a walk in Prime (locomotion, not jump work): a youth athlete's jumps stay off
  walk: [ex('w', 0, 'prime', 'locomotion'), ex('k', 1, 'key', 'hinge', true)],
};
const READY: readonly WarmupReadiness[] = ['skip', 'ok', 'low'];

export function WarmupHarness({ ctx, day, ready }: { ctx: string; day: string; ready: string }) {
  const context = CONTEXTS[ctx] ?? ADULT;
  const exercises = DAYS[day] ?? DAYS.squat;
  const readiness = (READY as readonly string[]).includes(ready) ? ready as WarmupReadiness : 'skip';
  const href = (k: 'ctx' | 'day' | 'ready', v: string) => `/dev/coach-warmup?${new URLSearchParams({ ctx, day, ready, [k]: v })}`;
  const row = (k: 'ctx' | 'day' | 'ready', vals: readonly string[], cur: string) => (
    <div className="flex flex-wrap gap-1 text-xs">
      <span className="text-white/40 w-12">{k}</span>
      {vals.map((v) => <Link key={v} href={href(k, v)} className={`rounded border px-2 py-0.5 ${v === cur ? 'border-[#00E5FF]/50 text-[#00E5FF]' : 'border-white/10 text-white/60'}`}>{v}</Link>)}
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="space-y-1">{row('ctx', Object.keys(CONTEXTS), ctx)}{row('day', Object.keys(DAYS), day)}{row('ready', READY, readiness)}</div>
      <WarmupPrep key={`${ctx}|${day}|${readiness}`} exercises={exercises} contextUrl={null} initialContext={context} readiness={readiness} />
    </div>
  );
}
