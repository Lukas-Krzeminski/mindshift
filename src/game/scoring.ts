/**
 * Scoring rules (plan §2). Pure functions; the score never affects the branch.
 */

export interface ScoreEntry {
  /** Short label shown in the results breakdown, e.g. "Puzzle 1 · time bonus". */
  label: string
  points: number
}

export type ScoredPuzzle = 'puzzle1' | 'puzzle2'

export interface PuzzleStats {
  puzzle: ScoredPuzzle
  solved: boolean
  /** Whole seconds left on the timer when solved (0 on timeout). */
  secondsRemaining: number
  connectedPairs: number
  totalPairs: number
  /** Every free cell is covered by a path. */
  fullCoverage: boolean
  /** Number of times a path was cut by another path or cleared by the player. */
  cutsAndResets: number
  /** 5-HT2A gate cells lit (Puzzle 2 only). */
  gatesLit: number
}

export const POINTS = {
  solved: { puzzle1: 1000, puzzle2: 1500 } as Record<ScoredPuzzle, number>,
  perPairOnTimeout: 150,
  perSecondRemaining: 20,
  fullCoherence: 500,
  efficiency: 250,
  efficiencyMaxCuts: 2,
  perGate: 100,
  memoryShard: 200,
  breathCompleted: 300,
  monolithReached: 300,
} as const

const NAMES: Record<ScoredPuzzle, string> = { puzzle1: 'Puzzle 1', puzzle2: 'Puzzle 2' }

export function scorePuzzle(s: PuzzleStats): ScoreEntry[] {
  const name = NAMES[s.puzzle]
  const entries: ScoreEntry[] = []
  if (s.solved) {
    entries.push({ label: `${name} · signals connected`, points: POINTS.solved[s.puzzle] })
    const secs = Math.max(0, Math.floor(s.secondsRemaining))
    if (secs > 0) entries.push({ label: `${name} · time bonus`, points: secs * POINTS.perSecondRemaining })
    if (s.fullCoverage) entries.push({ label: `${name} · Full Coherence`, points: POINTS.fullCoherence })
    if (s.cutsAndResets <= POINTS.efficiencyMaxCuts) {
      entries.push({ label: `${name} · efficiency`, points: POINTS.efficiency })
    }
  } else if (s.connectedPairs > 0) {
    entries.push({ label: `${name} · partial connections`, points: s.connectedPairs * POINTS.perPairOnTimeout })
  }
  if (s.puzzle === 'puzzle2' && s.gatesLit > 0) {
    entries.push({ label: `${name} · 5-HT2A gates lit`, points: s.gatesLit * POINTS.perGate })
  }
  return entries
}

export type InsightEvent = 'memoryShard' | 'breathCompleted' | 'monolithReached'

export function scoreInsight(event: InsightEvent): ScoreEntry {
  switch (event) {
    case 'memoryShard':
      return { label: 'Insight · memory found', points: POINTS.memoryShard }
    case 'breathCompleted':
      return { label: 'Insight · breathed through it', points: POINTS.breathCompleted }
    case 'monolithReached':
      return { label: 'Insight · moved toward it', points: POINTS.monolithReached }
  }
}

export const totalOf = (entries: ScoreEntry[]): number => entries.reduce((sum, e) => sum + e.points, 0)

export const RANKS = [
  { min: 0, title: 'First Spark' },
  { min: 2000, title: 'Signal Seeker' },
  { min: 3500, title: 'Signal Weaver' },
  { min: 5000, title: 'Network Architect' },
  { min: 6000, title: 'Neural Cartographer' },
] as const

export function rankFor(total: number): string {
  let title: string = RANKS[0].title
  for (const r of RANKS) if (total >= r.min) title = r.title
  return title
}

/** Visual-only reward tier (extra aurora, bigger blossom...). Never affects the branch. */
export const RADIANT_THRESHOLD = 4500
export const isRadiant = (total: number): boolean => total >= RADIANT_THRESHOLD
