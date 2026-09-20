import { kartCircuits } from '../../lib/babylon/racing/kartCircuits';
for (const c of kartCircuits()) console.log(c.course.id, 'len', c.line.length.toFixed(0), 'tightest', c.tightestCorner.radius.toFixed(1), '@', c.tightestCorner.dist.toFixed(0), 'elev', JSON.stringify(c.elevation), 'kerbs', c.kerbs.length, 'laps', c.course.laps);
