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
  const nonKpiNodes = nodes.filter(n => !kpiIds.has(n.id))
  const nonKpiIds   = new Set(nonKpiNodes.map(n => n.id))
  const internalEdges = validEdges.filter(e => nonKpiIds.has(e.source) && nonKpiIds.has(e.target))

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 55, ranksep: 110, marginx: 40, marginy: 40 })
  nonKpiNodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }))
  internalEdges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)

  const rfNodes = nonKpiNodes.map(n => {
    const pos = g.node(n.id)
    return {
      id: n.id, type: 'custom',
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: {
        label: n.label, type: n.type, sheet: n.sheet ?? null,
        upstreamCount:   parents[n.id].length,
        downstreamCount: children[n.id].length,
      },
    }
  })

  const maxX     = nonKpiNodes.reduce((m, n) => Math.max(m, g.node(n.id).x), 0)
  const kpiX     = maxX + NODE_W / 2 + 130
  const kpiList  = nodes.filter(n => kpiIds.has(n.id))
  const kpiTotalH = (kpiList.length - 1) * 110
  const kpiStartY = Math.max((window.innerHeight - 110 - kpiTotalH) / 2, 40)

  kpiList.forEach((n, i) => {
    rfNodes.push({
      id: n.id, type: 'custom',
      position: { x: kpiX, y: kpiStartY + i * 110 },
      data: {
        label: n.label, type: n.type, sheet: n.sheet ?? null,
        upstreamCount:   parents[n.id].length,
        downstreamCount: children[n.id].length,
      },
    })
  })

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
