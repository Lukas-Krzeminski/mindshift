import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import type { PerspectiveCamera } from 'three'
import { useGame } from '../../game/store'
import { reportPuzzleResult } from '../../game/actions'
import type { Phase } from '../../game/phases'
import { QUALITY_PRESETS } from '../../quality/presets'
import { getLevel, PUZZLE_KEYS, puzzleForPhase, type PuzzleKey } from '../../puzzle/levels'
import { usePuzzle } from '../../puzzle/puzzleStore'
import { PuzzleBoard, type BoardMode } from '../../puzzle/PuzzleBoard'
import { showSymbol } from '../../ui/symbolStore'
import type { SymbolId } from '../../content/symbols'
import { NebulaSky, MistFloor } from './NebulaSky'
import { NeuronForest } from './NeuronForest'
import type { Vec3 } from '../useCameraPose'

/** Where each lattice floats in the neural forest; the camera flies between them. */
export const BOARD_POS: Record<PuzzleKey, Vec3> = {
  tutorial: [-8, 1.5, 0],
  puzzle1: [7, -0.5, -28],
  puzzle2: [-5, 2, -58],
  puzzle3: [5, 1, -90],
}

const ORDER: Record<PuzzleKey, number> = { tutorial: 0, puzzle1: 1, puzzle2: 2, puzzle3: 3 }
const FOREST_BOUNDS = { x: [-40, 40] as [number, number], y: [-12, 16] as [number, number], z: [-122, 25] as [number, number] }
const FOV = 42

export const phaseToPuzzle = (phase: Phase): PuzzleKey | null => puzzleForPhase(phase)

/** The puzzle part of the brain: four lattices floating in a forest of living neurons. */
export function NeuralChamber({ puzzleKey }: { puzzleKey: PuzzleKey }) {
  const particleScale = QUALITY_PRESETS[useGame((s) => s.settings.quality)].particleScale
  const avoid = useMemo(
    () => PUZZLE_KEYS.flatMap((k) => {
      // keep the whole sightline from camera to lattice (and its edges) free of branches
      const [x, y, z] = BOARD_POS[k]
      return [
        ...[0, 5, 10, 15, 20, 25].map((dz) => new THREE.Vector3(x, y, z + dz)),
        ...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => new THREE.Vector3(x + sx * 5, y + sy * 4, z + 4))),
      ]
    }),
    [],
  )

  // Fresh puzzle state whenever the chamber is entered (new run or presenter jump).
  useLayoutEffect(() => {
    const store = usePuzzle.getState()
    if (puzzleKey === 'tutorial') store.resetAll()
    store.load(puzzleKey, true)
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => usePuzzle.getState().load(puzzleKey), [puzzleKey])

  const clear = useMemo(() => {
    const half = (getLevel(puzzleKey).size + 1.8) / 2 + 0.5
    return { center: new THREE.Vector3(...BOARD_POS[puzzleKey]), half: new THREE.Vector2(half, half) }
  }, [puzzleKey])

  const modeOf = (k: PuzzleKey): BoardMode => (k === puzzleKey ? 'active' : ORDER[k] < ORDER[puzzleKey] ? 'done' : 'dormant')

  return (
    <>
      <color attach="background" args={['#050414']} />
      <fog attach="fog" args={['#0a0820', 22, 95]} />
      <NebulaSky />
      <MistFloor />
      <NeuronForest avoid={avoid} bounds={FOREST_BOUNDS} count={42} clearance={10} clear={clear} />
      <ambientLight intensity={0.5} color="#8a7cff" />
      <pointLight position={[BOARD_POS[puzzleKey][0], BOARD_POS[puzzleKey][1] + 2, BOARD_POS[puzzleKey][2] + 4]} intensity={25} color="#9fdcff" />
      <Sparkles count={Math.round(380 * particleScale)} scale={[90, 40, 165]} position={[0, 0, -45]} size={3} speed={0.25} opacity={0.6} color="#7fdcff" />
      <Sparkles count={Math.round(220 * particleScale)} scale={[90, 40, 165]} position={[0, 0, -45]} size={4} speed={0.18} opacity={0.5} color="#ff7be5" />
      {PUZZLE_KEYS.map((k) => (
        <PuzzleBoard key={k} puzzleKey={k} position={BOARD_POS[k]} mode={modeOf(k)} />
      ))}
      <ChamberCamera puzzleKey={puzzleKey} />
      <PuzzleDirector puzzleKey={puzzleKey} />
    </>
  )
}

/** Frames the active lattice; flies through the forest when the lattice changes. */
function ChamberCamera({ puzzleKey }: { puzzleKey: PuzzleKey }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const look = useRef(new THREE.Vector3())
  const desired = useMemo(() => new THREE.Vector3(), [])
  const lookGoal = useMemo(() => new THREE.Vector3(), [])

  useLayoutEffect(() => {
    const [x, y, z] = BOARD_POS[puzzleKey]
    camera.position.set(x + 7, y + 6, z + 46) // arrive from deep in the forest
    look.current.set(x, y, z)
    camera.fov = FOV
    camera.updateProjectionMatrix()
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera])

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.05)
    const size = getLevel(puzzleKey).size
    const [x, y, z] = BOARD_POS[puzzleKey]
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    const aspect = state.size.width / Math.max(1, state.size.height)
    const half = size / 2 + 1.25
    // extra headroom at the top for the title/timer, so the HUD never covers the lattice
    const dist = Math.max((half + 2.7) / tan, (half + 0.6) / (tan * aspect))
    const lift = dist * tan * 0.2
    const t = state.clock.elapsedTime
    desired.set(x + Math.sin(t * 0.21) * 0.15, y + lift + Math.sin(t * 0.17) * 0.1, z + dist)
    camera.position.lerp(desired, 1 - Math.exp(-d * 1.6))
    lookGoal.set(x, y + lift, z)
    look.current.lerp(lookGoal, 1 - Math.exp(-d * 2.4))
    camera.lookAt(look.current)
  })
  return null
}

/** What each lattice's untimed intro explains (shown beside the challenge card, before Start). */
const INTRO_SYMBOL: Partial<Record<PuzzleKey, SymbolId>> = { tutorial: 'lattice', puzzle1: 'gates', puzzle3: 'deadline' }

/** Runs the puzzle timer (only after the player presses Start on the challenge card) and reports results. */
function PuzzleDirector({ puzzleKey }: { puzzleKey: PuzzleKey }) {
  const status = usePuzzle((s) => (s.run?.key === puzzleKey ? s.run.status : null))
  const paused = useGame((s) => s.settings.timersPaused)

  useFrame((_, dt) => {
    if (!paused) usePuzzle.getState().tick(Math.min(dt, 0.1))
  })

  useEffect(() => {
    const symbol = INTRO_SYMBOL[puzzleKey]
    if (symbol && (status === 'intro' || (puzzleKey === 'tutorial' && status === 'playing'))) {
      const t = setTimeout(() => showSymbol(symbol), 700)
      return () => clearTimeout(t)
    }
    if (status === 'solved' || status === 'timeout') {
      const t = setTimeout(() => {
        const run = usePuzzle.getState().run
        if (!run || run.key !== puzzleKey || useGame.getState().flow.phase !== puzzleKey) return
        const ev = run.evaluation
        reportPuzzleResult({
          solved: run.status === 'solved',
          secondsRemaining: Math.floor(run.timeLeft ?? 0),
          connectedPairs: ev.connected,
          totalPairs: ev.total,
          fullCoverage: ev.fullCoverage,
          cutsAndResets: run.cuts,
          gatesLit: ev.gatesLit,
        })
      }, 3000)
      return () => clearTimeout(t)
    }
  }, [status, puzzleKey])

  return null
}
