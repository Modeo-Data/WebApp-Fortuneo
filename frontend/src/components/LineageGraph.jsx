import { useMemo, useCallback, useEffect, useState, useRef } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, Panel,
  MarkerType,
  useNodesState, useEdgesState, BackgroundVariant,
  useReactFlow, ReactFlowProvider,
} from '@xyflow/react'
import CustomNode from './CustomNode.jsx'
import OperationNode from './OperationNode.jsx'
import CollapsedNode from './CollapsedNode.jsx'
import StorageNode from './StorageNode.jsx'
import BeltEdge from './BeltEdge.jsx'
import SpreadEdge from './SpreadEdge.jsx'
import EdgeContextMenu from './EdgeContextMenu.jsx'
import { buildGraph, getConnectedIds } from '../lib/graphUtils.js'
import { getNodeColor } from '../lib/nodeTypes.js'

const NODE_H      = 80
const NODE_W      = 240
const BARRIER_PAD = 12

const nodeTypes = {
  custom: CustomNode,
  operation: OperationNode,
  collapsed: CollapsedNode,
  storage: StorageNode,
}
const edgeTypes = { belt: BeltEdge, spread: SpreadEdge }

// ── AABB helpers ───────────────────────────────────────────────────────────────
function barrierOf(snap) {
  const w = snap.w ?? NODE_W
  const h = snap.h ?? NODE_H
  return {
    x1: snap.x - BARRIER_PAD,
    y1: snap.y - BARRIER_PAD,
    x2: snap.x + w + BARRIER_PAD,
    y2: snap.y + h + BARRIER_PAD,
  }
}

function overlaps(a, b) {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1
}

// ── InnerGraph ─────────────────────────────────────────────────────────────────
function InnerGraph({ nodes, edges, onNodeClick, onDropdownItemClick, onPaneClick, selectedNodeId, insightIds, diffStatusMap, drawerOpen }) {
  const { screenToFlowPosition, fitView } = useReactFlow()

  // Delay "show" until closing animation (300ms) completes, hide immediately on open
  const [drawerFullyClosed, setDrawerFullyClosed] = useState(!drawerOpen)
  useEffect(() => {
    if (drawerOpen) {
      setDrawerFullyClosed(false)
    } else {
      const t = setTimeout(() => setDrawerFullyClosed(true), 300)
      return () => clearTimeout(t)
    }
  }, [drawerOpen])

  const init = useRef(buildGraph(nodes, edges))
  const [rfNodes, setNodes, onNodesChange] = useNodesState(init.current.rfNodes)
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState(init.current.rfEdges)
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
  const didMount = useRef(false)
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return }
    const { rfNodes: n, rfEdges: e } = buildGraph(nodes, edges)
    setNodes(n); setEdges(e)
    homePos.current = {}
    n.forEach(nd => {
      homePos.current[nd.id] = { x: nd.position.x, y: nd.position.y, w: nd.measured?.width ?? NODE_W, h: nd.measured?.height ?? NODE_H }
    })
    setActiveNodeId(null); setOpenDropdownId(null); setContextMenu(null)
    setTimeout(() => fitView({ padding: 0.18, duration: 350 }), 60)
  }, [nodes, edges])

  useEffect(() => { if (!selectedNodeId) setActiveNodeId(null) }, [selectedNodeId])

  // Sync actual measured dimensions from ReactFlow into homePos
  useEffect(() => {
    rfNodes.forEach(n => {
      const w = n.measured?.width
      const h = n.measured?.height
      if (w && h && homePos.current[n.id]) {
        homePos.current[n.id].w = w
        homePos.current[n.id].h = h
      }
    })
  }, [rfNodes])

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
        return home ? { ...n, position: { x: home.x, y: home.y } } : n
      })

      // Step 2: if closing, we're done
      if (!openDropdownId) return cur

      const home = snap[openDropdownId]
      if (!home) return cur

      const parent    = cur.find(n => n.id === openDropdownId)
      const itemCount = parent?.data.items?.length ?? 0
      const dropH     = Math.min(itemCount, MAX_VISIBLE) * ITEM_H
      if (dropH === 0) return cur

      const parentW = home.w ?? NODE_W
      const parentH = home.h ?? NODE_H
      const xOff = (parentW - DROPDOWN_W) / 2
      const drop = {
        x1: home.x + xOff,
        y1: home.y + parentH,
        x2: home.x + xOff + DROPDOWN_W,
        y2: home.y + parentH + dropH,
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
      const pCX  = home.x + parentW / 2
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
    homePos.current[draggedNode.id] = {
      x: draggedNode.position.x, y: draggedNode.position.y,
      w: draggedNode.measured?.width ?? NODE_W, h: draggedNode.measured?.height ?? NODE_H,
    }

    const SKIP = new Set([draggedNode.id])
    const dragB = barrierOf(homePos.current[draggedNode.id])

    setNodes(prev => {
      const snap = {}
      prev.forEach(n => { snap[n.id] = homePos.current[n.id] })

      // Restore every other node to its homePos (wipes any prior visual displacement)
      let cur = prev.map(n => {
        if (SKIP.has(n.id) || !snap[n.id]) return n
        return { ...n, position: { x: snap[n.id].x, y: snap[n.id].y } }
      })

      const colliders = cur.filter(n => {
        if (SKIP.has(n.id) || !snap[n.id]) return false
        return overlaps(dragB, barrierOf(snap[n.id]))
      })
      if (!colliders.length) return cur

      // Classify each collider by minimum penetration axis
      const groups = { up: [], down: [], left: [], right: [] }
      for (const n of colliders) {
        const colB    = barrierOf(snap[n.id])
        const overlapX = Math.min(dragB.x2, colB.x2) - Math.max(dragB.x1, colB.x1)
        const overlapY = Math.min(dragB.y2, colB.y2) - Math.max(dragB.y1, colB.y1)
        if (overlapX < overlapY) {
          // lateral collision — push left or right
          const dragCX = (dragB.x1 + dragB.x2) / 2
          const colCX  = (colB.x1  + colB.x2)  / 2
          groups[colCX >= dragCX ? 'right' : 'left'].push(n)
        } else {
          // vertical collision — push up or down
          const dragCY = (dragB.y1 + dragB.y2) / 2
          const colCY  = (colB.y1  + colB.y2)  / 2
          groups[colCY >= dragCY ? 'down' : 'up'].push(n)
        }
      }

      const dragW  = homePos.current[draggedNode.id].w ?? NODE_W
      const dragH  = homePos.current[draggedNode.id].h ?? NODE_H
      const dragCX = draggedNode.position.x + dragW / 2
      const dragCY = draggedNode.position.y + dragH / 2

      function pushGroup(group, dir) {
        if (!group.length) return
        const isHoriz = dir === 'left' || dir === 'right'

        const pushBy = Math.max(...group.map(n => {
          const s = snap[n.id]
          if (dir === 'down')  return Math.max(0, dragB.y2 + BARRIER_PAD - s.y)
          if (dir === 'up')    return Math.max(0, s.y + (s.h ?? NODE_H) - dragB.y1 + BARRIER_PAD)
          if (dir === 'right') return Math.max(0, dragB.x2 + BARRIER_PAD - s.x)
          if (dir === 'left')  return Math.max(0, s.x + (s.w ?? NODE_W) - dragB.x1 + BARRIER_PAD)
        }))

        const extreme = isHoriz
          ? (dir === 'right' ? Math.min(...group.map(n => snap[n.id].x)) : Math.max(...group.map(n => snap[n.id].x)))
          : (dir === 'down'  ? Math.min(...group.map(n => snap[n.id].y)) : Math.max(...group.map(n => snap[n.id].y)))

        const gIds = new Set(group.map(n => n.id))
        cur.forEach(n => {
          if (SKIP.has(n.id) || gIds.has(n.id) || !snap[n.id]) return
          const s = snap[n.id]
          if (isHoriz) {
            // expand row: same Y band
            if (Math.abs(s.y + (s.h ?? NODE_H) / 2 - dragCY) < (s.h ?? NODE_H)) {
              if (dir === 'right' && s.x >= extreme) gIds.add(n.id)
              if (dir === 'left'  && s.x <= extreme) gIds.add(n.id)
            }
          } else {
            // expand column: same X band
            if (Math.abs(s.x + (s.w ?? NODE_W) / 2 - dragCX) < (s.w ?? NODE_W)) {
              if (dir === 'down' && s.y >= extreme) gIds.add(n.id)
              if (dir === 'up'   && s.y <= extreme) gIds.add(n.id)
            }
          }
        })

        const dx = dir === 'right' ? pushBy : dir === 'left' ? -pushBy : 0
        const dy = dir === 'down'  ? pushBy : dir === 'up'   ? -pushBy : 0
        cur = cur.map(n => {
          if (!gIds.has(n.id)) return n
          const newP = { x: snap[n.id].x + dx, y: snap[n.id].y + dy, w: snap[n.id].w, h: snap[n.id].h }
          homePos.current[n.id] = newP
          return { ...n, position: { x: newP.x, y: newP.y } }
        })
      }

      pushGroup(groups.down,  'down')
      pushGroup(groups.up,    'up')
      pushGroup(groups.right, 'right')
      pushGroup(groups.left,  'left')

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
        dimmed:        hasActive && !connectedIds.has(n.id),
        highlighted:   hasActive && connectedIds.has(n.id) && n.id !== activeNodeId,
        isActive:      n.id === activeNodeId,
        insightTarget: insightIds ? insightIds.has(n.id) : false,
        diffStatus:    diffStatusMap ? (diffStatusMap[n.id] ?? null) : null,
        ...(n.type === 'collapsed' && {
          isOpen: n.id === openDropdownId,
          onSelectItem: item => {
            onDropdownItemClick?.({ id: item.id, label: item.label, type: item.type, sheet: item.sheet, stage: item.stage })
          },
        }),
      },
    }))
  }, [rfNodes, selectedNodeId, activeNodeId, connectedIds, insightIds, openDropdownId, onDropdownItemClick, diffStatusMap])


  const displayEdges = useMemo(() => {
    const hasActive = activeNodeId !== null

    function edgeStyle(action, dimmed, inPath) {
      if (dimmed)  return { stroke: '#E2E8F0', strokeWidth: 1, opacity: 0.12 }
      if (inPath)  return {}
      if (action === 'triggers') return { stroke: '#f97316', strokeWidth: 1.5 }
      if (action === 'write')    return { stroke: '#22c55e', strokeWidth: 1.5 }
      if (action === 'read')     return { stroke: '#60a5fa', strokeWidth: 1.5 }
      return                            { stroke: '#94a3b8', strokeWidth: 1.5 }
    }

    return rfEdges.map(e => {
      const action = e.data?.action ?? null
      const inPath = hasActive && connectedIds.has(e.source) && connectedIds.has(e.target)
      const dimmed  = hasActive && !inPath

      if (inPath) {
        const beltColor = action === 'triggers' ? '#f97316'
          : action === 'write'    ? '#22c55e'
          : action === 'read'     ? '#60a5fa'
          : '#88c648'
        return {
          ...e,
          type: 'belt',
          markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: beltColor },
          data: { ...e.data, beltColor },
        }
      }

      const arrowColor = dimmed ? '#E2E8F0'
        : action === 'triggers' ? '#f97316'
        : action === 'write'    ? '#22c55e'
        : action === 'read'     ? '#60a5fa'
        : '#94a3b8'

      return {
        ...e,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: arrowColor },
        style: edgeStyle(action, dimmed, false),
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
      onNodeClick({ id: node.id, label: node.data.label, type: node.data.type, sheet: node.data.sheet, metadata: node.data.metadata ?? null })
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
        <Controls showInteractive={false} className="!shadow-md !rounded-lg !border !border-app-border" />
        {drawerFullyClosed && (
          <Panel position="bottom-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 8, marginRight: 8 }}>
            <MiniMap
              nodeColor={n => {
                if (n.type === 'operation') return '#88c648'
                return getNodeColor(n.data?.type)
              }}
              nodeStrokeWidth={0}
              className="!shadow-md !rounded-lg !border !border-app-border"
              style={{ position: 'relative', margin: 0 }}
              pannable zoomable
            />
            <div style={{
              background: 'var(--node-bg)',
              border: '1px solid var(--node-border)',
              borderRadius: 8,
              padding: '6px 10px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              pointerEvents: 'none',
            }}>
              {[
                { color: '#f97316', label: 'Triggers' },
                { color: '#22c55e', label: 'Write' },
                { color: '#60a5fa', label: 'Read' },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg width="20" height="8" style={{ flexShrink: 0 }}>
                    <line x1="0" y1="4" x2="14" y2="4" stroke={color} strokeWidth="2" />
                    <polygon points="14,1 20,4 14,7" fill={color} />
                  </svg>
                  <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--node-label-color)' }}>{label}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}
        {drawerFullyClosed && (
          <div style={{
            position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
            fontSize: 11, color: '#88c648', pointerEvents: 'none',
            background: 'var(--accent-pill-bg)', border: '1px solid var(--accent-pill-border)',
            padding: '4px 12px', borderRadius: 999, whiteSpace: 'nowrap',
            boxShadow: '0 1px 4px rgba(255,115,39,0.12)', fontWeight: 500, zIndex: 10,
          }}>
            Right-click an edge to insert an operation step
          </div>
        )}
      </ReactFlow>

      {contextMenu && (
        <EdgeContextMenu x={contextMenu.x} y={contextMenu.y} onSelect={handleAddOpNode} onClose={() => setContextMenu(null)} />
      )}
    </div>
  )
}

export default function LineageGraph({ diffStatusMap, drawerOpen, ...props }) {
  return <ReactFlowProvider><InnerGraph {...props} diffStatusMap={diffStatusMap} drawerOpen={drawerOpen} /></ReactFlowProvider>
}
