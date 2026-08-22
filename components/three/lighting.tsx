'use client';

import * as THREE from 'three';

/* ================================================================
   Premium-dark lighting rigs for FEL.
   Each variant is tuned for its venue/mood while staying within
   performance budget (1 shadow-caster, ≤6 lights total).
   ================================================================ */

// ------- Venice Beach (outdoor, night, neon accents) -------
export function SceneLighting({ shadows = true, variant = 'venice' }: {
  shadows?: boolean;
  variant?: 'venice' | 'dojo' | 'blue-court' | 'skatepark';
}) {
  if (variant === 'dojo') return <DojoLighting shadows={shadows} />;
  if (variant === 'blue-court') return <BlueCourtLighting shadows={shadows} />;
  if (variant === 'skatepark') return <SkateparkLighting shadows={shadows} />;
  return <VeniceLighting shadows={shadows} />;
}

function SkateparkLighting({ shadows }: { shadows: boolean }) {
  return (
    <>
      {/* Golden-hour dusk sky over the Venice skatepark */}
      <hemisphereLight args={[0xffa060, 0x1a0f2e, 0.5]} />
      <directionalLight
        position={[6, 11, -4]}
        intensity={2.6}
        color={0xffb374}
        castShadow={shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {/* Cool fill from the opposite side to model the twilight sky */}
      <directionalLight position={[-6, 7, 4]} intensity={0.7} color={0x7788ff} />
      {/* Warm sunset rim to pop ramps and the skater silhouette */}
      <spotLight
        position={[-4, 8, -6]}
        angle={0.6}
        penumbra={0.7}
        intensity={42}
        color={0xff7733}
        distance={26}
        castShadow={false}
      />
      {/* Neon accents on the bowls / graffiti walls */}
      <pointLight position={[-8, 3.5, -3]} intensity={22} distance={20} color={0xa855f7} decay={2} />
      <pointLight position={[8, 3, 2]} intensity={18} distance={20} color={0x00e5ff} decay={2} />
      <ambientLight intensity={0.11} color={0x2a1e3a} />
    </>
  );
}

function VeniceLighting({ shadows }: { shadows: boolean }) {
  return (
    <>
      <hemisphereLight args={[0x6688cc, 0x080810, 0.45]} />
      <directionalLight
        position={[3, 10, 4]}
        intensity={2.4}
        color={0xffeedd}
        castShadow={shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-5, 6, 2]} intensity={0.6} color={0xaabbff} />
      <spotLight
        position={[0, 7, -1]}
        angle={0.45}
        penumbra={0.7}
        intensity={35}
        color={0xffffff}
        distance={14}
        castShadow={false}
      />
      <pointLight position={[-5, 3.5, -2]} intensity={20} distance={16} color={0x00e5ff} decay={2} />
      <pointLight position={[5, 2.5, -1]} intensity={16} distance={16} color={0xff3366} decay={2} />
      <ambientLight intensity={0.1} color={0x223344} />
    </>
  );
}

function BlueCourtLighting({ shadows }: { shadows: boolean }) {
  return (
    <>
      <hemisphereLight args={[0x4466aa, 0x060812, 0.5]} />
      <directionalLight
        position={[4, 12, 5]}
        intensity={2.8}
        color={0xeef0ff}
        castShadow={shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-4, 7, 3]} intensity={0.7} color={0x99aadd} />
      <spotLight
        position={[0, 8, -1]}
        angle={0.5}
        penumbra={0.6}
        intensity={40}
        color={0xddeeff}
        distance={16}
        castShadow={false}
      />
      {/* Blue-gold neon accents for the blue court vibe */}
      <pointLight position={[-6, 3, -2]} intensity={22} distance={18} color={0x2277ff} decay={2} />
      <pointLight position={[6, 2.5, 0]} intensity={18} distance={18} color={0xffd700} decay={2} />
      <ambientLight intensity={0.12} color={0x1a2244} />
    </>
  );
}

function DojoLighting({ shadows }: { shadows: boolean }) {
  return (
    <>
      <hemisphereLight args={[0x886644, 0x0a0604, 0.4]} />
      <directionalLight
        position={[2, 8, 3]}
        intensity={2.1}
        color={0xffcc88}
        castShadow={shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={25}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-3, 5, -2]} intensity={0.4} color={0x8899cc} />
      <pointLight position={[-3, 3, 0]} intensity={15} distance={12} color={0xff4422} decay={2} />
      <pointLight position={[3, 2.5, 0]} intensity={12} distance={12} color={0xffaa44} decay={2} />
      <ambientLight intensity={0.08} color={0x221a12} />
    </>
  );
}
