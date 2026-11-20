import { describe, expect, it } from 'vitest'
import { buildMaze } from '../src/scenes/maze/mazeLayout'

const maze = buildMaze()
const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
const k = (p: [number, number]) => p.join(',')
const insideGrid = ([c, r]: [number, number]) => c >= 0 && r >= 0 && c < maze.cols && r < maze.rows
const openNeighbours = (p: [number, number]) =>
  DIRS.map(([dc, dr]) => [p[0] + dc, p[1] + dr] as [number, number]).filter((n) => insideGrid(n) && maze.open(p, n))

describe('labyrinth (challenging world)', () => {
  it('every walkable cell is reachable from the start, and nothing else is', () => {
    const seen = new Set<string>([k(maze.start)])
    const queue: [number, number][] = [maze.start]
    while (queue.length) {
      const p = queue.shift()!
      for (const n of openNeighbours(p)) {
        if (seen.has(k(n))) continue
        seen.add(k(n))
        queue.push(n)
      }
    }
    expect([...seen].sort()).toEqual(maze.cells.map(k).sort())
  })

  it('has one long winding route from the start to an exit in the far row (~1.5-2 min of walking)', () => {
    expect(maze.solution[0]).toEqual(maze.start)
    expect(maze.solution[maze.solution.length - 1]).toEqual(maze.exit)
    expect(maze.exit[1]).toBe(maze.rows - 1)
    for (let i = 1; i < maze.solution.length; i++) expect(maze.open(maze.solution[i - 1], maze.solution[i])).toBe(true)
    expect(maze.solution.length).toBeGreaterThanOrEqual(50)
    expect(maze.solution.length).toBeLessThanOrEqual(62)
  })

  it('has exactly six short, straight dead ends spread along the route, and no other branches', () => {
    const onRoute = new Set(maze.solution.map(k))
    expect(maze.spurs.length).toBe(6)
    const branchAt: number[] = []
    for (const spur of maze.spurs) {
      expect(spur.length).toBeGreaterThanOrEqual(1)
      expect(spur.length).toBeLessThanOrEqual(2)
      // it hangs off exactly one route cell, runs straight, and stops (one way in)
      const from = openNeighbours(spur[0]).filter((n) => onRoute.has(k(n)))
      expect(from.length).toBe(1)
      branchAt.push(maze.solution.findIndex((p) => k(p) === k(from[0])))
      if (spur.length === 2) {
        expect(spur[1][0] - spur[0][0]).toBe(spur[0][0] - from[0][0])
        expect(spur[1][1] - spur[0][1]).toBe(spur[0][1] - from[0][1])
      }
      expect(openNeighbours(spur[spur.length - 1]).length).toBe(1)
    }
    // spread out: every sixth of the route gets one
    branchAt.sort((a, b) => a - b)
    for (let i = 1; i < branchAt.length; i++) expect(branchAt[i] - branchAt[i - 1]).toBeGreaterThanOrEqual(3)
    // the route itself never forks except into those dead ends
    const spurStarts = new Set(maze.spurs.map((s) => k(s[0])))
    maze.solution.forEach((p, i) => {
      const others = openNeighbours(p).filter((n) => !spurStarts.has(k(n)))
      expect(others.length).toBe(i === 0 || i === maze.solution.length - 1 ? 1 : 2)
    })
  })

  it('never covers the doorway to the light with a dead-end panel', () => {
    expect(maze.deadEnds.some((d) => d.c === maze.exit[0] && d.r === maze.exit[1])).toBe(false)
    expect(maze.deadEnds.length).toBe(6)
  })

  it('is closed all around except for the exit', () => {
    const [ex] = maze.center(...maze.exit)
    const front = maze.walls.filter((w) => w.alongX && Math.abs(w.z - maze.exitZ) < 1e-6)
    expect(front.length).toBe(maze.cols - 1)
    expect(front.some((w) => Math.abs(w.x - ex) < 1e-6)).toBe(false)
    const back = maze.walls.filter((w) => w.alongX && Math.abs(w.z - maze.cell / 2) < 1e-6)
    expect(back.length).toBe(maze.cols)
  })

  it('places faces on walls, facing into the corridors', () => {
    expect(maze.faces.length).toBeGreaterThanOrEqual(8)
    const halfW = (maze.cols * maze.cell) / 2
    for (const f of maze.faces) {
      expect(Math.hypot(f.nx, f.nz)).toBeCloseTo(1)
      expect(Math.abs(f.x)).toBeLessThan(halfW)
      expect(f.z).toBeLessThan(maze.cell / 2)
      expect(f.z).toBeGreaterThan(maze.exitZ)
    }
  })
})
