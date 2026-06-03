// ── Diff two node sets by node id ─────────────────────────────────────────────
export function computeDiff(currentNodes, baseNodes) {
  const currentMap = new Map(currentNodes.map(n => [n.id, n]))
  const baseMap    = new Map(baseNodes.map(n => [n.id, n]))

  const statusMap = {}
  for (const n of currentNodes) {
    if (!baseMap.has(n.id)) {
      statusMap[n.id] = 'added'
    } else {
      const b = baseMap.get(n.id)
      statusMap[n.id] = (b.label !== n.label || b.type !== n.type || b.stage !== n.stage)
        ? 'changed'
        : 'unchanged'
    }
  }

  return {
    statusMap,
    added:   currentNodes.filter(n => statusMap[n.id] === 'added'),
    changed: currentNodes.filter(n => statusMap[n.id] === 'changed'),
    removed: baseNodes.filter(n => !currentMap.has(n.id)),
  }
}
