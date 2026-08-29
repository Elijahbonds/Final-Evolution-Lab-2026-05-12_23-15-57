import { Suspense } from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { RigHarness } from './_components/rig-harness';

export const dynamic = 'force-dynamic';

// M65 Phase-0 rig gate. Dev-only harness for validating a candidate avatar
// GLB against the locked FEL skeleton spec (unprefixed bones). No 3D assets
// ship in this batch — point it at a candidate via ?avatar=/models/x.glb&anim=/anim/y.glb
export default async function RigDevPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050505]" />}>
      <RigHarness />
    </Suspense>
  );
}
