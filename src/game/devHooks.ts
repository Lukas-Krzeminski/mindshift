import { useGame } from './store'
import { PHASES, type Phase } from './phases'
import type { Branch } from './outcome'
import { simulateSolve, simulateTimeout, simulateWorldComplete, skipCurrent } from './actions'

declare global {
  interface Window {
    __mindshift?: Record<string, unknown>
  }
}

/** Test hooks for browser automation: window.__mindshift.solve(), .timeout(), .phase('results') ... */
export function installDevHooks(): void {
  window.__mindshift = {
    phases: PHASES,
    state: () => {
      const s = useGame.getState()
      return { flow: s.flow, score: s.scoreEntries, settings: s.settings, gpu: s.gpu }
    },
    solve: simulateSolve,
    timeout: simulateTimeout,
    completeWorld: simulateWorldComplete,
    skip: skipCurrent,
    phase: (phase: Phase, branch?: Branch) => useGame.getState().dispatch({ type: 'JUMP', phase, branch }),
    dispatch: useGame.getState().dispatch,
  }
}
