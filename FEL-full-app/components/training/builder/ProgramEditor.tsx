'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus } from 'lucide-react';

interface ProgramSummary {
  tree: {
    id: string;
    name: string;
    blocks: Array<{ id: string; sessions: Array<{ id: string }> }>;
  };
  clientName: string;
  isActive: boolean;
}

export function ProgramEditor() {
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    clientId: '',
    durationWeeks: 4,
    sessionsPerWeek: 3,
  });

  const loadPrograms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/coach/programs');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Failed to load programs (${res.status})`);
      setPrograms((data.programs ?? []).filter((p: ProgramSummary & { role?: string }) => p.role === 'coach'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load programs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrograms();
  }, [loadPrograms]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'durationWeeks' || name === 'sessionsPerWeek' ? parseInt(value, 10) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/coach/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Failed to create program (${res.status})`);
      if (data.program) setPrograms((prev) => [data.program, ...prev]);
      setFormData({ name: '', clientId: '', durationWeeks: 4, sessionsPerWeek: 3 });
      setShowForm(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create program');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Build Training Program</h2>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          <Plus size={18} /> New Program
        </Button>
      </div>

      {error && (
        <div className="rounded border border-red-500 bg-red-950/50 p-3 text-sm text-red-100">{error}</div>
      )}

      {showForm && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle>Create Program</CardTitle>
            <CardDescription>Build a new training program for a client</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Program Name *</label>
                  <Input
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g., 12-Week Strength Block"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Select Client *</label>
                  <Input
                    name="clientId"
                    value={formData.clientId}
                    onChange={handleInputChange}
                    placeholder="Client ID or email"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Duration (weeks)</label>
                  <Input
                    name="durationWeeks"
                    type="number"
                    value={formData.durationWeeks}
                    onChange={handleInputChange}
                    min="1"
                    max="12"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Sessions per week</label>
                  <Input
                    name="sessionsPerWeek"
                    type="number"
                    value={formData.sessionsPerWeek}
                    onChange={handleInputChange}
                    min="1"
                    max="7"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Program'}
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

      {loading && (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading programs...
        </div>
      )}

      {!loading && programs.length === 0 && !showForm && (
        <div className="text-center py-12">
          <p className="text-slate-400 mb-4">No programs yet. Create one to get started!</p>
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus size={18} /> Create Program
          </Button>
        </div>
      )}

      {programs.length > 0 && (
        <div className="grid gap-4">
          {programs.map((program) => {
            const sessions = program.tree.blocks.reduce((sum, block) => sum + block.sessions.length, 0);
            return (
              <Card key={program.tree.id} className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle>{program.tree.name}</CardTitle>
                  <CardDescription>Client: {program.clientName}</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-slate-400">Blocks</p>
                    <p className="font-semibold">{program.tree.blocks.length}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Sessions</p>
                    <p className="font-semibold">{sessions}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Status</p>
                    <p className="font-semibold">{program.isActive ? 'Active' : 'Inactive'}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
