'use client';

import dynamicImport from 'next/dynamic';

const Harness = dynamicImport(() => import('@/components/dev/controller-link-harness'), { ssr: false });

export function HarnessLoader() {
  return <Harness />;
}
