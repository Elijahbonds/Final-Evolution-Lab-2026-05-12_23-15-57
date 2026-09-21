'use client';

// Wraps EVERY /play/* route in the branded error boundary so a component crash
// shows the recovery screen (retry / back to hub) instead of a blank page (M31).
//
// It is also where the CAPTION REGION lives (2026-09-21). A live region must exist in the DOM BEFORE its text
// changes — mounting one and filling it in the same tick is announced by almost no screen reader — so it belongs
// at the layout level, mounted once for every mode, rather than inside any mode's own HUD.
//
// `visible={false}`: the modes already draw their banners and callouts on the canvas. Drawing them a second time
// in HTML would just be a duplicate for sighted players; what was missing was the announcement.

import { GlobalErrorBoundary } from '@/components/reliability/global-error-boundary';
import { CaptionRegion } from '@/lib/babylon/ui/CaptionRegion';

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <GlobalErrorBoundary>
      <CaptionRegion visible={false} />
      {children}
    </GlobalErrorBoundary>
  );
}
