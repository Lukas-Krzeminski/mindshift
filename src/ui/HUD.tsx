import { useGame, selectTotalScore } from '../game/store'
import { PHASE_META } from '../game/phases'
import { useCountUp } from './useCountUp'

/** Top-right score, shown only while there is something to score. */
export function HUD() {
  const phase = useGame((s) => s.flow.phase)
  const bonusRun = useGame((s) => s.flow.bonusRun)
  const total = useGame(selectTotalScore)
  const shown = useCountUp(total)
  const kind = PHASE_META[phase].kind
  if ((kind !== 'puzzle' && kind !== 'world') || bonusRun) return null
  return (
    <div className="hud-score glass" aria-live="polite">
      <span className="hud-label">Score</span>
      <span className="hud-value">{shown.toLocaleString('en-US')}</span>
    </div>
  )
}
