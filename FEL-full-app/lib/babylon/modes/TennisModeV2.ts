/**
 * PHASE 6 — TENNIS MODE (Canvas 2D → Babylon.js 3D)
 * 
 * Benchmark: Mario Tennis Aces (accessible arcade tennis + timing-based hits)
 * 
 * Spec:
 * - 3D court with net
 * - Player character with racket
 * - Ball with gravity + physics
 * - Timing-based hit mechanic (hit window visualization)
 * - Opponent AI or networked
 * - Score tracking (first to 4 points, deuce rules)
 */

import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import * as BABYLON from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { NetworkManager } from '../network/NetworkManager';

interface TennisGameState {
  playerScore: number;
  opponentScore: number;
  gamePhase: 'serving' | 'rally' | 'scoring' | 'gameOver';
  ballInCourt: boolean;
  hitWindowOpen: boolean;
  hitWindowTimer: number;
}

export const TennisModeV2: ModeDefinition = (() => {
  let scene: BABYLON.Scene;
  let player: SpawnedCharacter | null = null;
  let opponent: SpawnedCharacter | null = null;
  let ball: BABYLON.Mesh | null = null;
  let ballPhysics: BABYLON.PhysicsBody | null = null;
  let racketMesh: BABYLON.Mesh | null = null;
  let state: TennisGameState = {
    playerScore: 0,
    opponentScore: 0,
    gamePhase: 'serving',
    ballInCourt: false,
    hitWindowOpen: false,
    hitWindowTimer: 0,
  };
  let networkMgr: NetworkManager | null = null;

  async function buildCourt(ctx: ModeContext): Promise<void> {
    scene = ctx.scene;

    // Court ground
    const court = BABYLON.MeshBuilder.CreateGround(
      'court',
      { width: 18, height: 36 },
      scene
    );
    const courtMat = new BABYLON.StandardMaterial('courtMat', scene);
    courtMat.diffuse = new BABYLON.Color3(0.2, 0.7, 0.2); // Green
    court.material = courtMat;

    // Net
    const net = BABYLON.MeshBuilder.CreateBox(
      'net',
      { width: 18, height: 1.2, depth: 0.1 },
      scene
    );
    net.position.z = 0;
    net.position.y = 0.6;
    const netMat = new BABYLON.StandardMaterial('netMat', scene);
    netMat.diffuse = new BABYLON.Color3(1, 1, 1);
    net.material = netMat;

    // Court lines (boundary boxes for collision)
    const leftBoundary = BABYLON.MeshBuilder.CreateBox('leftBound', { width: 0.1, height: 0.1, depth: 36 }, scene);
    leftBoundary.position.x = -9;
    leftBoundary.isVisible = false;

    const rightBoundary = BABYLON.MeshBuilder.CreateBox('rightBound', { width: 0.1, height: 0.1, depth: 36 }, scene);
    rightBoundary.position.x = 9;
    rightBoundary.isVisible = false;

    const backBoundary = BABYLON.MeshBuilder.CreateBox('backBound', { width: 18, height: 0.1, depth: 0.1 }, scene);
    backBoundary.position.z = -18;
    backBoundary.isVisible = false;

    const netLineFront = BABYLON.MeshBuilder.CreateBox('netFront', { width: 18, height: 0.1, depth: 0.1 }, scene);
    netLineFront.position.z = 0.5;
    netLineFront.isVisible = false;
  }

  async function spawnPlayers(ctx: ModeContext): Promise<void> {
    // Player (local)
    player = await CharacterLibrary.spawn(ctx.scene, 'hero.glb', {
      position: new BABYLON.Vector3(-4, 0, -12),
      yawRad: Math.PI / 6, // Facing towards net
    });
    player.installSafePlay();

    // Opponent (AI or network)
    opponent = await CharacterLibrary.spawn(ctx.scene, 'hero.glb', {
      position: new BABYLON.Vector3(4, 0, 12),
      yawRad: -Math.PI / 6,
      tint: '#ff6600', // Orange tint
    });
    opponent.installSafePlay();

    // Racket (child of player hand)
    racketMesh = BABYLON.MeshBuilder.CreateBox('racket', { width: 0.2, height: 0.6, depth: 0.05 }, ctx.scene);
    racketMesh.parent = player.mesh; // Attach to player
    racketMesh.position = new BABYLON.Vector3(0.5, 1.5, 0); // Hand position approximation
  }

  async function spawnBall(ctx: ModeContext): Promise<void> {
    // Ball mesh
    ball = BABYLON.MeshBuilder.CreateSphere('ball', { diameter: 0.067 }, ctx.scene); // Standard tennis ball
    ball.position = new BABYLON.Vector3(-2, 2, -8); // Serve position
    const ballMat = new BABYLON.StandardMaterial('ballMat', ctx.scene);
    ballMat.diffuse = new BABYLON.Color3(1, 1, 0); // Yellow
    ball.material = ballMat;

    // Physics body
    ballPhysics = new BABYLON.PhysicsBody(ball, undefined, ctx.scene);
    ballPhysics.shape = new BABYLON.SphereShape(0.0335); // 67mm diameter
    ballPhysics.density = 1.5; // Tennis ball density
  }

  return {
    modeId: 'tennis',
    mood: 'courtside',
    camPreset: 'court',

    async load(ctx: ModeContext) {
      // Build 3D court
      await buildCourt(ctx);

      // Spawn characters
      await spawnPlayers(ctx);

      // Spawn ball
      await spawnBall(ctx);

      // Connect to multiplayer (if sessionId provided)
      if (ctx.modeConfig?.sessionId) {
        networkMgr = new NetworkManager();
        await networkMgr.connect(ctx.modeConfig.sessionId);
      }

      // Position camera for tennis-like view
      ctx.camera.position = new BABYLON.Vector3(0, 4, -25);
      ctx.camera.target = new BABYLON.Vector3(0, 1, 0);

      state.gamePhase = 'serving';
      ctx.setHud({
        score: `${state.playerScore} - ${state.opponentScore}`,
        time: 'SERVING',
      });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      if (state.gamePhase !== 'rally') return;

      // Movement
      if (e.type === 'motion') {
        player?.playAnim('walk');
      }

      // Attack = Hit racket
      if (e.type === 'action' && e.action === 'attack') {
        // Check if in hit window
        if (state.hitWindowOpen) {
          hitBall(ctx);
        } else {
          console.log('Missed hit window');
        }
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (!player || !ball || !opponent) return;

      // Hit window (when ball approaches racket)
      if (state.gamePhase === 'rally') {
        const ballToPlayer = BABYLON.Vector3.Distance(
          ball.position,
          player.mesh.position
        );
        const hitWindowDist = 3; // Racket reach
        state.hitWindowOpen = ballToPlayer < hitWindowDist;
        state.hitWindowTimer -= dt;
      }

      // Gravity on ball
      if (ballPhysics) {
        ballPhysics.applyForce(
          new BABYLON.Vector3(0, -9.8, 0),
          ball.getAbsolutePosition()
        );
      }

      // Ball out of bounds detection
      if (
        Math.abs(ball.position.x) > 9 ||
        Math.abs(ball.position.z) > 18 ||
        ball.position.y < 0
      ) {
        state.ballInCourt = false;
        endRally(ctx);
      }
    },

    dispose() {
      player?.dispose?.();
      opponent?.dispose?.();
      ball?.dispose();
      networkMgr?.disconnect();
    },
  };

  function hitBall(ctx: ModeContext): void {
    if (!ball) return;
    const force = new BABYLON.Vector3(
      Math.random() * 10 - 5,
      8,
      15 // Forward towards opponent
    );
    ballPhysics?.applyImpulse(force, ball.getAbsolutePosition());
    state.hitWindowOpen = false;
    player?.playAnim('swing_forehand');
    console.log('✅ Ball hit!');
  }

  function endRally(ctx: ModeContext): void {
    if (state.ballInCourt) {
      state.playerScore++;
    } else {
      state.opponentScore++;
    }

    if (state.playerScore >= 4 || state.opponentScore >= 4) {
      state.gamePhase = 'gameOver';
      const won = state.playerScore > state.opponentScore;
      ctx.end(won ? 'WIN' : 'LOSS', state.playerScore, {
        opponentScore: state.opponentScore,
      });
    } else {
      state.gamePhase = 'serving';
      ctx.setHud({
        score: `${state.playerScore} - ${state.opponentScore}`,
        time: 'SERVING',
      });
    }
  }
})();

export default TennisModeV2;
