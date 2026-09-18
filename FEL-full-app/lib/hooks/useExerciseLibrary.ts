import { useState, useCallback, useEffect } from 'react';

export interface Exercise {
  id: string;
  coachId: string;
  name: string;
  category: string;
  demoVideoUrl?: string;
  primaryCues: string[];
  commonFaults?: Array<{ fault: string; correctionCue: string }>;
  equipment: string[];
  defaultTempo: string;
  progressionOfId?: string;
  regressionOfId?: string;
  createdAt: string;
  updatedAt: string;
}

export function useExerciseLibrary() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all exercises
  const fetchExercises = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/coach/programs/exercises');
      if (!res.ok) throw new Error(`Failed to fetch exercises: ${res.statusText}`);
      const data = await res.json();
      setExercises(data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create exercise
  const createExercise = useCallback(
    async (exercise: Omit<Exercise, 'id' | 'coachId' | 'createdAt' | 'updatedAt'>) => {
      try {
        const res = await fetch('/api/coach/programs/exercises', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(exercise),
        });
        if (!res.ok) throw new Error(`Failed to create exercise: ${res.statusText}`);
        const data = await res.json();
        setExercises((prev) => [...prev, data]);
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        throw err;
      }
    },
    []
  );

  // Update exercise
  const updateExercise = useCallback(
    async (id: string, updates: Partial<Exercise>) => {
      try {
        const res = await fetch(`/api/coach/programs/exercises/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        if (!res.ok) throw new Error(`Failed to update exercise: ${res.statusText}`);
        const data = await res.json();
        setExercises((prev) => prev.map((ex) => (ex.id === id ? data : ex)));
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        throw err;
      }
    },
    []
  );

  // Delete exercise
  const deleteExercise = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/coach/programs/exercises/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed to delete exercise: ${res.statusText}`);
      setExercises((prev) => prev.filter((ex) => ex.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchExercises();
  }, [fetchExercises]);

  return {
    exercises,
    loading,
    error,
    fetchExercises,
    createExercise,
    updateExercise,
    deleteExercise,
  };
}
