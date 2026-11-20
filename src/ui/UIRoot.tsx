import type { CSSProperties } from 'react'
import { useGame } from '../game/store'
import { PHASE_META } from '../game/phases'
import { TitleScreen } from './TitleScreen'
import { HUD } from './HUD'
import { ResultsScreen } from './ResultsScreen'
import { PresenterPanel, usePresenterHotkeys } from './PresenterPanel'
import { PuzzleHUD } from '../puzzle/PuzzleHUD'
import { WorldHUD, BreathOverlay } from './WorldHUD'
import { CaptionLayer } from './CaptionLayer'
import { FlashOverlay } from './FlashOverlay'
import { SymbolCardLayer } from './SymbolCardLayer'

export function UIRoot() {
  usePresenterHotkeys()
  const phase = useGame((s) => s.flow.phase)
  const captionScale = useGame((s) => s.settings.captionScale)
  const showChip = useGame((s) => s.presenter.armed || s.debug)

  return (
    <div className="ui-layer" style={{ '--caption-scale': captionScale } as CSSProperties}>
      {phase === 'title' && <TitleScreen />}
      {phase === 'results' && <ResultsScreen />}
      <PuzzleHUD />
      <WorldHUD />
      <SymbolCardLayer />
      <CaptionLayer />
      <BreathOverlay />
      <HUD />
      {showChip && phase !== 'title' && <div className="phase-chip">{PHASE_META[phase].label}</div>}
      <FlashOverlay />
      <PresenterPanel />
    </div>
  )
}
