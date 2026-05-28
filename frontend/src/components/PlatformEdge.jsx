import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react'
import { PLATFORMS } from '../lib/platforms.js'

/**
 * Edge avec badge de plateforme centré dessus via EdgeLabelRenderer.
 * Le badge suit le mouvement des nœuds — il est vraiment dans le flow.
 */
export default function PlatformEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, markerEnd, data,
}) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })

  const platform = PLATFORMS[data?.platformId] ?? PLATFORMS.custom

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ stroke: '#CBD5E1', strokeWidth: 1.5 }}
      />

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'none',
            zIndex: 10,
          }}
          className="nodrag nopan"
        >
          {/* Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: platform.color,
            color: platform.textColor,
            padding: '4px 10px 4px 6px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            boxShadow: `0 2px 10px ${platform.color}55, 0 0 0 2.5px white, 0 0 0 4px ${platform.color}25`,
            whiteSpace: 'nowrap',
          }}>
            {/* Dot */}
            <span style={{
              width: 18, height: 18,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 900, fontFamily: 'monospace',
              flexShrink: 0,
            }}>
              via
            </span>
            {platform.name}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
