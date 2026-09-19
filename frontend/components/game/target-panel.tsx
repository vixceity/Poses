'use client'

import { useEffect, useState } from 'react'
import { Camera, Hand, PersonStanding, Pause, Play } from 'lucide-react'
import { TargetPose } from './target-pose'
import { POSES_API } from './use-camera'
import type { usePosesGame } from './use-real-poses-game'

type Game = ReturnType<typeof usePosesGame>
const labels = {
  idle: 'READY TO PLAY', 'get-ready': 'GET READY TO COPY', 'make-pose': 'MAKE A POSE',
  'get-ready-to-set': 'GET READY TO SET', 'copy-pose': 'COPY THE POSE', 'game-over': 'GAME OVER',
}

export function TargetPanel({ game }: { game: Game }) {
  const [photoMode, setPhotoMode] = useState(true)
  const [replayIndex, setReplayIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null)
  const finished = game.phase === 'game-over'
  const setting = game.phase === 'make-pose'
  const copying = game.phase === 'copy-pose'
  const handoff = game.phase === 'get-ready' || game.phase === 'get-ready-to-set'
  const showDeadline = (setting || copying) && !game.starting
  const photo = finished ? game.replayPhotos[replayIndex % Math.max(1, game.replayPhotos.length)] : game.targetPhoto
  const countdown = game.starting && game.startCountdown > 0 ? game.startCountdown : handoff ? game.countdown : null
  const title = game.starting ? 'STARTING GAME' : finished ? `PLAYER ${(game.winner ?? 0) + 1} WINS` : labels[game.phase]
  const progress = !game.running ? game.readyProgress : game.holdProgress

  useEffect(() => {
    setReplayIndex(0)
    setPlaying(true)
  }, [finished])
  useEffect(() => {
    if (!finished || !playing || game.replayPhotos.length < 2) return
    const timer = setInterval(() => setReplayIndex(i => (i + 1) % game.replayPhotos.length), 900)
    return () => clearInterval(timer)
  }, [finished, playing, game.replayPhotos.length])

  return (
    <section className="poses-panel flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex min-h-[72px] shrink-0 flex-wrap items-center justify-between gap-2 border-b-[3px] border-[var(--poses-ink)] px-4 py-3">
        <div className="min-w-0">
          <p className="font-hud text-xs text-[#9fb8ce]">{game.round ? `ROUND ${game.round} / PLAYER ${(game.spotlight ?? game.setter) + 1}` : 'LOCAL GAME'}</p>
          <h1 className="font-stencil text-2xl leading-tight text-[#f2f8ff]" aria-live="polite">{title}</h1>
        </div>
        {(setting || copying) && <span className="font-hud text-sm text-[var(--poses-yellow)]">{game.completed}/3 {setting ? 'SAVED' : 'COPIED'}</span>}
      </header>

      <div className="relative min-h-[220px] flex-1 overflow-hidden bg-[#04121f] lg:min-h-0" data-testid="target-media-stage">
        {photo && photo !== failedPhoto && (photoMode || finished || setting) && !game.starting ? (
          <div className="absolute inset-4">
            <img src={`${POSES_API}${photo}`} alt={finished ? `Match replay photo ${replayIndex + 1}` : `Saved pose ${setting ? game.completed : game.poseIndex + 1}`}
              onError={() => setFailedPhoto(photo)} className="h-full w-full object-contain"
              style={{ transform: game.flipTarget ? undefined : 'scaleX(-1)' }} />
          </div>
        ) : game.targetPose && !game.starting ? (
          <div className="absolute inset-4"><TargetPose matrix={game.targetPose} poseIndex={game.poseIndex} flip={game.flipTarget} /></div>
        ) : finished && !game.starting ? (
          <div className="absolute inset-4">
            <img src="/poses-graffiti-transparent.png" alt="POSES" className="h-full w-full object-contain" />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            {!game.starting && !setting && !handoff && !finished && <>
              <Hand size={52} strokeWidth={1.5} className="text-[var(--poses-yellow)]" />
              <div>
                <p className="font-stencil text-3xl leading-none text-[#f2f8ff]">EACH PLAYER: RAISE ONE HAND</p>
                <p className="mt-2 font-hud text-xs tracking-[0.14em] text-[#9fb8ce]">HOLD FOR 2 SECONDS TO START</p>
              </div>
            </>}
            {game.starting && <span className="font-hud text-sm text-[#9fb8ce]">GET READY</span>}
            {setting && <span className="font-hud text-sm text-[#9fb8ce]">{`PLAYER ${game.setter + 1}: POSE ${game.poseIndex + 1} OF 3`}</span>}
          </div>
        )}
        {countdown !== null && <div className="absolute inset-0 flex items-center justify-center bg-black/35" role="timer" aria-label="Countdown">
          <span className="font-stencil text-8xl text-[var(--poses-yellow)]">{countdown || 'GO'}</span>
        </div>}
        {finished && game.replayPhotos.length > 0 && <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/80 p-2">
          <button type="button" onClick={() => setPlaying(v => !v)} aria-label={playing ? 'Pause replay' : 'Play replay'} title={playing ? 'Pause replay' : 'Play replay'}>
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <span className="font-hud text-xs">REPLAY {replayIndex + 1}/{game.replayPhotos.length}</span>
        </div>}
      </div>

      <div className="h-[168px] shrink-0 overflow-hidden border-t-[3px] border-[var(--poses-ink)] px-4 py-3">
        <div className="mb-2 flex h-8 items-center justify-between gap-2">
          <label className="flex items-center gap-2 font-hud text-xs text-[#9fb8ce]">
            <input suppressHydrationWarning type="checkbox" checked={game.flipTarget} onChange={e => game.setFlipTarget(e.target.checked)} />
            FLIP TARGET
          </label>
          <div className={`flex gap-1 ${game.targetPose ? '' : 'invisible'}`} role="group" aria-label="Target display" aria-hidden={!game.targetPose}>
            <button type="button" aria-label="Photo target" title="Photo target" aria-pressed={photoMode} onClick={() => setPhotoMode(true)} className={`grid h-8 w-8 place-items-center rounded ${photoMode ? 'bg-[var(--poses-yellow)] text-black' : 'text-white'}`}><Camera size={18} /></button>
            <button type="button" aria-label="Skeleton target" title="Skeleton target" aria-pressed={!photoMode} onClick={() => setPhotoMode(false)} className={`grid h-8 w-8 place-items-center rounded ${!photoMode ? 'bg-[var(--poses-yellow)] text-black' : 'text-white'}`}><PersonStanding size={18} /></button>
          </div>
        </div>
        <div className="mb-2 flex items-center justify-between gap-2 font-hud text-xs">
          <span className="flex items-center gap-2">
            {!game.running ? `HANDS UP ${game.readyPlayers.length}/2` : 'HOLD STEADY / 2S'}
            {!game.running && <span className="text-[#9fb8ce]">P1 {game.readyPlayers.includes(1) ? 'READY' : 'WAIT'} / P2 {game.readyPlayers.includes(2) ? 'READY' : 'WAIT'}</span>}
          </span>
          {showDeadline && <span role="timer" className="text-xl tabular-nums" style={{ color: game.copyTimeLeft <= 5 ? 'var(--poses-red)' : 'var(--poses-cyan)' }}>{game.copyTimeLeft.toFixed(1)}s {setting ? 'TO SET' : 'LEFT'}</span>}
        </div>
        <progress aria-label={!game.running ? 'Ready gesture hold' : 'Pose hold'} max={1} value={game.connected ? progress : 0} className="block h-3 w-full accent-[var(--poses-yellow)]" />
        {showDeadline && <progress aria-label="Time remaining" max={game.copyTimeTotal} value={game.copyTimeLeft} className="mt-2 block h-2 w-full accent-[var(--poses-cyan)]" />}
        <p className="mt-1 min-h-4 font-hud text-xs text-[#9fb8ce]">{copying && game.matchError !== null ? `POSE ERROR ${game.matchError.toFixed(3)} / ${game.matchTolerance.toFixed(3)}` : ''}</p>
        <p className="mt-1 h-8 overflow-hidden font-hud text-xs text-[#b6cddd]">{game.starting ? 'Game starts after the countdown.' : game.status}</p>
        {game.error && <p role="alert" className="mt-2 font-hud text-xs text-[#ff9999]">{game.error}</p>}
      </div>
    </section>
  )
}
