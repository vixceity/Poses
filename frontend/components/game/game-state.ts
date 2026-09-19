export type Phase = 'idle' | 'get-ready' | 'make-pose' | 'get-ready-to-set' | 'copy-pose' | 'game-over'
export const POSES_WORD = ['P', 'O', 'S', 'E', 'S'] as const
export const MAX_LETTERS = POSES_WORD.length
export interface BackendGame {
  phase: 'setting' | 'ready' | 'handoff' | 'copying' | 'finished'
  setter: number; round: number; letters: number[]; poses: number[][][]; index: number
  winner: number; deadline: number; holdMs: number; timeoutMs: number
  tolerance: number; error: number | null; message: string
}
export interface BackendState {
  id: string | null; game: BackendGame | null; status: string; now: number
  camera_ready?: boolean; visible_players: number[]; ready_players: number[]; ready_hold_ms: number
  pose_photos?: { round: number; index: number; url: string }[]
}
export const EMPTY_STATE: BackendState = {
  id: null, game: null, status: 'Connecting to camera host', now: 0,
  visible_players: [], ready_players: [], ready_hold_ms: 0, pose_photos: [],
}
const phases: Record<BackendGame['phase'], Phase> = {
  setting: 'make-pose', ready: 'get-ready', handoff: 'get-ready-to-set',
  copying: 'copy-pose', finished: 'game-over',
}
export function fromBackend(data: BackendState) {
  const g = data.game
  const phase: Phase = g ? phases[g.phase] : 'idle'
  const setter = (g?.setter === 2 ? 1 : 0) as 0 | 1
  const copier = (1 - setter) as 0 | 1
  const winner = g?.phase === 'finished' && g.winner ? (g.winner - 1) as 0 | 1 : null
  const setting = phase === 'make-pose'
  const preview = phase === 'get-ready' || phase === 'copy-pose'
  const secondsLeft = g ? Math.max(0, (g.deadline - data.now) / 1000) : 0
  const index = setting ? Math.min(2, g?.poses.length ?? 0) : g?.index ?? 0
  const photos = data.pose_photos ?? []
  const photoIndex = setting ? (g?.poses.length ?? 0) - 1 : index
  return {
    phase, setter, copier, winner,
    spotlight: phase === 'game-over' ? winner : phase === 'idle' ? null
      : setting || phase === 'get-ready-to-set' ? setter : copier,
    letters: [g?.letters[0] ?? 0, g?.letters[1] ?? 0] as [number, number],
    poseIndex: index, poseCount: 3, completed: setting ? g?.poses.length ?? 0 : g?.index ?? 0,
    round: g?.round ?? 0,
    countdown: phase === 'get-ready' || phase === 'get-ready-to-set' ? Math.ceil(secondsLeft) : 0,
    copyTimeLeft: secondsLeft, copyTimeTotal: setting ? 20 : (g?.timeoutMs ?? 20000) / 1000,
    holdProgress: Math.min(1, Math.max(0, (g?.holdMs ?? 0) / 2000)),
    targetActive: preview, targetPose: preview ? g?.poses[index] ?? null : null,
    targetPhoto: preview || setting ? photos.find(p => p.round === g?.round && p.index === photoIndex)?.url ?? null : null,
    replayPhotos: photos.map(p => p.url),
    status: g?.message ?? 'Raise a hand to start - both players in frame.',
    running: !!g && g.phase !== 'finished', matchError: g?.error ?? null,
    matchTolerance: g?.tolerance ?? 0.25,
  }
}
