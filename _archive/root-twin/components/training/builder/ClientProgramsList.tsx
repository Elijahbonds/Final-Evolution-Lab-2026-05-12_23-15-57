'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function ClientProgramsList() {
  const [programs] = React.useState<any[]>([]);

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
        {programs.map((program: any) => (
          <Card key={program.id} className="bg-slate-800 border-slate-700">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{program.name}</CardTitle>
                  <CardDescription>Client: {program.clientId}</CardDescription>
                </div>
                <Badge variant="outline" className="bg-blue-900 text-blue-200 border-blue-700">
                  {program.status || 'Active'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-slate-400">Duration</p>
                  <p className="font-semibold">{program.durationWeeks} weeks</p>
                </div>
                <div>
                  <p className="text-slate-400">Compliance</p>
                  <p className="font-semibold">--</p>
                </div>
                <div>
                  <p className="text-slate-400">Sessions</p>
                  <p className="font-semibold">--</p>
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
        ))}
      </div>
    </div>
  );
}
