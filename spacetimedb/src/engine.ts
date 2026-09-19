// Pure game rules, executed transactionally by SpacetimeDB reducers.
export type Matrix = number[][];
export type Game = {
  phase: 'setting' | 'copying' | 'finished'; setter: number; round: number;
  letters: number[]; poses: Matrix[]; index: number; winner: number;
  tolerance: number; timeoutMs: number; deadline: number;
  anchor: Matrix | null; holdSince: number; lastSample: number;
  release: Matrix | null; holdMs: number; error: number | null; message: string;
};
export const ROWS = 24; // 12 joints followed by 12 limb vectors; xyz columns.
export function validateMatrix(m: Matrix) {
  if (!Array.isArray(m) || m.length !== ROWS || m.some(r => !Array.isArray(r) ||
      r.length !== 3 || r.some(v => typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 20)))
    throw new Error('Expected a finite 24 x 3 normalized pose matrix');
}
export function distance(a: Matrix, b: Matrix): number {
  return Math.sqrt(a.reduce((s, r, i) => s + r.reduce((n, v, j) => n + (v - b[i][j]) ** 2, 0), 0) / a.length);
}
export function createGame(now: number, tolerance = 0.25, timeoutSeconds = 20): Game {
  if (!Number.isFinite(tolerance) || tolerance < 0.05 || tolerance > 0.8 ||
      !Number.isFinite(timeoutSeconds) || timeoutSeconds < 5 || timeoutSeconds > 120)
    throw new Error('Tolerance must be 0.05–0.8; timeout must be 5–120 seconds');
  return {phase:'setting', setter:1, round:1, letters:[0,0], poses:[], index:0, winner:0,
    tolerance, timeoutMs:timeoutSeconds * 1000, deadline:0, anchor:null,
    holdSince:now, lastSample:0, release:null, holdMs:0, error:null,
    message:'Player 1: hold a pose for two seconds'};
}
function clearHold(g: Game) { g.anchor = null; g.holdMs = 0; g.lastSample = 0; }
function nextRound(g: Game, setter: number) {
  g.setter = setter; g.round++; g.phase = 'setting'; g.poses = []; g.index = 0;
  g.deadline = 0; g.release = null; g.error = null; clearHold(g);
}
export function tick(g: Game, now: number): boolean {
  if (g.phase !== 'copying' || now < g.deadline) return false;
  const copier = 3 - g.setter;
  g.letters[copier - 1]++;
  if (g.letters[copier - 1] >= 5) {
    g.phase = 'finished'; g.winner = g.setter; clearHold(g);
    g.message = `Player ${copier} reached POSES. Player ${g.winner} wins!`;
  } else {
    nextRound(g, g.setter);
    g.message = `Player ${copier} missed the sequence and earned a letter. Player ${g.setter}: set three new poses`;
  }
  return true;
}
export function observe(g: Game, player: number, matrix: Matrix | null, now: number) {
  // A late observation must never become the first pose of the next round.
  if (tick(g, now) || g.phase === 'finished') return;
  const active = g.phase === 'setting' ? g.setter : 3 - g.setter;
  if (player !== active) return;
  if (matrix === null) { clearHold(g); g.error = null; return; }
  validateMatrix(matrix);
  if (g.release) {
    if (distance(matrix, g.release) < 0.20) { clearHold(g); return; }
    g.release = null;
  }
  if (g.phase === 'copying') {
    g.error = distance(matrix, g.poses[g.index]);
    if (g.error > g.tolerance) { clearHold(g); return; }
  }
  if (!g.anchor || now - g.lastSample > 600 || distance(matrix, g.anchor) > 0.10) {
    g.anchor = matrix; g.holdSince = now; g.holdMs = 0;
  }
  g.lastSample = now; g.holdMs = now - g.holdSince;
  if (g.holdMs < 2000) return;
  if (g.phase === 'setting') {
    g.poses.push(g.anchor!); g.release = matrix; clearHold(g);
    if (g.poses.length === 3) {
      g.phase = 'copying'; g.index = 0; g.release = null; g.deadline = now + g.timeoutMs;
      g.message = `Player ${3 - g.setter}: copy pose 1 of 3`;
    } else g.message = `Pose ${g.poses.length} saved. Move, then hold the next pose`;
  } else {
    g.index++; clearHold(g);
    if (g.index === 3) {
      nextRound(g, active);
      g.message = `Sequence complete! Player ${active}: set three poses`;
    } else {
      g.deadline = now + g.timeoutMs;
      g.message = `Player ${active}: copy pose ${g.index + 1} of 3`;
    }
  }
}
