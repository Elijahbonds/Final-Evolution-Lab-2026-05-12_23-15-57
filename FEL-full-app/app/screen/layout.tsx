import { ScreenErrorBoundary } from '@/app/play/mirror/assess/_components/screen-error-boundary';

// /screen/**: the Quick Screen's own crash catcher. A crash shows the recovery screen and sends no report (SCREEN-FIX-2
// amend 4; app/play/mirror/assess/_components/screen-error-boundary.tsx).
export default function ScreenLayout({ children }: { children: React.ReactNode }) {
  return <ScreenErrorBoundary>{children}</ScreenErrorBoundary>;
}
