import dagre from '@dagrejs/dagre'

const NODE_W       = 240
const NODE_H       = 80
const INTRA_GAP    = 310  // x gap between sub-columns within the same stage
const INTER_EXTRA  = 90   // extra x gap at stage boundaries
const ROW_GAP      = 110  // y gap between nodes in the same column

const LANE_ORDER = ['source', 'staging', 'core', 'mart', 'collapsed', 'use_case']

function nodeLane(node) {
  if (node.type === 'source')    return 'source'
  if (node.type === 'use_case')  return 'use_case'
  if (node.type === 'collapsed') return 'collapsed'
  if (node.stage === 'staging')  return 'staging'
  if (node.stage === 'mart')     return 'mart'
  return 'core'
}

// Longest-path depth considering only edges within the same lane.
// Nodes with no intra-lane parents get depth 0; each hop adds 1.
function intraLaneDepths(nodes, edges) {
  const laneOf  = Object.fromEntries(nodes.map(n => [n.id, nodeLane(n)]))
  const inDegree = Object.fromEntries(nodes.map(n => [n.id, 0]))
  const adj      = Object.fromEntries(nodes.map(n => [n.id, []]))

  for (const e of edges) {
    if (laneOf[e.source] === laneOf[e.target]) {
      inDegree[e.target]++
      adj[e.source].push(e.target)
    }
  }

  const depths = Object.fromEntries(nodes.map(n => [n.id, 0]))
  const queue  = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id)

  while (queue.length) {
    const cur = queue.shift()
    for (const next of adj[cur]) {
      depths[next] = Math.max(depths[next], depths[cur] + 1)
      if (--inDegree[next] === 0) queue.push(next)
    }
  }
  return depths
}

// ── Stage-aware label for collapsed transformation groups ─────────────────────
export function buildCollapsedLabel(items) {
  const counts = {}
  for (const item of items) {
    const s = item.stage ?? '_'
    counts[s] = (counts[s] ?? 0) + 1
  }
  const ORDER = ['staging', 'core', 'mart', '_']
  const NAMES = { staging: 'Staging', core: 'Core', mart: 'Mart', _: 'Table' }
  const parts = ORDER
    .filter(s => counts[s])
    .map(s => `${counts[s]} ${NAMES[s]}${counts[s] !== 1 && s === '_' ? 's' : ''}`)
  return parts.join(' · ') || `${items.length} tables`
}

// ── Build the ReactFlow node/edge graph — stage-lane + intra-depth layout ─────
// Each stage gets one sub-column per level of intra-stage dependency depth.
// Cross-stage edges stay horizontal; intra-stage dependency chains read L→R.
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

  // Intra-stage depth → determines which sub-column within a stage a node sits in
  const depths = intraLaneDepths(nodes, validEdges)

  // Run dagre to get crossing-minimised y positions (we discard its x)
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 55, ranksep: 200, marginx: 40, marginy: 40 })
  nodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }))
  validEdges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)

  // Build ordered list of (lane, depth) sub-columns
  const subCols = []
  for (const lane of LANE_ORDER) {
    const laneNodes = nodes.filter(n => nodeLane(n) === lane)
    if (!laneNodes.length) continue
    const maxDepth = Math.max(...laneNodes.map(n => depths[n.id]))
    for (let d = 0; d <= maxDepth; d++) subCols.push({ lane, depth: d })
  }

  // Assign x to each sub-column; add extra gap at stage boundaries
  const subColX = {}
  let curX = 0
  subCols.forEach(({ lane, depth }, i) => {
    subColX[`${lane}__${depth}`] = curX
    if (i < subCols.length - 1) {
      const crossBoundary = subCols[i + 1].lane !== lane
      curX += INTRA_GAP + (crossBoundary ? INTER_EXTRA : 0)
    }
  })

  // Group nodes by sub-column key, carry dagre y
  const groups = {}
  for (const n of nodes) {
    const key = `${nodeLane(n)}__${depths[n.id]}`
    if (!groups[key]) groups[key] = []
    groups[key].push({ node: n, y: g.node(n.id)?.y ?? 0 })
  }

  // Place nodes: keep dagre y, de-overlap within each sub-column
  const rfNodes = []
  for (const { lane, depth } of subCols) {
    const key   = `${lane}__${depth}`
    const group = groups[key] ?? []
    if (!group.length) continue

    group.sort((a, b) => a.y - b.y)
    let floor = -Infinity
    for (const item of group) {
      item.y = Math.max(item.y, floor + ROW_GAP)
      floor  = item.y
    }

    for (const { node: n, y } of group) {
      rfNodes.push({
        id: n.id,
        type: n.type === 'collapsed' ? 'collapsed' : 'custom',
        position: { x: subColX[key], y: y - NODE_H / 2 },
        data: {
          label: n.label, type: n.type, sheet: n.sheet ?? null,
          stage: n.stage ?? null,
          items: n.items ?? null,
          upstreamCount:   parents[n.id].length,
          downstreamCount: children[n.id].length,
        },
      })
    }
  }

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

      collapsedNodes.push({ id: collapsedId, type: 'collapsed', label: buildCollapsedLabel(items), items })
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
