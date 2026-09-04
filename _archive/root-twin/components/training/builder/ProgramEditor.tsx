'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';

export function ProgramEditor() {
  const [programs, setPrograms] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    clientId: '',
    durationWeeks: 12,
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'durationWeeks' ? parseInt(value) : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement program creation via API
    console.log('Create program:', formData);
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Build Training Program</h2>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          <Plus size={18} /> New Program
        </Button>
      </div>

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

              <div>
                <label className="block text-sm font-medium mb-1">Duration (weeks)</label>
                <Input
                  name="durationWeeks"
                  type="number"
                  value={formData.durationWeeks}
                  onChange={handleInputChange}
                  min="1"
                  max="52"
                />
              </div>

              <div className="flex gap-3">
                <Button type="submit" className="bg-green-600 hover:bg-green-700">
                  Create Program
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

      {programs.length === 0 && !showForm && (
        <div className="text-center py-12">
          <p className="text-slate-400 mb-4">No programs yet. Create one to get started!</p>
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus size={18} /> Create Program
          </Button>
        </div>
      )}
    </div>
  );
}
