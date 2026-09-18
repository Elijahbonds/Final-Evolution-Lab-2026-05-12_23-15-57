'use client';

// Wraps EVERY /play/* route in the branded error boundary so a component crash
// shows the recovery screen (retry / back to hub) instead of a blank page (M31).

import { GlobalErrorBoundary } from '@/components/reliability/global-error-boundary';

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return <GlobalErrorBoundary>{children}</GlobalErrorBoundary>;
}
