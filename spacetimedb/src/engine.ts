// Pure game rules, executed transactionally by SpacetimeDB reducers.
export type Matrix = number[][];
export type Game = {
  phase: 'setting' | 'ready' | 'handoff' | 'copying' | 'finished'; setter: number; round: number;
  letters: number[]; poses: Matrix[]; index: number; winner: number;
  tolerance: number; timeoutMs: number; deadline: number;
  anchor: Matrix | null; holdSince: number; lastSample: number;
  release: Matrix | null; holdMs: number; error: number | null; message: string;
};
export const ROWS = 24; // 12 joints followed by 12 limb vectors; xyz columns.
export const HOLD_STABILITY_TOLERANCE = 0.15;
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
    tolerance, timeoutMs:timeoutSeconds * 1000, deadline:now + 20000, anchor:null,
    holdSince:now, lastSample:0, release:null, holdMs:0, error:null,
    message:'Player 1: hold a pose for two seconds'};
}
function clearHold(g: Game) { g.anchor = null; g.holdMs = 0; g.lastSample = 0; }
function nextRound(g: Game, setter: number, now: number) {
  g.setter = setter; g.round++; g.phase = 'setting'; g.poses = []; g.index = 0;
  g.deadline = now + 20000; g.release = null; g.error = null; clearHold(g);
}
export function tick(g: Game, now: number): boolean {
  if (g.phase === 'handoff' && now >= g.deadline) {
    g.phase = 'setting'; g.deadline = now + 20000; g.message = `Player ${g.setter}: set three new poses`;
    return true;
  }
  if (g.phase === 'ready' && now >= g.deadline) {
    g.phase = 'copying'; g.deadline = now + g.timeoutMs; clearHold(g);
    g.message = `Player ${3 - g.setter}: copy pose 1 of 3 now`;
    return true;
  }
  if (g.phase === 'setting' && now >= g.deadline) {
    g.setter = 3 - g.setter; g.round++; g.phase = 'handoff'; g.poses = []; g.index = 0;
    g.deadline = now + 3000; g.release = null; g.error = null; clearHold(g);
    g.message = `Player ${g.setter}: previous setter timed out; get ready to set three poses`;
    return true;
  }
  if (g.phase !== 'copying' || now < g.deadline) return false;
  const copier = 3 - g.setter;
  g.letters[copier - 1]++;
  if (g.letters[copier - 1] >= 5) {
    g.phase = 'finished'; g.winner = g.setter; clearHold(g);
    g.message = `Player ${copier} reached POSES. Player ${g.winner} wins!`;
  } else {
    nextRound(g, g.setter, now);
    g.message = `Player ${copier} missed the sequence and earned a letter. Player ${g.setter}: set three new poses`;
  }
  return true;
}
export function observe(g: Game, player: number, matrix: Matrix | null, now: number) {
  // A late observation must never become the first pose of the next round.
  if (tick(g, now) || g.phase === 'finished' || g.phase === 'ready' || g.phase === 'handoff') return;
  const active = g.phase === 'setting' ? g.setter : 3 - g.setter;
  if (player !== active) return;
  if (matrix === null) { clearHold(g); g.error = null; g.message = `Player ${active}: full-body tracking needed`; return; }
  validateMatrix(matrix);
  if (g.release) {
    if (distance(matrix, g.release) < 0.20) { clearHold(g); g.message = 'Pose saved. Move into a different pose before holding again'; return; }
    g.release = null;
  }
  if (g.phase === 'copying') {
    g.error = distance(matrix, g.poses[g.index]);
    if (g.error > g.tolerance) { clearHold(g); g.message = `Player ${active}: match target pose ${g.index + 1}`; return; }
  }
  if (!g.anchor || now - g.lastSample > 1500 || distance(matrix, g.anchor) > HOLD_STABILITY_TOLERANCE) {
    g.anchor = matrix; g.holdSince = now; g.holdMs = 0;
  }
  g.lastSample = now; g.holdMs = now - g.holdSince;
  g.message = `Player ${active}: hold steady (${(g.holdMs / 1000).toFixed(1)} / 2 seconds)`;
  if (g.holdMs < 2000) return;
  if (g.phase === 'setting') {
    g.poses.push(matrix); g.release = matrix; clearHold(g);
    if (g.poses.length === 3) {
      g.phase = 'ready'; g.index = 0; g.release = null; g.deadline = now + 3000;
      g.message = `Three poses saved! Player ${3 - g.setter}: get ready to copy. Player ${g.setter}: wait`;
    } else g.message = `Pose ${g.poses.length} saved. Move, then hold the next pose`;
  } else {
    g.index++; clearHold(g);
    if (g.index === 3) {
      g.setter = active; g.round++; g.phase = 'handoff'; g.poses = []; g.index = 0;
      g.deadline = now + 3000; g.release = null; g.error = null;
      g.message = `Sequence complete! Player ${active}: get ready to set three new poses`;
    } else {
      g.message = `Player ${active}: copy pose ${g.index + 1} of 3`;
    }
  }
}
