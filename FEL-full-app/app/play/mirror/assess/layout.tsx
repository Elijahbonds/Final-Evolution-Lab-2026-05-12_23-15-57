import { ScreenErrorBoundary } from './_components/screen-error-boundary';

// The Quick Screen's own crash catcher, inside the /play one (app/play/layout.tsx): a crash here shows the recovery
// screen and sends no report (SCREEN-FIX-2 amend 4; _components/screen-error-boundary.tsx).
export default function AssessLayout({ children }: { children: React.ReactNode }) {
  return <ScreenErrorBoundary>{children}</ScreenErrorBoundary>;
}
