import { useEffect } from 'react'
import { useGame, selectTotalScore } from '../game/store'
import { PHASES, PHASE_META } from '../game/phases'
import { skipCurrent } from '../game/actions'
import { audio } from '../audio/AudioManager'
import type { QualityTier } from '../quality/presets'

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

/**
 * Ctrl+Shift+P toggles the panel (and arms presenter mode).
 * Once armed: ` (backtick) also toggles, N skips the current phase.
 */
export function usePresenterHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { presenter, setPresenter } = useGame.getState()
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyP') {
        e.preventDefault()
        setPresenter({ armed: true, open: !presenter.open })
        return
      }
      if (!presenter.armed || isTyping(e.target) || e.ctrlKey || e.altKey || e.metaKey) return
      if (e.code === 'Backquote') setPresenter({ open: !presenter.open })
      else if (e.code === 'KeyN') skipCurrent()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function PresenterPanel() {
  const open = useGame((s) => s.presenter.open)
  const flow = useGame((s) => s.flow)
  const settings = useGame((s) => s.settings)
  const gpu = useGame((s) => s.gpu)
  const total = useGame(selectTotalScore)
  const { dispatch, setSettings, setPresenter } = useGame.getState()
  if (!open) return null

  const setQuality = (q: QualityTier | 'auto') =>
    q === 'auto'
      ? setSettings({ qualityAuto: true, quality: gpu?.tier ?? 'medium' })
      : setSettings({ qualityAuto: false, quality: q })

  return (
    <aside className="presenter glass interactive" aria-label="Presenter panel">
      <h3>Presenter</h3>
      <div className="state">
        <span>Phase</span><b>{PHASE_META[flow.phase].label}{flow.bonusRun ? ' (other world)' : ''}</b>
        <span>World</span><b>{flow.branch ?? '—'}</b>
        <span>Score</span><b>{total.toLocaleString('en-US')}</b>
        <span>Quality</span><b>{settings.quality}{settings.qualityAuto ? ' (auto)' : ''}</b>
        <span>GPU</span><b title={gpu?.renderer}>{gpu?.renderer.replace(/^ANGLE \(|\)$/g, '').slice(0, 60) ?? '—'}</b>
      </div>

      <h3>Flow</h3>
      <div className="seg">
        <button className="btn" onClick={skipCurrent}>Skip ▸ (N)</button>
        <button className={`btn ${settings.timersPaused ? 'on' : ''}`} onClick={() => setSettings({ timersPaused: !settings.timersPaused })}>
          {settings.timersPaused ? 'Resume timers' : 'Pause timers'}
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'RESTART' })}>Restart</button>
      </div>

      <h3>Jump to</h3>
      <div className="grid">
        {PHASES.map((p) => (
          <button key={p} className={`btn ${flow.phase === p ? 'on' : ''}`} onClick={() => dispatch({ type: 'JUMP', phase: p })}>
            {PHASE_META[p].label}
          </button>
        ))}
      </div>

      <h3>Puzzle 2 outcome</h3>
      <div className="seg">
        {([null, 'positive', 'challenging'] as const).map((b) => (
          <button key={String(b)} className={`btn ${settings.forcedBranch === b ? 'on' : ''}`} onClick={() => setSettings({ forcedBranch: b })}>
            {b === null ? 'Normal rule' : b === 'positive' ? 'Force positive' : 'Force challenging'}
          </button>
        ))}
      </div>

      <h3>Display</h3>
      <div className="seg">
        {(['auto', 'high', 'medium', 'low'] as const).map((q) => {
          const on = q === 'auto' ? settings.qualityAuto : !settings.qualityAuto && settings.quality === q
          return (
            <button key={q} className={`btn ${on ? 'on' : ''}`} onClick={() => setQuality(q)}>{q}</button>
          )
        })}
      </div>
      <div className="seg" style={{ marginTop: 6 }}>
        {(['full', 'reduced'] as const).map((i) => (
          <button key={i} className={`btn ${settings.intensity === i ? 'on' : ''}`} onClick={() => setSettings({ intensity: i })}>
            Maze intensity: {i}
          </button>
        ))}
      </div>
      <label>
        Volume
        <input type="range" min={0} max={1} step={0.05} value={settings.volume}
          onChange={(e) => { const v = Number(e.target.value); setSettings({ volume: v }); audio.setVolume(v) }} />
      </label>
      <label>
        Caption size
        <input type="range" min={0.8} max={1.6} step={0.05} value={settings.captionScale}
          onChange={(e) => setSettings({ captionScale: Number(e.target.value) })} />
      </label>

      <p className="hint">Ctrl+Shift+P or ` toggles this panel · N skips · URL: ?presenter=1&amp;phase=…&amp;branch=…</p>
      <button className="btn" style={{ marginTop: 10 }} onClick={() => setPresenter({ open: false })}>Close</button>
    </aside>
  )
}
