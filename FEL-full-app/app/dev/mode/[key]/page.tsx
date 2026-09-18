import { notFound } from 'next/navigation';
import { DevModeRunner } from './loader';

export const dynamic = 'force-dynamic';

/** Dev-only generic mode runner. Hard 404 outside `next dev`. */
export default function DevModePage({ params }: { params: { key: string } }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <DevModeRunner modeKey={params.key} />;
}
