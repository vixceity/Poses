'use client'

import { useEffect, useState } from 'react'

export type CameraStatus = 'idle' | 'requesting' | 'ready' | 'offline'

export const POSES_API = process.env.NEXT_PUBLIC_POSES_API_URL ?? 'http://127.0.0.1:8000'

/** The backend owns the camera; the UI only displays its combined MJPEG feed. */
export function useCamera() {
  const [status, setStatus] = useState<CameraStatus>('requesting')
  const [backendMessage, setBackendMessage] = useState('Connecting to camera host')

  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const response = await fetch(`${POSES_API}/api/state`, { cache: 'no-store' })
        if (!response.ok) throw new Error('Camera host unavailable')
        const data = (await response.json()) as { status?: string }
        if (active) {
          const message = data.status ?? 'Camera ready'
          setBackendMessage(message)
          setStatus(message === 'Camera ready' ? 'ready' : 'offline')
        }
      } catch {
        if (active) {
          setBackendMessage('Backend camera unavailable')
          setStatus('offline')
        }
      }
    }
    void poll()
    const timer = window.setInterval(poll, 1000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  return { feedUrl: `${POSES_API}/camera.mjpg`, status, backendMessage }
}
