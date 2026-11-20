import { lazy, useEffect } from 'react'
import { useGame } from '../game/store'
import type { Phase } from '../game/phases'
import { puzzleForPhase } from '../puzzle/levels'
import { audio, type AmbienceName } from '../audio/AudioManager'
import { preloadCharacters } from '../player/characterModel'
import { preloadProps } from './clinic/Props'
import { TitleBackdrop } from './title/TitleBackdrop'
import { NeuralChamber } from './brain/NeuralChamber'
import { ClinicIntro, BrainDive } from './cinematics/Cinematics'
import { LanternsEnding } from './ending/LanternsEnding'

// Worlds pull in the Rapier physics engine (~2 MB of WASM), so they load lazily:
// the title appears fast, and the worlds download in the background during the puzzles.
const loadShallows = () => import('./shallows/LuminousShallows')
const loadMaze = () => import('./maze/BrutalistMaze')
const LuminousShallows = lazy(() => loadShallows().then((m) => ({ default: m.LuminousShallows })))
const BrutalistMaze = lazy(() => loadMaze().then((m) => ({ default: m.BrutalistMaze })))
const PRELOAD_WORLDS_IN: ReadonlySet<Phase> = new Set<Phase>(['brainDive', 'tutorial', 'puzzle1', 'puzzle2', 'puzzle3', 'results'])

/** Ambience for phases that don't pick their own (cinematics choose theirs). */
const AMBIENCE: Partial<Record<Phase, AmbienceName | null>> = {
  title: null,
  tutorial: 'puzzle',
  puzzle1: 'puzzle',
  puzzle2: 'puzzle',
  puzzle3: 'puzzle',
  tripPositive: 'shallows',
  tripChallenging: 'maze',
  results: 'results',
}

/** Mounts the 3D content for the current phase inside the single persistent canvas. */
export function SceneRouter() {
  const phase = useGame((s) => s.flow.phase)
  const flowSeq = useGame((s) => s.flowSeq)

  useEffect(() => {
    if (phase === 'title') {
      preloadCharacters()
      preloadProps()
    }
    if (phase in AMBIENCE) audio.ambience(AMBIENCE[phase] ?? null)
    // songs: one for each world; the good one carries on into the lantern ending
    audio.song(phase === 'tripPositive' || phase === 'ending' ? 'good' : phase === 'tripChallenging' ? 'bad' : null)
    if (!PRELOAD_WORLDS_IN.has(phase)) return
    void loadShallows()
    void loadMaze()
  }, [phase])

  const puzzle = puzzleForPhase(phase)
  // One persistent chamber for all four lattices so the camera can fly between them.
  if (puzzle) return <NeuralChamber key="chamber" puzzleKey={puzzle} />

  switch (phase) {
    case 'title':
      return <TitleBackdrop key="backdrop" />
    case 'clinic':
      return <ClinicIntro key={flowSeq} />
    case 'brainDive':
      return <BrainDive key={flowSeq} />
    case 'ending':
      return <LanternsEnding key={flowSeq} />
    case 'results':
      return <TitleBackdrop key="backdrop" dim />
    case 'tripPositive':
      return <LuminousShallows key={flowSeq} />
    case 'tripChallenging':
      return <BrutalistMaze key={flowSeq} />
  }
}
