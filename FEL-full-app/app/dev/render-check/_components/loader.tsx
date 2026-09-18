'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const spinner = () => (
  <div className="flex h-screen items-center justify-center bg-black">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

// Babylon touches window/document at module scope — must never be server-rendered.
const RenderCheck = dynamicImport(() => import('@/components/dev/render-check'), { ssr: false, loading: spinner });

export function RenderCheckLoader() {
  return <RenderCheck />;
}
