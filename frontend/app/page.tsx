'use client'

import { CameraLane } from '@/components/game/camera-lane'
import { FailureWord } from '@/components/game/failure-word'
import { GameControls } from '@/components/game/game-controls'
import { HudHeader } from '@/components/game/hud-header'
import { TargetPanel } from '@/components/game/target-panel'
import { type Phase, usePosesGame } from '@/components/game/use-real-poses-game'

const P1_ACCENT = 'var(--poses-cyan)'
const P2_ACCENT = 'var(--poses-orange)'

function roleFor(player: 0 | 1, phase: Phase, setter: 0 | 1, copier: 0 | 1, winner: 0 | 1 | null) {
  if (phase === 'idle') return 'WAITING'
  if (phase === 'game-over') return winner === player ? 'WINNER' : 'OUT'
  if (phase === 'make-pose') return player === setter ? 'SETTING' : 'WATCHING'
  if (phase === 'copy-pose') return player === copier ? 'COPYING' : 'WATCHING'
  if (phase === 'get-ready-to-set') return player === setter ? 'GET READY' : 'WATCHING'
  return player === copier ? 'GET READY' : 'WATCHING'
}

export default function Page() {
  const game = usePosesGame()
  const { feedUrl, cameraStatus: status } = game

  return (
    <main className="poses-screen flex min-h-dvh flex-col gap-3 p-3 lg:h-dvh lg:min-h-0 lg:overflow-hidden">
      <HudHeader cameraStatus={status} />

      {/* mobile failure rails */}
      <div className="flex flex-col items-center justify-between gap-2 sm:flex-row lg:hidden">
        <FailureWord
          litCount={game.letters[0]}
          active={game.spotlight === 0}
          playerLabel="P1"
          orientation="horizontal"
        />
        <FailureWord
          litCount={game.letters[1]}
          active={game.spotlight === 1}
          playerLabel="P2"
          orientation="horizontal"
        />
      </div>

      {/* game area */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)_auto] lg:[grid-template-rows:minmax(0,1fr)]">
        {/* P1 vertical word (desktop) */}
        <div className="hidden items-center justify-center lg:flex">
          <FailureWord litCount={game.letters[0]} active={game.spotlight === 0} playerLabel="P1" />
        </div>

        {/* P1 camera */}
        <div className="order-2 min-h-[36vh] lg:order-none lg:min-h-0">
          <CameraLane
            feedUrl={feedUrl}
            status={status}
            tracked={game.visiblePlayers.includes(1)}
            ready={game.readyPlayers.includes(1)}
            backendMessage={game.backendMessage}
            label="PLAYER 01"
            accent={P1_ACCENT}
            spotlight={game.spotlight === 0}
            role={roleFor(0, game.phase, game.setter, game.copier, game.winner)}
          />
        </div>

        {/* center */}
        <div className="order-1 min-h-[58vh] lg:order-none lg:min-h-0">
          <TargetPanel game={game} />
        </div>

        {/* P2 camera */}
        <div className="order-3 min-h-[36vh] lg:order-none lg:min-h-0">
          <CameraLane
            feedUrl={feedUrl}
            status={status}
            label="PLAYER 02"
            tracked={game.visiblePlayers.includes(2)}
            ready={game.readyPlayers.includes(2)}
            backendMessage={game.backendMessage}
            accent={P2_ACCENT}
            spotlight={game.spotlight === 1}
            role={roleFor(1, game.phase, game.setter, game.copier, game.winner)}
          />
        </div>

        {/* P2 vertical word (desktop) */}
        <div className="hidden items-center justify-center lg:flex">
          <FailureWord litCount={game.letters[1]} active={game.spotlight === 1} playerLabel="P2" />
        </div>
      </div>

      {/* controls */}
      <div className="anim-enter">
        <GameControls
          tolerance={game.tolerance}
          setTolerance={game.setTolerance}
          secondsPerCopy={game.secondsPerCopy}
          setSecondsPerCopy={game.setSecondsPerCopy}
          hasGame={game.hasGame}
          disabled={!game.connected || game.starting}
          onReset={game.resetGame}
        />
      </div>
    </main>
  )
}
