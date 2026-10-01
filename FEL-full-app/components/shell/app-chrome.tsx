'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { isQuickScreenPath } from '@/lib/screen/routes';

const StatusRail = dynamic(
  () => import('@/components/shell/status-rail').then((m) => ({ default: m.StatusRail })),
  { ssr: false },
);
const TabBar = dynamic(
  () => import('@/components/shell/tab-bar').then((m) => ({ default: m.TabBar })),
  { ssr: false },
);

/** Status rail and tab bar load only off the Quick Screen paths (SCREEN-HARDEN F4). */
export function AppChrome() {
  const pathname = usePathname() || '/';
  if (isQuickScreenPath(pathname)) return null;
  return (
    <>
      <StatusRail />
      <TabBar />
    </>
  );
}
