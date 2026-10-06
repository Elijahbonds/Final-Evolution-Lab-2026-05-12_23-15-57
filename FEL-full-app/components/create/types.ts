// components/create/types.ts — CREATE HUB: what step 1 hands the flow.
import type { ArtPayloadBody } from '@/lib/creator/creative-card-types';

/** A file made on this device, uploaded only at submit (lib/create/flow.ts PENDING_MEDIA). */
export interface PendingMedia { blob: Blob; fileName: string; contentType: string; durationSec?: number }

/** Step 1's result: the payload (pending media as placeholder addresses), a suggested title, and what to preview. */
export interface MadeThing {
  art: ArtPayloadBody;
  title?: string;
  /** field → the file to upload into it at submit */
  media?: Record<string, PendingMedia>;
  /** a blob: URL the preview plays (the rendered mix, the recorded line) */
  previewUrl?: string;
}

export interface FlowProps {
  publicCreator: boolean;
  creatorName: string;
  userId: string;
}
