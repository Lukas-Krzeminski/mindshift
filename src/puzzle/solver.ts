/**
 * Backtracking solver used by the test suite to prove each lattice is fair:
 * solvable, and (optionally) fully coverable. Not used at runtime.
 */
import { neighbors, type Level, type Paths } from './model'

export interface SolveOptions {
  /** Require every free cell to be covered (Flow-style "perfect" solution). */
  requireFull?: boolean
  /** Stop after this many solutions. */
  limit?: number
  /** Safety valve for search size. */
  nodeLimit?: number
}

export interface SolveResult {
  count: number
  /** True if the search finished without hitting nodeLimit. */
  exhaustive: boolean
  example: Paths | null
}

export function solve(level: Level, opts: SolveOptions = {}): SolveResult {
  const requireFull = opts.requireFull ?? false
  const limit = opts.limit ?? 1
  const nodeLimit = opts.nodeLimit ?? 3_000_000
  const { size, cellCount } = level
  const EMPTY = -1
  const BLOCK = -2
  const grid = new Int8Array(cellCount)
  for (let i = 0; i < cellCount; i++) grid[i] = level.blocked[i] ? BLOCK : level.endpoint[i] >= 0 ? level.endpoint[i] : EMPTY
  const nbrs = Array.from({ length: cellCount }, (_, i) => neighbors(size, i))
  const manhattan = (a: number, b: number) => Math.abs(Math.floor(a / size) - Math.floor(b / size)) + Math.abs((a % size) - (b % size))
  const order = level.ends.map((_, k) => k).sort((x, y) => manhattan(...level.ends[x]) - manhattan(...level.ends[y]))
  const paths: Paths = level.ends.map(() => [])
  const comp = new Int16Array(cellCount)

  let count = 0
  let nodes = 0
  let aborted = false
  let example: Paths | null = null

  /** Labels connected components of empty cells. */
  function label(): void {
    comp.fill(-1)
    let id = 0
    const stack: number[] = []
    for (let s = 0; s < cellCount; s++) {
      if (grid[s] !== EMPTY || comp[s] !== -1) continue
      comp[s] = id
      stack.push(s)
      while (stack.length) {
        const c = stack.pop()!
        for (const n of nbrs[c]) if (grid[n] === EMPTY && comp[n] === -1) {
          comp[n] = id
          stack.push(n)
        }
      }
      id++
    }
  }

  /** Can cells x and y still be joined through empty space? */
  function reachable(x: number, y: number): boolean {
    if (nbrs[x].includes(y)) return true
    for (const a of nbrs[x]) {
      if (grid[a] !== EMPTY) continue
      for (const b of nbrs[y]) if (grid[b] === EMPTY && comp[a] === comp[b]) return true
    }
    return false
  }

  function feasible(oi: number, head: number, target: number): boolean {
    label()
    if (!reachable(head, target)) return false
    for (let j = oi + 1; j < order.length; j++) {
      const [a, b] = level.ends[order[j]]
      if (!reachable(a, b)) return false
    }
    if (requireFull) {
      // Every empty region must touch an open end that could fill it.
      const touched = new Set<number>()
      const mark = (cell: number) => nbrs[cell].forEach((n) => grid[n] === EMPTY && touched.add(comp[n]))
      mark(head)
      for (let j = oi + 1; j < order.length; j++) level.ends[order[j]].forEach(mark)
      for (let i = 0; i < cellCount; i++) if (grid[i] === EMPTY && !touched.has(comp[i])) return false
    }
    return true
  }

  function routeColor(oi: number): void {
    if (aborted || count >= limit) return
    if (oi === order.length) {
      if (requireFull) for (let i = 0; i < cellCount; i++) if (grid[i] === EMPTY) return
      for (let i = 0; i < cellCount; i++) if (level.gate[i] && grid[i] < 0) return
      count++
      if (!example) example = paths.map((p) => p.slice())
      return
    }
    const k = order[oi]
    const [a, b] = level.ends[k]
    paths[k] = [a]
    extend(oi, k, a, b)
    paths[k] = []
  }

  function extend(oi: number, k: number, head: number, target: number): void {
    if (aborted || count >= limit) return
    if (++nodes > nodeLimit) {
      aborted = true
      return
    }
    for (const n of nbrs[head]) {
      if (n === target) {
        paths[k].push(n)
        routeColor(oi + 1)
        paths[k].pop()
      } else if (grid[n] === EMPTY) {
        grid[n] = k
        paths[k].push(n)
        if (feasible(oi, n, target)) extend(oi, k, n, target)
        paths[k].pop()
        grid[n] = EMPTY
      }
      if (aborted || count >= limit) return
    }
  }

  routeColor(0)
  return { count, exhaustive: !aborted, example }
}
