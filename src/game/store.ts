import { create } from 'zustand'
import { initialFlow, transition, type FlowEvent, type FlowState } from './phases'
import type { Branch } from './outcome'
import type { ScoreEntry } from './scoring'
import type { QualityTier } from '../quality/presets'
import type { GpuInfo } from '../quality/tierDetect'

export interface Settings {
  quality: QualityTier
  /** When true the FPS monitor may lower the tier automatically. */
  qualityAuto: boolean
  /** 0..1 master volume. */
  volume: number
  /** Caption size multiplier (projector readability). */
  captionScale: number
  /** Presenter switch for the challenging world. */
  intensity: 'full' | 'reduced'
  /** Presenter can freeze puzzle/world timers for class discussion. */
  timersPaused: boolean
  /** Presenter override for the required Puzzle 3 outcome (null = normal rule). */
  forcedBranch: Branch | null
}

export interface GameState {
  flow: FlowState
  /** Increments on every successful transition; scenes use it as a React key to remount cleanly. */
  flowSeq: number
  scoreEntries: ScoreEntry[]
  settings: Settings
  presenter: { armed: boolean; open: boolean }
  gpu: GpuInfo | null
  debug: boolean

  /** Applies a flow event. Returns false if the event was not valid in the current phase. */
  dispatch: (event: FlowEvent) => boolean
  addScore: (entries: ScoreEntry | ScoreEntry[]) => void
  setSettings: (patch: Partial<Settings>) => void
  setPresenter: (patch: Partial<GameState['presenter']>) => void
}

export const defaultSettings: Settings = {
  quality: 'medium',
  qualityAuto: true,
  volume: 0.8,
  captionScale: 1,
  intensity: 'full',
  timersPaused: false,
  forcedBranch: null,
}

export const useGame = create<GameState>()((set, get) => ({
  flow: initialFlow,
  flowSeq: 0,
  scoreEntries: [],
  settings: defaultSettings,
  presenter: { armed: false, open: false },
  gpu: null,
  debug: false,

  dispatch: (event) => {
    const { flow, settings, flowSeq, scoreEntries } = get()
    const next = transition(flow, event, { forcedBranch: settings.forcedBranch })
    if (next === flow) return false
    // A fresh run (Title -> Clinic) or a restart clears the score.
    const freshRun = event.type === 'RESTART' || (flow.phase === 'title' && next.phase === 'clinic')
    set({
      flow: next,
      flowSeq: flowSeq + 1,
      scoreEntries: freshRun ? [] : scoreEntries,
      settings: { ...settings, timersPaused: false },
    })
    return true
  },

  addScore: (entries) =>
    set((s) => ({ scoreEntries: [...s.scoreEntries, ...(Array.isArray(entries) ? entries : [entries])] })),

  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

  setPresenter: (patch) => set((s) => ({ presenter: { ...s.presenter, ...patch } })),
}))

export const selectTotalScore = (s: GameState): number =>
  s.scoreEntries.reduce((sum, e) => sum + e.points, 0)
