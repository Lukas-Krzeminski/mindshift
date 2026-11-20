import { Fragment } from 'react'
import { useGame } from '../game/store'
import { REFERENCES } from '../content/references'

/** Renders `*italic*` segments of an APA string. */
function Apa({ text }: { text: string }) {
  return (
    <>
      {text.split('*').map((part, i) => (i % 2 === 1 ? <i key={i}>{part}</i> : <Fragment key={i}>{part}</Fragment>))}
    </>
  )
}

export function ReferencesScreen() {
  const dispatch = useGame((s) => s.dispatch)
  const showFlags = useGame((s) => s.presenter.armed || s.debug)
  const sorted = [...REFERENCES].sort((a, b) => a.apa.localeCompare(b.apa))

  return (
    <div className="screen">
      <div className="results-panel glass interactive">
        <p className="eyebrow">Sources</p>
        <h2 className="results-title">References</h2>
        <ul className="refs">
          {sorted.map((r) => (
            <li key={r.id}>
              <Apa text={r.apa} />
              {showFlags && r.status === 'confirm' && <span className="flag" title={r.note}>confirm details</span>}
              {showFlags && !r.poster && <span className="flag gap">gap-filler</span>}
            </li>
          ))}
        </ul>
        <p className="disclaimer">
          The worlds in this game are artistic interpretations, not reproductions of what any person experiences.
        </p>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => dispatch({ type: 'BACK' })}>Back to results</button>
        </div>
      </div>
    </div>
  )
}
