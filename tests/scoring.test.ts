import { describe, expect, it } from 'vitest'
import { POINTS, isRadiant, rankFor, scoreInsight, scorePuzzle, totalOf, type PuzzleStats } from '../src/game/scoring'

const base: PuzzleStats = {
  puzzle: 'puzzle1',
  solved: true,
  secondsRemaining: 0,
  connectedPairs: 4,
  totalPairs: 4,
  fullCoverage: false,
  cutsAndResets: 5,
  gatesLit: 0,
}

describe('scorePuzzle', () => {
  it('awards the base for solving', () => {
    expect(totalOf(scorePuzzle(base))).toBe(800)
    expect(totalOf(scorePuzzle({ ...base, puzzle: 'puzzle2' }))).toBe(1200)
    expect(totalOf(scorePuzzle({ ...base, puzzle: 'puzzle3' }))).toBe(1800)
  })

  it('adds time, Full Coherence and efficiency bonuses', () => {
    const entries = scorePuzzle({ ...base, secondsRemaining: 20.9, fullCoverage: true, cutsAndResets: 2 })
    expect(totalOf(entries)).toBe(800 + 20 * POINTS.perSecondRemaining + POINTS.fullCoherence + POINTS.efficiency)
  })

  it('gives partial points on timeout and no solve bonuses', () => {
    const entries = scorePuzzle({ ...base, solved: false, connectedPairs: 2, fullCoverage: true, cutsAndResets: 0 })
    expect(totalOf(entries)).toBe(2 * POINTS.perPairOnTimeout)
  })

  it('scores every lit gate, even on timeout', () => {
    expect(totalOf(scorePuzzle({ ...base, puzzle: 'puzzle3', gatesLit: 3 }))).toBe(1800 + 3 * POINTS.perGate)
    expect(totalOf(scorePuzzle({ ...base, solved: false, connectedPairs: 0, gatesLit: 1 }))).toBe(POINTS.perGate)
  })
})

describe('insight and ranks', () => {
  it('both worlds can earn the same maximum insight (600)', () => {
    const positive = totalOf([scoreInsight('memoryShard'), scoreInsight('memoryShard'), scoreInsight('memoryShard')])
    const challenging = totalOf([scoreInsight('breathCompleted'), scoreInsight('monolithReached')])
    expect(positive).toBe(600)
    expect(challenging).toBe(600)
  })

  it('ranks increase with score', () => {
    expect(rankFor(0)).toBe('First Spark')
    expect(rankFor(4600)).toBe('Signal Weaver')
    expect(rankFor(9999)).toBe('Neural Cartographer')
  })

  it('radiant is a visual tier only', () => {
    expect(isRadiant(5999)).toBe(false)
    expect(isRadiant(6000)).toBe(true)
  })
})
