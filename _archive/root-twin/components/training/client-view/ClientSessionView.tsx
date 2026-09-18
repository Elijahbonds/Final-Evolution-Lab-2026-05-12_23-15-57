'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';

export function ClientSessionView() {
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);

  // Dummy session data
  const dummySession = {
    id: 'session-001',
    label: 'Day 1 - Lower Power',
    exercises: [
      {
        id: 'ex-001',
        name: 'Back Squat',
        sets: 4,
        reps: '6-8',
        load: '80% 1RM',
        tempo: '3-1-1-0',
        primaryCues: ['Chest up, weight in heels', 'Knee over toes', 'Depth to parallel'],
        commonFaults: [
          { fault: 'Rounding forward', correctionCue: 'Chest up, core engaged' },
        ],
      },
      {
        id: 'ex-002',
        name: 'Leg Lunge',
        sets: 3,
        reps: '10',
        load: '35 lbs',
        tempo: '2-0-1-0',
        primaryCues: ['Step far forward', 'Back knee nearly touches floor', 'Stay upright'],
      },
      {
        id: 'ex-003',
        name: 'Leg Press',
        sets: 3,
        reps: '12-15',
        load: 'RPE 7',
        tempo: '3-0-1-0',
        primaryCues: ['Full range of motion', 'Controlled eccentric', 'Lockout each rep'],
      },
    ],
  };

  const currentExercise = dummySession.exercises[currentExerciseIndex];
  const isLastExercise = currentExerciseIndex === dummySession.exercises.length - 1;

  const handleNextExercise = () => {
    if (!isLastExercise) {
      setCurrentExerciseIndex((prev) => prev + 1);
    }
  };

  const handlePrevExercise = () => {
    if (currentExerciseIndex > 0) {
      setCurrentExerciseIndex((prev) => prev - 1);
    }
  };

  const handleCompleteSession = () => {
    setSessionActive(false);
    setCurrentExerciseIndex(0);
    // TODO: Send completion to API
  };

  if (!sessionActive) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Ready to Train?</CardTitle>
            <CardDescription>You have a workout scheduled for today</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-slate-700/50 rounded p-4">
              <h3 className="font-semibold mb-2">{dummySession.label}</h3>
              <p className="text-sm text-slate-400">{dummySession.exercises.length} exercises</p>
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
        Exercise {currentExerciseIndex + 1} of {dummySession.exercises.length}
      </div>

      {/* Exercise Card */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">{currentExercise.name}</CardTitle>
              <CardDescription>{currentExercise.load}</CardDescription>
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
              <p className="text-sm text-slate-400">Reps</p>
              <p className="text-2xl font-bold">{currentExercise.reps}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-400">Tempo</p>
              <p className="text-xl font-semibold">{currentExercise.tempo}</p>
            </div>
          </div>

          {/* Cues */}
          <div>
            <h4 className="font-semibold mb-3 text-sm">Key Cues</h4>
            <ul className="space-y-2">
              {currentExercise.primaryCues.map((cue, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-green-400 mt-1">✓</span>
                  <span>{cue}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Common Faults */}
          {currentExercise.commonFaults && currentExercise.commonFaults.length > 0 && (
            <div>
              <h4 className="font-semibold mb-3 text-sm">Watch For</h4>
              <ul className="space-y-2">
                {currentExercise.commonFaults.map((fault, i) => (
                  <li key={i} className="text-sm bg-red-900/20 border border-red-700 rounded p-2">
                    <p className="font-medium text-red-300">{fault.fault}</p>
                    <p className="text-red-200 text-xs mt-1">→ {fault.correctionCue}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Log Actuals */}
          <div className="bg-slate-700/50 rounded p-4 space-y-3">
            <p className="font-semibold text-sm">Log Your Actuals</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Sets completed"
                className="px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
              />
              <input
                type="text"
                placeholder="Reps"
                className="px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
              />
              <input
                type="text"
                placeholder="Load"
                className="px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
              />
              <input
                type="number"
                placeholder="RPE"
                min="1"
                max="10"
                className="px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
              />
            </div>
            <textarea
              placeholder="Notes (optional)"
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
            className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
          >
            Complete Session
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
