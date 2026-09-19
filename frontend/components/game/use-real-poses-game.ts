'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { POSES_API, type CameraStatus } from './use-camera'
import { EMPTY_STATE, fromBackend, type BackendState } from './game-state'
export { POSES_WORD, MAX_LETTERS, type Phase } from './game-state'

export function usePosesGame() {
  const [tolerance, setTolerance] = useState(0.25)
  const [secondsPerCopy, setSecondsPerCopy] = useState(20)
  const [flipTarget, setFlipTarget] = useState(true)
  const [data, setData] = useState<BackendState>(EMPTY_STATE)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [startCountdown, setStartCountdown] = useState(0)
  const pending = useRef(false)
  const gestureArmed = useRef(false)
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const request = useRef<AbortController | null>(null)
  const version = useRef(0)
  const snapshot = fromBackend(data)

  const startGame = useCallback((fromGesture = false) => {
    if (pending.current) return
    if (fromGesture && (!connected || data.camera_ready !== true || data.ready_players.length !== 2 || data.ready_hold_ms < 2000)) return
    pending.current = true
    gestureArmed.current = false
    setError('')
    setStarting(true)
    const controller = new AbortController()
    request.current = controller
    const timeout = setTimeout(() => controller.abort(), 15000)
    version.current++
    void (async () => {
      try {
        if (fromGesture) {
          for (let seconds = 3; seconds > 0; seconds--) {
            setStartCountdown(seconds)
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(resolve, 1000)
              controller.signal.addEventListener('abort', () => {
                clearTimeout(timer)
                reject(new DOMException('Start cancelled', 'AbortError'))
              }, { once: true })
            })
          }
          setStartCountdown(0)
        }
        const response = await fetch(`${POSES_API}/api/games`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ tolerance, timeout_seconds: secondsPerCopy }),
        })
        const body = await response.json()
        if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Invalid game settings.')
        version.current++
      } catch (cause) {
        if (request.current === controller && !(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(cause instanceof Error ? cause.message : 'Unable to start game.')
        }
      } finally {
        clearTimeout(timeout)
        if (request.current === controller) {
          request.current = null
          pending.current = false
          setStarting(false)
          setStartCountdown(0)
        }
      }
    })()
  }, [connected, data.camera_ready, data.ready_hold_ms, data.ready_players.length, tolerance, secondsPerCopy])

  const resetGame = useCallback(() => {
    if (pending.current) return
    pending.current = true
    gestureArmed.current = false
    setError('')
    setStarting(false)
    setStartCountdown(0)
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    version.current++
    void fetch(`${POSES_API}/api/games/reset`, { method: 'POST', signal: controller.signal })
      .then(async response => {
        if (!response.ok) {
          const body = await response.json()
          throw new Error(typeof body.detail === 'string' ? body.detail : 'Unable to reset game.')
        }
        version.current++
        setData(EMPTY_STATE)
      })
      .catch(cause => {
        if (request.current === controller) setError(cause instanceof Error ? cause.message : 'Unable to reset game.')
      })
      .finally(() => {
        if (request.current === controller) {
          request.current = null
          pending.current = false
        }
      })
  }, [])

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    let controller: AbortController
    const poll = async () => {
      controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const currentVersion = version.current
      try {
        const response = await fetch(`${POSES_API}/api/state`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('Game host unavailable')
        const next = await response.json() as BackendState
        if (active && currentVersion === version.current) { setData(next); setConnected(true) }
      } catch {
        if (active) setConnected(false)
      } finally {
        clearTimeout(timeout)
        if (active) timer = setTimeout(poll, 200)
      }
    }
    void poll()
    return () => { active = false; clearTimeout(timer); controller?.abort() }
  }, [])

  useEffect(() => {
    if (snapshot.running) {
      gestureArmed.current = false
      if (releaseTimer.current) clearTimeout(releaseTimer.current)
      releaseTimer.current = null
      return
    }

    if (data.ready_players.length !== 2) {
      if (!releaseTimer.current) {
        releaseTimer.current = setTimeout(() => {
          gestureArmed.current = true
          releaseTimer.current = null
        }, 750)
      }
      return
    }

    if (releaseTimer.current) clearTimeout(releaseTimer.current)
    releaseTimer.current = null
    if (connected && data.camera_ready === true && !snapshot.running && data.ready_players.length === 2
        && data.ready_hold_ms >= 2000 && gestureArmed.current) startGame(true)
  }, [connected, data.camera_ready, snapshot.running, data.ready_hold_ms, data.ready_players.length, startGame])

  useEffect(() => {
    if (!starting || (connected && data.camera_ready !== false)) return
    request.current?.abort()
    request.current = null
    pending.current = false
    setStarting(false)
    setError('Camera unavailable. Each player should raise one hand after the camera reconnects.')
  }, [connected, data.camera_ready, starting])

  useEffect(() => () => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current)
    releaseTimer.current = null
    const controller = request.current
    request.current = null
    controller?.abort()
    pending.current = false
  }, [])

  const cameraStatus: CameraStatus = !connected ? (data === EMPTY_STATE ? 'requesting' : 'offline')
    : (data.camera_ready ?? data.status === 'Camera ready') ? 'ready' : 'offline'
  return {
    ...snapshot, tolerance, setTolerance, secondsPerCopy, setSecondsPerCopy, flipTarget, setFlipTarget, startGame,
    resetGame, hasGame: data.game !== null,
    starting, startCountdown, connected, error,
    cameraStatus, feedUrl: `${POSES_API}/camera.mjpg`, backendMessage: data.status,
    visiblePlayers: connected ? data.visible_players : [], readyPlayers: connected ? data.ready_players : [],
    readyProgress: connected ? Math.min(1, data.ready_hold_ms / 2000) : 0,
    status: !connected ? 'Connection to game host lost. Reconnecting...' : snapshot.status,
  }
}
