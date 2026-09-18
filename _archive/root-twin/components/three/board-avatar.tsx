'use client';

/**
 * components/three/board-avatar.tsx
 *
 * Adapter that bridges the board-sports clip API (ref + src + position/scale,
 * play(name,{loop,fade})) onto the app's canonical <Avatar url onReady .../>
 * controller. Keeps board-sports-3d.tsx decoupled from the live avatar shape.
 */

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Avatar, type AvatarHandle } from '@/components/three/avatar';

export interface AvatarClipHandle {
  play(name: string, opts?: { loop?: boolean; fade?: number }): void;
  stopAll(): void;
  clipNames?: string[];
  scrub?(name: string, time: number): void;
}

export interface BoardAvatarProps {
  src: string;
  position?: [number, number, number];
  scale?: number;
  tint?: string;
}

/**
 * Note: trick clips (skate_trick/snow_trick/surf_ride) are not embedded in the
 * hero GLB yet, so play() of a missing clip is a safe no-op — the board keeps
 * its current pose while board-sports-3d drives the procedural board rotation.
 */
export const BoardAvatar = forwardRef<AvatarClipHandle, BoardAvatarProps>(
  function BoardAvatar({ src, position = [0, 0, 0], scale = 1, tint }, ref) {
    const handleRef = useRef<AvatarHandle | null>(null);
    const [, setReady] = useState(false);

    useImperativeHandle(
      ref,
      (): AvatarClipHandle => ({
        play(name, opts) {
          const h = handleRef.current;
          if (!h) return;
          if (!h.clipNames || !h.clipNames.includes(name)) return; // missing clip -> keep current
          h.play(name, { loop: opts?.loop, fadeIn: opts?.fade });
        },
        stopAll() {
          handleRef.current?.stopAll();
        },
        get clipNames() {
          return handleRef.current?.clipNames ?? [];
        },
        scrub(name, _time) {
          const h = handleRef.current;
          if (!h) return;
          // Trick-specific clips are not in the hero GLB yet; freezing the
          // primary clip would show a bind pose, so ignore missing clips and
          // let the looping ride clip keep playing.
          if (!h.clipNames || !h.clipNames.includes(name)) return;
          h.play(name, { loop: true });
        },
      }),
      []
    );

    return (
      <group position={position} scale={scale} rotation={[0, Math.PI, 0]}>
        <Avatar
          url={src}
          clipName="run"
          stripRoot
          tint={tint}
          onReady={(h) => {
            handleRef.current = h;
            // Ride idle: loop the run cycle so the rider is never in a T-pose.
            if (h.clipNames?.includes('run')) h.play('run', { loop: true });
            setReady(true);
          }}
        />
      </group>
    );
  }
);
