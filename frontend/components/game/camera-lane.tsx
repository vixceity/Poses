'use client'

import { Hand } from 'lucide-react'
import type { CameraStatus } from './use-camera'

const STATUS_TEXT: Record<CameraStatus, string> = {
  idle: 'STANDBY',
  requesting: 'CONNECTING…',
  ready: 'LIVE',
  offline: 'CAMERA OFFLINE',
}

export function CameraLane({
  feedUrl,
  status,
  label,
  accent,
  spotlight,
  role,
  tracked,
  ready,
  backendMessage,
}: {
  feedUrl: string
  status: CameraStatus
  label: string
  accent: string
  spotlight: boolean
  role: string
  tracked: boolean
  ready: boolean
  backendMessage: string
}) {
  const showVideo = status === 'ready'
  const playerOne = label.endsWith('01')

  return (
    <section
      className={`poses-panel anim-enter flex h-full min-h-0 flex-col overflow-hidden ${spotlight ? 'poses-turn-active' : ''}`}
      style={{
        ['--spot' as string]: accent,
        borderColor: spotlight ? accent : 'var(--poses-ink)',
      } as React.CSSProperties}
      aria-current={spotlight ? 'true' : undefined}
    >
      <div style={{ display: 'contents' }}>
        {/* header */}
        <header
          className="flex items-center justify-between border-b-[3px] px-3 py-2"
          style={{ borderColor: 'var(--poses-ink)', background: 'rgba(6,26,48,0.6)' }}
        >
          <span
            className="font-stencil text-lg tracking-wider"
            style={{ color: spotlight ? accent : '#cfe4f5' }}
          >
            {label}
          </span>
          <span
            className="font-hud rounded px-2 py-0.5 text-[10px] tracking-[0.2em]"
            style={{
              color: spotlight ? 'var(--poses-ink)' : '#9fb8ce',
              background: spotlight ? accent : 'rgba(255,255,255,0.06)',
            }}
          >
            {role}
          </span>
        </header>

        {/* camera area */}
        <div
          className="relative min-h-0 flex-1 overflow-hidden"
          style={{ background: '#04121f' }}
        >
          {spotlight && (
            <div
              className="poses-turn-flag pointer-events-none absolute right-3 top-3 z-20 font-stencil text-sm"
              style={{ background: accent }}
            >
              YOUR TURN
            </div>
          )}
          {showVideo ? (
            <img
              src={feedUrl}
              alt="Combined backend camera feed"
              className="absolute top-0 h-full max-w-none object-cover"
              style={{
                width: '200%',
                left: playerOne ? '0' : '-100%',
              }}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <span
                className="font-hud text-xs tracking-[0.25em]"
                style={{ color: status === 'offline' ? 'var(--poses-red)' : '#6f89a2' }}
              >
                {STATUS_TEXT[status]}
              </span>
              {status === 'offline' && (
                <span className="font-hud max-w-[80%] text-center text-[10px] text-[#5b7089]">
                  {backendMessage}
                </span>
              )}
            </div>
          )}

          {/* tracking overlay */}
          <div className="pointer-events-none absolute inset-0">
            <span className="hud-corner left-2 top-2" style={{ borderTopWidth: 2, borderLeftWidth: 2 }} />
            <span className="hud-corner right-2 top-2" style={{ borderTopWidth: 2, borderRightWidth: 2 }} />
            <span className="hud-corner bottom-2 left-2" style={{ borderBottomWidth: 2, borderLeftWidth: 2 }} />
            <span
              className="hud-corner bottom-2 right-2"
              style={{ borderBottomWidth: 2, borderRightWidth: 2 }}
            />
            <div
              className="absolute left-3 top-3 flex items-center gap-2 border-2 px-2 py-1 font-hud text-[10px] tracking-[0.14em]"
              style={{
                color: ready ? 'var(--poses-ink)' : '#b6cddd',
                borderColor: ready ? accent : 'rgba(182,205,221,0.35)',
                background: ready ? accent : 'rgba(4,18,31,0.82)',
              }}
            >
              <Hand size={14} />
              {ready ? 'HAND UP' : 'RAISE HAND'}
            </div>
            {showVideo && (
              <>
                <span
                  className="anim-scan absolute left-0 h-px w-full"
                  style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
                />
                <span
                  className="anim-dot absolute h-2 w-2 rounded-full"
                  style={{ top: '22%', left: '30%', background: accent }}
                />
                <span
                  className="anim-dot absolute h-2 w-2 rounded-full"
                  style={{ top: '54%', left: '62%', background: 'var(--poses-yellow)', animationDelay: '0.6s' }}
                />
                <span
                  className="anim-dot absolute h-2 w-2 rounded-full"
                  style={{ top: '70%', left: '40%', background: accent, animationDelay: '1.1s' }}
                />
              </>
            )}
          </div>
        </div>
      </div>
      <p className="px-3 py-2 font-hud text-xs" style={{ color: tracked ? accent : '#9fb8ce' }}>
        {tracked ? 'FULL BODY TRACKED' : 'FULL BODY NOT TRACKED'}
      </p>
    </section>
  )
}
