import type { Metadata } from 'next';

export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Coach dashboard' };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
