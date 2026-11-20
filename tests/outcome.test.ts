import { describe, expect, it } from 'vitest'
import { decideBranch, type RequiredPuzzleResult } from '../src/game/outcome'

describe('decideBranch (the only outcome rule)', () => {
  it('finishing the required puzzle in time leads to the positive world', () => {
    expect(decideBranch({ solvedBeforeDeadline: true })).toBe('positive')
  })

  it('running out of time leads to the challenging world', () => {
    expect(decideBranch({ solvedBeforeDeadline: false })).toBe('challenging')
  })

  it('ignores score, speed and mistakes even if they are passed along', () => {
    const slowMessySolve = { solvedBeforeDeadline: true, score: 0, secondsRemaining: 1, cutsAndResets: 40 }
    const perfectTimeout = { solvedBeforeDeadline: false, score: 99999, secondsRemaining: 0, cutsAndResets: 0 }
    expect(decideBranch(slowMessySolve as RequiredPuzzleResult)).toBe('positive')
    expect(decideBranch(perfectTimeout as RequiredPuzzleResult)).toBe('challenging')
  })

  it('is deterministic (no randomness)', () => {
    const results = Array.from({ length: 200 }, () => decideBranch({ solvedBeforeDeadline: true }))
    expect(new Set(results)).toEqual(new Set(['positive']))
  })
})
