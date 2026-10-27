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

export const SETUP_STEPS: Record<SprintTest, string[]> = {
  gate: [
    'Stand the phone ON the finish line, 3–5 m to the side of the lane, aimed straight across it, propped at hip height.',
    'Tap two points on the finish line as the phone sees it (a cone on the far side and the line on the ground), or keep the centre line.',
    'Type the distance. Choose the start: the phone\'s Go (the athlete hears it), or the first movement when the start is in view.',
    'Sprint through the line. The time is the torso crossing it, as a race is judged.',
  ],
  flying: [
    'Mark two lines across the lane (10 or 20 m apart) with a pole or tall cone ON the running line at each.',
    'Stand the phone well back (≥ 12 m for 10 m) and square to the lane, halfway between the lines, both in view.',
    'Tap the bottom and top of each pole: line 1, then line 2. Type their distance.',
    'Run in from at least 20 m back, flat out through both lines. Run over the markers: running off them is in the ±.',
  ],
  trace: [
    'Stand the phone far back and side-on (≥ 20 m to see 30 m of the run), propped still, the start line inside the picture.',
    'Put one marker on the start line and one further along the lane, and tap both; type the distance between them. (No markers: type the athlete\'s height.)',
    'Start on the phone\'s Go or from still in view. Run through the whole picture.',
    'You get a speed curve, top speed, and a Samozino profile (v_max, τ, F0, Pmax): all estimates.',
  ],
  agility: [
    'Three cones on one line, 5 yards apart. Stand the phone ≈ 9 m back, square to the cones, all three and the feet in view.',
    'Tap the left cone, then the middle, then the right.',
    'Start straddling the middle line, still. Sprint to one line, touch it, to the far line, touch it, back through the middle.',
    'Beta: the camera reads the turning foot. A turn short of a line gets no time.',
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
