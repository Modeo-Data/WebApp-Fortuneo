import { BaseEdge, getSmoothStepPath } from '@xyflow/react'

export default function BeltEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd }) {
  const [edgePath] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  return (
    <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={{
      stroke: '#FF7327', strokeWidth: 3,
      strokeDasharray: '10 6',
      animation: 'belt 0.45s linear infinite',
      filter: 'drop-shadow(0 0 4px #FF732788)',
    }} />
  )
}
