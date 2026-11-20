import type { CSSProperties } from 'react'
import { useGame } from '../game/store'
import { usePuzzle } from './puzzleStore'
import { getLevel, puzzleForPhase, REQUIRED_PUZZLE, SIGNAL_COLORS, type PuzzleKey } from './levels'
import { METAPHOR_TAG } from '../content/captions'
import { POINTS } from '../game/scoring'
import { audio } from '../audio/AudioManager'

const TITLES: Record<PuzzleKey, { eyebrow: string; name: string }> = {
  tutorial: { eyebrow: 'Calibration', name: 'Learn the lattice' },
  puzzle1: { eyebrow: 'Lattice 1 of 3', name: 'Reconnect the signals' },
  puzzle2: { eyebrow: 'Lattice 2 of 3', name: 'Reroute the network' },
  puzzle3: { eyebrow: 'Lattice 3 of 3 · Required', name: 'Light the receptors' },
}

const gateCount = (key: PuzzleKey) => getLevel(key).gate.reduce((n, g) => n + g, 0)
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five']
/** "the gold 5-HT2A gate" / "all three gold 5-HT2A gates" (non-breaking hyphen keeps 5-HT2A on one line). */
const gatesPhrase = (n: number) =>
  n === 1 ? 'the gold 5‑HT2A gate' : n === 2 ? 'both gold 5‑HT2A gates' : `all ${WORDS[n] ?? n} gold 5‑HT2A gates`

const fmt = (s: number) => {
  const whole = Math.ceil(s)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** DOM layer for the puzzles: title, timer, progress, intro/outcome cards. */
export function PuzzleHUD() {
  const phase = useGame((s) => s.flow.phase)
  const key = puzzleForPhase(phase)
  const run = usePuzzle((s) => (key && s.run?.key === key ? s.run : null))
  if (!key || !run) return null

  const level = getLevel(key)
  const timed = level.def.timeLimit !== null
  const left = run.timeLeft ?? 0
  const warn = timed && left <= 10 && run.status === 'playing'
  const ev = run.evaluation
  const title = TITLES[key]

  return (
    <>
      <div className="puzzle-top" key={key}>
        <p className="eyebrow">{title.eyebrow}</p>
        <h2 className="puzzle-title">{title.name}</h2>
        {timed && <div className={`puzzle-timer ${warn ? 'warn' : ''}`}>{fmt(left)}</div>}
        <div className="puzzle-progress">
          {level.ends.map((_, k) => (
            <span key={k} className={`sig-dot ${ev.complete[k] ? 'on' : ''}`} style={{ '--c': SIGNAL_COLORS[k].hex } as CSSProperties} />
          ))}
          <span>{ev.connected}/{ev.total} signals</span>
          {ev.gatesTotal > 0 && (
            <span className={ev.gatesLit === ev.gatesTotal ? 'gates done' : 'gates'}>
              {ev.gatesLit}/{ev.gatesTotal} 5-HT2A gates
            </span>
          )}
        </div>
      </div>

      {key === 'tutorial' && run.status === 'playing' && (
        <div className="puzzle-bottom">
          <p className="instruction">Drag from a glowing node to its matching twin. Paths can't cross.</p>
          <p className="metaphor">{METAPHOR_TAG}</p>
        </div>
      )}

      {run.status === 'intro' && key !== REQUIRED_PUZZLE && key !== 'tutorial' && (
        <div className="puzzle-card glass interactive">
          <p className="eyebrow">
            {title.eyebrow} · {level.def.timeLimit} seconds
          </p>
          <h3>
            Connect all {level.colors} signal pairs and light {gatesPhrase(gateCount(key))}
          </h3>
          <p>
            {key === 'puzzle1'
              ? 'A gate lights up when any path runs through it. The shortest route is rarely the right one.'
              : 'More pairs, less room. Plan the long routes first. Bonus points for time left and for filling every cell.'}
          </p>
          <p className="ready">The timer starts when you press Start.</p>
          <StartButton />
        </div>
      )}

      {run.status === 'intro' && key === REQUIRED_PUZZLE && <RequiredCard />}

      {(run.status === 'solved' || run.status === 'timeout') && (
        <div className={`puzzle-card glass outcome ${run.status}`}>
          {run.status === 'solved' ? (
            <>
              <p className="eyebrow">{key === 'tutorial' ? 'Calibrated' : 'Lattice complete'}</p>
              <h3>{key === 'tutorial' ? "You've got it." : 'Signals synchronized'}</h3>
              {key !== 'tutorial' && (
                <div className="chips">
                  {(run.timeLeft ?? 0) >= 1 && <span>+{Math.floor(run.timeLeft ?? 0) * POINTS.perSecondRemaining} time</span>}
                  {ev.fullCoverage && <span className="gold">Full Coherence +{POINTS.fullCoherence}</span>}
                  {run.cuts <= POINTS.efficiencyMaxCuts && <span>Efficient +{POINTS.efficiency}</span>}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="eyebrow">Time's up</p>
              <h3>{key === REQUIRED_PUZZLE ? 'The network is shifting…' : `${ev.connected} of ${ev.total} signals held`}</h3>
              {key !== REQUIRED_PUZZLE && (
                <p>{key === 'puzzle1' ? 'Partial connections still score. On to the next lattice.' : 'Partial connections still score. On to the required lattice.'}</p>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}

function StartButton() {
  const start = () => {
    audio.blip(880)
    usePuzzle.getState().start()
  }
  return (
    <button className="btn btn-primary btn-lg" onClick={start} autoFocus>
      Start
    </button>
  )
}

function RequiredCard() {
  const level = getLevel(REQUIRED_PUZZLE)
  return (
    <div className="puzzle-card glass required interactive">
      <p className="eyebrow required-tag">Required lattice</p>
      <h3>
        Connect all {level.colors} pairs and light {gatesPhrase(gateCount(REQUIRED_PUZZLE))} in {level.def.timeLimit} seconds
      </h3>
      <p className="vote">Class: will Alex's experience be positive or challenging? Raise your hands.</p>
      <StartButton />
    </div>
  )
}
