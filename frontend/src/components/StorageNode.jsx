import { Handle, Position } from '@xyflow/react'
import { HardDrive, Database } from 'lucide-react'
import { getNodeColor, getNodeLabel } from '../lib/nodeTypes.js'

const ICONS = {
  datalake:      HardDrive,
  datawarehouse: Database,
}

export default function StorageNode({ data }) {
  const { type, label } = data
  const color     = getNodeColor(type)
  const typeLabel = getNodeLabel(type)
  const Icon      = ICONS[type] ?? HardDrive

  return (
    <div style={{
      background:   `${color}0d`,
      borderLeft:   `3px solid ${color}`,
      borderRadius: 7,
      padding:      '5px 10px 5px 8px',
      display:      'flex',
      alignItems:   'center',
      gap:          7,
      minWidth:     120,
      maxWidth:     160,
      opacity:      data.dimmed ? 0.30 : 1,
      boxShadow:    data.dimmed ? 'var(--dimmed-node-glow)'
                  : data.insightTarget ? `0 0 0 2px white, 0 0 0 3px ${color}, 0 0 10px ${color}55`
                  : data.highlighted ? `0 0 0 1px ${color}` : 'none',
      border:       data.insightTarget ? `2px solid ${color}` : `1px dashed ${color}60`,
      transition:   'opacity 0.2s, box-shadow 0.2s',
      cursor:       'default',
    }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 6, height: 6 }} />

      <div style={{
        width: 20, height: 20, borderRadius: 5, flexShrink: 0,
        background: `${color}20`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={11} style={{ color }} />
      </div>

      <div style={{ minWidth: 0 }}>
        <p style={{
          fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color, opacity: 0.8,
          lineHeight: 1, marginBottom: 2,
        }}>
          {typeLabel}
        </p>
        <p style={{
          fontSize: 10, fontWeight: 600,
          color: 'var(--node-label-color)',
          overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', maxWidth: 110,
          lineHeight: 1.2,
        }}>
          {label}
        </p>
      </div>

      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 6, height: 6 }} />
    </div>
  )
}
