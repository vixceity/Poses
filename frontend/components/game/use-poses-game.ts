'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type Phase =
  | 'idle'
  | 'get-ready'
  | 'make-pose'
  | 'get-ready-to-set'
  | 'copy-pose'
  | 'game-over'

export const POSES_WORD = ['P', 'O', 'S', 'E', 'S'] as const
export const MAX_LETTERS = POSES_WORD.length
const POSE_COUNT = 3
const HANDOFF_MS = 3000 // three-second handoff countdown
const HOLD_MS = 2000 // two-second stable pose hold
const MAKE_POSE_MS = 3200 // time to strike + hold each pose while setting

export interface GameSnapshot {
  phase: Phase
  /** Failure letters per player — drives the vertical POSES words. */
  letters: [number, number]
  /** Player whose turn is highlighted (setter while making, copier while copying). */
  spotlight: 0 | 1 | null
  setter: 0 | 1
  copier: 0 | 1
  poseIndex: number
  poseCount: number
  /** Whole-second countdown for the handoff phases. */
  countdown: number
  /** Seconds left on the copying deadline. */
  copyTimeLeft: number
  copyTimeTotal: number
  /** 0..1 progress of the current stable hold. */
  holdProgress: number
  targetActive: boolean
  status: string
  winner: 0 | 1 | null
  running: boolean
}

interface Machine {
  phase: Phase
  copier: 0 | 1
  letters: [number, number]
  poseIndex: number
  phaseStart: number
  copyResolveAt: number
  copyWillSucceed: boolean
  winner: 0 | 1 | null
  lettersFilledAt: [number, number]
}

const PHASE_STATUS: Record<Phase, string> = {
  idle: 'Raise a hand to start — both players in frame.',
  'get-ready': 'Get in frame. Copying starts in a moment.',
  'make-pose': 'Setter is building the sequence. Watch closely.',
  'get-ready-to-set': 'Sequence locked. Copier, get ready.',
  'copy-pose': 'Match the target and hold steady.',
  'game-over': '',
}

/** Higher tolerance = easier match. Used to resolve the simulated hold. */
function successChance(tolerance: number) {
  return Math.min(0.94, Math.max(0.2, 0.32 + tolerance * 0.62))
}

export function usePosesGame() {
  const [tolerance, setTolerance] = useState(0.25)
  const [secondsPerCopy, setSecondsPerCopy] = useState(20)
  const [flipTarget, setFlipTarget] = useState(true)

  const toleranceRef = useRef(tolerance)
  const secondsRef = useRef(secondsPerCopy)
  toleranceRef.current = tolerance
  secondsRef.current = secondsPerCopy

  const machineRef = useRef<Machine>({
    phase: 'idle',
    copier: 0,
    letters: [0, 0],
    poseIndex: 0,
    phaseStart: 0,
    copyResolveAt: 0,
    copyWillSucceed: false,
    winner: null,
    lettersFilledAt: [0, 0],
  })

  const [snapshot, setSnapshot] = useState<GameSnapshot>({
    phase: 'idle',
    letters: [0, 0],
    spotlight: null,
    setter: 1,
    copier: 0,
    poseIndex: 0,
    poseCount: POSE_COUNT,
    countdown: 0,
    copyTimeLeft: secondsPerCopy,
    copyTimeTotal: secondsPerCopy,
    holdProgress: 0,
    targetActive: false,
    status: PHASE_STATUS.idle,
    winner: null,
    running: false,
  })

  const rafRef = useRef<number | null>(null)

  const enterCopyPose = useCallback((m: Machine, now: number) => {
    m.phase = 'copy-pose'
    m.phaseStart = now
    const deadline = secondsRef.current * 1000
    m.copyWillSucceed = Math.random() < successChance(toleranceRef.current)
    // A successful hold completes early; a miss runs the deadline out.
    const latest = Math.max(1400, deadline - HOLD_MS - 300)
    m.copyResolveAt = m.copyWillSucceed ? 1000 + Math.random() * Math.min(3600, latest - 1000) : Infinity
  }, [])

  const step = useCallback(
    (now: number) => {
      const m = machineRef.current
      const elapsed = now - m.phaseStart

      switch (m.phase) {
        case 'get-ready': {
          if (elapsed >= HANDOFF_MS) {
            m.phase = 'make-pose'
            m.phaseStart = now
            m.poseIndex = 0
          }
          break
        }
        case 'make-pose': {
          const idx = Math.floor(elapsed / MAKE_POSE_MS)
          if (idx >= POSE_COUNT) {
            m.phase = 'get-ready-to-set'
            m.phaseStart = now
            m.poseIndex = 0
          } else {
            m.poseIndex = idx
          }
          break
        }
        case 'get-ready-to-set': {
          if (elapsed >= HANDOFF_MS) {
            m.poseIndex = 0
            enterCopyPose(m, now)
          }
          break
        }
        case 'copy-pose': {
          const deadline = secondsRef.current * 1000
          const held = m.copyResolveAt !== Infinity && elapsed >= m.copyResolveAt + HOLD_MS
          if (held) {
            // Current pose copied — advance or finish a clean sequence.
            if (m.poseIndex + 1 >= POSE_COUNT) {
              m.copier = (1 - m.copier) as 0 | 1
              m.phase = 'get-ready'
              m.phaseStart = now
              m.poseIndex = 0
            } else {
              m.poseIndex += 1
              enterCopyPose(m, now)
            }
          } else if (elapsed >= deadline) {
            // Missed the deadline — the copier fails the whole sequence.
            const failer = m.copier
            m.letters[failer] = Math.min(MAX_LETTERS, m.letters[failer] + 1)
            m.lettersFilledAt[failer] = now
            if (m.letters[failer] >= MAX_LETTERS) {
              m.winner = (1 - failer) as 0 | 1
              m.phase = 'game-over'
              m.phaseStart = now
            } else {
              m.copier = (1 - m.copier) as 0 | 1
              m.phase = 'get-ready'
              m.phaseStart = now
              m.poseIndex = 0
            }
          }
          break
        }
        default:
          break
      }

      // ----- derive render snapshot -----
      const setter = (1 - m.copier) as 0 | 1
      let spotlight: 0 | 1 | null = null
      let holdProgress = 0
      let countdown = 0
      let copyTimeLeft = secondsRef.current
      const copyTimeTotal = secondsRef.current
      const el = now - m.phaseStart

      if (m.phase === 'make-pose') {
        spotlight = setter
        const within = el % MAKE_POSE_MS
        holdProgress = Math.min(1, Math.max(0, (within - (MAKE_POSE_MS - HOLD_MS)) / HOLD_MS))
      } else if (m.phase === 'copy-pose') {
        spotlight = m.copier
        copyTimeLeft = Math.max(0, secondsRef.current - el / 1000)
        if (m.copyResolveAt !== Infinity && el >= m.copyResolveAt) {
          holdProgress = Math.min(1, (el - m.copyResolveAt) / HOLD_MS)
        }
      } else if (m.phase === 'get-ready') {
        spotlight = m.copier
        countdown = Math.max(0, Math.ceil((HANDOFF_MS - el) / 1000))
      } else if (m.phase === 'get-ready-to-set') {
        spotlight = m.copier
        countdown = Math.max(0, Math.ceil((HANDOFF_MS - el) / 1000))
      } else if (m.phase === 'game-over') {
        spotlight = m.winner
      }

      setSnapshot({
        phase: m.phase,
        letters: [m.letters[0], m.letters[1]],
        spotlight,
        setter,
        copier: m.copier,
        poseIndex: m.poseIndex,
        poseCount: POSE_COUNT,
        countdown,
        copyTimeLeft,
        copyTimeTotal,
        holdProgress,
        targetActive: m.phase === 'copy-pose',
        status:
          m.phase === 'game-over'
            ? `Player ${((m.winner ?? 0) + 1) as number} wins.`
            : PHASE_STATUS[m.phase],
        winner: m.winner,
        running: m.phase !== 'idle' && m.phase !== 'game-over',
      })

      rafRef.current = requestAnimationFrame(step)
    },
    [enterCopyPose],
  )

  useEffect(() => {
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [step])

  const startGame = useCallback(() => {
    const m = machineRef.current
    m.letters = [0, 0]
    m.lettersFilledAt = [0, 0]
    m.winner = null
    m.copier = 0
    m.poseIndex = 0
    m.phase = 'get-ready'
    m.phaseStart = performance.now()
  }, [])

  return {
    ...snapshot,
    tolerance,
    setTolerance,
    secondsPerCopy,
    setSecondsPerCopy,
    flipTarget,
    setFlipTarget,
    startGame,
  }
}
