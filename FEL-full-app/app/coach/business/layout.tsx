import type { Metadata } from 'next';

export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Your coaching business' };

export default function CoachBusinessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
