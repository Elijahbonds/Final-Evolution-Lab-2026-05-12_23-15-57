'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const spinner = () => (
  <div className="flex min-h-[100dvh] items-center justify-center bg-[#07090d]">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

// WebRTC + DeviceOrientation are browser-only; never server-render this.
const ControllerPage = dynamicImport(() => import('@/components/controller-link/controller-page'), {
  ssr: false, loading: spinner,
});

export function ControllerLoader({ code }: { code: string }) {
  return <ControllerPage code={code} />;
}
