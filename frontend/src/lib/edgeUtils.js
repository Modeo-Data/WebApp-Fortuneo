// ── Edge routing — A* orthogonal, sequential spread ──────────────────────────

const PAD        = 8    // clearance around node boxes (px)
const BEND       = 80   // extra cost per 90° turn
const CORNER_H   = 10   // quadratic-bezier radius at corners
const PATH_CLEAR = 7    // clearance around previously-routed path tubes

// ── Obstacle model ────────────────────────────────────────────────────────────

// Pre-computed node data { id, x, y, w, h } — used by graphUtils sequential routing
export function makeNodeBoxes(nodeData, srcId, tgtId) {
  return nodeData
    .filter(n => n.id !== srcId && n.id !== tgtId)
    .map(n => ({
      l: n.x - PAD, r: n.x + n.w + PAD,
      t: n.y - PAD, b: n.y + n.h + PAD,
    }))
}

// Convert routed waypoints → thin obstacle tubes for subsequent edges
export function pathToBoxes(waypoints) {
  const boxes = []
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [x1, y1] = waypoints[i], [x2, y2] = waypoints[i + 1]
    boxes.push({
      l: Math.min(x1, x2) - PATH_CLEAR,
      r: Math.max(x1, x2) + PATH_CLEAR,
      t: Math.min(y1, y2) - PATH_CLEAR,
      b: Math.max(y1, y2) + PATH_CLEAR,
    })
  }
  return boxes
}

function hClear(boxes, x1, x2, y) {
  const lo = Math.min(x1, x2), hi = Math.max(x1, x2)
  return !boxes.some(b => b.l < hi && b.r > lo && b.t < y && b.b > y)
}

function vClear(boxes, x, y1, y2) {
  const lo = Math.min(y1, y2), hi = Math.max(y1, y2)
  return !boxes.some(b => b.l < x && b.r > x && b.t < hi && b.b > lo)
}

// ── Min-heap ──────────────────────────────────────────────────────────────────

class Heap {
  constructor() { this._d = [] }
  get size() { return this._d.length }
  push(v) {
    this._d.push(v); let i = this._d.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this._d[p][0] <= this._d[i][0]) break
      ;[this._d[p], this._d[i]] = [this._d[i], this._d[p]]; i = p
    }
  }
  pop() {
    const top = this._d[0], last = this._d.pop()
    if (this._d.length) {
      this._d[0] = last; let i = 0
      for (;;) {
        let s = i, l = 2*i+1, r = 2*i+2
        if (l < this._d.length && this._d[l][0] < this._d[s][0]) s = l
        if (r < this._d.length && this._d[r][0] < this._d[s][0]) s = r
        if (s === i) break
        ;[this._d[s], this._d[i]] = [this._d[i], this._d[s]]; i = s
      }
    }
    return top
  }
}

// ── Path rendering ────────────────────────────────────────────────────────────

function simplify(pts) {
  if (pts.length <= 2) return pts
  const out = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = out[out.length - 1], [bx, by] = pts[i], [cx, cy] = pts[i + 1]
    if (Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) > 0.1) out.push(pts[i])
  }
  out.push(pts[pts.length - 1])
  return out
}

export function buildPath(pts) {
  if (pts.length < 2) return ''
  const c = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = c[c.length - 1]
    if (Math.abs(pts[i][0] - px) > 0.1 || Math.abs(pts[i][1] - py) > 0.1) c.push(pts[i])
  }
  if (c.length < 2) return `M ${c[0][0]} ${c[0][1]}`
  let d = `M ${c[0][0]} ${c[0][1]}`
  for (let i = 1; i < c.length - 1; i++) {
    const [ax, ay] = c[i - 1], [bx, by] = c[i], [cx, cy] = c[i + 1]
    const d1 = Math.hypot(bx - ax, by - ay), d2 = Math.hypot(cx - bx, cy - by)
    if (d1 < 0.1 || d2 < 0.1) { d += ` L ${bx} ${by}`; continue }
    const r = Math.min(CORNER_H, d1 / 2, d2 / 2)
    if (r < 0.1) { d += ` L ${bx} ${by}`; continue }
    const t1 = r / d1, t2 = r / d2
    d += ` L ${bx - (bx - ax) * t1} ${by - (by - ay) * t1}`
    d += ` Q ${bx} ${by} ${bx + (cx - bx) * t2} ${by + (cy - by) * t2}`
  }
  const [lx, ly] = c[c.length - 1]
  return d + ` L ${lx} ${ly}`
}

// ── A* orthogonal router — horizontal exit + horizontal entry enforced ────────
//
// dir: 0 = H (last move was horizontal)
//      1 = V (last move was vertical)
//
// Seeded with only the horizontal neighbours of source → first step is always H.
// Accepted at target only with cd===0 → last step is always H.
//
export function findWaypoints(sx, sy, tx, ty, boxes) {
  const xSet = new Set([sx, tx])
  const ySet = new Set([sy, ty])
  boxes.forEach(b => { xSet.add(b.l); xSet.add(b.r); ySet.add(b.t); ySet.add(b.b) })

  if (boxes.length) {
    ySet.add(Math.min(...boxes.map(b => b.t)) - 40)
    ySet.add(Math.max(...boxes.map(b => b.b)) + 40)
    if (tx < sx) xSet.add(Math.min(...boxes.map(b => b.l)) - 40)
  }

  const xs0 = [...xSet].sort((a, b) => a - b)
  const ys0 = [...ySet].sort((a, b) => a - b)
  for (let i = 0; i < xs0.length - 1; i++) xSet.add((xs0[i] + xs0[i + 1]) / 2)
  for (let i = 0; i < ys0.length - 1; i++) ySet.add((ys0[i] + ys0[i + 1]) / 2)

  const XS = [...xSet].sort((a, b) => a - b)
  const YS = [...ySet].sort((a, b) => a - b)
  const W = XS.length, H = YS.length

  const xi = new Map(XS.map((x, i) => [x, i]))
  const yi = new Map(YS.map((y, i) => [y, i]))

  const si = xi.get(sx), sj = yi.get(sy)
  const ti = xi.get(tx), tj = yi.get(ty)

  // 2 directions: 0=H, 1=V
  const key  = (i, j, d) => (i * H + j) * 2 + d
  const heur = (i, j)    => Math.abs(XS[i] - XS[ti]) + Math.abs(YS[j] - YS[tj])
  const N    = W * H * 2

  const dist = new Float64Array(N).fill(Infinity)
  const from = new Int32Array(N).fill(-1)

  // Seed only horizontal neighbours of source → forces horizontal exit
  const heap = new Heap()
  for (const di of [-1, 1]) {
    const ni = si + di
    if (ni < 0 || ni >= W) continue
    if (!hClear(boxes, XS[Math.min(si, ni)], XS[Math.max(si, ni)], YS[sj])) continue
    const nc = Math.abs(XS[ni] - XS[si])
    const nk = key(ni, sj, 0)
    if (nc < dist[nk]) { dist[nk] = nc; heap.push([nc + heur(ni, sj), nc, ni, sj, 0]) }
  }

  let bestK = -1

  while (heap.size > 0) {
    const [, g, ci, cj, cd] = heap.pop()
    const ck = key(ci, cj, cd)
    if (dist[ck] < g) continue
    // Accept target only from horizontal (cd===0) → forces horizontal entry
    if (ci === ti && cj === tj && cd === 0) { bestK = ck; break }

    // Horizontal moves
    for (const di of [-1, 1]) {
      const ni = ci + di
      if (ni < 0 || ni >= W) continue
      if (!hClear(boxes, XS[Math.min(ci, ni)], XS[Math.max(ci, ni)], YS[cj])) continue
      const nc = g + Math.abs(XS[ni] - XS[ci]) + (cd === 1 ? BEND : 0)
      const nk = key(ni, cj, 0)
      if (nc < dist[nk]) { dist[nk] = nc; from[nk] = ck; heap.push([nc + heur(ni, cj), nc, ni, cj, 0]) }
    }
    // Vertical moves
    for (const dj of [-1, 1]) {
      const nj = cj + dj
      if (nj < 0 || nj >= H) continue
      if (!vClear(boxes, XS[ci], YS[Math.min(cj, nj)], YS[Math.max(cj, nj)])) continue
      const nc = g + Math.abs(YS[nj] - YS[cj]) + (cd === 0 ? BEND : 0)
      const nk = key(ci, nj, 1)
      if (nc < dist[nk]) { dist[nk] = nc; from[nk] = ck; heap.push([nc + heur(ci, nj), nc, ci, nj, 1]) }
    }
  }

  if (bestK === -1) {
    // Fallback: simple H-V-H 3-segment route
    const mx = (sx + tx) / 2
    return [[sx, sy], [mx, sy], [mx, ty], [tx, ty]]
  }

  const raw = []
  let cur = bestK
  while (cur !== -1) {
    const ij = Math.floor(cur / 2)
    raw.unshift([XS[Math.floor(ij / H)], YS[ij % H]])
    cur = from[cur]
  }
  raw.unshift([sx, sy])  // prepend actual source position (not in from-chain)
  return simplify(raw)
}

// Route and return path string + waypoints (waypoints used for obstacle accumulation)
export function routeEdgeWithWaypoints(sx, sy, tx, ty, boxes) {
  const waypoints = findWaypoints(sx, sy, tx, ty, boxes)
  return { path: buildPath(waypoints), waypoints }
}

// ── Staircase + A* hybrid ─────────────────────────────────────────────────────
//
// Forces a horizontal exit segment of `exitLen` px from source, then runs A*
// from the turn point to the target — avoiding actual rendered node obstacles.
// `nodes` is the live React Flow node list (from useNodes()).
//
function makeBoxes(nodes, srcId, tgtId) {
  return nodes
    .filter(n => n.id !== srcId && n.id !== tgtId && n.measured?.width)
    .map(n => ({
      l: n.position.x - PAD,
      r: n.position.x + n.measured.width  + PAD,
      t: n.position.y - PAD,
      b: n.position.y + n.measured.height + PAD,
    }))
}

export function routeEdgeStaircase(sx, sy, tx, ty, nodes, srcId, tgtId, exitLen, entryLen) {
  const boxes  = makeBoxes(nodes, srcId, tgtId)
  const third  = (tx - sx) / 3
  // Clamp so exit and entry never overlap in the middle third
  const xTurn  = Math.min(sx + exitLen, sx + third)
  const xEntry = Math.max(tx - entryLen, tx - third)
  const tail   = findWaypoints(xTurn, sy, xEntry, ty, boxes)
  // tail: [xTurn,sy] → … → [xEntry,ty]; wrap with forced exit + forced entry
  return buildPath([[sx, sy], ...tail, [tx, ty]])
}
