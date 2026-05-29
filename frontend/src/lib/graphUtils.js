import dagre from '@dagrejs/dagre'

const NODE_W = 240
const NODE_H = 80

// ── Build the ReactFlow node/edge graph using dagre layout ────────────────────
export function buildGraph(nodes, edges) {
  if (!nodes.length) return { rfNodes: [], rfEdges: [] }

  const nodeIds    = new Set(nodes.map(n => n.id))
  const validEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))

  const children = Object.fromEntries(nodes.map(n => [n.id, []]))
  const parents  = Object.fromEntries(nodes.map(n => [n.id, []]))
  for (const e of validEdges) {
    children[e.source].push(e.target)
    parents[e.target].push(e.source)
  }

  const kpiIds      = new Set(nodes.filter(n => n.type === 'kpi').map(n => n.id))
  const dashIds     = new Set(nodes.filter(n => n.type === 'dashboard').map(n => n.id))
  const terminalIds = new Set([...kpiIds, ...dashIds])
  const coreNodes   = nodes.filter(n => !terminalIds.has(n.id))
  const coreIds     = new Set(coreNodes.map(n => n.id))
  const internalEdges = validEdges.filter(e => coreIds.has(e.source) && coreIds.has(e.target))

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 55, ranksep: 110, marginx: 40, marginy: 40 })
  coreNodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }))
  internalEdges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)

  const rfNodes = coreNodes.map(n => {
    const pos = g.node(n.id)
    return {
      id: n.id, type: n.type === 'collapsed' ? 'collapsed' : 'custom',
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: {
        label: n.label, type: n.type, sheet: n.sheet ?? null,
        items: n.items ?? null,
        upstreamCount:   parents[n.id].length,
        downstreamCount: children[n.id].length,
      },
    }
  })

  const maxX  = coreNodes.length ? coreNodes.reduce((m, n) => Math.max(m, g.node(n.id).x), 0) : 0
  const kpiX  = maxX + NODE_W / 2 + 130
  const dashX = kpiX + NODE_W + 130

  function placeColumn(list, x) {
    const totalH = (list.length - 1) * 110
    const startY = Math.max((window.innerHeight - 110 - totalH) / 2, 40)
    list.forEach((n, i) => {
      rfNodes.push({
        id: n.id, type: n.type === 'collapsed' ? 'collapsed' : 'custom',
        position: { x, y: startY + i * 110 },
        data: {
          label: n.label, type: n.type, sheet: n.sheet ?? null,
          items: n.items ?? null,
          upstreamCount:   parents[n.id].length,
          downstreamCount: children[n.id].length,
        },
      })
    })
  }

  placeColumn(nodes.filter(n => kpiIds.has(n.id)), kpiX)
  placeColumn(nodes.filter(n => dashIds.has(n.id)), dashX)

  const rfEdges = validEdges.map((e, i) => ({
    id: `e-${i}`, source: e.source, target: e.target, type: 'smoothstep',
  }))

  return { rfNodes, rfEdges }
}

// ── BFS: all connected node ids in the ReactFlow graph (includes op-nodes) ───
export function getConnectedIds(startId, rfEdges) {
  const desc = new Set([startId])
  let ch = true
  while (ch) {
    ch = false
    for (const e of rfEdges)
      if (desc.has(e.source) && !desc.has(e.target)) { desc.add(e.target); ch = true }
  }
  const anc = new Set([startId])
  ch = true
  while (ch) {
    ch = false
    for (const e of rfEdges)
      if (anc.has(e.target) && !anc.has(e.source)) { anc.add(e.source); ch = true }
  }
  return new Set([...desc, ...anc])
}

// ── BFS: full upstream + downstream subgraph for a focused node ───────────────
export function getSubgraph(focusedId, allNodes, allEdges) {
  const upstream = new Set()
  const q1 = [focusedId]
  while (q1.length) {
    const cur = q1.pop()
    for (const e of allEdges)
      if (e.target === cur && !upstream.has(e.source)) { upstream.add(e.source); q1.push(e.source) }
  }
  const downstream = new Set()
  const q2 = [focusedId]
  while (q2.length) {
    const cur = q2.pop()
    for (const e of allEdges)
      if (e.source === cur && !downstream.has(e.target)) { downstream.add(e.target); q2.push(e.target) }
  }
  const relevant = new Set([...upstream, ...downstream, focusedId])
  return {
    nodes: allNodes.filter(n => relevant.has(n.id)),
    edges: allEdges.filter(e => relevant.has(e.source) && relevant.has(e.target)),
  }
}

// ── Simplified subgraph: collapse transformations into clickable "N tables" nodes ─
export function simplifySubgraph({ nodes, edges }) {
  const transformIds = new Set(nodes.filter(n => n.type === 'transformation').map(n => n.id))
  const keptNodes    = nodes.filter(n => n.type !== 'transformation')
  const keptIds      = new Set(keptNodes.map(n => n.id))

  const collapsedNodes = []
  const syntheticEdges = []
  const seen = new Set()

  for (const node of keptNodes) {
    // BFS upstream through transformations — stop at other kept nodes
    const transformAncestors = new Set()
    const visited = new Set()
    const q = [node.id]
    while (q.length) {
      const cur = q.pop()
      for (const e of edges) {
        if (e.target === cur && !visited.has(e.source)) {
          visited.add(e.source)
          if (transformIds.has(e.source)) { transformAncestors.add(e.source); q.push(e.source) }
        }
      }
    }

    if (transformAncestors.size === 0) {
      // No hidden transforms — draw direct edges from any kept parent
      for (const e of edges) {
        if (e.target === node.id && keptIds.has(e.source)) {
          const key = `${e.source}→${node.id}`
          if (!seen.has(key)) { seen.add(key); syntheticEdges.push({ source: e.source, target: node.id }) }
        }
      }
    } else {
      // Create one collapsed node representing all hidden transforms for this node
      const collapsedId = `__collapsed_${node.id}`
      const items = [...transformAncestors].map(id => nodes.find(n => n.id === id)).filter(Boolean)

      collapsedNodes.push({ id: collapsedId, type: 'collapsed', label: `${items.length} table${items.length !== 1 ? 's' : ''}`, items })
      syntheticEdges.push({ source: collapsedId, target: node.id })

      // Find kept ancestors of the transform group → draw kept → collapsed
      const tVisited = new Set()
      const tQueue   = [...transformAncestors]
      while (tQueue.length) {
        const cur = tQueue.pop()
        for (const e of edges) {
          if (e.target === cur && !tVisited.has(e.source)) {
            tVisited.add(e.source)
            if (keptIds.has(e.source)) {
              const key = `${e.source}→${collapsedId}`
              if (!seen.has(key)) { seen.add(key); syntheticEdges.push({ source: e.source, target: collapsedId }) }
            } else if (transformIds.has(e.source)) {
              tQueue.push(e.source)
            }
          }
        }
      }
    }
  }

  return { nodes: [...keptNodes, ...collapsedNodes], edges: syntheticEdges }
}

// ── BFS: all downstream node ids from a source ────────────────────────────────
export function getDownstream(sourceId, edges) {
  const visited = new Set()
  const queue = [sourceId]
  while (queue.length) {
    const cur = queue.pop()
    for (const e of edges)
      if (e.source === cur && !visited.has(e.target)) { visited.add(e.target); queue.push(e.target) }
  }
  return visited
}
