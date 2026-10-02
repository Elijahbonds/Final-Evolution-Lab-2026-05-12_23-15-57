// angles — a joint angle in the camera picture, in degrees.
//
// Image y points down. The angle is the interior angle at `b`, so a straight leg reads about 180.
// A missing or stacked point is null: the caller says the joint was unread rather than inventing 0.

export interface Pt { x: number; y: number }

export function angleDeg(a: Pt, b: Pt, c: Pt): number | null {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const n1 = Math.hypot(v1x, v1y);
  const n2 = Math.hypot(v2x, v2y);
  if (n1 < 1e-4 || n2 < 1e-4) return null;
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (n1 * n2)));
  return (Math.acos(cos) * 180) / Math.PI;
}
