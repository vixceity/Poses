'use client'

import { useEffect, useRef, useState } from 'react'
import { POSES_WORD } from './use-real-poses-game'

const COUNTER_ASSETS = [
  { yellow: '/counter-yellow-p.png', grey: '/counter-grey-p.png' },
  { yellow: '/counter-yellow-o.png', grey: '/counter-grey-o.png' },
  { yellow: '/counter-yellow-s-1.png', grey: '/counter-grey-s-1.png' },
  { yellow: '/counter-yellow-e.png', grey: '/counter-grey-e.png' },
  { yellow: '/counter-yellow-s-2.png', grey: '/counter-grey-s-2.png' },
] as const

export function FailureWord({
  litCount,
  active,
  playerLabel,
  orientation = 'vertical',
}: {
  litCount: number
  active: boolean
  playerLabel: string
  orientation?: 'vertical' | 'horizontal'
}) {
  const [justLit, setJustLit] = useState<number | null>(null)
  const prev = useRef(litCount)

  useEffect(() => {
    if (litCount > prev.current) {
      const idx = litCount - 1
      setJustLit(idx)
      const t = setTimeout(() => setJustLit(null), 700)
      prev.current = litCount
      return () => clearTimeout(t)
    }
    prev.current = litCount
  }, [litCount])

  const isVertical = orientation === 'vertical'

  return (
    <div
      className={`flex select-none flex-col items-center ${isVertical ? 'gap-2' : 'gap-1'}`}
      aria-label={`${playerLabel} failures: ${litCount} of ${POSES_WORD.length}`}
    >
      <span
        className="font-hud text-[10px] tracking-[0.35em]"
        style={{ color: active ? 'var(--poses-cyan)' : 'var(--poses-grey)' }}
      >
        {playerLabel}
      </span>
      <div
        className={`flex ${isVertical ? 'flex-col' : 'flex-row'} items-center ${isVertical ? 'gap-1' : 'gap-2'} rounded-xl px-2 py-3`}
        style={{
          border: `2px solid ${active ? 'color-mix(in srgb, var(--poses-cyan) 60%, transparent)' : 'transparent'}`,
          boxShadow: active
            ? '0 0 22px color-mix(in srgb, var(--poses-cyan) 35%, transparent)'
            : 'none',
          transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
        }}
      >
        {POSES_WORD.map((_, i) => {
          const lit = i < litCount
          const popping = justLit === i
          return (
            <span key={i} className={`relative inline-flex shrink-0 ${popping ? 'anim-letter' : ''}`}>
              <img
                src={lit ? COUNTER_ASSETS[i].yellow : COUNTER_ASSETS[i].grey}
                alt=""
                aria-hidden="true"
                draggable="false"
                className={isVertical ? 'h-12 w-12 object-contain' : 'h-10 w-10 object-contain'}
                style={{ opacity: lit ? 1 : 0.48, transition: 'opacity 0.25s ease' }}
              />
              {popping && (
                <span
                  className="anim-flash pointer-events-none absolute inset-0 flex items-center justify-center font-graffiti leading-none text-4xl"
                  style={{ color: '#fff', textShadow: '0 0 20px #fff' }}
                  aria-hidden="true"
                >
                  <img src={COUNTER_ASSETS[i].yellow} alt="" aria-hidden="true" className="h-full w-full object-contain" />
                </span>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}
