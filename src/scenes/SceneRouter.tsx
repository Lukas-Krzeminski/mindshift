import { lazy, useEffect } from 'react'
import { useGame } from '../game/store'
import type { Phase } from '../game/phases'
import { TitleBackdrop } from './title/TitleBackdrop'
import { PlaceholderScene } from './placeholder/PlaceholderScene'

// Worlds pull in the Rapier physics engine (~2 MB of WASM), so they load lazily:
// the title appears fast, and the worlds download in the background during the puzzles.
const loadWorlds = () => import('./placeholder/WorldGreybox')
const WorldGreybox = lazy(() => loadWorlds().then((m) => ({ default: m.WorldGreybox })))
const PRELOAD_WORLDS_IN: ReadonlySet<Phase> = new Set<Phase>(['tutorial', 'puzzle1', 'puzzle2', 'results'])

/** Mounts the 3D content for the current phase inside the single persistent canvas. */
export function SceneRouter() {
  const phase = useGame((s) => s.flow.phase)
  const flowSeq = useGame((s) => s.flowSeq)

  useEffect(() => {
    if (PRELOAD_WORLDS_IN.has(phase)) void loadWorlds()
  }, [phase])

  switch (phase) {
    case 'title':
      return <TitleBackdrop key="backdrop" />
    case 'results':
    case 'references':
      return <TitleBackdrop key="backdrop" dim />
    case 'tripPositive':
      return <WorldGreybox key={flowSeq} world="positive" />
    case 'tripChallenging':
      return <WorldGreybox key={flowSeq} world="challenging" />
    default:
      return <PlaceholderScene key={phase} phase={phase} />
  }
}
