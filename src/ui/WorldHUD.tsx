import { useEffect, useState, type CSSProperties } from 'react'
import { useGame } from '../game/store'
import { isWorldPhase } from '../game/phases'
import { useWorldHud } from './worldHudStore'
import { input } from '../player/input'

/** World overlay: title + goal, first-time controls card, and the breathing ring. */
export function WorldHUD() {
  const phase = useGame((s) => s.flow.phase)
  const hud = useWorldHud()
  const [controls, setControls] = useState(true)

  useEffect(() => {
    if (!isWorldPhase(phase)) return
    setControls(true)
    const start = performance.now()
    const id = window.setInterval(() => {
      const moved = input.keys.size > 0 && performance.now() - start > 2500
      const looked = input.locked && performance.now() - start > 2500
      if (moved || looked || performance.now() - start > 11000) setControls(false)
    }, 200)
    return () => window.clearInterval(id)
  }, [phase])

  if (!isWorldPhase(phase)) return null
  return (
    <>
      {hud.title && (
        <div className="world-hud">
          <p className="eyebrow">{hud.title}</p>
          {hud.goal && <span className="goal">{hud.goal}</span>}
          {hud.sub && <span className="goal" style={{ opacity: 0.7, fontSize: '0.82rem' }}>{hud.sub}</span>}
        </div>
      )}
      {controls && !hud.breath && (
        <div className="controls-hint glass">
          <h3>Click to look around</h3>
          <div className="keys">
            <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move</span>
            <span><kbd>Shift</kbd> sprint</span>
            <span><kbd>Space</kbd> jump</span>
            <span><kbd>Mouse</kbd> look</span>
          </div>
        </div>
      )}
    </>
  )
}

/** The shared breathing ring (clinic preparation + challenging world). */
export function BreathOverlay() {
  const breath = useWorldHud((s) => s.breath)
  if (!breath) return null
  return (
    <div className={`breath-ring ${breath.center ? 'center' : ''} ${breath.active ? 'active' : ''}`}>
      <div className="ring" style={{ '--s': String(breath.scale) } as CSSProperties} />
      <span className="label">{breath.label}</span>
      {breath.hint && <span className="hint">{breath.hint}</span>}
    </div>
  )
}
