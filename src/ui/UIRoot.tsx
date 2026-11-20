import type { CSSProperties } from 'react'
import { useGame } from '../game/store'
import { PHASE_META, type Phase } from '../game/phases'
import { TitleScreen } from './TitleScreen'
import { HUD } from './HUD'
import { PhaseStub } from './PhaseStub'
import { ResultsScreen } from './ResultsScreen'
import { ReferencesScreen } from './ReferencesScreen'
import { PresenterPanel, usePresenterHotkeys } from './PresenterPanel'

/** Phases whose real scene/UI exists. Everything else shows the dev stub. */
const BUILT: ReadonlySet<Phase> = new Set<Phase>(['title', 'results', 'references'])

export function UIRoot() {
  usePresenterHotkeys()
  const phase = useGame((s) => s.flow.phase)
  const flowSeq = useGame((s) => s.flowSeq)
  const captionScale = useGame((s) => s.settings.captionScale)
  const showChip = useGame((s) => s.presenter.armed || s.debug)

  return (
    <div className="ui-layer" style={{ '--caption-scale': captionScale } as CSSProperties}>
      {phase === 'title' && <TitleScreen />}
      {phase === 'results' && <ResultsScreen />}
      {phase === 'references' && <ReferencesScreen />}
      {!BUILT.has(phase) && <PhaseStub key={flowSeq} />}
      <HUD />
      {showChip && phase !== 'title' && <div className="phase-chip">{PHASE_META[phase].label}</div>}
      <PresenterPanel />
    </div>
  )
}
