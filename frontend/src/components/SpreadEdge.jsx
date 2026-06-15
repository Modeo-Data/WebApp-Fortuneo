import { BaseEdge, useReactFlow, useNodesInitialized } from '@xyflow/react'
import { routeEdgeStaircase } from '../lib/edgeUtils.js'

const SPREAD   = 14
const EXIT_MAX = 100  // center edge horizontal exit (px)
const EXIT_MIN = 30   // outermost edge horizontal exit (px)

const ACTION_COLOR = {
  triggers: '#f97316',
  write:    '#22c55e',
  read:     '#60a5fa',
}

function centerOutRank(idx, total) {
  const center = (total - 1) / 2
  return [...Array(total).keys()]
    .sort((a, b) => {
      const da = Math.abs(a - center), db = Math.abs(b - center)
      return da !== db ? da - db : a - b
    })
    .indexOf(idx)
}

export default function SpreadEdge({
  id, source, target,
  sourceX, sourceY, targetX, targetY,
  markerEnd, style, data,
}) {
  const { getNodes } = useReactFlow()
  useNodesInitialized()  // re-render once all nodes have measured dimensions
  const { srcIdx = 0, srcTotal = 1, tgtIdx = 0, tgtTotal = 1, action } = data ?? {}
  const color = ACTION_COLOR[action] ?? '#94a3b8'

  const sy = sourceY + (srcIdx - (srcTotal - 1) / 2) * SPREAD
  const ty = targetY + (tgtIdx - (tgtTotal - 1) / 2) * SPREAD

  const srcRank  = centerOutRank(srcIdx, srcTotal)
  const tgtRank  = centerOutRank(tgtIdx, tgtTotal)
  const exitLen  = EXIT_MAX - srcRank * (EXIT_MAX - EXIT_MIN) / Math.max(srcTotal - 1, 1)
  const entryLen = EXIT_MAX - tgtRank * (EXIT_MAX - EXIT_MIN) / Math.max(tgtTotal - 1, 1)

  const path = routeEdgeStaircase(sourceX, sy, targetX, ty, getNodes(), source, target, exitLen, entryLen)

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      <circle cx={sourceX} cy={sy} r={3.5} fill={color} />
    </>
  )
}
