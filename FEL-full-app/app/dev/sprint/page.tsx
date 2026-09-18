import { notFound } from 'next/navigation';
import { DevSprintLoader } from './loader';

export const dynamic = 'force-dynamic';

export default function DevSprintPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <DevSprintLoader />;
}
