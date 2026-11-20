/**
 * Offline generator for the neural-lattice puzzles (not shipped).
 *
 *   npx rolldown scripts/gen-levels.ts --file <out>.mjs --platform node && node <out>.mjs <size> <pairs> <blocked> <gates> <tries> [seed]
 *
 * Each candidate:
 *  1. covers the grid with `pairs` random winding paths (+ blocked cells),
 *  2. must have exactly ONE full-coverage solution (exhaustive solver check), so the
 *     intended "Full Coherence" route is clean and fair,
 *  3. gets 5-HT2A gates on cells that force detours,
 *  4. is rejected if a naive player (draw each pair's shortest route in any order) ever wins.
 * Survivors are ranked by how much the paths must wind and how much the pairs interfere.
 */
import { buildLevel, neighbors, type LevelDef } from '../src/puzzle/model'
import { solve } from '../src/puzzle/solver'

const [size, pairs, blockedCount, gateCount, tries, seedArg] = process.argv.slice(2).map(Number)
let seed = seedArg || 12345

function rand(): number {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = <T,>(a: T[]): T => a[Math.floor(rand() * a.length)]
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const N = size * size
const nb = Array.from({ length: N }, (_, i) => neighbors(size, i))
const rc = (i: number) => [Math.floor(i / size), i % size] as const
const manhattan = (a: number, b: number) => {
  const [ar, ac] = rc(a)
  const [br, bc] = rc(b)
  return Math.abs(ar - br) + Math.abs(ac - bc)
}

/** Random cover of all free cells by `pairs` paths of length >= 3. */
function cover(blocked: Uint8Array): number[][] | null {
  const owner = new Int16Array(N).fill(-1)
  const free = () => {
    const out: number[] = []
    for (let i = 0; i < N; i++) if (!blocked[i] && owner[i] < 0) out.push(i)
    return out
  }
  const emptyDeg = (i: number) => nb[i].filter((n) => !blocked[n] && owner[n] < 0).length
  const paths: number[][] = []
  const freeTotal = free().length
  const avg = freeTotal / pairs
  for (let guard = 0; guard < 200; guard++) {
    const f = free()
    if (!f.length) break
    const minDeg = Math.min(...f.map(emptyDeg))
    const start = pick(f.filter((i) => emptyDeg(i) === minDeg))
    const id = paths.length
    const path = [start]
    owner[start] = id
    const target = Math.max(3, Math.round(avg * (0.6 + rand() * 0.9)))
    while (path.length < target) {
      const tail = path[path.length - 1]
      let cand = nb[tail].filter((n) => !blocked[n] && owner[n] < 0)
      // never touch our own path except through the tail (keeps routes clean, helps uniqueness)
      cand = cand.filter((n) => nb[n].every((m) => m === tail || owner[m] !== id))
      if (!cand.length) break
      cand.sort((a, b) => emptyDeg(a) - emptyDeg(b) + (rand() - 0.5) * 1.2)
      const next = cand[0]
      owner[next] = id
      path.push(next)
    }
    paths.push(path)
  }
  if (free().length) return null
  // absorb short fragments into a neighbouring path end
  for (let changed = true; changed; ) {
    changed = false
    for (let p = 0; p < paths.length; p++) {
      const s = paths[p]
      if (s.length >= 3) continue
      for (let q = 0; q < paths.length && !changed; q++) {
        if (q === p) continue
        const t = paths[q]
        for (const seq of [s, s.slice().reverse()]) {
          if (nb[t[t.length - 1]].includes(seq[0])) {
            t.push(...seq)
            changed = true
            break
          }
          if (nb[t[0]].includes(seq[seq.length - 1])) {
            t.unshift(...seq)
            changed = true
            break
          }
        }
      }
      if (changed) {
        paths.splice(p, 1)
        break
      }
    }
  }
  if (paths.some((p) => p.length < 3)) return null
  // merge paths whose ends touch until we have the requested pair count
  while (paths.length > pairs) {
    const opts: [number, number, boolean, boolean][] = []
    for (let p = 0; p < paths.length; p++)
      for (let q = p + 1; q < paths.length; q++)
        for (const pe of [false, true])
          for (const qe of [false, true]) {
            const a = pe ? paths[p][paths[p].length - 1] : paths[p][0]
            const b = qe ? paths[q][paths[q].length - 1] : paths[q][0]
            if (nb[a].includes(b)) opts.push([p, q, pe, qe])
          }
    if (!opts.length) return null
    const [p, q, pe, qe] = pick(opts)
    const A = pe ? paths[p] : paths[p].slice().reverse()
    const B = qe ? paths[q].slice().reverse() : paths[q]
    const merged = [...A, ...B]
    paths.splice(q, 1)
    paths.splice(p, 1, merged)
  }
  while (paths.length < pairs) {
    paths.sort((a, b) => b.length - a.length)
    const longest = paths[0]
    if (longest.length < 6) return null
    const cut = 3 + Math.floor(rand() * (longest.length - 5))
    paths.splice(0, 1, longest.slice(0, cut), longest.slice(cut))
  }
  return paths
}

function toDef(paths: number[][], blocked: Uint8Array, gates: number[], id: string, timeLimit: number): LevelDef {
  const rows = Array.from({ length: size }, () => Array(size).fill('.'))
  for (let i = 0; i < N; i++) if (blocked[i]) rows[rc(i)[0]][rc(i)[1]] = '#'
  paths.forEach((p, k) =>
    p.forEach((cell, j) => {
      const ch = String.fromCharCode(65 + k)
      rows[rc(cell)[0]][rc(cell)[1]] = j === 0 || j === p.length - 1 ? ch : ch.toLowerCase()
    }),
  )
  return { id, size, timeLimit, solution: rows.map((r) => r.join('')), gates: gates.map((g) => [rc(g)[0], rc(g)[1]] as [number, number]) }
}

/** BFS shortest path through free cells with random tie-breaking. */
function shortest(a: number, b: number, taken: Uint8Array): number[] | null {
  const prev = new Int32Array(N).fill(-1)
  const seen = new Uint8Array(N)
  seen[a] = 1
  const queue = [a]
  while (queue.length) {
    const c = queue.shift()!
    if (c === b) break
    for (const n of shuffle(nb[c].slice())) {
      if (seen[n] || (taken[n] && n !== b)) continue
      seen[n] = 1
      prev[n] = c
      queue.push(n)
    }
  }
  if (!seen[b]) return null
  const out = [b]
  while (out[out.length - 1] !== a) out.push(prev[out[out.length - 1]])
  return out.reverse()
}

/** Fraction of naive attempts (shortest routes, random order) that solve the level. */
function naiveWinRate(paths: number[][], blocked: Uint8Array, gates: number[], trials: number): number {
  let wins = 0
  for (let t = 0; t < trials; t++) {
    const taken = new Uint8Array(N)
    for (let i = 0; i < N; i++) if (blocked[i]) taken[i] = 1
    paths.forEach((p) => {
      taken[p[0]] = 1
      taken[p[p.length - 1]] = 1
    })
    let ok = true
    for (const k of shuffle(paths.map((_, k) => k))) {
      const p = paths[k]
      const route = shortest(p[0], p[p.length - 1], taken)
      if (!route) {
        ok = false
        break
      }
      route.forEach((c) => (taken[c] = 1))
    }
    if (ok && gates.every((g) => taken[g])) wins++
  }
  return wins / trials
}

/** Exhaustive: does ANY order of drawing each pair along its (fixed tie-break) shortest route win? */
function naiveEverWins(paths: number[][], blocked: Uint8Array, gates: number[]): boolean {
  const taken = new Uint8Array(N)
  for (let i = 0; i < N; i++) if (blocked[i]) taken[i] = 1
  paths.forEach((p) => {
    taken[p[0]] = 1
    taken[p[p.length - 1]] = 1
  })
  const route = (a: number, b: number): number[] | null => {
    const prev = new Int32Array(N).fill(-1)
    const seen = new Uint8Array(N)
    seen[a] = 1
    const q = [a]
    while (q.length) {
      const c = q.shift()!
      for (const n of nb[c]) {
        if (seen[n] || (taken[n] && n !== b)) continue
        seen[n] = 1
        prev[n] = c
        q.push(n)
      }
    }
    if (!seen[b]) return null
    const out: number[] = []
    for (let c = prev[b]; c !== a; c = prev[c]) out.push(c)
    return out
  }
  // drawn from either twin (BFS tie-breaks differ by direction); budgeted, over budget counts as "wins"
  const left = new Set(paths.map((_, k) => k))
  let budget = 400_000
  const dfs = (): boolean => {
    if (--budget < 0) return true
    if (!left.size) return gates.every((g) => taken[g])
    for (const k of [...left]) {
      const p = paths[k]
      for (const [a, b] of [[p[0], p[p.length - 1]], [p[p.length - 1], p[0]]]) {
        const r = route(a, b)
        if (!r) continue
        r.forEach((c) => (taken[c] = 1))
        left.delete(k)
        const won = dfs()
        left.add(k)
        r.forEach((c) => (taken[c] = 0))
        if (won) return true
      }
    }
    return false
  }
  return dfs()
}

function bfsDist(from: number, blocked: Uint8Array): Int32Array {
  const d = new Int32Array(N).fill(1e6)
  d[from] = 0
  const q = [from]
  while (q.length) {
    const c = q.shift()!
    for (const n of nb[c]) if (!blocked[n] && d[n] > d[c] + 1) {
      d[n] = d[c] + 1
      q.push(n)
    }
  }
  return d
}

const results: { score: number; def: LevelDef; info: string }[] = []
const t0 = Date.now()
for (let attempt = 0; attempt < tries; attempt++) {
  const blocked = new Uint8Array(N)
  const interior = Array.from({ length: N }, (_, i) => i).filter((i) => {
    const [r, c] = rc(i)
    return r > 0 && c > 0 && r < size - 1 && c < size - 1
  })
  for (const b of shuffle(interior).slice(0, blockedCount)) blocked[b] = 1
  const paths = cover(blocked)
  if (!paths) continue
  // twins sitting next to each other make a trivial pair
  if (paths.some((p) => manhattan(p[0], p[p.length - 1]) < 3)) continue
  // a route must never brush against itself (no 2x2 blobs of one color; keeps the solution readable)
  const selfTouch = paths.some((p) => {
    const at = new Map(p.map((c, j) => [c, j]))
    return p.some((c, j) => nb[c].some((n) => at.has(n) && Math.abs(at.get(n)! - j) > 1))
  })
  if (selfTouch) continue
  const def = toDef(paths, blocked, [], 'gen', 0)
  const level = buildLevel(def)
  const uniq = solve(level, { requireFull: true, limit: 2, nodeLimit: 1_500_000 })
  if (!uniq.exhaustive || uniq.count !== 1) continue

  // gates: interior path cells that force the biggest detours, spread apart
  const dists = paths.map((p) => [bfsDist(p[0], blocked), bfsDist(p[p.length - 1], blocked)])
  const cands: { cell: number; detour: number; k: number }[] = []
  paths.forEach((p, k) => {
    const direct = dists[k][0][p[p.length - 1]]
    p.slice(1, -1).forEach((cell) => cands.push({ cell, k, detour: dists[k][0][cell] + dists[k][1][cell] - direct + rand() * 0.8 }))
  })
  cands.sort((a, b) => b.detour - a.detour)
  const gates: number[] = []
  const gatedPaths = new Set<number>()
  for (const c of cands) {
    if (gates.length >= gateCount) break
    if (!gatedPaths.has(c.k) && gates.every((g) => manhattan(g, c.cell) >= 3)) {
      gates.push(c.cell)
      gatedPaths.add(c.k)
    }
  }
  if (gates.length < gateCount) continue

  const naive = naiveWinRate(paths, blocked, gates, 300)
  if (naive > 0 || naiveEverWins(paths, blocked, gates)) continue
  // pairs must get in each other's way even before the gates are considered
  const naiveNoGates = naiveWinRate(paths, blocked, [], 300)
  if (naiveNoGates > 0.35) continue
  const winding = paths.reduce((s, p) => s + Math.min(3, (p.length - 1) / manhattan(p[0], p[p.length - 1])), 0) / paths.length
  const longest = Math.max(...paths.map((p) => p.length))
  const shortestLen = Math.min(...paths.map((p) => p.length))
  const score = (1 - naiveNoGates) * 3 + winding - (shortestLen <= 3 ? 0.5 : 0) - (longest > (N / pairs) * 2.2 ? 0.5 : 0)
  results.push({
    score,
    def: toDef(paths, blocked, gates, 'gen', 0),
    info: `winding=${winding.toFixed(2)} naiveNoGates=${naiveNoGates.toFixed(2)} lens=${paths.map((p) => p.length).join(',')}`,
  })
}
results.sort((a, b) => b.score - a.score)
console.log(`tries=${tries} unique+hard=${results.length} in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
for (const r of results.slice(0, 4)) {
  console.log(`\nscore=${r.score.toFixed(2)} ${r.info}`)
  console.log(JSON.stringify({ solution: r.def.solution, gates: r.def.gates }))
}
