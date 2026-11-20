/**
 * Game flow: the single source of truth for which phase follows which.
 * Pure functions only (no React, no store) so the whole flow is unit-tested.
 */
import { decideBranch, type Branch } from './outcome'

export const PHASES = [
  'title',
  'clinic',
  'brainDive',
  'tutorial',
  'puzzle1',
  'puzzle2',
  'tripPositive',
  'tripChallenging',
  'zoomOut',
  'integration',
  'results',
  'references',
] as const

export type Phase = (typeof PHASES)[number]

export type PhaseKind = 'screen' | 'cinematic' | 'puzzle' | 'world'

export const PHASE_META: Record<Phase, { label: string; kind: PhaseKind }> = {
  title: { label: 'Title', kind: 'screen' },
  clinic: { label: 'Clinic intro', kind: 'cinematic' },
  brainDive: { label: 'Brain dive', kind: 'cinematic' },
  tutorial: { label: 'Tutorial', kind: 'puzzle' },
  puzzle1: { label: 'Puzzle 1', kind: 'puzzle' },
  puzzle2: { label: 'Puzzle 2 (required)', kind: 'puzzle' },
  tripPositive: { label: 'Luminous Shallows', kind: 'world' },
  tripChallenging: { label: 'Brutalist Maze', kind: 'world' },
  zoomOut: { label: 'Zoom-out', kind: 'cinematic' },
  integration: { label: 'Integration', kind: 'cinematic' },
  results: { label: 'Results', kind: 'screen' },
  references: { label: 'References', kind: 'screen' },
}

export interface FlowState {
  phase: Phase
  /** World reached by the main run; decided only by the end of Puzzle 2. */
  branch: Branch | null
  /** True while the optional "other world" run (started from Results) is playing. */
  bonusRun: boolean
  /** Worlds already explored this session (main run + bonus run). */
  visitedWorlds: Branch[]
}

export type FlowEvent =
  | { type: 'START' }
  | { type: 'NEXT' }
  | { type: 'PUZZLE_SOLVED' }
  | { type: 'PUZZLE_TIMEOUT' }
  | { type: 'WORLD_COMPLETE' }
  | { type: 'PLAY_OTHER_WORLD' }
  | { type: 'SHOW_REFERENCES' }
  | { type: 'BACK' }
  | { type: 'RESTART' }
  /** Presenter-only: jump anywhere, optionally choosing the world. */
  | { type: 'JUMP'; phase: Phase; branch?: Branch }

export interface FlowContext {
  /** Presenter override for the Puzzle 2 outcome. null = normal deterministic rule. */
  forcedBranch: Branch | null
}

export const initialFlow: FlowState = {
  phase: 'title',
  branch: null,
  bonusRun: false,
  visitedWorlds: [],
}

export const worldPhase = (branch: Branch): Phase =>
  branch === 'positive' ? 'tripPositive' : 'tripChallenging'

export const otherBranch = (branch: Branch): Branch =>
  branch === 'positive' ? 'challenging' : 'positive'

export const isWorldPhase = (phase: Phase): phase is 'tripPositive' | 'tripChallenging' =>
  phase === 'tripPositive' || phase === 'tripChallenging'

export const branchOfWorld = (phase: 'tripPositive' | 'tripChallenging'): Branch =>
  phase === 'tripPositive' ? 'positive' : 'challenging'

/** The world the Results screen offers, or null if both have been seen. */
export function otherWorldAvailable(state: FlowState): Branch | null {
  if (!state.branch) return null
  const other = otherBranch(state.branch)
  return state.visitedWorlds.includes(other) ? null : other
}

const withVisited = (visited: Branch[], b: Branch): Branch[] =>
  visited.includes(b) ? visited : [...visited, b]

function enterMainWorld(state: FlowState, branch: Branch): FlowState {
  return {
    ...state,
    phase: worldPhase(branch),
    branch,
    bonusRun: false,
    visitedWorlds: withVisited(state.visitedWorlds, branch),
  }
}

/**
 * Returns the next flow state. If the event is not valid in the current phase,
 * the SAME object is returned, so callers can detect a no-op with ===.
 */
export function transition(state: FlowState, event: FlowEvent, ctx: FlowContext): FlowState {
  if (event.type === 'RESTART') return initialFlow
  if (event.type === 'JUMP') return jump(state, event.phase, event.branch, ctx)

  switch (state.phase) {
    case 'title':
      return event.type === 'START' ? { ...state, phase: 'clinic' } : state
    case 'clinic':
      return event.type === 'NEXT' ? { ...state, phase: 'brainDive' } : state
    case 'brainDive':
      return event.type === 'NEXT' ? { ...state, phase: 'tutorial' } : state
    case 'tutorial':
      return event.type === 'PUZZLE_SOLVED' ? { ...state, phase: 'puzzle1' } : state
    case 'puzzle1':
      return event.type === 'PUZZLE_SOLVED' || event.type === 'PUZZLE_TIMEOUT'
        ? { ...state, phase: 'puzzle2' }
        : state
    case 'puzzle2': {
      if (event.type !== 'PUZZLE_SOLVED' && event.type !== 'PUZZLE_TIMEOUT') return state
      const decided = decideBranch({ solvedBeforeDeadline: event.type === 'PUZZLE_SOLVED' })
      return enterMainWorld(state, ctx.forcedBranch ?? decided)
    }
    case 'tripPositive':
    case 'tripChallenging':
      if (event.type !== 'WORLD_COMPLETE') return state
      return state.bonusRun
        ? { ...state, phase: 'results', bonusRun: false }
        : { ...state, phase: 'zoomOut' }
    case 'zoomOut':
      return event.type === 'NEXT' ? { ...state, phase: 'integration' } : state
    case 'integration':
      return event.type === 'NEXT' ? { ...state, phase: 'results' } : state
    case 'results': {
      if (event.type === 'SHOW_REFERENCES') return { ...state, phase: 'references' }
      if (event.type === 'PLAY_OTHER_WORLD') {
        const other = otherWorldAvailable(state)
        if (!other) return state
        return {
          ...state,
          phase: worldPhase(other),
          bonusRun: true,
          visitedWorlds: withVisited(state.visitedWorlds, other),
        }
      }
      return state
    }
    case 'references':
      return event.type === 'BACK' ? { ...state, phase: 'results' } : state
  }
}

function jump(state: FlowState, phase: Phase, branch: Branch | undefined, ctx: FlowContext): FlowState {
  if (phase === 'title') return initialFlow
  if (isWorldPhase(phase)) {
    return enterMainWorld(state, branchOfWorld(phase))
  }
  // Phases after the worlds need a branch (integration line, results, other-world button).
  const needsBranch = phase === 'zoomOut' || phase === 'integration' || phase === 'results' || phase === 'references'
  const chosen = branch ?? state.branch ?? ctx.forcedBranch ?? (needsBranch ? 'positive' : null)
  return {
    ...state,
    phase,
    bonusRun: false,
    branch: chosen,
    visitedWorlds: needsBranch && chosen ? withVisited(state.visitedWorlds, chosen) : state.visitedWorlds,
  }
}
