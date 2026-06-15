import dagre from '@dagrejs/dagre'
import { isSmallNode } from './nodeTypes.js'

const NODE_W    = 220
const NODE_H    = 76
const STORAGE_W = 140
const STORAGE_H = 34

function nodeW(node) { return isSmallNode(node.type) ? STORAGE_W : NODE_W }
function nodeH(node) { return isSmallNode(node.type) ? STORAGE_H : NODE_H }

// ── Stage-aware label for collapsed transformation groups ─────────────────────
export function buildCollapsedLabel(items) {
  const counts = {}
  for (const item of items) {
    const s = item.stage ?? item.type ?? '_'
    counts[s] = (counts[s] ?? 0) + 1
  }
  const parts = Object.entries(counts).map(([s, c]) => `${c} ${s}`)
  return parts.join(' · ') || `${items.length} nodes`
}

// Lane rank per node type — determines X column (left → right)
const TYPE_LANE = {
  feature:        0,
  component:      1,
  datalake:       2,  // visually between component and collection
  collection:     3,
  collapsed:      3,  // replaces collection (+datalake) in simplified view
  datawarehouse:  4,
  // legacy types
  source:         0,
  ingest:         1,
  compute:        2,
  virtual:        2,
  extract:        2,
  transformation: 2,
  use_case:       3,
}
const LANE_SPACING = 320 // px between lane centres

// ── Build the ReactFlow node/edge graph ───────────────────────────────────────
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

  // Effective lane per node:
  // - Anchored types (feature, component) stay at TYPE_LANE — never pushed.
  // - All other nodes (collection, datalake, datawarehouse…) are pushed right
  //   by topological propagation so compute chains spread horizontally with
  //   intermediate warehouse nodes landing naturally between their producer
  //   and consumer.
  const ANCHORED_TYPES = new Set(['feature', 'component'])
  const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]))
  const effectiveLane = {}
  nodes.forEach(n => { effectiveLane[n.id] = TYPE_LANE[n.type] ?? 2 })
  let laneChanged = true
  while (laneChanged) {
    laneChanged = false
    for (const e of validEdges) {
      if (ANCHORED_TYPES.has(nodeById[e.target]?.type)) continue
      const needed = effectiveLane[e.source] + 1
      if (needed > effectiveLane[e.target]) {
        effectiveLane[e.target] = needed
        laneChanged = true
      }
    }
  }

  // Dagre for Y only — X is overridden by effective lane
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 100, ranksep: LANE_SPACING, marginx: 80, marginy: 80 })
  nodes.forEach(n => g.setNode(n.id, { width: nodeW(n), height: nodeH(n) }))
  validEdges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)

  // Map each present effective lane to a sequential column index
  const lanesPresent = [...new Set(nodes.map(n => effectiveLane[n.id]))].sort((a, b) => a - b)
  const laneCol      = Object.fromEntries(lanesPresent.map((lane, i) => [lane, i]))

  const rfNodes = nodes.map(n => {
    const { y = 0 } = g.node(n.id) ?? {}
    const w    = nodeW(n)
    const h    = nodeH(n)
    const x    = laneCol[effectiveLane[n.id]] * LANE_SPACING + 80

    const rfType = n.type === 'collapsed' ? 'collapsed'
      : isSmallNode(n.type)               ? 'storage'
      : 'custom'

    return {
      id:       n.id,
      type:     rfType,
      position: { x: x - w / 2, y: y - h / 2 },
      data: {
        label:           n.label,
        type:            n.type,
        sheet:           n.sheet    ?? null,
        stage:           n.stage    ?? null,
        items:           n.items    ?? null,
        metadata:        n.metadata ?? null,
        upstreamCount:   parents[n.id].length,
        downstreamCount: children[n.id].length,
      },
    }
  })

  // Capture dagre center positions for sort-based spread (use effective lane X for nodeXPos)
  const nodeYPos = {}; const nodeXPos = {}
  nodes.forEach(n => {
    const nd   = g.node(n.id) ?? {}
    nodeYPos[n.id] = nd.y ?? 0
    nodeXPos[n.id] = laneCol[effectiveLane[n.id]] * LANE_SPACING + 80
  })

  // Build raw edges
  const rawEdges = validEdges.map((e, i) => ({
    id:     `e-${i}`,
    source: e.source,
    target: e.target,
    type:   'spread',
    data:   { action: e.action ?? null },
  }))

  // Group by source and target
  const bySource = {}; const byTarget = {}
  rawEdges.forEach(e => {
    ;(bySource[e.source] ??= []).push(e)
    ;(byTarget[e.target] ??= []).push(e)
  })

  // Sort each source group: write edges exit from the top, triggers from the bottom.
  // Within the same action type, sort by angle (atan2) from source → target:
  //   most upward (steep negative angle) = top spread position
  //   nearly horizontal or downward      = lower spread positions
  // This means "accounts" (slightly above, nearly same Y) gets a middle position
  // rather than the very bottom, which would look visually backwards.
  // Center-out srcIdx: position 0 in the sorted array → most central srcIdx.
  // Alternates outward: 0→center, 1→center+1, 2→center-1, 3→center+2, …
  function centerOutIdx(pos, total) {
    const center = Math.floor((total - 1) / 2)
    if (pos === 0) return center
    const step = Math.ceil(pos / 2)
    const sign = pos % 2 === 1 ? 1 : -1
    return Math.max(0, Math.min(total - 1, center + sign * step))
  }

  // Threshold: if all targets in a group are within this many px vertically,
  // treat them as "same Y" and order by X distance instead of angle.
  const SAME_Y_PX = 80

  const srcIdxMap = {}; const tgtIdxMap = {}
  Object.values(bySource).forEach(grp => {
    const targetYs = grp.map(e => nodeYPos[e.target])
    const yRange   = Math.max(...targetYs) - Math.min(...targetYs)

    if (yRange < SAME_Y_PX) {
      // All targets at similar Y → sort by X distance ascending (closest first).
      // Closest target gets the most central exit position (center-out assignment).
      grp.sort((a, b) => {
        const dxA = nodeXPos[a.target] - nodeXPos[a.source]
        const dxB = nodeXPos[b.target] - nodeXPos[b.source]
        return dxA - dxB
      })
      grp.forEach((e, pos) => { srcIdxMap[e.id] = centerOutIdx(pos, grp.length) })
    } else {
      // Y-diverse targets → sort by angle so upward targets exit top, downward exit bottom.
      grp.sort((a, b) => {
        const angleA = Math.atan2(nodeYPos[a.target] - nodeYPos[a.source], nodeXPos[a.target] - nodeXPos[a.source])
        const angleB = Math.atan2(nodeYPos[b.target] - nodeYPos[b.source], nodeXPos[b.target] - nodeXPos[b.source])
        return angleA - angleB
      })
      grp.forEach((e, i) => { srcIdxMap[e.id] = i })
    }
  })
  Object.values(byTarget).forEach(grp => {
    grp.sort((a, b) => nodeYPos[a.source] - nodeYPos[b.source])
    grp.forEach((e, i) => { tgtIdxMap[e.id] = i })
  })

  const rfEdges = rawEdges.map(e => ({
    ...e,
    data: {
      ...e.data,
      srcIdx:   srcIdxMap[e.id] ?? 0,
      srcTotal: bySource[e.source]?.length ?? 1,
      tgtIdx:   tgtIdxMap[e.id] ?? 0,
      tgtTotal: byTarget[e.target]?.length ?? 1,
    },
  }))

  return { rfNodes, rfEdges }
}

// ── BFS: all connected node ids in the ReactFlow graph ───────────────────────
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

// ── Scoped subgraph for a focused node ───────────────────────────────────────
// - Family nodes (focused + hierarchy children): full I/O (datalakes + warehouses)
// - Upstream producers: only the connecting warehouse + producer node (no producer's datalakes)
// - Downstream consumers: only the connecting warehouse + consumer + consumer's outputs
export function getSubgraph(focusedId, allNodes, allEdges) {
  const nodeMap = Object.fromEntries(allNodes.map(n => [n.id, n]))
  const isBig   = id => { const n = nodeMap[id]; return n && !isSmallNode(n.type) }
  const relevant = new Set([focusedId])

  // Step 1 — Walk DOWN from focused through big nodes (feature → component → collection)
  let queue = [focusedId]
  while (queue.length) {
    const cur = queue.pop()
    for (const e of allEdges)
      if (e.source === cur && isBig(e.target) && !relevant.has(e.target))
        { relevant.add(e.target); queue.push(e.target) }
  }
  const family = new Set([...relevant].filter(isBig))

  // Step 2 — Add ALL small neighbours of family nodes (their full I/O: datalakes + warehouses)
  for (const id of family) {
    for (const e of allEdges) {
      if (e.source === id && !isBig(e.target)) relevant.add(e.target)
      if (e.target === id && !isBig(e.source)) relevant.add(e.source)
    }
  }

  // Step 3 — Trace UPSTREAM through warehouses only:
  //          find the big node that wrote each warehouse input, recursively.
  //          Only adds the connecting warehouse + producer — NOT the producer's datalakes.
  const upDone = new Set()
  function traceUp(bigId) {
    if (upDone.has(bigId)) return
    upDone.add(bigId)
    for (const e of allEdges) {
      if (e.target === bigId && !isBig(e.source)) {
        for (const e2 of allEdges) {
          if (e2.target === e.source && isBig(e2.source) && !relevant.has(e2.source)) {
            relevant.add(e.source)   // connecting warehouse
            relevant.add(e2.source)  // producer
            traceUp(e2.source)
          }
        }
      }
    }
  }

  // Step 4 — Trace DOWNSTREAM through warehouses:
  //          find big nodes that read each warehouse output, + their own outputs.
  //          Does NOT add consumer's datalake inputs.
  const downDone = new Set()
  function traceDown(bigId) {
    if (downDone.has(bigId)) return
    downDone.add(bigId)
    for (const e of allEdges) {
      if (e.source === bigId && !isBig(e.target)) {
        relevant.add(e.target) // warehouse output
        for (const e2 of allEdges) {
          if (e2.source === e.target && isBig(e2.target) && !relevant.has(e2.target)) {
            relevant.add(e2.target) // consumer
            traceDown(e2.target)
          }
        }
      }
    }
  }

  family.forEach(id => { traceUp(id); traceDown(id) })

  // Step 5 — Walk UP hierarchy from ALL big nodes (collection → component → feature)
  queue = [...relevant].filter(isBig)
  while (queue.length) {
    const cur = queue.pop()
    for (const e of allEdges)
      if (e.target === cur && isBig(e.source) && !relevant.has(e.source))
        { relevant.add(e.source); queue.push(e.source) }
  }

  return {
    nodes: allNodes.filter(n => relevant.has(n.id)),
    edges: allEdges.filter(e => relevant.has(e.source) && relevant.has(e.target)),
  }
}

// Types always collapsed in simplified view
const PIPELINE_TYPES = new Set(['ingest', 'datalake', 'compute', 'virtual', 'extract', 'collection', 'transformation'])
// Collapsed silently (not shown in the collapsed node label)
const STORAGE_TYPES  = new Set(['datalake'])

// ── Simplified subgraph: collapse the pipeline into one node ──────────────────
export function simplifySubgraph({ nodes, edges }) {
  const nodeIds = new Set(nodes.map(n => n.id))
  const validEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))

  // Datawarehouse nodes that have no downstream in this subgraph stay visible
  const hasDownstream = new Set(validEdges.map(e => e.source))
  const terminalDWH   = new Set(
    nodes.filter(n => n.type === 'datawarehouse' && !hasDownstream.has(n.id)).map(n => n.id)
  )

  const isPipeline = n => PIPELINE_TYPES.has(n.type) ||
    (n.type === 'datawarehouse' && !terminalDWH.has(n.id))

  const pipelineNodes = nodes.filter(isPipeline)
  const keptNodes     = nodes.filter(n => !isPipeline(n))

  if (!pipelineNodes.length) return { nodes, edges }

  const pipelineIds = new Set(pipelineNodes.map(n => n.id))
  const keptIds     = new Set(keptNodes.map(n => n.id))

  const visiblePipelineNodes = pipelineNodes.filter(n => !STORAGE_TYPES.has(n.type))

  const collapsedId   = '__collapsed_pipeline'
  const collapsedNode = {
    id:    collapsedId,
    type:  'collapsed',
    label: buildCollapsedLabel(visiblePipelineNodes),
    items: visiblePipelineNodes,
  }

  const syntheticEdges = []
  const seen = new Set()

  function addEdge(src, tgt) {
    const key = `${src}→${tgt}`
    if (!seen.has(key)) { seen.add(key); syntheticEdges.push({ source: src, target: tgt }) }
  }

  for (const e of validEdges) {
    const srcKept     = keptIds.has(e.source)
    const tgtKept     = keptIds.has(e.target)
    const srcPipeline = pipelineIds.has(e.source)
    const tgtPipeline = pipelineIds.has(e.target)

    if (srcKept     && tgtPipeline) addEdge(e.source,    collapsedId)
    if (srcPipeline && tgtKept)     addEdge(collapsedId, e.target)
    if (srcKept     && tgtKept)     addEdge(e.source,    e.target)
  }

  return { nodes: [...keptNodes, collapsedNode], edges: syntheticEdges }
}

// ── BFS: all downstream node ids from a source ───────────────────────────────
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
