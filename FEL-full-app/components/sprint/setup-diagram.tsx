// SetupDiagram — where the phone goes, from above, for each camera sprint test (SPRINT-SPEED, 2026-10-25). Inline SVG,
// drawn in the app's colours; no picture of anyone.
import type { SprintTest } from '@/lib/sprint/store';

const LANE = '#ffffff33', LINE = '#00FF9D', PHONE = '#00E5FF', TXT = '#ffffffb3', RUN = '#FFB020';

function Phone({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x={-6} y={-10} width={12} height={20} rx={2} fill={PHONE} />
      <path d="M0 -10 L-22 -52 L22 -52 Z" fill={PHONE} opacity={0.14} />
    </g>
  );
}

// TOOLS-EASY (2026-10-28): plain words, each step 24 words or fewer (docs/CUE-STYLE.md set-up tier). The speed trace's
// step named "a Samozino profile (v_max, τ, F0, Pmax)" — four words the guide keeps away from the athlete; the profile
// itself is unchanged and still under the result's Details.
export const SETUP_STEPS: Record<SprintTest, string[]> = {
  gate: [
    'Stand the phone on the finish line, 3 to 5 m to the side of the lane, aimed across it, about hip high.',
    'Tap the two ends of the finish line on the picture, or keep the centre line.',
    'Pick the distance and the start: the phone says Go, or you start from still in view.',
    'Sprint through the line. The time stops when your body crosses it, as a race is judged.',
  ],
  flying: [
    'Put a pole or tall cone on the running line at each end, 10 or 20 m apart.',
    'Stand the phone well back, at least 12 m for a 10 m gap, square to the lane and halfway between the poles.',
    'Tap the bottom and the top of each pole, the first and then the second. Type how far apart they are.',
    'Run in from at least 20 m back, flat out through both poles.',
  ],
  trace: [
    'Stand the phone far back and side-on, at least 20 m away and still, with the start line in the picture.',
    'Put a marker on the start line and one further along. Tap both and type the distance. No markers: type your height.',
    'Start on the phone\'s Go, or from still in view. Run through the whole picture.',
    'You get a speed curve, your top speed and how fast you speed up. All are estimates.',
  ],
  agility: [
    'Three cones on one line, 5 yards apart. Stand the phone about 9 m back, with all three cones and your feet in view.',
    'Tap the left cone, then the middle one, then the right one.',
    'Start still, astride the middle line. Sprint to one line and touch it, then the far line, then back through the middle.',
    'Early version: the camera reads your turning foot. A turn short of a line gets no time.',
  ],
};

export function SetupDiagram({ test }: { test: SprintTest }) {
  return (
    <svg viewBox="0 0 320 150" className="h-auto w-full" role="img" aria-label="Where to put the phone, seen from above" data-sprint-diagram={test}>
      <rect x={0} y={0} width={320} height={150} rx={10} fill="#ffffff08" />
      {test !== 'agility' && <rect x={10} y={40} width={300} height={34} fill={LANE} />}
      {test === 'gate' && (
        <g>
          <text x={14} y={34} fill={TXT} fontSize={10}>start</text>
          <line x1={250} y1={30} x2={250} y2={120} stroke={LINE} strokeWidth={3} />
          <text x={256} y={34} fill={LINE} fontSize={10}>finish line</text>
          <path d="M20 57 H232" stroke={RUN} strokeWidth={2} markerEnd="url(#arr)" />
          <Phone x={250} y={128} rot={0} />
          <text x={176} y={146} fill={TXT} fontSize={10}>phone on the line, 3–5 m out</text>
        </g>
      )}
      {test === 'flying' && (
        <g>
          <line x1={120} y1={36} x2={120} y2={78} stroke={LINE} strokeWidth={3} />
          <line x1={220} y1={36} x2={220} y2={78} stroke={LINE} strokeWidth={3} />
          <text x={104} y={30} fill={LINE} fontSize={10}>line 1</text><text x={204} y={30} fill={LINE} fontSize={10}>line 2</text>
          <path d="M20 57 H300" stroke={RUN} strokeWidth={2} markerEnd="url(#arr)" />
          <Phone x={170} y={130} />
          <text x={186} y={140} fill={TXT} fontSize={10}>≥ 12 m back, centred</text>
        </g>
      )}
      {test === 'trace' && (
        <g>
          <circle cx={30} cy={74} r={4} fill={LINE} /><circle cx={250} cy={74} r={4} fill={LINE} />
          <text x={12} y={90} fill={LINE} fontSize={10}>start marker</text><text x={226} y={90} fill={LINE} fontSize={10}>marker</text>
          <path d="M30 57 H300" stroke={RUN} strokeWidth={2} markerEnd="url(#arr)" />
          <Phone x={160} y={132} />
          <text x={176} y={140} fill={TXT} fontSize={10}>far back, side-on</text>
        </g>
      )}
      {test === 'agility' && (
        <g>
          {[70, 160, 250].map((x, i) => <g key={x}><line x1={x} y1={30} x2={x} y2={80} stroke={LINE} strokeWidth={3} /><text x={x - 10} y={24} fill={LINE} fontSize={10}>{['left', 'middle', 'right'][i]}</text></g>)}
          <path d="M160 62 H250 M250 50 H70 M70 38 H190" stroke={RUN} strokeWidth={2} fill="none" />
          <text x={120} y={98} fill={TXT} fontSize={10}>5 yd · 5 yd</text>
          <Phone x={160} y={132} />
          <text x={176} y={140} fill={TXT} fontSize={10}>≈ 9 m back, square on</text>
        </g>
      )}
      <defs>
        <marker id="arr" markerWidth={8} markerHeight={8} refX={6} refY={4} orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill={RUN} /></marker>
      </defs>
    </svg>
  );
}
