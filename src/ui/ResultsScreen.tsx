import { useGame, selectTotalScore } from '../game/store'
import { otherWorldAvailable } from '../game/phases'
import { rankFor } from '../game/scoring'
import { FICTION_DISCLAIMER, TAKEAWAYS } from '../content/captions'
import { useCountUp } from './useCountUp'
import type { Branch } from '../game/outcome'

const WORLD_NAMES: Record<Branch, string> = {
  positive: 'Luminous Shallows',
  challenging: 'Brutalist Maze',
}

export function ResultsScreen() {
  const flow = useGame((s) => s.flow)
  const entries = useGame((s) => s.scoreEntries)
  const total = useGame(selectTotalScore)
  const dispatch = useGame((s) => s.dispatch)
  const shown = useCountUp(total, 1400)
  const other = otherWorldAvailable(flow)
  const sawBoth = flow.visitedWorlds.length === 2

  return (
    <div className="screen">
      <div className="results-panel glass interactive">
        <p className="eyebrow">Session complete{flow.branch ? ` · ${WORLD_NAMES[flow.branch]}` : ''}</p>
        <h2 className="results-title">What we know, and what we don't</h2>
        <div className="results-grid">
          <section>
            <div className="score-total">{shown.toLocaleString('en-US')}</div>
            <p className="rank">{rankFor(total)}</p>
            <ul className="breakdown">
              {entries.map((e, i) => (
                <li key={i}>
                  <span>{e.label}</span>
                  <span>+{e.points.toLocaleString('en-US')}</span>
                </li>
              ))}
              {entries.length === 0 && <li><span>No points recorded this run</span><span /></li>}
            </ul>
          </section>
          <section>
            <ol className="takeaways">
              {TAKEAWAYS.map((t) => (
                <li key={t.id}>{t.text}</li>
              ))}
            </ol>
            <p className="disclaimer">{FICTION_DISCLAIMER}</p>
            {sawBoth && (
              <p className="disclaimer">You've seen both worlds: the same mind, two very different experiences.</p>
            )}
          </section>
        </div>
        <div className="actions">
          {other && (
            <button className="btn btn-primary" onClick={() => dispatch({ type: 'PLAY_OTHER_WORLD' })}>
              Experience the {WORLD_NAMES[other]}
            </button>
          )}
          <button className="btn" onClick={() => dispatch({ type: 'SHOW_REFERENCES' })}>References</button>
          <button className="btn" onClick={() => dispatch({ type: 'RESTART' })}>Play again</button>
        </div>
      </div>
    </div>
  )
}
