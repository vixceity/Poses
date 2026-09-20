'use client'

import { useEffect, useRef, useState } from 'react'

const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
const RELAY_HTTP_URL = process.env.NEXT_PUBLIC_MULTIPLAYER_RELAY_URL ?? 'http://127.0.0.1:8001'

function relayWebSocketUrl(room: string, player: string) {
  const url = new URL(RELAY_HTTP_URL)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `/ws/${room}/${player}`
  return url.toString()
}

export default function MultiplayerPage() {
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const peerVideoRef = useRef<HTMLVideoElement | null>(null)
  const [roomCode, setRoomCode] = useState('')
  const [player, setPlayer] = useState<'1' | '2'>('1')
  const [status, setStatus] = useState('Create or join a room.')
  const [players, setPlayers] = useState<string[]>([])
  const [ready, setReady] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        localStreamRef.current = stream
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
        }
      } catch (error) {
        console.error(error)
        setStatus('Camera permission is required for online play.')
      }
    }

    void startCamera()

    return () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop())
      wsRef.current?.close()
      peerConnectionsRef.current.forEach((pc) => pc.close())
    }
  }, [])

  const sendSignal = (type: string, payload: Record<string, unknown> = {}) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type, ...payload }))
  }

  const getPeerConnection = (peerPlayer: string): RTCPeerConnection | null => {
    const existing = peerConnectionsRef.current.get(peerPlayer)
    if (existing) return existing
    if (!localStreamRef.current) return null

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!))

    pc.ontrack = (event) => {
      const [stream] = event.streams
      if (stream && peerVideoRef.current) {
        peerVideoRef.current.srcObject = stream
      }
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      sendSignal('candidate', { target: peerPlayer, candidate: event.candidate.toJSON() })
    }

    peerConnectionsRef.current.set(peerPlayer, pc)
    return pc
  }

  const ensureSocket = (nextRoom: string, nextPlayer: '1' | '2') => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close()
    }

    const socket = new WebSocket(relayWebSocketUrl(nextRoom, nextPlayer))
    wsRef.current = socket

    socket.onopen = () => {
      setStatus(`Connected to room ${nextRoom}. Waiting for the other player.`)
      setPlayers((current) => (current.length ? current : [nextPlayer]))
    }

    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data)
      const sender = message.player

      if (message.type === 'state') {
        setPlayers(message.players || [])
        return
      }

      if (!sender || sender === nextPlayer) return

      if (message.type === 'offer') {
        const pc = getPeerConnection(sender)
        if (!pc) return
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: message.sdp }))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        sendSignal('answer', { target: sender, sdp: answer.sdp })
        return
      }

      if (message.type === 'answer') {
        const pc = getPeerConnection(sender)
        if (!pc) return
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: message.sdp }))
        return
      }

      if (message.type === 'candidate') {
        const pc = getPeerConnection(sender)
        if (pc && message.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(message.candidate))
        }
      }
    }

    socket.onclose = () => {
      setStatus(`Disconnected from room ${nextRoom}.`)
    }

    socket.onerror = () => {
      setStatus('WebSocket error — check the multiplayer relay server.')
    }
  }

  const createRoom = async () => {
    try {
      const response = await fetch(`${RELAY_HTTP_URL}/api/rooms`, { method: 'POST' })
      const text = await response.text()
      if (!text) throw new Error('Empty response from the room server.')
      const payload = JSON.parse(text)
      if (!payload.room) throw new Error('Missing room code in response.')

      const nextRoom = payload.room
      setRoomCode(nextRoom)
      setPlayer('1')
      ensureSocket(nextRoom, '1')
      setStatus(`Room ${nextRoom} created. Share the code, then click Ready.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setStatus(`Could not create lobby: ${message}`)
    }
  }

  const joinRoom = () => {
    const nextRoom = roomCode.trim().toUpperCase()
    if (!/^[A-Z0-9]{4,8}$/.test(nextRoom)) {
      setStatus('Enter a valid room code.')
      return
    }
    setPlayer('2')
    ensureSocket(nextRoom, '2')
    setStatus(`Joined room ${nextRoom}. Click Ready when you are set.`)
  }

  const handleReady = () => {
    if (!roomCode) {
      setStatus('Create or join a room first.')
      return
    }
    setReady(true)
    sendSignal('ready', { room: roomCode, ready: true })
    setStatus(`Ready in room ${roomCode}. Waiting for the other player.`)
  }

  const handleStart = () => {
    if (!roomCode) {
      setStatus('Create or join a room first.')
      return
    }
    sendSignal('start', { room: roomCode, start: true })
  }

  useEffect(() => {
    if (!roomCode) return
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close()
    }
    ensureSocket(roomCode, player)
  }, [roomCode, player])

  const peerSlot = players.find((entry) => entry !== player) ?? '2'

  return (
    <main className="min-h-screen overflow-hidden bg-[#061a30] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute bottom-0 left-1/2 h-[88%] w-[min(48vw,520px)] -translate-x-1/2 bg-[radial-gradient(circle_at_center,_rgba(95,200,235,0.45),_transparent_62%)] [clip-path:polygon(47%_0%,58%_0%,63%_10%,60%_18%,70%_24%,82%_42%,75%_48%,68%_35%,65%_100%,54%_100%,51%_58%,48%_58%,45%_100%,34%_100%,38%_35%,25%_48%,18%_42%,30%_24%,40%_18%,37%_10%,42%_0%)]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col gap-2 px-2 py-2">
        <header className="flex items-center justify-between gap-3 px-1 py-1">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="grid h-9 w-9 place-items-center rounded-md border-2 border-[var(--poses-ink)] bg-[#efd31e] text-[#0f0f0f] transition-transform hover:-translate-y-0.5"
              aria-label="Return to main menu"
            >
              <span className="text-lg">⌂</span>
            </button>
            <div className="font-black uppercase tracking-[0.12em] text-[#efd31e]">POSES</div>
            <div className="hidden text-[10px] tracking-[0.3em] text-[#7fa0bd] sm:block">· 2 PLAYERS</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-[#eaf4ff]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#d62828]" />
              REC
            </div>
            <div className="hidden text-[10px] tracking-[0.25em] text-[#7fa0bd] sm:block">CAMERA FEED</div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
          <section className="relative min-h-[72vh] overflow-hidden border-[3px] border-[#0d2b49] bg-[#051a2d]">
            <div className="flex items-center justify-between border-b-[3px] border-[#0d2b49] bg-[#071d35] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#dfefff]">
              <span>Player 01</span>
              <span className="rounded px-1.5 py-0.5 text-[#051a2d] bg-[#ebf5ff]">WAITING</span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(95,200,235,0.08),_transparent_60%)]" />
              <video ref={localVideoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover [transform:scaleX(-1)] opacity-90" />
            </div>
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded border border-[#1a3d64] bg-[#061f36]/80 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-[#9cbad8]">
              <span>Raise hand</span>
              <span>{player}</span>
            </div>
          </section>

          <section className="relative min-h-[72vh] overflow-hidden border-[3px] border-[#0d2b49] bg-[#051a2d]">
            <div className="flex items-center justify-between border-b-[3px] border-[#0d2b49] bg-[#071d35] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#dfefff]">
              <span>Lobby</span>
              <span className="rounded px-1.5 py-0.5 text-[#051a2d] bg-[#cde9ff]">ONLINE</span>
            </div>

            <div className="absolute inset-x-0 top-20 flex justify-center px-4">
              <div className="w-full max-w-xl rounded-xl border border-[#1f466d] bg-[#0a2239]/70 p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
                <div className="mb-3 flex flex-wrap gap-2">
                  <input
                    value={roomCode}
                    onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                    maxLength={8}
                    placeholder="Room code"
                    className="min-w-[120px] flex-1 rounded border-2 border-black bg-[#0d1d2d] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-300"
                  />
                  <select
                    value={player}
                    onChange={(event) => setPlayer(event.target.value as '1' | '2')}
                    className="rounded border-2 border-black bg-[#0d1d2d] px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="1">Player 1</option>
                    <option value="2">Player 2</option>
                  </select>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={createRoom}
                    className="rounded border-2 border-black bg-[#efd31e] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#0f0f0f] shadow-[3px_3px_0_#0f0f0f] transition hover:-translate-y-0.5 hover:bg-[#f28c28]"
                  >
                    Create lobby
                  </button>
                  <button
                    type="button"
                    onClick={joinRoom}
                    className="rounded border-2 border-black bg-[#efd31e] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#0f0f0f] shadow-[3px_3px_0_#0f0f0f] transition hover:-translate-y-0.5 hover:bg-[#f28c28]"
                  >
                    Join lobby
                  </button>
                  <button
                    type="button"
                    onClick={handleReady}
                    className="rounded border-2 border-black bg-[#efd31e] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#0f0f0f] shadow-[3px_3px_0_#0f0f0f] transition hover:-translate-y-0.5 hover:bg-[#f28c28]"
                  >
                    Ready
                  </button>
                  <button
                    type="button"
                    hidden={!ready}
                    onClick={handleStart}
                    className="rounded border-2 border-black bg-[#efd31e] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#0f0f0f] shadow-[3px_3px_0_#0f0f0f] transition hover:-translate-y-0.5 hover:bg-[#f28c28]"
                  >
                    Start game
                  </button>
                </div>

                <div className="mt-4 rounded border border-[#1a3d64] bg-[#071d35]/80 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-[#dfefff]">
                  {status}
                </div>
              </div>
            </div>

            <div className="absolute inset-0 flex items-center justify-center text-center">
              <div>
                <div className="mb-2 text-[24px] font-black uppercase tracking-[0.12em] text-[#fdfefe]">Each player: raise one hand</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#9cbad8]">Add both players to start</div>
              </div>
            </div>

            <div className="absolute bottom-3 left-3 right-3">
              <div className="rounded border border-[#153859] bg-[#091e31] px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-[#9cbad8]">
                {players.length >= 2 ? `Connected: ${players.join(' / ')}` : 'Connecting to game host...'}
              </div>
            </div>
          </section>

          <section className="relative min-h-[72vh] overflow-hidden border-[3px] border-[#0d2b49] bg-[#051a2d]">
            <div className="flex items-center justify-between border-b-[3px] border-[#0d2b49] bg-[#071d35] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#dfefff]">
              <span>Player 02</span>
              <span className="rounded px-1.5 py-0.5 text-[#051a2d] bg-[#ebf5ff]">WAITING</span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(95,200,235,0.08),_transparent_60%)]" />
              <video ref={peerVideoRef} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover [transform:scaleX(-1)] opacity-90" />
            </div>
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded border border-[#1a3d64] bg-[#061f36]/80 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-[#9cbad8]">
              <span>Player {peerSlot}</span>
              <span>Waiting</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
