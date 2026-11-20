import { useGame } from '../game/store'
import { PHASE_META } from '../game/phases'
import { simulateSolve, simulateTimeout, simulateWorldComplete } from '../game/actions'
import { FICTION_DISCLAIMER, METAPHOR_TAG } from '../content/captions'

/**
 * TEMPORARY development stand-in for scenes not built yet (D1-D7).
 * Lets the whole loop be walked end to end. Each phase loses its stub when its real scene lands.
 */
export function PhaseStub() {
  const phase = useGame((s) => s.flow.phase)
  const bonusRun = useGame((s) => s.flow.bonusRun)
  const dispatch = useGame((s) => s.dispatch)
  const meta = PHASE_META[phase]

  return (
    <div className="dev-stub interactive">
      <span className="tag">DEV STUB · SCENE NOT BUILT YET</span>
      <h2>{meta.label}{bonusRun ? ' (other-world run)' : ''}</h2>
      {phase === 'tutorial' && <p>{METAPHOR_TAG}</p>}
      {phase === 'puzzle2' && <p>{FICTION_DISCLAIMER}</p>}
      <div className="row">
        {meta.kind === 'cinematic' && (
          <button className="btn" onClick={() => dispatch({ type: 'NEXT' })}>Continue</button>
        )}
        {meta.kind === 'puzzle' && (
          <>
            <button className="btn" onClick={simulateSolve}>Simulate: solved</button>
            {phase !== 'tutorial' && (
              <button className="btn" onClick={simulateTimeout}>Simulate: time ran out</button>
            )}
          </>
        )}
        {meta.kind === 'world' && (
          <button className="btn" onClick={simulateWorldComplete}>Simulate: reach the goal</button>
        )}
      </div>
    </div>
  )
}
