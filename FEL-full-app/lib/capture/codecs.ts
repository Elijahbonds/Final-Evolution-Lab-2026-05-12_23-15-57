// codecs — which MediaRecorder mime to ask for, and what to say when the browser refuses the first one.
//
// iOS Safari has shipped MediaRecorder for mp4 and not for webm. An unguarded 'video/webm' throws there
// instead of recording. The list is best-first; the first one isTypeSupported accepts wins. When none of
// them is accepted, mime is null and the caller may try the browser's default — and the note says so.

export const CODEC_CHOICES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
] as const;

export interface CodecPick {
  mime: string | null;
  /** Set whenever the first choice was not used, including a browser that names no codec at all. */
  fallbackNote: string | null;
}

const IOS = /iPhone|iPad|iPod/;

export function pickCodec(isTypeSupported: (mime: string) => boolean, ua = ''): CodecPick {
  let supported: string | null = null;
  for (const mime of CODEC_CHOICES) {
    try {
      if (isTypeSupported(mime)) { supported = mime; break; }
    } catch { /* a broken isTypeSupported is a no, not a crash */ }
  }
  if (!supported) {
    return {
      mime: null,
      fallbackNote: 'This browser would not name a codec. Recording will try the browser default. On iOS Safari that is usually an MPEG-4 file.',
    };
  }
  if (supported === CODEC_CHOICES[0]) return { mime: supported, fallbackNote: null };
  const ios = IOS.test(ua);
  return {
    mime: supported,
    fallbackNote: ios
      ? `iOS Safari cannot record ${CODEC_CHOICES[0]}. This clip uses ${supported} instead.`
      : `This browser cannot record ${CODEC_CHOICES[0]}. This clip uses ${supported} instead.`,
  };
}
