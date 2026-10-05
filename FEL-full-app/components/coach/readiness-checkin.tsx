'use client';
// The daily readiness check-in card on Today (MIRROR-COACH P6, 2026-09-29).
//
// Four tap scales before the session — sleep, soreness, energy, mood, 1 to 5 — every one optional, a Skip that is
// one tap, and a Save that is one more: about twenty seconds, and it NEVER blocks training. While it loads it renders
// nothing; if the read fails it still offers the scales; a skipped card folds to one quiet line; the session below is
// usable the whole time. It is unscored (owner decision #12) and says so on its face (READINESS_NOT_SCORED_LINE).
//
// A thin client of app/api/health/readiness, like components/coach/pain-checkin.tsx is of the pain route: the read,
// its thresholds and every line of its copy live in lib/health/readiness.ts, and what this card shows after a save is
// the SERVER's read, verbatim. The two consent 412s reuse the pain chip's own notices (HealthConsentLockedNotice,
// GuardianLockedNotice) — one wording of each, never a second. Nothing is collected until a Save, and a Save with no
// health-data consent asks for it inline and then re-sends the answers already tapped.
//
// SKIP is local: nothing is sent, nothing is stored (a skip carries no health data, so it needs no consent and no
// row). The "skipped today" flag lives in this browser's localStorage under today's date — a per-viewer convenience,
// wrapped in try/catch like every storage access here, so a private window just asks again.
//
// `onRead` hands today's read to whatever shapes the warm-up (the Prep section): 'skip' when skipped or not answered.
// The read travels in memory only — never in a URL (lib/coach/warmupServer.ts's own rule for this answer).
//
// MIRROR-COACH P6 FIX (2026-09-29, code review): `warmup` — what Today's warm-up actually is for this session
// (lib/coach/cooldown.ts todayWarmupKind: FEL's generated one, the coach's own Prep, or none on an off day). The card
// said "your warm-up runs 4 minutes longer" and "Warm-up today: about 14 minutes" on every session, including the ones
// with no generated warm-up at all (a coach's Prep — every Mirror one-tap prescription lands there — and every off
// day), and the number was wrong for youth and pain-day plans. The line is now picked by `warmup`
// (readinessSuggestion) and names no minutes: only FEL's warm-up card states a length, and it states the plan's real one.
import { useCallback, useEffect, useState } from 'react';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import {
  READINESS_ITEMS, READINESS_NOT_SCORED_LINE, localDayKey, readReadiness, readinessSuggestion,
  type ReadinessAnswers, type ReadinessItemId, type ReadinessRead, type ReadinessWarmupKind,
} from '@/lib/health/readiness';
import { GuardianLockedNotice, HealthConsentLockedNotice } from '@/components/coach/pain-checkin';

export const READINESS_API = '/api/health/readiness';
const SKIP_KEY = (date: string) => `fel.readiness.skipped.${date}`;
const HEALTH_DATA_LOCKED = 'health_data_consent_required';
const GUARDIAN_LOCKED = 'guardian_consent_required';

function readSkip(date: string): boolean {
  try { return window.localStorage.getItem(SKIP_KEY(date)) === '1'; } catch { return false; }
}
function writeSkip(date: string, on: boolean) {
  try {
    if (on) window.localStorage.setItem(SKIP_KEY(date), '1');
    else window.localStorage.removeItem(SKIP_KEY(date));
  } catch { /* storage blocked: the card simply asks again next visit */ }
}

/** Tapping the value already picked clears it — every question stays optional right up to Save. */
export function toggleAnswer(a: ReadinessAnswers, id: ReadinessItemId, n: number): ReadinessAnswers {
  return { ...a, [id]: a[id] === n ? null : n };
}

const answeredCount = (a: ReadinessAnswers) => READINESS_ITEMS.filter((i) => typeof a[i.id] === 'number').length;

const pill = (active: boolean) =>
  `h-8 min-w-8 flex-1 rounded-md text-xs font-medium border ${active ? 'bg-[#00E5FF]/20 border-[#00E5FF]/50 text-[#00E5FF]' : 'border-white/10 text-white/60'}`;

/** The four scales. Presentational (no fetch, no storage), so a server render of it is a real first paint. */
export function ReadinessScales({ answers, onPick, disabled = false }: { answers: ReadinessAnswers; onPick: (id: ReadinessItemId, n: number) => void; disabled?: boolean }) {
  return (
    <div className="space-y-2.5">
      {READINESS_ITEMS.map((item) => (
        <div key={item.id} role="group" aria-label={item.prompt} data-readiness-item={item.id}>
          <div className="text-[12px] text-white/75 mb-1">{item.prompt}</div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n} type="button" disabled={disabled} aria-pressed={answers[item.id] === n}
                aria-label={`${item.prompt} ${n} of 5${n === 1 ? ` (${item.anchors[1]})` : n === 5 ? ` (${item.anchors[5]})` : ''}`}
                onClick={() => onPick(item.id, n)} className={pill(answers[item.id] === n)}
              >{n}</button>
            ))}
          </div>
          <div className="mt-0.5 flex justify-between text-[10px] text-white/35"><span>{item.anchors[1]}</span><span>{item.anchors[5]}</span></div>
        </div>
      ))}
    </div>
  );
}

/** After a save: the server's level, said for what today's warm-up really is (no minutes — see the header's P6 fix). */
export function ReadinessResult({ read, warmup }: { read: ReadinessRead; warmup: ReadinessWarmupKind }) {
  const tone = read.level === 'low' ? 'border-[#FFD700]/40 bg-[#FFD700]/10 text-[#FFD700]' : 'border-[#00FF9D]/30 bg-[#00FF9D]/8 text-[#00FF9D]';
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${tone}`} role="status" data-readiness-level={read.level} data-warmup-kind={warmup}>
      <span className="leading-snug">{readinessSuggestion(read.level, warmup)}</span>
    </div>
  );
}

type Phase = 'loading' | 'ask' | 'done' | 'skipped';

export function ReadinessCheckInCard({ endpoint = READINESS_API, onRead, warmup }: {
  endpoint?: string; onRead?: (read: ReadinessRead) => void;
  /** What today's warm-up is (lib/coach/cooldown.ts todayWarmupKind). Required: the line depends on it. */
  warmup: ReadinessWarmupKind;
}) {
  const [date] = useState(() => localDayKey(new Date()));
  const [phase, setPhase] = useState<Phase>('loading');
  const [answers, setAnswers] = useState<ReadinessAnswers>({});
  const [saved, setSaved] = useState(false);          // a row exists for today (so an all-blank Save clears it)
  const [savedAnswers, setSavedAnswers] = useState<ReadinessAnswers>({});   // what Cancel goes back to
  const [read, setRead] = useState<ReadinessRead | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [lock, setLock] = useState<'health' | 'guardian' | null>(null);

  const publish = useCallback((r: ReadinessRead) => { setRead(r); onRead?.(r); }, [onRead]);

  useEffect(() => {
    let cancelled = false;
    if (readSkip(date)) { setPhase('skipped'); publish(readReadiness(null)); return; }
    fetch(`${endpoint}?date=${encodeURIComponent(date)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        if (j?.checkIn) {
          const a = { sleep: j.checkIn.sleep, soreness: j.checkIn.soreness, energy: j.checkIn.energy, mood: j.checkIn.mood };
          setAnswers(a);
          setSavedAnswers(a);
          setSaved(true);
          publish(j.read);
          setPhase('done');
        } else {
          publish(readReadiness(null));
          setPhase('ask');
        }
      })
      .catch(() => { if (!cancelled) { publish(readReadiness(null)); setPhase('ask'); } });
    return () => { cancelled = true; };
    // one read per mount: `publish` changing identity must not refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, endpoint]);

  const save = async () => {
    setBusy(true); setError(false);
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ date, ...answers }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (j?.error === HEALTH_DATA_LOCKED) { setLock('health'); return; }
        if (j?.error === GUARDIAN_LOCKED) { setLock('guardian'); return; }
        setError(true);
        return;
      }
      setLock(null);
      publish(j.read);
      if (j.checkIn) { setSaved(true); setSavedAnswers(answers); setPhase('done'); } else { setSaved(false); setSavedAnswers({}); setPhase('ask'); }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const skip = () => { writeSkip(date, true); setPhase('skipped'); publish(readReadiness(null)); };
  const unskip = () => { writeSkip(date, false); setPhase('ask'); };

  if (phase === 'loading') return null;

  if (phase === 'skipped') return (
    <div className="flex items-center justify-between text-[11px] text-white/40 px-1" data-testid="readiness-skipped">
      <span>Check-in skipped today.</span>
      <button type="button" onClick={unskip} className="underline underline-offset-2 hover:text-white/60">Answer anyway</button>
    </div>
  );

  const n = answeredCount(answers);
  return (
    <div className="fel-card rounded-xl p-4 space-y-3" data-testid="readiness-checkin" data-phase={phase}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white/90">Quick check-in</div>
          <div className="text-[11px] text-white/45">About 20 seconds. Every question is optional.</div>
        </div>
        {phase === 'done' && (
          <button type="button" onClick={() => setPhase('ask')} className="flex items-center gap-1 text-[11px] text-white/45 hover:text-white/70">
            <SlidersHorizontal className="h-3 w-3" aria-hidden="true" /> Change
          </button>
        )}
      </div>

      {phase === 'done' && read ? (
        <ReadinessResult read={read} warmup={warmup} />
      ) : lock === 'health' ? (
        <HealthConsentLockedNotice onGranted={() => { setLock(null); void save(); }} />
      ) : lock === 'guardian' ? (
        <GuardianLockedNotice />
      ) : (
        <>
          <ReadinessScales answers={answers} disabled={busy} onPick={(id, v) => setAnswers((a) => toggleAnswer(a, id, v))} />
          <div className="flex gap-2">
            <button
              type="button" disabled={busy || (n === 0 && !saved)} onClick={save}
              className="flex-1 rounded-lg bg-white/8 border border-white/10 py-1.5 text-xs font-medium text-white/85 disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              {busy && <Loader2 className="h-3 w-3 animate-spin" />} {n === 0 && saved ? 'Clear today’s answers' : 'Save'}
            </button>
            {!saved && (
              <button type="button" disabled={busy} onClick={skip} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/55">Skip today</button>
            )}
            {saved && (
              <button type="button" disabled={busy} onClick={() => { setAnswers(savedAnswers); setPhase('done'); }} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/55">Cancel</button>
            )}
          </div>
          {error && <p className="text-[11px] text-[#FF3366]">That didn’t save. Your session below isn’t affected.</p>}
        </>
      )}

      <p className="text-[10px] text-white/35">{READINESS_NOT_SCORED_LINE}</p>
    </div>
  );
}
