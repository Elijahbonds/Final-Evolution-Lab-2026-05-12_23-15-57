// Acting discipline — AUDIO-ONLY scene performance (legal-constrained: no
// likeness capture, no video, until legal review clears). Recordings become
// commentary lines and callouts; they enter moderation before public use.

export class VoiceCapture {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];

  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    this.recorder.ondataavailable = (e) => this.chunks.push(e.data);
    this.recorder.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.recorder) return resolve(new Blob());
      this.recorder.onstop = () => {
        this.recorder!.stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: 'audio/webm' }));
      };
      this.recorder.stop();
    });
  }
}

export interface ScenePrompt { id: string; line: string; slot: string }

export const SCENE_PROMPTS: ScenePrompt[] = [
  { id: 'sc_dunk_call', line: 'Call the dunk you just saw.', slot: 'commentary_dunk' },
  { id: 'sc_buzzer', line: 'Buzzer beater. React.', slot: 'commentary_clutch' },
  { id: 'sc_trashtalk', line: 'Talk your talk before the 1v1.', slot: 'taunt_pregame' },
  { id: 'sc_celebration', line: 'You just won. Say something.', slot: 'celebration' },
  { id: 'sc_intro', line: 'Introduce yourself to the crowd.', slot: 'player_intro' },
];

/** Where recorded lines play back in-game, keyed by prompt slot. */
export const SLOT_TRIGGERS: Record<string, string> = {
  commentary_dunk: 'on dunk GREAT/PERFECT (own sessions, or opted-in public)',
  commentary_clutch: 'on clutch-time scores',
  taunt_pregame: 'versus-mode intro screens',
  celebration: 'result screen on wins',
  player_intro: 'mode boot splash',
};
