import { useMemo, useCallback, useEffect, useState, useRef } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  MarkerType,
  useNodesState, useEdgesState, BackgroundVariant,
  useReactFlow, ReactFlowProvider,
} from '@xyflow/react'
import CustomNode from './CustomNode.jsx'
import OperationNode from './OperationNode.jsx'
import CollapsedNode from './CollapsedNode.jsx'
import BeltEdge from './BeltEdge.jsx'
import EdgeContextMenu from './EdgeContextMenu.jsx'
import { buildGraph, getConnectedIds } from '../lib/graphUtils.js'

const NODE_H      = 80
const NODE_W      = 240
const BARRIER_PAD = 12

const nodeTypes = {
  custom: CustomNode,
  operation: OperationNode,
  collapsed: CollapsedNode,
}
const edgeTypes = { belt: BeltEdge }

// ── AABB helpers ───────────────────────────────────────────────────────────────
function barrierOf(pos) {
  return {
    x1: pos.x - BARRIER_PAD,
    y1: pos.y - BARRIER_PAD,
    x2: pos.x + NODE_W + BARRIER_PAD,
    y2: pos.y + NODE_H + BARRIER_PAD,
  }
}

function overlaps(a, b) {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1
}

// ── InnerGraph ─────────────────────────────────────────────────────────────────
function InnerGraph({ nodes, edges, onNodeClick, onDropdownItemClick, onPaneClick, selectedNodeId }) {
  const { screenToFlowPosition, fitView } = useReactFlow()

  const init = useMemo(() => buildGraph(nodes, edges), []) // eslint-disable-line
  const [rfNodes, setNodes, onNodesChange] = useNodesState(init.rfNodes)
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState(init.rfEdges)
  const [activeNodeId,   setActiveNodeId]   = useState(null)
  const [openDropdownId, setOpenDropdownId] = useState(null)
  const [contextMenu,    setContextMenu]    = useState(null)

  /**
   * homePos — the authoritative position for every node.
   * Initialised from the dagre layout on graph rebuild.
   * Updated by drag stop for the dragged node AND any nodes it pushed (permanent).
   * NEVER updated by the dropdown (dropdown push is always temporary).
   */
  const homePos = useRef({})

  // ── Graph rebuild ──────────────────────────────────────────────────────────
  useEffect(() => {
    const { rfNodes: n, rfEdges: e } = buildGraph(nodes, edges)
    setNodes(n); setEdges(e)
    homePos.current = {}
    n.forEach(nd => { homePos.current[nd.id] = { ...nd.position } })
    setActiveNodeId(null); setOpenDropdownId(null); setContextMenu(null)
    setTimeout(() => fitView({ padding: 0.18, duration: 350 }), 60)
  }, [nodes, edges])

  useEffect(() => { if (!selectedNodeId) setActiveNodeId(null) }, [selectedNodeId])

  // ── Dropdown push / restore ────────────────────────────────────────────────
  // Strategy: on every openDropdownId change, restore ALL nodes to their home,
  // then push only the ones that collide with the current dropdown rect.
  // This is self-correcting — no separate "pushed IDs" tracking needed.
  useEffect(() => {
    setNodes(prev => {
      // Snapshot homePos for all nodes at this moment
      const snap = {}
      prev.forEach(n => { snap[n.id] = homePos.current[n.id] })

      const DROPDOWN_W  = 212
      const ITEM_H      = 30
      const MAX_VISIBLE = 7

      // Step 1: restore everything to home
      let cur = prev.map(n => {
        const home = snap[n.id]
        return home ? { ...n, position: { ...home } } : n
      })

      // Step 2: if closing, we're done
      if (!openDropdownId) return cur

      const home = snap[openDropdownId]
      if (!home) return cur

      const parent    = cur.find(n => n.id === openDropdownId)
      const itemCount = parent?.data.items?.length ?? 0
      const dropH     = Math.min(itemCount, MAX_VISIBLE) * ITEM_H
      if (dropH === 0) return cur

      const xOff = (NODE_W - DROPDOWN_W) / 2
      const drop = {
        x1: home.x + xOff,
        y1: home.y + NODE_H,
        x2: home.x + xOff + DROPDOWN_W,
        y2: home.y + NODE_H + dropH,
      }

      const SKIP = new Set([openDropdownId])

      // Step 3: find nodes whose barrier (at home) collides with the dropdown rect
      const colliders = cur.filter(n => {
        if (SKIP.has(n.id) || !snap[n.id]) return false
        return overlaps(barrierOf(snap[n.id]), drop)
      })
      if (!colliders.length) return cur

      // How far to push: topmost collider barrier must clear dropdown bottom + gap
      const pushBy = Math.max(...colliders.map(n =>
        Math.max(0, drop.y2 + 2 * BARRIER_PAD - snap[n.id].y)
      ))

      // Expand group: every node in the same column at or below the topmost collider
      const minY = Math.min(...colliders.map(n => snap[n.id].y))
      const pCX  = home.x + NODE_W / 2
      const gIds = new Set(colliders.map(n => n.id))
      cur.forEach(n => {
        if (SKIP.has(n.id) || gIds.has(n.id) || !snap[n.id]) return
        if (Math.abs(snap[n.id].x + NODE_W / 2 - pCX) < NODE_W && snap[n.id].y >= minY) {
          gIds.add(n.id)
        }
      })

      // Step 4: push group visually (home positions stay untouched)
      return cur.map(n => {
        if (!gIds.has(n.id)) return n
        return { ...n, position: { x: snap[n.id].x, y: snap[n.id].y + pushBy } }
      })
    })
  }, [openDropdownId]) // eslint-disable-line

  // ── Drag stop: permanent repositioning ────────────────────────────────────
  // Dragged node + any pushed nodes all get their homePos updated.
  // We restore everything to homePos first (clearing prior push from when this
  // node was elsewhere), then push and SAVE the new positions.
  const handleNodeDragStop = useCallback((_, draggedNode) => {
    homePos.current[draggedNode.id] = { ...draggedNode.position }

    const SKIP = new Set([draggedNode.id])
    const dragB = barrierOf(draggedNode.position)

    setNodes(prev => {
      const snap = {}
      prev.forEach(n => { snap[n.id] = homePos.current[n.id] })

      // Restore every other node to its homePos (wipes any prior visual displacement)
      let cur = prev.map(n => {
        if (SKIP.has(n.id) || !snap[n.id]) return n
        return { ...n, position: { ...snap[n.id] } }
      })

      const colliders = cur.filter(n => {
        if (SKIP.has(n.id) || !snap[n.id]) return false
        return overlaps(dragB, barrierOf(snap[n.id]))
      })
      if (!colliders.length) return cur

      const dragCX = draggedNode.position.x + NODE_W / 2
      const below  = colliders.filter(n => snap[n.id].y >= draggedNode.position.y)
      const above  = colliders.filter(n => snap[n.id].y <  draggedNode.position.y)

      function pushGroup(group, dir) {
        if (!group.length) return
        const pushBy = Math.max(...group.map(n =>
          dir === 'down'
            ? Math.max(0, dragB.y2 + BARRIER_PAD - snap[n.id].y)
            : Math.max(0, snap[n.id].y + NODE_H - dragB.y1 + BARRIER_PAD)
        ))
        const extremeY = dir === 'down'
          ? Math.min(...group.map(n => snap[n.id].y))
          : Math.max(...group.map(n => snap[n.id].y))
        const gIds = new Set(group.map(n => n.id))
        cur.forEach(n => {
          if (SKIP.has(n.id) || gIds.has(n.id) || !snap[n.id]) return
          if (Math.abs(snap[n.id].x + NODE_W / 2 - dragCX) < NODE_W) {
            if (dir === 'down' && snap[n.id].y >= extremeY) gIds.add(n.id)
            if (dir === 'up'   && snap[n.id].y <= extremeY) gIds.add(n.id)
          }
        })
        const dy = dir === 'down' ? pushBy : -pushBy
        cur = cur.map(n => {
          if (!gIds.has(n.id)) return n
          const newP = { x: snap[n.id].x, y: snap[n.id].y + dy }
          homePos.current[n.id] = newP   // save permanently so next drag sees correct positions
          return { ...n, position: newP }
        })
      }

      pushGroup(below, 'down')
      pushGroup(above, 'up')

      return cur
    })
  }, [])

  // Close dropdown when any drag starts — avoids open dropdown floating mid-air
  const handleNodeDragStart = useCallback(() => {
    if (openDropdownId) setOpenDropdownId(null)
  }, [openDropdownId])

  // ── Display node computation ───────────────────────────────────────────────
  const connectedIds = useMemo(
    () => activeNodeId ? getConnectedIds(activeNodeId, rfEdges) : new Set(),
    [activeNodeId, rfEdges],
  )

  const displayNodes = useMemo(() => {
    const hasActive = activeNodeId !== null
    return rfNodes.map(n => ({
      ...n,
      zIndex: n.id === openDropdownId ? 1000 : (n.zIndex ?? 0),
      selected: n.id === selectedNodeId,
      data: {
        ...n.data,
        dimmed:      hasActive && !connectedIds.has(n.id),
        highlighted: hasActive &&  connectedIds.has(n.id) && n.id !== activeNodeId,
        isActive:    n.id === activeNodeId,
        ...(n.type === 'collapsed' && {
          isOpen: n.id === openDropdownId,
          onSelectItem: item => {
            onDropdownItemClick?.({ id: item.id, label: item.label, type: item.type, sheet: item.sheet })
          },
        }),
      },
    }))
  }, [rfNodes, selectedNodeId, activeNodeId, connectedIds, openDropdownId, onDropdownItemClick])


  const displayEdges = useMemo(() => {
    const hasActive = activeNodeId !== null
    return rfEdges.map(e => {
      const inPath = hasActive && connectedIds.has(e.source) && connectedIds.has(e.target)
      const dimmed  = hasActive && !inPath
      if (inPath) return {
        ...e,
        type: 'belt',
        markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: '#88c648' },
        style: {},
      }
      return {
        ...e,
        markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: dimmed ? '#E2E8F0' : '#94A3B8' },
        style: dimmed ? { stroke: '#E2E8F0', strokeWidth: 1, opacity: 0.15 } : { stroke: '#CBD5E1', strokeWidth: 1.5 },
      }
    })
  }, [rfEdges, activeNodeId, connectedIds])

  // ── Event handlers ─────────────────────────────────────────────────────────
  const handleNodeClick = useCallback((_, node) => {
    setContextMenu(null)

    if (node.type === 'collapsed') {
      setOpenDropdownId(prev => prev === node.id ? null : node.id)
      setActiveNodeId(null)
      return
    }

    setOpenDropdownId(null)
    setActiveNodeId(prev => prev === node.id ? null : node.id)

    if (node.type !== 'operation') {
      onNodeClick({ id: node.id, label: node.data.label, type: node.data.type, sheet: node.data.sheet })
    }
  }, [onNodeClick])

  const handlePaneClick = useCallback(() => {
    setActiveNodeId(null); setOpenDropdownId(null); setContextMenu(null); onPaneClick?.()
  }, [onPaneClick])

  const handleEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id, source: edge.source, target: edge.target })
  }, [])

  const handleAddOpNode = useCallback((platformId) => {
    if (!contextMenu) return
    const pos = screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y })
    const opId = `__op_${Date.now()}`
    setNodes(prev => [...prev, { id: opId, type: 'operation', position: { x: pos.x - 70, y: pos.y - 35 }, data: { platformId, label: null } }])
    setEdges(prev => {
      const rest = prev.filter(e => e.id !== contextMenu.edgeId)
      return [...rest,
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
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
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
            if (n.type === 'operation') return '#88c648'
            return { source: '#3B82F6', transformation: '#F59E0B', kpi: '#10B981' }[n.data?.type] ?? '#E2E8F0'
          }}
          nodeStrokeWidth={0}
          className="!shadow-md !rounded-lg !border !border-slate-200"
          pannable zoomable
        />
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          fontSize: 11, color: '#88c648', pointerEvents: 'none',
          background: 'var(--accent-pill-bg)', border: '1px solid var(--accent-pill-border)',
          padding: '4px 12px', borderRadius: 999, whiteSpace: 'nowrap',
          boxShadow: '0 1px 4px rgba(255,115,39,0.12)', fontWeight: 500, zIndex: 10,
        }}>
          Right-click an edge to insert an operation step
        </div>
      </ReactFlow>

      {contextMenu && (
        <EdgeContextMenu x={contextMenu.x} y={contextMenu.y} onSelect={handleAddOpNode} onClose={() => setContextMenu(null)} />
      )}
    </div>
  )
}

export default function LineageGraph(props) {
  return <ReactFlowProvider><InnerGraph {...props} /></ReactFlowProvider>
}
