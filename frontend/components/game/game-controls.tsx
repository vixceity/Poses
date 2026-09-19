'use client'

import { RotateCcw, Volume2 } from 'lucide-react'

export function GameControls({
  tolerance,
  setTolerance,
  secondsPerCopy,
  setSecondsPerCopy,
  hasGame,
  disabled,
  onReset,
  voiceoverEnabled,
  enablingVoiceover,
  onEnableVoiceover,
}: {
  tolerance: number
  setTolerance: (v: number) => void
  secondsPerCopy: number
  setSecondsPerCopy: (v: number) => void
  hasGame: boolean
  disabled: boolean
  onReset: () => void
  voiceoverEnabled: boolean
  enablingVoiceover: boolean
  onEnableVoiceover: () => void
}) {
  return (
    <div className="flex flex-wrap items-end justify-center gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-hud text-[10px] tracking-[0.2em] text-[#7fa0bd]">MATCH TOLERANCE</span>
        <div className="flex items-center gap-2">
          <input
            suppressHydrationWarning
            type="range"
            min={0.05}
            disabled={disabled}
            max={0.8}
            step={0.01}
            value={tolerance}
            onChange={(e) => setTolerance(Number(e.target.value))}
            className="w-32 accent-[color:var(--poses-yellow)]"
          />
          <span className="font-hud w-10 text-right text-sm tabular-nums text-[var(--poses-yellow)]">
            {tolerance.toFixed(2)}
          </span>
        </div>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-hud text-[10px] tracking-[0.2em] text-[#7fa0bd]">SECONDS / SEQUENCE</span>
        <input
          suppressHydrationWarning
          type="number"
          disabled={disabled}
          min={5}
          max={120}
          value={secondsPerCopy}
          onChange={(e) => setSecondsPerCopy(Math.max(5, Math.min(120, Math.round(Number(e.target.value)) || 5)))}
          className="poses-input w-20 px-2 py-1.5 text-sm"
        />
      </label>

      <button
        suppressHydrationWarning
        type="button"
        disabled={voiceoverEnabled || enablingVoiceover}
        onClick={onEnableVoiceover}
        className="poses-btn flex items-center gap-2 px-6 py-2.5 text-lg"
      >
        <Volume2 aria-hidden="true" />
        {voiceoverEnabled ? 'VOICEOVER ON' : enablingVoiceover ? 'ENABLING…' : 'ENABLE VOICEOVER'}
      </button>

      {hasGame && <button
          suppressHydrationWarning
          type="button"
          disabled={disabled}
          onClick={onReset}
          className="poses-btn flex items-center gap-2 px-6 py-2.5 text-lg"
        >
          <RotateCcw aria-hidden="true" />
          RESET GAME
        </button>}
    </div>
  )
}
