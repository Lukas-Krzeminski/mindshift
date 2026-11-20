/**
 * The ONLY rule that decides which world Alex enters.
 *
 * Deliberately takes nothing but whether the required puzzle was finished in time:
 * score, mistakes, speed and randomness can never influence it.
 * In the game this is a fictional mechanic; in reality nothing predicts how a
 * psychedelic experience will go (stated on screen at Puzzle 2 and Results).
 */
export type Branch = 'positive' | 'challenging'

export interface RequiredPuzzleResult {
  solvedBeforeDeadline: boolean
}

export function decideBranch(result: RequiredPuzzleResult): Branch {
  return result.solvedBeforeDeadline ? 'positive' : 'challenging'
}
