'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExerciseLibrary } from './library/ExerciseLibrary';
import { ProgramEditor } from './builder/ProgramEditor';
import { ClientProgramsList } from './builder/ClientProgramsList';
import { ClientSessionView } from './client-view/ClientSessionView';

export function TrainingCoachDashboard() {
  const [activeTab, setActiveTab] = useState('exercises');

  return (
    <div className="w-full h-full bg-gradient-to-b from-slate-900 to-slate-800 text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Coach Programming System</h1>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="exercises">Exercise Library</TabsTrigger>
            <TabsTrigger value="programs">Build Program</TabsTrigger>
            <TabsTrigger value="clients">My Clients</TabsTrigger>
          </TabsList>

          <TabsContent value="exercises" className="space-y-4">
            <ExerciseLibrary />
          </TabsContent>

          <TabsContent value="programs" className="space-y-4">
            <ProgramEditor />
          </TabsContent>

          <TabsContent value="clients" className="space-y-4">
            <ClientProgramsList />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export function TrainingClientView() {
  return (
    <div className="w-full h-full bg-gradient-to-b from-slate-900 to-slate-800 text-white p-4 md:p-6">
      <ClientSessionView />
    </div>
  );
}

export function TrainingTab() {
  // Determine if user is coach or client
  // For now, show coach dashboard
  // In production: check user.role or permissions
  return <TrainingCoachDashboard />;
}
