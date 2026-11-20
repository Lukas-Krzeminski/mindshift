import { useGame } from './store'
import { PHASES, type Phase } from './phases'
import type { Branch } from './outcome'
import { simulateSolve, simulateTimeout, simulateWorldComplete, skipCurrent } from './actions'
import { input } from '../player/input'
import { player } from '../player/playerState'
import { devTimeline } from '../scenes/cinematics/Cinematics'
import { useCaptions } from '../ui/captions'

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
    // movement testing: __mindshift.input.keys.add('KeyW'), __mindshift.player.position
    input,
    player,
    /** Pause/resume all timers (same as the presenter button). */
    pause: (on = true) => useGame.getState().setSettings({ timersPaused: on }),
    /** Dismiss the dialogue line on screen (as if SPACE was pressed). */
    continue: () => useCaptions.getState().continueDialogue(true),
    /** Jump the current cinematic's timeline to `seconds`. */
    seek: (seconds: number) => {
      if (devTimeline.ref) devTimeline.ref.current = seconds
      return !!devTimeline.ref
    },
    /** Advance the render loop manually for `seconds` (works while the tab is hidden). */
    // Busy-waits between frames: hidden tabs throttle timers to ~1 Hz, which would stall a timer loop.
    // Pump in short segments so React can commit state changes between calls.
    pump: (seconds = 1, fps = 30) => {
      const st = (window as unknown as { __r3f?: { advance: (t: number) => void } }).__r3f
      if (!st) return 'no canvas'
      const frames = Math.round(seconds * fps)
      for (let i = 0; i < frames; i++) {
        const until = performance.now() + 1000 / fps
        while (performance.now() < until) {
          /* spin */
        }
        st.advance(performance.now())
      }
      return frames
    },
  }
}
