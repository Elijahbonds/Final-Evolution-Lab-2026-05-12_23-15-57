'use client';

// /training's step-through of today's coached session (one exercise at a time), over the same GET /api/coach/me/today
// and POST /api/coach/me/log as the /coach Today tab.
//
// MIRROR-COACH P2 (2026-09-25): this card showed three HARD-CODED cues ("Hit the prescribed tempo", "Keep every rep
// clean", "Rest Ns") whatever the coach wrote, and logged one row per exercise with a free-text load box pre-filled
// with the prescription — so an athlete who tapped straight through "logged" RPE7 as a load (crossref: "/training has
// a step-through variant with no video field and three hard-coded cues"). It now reads the coach's catalogue like
// Today does (lib/coach/today.ts: set-up picks, cues, faults, the easier version), walks the session in running order
// with the section and key set named, times timed work (components/coach/set-timer.tsx) and logs per set
// (components/coach/set-logger.tsx: reps, weight in kg or lb, reps left 0–5, effort 1–10). The generic lines stay
// only as a fallback for an exercise whose catalogue row has no cues at all.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronRight, KeyRound, Loader2 } from 'lucide-react';
import { SetLogger, UnitSwitch, readWeightUnit, writeWeightUnit } from '@/components/coach/set-logger';
import { SetTimer } from '@/components/coach/set-timer';
import { SET_LOG_ERROR_COPY, convertDrafts, draftsFor, draftsToInput, type SetDraft, type SetLogError, type WeightUnit } from '@/lib/coach/setLog';
import { KEY_SET_LINE, NOTE_PROMPT, easierLine, repsPlaceholder, simpleLogging } from '@/lib/coach/today';
import { nextTimedRow } from '@/lib/coach/setTimer';
import { sectionLabel } from '@/lib/coach/taxonomy';
import { timedRepsSuffix } from '@/lib/coach/structure';
import type { TodayPayload } from '@/lib/coach/todayServer';

interface ExerciseDraft {
  sets: SetDraft[];
  clientNote: string;
  /** Not edited here; carried so a save from this view does not wipe a form-video link saved from the Today tab. */
  videoUrl: string;
}

/** The real endpoints. A module constant: a default written inline would be a new object every render, and loadToday
 *  (which depends on it) would refetch forever. */
const SESSION_API = { today: '/api/coach/me/today', log: '/api/coach/me/log' };

/** `api` points the view at other endpoints (the dev harness app/dev/coach-today?view=training runs the same server code in memory). */
export function ClientSessionView({ api = SESSION_API }: { api?: { today: string; log: string } } = {}) {
  const [data, setData] = useState<TodayPayload | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ExerciseDraft>>({});
  const [unit, setUnit] = useState<WeightUnit>('kg');
  // the unit the drafts are in right now: a load that resolves after a kg/lb switch builds its rows in the new unit
  const unitRef = useRef<WeightUnit>('kg');
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadToday = useCallback(async () => {
    try {
      const res = await fetch(api.today);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? `Failed to load session (${res.status})`);
      const next = payload as TodayPayload;
      setData(next);
      setCurrentExerciseIndex(0);
      if (next.today) {
        const u = unitRef.current;
        const nextDrafts: Record<string, ExerciseDraft> = {};
        for (const exercise of next.today.session.exercises) {
          const prior = next.open?.logs.find((log) => log.sessionExerciseId === exercise.id);
          // blank rows, the prescription as placeholders: an untouched set logs nothing (it used to copy "RPE7" into the load)
          nextDrafts[exercise.id] = { sets: draftsFor(exercise.sets, prior?.setLogs, u), clientNote: prior?.clientNote ?? '', videoUrl: prior?.videoUrl ?? '' };
        }
        setDrafts(nextDrafts);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load workout');
    }
  }, [api]);

  useEffect(() => {
    const u = readWeightUnit();
    unitRef.current = u;
    setUnit(u);
    void loadToday();
  }, [loadToday]);

  const session = data?.today?.session ?? null;
  const currentExercise = session?.exercises[currentExerciseIndex] ?? null;
  const currentDraft = currentExercise ? drafts[currentExercise.id] : null;
  const isLastExercise = !!session && currentExerciseIndex === session.exercises.length - 1;

  const updateDraft = useCallback((patch: Partial<ExerciseDraft>) => {
    if (!currentExercise) return;
    setDrafts((prev) => ({ ...prev, [currentExercise.id]: { ...prev[currentExercise.id], ...patch } }));
  }, [currentExercise]);

  const switchUnit = (to: WeightUnit) => {
    const from = unitRef.current;
    if (to === from) return;
    unitRef.current = to;
    setDrafts((all) => Object.fromEntries(Object.entries(all).map(([k, d]) => [k, { ...d, sets: convertDrafts(d.sets, from, to) }])));
    setUnit(to);
    writeWeightUnit(to);
  };

  // a finished (or stopped) work run fills the first set row with no seconds yet
  const onWork = useCallback((seconds: number) => {
    if (!currentDraft) return;
    const i = nextTimedRow(currentDraft.sets);
    if (i >= 0) updateDraft({ sets: currentDraft.sets.map((r, k) => (k === i ? { ...r, workSeconds: String(seconds) } : r)) });
  }, [currentDraft, updateDraft]);

  const handleNextExercise = () => {
    if (!isLastExercise && session) {
      setCurrentExerciseIndex((prev) => prev + 1);
    }
  };

  const handlePrevExercise = () => {
    if (currentExerciseIndex > 0) {
      setCurrentExerciseIndex((prev) => prev - 1);
    }
  };

  const handleCompleteSession = async () => {
    if (!data?.program || !session) return;
    setSaving(true);
    setSaveError(null);
    try {
      const logs = session.exercises.map((exercise) => ({ sessionExerciseId: exercise.id, sets: draftsToInput(drafts[exercise.id].sets, unit), clientNote: drafts[exercise.id].clientNote, videoUrl: drafts[exercise.id].videoUrl }));
      const res = await fetch(api.log, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId: data.program.id, sessionId: session.id, logs, complete: true }),
      });
      const payload = await res.json();
      if (!res.ok) {
        // a refused set: take the athlete to that exercise and say which set and why, in words
        const copy = payload?.error in SET_LOG_ERROR_COPY ? SET_LOG_ERROR_COPY[payload.error as SetLogError] : null;
        const at = session.exercises.findIndex((e) => e.id === payload?.sessionExerciseId);
        if (copy && at >= 0) { setCurrentExerciseIndex(at); setSaveError(`${payload.set ? `Set ${payload.set}: ` : ''}${copy}`); return; }
        throw new Error(payload?.error ?? `Failed to complete session (${res.status})`);
      }
      setSessionActive(false);
      setCurrentExerciseIndex(0);
      await loadToday();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete session');
    } finally {
      setSaving(false);
    }
  };

  if (!data && !error) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading workout...
      </div>
    );
  }

  if (error) {
    return <div className="mx-auto max-w-2xl rounded border border-red-500 bg-red-950/50 p-4 text-sm text-red-100">{error}</div>;
  }

  if (!data?.program || !session) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{data?.program ? 'Program Complete' : 'No Assigned Workout'}</CardTitle>
            <CardDescription>{data?.program ? `Nothing left on ${data.program.name}. Talk to your coach about the next block.` : 'A certified coach can assign your next program from the Coach tab.'}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (session.exercises.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{session.label}</CardTitle>
            <CardDescription>Your coach has created this session but has not prescribed exercises yet.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!sessionActive) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Ready to Train?</CardTitle>
            <CardDescription>{data.program.name} with coach {data.program.coachName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-slate-700/50 rounded p-4">
              <h3 className="font-semibold mb-2">{data.today?.block.label} - {session.label}</h3>
              <p className="text-sm text-slate-400">{session.exercises.length} exercises</p>
            </div>
            <Button
              onClick={() => setSessionActive(true)}
              className="w-full bg-green-600 hover:bg-green-700 h-12 text-lg"
            >
              Start Workout
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const c = currentExercise?.coaching;
  const timed = !!currentExercise?.workSeconds;
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Progress */}
      <div className="flex items-center justify-between gap-3 text-sm text-slate-400">
        <span>Exercise {currentExerciseIndex + 1} of {session.exercises.length}{currentExercise ? ` · ${sectionLabel(currentExercise.section)}` : ''}</span>
        <UnitSwitch unit={unit} onChange={switchUnit} />
      </div>

      {/* Exercise Card */}
      {currentExercise && c && currentDraft && (
        <Card className={`bg-slate-800 ${currentExercise.isKeySet ? 'border-[#FFD700]/40' : 'border-slate-700'}`}>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                {currentExercise.isKeySet && <div className="mb-1 inline-flex items-center gap-1 rounded bg-[#FFD700]/15 px-1.5 text-[11px] font-semibold text-[#FFD700]"><KeyRound className="h-3 w-3" aria-hidden="true" />KEY SET</div>}
                {currentExercise.isKeySet && <p className="mb-1 text-[11px] text-[#FFD700]/80">{KEY_SET_LINE}</p>}
                <CardTitle className="text-2xl">{currentExercise.name}</CardTitle>
                <CardDescription>{currentExercise.dose}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Workout Prescription */}
            <div className="grid grid-cols-3 gap-4 bg-slate-700/50 rounded p-4">
              <div className="text-center">
                <p className="text-sm text-slate-400">Sets</p>
                <p className="text-2xl font-bold">{currentExercise.sets}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-slate-400">{timed ? 'Seconds' : 'Reps'}</p>
                <p className="text-2xl font-bold">{timed ? currentExercise.workSeconds : currentExercise.reps}</p>
                {/* MIRROR-COACH P2 review (2026-09-26): a timed per-side dose ("30 s each side") showed a bare "30" */}
                {timed && timedRepsSuffix(currentExercise.reps, currentExercise.workSeconds) && (
                  <p className="text-xs text-slate-300">{timedRepsSuffix(currentExercise.reps, currentExercise.workSeconds)}</p>
                )}
              </div>
              <div className="text-center">
                <p className="text-sm text-slate-400">Tempo</p>
                <p className="text-xl font-semibold">{currentExercise.tempo}</p>
              </div>
            </div>

            {c.band && <p className="text-sm text-slate-300"><span className="font-semibold text-white">{c.band.label}</span> ({c.band.rir}): {c.band.meaning}</p>}

            {currentExercise.coachNote && (
              <div>
                <h4 className="font-semibold mb-3 text-sm">Coach Note</h4>
                <p className="text-sm text-[#00E5FF]/80">{currentExercise.coachNote}</p>
              </div>
            )}

            {c.setup.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2 text-sm">Before the First Rep</h4>
                <ul className="space-y-1">{c.setup.map((s) => <li key={s.id} className="text-sm">{s.text}</li>)}</ul>
              </div>
            )}

            <div>
              <h4 className="font-semibold mb-3 text-sm">Key Cues</h4>
              <ul className="space-y-2">
                {(c.cues.length ? c.cues : ['Hit the prescribed tempo', 'Keep every rep clean']).map((cue) => (
                  <li key={cue} className="flex items-start gap-2 text-sm">
                    <span className="text-green-400 mt-1">✓</span>
                    <span>{cue}</span>
                  </li>
                ))}
              </ul>
            </div>

            {c.faults.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2 text-sm">Common Faults</h4>
                <ul className="space-y-1">{c.faults.map((f) => <li key={f.fault} className="text-sm text-slate-300">{f.fault}{f.fix ? <span className="text-slate-400"> → {f.fix}</span> : null}</li>)}</ul>
              </div>
            )}
            {c.easier && <p className="text-xs text-slate-400">{easierLine(c.easier.name)}</p>}
            {c.demo && <a href={c.demo.href} target="_blank" rel="noreferrer noopener" className="text-xs text-[#00E5FF]">Watch the demo</a>}

            <SetTimer timers={currentExercise.timers} onWorkLogged={timed ? onWork : undefined} />

            {/* Log Actuals */}
            <div className="bg-slate-700/50 rounded p-4 space-y-3">
              <p className="font-semibold text-sm">Log Your Sets</p>
              <SetLogger name={currentExercise.name} rows={currentDraft.sets} unit={unit} timed={timed} simple={simpleLogging(currentExercise)} youth={!!currentExercise.youthRules} repsHint={repsPlaceholder(currentExercise.reps)} workHint={String(currentExercise.workSeconds ?? '')} onChange={(sets) => updateDraft({ sets })} />
              {saveError && <p className="text-xs text-red-300" role="alert">{saveError}</p>}
              <textarea
                placeholder={NOTE_PROMPT}
                value={currentDraft.clientNote}
                onChange={(event) => updateDraft({ clientNote: event.target.value })}
                className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                rows={2}
                maxLength={500}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        <Button
          onClick={handlePrevExercise}
          disabled={currentExerciseIndex === 0}
          className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
        >
          Previous
        </Button>

        {isLastExercise ? (
          <Button
            onClick={handleCompleteSession}
            disabled={saving}
            className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Complete Session'}
          </Button>
        ) : (
          <Button
            onClick={handleNextExercise}
            className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2"
          >
            Next <ChevronRight size={18} />
          </Button>
        )}
      </div>
    </div>
  );
}
