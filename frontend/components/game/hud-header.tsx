'use client'

import Image from 'next/image'
import { House } from 'lucide-react'
import type { CameraStatus } from './use-camera'

export function HudHeader({ cameraStatus }: { cameraStatus: CameraStatus }) {
  const live = cameraStatus === 'ready'
  return (
    <header className="anim-enter flex items-center justify-between gap-4 px-1">
      <div className="flex items-center gap-3">
        <a
          href="http://127.0.0.1:8000"
          aria-label="Return to main menu"
          title="Main menu"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md border-2 border-[var(--poses-ink)] bg-[var(--poses-yellow)] text-[var(--poses-ink)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--poses-cyan)]"
        >
          <House aria-hidden="true" size={21} strokeWidth={2.5} />
        </a>
        <Image
          src="/poses-header-graffiti.png"
          alt="POSES"
          width={916}
          height={472}
          priority
          className="h-10 w-auto object-contain md:h-12"
        />
        <span className="font-hud hidden text-[10px] tracking-[0.3em] text-[#7fa0bd] sm:inline">
          LOCAL · 2 PLAYERS
        </span>
      </div>

      <div className="flex items-center gap-4 font-hud text-[11px] tracking-[0.25em]">
        <span className="flex items-center gap-2" style={{ color: live ? '#eaf4ff' : '#6f89a2' }}>
          <span
            className={live ? 'anim-rec' : ''}
            style={{
              display: 'inline-block',
              height: 9,
              width: 9,
              borderRadius: '9999px',
              background: live ? 'var(--poses-red)' : '#6f89a2',
            }}
          />
          REC
        </span>
        <span className="hidden text-[#7fa0bd] sm:inline">CAMERA FEED</span>
      </div>
    </header>
  )
}
