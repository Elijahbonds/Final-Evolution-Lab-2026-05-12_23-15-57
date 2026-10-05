'use client';

// Record, last-30s, export shape, share, and stream mode. Mounted once by GameShell, so every mode has it.
// The canvas is captured. The DOM around it is not, except in stream mode, which is for OBS and a phone's
// own screen broadcast — that one is the page, and the chrome hides.

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { SoundKit } from '@/lib/babylon/audio/SoundKit';
import type { Aspect } from '@/lib/capture/exportLayout';
import { exportFramed } from '@/lib/capture/exportVideo';
import { canvasSegmentSource, GameRecorder } from '@/lib/capture/gameRecorder';
import { REC_IDLE, type RecModel } from '@/lib/capture/recorderMachine';
import { downloadBlob, deliverClip, extForMime, shareFileName } from '@/lib/capture/shareClip';
import { CaptureHudView, STREAM_FRAME_CSS, StreamGuides } from './capture-hud-view';
import { DunkFilm } from './dunk-film';

const DUNK_FILM_MODES = new Set(['dunkContest', 'dunkduel', 'irl']);

function largestCanvas(root: HTMLElement | null): HTMLCanvasElement | null {
  const list = root?.querySelectorAll('canvas') ?? [];
  let best: HTMLCanvasElement | null = null;
  let area = 0;
  list.forEach((c) => {
    const box = c.getBoundingClientRect();
    const a = box.width * box.height;
    if (a > area) { area = a; best = c; }
  });
  return best;
}

function fallbackClipBlob(blobs: readonly Blob[]): Blob {
  if (blobs.length === 1) return blobs[0];
  return new Blob(Array.from(blobs), { type: blobs[0]?.type || 'video/webm' });
}

export function GameCaptureHud(props: {
  mode: string;
  stageRef: RefObject<HTMLDivElement | null>;
  streamOn: boolean;
  onStreamMode: (on: boolean) => void;
}) {
  const recorder = useRef<GameRecorder | null>(null);
  const [model, setModel] = useState<RecModel>(REC_IDLE);
  const [aspect, setAspect] = useState<Aspect>('16:9');
  const [note, setNote] = useState<string | null>(null);
  const [codecNote, setCodecNote] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [film, setFilm] = useState(false);

  const sync = (rec: GameRecorder) => setModel({ ...rec.model });

  const ensure = useCallback((): GameRecorder | null => {
    if (recorder.current) return recorder.current;
    const canvas = largestCanvas(props.stageRef.current);
    if (!canvas) {
      setNote('The game picture is not on screen yet.');
      return null;
    }
    const rec = new GameRecorder(
      canvasSegmentSource(canvas, () => SoundKit.captureMix(), (pick) => {
        setCodecNote(pick.fallbackNote);
      }),
      () => Date.now(),
      (next) => {
        setModel(next);
        setNote(next.note);
      },
    );
    recorder.current = rec;
    return rec;
  }, [props.stageRef]);

  const onRecord = () => {
    SoundKit.unlock();
    const rec = ensure();
    if (!rec) return;
    void (async () => {
      if (rec.model.phase === 'recording') await rec.stop();
      else await rec.record();
      sync(rec);
      setNote(rec.model.note);
    })();
  };

  const onReplay = () => {
    SoundKit.unlock();
    const rec = ensure();
    if (!rec) return;
    void (async () => {
      if (rec.model.phase === 'buffering' || rec.model.phase === 'recording') await rec.saveReplay();
      else await rec.armBuffer();
      sync(rec);
      setNote(rec.model.note);
    })();
  };

  const onShare = async (which: 'take' | 'replay') => {
    const rec = recorder.current;
    const blobs = which === 'take' ? rec?.take ?? [] : rec?.replay ?? [];
    if (!blobs.length || busy) {
      setNote(which === 'take' ? 'Stop the recording first.' : 'Save the last 30 seconds first.');
      return;
    }
    setBusy(true);
    try {
      const framed = await exportFramed(blobs.map((blob) => ({ blob })), aspect, location.origin);
      const blob = framed ?? fallbackClipBlob(blobs);
      const name = shareFileName(which === 'replay' ? 'replay' : 'game', aspect, extForMime(blob.type));
      const plan = await deliverClip(blob, name, 'FEL', {
        share: typeof navigator !== 'undefined' && navigator.share ? (data) => navigator.share(data) : undefined,
        canShare: typeof navigator !== 'undefined' && navigator.canShare ? (data) => navigator.canShare!(data) : undefined,
        download: downloadBlob,
      });
      const framedNote = framed ? '' : ' The reframed file could not be built, so this keeps the original recording pieces.';
      setNote(plan.kind === 'sheet'
        ? `Share sheet opened. Nothing is posted until you send it.${framedNote}`
        : `Downloaded ${name}. This browser could not open a share sheet for a video file.${framedNote}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Share did not finish.');
    } finally {
      setBusy(false);
    }
  };

  const onDiscard = () => {
    const rec = recorder.current;
    if (!rec) {
      setModel(REC_IDLE);
      setNote(null);
      return;
    }
    void (async () => {
      await rec.discard();
      sync(rec);
      setNote(null);
    })();
  };

  const onStream = () => {
    const next = !props.streamOn;
    if (next) setHidden(true);
    props.onStreamMode(next);
  };

  useEffect(() => () => {
    const rec = recorder.current;
    recorder.current = null;
    if (rec) void rec.discard();
  }, []);

  return (
    <>
      <style>{STREAM_FRAME_CSS}</style>
      <div
        data-capture-ui="1"
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 45,
          pointerEvents: 'auto',
        }}
      >
        <CaptureHudView
          phase={model.phase}
          aspect={aspect}
          streamOn={props.streamOn}
          controlsHidden={hidden}
          note={note}
          codecNote={codecNote}
          dunkFilm={DUNK_FILM_MODES.has(props.mode)}
          canShareTake={model.take}
          canShareReplay={model.replay}
          busy={busy}
          onRecord={onRecord}
          onReplay={onReplay}
          onAspect={setAspect}
          onShare={(which) => { void onShare(which); }}
          onDiscard={onDiscard}
          onStream={onStream}
          onHide={() => setHidden(true)}
          onShow={() => setHidden(false)}
          onFilm={() => setFilm(true)}
        />
      </div>
      {props.streamOn && !hidden ? <StreamGuides /> : null}
      {film ? <DunkFilm onClose={() => setFilm(false)} /> : null}
    </>
  );
}
