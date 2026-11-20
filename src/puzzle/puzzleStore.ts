import { create } from 'zustand'
import {
  beginDrag,
  cutsMade,
  dragToward,
  emptyPaths,
  evaluate,
  resolvePaths,
  solutionPaths,
  type Drag,
  type Evaluation,
  type Paths,
} from './model'
import { getLevel, type PuzzleKey } from './levels'
import { audio } from '../audio/AudioManager'

export type PuzzleStatus = 'intro' | 'playing' | 'solved' | 'timeout'

export interface PuzzleRun {
  key: PuzzleKey
  status: PuzzleStatus
  timeLeft: number | null
  paths: Paths
  drag: Drag | null
  cuts: number
  evaluation: Evaluation
  /** Player has touched the board (hides the tutorial ghost). */
  interacted: boolean
}

interface PuzzleStore {
  run: PuzzleRun | null
  /** Final paths of finished lattices, so they stay lit in the chamber. */
  finals: Partial<Record<PuzzleKey, Paths>>
  /** Prepare a lattice. `force` restarts it even if it is already loaded. */
  load: (key: PuzzleKey, force?: boolean) => void
  start: () => void
  pointerDown: (cell: number) => void
  pointerMove: (cell: number) => void
  pointerUp: () => void
  tick: (dt: number) => void
  autoSolve: () => void
  forceTimeout: () => void
  resetAll: () => void
}

function freshRun(key: PuzzleKey): PuzzleRun {
  const level = getLevel(key)
  const paths = emptyPaths(level)
  return {
    key,
    status: key === 'tutorial' ? 'playing' : 'intro',
    timeLeft: level.def.timeLimit,
    paths,
    drag: null,
    cuts: 0,
    evaluation: evaluate(level, paths),
    interacted: false,
  }
}

/** Plays a note for each newly connected pair. */
function announce(prev: Evaluation, next: Evaluation): void {
  next.complete.forEach((done, k) => {
    if (done && !prev.complete[k]) audio.note(k)
  })
  if (next.solved && !prev.solved) audio.resolveChord()
}

export const usePuzzle = create<PuzzleStore>()((set, get) => ({
  run: null,
  finals: {},

  load: (key, force = false) => {
    const current = get().run
    if (!force && current?.key === key) return
    set({ run: freshRun(key) })
  },

  start: () => {
    const run = get().run
    if (run?.status === 'intro') set({ run: { ...run, status: 'playing' } })
  },

  pointerDown: (cell) => {
    const run = get().run
    if (!run || run.status !== 'playing') return
    const level = getLevel(run.key)
    const drag = beginDrag(level, run.paths, cell)
    if (!drag) return
    const paths = resolvePaths(drag)
    const evaluation = evaluate(level, paths)
    announce(run.evaluation, evaluation)
    set({ run: { ...run, drag, paths, evaluation, interacted: true } })
  },

  pointerMove: (cell) => {
    const run = get().run
    if (!run || run.status !== 'playing' || !run.drag) return
    const level = getLevel(run.key)
    const drag = dragToward(level, run.drag, cell)
    if (drag === run.drag) return
    const paths = resolvePaths(drag)
    const evaluation = evaluate(level, paths)
    announce(run.evaluation, evaluation)
    if (evaluation.solved) {
      const cuts = run.cuts + cutsMade(drag)
      set({ run: { ...run, drag: null, paths, evaluation, cuts, status: 'solved' }, finals: { ...get().finals, [run.key]: paths } })
      return
    }
    set({ run: { ...run, drag, paths, evaluation } })
  },

  pointerUp: () => {
    const run = get().run
    if (!run?.drag) return
    set({ run: { ...run, cuts: run.cuts + cutsMade(run.drag), drag: null } })
  },

  tick: (dt) => {
    const run = get().run
    if (!run || run.status !== 'playing' || run.timeLeft === null) return
    const before = run.timeLeft
    const timeLeft = Math.max(0, before - dt)
    if (Math.ceil(timeLeft) !== Math.ceil(before) && timeLeft <= 10 && timeLeft > 0) audio.heartbeat()
    if (timeLeft <= 0) {
      audio.timeUp()
      set({ run: { ...run, timeLeft: 0, drag: null, status: 'timeout' }, finals: { ...get().finals, [run.key]: run.paths } })
      return
    }
    set({ run: { ...run, timeLeft } })
  },

  autoSolve: () => {
    const run = get().run
    if (!run || run.status === 'solved' || run.status === 'timeout') return
    const level = getLevel(run.key)
    const paths = solutionPaths(level)
    const evaluation = evaluate(level, paths)
    announce(run.evaluation, evaluation)
    set({ run: { ...run, paths, evaluation, drag: null, status: 'solved', interacted: true }, finals: { ...get().finals, [run.key]: paths } })
  },

  forceTimeout: () => {
    const run = get().run
    if (!run || run.key === 'tutorial' || run.status === 'solved' || run.status === 'timeout') return
    set({ run: { ...run, status: 'playing', timeLeft: 0.01 } })
    get().tick(1)
  },

  resetAll: () => set({ run: null, finals: {} }),
}))
