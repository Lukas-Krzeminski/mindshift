import { describe, expect, it } from 'vitest'
import {
  beginDrag,
  buildLevel,
  cellOf,
  cutsMade,
  dragTo,
  dragToward,
  emptyPaths,
  evaluate,
  neighbors,
  resolvePaths,
  solutionPaths,
  type Level,
  type Paths,
} from '../src/puzzle/model'
import { getLevel, PUZZLE_KEYS, REQUIRED_PUZZLE } from '../src/puzzle/levels'
import { solve } from '../src/puzzle/solver'

describe.each(PUZZLE_KEYS)('level %s', (key) => {
  const level = getLevel(key)

  it('reference solution is valid, solves the level and covers every gate', () => {
    const paths = solutionPaths(level)
    const ev = evaluate(level, paths)
    expect(ev.connected).toBe(level.colors)
    expect(ev.gatesLit).toBe(ev.gatesTotal)
    expect(ev.solved).toBe(true)
  })

  it('the solver independently finds a solution', () => {
    const res = solve(level, { limit: 1 })
    expect(res.count).toBe(1)
    expect(evaluate(level, res.example!).solved).toBe(true)
  })

  if (key !== 'tutorial') {
    it('has exactly one Full Coherence solution (every cell covered)', () => {
      expect(evaluate(level, solutionPaths(level)).fullCoverage).toBe(true)
      const res = solve(level, { requireFull: true, limit: 2 })
      expect(res.exhaustive).toBe(true)
      expect(res.count).toBe(1)
    })

    it('is not beaten by drawing each pair the short way, in any order', () => {
      expect(naiveRoutesEverWin(level)).toBe(false)
    })
  }
})

describe('the 4 / 6 / 8 progression', () => {
  it('grows in pairs and size, and only the required lattice decides', () => {
    expect([getLevel('puzzle1'), getLevel('puzzle2'), getLevel('puzzle3')].map((l) => [l.colors, l.size])).toEqual([
      [4, 6],
      [6, 7],
      [8, 8],
    ])
    expect(REQUIRED_PUZZLE).toBe('puzzle3')
  })
})

/** Tries every pair order, drawing each pair along its BFS-shortest route around what is already drawn. */
function naiveRoutesEverWin(level: Level): boolean {
  const order = level.ends.map((_, k) => k)
  const perms: number[][] = []
  const permute = (rest: number[], acc: number[]) => {
    if (!rest.length) perms.push(acc)
    rest.forEach((k, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, k]))
  }
  permute(order, [])
  for (const perm of perms) {
    const taken = new Uint8Array(level.cellCount)
    for (let i = 0; i < level.cellCount; i++) if (level.blocked[i] || level.endpoint[i] >= 0) taken[i] = 1
    let ok = true
    for (const k of perm) {
      const [a, b] = level.ends[k]
      const prev = new Int32Array(level.cellCount).fill(-1)
      const seen = new Uint8Array(level.cellCount)
      seen[a] = 1
      const queue = [a]
      while (queue.length) {
        const c = queue.shift()!
        for (const n of neighbors(level.size, c)) {
          if (seen[n] || (taken[n] && n !== b)) continue
          seen[n] = 1
          prev[n] = c
          queue.push(n)
        }
      }
      if (!seen[b]) {
        ok = false
        break
      }
      for (let c = b; c !== -1; c = prev[c]) taken[c] = 1
    }
    if (ok && Array.from(level.gate).every((g, i) => !g || taken[i])) return true
  }
  return false
}

describe('drag mechanics', () => {
  // 3x3: A at (0,0)-(0,2), B at (2,0)-(2,2); middle row free.
  const level = buildLevel({ id: 't', size: 3, timeLimit: null, solution: ['AaA', '...', 'BbB'] })
  const c = (r: number, col: number) => cellOf(3, r, col)
  const draw = (paths: Paths, cells: number[]) => {
    let d = beginDrag(level, paths, cells[0])!
    for (const cell of cells.slice(1)) d = dragTo(level, d, cell)
    return d
  }

  it('connects a pair and solves when all pairs connect', () => {
    let paths = emptyPaths(level)
    paths = resolvePaths(draw(paths, [c(0, 0), c(0, 1), c(0, 2)]))
    expect(evaluate(level, paths).connected).toBe(1)
    paths = resolvePaths(draw(paths, [c(2, 0), c(2, 1), c(2, 2)]))
    expect(evaluate(level, paths).solved).toBe(true)
    expect(evaluate(level, paths).fullCoverage).toBe(false)
  })

  it('cannot enter another color endpoint or extend past completion', () => {
    const d = draw(emptyPaths(level), [c(0, 0), c(1, 0), c(2, 0)])
    expect(d.path).toEqual([c(0, 0), c(1, 0)])
    const done = draw(emptyPaths(level), [c(0, 0), c(0, 1), c(0, 2), c(1, 2)])
    expect(done.path).toEqual([c(0, 0), c(0, 1), c(0, 2)])
  })

  it('retracts when dragging back over its own path', () => {
    const d = draw(emptyPaths(level), [c(0, 0), c(1, 0), c(1, 1), c(1, 0)])
    expect(d.path).toEqual([c(0, 0), c(1, 0)])
  })

  it('cuts another path, and restores it if the drag retracts', () => {
    // B detours through the middle row.
    let paths = resolvePaths(draw(emptyPaths(level), [c(2, 0), c(1, 0), c(1, 1), c(1, 2), c(2, 2)]))
    expect(beginDrag(level, paths, c(0, 1))).toBeNull() // empty cell: nothing to drag
    let d = draw(paths, [c(0, 0), c(0, 1), c(1, 1)]) // A dives into B's path at (1,1)
    const live = resolvePaths(d)
    expect(live[1]).toEqual([c(2, 0), c(1, 0)]) // B cut at (1,1)
    expect(cutsMade(d)).toBe(1)
    d = dragTo(level, d, c(0, 1)) // retract
    expect(resolvePaths(d)[1]).toEqual(paths[1]) // B restored
    expect(cutsMade(d)).toBe(0)
    paths = resolvePaths(d)
    expect(paths[0]).toEqual([c(0, 0), c(0, 1)])
  })

  it('restarting from an endpoint clears that path and counts as a reset', () => {
    const paths = resolvePaths(draw(emptyPaths(level), [c(0, 0), c(0, 1), c(0, 2)]))
    const d = beginDrag(level, paths, c(0, 2))!
    expect(d.path).toEqual([c(0, 2)])
    expect(resolvePaths(d)[0]).toEqual([c(0, 2)])
    expect(cutsMade(d)).toBe(1)
  })

  it('continues from the middle of an existing path', () => {
    const paths = resolvePaths(draw(emptyPaths(level), [c(0, 0), c(1, 0), c(1, 1)]))
    const d = beginDrag(level, paths, c(1, 0))!
    expect(d.color).toBe(0)
    expect(d.path).toEqual([c(0, 0), c(1, 0)])
  })

  it('dragToward fills skipped cells for fast mouse moves', () => {
    const d = dragToward(level, beginDrag(level, emptyPaths(level), c(0, 0))!, c(0, 2))
    expect(d.path).toEqual([c(0, 0), c(0, 1), c(0, 2)])
  })

  it('blocked cells stop a path', () => {
    const lv = buildLevel({ id: 'b', size: 3, timeLimit: null, solution: ['A#A', 'aaa', '...'] })
    const d = dragToward(lv, beginDrag(lv, emptyPaths(lv), cellOf(3, 0, 0))!, cellOf(3, 0, 2))
    expect(d.path).toEqual([cellOf(3, 0, 0)])
  })
})
