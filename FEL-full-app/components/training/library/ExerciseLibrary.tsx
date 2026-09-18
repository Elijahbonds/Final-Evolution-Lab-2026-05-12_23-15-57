'use client';

import React, { useState } from 'react';
import { useExerciseLibrary } from '@/lib/hooks/useExerciseLibrary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Edit } from 'lucide-react';

export function ExerciseLibrary() {
  const { exercises, loading, error, createExercise, deleteExercise } = useExerciseLibrary();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: 'lower-body',
    demoVideoUrl: '',
    primaryCues: ['', '', ''],
    commonFaults: [{ fault: '', correctionCue: '' }],
    equipment: [''],
    defaultTempo: '3-1-1-0',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCueChange = (index: number, value: string) => {
    const newCues = [...formData.primaryCues];
    newCues[index] = value;
    setFormData((prev) => ({ ...prev, primaryCues: newCues }));
  };

  const handleEquipmentChange = (index: number, value: string) => {
    const newEquipment = [...formData.equipment];
    newEquipment[index] = value;
    setFormData((prev) => ({ ...prev, equipment: newEquipment }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const exercise = {
        name: formData.name,
        category: formData.category,
        demoVideoUrl: formData.demoVideoUrl || undefined,
        primaryCues: formData.primaryCues.filter((c) => c.trim()),
        commonFaults: formData.commonFaults.filter((f) => f.fault && f.correctionCue),
        equipment: formData.equipment.filter((e) => e.trim()),
        defaultTempo: formData.defaultTempo,
      };

      await createExercise(exercise as any);

      // Reset form
      setFormData({
        name: '',
        category: 'lower-body',
        demoVideoUrl: '',
        primaryCues: ['', '', ''],
        commonFaults: [{ fault: '', correctionCue: '' }],
        equipment: [''],
        defaultTempo: '3-1-1-0',
      });
      setShowForm(false);
    } catch (err) {
      console.error('Failed to create exercise:', err);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading exercises...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Exercise Library</h2>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          <Plus size={18} /> Add Exercise
        </Button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-500 rounded p-4 text-red-200">{error}</div>
      )}

      {showForm && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle>New Exercise</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Exercise Name *</label>
                  <Input
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g., Back Squat"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Category *</label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  >
                    <option value="lower-body">Lower Body</option>
                    <option value="upper-push">Upper Push</option>
                    <option value="upper-pull">Upper Pull</option>
                    <option value="core">Core</option>
                    <option value="mobility">Mobility</option>
                    <option value="conditioning">Conditioning</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Demo Video URL</label>
                <Input
                  name="demoVideoUrl"
                  value={formData.demoVideoUrl}
                  onChange={handleInputChange}
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Primary Cues (max 3)</label>
                <div className="space-y-2">
                  {formData.primaryCues.map((cue, i) => (
                    <Input
                      key={i}
                      value={cue}
                      onChange={(e) => handleCueChange(i, e.target.value)}
                      placeholder={`Cue ${i + 1}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <Button type="submit" className="bg-green-600 hover:bg-green-700">
                  Save Exercise
                </Button>
                <Button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="bg-slate-700 hover:bg-slate-600"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {exercises.map((exercise) => (
          <Card key={exercise.id} className="bg-slate-800 border-slate-700">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{exercise.name}</CardTitle>
                  <CardDescription>{exercise.category}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost">
                    <Edit size={16} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteExercise(exercise.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {exercise.primaryCues.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-300">Cues:</p>
                  <ul className="text-sm text-slate-400 ml-4">
                    {exercise.primaryCues.map((cue, i) => (
                      <li key={i}>• {cue}</li>
                    ))}
                  </ul>
                </div>
              )}
              {exercise.equipment.length > 0 && (
                <p className="text-sm text-slate-400">Equipment: {exercise.equipment.join(', ')}</p>
              )}
              <p className="text-sm text-slate-400">Tempo: {exercise.defaultTempo}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
