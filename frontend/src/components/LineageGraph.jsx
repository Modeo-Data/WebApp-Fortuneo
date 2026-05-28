import { useMemo, useCallback, useEffect, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  MarkerType,
  useNodesState, useEdgesState, BackgroundVariant,
  useReactFlow, ReactFlowProvider,
} from '@xyflow/react'
import CustomNode from './CustomNode.jsx'
import OperationNode from './OperationNode.jsx'
import BeltEdge from './BeltEdge.jsx'
import EdgeContextMenu from './EdgeContextMenu.jsx'
import { buildGraph, getConnectedIds } from '../lib/graphUtils.js'

const nodeTypes = { custom: CustomNode, operation: OperationNode }
const edgeTypes  = { belt: BeltEdge }

// ── Inner component — needs ReactFlow context for screenToFlowPosition ────────
function InnerGraph({ nodes, edges, onNodeClick, onPaneClick, selectedNodeId }) {
  const { screenToFlowPosition, fitView } = useReactFlow()

  const init = useMemo(() => buildGraph(nodes, edges), []) // eslint-disable-line
  const [rfNodes, setNodes, onNodesChange] = useNodesState(init.rfNodes)
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState(init.rfEdges)
  const [activeNodeId,  setActiveNodeId]  = useState(null)
  const [contextMenu,   setContextMenu]   = useState(null)
  // { x, y, edgeId, source, target }

  // Rebuild on new subgraph, then fit view with a smooth animation
  useEffect(() => {
    const { rfNodes: n, rfEdges: e } = buildGraph(nodes, edges)
    setNodes(n); setEdges(e); setActiveNodeId(null); setContextMenu(null)
    setTimeout(() => fitView({ padding: 0.18, duration: 350 }), 60)
  }, [nodes, edges])

  useEffect(() => { if (!selectedNodeId) setActiveNodeId(null) }, [selectedNodeId])

  // BFS runs on current rfEdges (includes any op-node edges)
  const connectedIds = useMemo(
    () => activeNodeId ? getConnectedIds(activeNodeId, rfEdges) : new Set(),
    [activeNodeId, rfEdges],
  )

  const displayNodes = useMemo(() => {
    const hasActive = activeNodeId !== null
    return rfNodes.map(n => ({
      ...n,
      selected: n.id === selectedNodeId,
      data: {
        ...n.data,
        dimmed:      hasActive && !connectedIds.has(n.id),
        highlighted: hasActive &&  connectedIds.has(n.id) && n.id !== activeNodeId,
        isActive:    n.id === activeNodeId,
      },
    }))
  }, [rfNodes, selectedNodeId, activeNodeId, connectedIds])

  const displayEdges = useMemo(() => {
    const hasActive = activeNodeId !== null
    return rfEdges.map(e => {
      const inPath = hasActive && connectedIds.has(e.source) && connectedIds.has(e.target)
      const dimmed  = hasActive && !inPath

      if (inPath) return {
        ...e,
        type: 'belt',
        markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: '#FF7327' },
        style: {},
      }

      return {
        ...e,
        markerEnd: {
          type: MarkerType.ArrowClosed, width: 15, height: 15,
          color: dimmed ? '#E2E8F0' : '#94A3B8',
        },
        style: dimmed
          ? { stroke: '#E2E8F0', strokeWidth: 1, opacity: 0.15 }
          : { stroke: '#CBD5E1', strokeWidth: 1.5 },
      }
    })
  }, [rfEdges, activeNodeId, connectedIds])

  const handleNodeClick = useCallback((_, node) => {
    setActiveNodeId(prev => prev === node.id ? null : node.id)
    setContextMenu(null)
    if (node.type !== 'operation') {
      onNodeClick({ id: node.id, label: node.data.label, type: node.data.type, sheet: node.data.sheet })
    }
  }, [onNodeClick])

  const handlePaneClick = useCallback(() => {
    setActiveNodeId(null); setContextMenu(null); onPaneClick?.()
  }, [onPaneClick])

  const handleEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id, source: edge.source, target: edge.target })
  }, [])

  const handleAddOpNode = useCallback((platformId) => {
    if (!contextMenu) return
    const pos = screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y })
    const opId = `__op_${Date.now()}`

    setNodes(prev => [...prev, {
      id: opId,
      type: 'operation',
      position: { x: pos.x - 70, y: pos.y - 35 },
      data: { platformId, label: null },
    }])

    setEdges(prev => {
      const rest = prev.filter(e => e.id !== contextMenu.edgeId)
      return [
        ...rest,
        { id: `${opId}-in`,  source: contextMenu.source, target: opId,              type: 'smoothstep' },
        { id: `${opId}-out`, source: opId,              target: contextMenu.target, type: 'smoothstep' },
      ]
    })

    setContextMenu(null)
  }, [contextMenu, screenToFlowPosition, setNodes, setEdges])

  return (
    <div style={{ width: '100%', height: '100%' }} onClick={() => setContextMenu(null)}>
      <ReactFlow
        nodes={displayNodes} edges={displayEdges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onEdgeContextMenu={handleEdgeContextMenu}
        nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        fitView fitViewOptions={{ padding: 0.2 }}
        minZoom={0.15} maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#E2E8F0" />
        <Controls showInteractive={false} className="!shadow-md !rounded-lg !border !border-slate-200" />
        <MiniMap
          nodeColor={n => {
            if (n.type === 'operation') return '#FF7327'
            return { source: '#3B82F6', transformation: '#F59E0B', kpi: '#10B981' }[n.data?.type] ?? '#E2E8F0'
          }}
          nodeStrokeWidth={0}
          className="!shadow-md !rounded-lg !border !border-slate-200"
          pannable zoomable
        />

        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          fontSize: 11, color: '#FF7327', pointerEvents: 'none',
          background: '#FFF4EE', border: '1px solid #FFD4B8',
          padding: '4px 12px', borderRadius: 999, whiteSpace: 'nowrap',
          boxShadow: '0 1px 4px rgba(255,115,39,0.12)',
          fontWeight: 500,
        }}>
          Right-click an edge to insert an operation step
        </div>
      </ReactFlow>

      {contextMenu && (
        <EdgeContextMenu
          x={contextMenu.x} y={contextMenu.y}
          onSelect={handleAddOpNode}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

// ── Public export — wraps InnerGraph in a ReactFlowProvider ──────────────────
export default function LineageGraph(props) {
  return (
    <ReactFlowProvider>
      <InnerGraph {...props} />
    </ReactFlowProvider>
  )
}
