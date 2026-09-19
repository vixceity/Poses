'use client'

import { useEffect, useRef, useState } from 'react'

const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]

export default function MultiplayerPage() {
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const peerVideoRef = useRef<HTMLVideoElement | null>(null)
  const [roomCode, setRoomCode] = useState('')
  const [player, setPlayer] = useState<'1' | '2'>('1')
  const [status, setStatus] = useState('Create or join a room.')
  const [players, setPlayers] = useState<string[]>([])
  const [isReady, setIsReady] = useState(false)

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
        setStatus('Camera ready. Create or join a room.')
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
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return
    }
    wsRef.current.send(JSON.stringify({ type, ...payload }))
  }

  const ensureSocket = (nextRoom: string, nextPlayer: '1' | '2') => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close()
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = window.location.hostname || '127.0.0.1'
    const socket = new WebSocket(`${protocol}://${host}:8001/ws/${nextRoom}/${nextPlayer}`)
    wsRef.current = socket

    socket.onopen = () => {
      setStatus(`Connected to room ${nextRoom}. Waiting for the other player.`)
    }

    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data)
      const sender = message.player

      if (!sender || sender === nextPlayer) {
        if (message.type === 'state') {
          setPlayers(message.players || [])
        }
        return
      }

      if (message.type === 'state') {
        setPlayers(message.players || [])
        return
      }

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
      setStatus('WebSocket error. Check the multiplayer relay server.')
    }
  }

  const getPeerConnection = (peerPlayer: string): RTCPeerConnection | null => {
    const existing = peerConnectionsRef.current.get(peerPlayer)
    if (existing) {
      return existing
    }

    if (!localStreamRef.current) {
      return null
    }

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

  const createRoom = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8001/api/rooms', { method: 'POST' })
      const text = await response.text()
      if (!text) {
        throw new Error('Empty response from the room server.')
      }
      const payload = JSON.parse(text)
      if (!payload.room) {
        throw new Error('Missing room code in response.')
      }

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

  const startReady = async () => {
    if (!roomCode) {
      setStatus('Create or join a room first.')
      return
    }
    setIsReady(true)
    sendSignal('ready', { room: roomCode, ready: true })
    setStatus(`Ready in room ${roomCode}. Waiting for the other player.`)
  }

  const startGame = () => {
    if (!roomCode) {
      setStatus('Create or join a room first.')
      return
    }
    sendSignal('start', { room: roomCode, start: true })
  }

  const handleRoomInput = (value: string) => {
    setRoomCode(value.toUpperCase())
  }

  useEffect(() => {
    if (!roomCode) return
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close()
    }
    ensureSocket(roomCode, player)
  }, [roomCode, player])

  useEffect(() => {
    if (!roomCode || !wsRef.current) return
    const handleState = (message: any) => {
      if (message.type === 'state') {
        setPlayers(message.players || [])
      }
    }
    const socket = wsRef.current
    const currentHandler = socket.onmessage
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      handleState(message)
      if (currentHandler) {
        currentHandler.call(socket, event)
      }
    }
  }, [roomCode])

  const otherPlayer = players.find((entry) => entry !== player) ?? '2'

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(95,200,235,0.2),_transparent_35%),linear-gradient(135deg,#0a2540,#0d3a68_52%,#061a30)] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute bottom-0 left-1/2 h-[88%] w-[min(48vw,520px)] -translate-x-1/2 rounded-[2rem] bg-[radial-gradient(circle_at_center,_rgba(95,200,235,0.45),_transparent_62%)] [clip-path:polygon(47%_0%,58%_0%,63%_10%,60%_18%,70%_24%,82%_42%,75%_48%,68%_35%,65%_100%,54%_100%,51%_58%,48%_58%,45%_100%,34%_100%,38%_35%,25%_48%,18%_42%,30%_24%,40%_18%,37%_10%,42%_0%)]" />
      </div>

      <section className="relative z-10 w-[min(84vw,1100px)] rounded-[20px] border border-[rgba(95,200,235,0.25)] bg-[rgba(13,17,25,0.35)] p-5 shadow-[0_20px_60px_rgba(2,6,12,0.35)] backdrop-blur-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-['Archivo_Black'] text-3xl tracking-[0.12em] text-[#83e9ab] sm:text-5xl">POSES ONLINE</h1>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={roomCode}
              onChange={(event) => handleRoomInput(event.target.value)}
              maxLength={8}
              placeholder="Room code"
              className="min-w-[120px] rounded-xl border-2 border-black bg-[rgba(15,15,15,0.24)] px-3 py-2 text-white placeholder:text-slate-300"
            />
            <select
              value={player}
              onChange={(event) => setPlayer(event.target.value as '1' | '2')}
              className="rounded-xl border-2 border-black bg-[rgba(15,15,15,0.24)] px-3 py-2 text-white"
            >
              <option value="1">Player 1</option>
              <option value="2">Player 2</option>
            </select>
            <button onClick={createRoom} className="rounded-xl border-2 border-black bg-[#efd31e] px-3 py-2 font-extrabold text-black shadow-[4px_5px_0_#0f0f0f] transition hover:-translate-y-0.5 hover:bg-[#f28c28]">Create room</button>
            <button onClick={joinRoom} className="rounded-xl border-2 border-black bg-[#efd31e] px-3 py-2 font-extrabold text-black shadow-[4px_5px_0_#0f0f0f] transition hover:-translate-y-0.5 hover:bg-[#f28c28]">Join room</button>
            <button onClick={startReady} className="rounded-xl border-2 border-black bg-[#efd31e] px-3 py-2 font-extrabold text-black shadow-[4px_5px_0_#0f0f0f] transition hover:-translate-y-0.5 hover:bg-[#f28c28]">Ready</button>
            <button hidden={!isReady} onClick={startGame} className="rounded-xl border-2 border-black bg-[#efd31e] px-3 py-2 font-extrabold text-black shadow-[4px_5px_0_#0f0f0f] transition hover:-translate-y-0.5 hover:bg-[#f28c28]">Start game</button>
          </div>
        </div>

        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#bacbd9]">{status}</div>

        <div className="grid min-h-[470px] gap-4 md:grid-cols-2">
          <div className="relative overflow-hidden rounded-[18px] border border-[rgba(95,200,235,0.35)] bg-[#172431]">
            <div className="px-3 pt-3 text-lg font-bold uppercase tracking-[0.12em] text-white">Local camera</div>
            <video ref={localVideoRef} autoPlay muted playsInline className="h-[calc(100%-60px)] w-full object-cover [transform:scaleX(-1)]" />
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-lg border border-[rgba(95,200,235,0.25)] bg-[rgba(6,26,48,0.64)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5fc8eb]">
              <span>You</span>
              <span>PLAYER {player}</span>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[18px] border border-[rgba(95,200,235,0.35)] bg-[#172431]">
            <div className="px-3 pt-3 text-lg font-bold uppercase tracking-[0.12em] text-white">Opponent</div>
            <video ref={peerVideoRef} autoPlay playsInline className="h-[calc(100%-60px)] w-full object-cover [transform:scaleX(-1)]" />
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-lg border border-[rgba(95,200,235,0.25)] bg-[rgba(6,26,48,0.64)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5fc8eb]">
              <span>Peer</span>
              <span>{players.length >= 2 ? `PLAYER ${otherPlayer}` : 'WAITING'}</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
