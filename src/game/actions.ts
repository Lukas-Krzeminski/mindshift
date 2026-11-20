/**
 * Higher-level game actions shared by the presenter panel, dev hooks and
 * (until the real scenes land) the dev-stub controls.
 */
import { useGame } from './store'
import { PHASE_META, branchOfWorld, isWorldPhase } from './phases'
import { scoreInsight, scorePuzzle, type PuzzleStats, type ScoredPuzzle } from './scoring'
import { usePuzzle } from '../puzzle/puzzleStore'
import { getLevel, puzzleForPhase } from '../puzzle/levels'

const g = () => useGame.getState()

/** Presenter "skip": advance whatever is on screen without awarding points. */
export function skipCurrent(): boolean {
  const { flow, dispatch } = g()
  const kind = PHASE_META[flow.phase].kind
  if (flow.phase === 'title') return dispatch({ type: 'START' })
  if (kind === 'cinematic') return dispatch({ type: 'NEXT' })
  if (kind === 'puzzle') return dispatch({ type: 'PUZZLE_SOLVED' })
  if (kind === 'world') return dispatch({ type: 'WORLD_COMPLETE' })
  return false
}

const isScoredPuzzle = (p: string): p is ScoredPuzzle => p === 'puzzle1' || p === 'puzzle2' || p === 'puzzle3'

/** Reports a finished puzzle: records its score, then advances the flow. */
export function reportPuzzleResult(stats: Omit<PuzzleStats, 'puzzle'>): boolean {
  const { flow, addScore, dispatch } = g()
  if (isScoredPuzzle(flow.phase)) addScore(scorePuzzle({ ...stats, puzzle: flow.phase }))
  return dispatch({ type: stats.solved ? 'PUZZLE_SOLVED' : 'PUZZLE_TIMEOUT' })
}

// ---------------------------------------------------------------------------
// Simulations used by dev stubs and window.__mindshift until real scenes exist.
// ---------------------------------------------------------------------------

/** If a real lattice is live, auto-solve/time it out through the puzzle itself (real stats, real FX). */
function livePuzzle(): boolean {
  const key = puzzleForPhase(g().flow.phase)
  return !!key && usePuzzle.getState().run?.key === key
}

export function simulateSolve(): boolean {
  if (livePuzzle()) {
    usePuzzle.getState().autoSolve()
    return true
  }
  const key = puzzleForPhase(g().flow.phase)
  const level = key ? getLevel(key) : null
  return reportPuzzleResult({
    solved: true,
    secondsRemaining: 24,
    connectedPairs: level?.colors ?? 4,
    totalPairs: level?.colors ?? 4,
    fullCoverage: false,
    cutsAndResets: 1,
    gatesLit: level ? level.gate.reduce((n, v) => n + v, 0) : 0,
  })
}

export function simulateTimeout(): boolean {
  if (!isScoredPuzzle(g().flow.phase)) return false
  if (livePuzzle()) {
    usePuzzle.getState().forceTimeout()
    return true
  }
  return reportPuzzleResult({
    solved: false,
    secondsRemaining: 0,
    connectedPairs: 2,
    totalPairs: 8,
    fullCoverage: false,
    cutsAndResets: 4,
    gatesLit: 1,
  })
}

export function simulateWorldComplete(): boolean {
  const { flow, addScore, dispatch } = g()
  if (!isWorldPhase(flow.phase)) return false
  if (!flow.bonusRun) {
    addScore(
      branchOfWorld(flow.phase) === 'positive'
        ? [scoreInsight('memoryShard'), scoreInsight('memoryShard'), scoreInsight('memoryShard')]
        : [scoreInsight('breathCompleted'), scoreInsight('monolithReached')],
    )
  }
  return dispatch({ type: 'WORLD_COMPLETE' })
}
