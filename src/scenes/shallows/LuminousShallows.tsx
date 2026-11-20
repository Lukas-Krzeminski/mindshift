import { Fragment, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import { CuboidCollider, CylinderCollider, Physics, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useGame, selectTotalScore } from '../../game/store'
import { scoreInsight, isRadiant } from '../../game/scoring'
import { QUALITY_PRESETS } from '../../quality/presets'
import { PlayerController, type CameraShot, type Updraft } from '../../player/PlayerController'
import { player } from '../../player/playerState'
import { showCaption, useCaptions } from '../../ui/captions'
import { showSymbol } from '../../ui/symbolStore'
import { useWorldHud } from '../../ui/worldHudStore'
import { fireFlash } from '../../ui/FlashOverlay'
import { ONE_POSSIBLE_EXPERIENCE, POSITIVE_THOUGHTS } from '../../content/captions'
import { audio } from '../../audio/AudioManager'
import { DawnSky, LightShafts } from './DawnSky'
import { LightWater, WATER_Y } from './LightWater'
import { Arches, Jellies, Reeds, type ArchDef } from './Flora'
import { TreeOfConnection, TreeReflection } from './TreeOfConnection'
import { GuideWisps, MemoryShard, type ShardId } from './MemoryShards'
import { Beacon, FloatingIsland, LightThread, MemoryBurst, Trees, UpdraftColumn, type IslandDef } from './Islands'
import { FOG_COLOR, SUN_DIR } from './sky'
import { usePostLook } from '../../fx/PostFX'

/** Warm the character + animation downloads while the player is still in the puzzles. */
export { preloadCharacters as preloadShallows } from '../../player/characterModel'

/**
 * The positive world: an endless, ankle-deep sea of liquid light at dawn, with magical islands
 * floating in the sky above it, pouring waterfalls of light into the sea. Three memories:
 *   1. on the water itself, a short walk from the start;
 *   2. on a floating island, reached by stepping into a column of light that shoots Alex up;
 *   3. on a higher floating island, reached only by a 5-jump parkour climb over floating stones.
 * Each memory threads a line of light to the Tree of Connection; with all three found, Alex walks
 * to the tree and it blooms (then the ending).
 */

const SPAWN: [number, number, number] = [0, 0.2, 34]
const TREE: [number, number, number] = [0, 0, -78]
const TREE_CROWN = new THREE.Vector3(TREE[0], 19, TREE[2])

/** Memory 1: on the sea, a little left of the start. */
const M1_POS: [number, number, number] = [-12, 1.5, 12]
/** Memory 2: floating island reached by the light column. */
const I2: IslandDef = { center: [24, 9, -6], radius: 6.5, fallAngle: Math.PI * 0.15, depth: 0.9, trees: 3 }
/** Memory 3: the high island at the top of the parkour. */
const I3: IslandDef = { center: [-15, 6.75, -46], radius: 6.5, fallAngle: Math.PI * 1.05, depth: 0.75, trees: 4 }

/** The column stands just outside I2's rim, on the side facing the first memory. */
const LIFT = (() => {
  const dx = M1_POS[0] - I2.center[0]
  const dz = M1_POS[2] - I2.center[2]
  const d = Math.hypot(dx, dz)
  return { x: I2.center[0] + (dx / d) * (I2.radius + 1.6), z: I2.center[2] + (dz / d) * (I2.radius + 1.6) }
})()
const UPDRAFTS: Updraft[] = [{ x: LIFT.x, z: LIFT.z, r: 1.7, top: I2.center[1], speed: 9 }]

/**
 * The parkour: four floating stones climbing toward I3 from the east, each 1/5 of the island's
 * height higher than the last (1.35 m: the jump clears ~1.85 m), zig-zagging a little. With the
 * last jump onto the island that is exactly five jumps from the water.
 */
const PARKOUR: IslandDef[] = (() => {
  const dir = new THREE.Vector2(1, 0.28).normalize() // from the island out toward the start of the climb
  const side = new THREE.Vector2(-dir.y, dir.x)
  const stoneR = 1.5
  const gap = 2.3
  return [4, 3, 2, 1].map((k) => {
    const along = I3.radius + gap + stoneR + (4 - k) * (2 * stoneR + gap)
    const zig = (k % 2 ? 1 : -1) * 1.1
    const x = I3.center[0] + dir.x * along + side.x * zig
    const z = I3.center[2] + dir.y * along + side.y * zig
    return { center: [x, (I3.center[1] / 5) * k, z] as [number, number, number], radius: stoneR * (0.95 + k * 0.02), fallAngle: k * 1.7, depth: 0.7, trees: 0 }
  })
})()
/** First stone of the climb (lowest), where the guide wisps point. */
const PARKOUR_START = PARKOUR[PARKOUR.length - 1]

/** Islands floating high in the sky, each pouring a waterfall of light into the sea. */
const SKY_ISLANDS: IslandDef[] = [
  { center: [-58, 26, -28], radius: 10, fallAngle: 0.3, depth: 1.5, trees: 4 },
  { center: [54, 32, -52], radius: 9, fallAngle: Math.PI * 0.9, depth: 1.6, trees: 3 },
  { center: [64, 21, 16], radius: 7, fallAngle: Math.PI * 1.2, depth: 1.4, trees: 2 },
  { center: [-48, 38, 22], radius: 8, fallAngle: -0.4, depth: 1.7, trees: 3 },
  { center: [26, 46, -122], radius: 13, fallAngle: Math.PI * 0.6, depth: 1.6, trees: 5 },
  { center: [-38, 30, -112], radius: 10, fallAngle: Math.PI * 0.4, depth: 1.5, trees: 3 },
]

interface Memory {
  id: ShardId
  thought: string
  palette: string[]
  /** Where the shard floats. */
  pos: [number, number, number]
  /** How close (horizontally) Alex must come, and the lowest height that counts. */
  reach: number
  minY: number
  island?: IslandDef
}

const MEMORIES: Memory[] = [
  { id: 'crayonSun', thought: POSITIVE_THOUGHTS.crayonSun, palette: ['#ffd23f', '#ff8f1f', '#ffe2a8'], pos: M1_POS, reach: 2.6, minY: -1 },
  { id: 'palette', thought: POSITIVE_THOUGHTS.palette, palette: ['#ff5c8a', '#4fe3ff', '#ffd23f', '#6bff9e'], pos: [I2.center[0], I2.center[1] + 1.7, I2.center[2]], reach: I2.radius * 0.9, minY: I2.center[1] - 0.6, island: I2 },
  { id: 'kite', thought: POSITIVE_THOUGHTS.kite, palette: ['#ff5c8a', '#ffd23f', '#4fe3ff'], pos: [I3.center[0], I3.center[1] + 1.7, I3.center[2]], reach: I3.radius * 0.9, minY: I3.center[1] - 0.6, island: I3 },
]
const SHARD_VECS = Object.fromEntries(MEMORIES.map((m) => [m.id, new THREE.Vector3(...m.pos)])) as Record<ShardId, THREE.Vector3>

/** Hints shown as each step begins. */
const HINTS = {
  start: "Follow the lights to Alex's memories.",
  lift: 'Step into the column of light.',
  parkour: 'Jump across the floating stones. Hold SPACE in the air to glide.',
  tree: 'Follow the threads to the Tree of Connection.',
}

const ARCHES: ArchDef[] = [
  { pos: [0, 22], radius: 9, tube: 0.75, rotY: 0 },
  { pos: [-3, -20], radius: 12, tube: 1.0, rotY: 0.3 },
  { pos: [2, -62], radius: 18, tube: 1.4, rotY: 0.08 },
  { pos: [-72, -38], radius: 42, tube: 3.2, rotY: 1.1 },
  { pos: [80, -12], radius: 34, tube: 2.6, rotY: -0.9 },
  { pos: [36, -150], radius: 58, tube: 4.2, rotY: 0.2 },
  { pos: [-95, 45], radius: 30, tube: 2.3, rotY: 0.7, tilt: 0.12 },
  { pos: [100, 70], radius: 46, tube: 3.4, rotY: -0.4 },
]

// reeds on the sea (kept clear of the memory spot, the light column and the climb)
const REED_CLUSTERS: [number, number, number][] = [
  [-9, 24, 3], [9, 22, 3], [-4, 18, 2.5], [10, 4, 4], [-20, 2, 3.5], [6, -28, 3], [-24, -26, 4],
  [-2, -36, 3], [-30, -58, 3.5], [14, -56, 3], [-20, -70, 5], [18, -70, 5], [-8, -92, 4], [10, -94, 4],
  [30, 14, 4], [-30, 18, 4.5], [36, -36, 5], [-34, -10, 4], [26, -66, 4], [-26, 34, 5], [28, 34, 5],
]

/** Parkour physics for this world: lighter, faster, springier. */
const PHYSICS = { gravity: 14, jumpSpeed: 7.2, speedScale: 1.35, featherFall: 2.6 }

export function LuminousShallows() {
  const quality = useGame((s) => s.settings.quality)
  const preset = QUALITY_PRESETS[quality]
  const bonus = useGame((s) => s.flow.bonusRun)
  const radiant = useGame((s) => isRadiant(selectTotalScore(s)))
  const [found, setFound] = useState<ShardId[]>([])
  const bloom = useRef(0)
  const threadBoost = useRef(0)
  const frozen = useRef(false)
  const shot = useRef<CameraShot | null>(null)
  const target = useRef<THREE.Vector3 | null>(new THREE.Vector3(M1_POS[0], 0, M1_POS[2]))

  usePostLook({ bloomThreshold: 1.0, bloomIntensity: 1.1, bloomRadius: 0.8, vignette: 0.55, toneMapping: 'aces', contrast: 0.14, saturation: 0.22, brightness: -0.03 })
  const setHud = useWorldHud((s) => s.set)
  useEffect(() => {
    setHud({ title: 'Luminous Shallows', goal: "Find Alex's memories · 0/3", sub: ONE_POSSIBLE_EXPERIENCE, breath: null })
    const intro = window.setTimeout(() => showSymbol('shallows'), 1500)
    const tip = window.setTimeout(() => showCaption(HINTS.start, { speaker: 'narrator', hold: 3.5 }), 3600)
    return () => {
      window.clearTimeout(intro)
      window.clearTimeout(tip)
      useWorldHud.getState().reset()
      useCaptions.getState().clear()
    }
  }, [setHud])

  const solid = [I2, I3, ...PARKOUR]
  return (
    <>
      <color attach="background" args={[FOG_COLOR]} />
      <fog attach="fog" args={[FOG_COLOR, 80, 420]} />
      <DawnSky />
      <hemisphereLight args={['#ffd9e6', '#5fe0d0', 0.9]} />
      <directionalLight position={SUN_DIR.clone().multiplyScalar(80).toArray()} intensity={1.6} color="#ffd2a8" />
      <LightShafts positions={[[-30, 60, -40], [22, 60, -10], [-8, 60, -100], [40, 60, -70]]} />

      <Physics gravity={[0, -PHYSICS.gravity, 0]} timeStep="vary">
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[300, 0.5, 300]} position={[0, -0.5, -20]} />
          <CylinderCollider args={[6, 1.7]} position={[TREE[0], 6, TREE[2]]} />
          {solid.map((isl, i) => {
            const depth = isl.radius * (isl.depth ?? 1)
            return (
              <Fragment key={i}>
                {/* the walkable top, and the upper rock body (so a short jump hits stone, not air) */}
                <CylinderCollider args={[0.5, isl.radius]} position={[isl.center[0], isl.center[1] - 0.5, isl.center[2]]} />
                <CylinderCollider args={[depth * 0.2, isl.radius * 0.82]} position={[isl.center[0], isl.center[1] - 1 - depth * 0.2, isl.center[2]]} />
              </Fragment>
            )
          })}
        </RigidBody>
        <Arches arches={ARCHES} />
        <PlayerController
          spawn={SPAWN}
          yaw={0}
          look="positive"
          feather
          physics={PHYSICS}
          bounds={[0, -25, 135]}
          introFrom={[8, 9, 50]}
          introSeconds={2.8}
          updrafts={UPDRAFTS}
          frozen={frozen}
          cameraShot={shot}
        />
      </Physics>

      <LightWater />
      {/* mirrored world under the translucent water = reflections */}
      <group position={[0, WATER_Y * 2, 0]} scale={[1, -1, 1]}>
        <Arches arches={ARCHES} colliders={false} />
        <TreeReflection position={TREE} />
      </group>

      <Reeds clusters={REED_CLUSTERS} perCluster={Math.max(12, Math.round(70 * preset.particleScale))} />
      <Jellies count={Math.max(8, Math.round(18 * Math.sqrt(preset.particleScale)))} />
      <TreeOfConnection position={TREE} bloom={bloom} radiant={radiant} />

      {SKY_ISLANDS.map((isl, i) => (
        <SkyIsland key={`sky${i}`} def={isl} />
      ))}
      <FloatingIsland def={I2} found={found.includes('palette')} fallTo={WATER_Y} />
      <FloatingIsland def={I3} found={found.includes('kite')} fallTo={WATER_Y} />
      {PARKOUR.map((st, i) => (
        <FloatingIsland key={`p${i}`} def={st} fall={false} />
      ))}
      <Trees islands={[I2, I3, ...SKY_ISLANDS]} />
      <UpdraftColumn x={LIFT.x} z={LIFT.z} top={I2.center[1]} r={1.7} dim={found.includes('palette')} />

      {MEMORIES.map((m) => {
        const isFound = found.includes(m.id)
        const base = m.island ? m.island.center[1] : WATER_Y
        return (
          <group key={m.id}>
            <Beacon position={[m.pos[0], base + 1, m.pos[2]]} visible={!isFound} />
            <MemoryShard id={m.id} position={m.pos} found={isFound} />
            {isFound && <MemoryBurst origin={m.pos} top={base} palette={m.palette} />}
            {isFound && <LightThread from={SHARD_VECS[m.id]} to={TREE_CROWN} boost={threadBoost} />}
          </group>
        )
      })}
      <GuideWisps target={target} />
      <Sparkles count={Math.round(500 * preset.particleScale)} scale={[160, 30, 200]} position={[0, 12, -25]} size={5} speed={0.2} opacity={0.75} color="#fff0d8" />
      <Sparkles count={Math.round(260 * preset.particleScale)} scale={[160, 10, 200]} position={[0, 2, -25]} size={4} speed={0.3} opacity={0.7} color="#a6fff0" />

      <ShallowsDirector bonus={bonus} setFound={setFound} refs={{ bloom, threadBoost, frozen, shot, target }} />
    </>
  )
}

/** A high sky island whose waterfall of light splashes into the sea below. */
function SkyIsland({ def }: { def: IslandDef }) {
  const fx = Math.cos(def.fallAngle)
  const fz = Math.sin(def.fallAngle)
  const r = def.radius * 1.03 + 0.6
  return (
    <>
      <FloatingIsland def={def} fallTo={WATER_Y} />
      <Sparkles count={40} scale={[6, 2.5, 6]} position={[def.center[0] + fx * r, WATER_Y + 1, def.center[2] + fz * r]} size={7} speed={0.8} color="#ffffff" opacity={0.8} />
    </>
  )
}

interface ShallowsRefs {
  bloom: RefObject<number>
  threadBoost: RefObject<number>
  frozen: RefObject<boolean>
  shot: RefObject<CameraShot | null>
  target: RefObject<THREE.Vector3 | null>
}

/** Final moment length (seconds): the tree blossoms and every thread flares into it. */
const FINALE = 7

function ShallowsDirector({ bonus, setFound, refs }: { bonus: boolean; setFound: (f: ShardId[]) => void; refs: ShallowsRefs }) {
  const paused = useGame((s) => s.settings.timersPaused)
  const st = useRef({ elapsed: 0, finaleAt: -1, done: false, found: [] as ShardId[], hint: '', hintAt: -1 })
  const limit = bonus ? 95 : 170
  const shot = useMemo<CameraShot>(() => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), weight: 0 }), [])
  const from = useMemo(() => new THREE.Vector3(), [])
  const camera = useThree((s) => s.camera)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const s = st.current
    if (!paused) s.elapsed += dt
    const hud = useWorldHud.getState()
    const p = player.position

    // reaching a memory (in order: each one opens the way to the next)
    const next = MEMORIES.find((m) => !s.found.includes(m.id))
    if (next && player.active && s.finaleAt < 0) {
      if (Math.hypot(p.x - next.pos[0], p.z - next.pos[2]) < next.reach && p.y > next.minY) {
        s.found = [...s.found, next.id]
        setFound(s.found)
        showCaption(next.thought, { speaker: 'alex', hold: 5 })
        showSymbol('memories')
        audio.chime([659.25, 987.77, 1318.5], 2.4)
        audio.chime([329.63, 493.88], 3)
        if (!bonus) useGame.getState().addScore(scoreInsight('memoryShard'))
        const n = s.found.length
        hud.set({ goal: n < 3 ? `Find Alex's memories · ${n}/3` : 'Follow the threads to the Tree of Connection' })
        // the next step's hint follows once her thought has been read (on this world's clock, so
        // it can never fire after the world has ended)
        s.hint = n === 1 ? HINTS.lift : n === 2 ? HINTS.parkour : HINTS.tree
        s.hintAt = s.elapsed + 5.6
      }
    }
    if (s.hintAt >= 0 && s.elapsed >= s.hintAt && s.finaleAt < 0) {
      s.hintAt = -1
      showCaption(s.hint, { speaker: 'narrator', hold: 3.5 })
    }
    if (s.finaleAt < 0) refs.bloom.current = THREE.MathUtils.lerp(refs.bloom.current ?? 0, s.found.length * 0.12, Math.min(1, dt))

    // guide wisps: the next memory (or the way up to it), then the tree
    const upcoming = MEMORIES.find((m) => !s.found.includes(m.id))
    if (s.finaleAt >= 0) refs.target.current = null
    else if (!upcoming) refs.target.current = new THREE.Vector3(TREE[0], 0, TREE[2])
    else if (upcoming.id === 'palette' && p.y < I2.center[1] - 1) refs.target.current = new THREE.Vector3(LIFT.x, 0, LIFT.z)
    else if (upcoming.id === 'kite' && p.y < PARKOUR_START.center[1] - 0.2) refs.target.current = new THREE.Vector3(PARKOUR_START.center[0], 0, PARKOUR_START.center[2])
    else refs.target.current = new THREE.Vector3(upcoming.pos[0], 0, upcoming.pos[2])

    // final moment: all memories connected and Alex reaches the tree (or the time safety net)
    const nearTree = Math.hypot(p.x - TREE[0], p.z - TREE[2]) < 16
    if (s.finaleAt < 0 && player.active && ((s.found.length === MEMORIES.length && nearTree) || s.elapsed > limit)) {
      s.finaleAt = s.elapsed
      refs.frozen.current = true
      from.copy(camera.position)
      refs.shot.current = shot
      showCaption(POSITIVE_THOUGHTS.tree, { speaker: 'alex', hold: 5 })
      showSymbol('tree')
      audio.resolveChord()
      audio.chime([261.63, 392, 523.25, 783.99], 5)
      hud.set({ goal: '' })
    }
    if (s.finaleAt >= 0) {
      const t = s.elapsed - s.finaleAt
      const f = Math.min(1, t / FINALE)
      const e = f * f * (3 - 2 * f)
      refs.bloom.current = Math.min(1, (refs.bloom.current ?? 0) + dt * 0.35)
      refs.threadBoost.current = Math.min(1, f * 2.5)
      // crane up and back from the tree to see every thread meet in its crown
      shot.weight = THREE.MathUtils.clamp(t / 1.5, 0, 1)
      shot.pos.copy(from).lerp(new THREE.Vector3(TREE[0] + 10, 24, TREE[2] + 62), e)
      shot.look.set(TREE[0], THREE.MathUtils.lerp(10, 17, e), TREE[2])
      if (!s.done && t > FINALE - 0.5 && t - dt <= FINALE - 0.5) fireFlash()
      if (!s.done && f >= 1) {
        s.done = true
        useGame.getState().dispatch({ type: 'WORLD_COMPLETE' })
      }
    }
  })
  return null
}
