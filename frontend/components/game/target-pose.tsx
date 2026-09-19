'use client'

type Point = [number, number]

const EDGES: [number, number][] = [
  [0, 1], [0, 2], [2, 4], [1, 3], [3, 5], [0, 6],
  [1, 7], [6, 7], [6, 8], [8, 10], [7, 9], [9, 11],
]

function project(matrix: number[][]): Point[] | null {
  if (matrix.length < 12 || matrix.slice(0, 12).some((row) => row.length < 2 || !row.slice(0, 2).every(Number.isFinite))) return null

  const source = matrix.slice(0, 12).map(([x, y]) => [x, y] as Point)
  const xs = source.map(([x]) => x)
  const ys = source.map(([, y]) => y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const scale = Math.min(160 / Math.max(0.1, maxX - minX), 220 / Math.max(0.1, maxY - minY))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  return source.map(([x, y]) => [100 + (x - centerX) * scale, 145 + (y - centerY) * scale])
}

export function TargetPose({ matrix, poseIndex, flip }: { matrix: number[][]; poseIndex: number; flip: boolean }) {
  const points = project(matrix)
  if (!points) return <span className="font-hud text-xs text-[#7fa0bd]">TARGET DATA UNAVAILABLE</span>

  const shoulders: Point = [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2]
  const hips: Point = [(points[6][0] + points[7][0]) / 2, (points[6][1] + points[7][1]) / 2]
  const torso = Math.max(32, Math.hypot(hips[0] - shoulders[0], hips[1] - shoulders[1]))
  const head: Point = [shoulders[0], shoulders[1] - torso * 0.45]

  return (
    <svg viewBox="0 0 200 290" className="h-full w-full" role="img" aria-label={`Target pose ${poseIndex + 1}`}>
      <g transform={flip ? 'translate(200,0) scale(-1,1)' : undefined}>
        {EDGES.map(([a, b], index) => (
          <line key={index} x1={points[a][0]} y1={points[a][1]} x2={points[b][0]} y2={points[b][1]}
            stroke="var(--poses-yellow)" strokeWidth={5} strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 5px rgba(239,211,30,0.5))' }} />
        ))}
        <line x1={head[0]} y1={head[1] + torso * 0.16} x2={shoulders[0]} y2={shoulders[1]}
          stroke="var(--poses-yellow)" strokeWidth={5} strokeLinecap="round" />
        <circle cx={head[0]} cy={head[1]} r={torso * 0.18} fill="none" stroke="var(--poses-cyan)" strokeWidth={4}
          style={{ filter: 'drop-shadow(0 0 6px rgba(95,200,235,0.6))' }} />
        {points.map(([x, y], index) => (
          <circle key={index} cx={x} cy={y} r={4.5} fill="var(--poses-cyan)" stroke="var(--poses-ink)" strokeWidth={1.5} />
        ))}
      </g>
    </svg>
  )
}
