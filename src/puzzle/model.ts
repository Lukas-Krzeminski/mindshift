/**
 * Neural-lattice puzzle rules (Flow-style). Pure functions, fully unit-tested.
 *
 * - Square grid, 4-neighbour moves.
 * - Each color has two endpoints; a path always starts at one of them.
 * - Paths never overlap: dragging through another color's path cuts it at that cell.
 *   Cuts are computed against the paths as they were when the drag began, so
 *   retracting during the same drag restores the cut path (like Flow Free).
 * - Blocked cells are impassable; gate cells must be covered by some path to solve.
 */

export type RC = readonly [number, number]

export interface LevelDef {
  id: string
  size: number
  /**
   * Reference solution, one string per row: UPPERCASE = endpoint, lowercase = path cell
   * of that color, '#' = blocked, '.' = empty. Letters A..E map to colors 0..4.
   */
  solution: readonly string[]
  gates?: readonly RC[]
  /** Seconds; null = untimed (tutorial). */
  timeLimit: number | null
}

export interface Level {
  def: LevelDef
  size: number
  cellCount: number
  colors: number
  /** Endpoint color per cell, or -1. */
  endpoint: Int8Array
  blocked: Uint8Array
  gate: Uint8Array
  /** Endpoint cell indices per color. */
  ends: [number, number][]
  /** Free (non-blocked) cell count. */
  free: number
}

export type Paths = number[][]

export const cellOf = (size: number, r: number, c: number): number => r * size + c
export const rowOf = (size: number, i: number): number => Math.floor(i / size)
export const colOf = (size: number, i: number): number => i % size

export function adjacent(size: number, a: number, b: number): boolean {
  const dr = Math.abs(rowOf(size, a) - rowOf(size, b))
  const dc = Math.abs(colOf(size, a) - colOf(size, b))
  return dr + dc === 1
}

export function neighbors(size: number, i: number): number[] {
  const r = rowOf(size, i)
  const c = colOf(size, i)
  const out: number[] = []
  if (r > 0) out.push(i - size)
  if (r < size - 1) out.push(i + size)
  if (c > 0) out.push(i - 1)
  if (c < size - 1) out.push(i + 1)
  return out
}

export function buildLevel(def: LevelDef): Level {
  const size = def.size
  if (def.solution.length !== size || def.solution.some((row) => row.length !== size)) {
    throw new Error(`Level ${def.id}: solution must be ${size}x${size}`)
  }
  const cellCount = size * size
  const endpoint = new Int8Array(cellCount).fill(-1)
  const blocked = new Uint8Array(cellCount)
  const gate = new Uint8Array(cellCount)
  const endsByColor = new Map<number, number[]>()

  def.solution.forEach((row, r) => {
    for (let c = 0; c < size; c++) {
      const ch = row[c]
      const i = cellOf(size, r, c)
      if (ch === '#') blocked[i] = 1
      else if (ch >= 'A' && ch <= 'Z') {
        const color = ch.charCodeAt(0) - 65
        endpoint[i] = color
        endsByColor.set(color, [...(endsByColor.get(color) ?? []), i])
      }
    }
  })

  const colors = endsByColor.size
  const ends: [number, number][] = []
  for (let k = 0; k < colors; k++) {
    const e = endsByColor.get(k)
    if (!e || e.length !== 2) throw new Error(`Level ${def.id}: color ${k} needs exactly 2 endpoints`)
    ends.push([e[0], e[1]])
  }
  for (const [r, c] of def.gates ?? []) gate[cellOf(size, r, c)] = 1

  let free = 0
  for (let i = 0; i < cellCount; i++) if (!blocked[i]) free++
  return { def, size, cellCount, colors, endpoint, blocked, gate, ends, free }
}

export const emptyPaths = (level: Level): Paths => level.ends.map(() => [])

export function isComplete(level: Level, color: number, path: readonly number[]): boolean {
  if (path.length < 2) return false
  const [a, b] = level.ends[color]
  const s = path[0]
  const e = path[path.length - 1]
  return (s === a && e === b) || (s === b && e === a)
}

/** Color covering each cell (-1 = none). Endpoints count as covered by their own color. */
export function occupancy(level: Level, paths: Paths): Int8Array {
  const occ = new Int8Array(level.cellCount).fill(-1)
  for (let i = 0; i < level.cellCount; i++) if (level.endpoint[i] >= 0) occ[i] = level.endpoint[i]
  paths.forEach((p, k) => p.forEach((i) => (occ[i] = k)))
  return occ
}

// ---------------------------------------------------------------------------
// Dragging
// ---------------------------------------------------------------------------

export interface Drag {
  color: number
  /** Paths at the moment the drag began (dragged color removed). */
  snapshot: Paths
  path: number[]
  /** True if this drag started by restarting an already-drawn path. */
  restarted: boolean
}

/** Starts a drag at `cell`, or returns null if nothing draggable is there. */
export function beginDrag(level: Level, paths: Paths, cell: number): Drag | null {
  const withoutColor = (k: number) => paths.map((p, j) => (j === k ? [] : p.slice()))
  const ep = level.endpoint[cell]
  if (ep >= 0) {
    return { color: ep, snapshot: withoutColor(ep), path: [cell], restarted: paths[ep].length > 1 }
  }
  for (let k = 0; k < paths.length; k++) {
    const pos = paths[k].indexOf(cell)
    if (pos >= 0) return { color: k, snapshot: withoutColor(k), path: paths[k].slice(0, pos + 1), restarted: false }
  }
  return null
}

/** Moves the drag one cell (extend to an adjacent cell, or retract onto its own path). */
export function dragTo(level: Level, drag: Drag, cell: number): Drag {
  const { path } = drag
  const tail = path[path.length - 1]
  if (cell === tail) return drag
  const pos = path.indexOf(cell)
  if (pos >= 0) return { ...drag, path: path.slice(0, pos + 1) }
  if (!adjacent(level.size, tail, cell)) return drag
  if (level.blocked[cell]) return drag
  if (isComplete(level, drag.color, path)) return drag
  const ep = level.endpoint[cell]
  if (ep >= 0 && ep !== drag.color) return drag
  return { ...drag, path: [...path, cell] }
}

/**
 * Moves the drag toward any target cell, one adjacent step at a time
 * (handles fast mouse movement that skips cells). Stops at the first obstacle.
 */
export function dragToward(level: Level, drag: Drag, target: number): Drag {
  const size = level.size
  let d = drag
  if (d.path.includes(target)) return dragTo(level, d, target)
  for (let guard = 0; guard < size * 2; guard++) {
    const tail = d.path[d.path.length - 1]
    if (tail === target) break
    const dr = rowOf(size, target) - rowOf(size, tail)
    const dc = colOf(size, target) - colOf(size, tail)
    const stepRow = tail + Math.sign(dr) * size
    const stepCol = tail + Math.sign(dc)
    const order = Math.abs(dr) >= Math.abs(dc) ? [dr !== 0 ? stepRow : -1, dc !== 0 ? stepCol : -1] : [dc !== 0 ? stepCol : -1, dr !== 0 ? stepRow : -1]
    let moved = false
    for (const next of order) {
      if (next < 0) continue
      const nd = dragTo(level, d, next)
      if (nd !== d && nd.path.length > d.path.length) {
        d = nd
        moved = true
        break
      }
    }
    if (!moved) break
  }
  return d
}

/** Live paths during a drag: other colors are cut where the drag path crosses them. */
export function resolvePaths(drag: Drag): Paths {
  const taken = new Set(drag.path)
  return drag.snapshot.map((p, k) => {
    if (k === drag.color) return drag.path
    const cut = p.findIndex((c) => taken.has(c))
    return cut === -1 ? p : p.slice(0, cut)
  })
}

/** Number of other paths the finished drag shortened (+1 if it restarted a drawn path). */
export function cutsMade(drag: Drag): number {
  const resolved = resolvePaths(drag)
  let cuts = drag.restarted ? 1 : 0
  drag.snapshot.forEach((p, k) => {
    if (k !== drag.color && resolved[k].length < p.length) cuts++
  })
  return cuts
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface Evaluation {
  complete: boolean[]
  connected: number
  total: number
  gatesLit: number
  gatesTotal: number
  /** Free cells covered by a path or endpoint. */
  filled: number
  solved: boolean
  fullCoverage: boolean
}

export function evaluate(level: Level, paths: Paths): Evaluation {
  const complete = paths.map((p, k) => isComplete(level, k, p))
  const connected = complete.filter(Boolean).length
  const occ = occupancy(level, paths)
  let gatesLit = 0
  let gatesTotal = 0
  let filled = 0
  for (let i = 0; i < level.cellCount; i++) {
    if (level.blocked[i]) continue
    if (occ[i] >= 0) filled++
    if (level.gate[i]) {
      gatesTotal++
      if (occ[i] >= 0) gatesLit++
    }
  }
  const solved = connected === level.colors && gatesLit === gatesTotal
  return { complete, connected, total: level.colors, gatesLit, gatesTotal, filled, solved, fullCoverage: solved && filled === level.free }
}

/** Paths described by a level's reference solution (used by tests, the tutorial ghost and dev auto-solve). */
export function solutionPaths(level: Level): Paths {
  const { size } = level
  const colorAt = (i: number): number => {
    const ch = level.def.solution[rowOf(size, i)][colOf(size, i)]
    if (ch === '#' || ch === '.') return -1
    return ch.toUpperCase().charCodeAt(0) - 65
  }
  return level.ends.map(([a, b], k) => {
    const path = [a]
    const seen = new Set([a])
    let cur = a
    while (cur !== b) {
      const next = neighbors(size, cur).find((n) => !seen.has(n) && colorAt(n) === k)
      if (next === undefined) throw new Error(`Level ${level.def.id}: solution path for color ${k} is broken at ${cur}`)
      path.push(next)
      seen.add(next)
      cur = next
    }
    return path
  })
}
