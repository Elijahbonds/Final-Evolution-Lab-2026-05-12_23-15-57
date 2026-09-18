'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface ProgramSummary {
  tree: {
    id: string;
    name: string;
    blocks: Array<{ id: string; sessions: Array<{ id: string }> }>;
  };
  clientName: string;
  role: 'coach' | 'client' | null;
  isActive: boolean;
  completedSessionIds: string[];
}

export function ClientProgramsList() {
  const [programs, setPrograms] = React.useState<ProgramSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    fetch('/api/coach/programs')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `Failed to load programs (${res.status})`);
        if (live) setPrograms((data.programs ?? []).filter((p: ProgramSummary) => p.role === 'coach'));
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : 'Could not load programs');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12 text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading client programs...
      </div>
    );
  }

  if (error) {
    return <div className="rounded border border-red-500 bg-red-950/50 p-3 text-sm text-red-100">{error}</div>;
  }

  if (programs.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">My Clients</h2>
        <p className="text-slate-400 mb-4">No active programs yet. Create one from the Build Program tab.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Client Programs & Status</h2>

      <div className="grid gap-4">
        {programs.map((program) => {
          const sessions = program.tree.blocks.reduce((sum, block) => sum + block.sessions.length, 0);
          const completed = program.completedSessionIds.length;
          const compliance = sessions ? Math.round((completed / sessions) * 100) : 0;
          return (
            <Card key={program.tree.id} className="bg-slate-800 border-slate-700">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{program.tree.name}</CardTitle>
                    <CardDescription>Client: {program.clientName}</CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-blue-900 text-blue-200 border-blue-700">
                    {program.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-slate-400">Blocks</p>
                    <p className="font-semibold">{program.tree.blocks.length}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Compliance</p>
                    <p className="font-semibold">{compliance}%</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Sessions</p>
                    <p className="font-semibold">{completed}/{sessions}</p>
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                    View Program
                  </Button>
                  <Button size="sm" className="bg-slate-700 hover:bg-slate-600">
                    Edit
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
