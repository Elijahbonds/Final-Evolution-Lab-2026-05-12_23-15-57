'use client';

import dynamicImport from 'next/dynamic';

// Client-only: it needs the camera, and the MediaPipe bundle it pulls in has no business in a server render.
const PoseRecorder = dynamicImport(() => import('@/components/dev/pose-recorder/pose-recorder'), { ssr: false });

export function PoseRecordLoader() {
  return <PoseRecorder />;
}
