'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronRight, Loader2 } from 'lucide-react';

interface SessionExercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  load: string;
  tempo: string;
  restSeconds: number;
  coachNote: string | null;
}

interface TodayPayload {
  program: { id: string; name: string; coachName: string } | null;
  today: {
    block: { label: string };
    session: { id: string; label: string; exercises: SessionExercise[] };
    index: number;
    total: number;
  } | null;
  open: { id: string; logs: Array<Record<string, any>> } | null;
  recentComments: Array<{ exercise: string; comment: string; at: string }>;
}

interface ExerciseDraft {
  actualSets: string;
  actualReps: string;
  actualLoad: string;
  rpe: string;
  clientNote: string;
}

export function ClientSessionView() {
  const [data, setData] = useState<TodayPayload | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ExerciseDraft>>({});
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadToday = useCallback(async () => {
    try {
      const res = await fetch('/api/coach/me/today');
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? `Failed to load session (${res.status})`);
      const next = payload as TodayPayload;
      setData(next);
      setCurrentExerciseIndex(0);
      if (next.today) {
        const nextDrafts: Record<string, ExerciseDraft> = {};
        for (const exercise of next.today.session.exercises) {
          const prior = next.open?.logs.find((log) => log.sessionExerciseId === exercise.id);
          nextDrafts[exercise.id] = {
            actualSets: prior?.actualSets?.toString() ?? String(exercise.sets),
            actualReps: prior?.actualReps ?? exercise.reps,
            actualLoad: prior?.actualLoad ?? exercise.load,
            rpe: prior?.rpe?.toString() ?? '',
            clientNote: prior?.clientNote ?? '',
          };
        }
        setDrafts(nextDrafts);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load workout');
    }
  }, []);

  useEffect(() => {
    void loadToday();
  }, [loadToday]);

  const session = data?.today?.session ?? null;
  const currentExercise = session?.exercises[currentExerciseIndex] ?? null;
  const currentDraft = currentExercise ? drafts[currentExercise.id] : null;
  const isLastExercise = !!session && currentExerciseIndex === session.exercises.length - 1;

  const updateDraft = (key: keyof ExerciseDraft, value: string) => {
    if (!currentExercise) return;
    setDrafts((prev) => ({ ...prev, [currentExercise.id]: { ...prev[currentExercise.id], [key]: value } }));
  };

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
    try {
      const logs = session.exercises.map((exercise) => ({ sessionExerciseId: exercise.id, ...drafts[exercise.id] }));
      const res = await fetch('/api/coach/me/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId: data.program.id, sessionId: session.id, logs, complete: true }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? `Failed to complete session (${res.status})`);
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
            <CardTitle className="text-2xl">No Assigned Workout</CardTitle>
            <CardDescription>A certified coach can assign your next program from the Coach tab.</CardDescription>
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Progress */}
      <div className="text-sm text-slate-400">
        Exercise {currentExerciseIndex + 1} of {session.exercises.length}
      </div>

      {/* Exercise Card */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">{currentExercise?.name}</CardTitle>
              <CardDescription>{currentExercise?.load}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Workout Prescription */}
          <div className="grid grid-cols-3 gap-4 bg-slate-700/50 rounded p-4">
            <div className="text-center">
              <p className="text-sm text-slate-400">Sets</p>
              <p className="text-2xl font-bold">{currentExercise?.sets}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-400">Reps</p>
              <p className="text-2xl font-bold">{currentExercise?.reps}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-400">Tempo</p>
              <p className="text-xl font-semibold">{currentExercise?.tempo}</p>
            </div>
          </div>

          {/* Cues */}
          {currentExercise?.coachNote && (
            <div>
              <h4 className="font-semibold mb-3 text-sm">Coach Note</h4>
              <p className="text-sm text-[#00E5FF]/80">{currentExercise.coachNote}</p>
            </div>
          )}

          <div>
            <h4 className="font-semibold mb-3 text-sm">Key Cues</h4>
            <ul className="space-y-2">
              {['Hit the prescribed tempo', 'Keep every rep clean', `Rest ${currentExercise?.restSeconds ?? 90}s between sets`].map((cue) => (
                <li key={cue} className="flex items-start gap-2 text-sm">
                  <span className="text-green-400 mt-1">✓</span>
                  <span>{cue}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Log Actuals */}
          <div className="bg-slate-700/50 rounded p-4 space-y-3">
            <p className="font-semibold text-sm">Log Your Actuals</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Sets completed"
                value={currentDraft?.actualSets ?? ''}
                onChange={(event) => updateDraft('actualSets', event.target.value)}
                className="px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
              />
              <input
                type="text"
                placeholder="Reps"
                value={currentDraft?.actualReps ?? ''}
                onChange={(event) => updateDraft('actualReps', event.target.value)}
                className="px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
              />
              <input
                type="text"
                placeholder="Load"
                value={currentDraft?.actualLoad ?? ''}
                onChange={(event) => updateDraft('actualLoad', event.target.value)}
                className="px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
              />
              <input
                type="number"
                placeholder="RPE"
                min="1"
                max="10"
                value={currentDraft?.rpe ?? ''}
                onChange={(event) => updateDraft('rpe', event.target.value)}
                className="px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
              />
            </div>
            <textarea
              placeholder="Notes (optional)"
              value={currentDraft?.clientNote ?? ''}
              onChange={(event) => updateDraft('clientNote', event.target.value)}
              className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

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
