import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useGame } from '../../game/store'
import { scoreInsight } from '../../game/scoring'
import { PlayerController, type CameraShot } from '../../player/PlayerController'
import { player } from '../../player/playerState'
import { keyDown } from '../../player/input'
import { showCaption, useCaptions } from '../../ui/captions'
import { showSymbol } from '../../ui/symbolStore'
import { useWorldHud } from '../../ui/worldHudStore'
import { fireFlash } from '../../ui/FlashOverlay'
import { CHALLENGING_RESOLUTION, CHALLENGING_SELF, CHALLENGING_THOUGHTS, ONE_POSSIBLE_EXPERIENCE } from '../../content/captions'
import { usePostLook } from '../../fx/PostFX'
import { mazeFxState } from '../../fx/MazeEffect'
import { audio } from '../../audio/AudioManager'
import { mulberry32 } from '../../lib/random'
import { buildMaze, type FaceSpot, type MazeLayout } from './mazeLayout'
import { WallFaces } from './WallFaces'
import { makeConcreteMaterial, makeKaleidoMaterial, makeMazeUniforms, makeOvercastMaterial, makeStripMaterial, type MazeUniforms } from './mazeMaterials'

/**
 * The challenging world: a dark stone labyrinth under a blood moon. No map, no guide; faces push
 * out of the walls and shadow figures watch from the ends of corridors. The exit leads into a
 * closed room with a single beam of light: Alex steps into it and breathes (Hold SPACE, three
 * times) until the light floods everything, and the ending begins.
 */

const MAZE = buildMaze()
const START = MAZE.center(...MAZE.start)
const SPAWN: [number, number, number] = [START[0], 0.1, START[1] + 0.6]
const EXIT_X = MAZE.center(...MAZE.exit)[0]
const ROOM = { w: 16, d: 16, h: 20 }
const ROOM_Z0 = MAZE.exitZ - 0.9 // front wall of the room, just behind the maze's last wall
const BEAM: [number, number] = [EXIT_X, ROOM_Z0 - ROOM.d / 2]
const BREATHS = 3

/** Room walls (front wall has a gap where the maze exit opens into it). */
const ROOM_WALLS: { x: number; z: number; sx: number; sz: number }[] = (() => {
  const gap = MAZE.cell / 2
  const left = EXIT_X - ROOM.w / 2
  const right = EXIT_X + ROOM.w / 2
  const t = MAZE.wall
  return [
    { x: (left + EXIT_X - gap) / 2, z: ROOM_Z0, sx: EXIT_X - gap - left, sz: t },
    { x: (EXIT_X + gap + right) / 2, z: ROOM_Z0, sx: right - EXIT_X - gap, sz: t },
    { x: left, z: ROOM_Z0 - ROOM.d / 2, sx: t, sz: ROOM.d },
    { x: right, z: ROOM_Z0 - ROOM.d / 2, sx: t, sz: ROOM.d },
    { x: EXIT_X, z: ROOM_Z0 - ROOM.d, sx: ROOM.w + t, sz: t },
  ]
})()

/** Faces in the room's walls too: they sink back as she breathes. */
const ROOM_FACES: FaceSpot[] = [
  { x: EXIT_X - ROOM.w / 2 + 0.42, y: 2.4, z: BEAM[1] + 3, nx: 1, nz: 0, size: 2.0 },
  { x: EXIT_X - ROOM.w / 2 + 0.42, y: 5.2, z: BEAM[1] - 3.5, nx: 1, nz: 0, size: 3.6 },
  { x: EXIT_X + ROOM.w / 2 - 0.42, y: 2.6, z: BEAM[1] - 2, nx: -1, nz: 0, size: 2.2 },
  { x: EXIT_X + ROOM.w / 2 - 0.42, y: 5.0, z: BEAM[1] + 4, nx: -1, nz: 0, size: 3.2 },
  { x: EXIT_X - 3.5, y: 2.5, z: ROOM_Z0 - ROOM.d + 0.42, nx: 0, nz: 1, size: 2.1 },
  { x: EXIT_X + 3.2, y: 5.4, z: ROOM_Z0 - ROOM.d + 0.42, nx: 0, nz: 1, size: 3.8 },
]
const FACES = [...MAZE.faces, ...ROOM_FACES]
const ROOM_FACE_START = MAZE.faces.length

type Stage = 'maze' | 'room' | 'breathe' | 'release'

export function BrutalistMaze() {
  const uniforms = useMemo(makeMazeUniforms, [])
  const intensity = useGame((s) => s.settings.intensity)
  const bonus = useGame((s) => s.flow.bonusRun)
  const [wallsDown, setWallsDown] = useState(false)
  const heaviness = useRef(1)
  const calm = useRef(0)
  const frozen = useRef(false)
  const avatarScale = useRef(1)
  const shake = useRef(0)
  const sink = useRef(0)
  const beam = useRef({ size: 0.35, flood: 0 })
  const facePush = useRef(new Float32Array(FACES.length))
  const figures = useRef([{ x: 0, z: 0, yaw: 0, alpha: 0 }, { x: 0, z: 0, yaw: 0, alpha: 0 }])
  const shot = useRef<CameraShot | null>(null)

  usePostLook({ bloomThreshold: 0.75, bloomIntensity: 1.05, bloomRadius: 0.7, vignette: 0.9, toneMapping: 'aces', contrast: 0.16, saturation: 0.12 })

  const setHud = useWorldHud((s) => s.set)
  useEffect(() => {
    setHud({ title: 'The Labyrinth', goal: 'Find a way out', sub: ONE_POSSIBLE_EXPERIENCE, breath: null })
    const intro = window.setTimeout(() => showSymbol('maze'), 1200)
    return () => {
      window.clearTimeout(intro)
      mazeFxState.amount = 0
      audio.setHeartRate(0)
      useWorldHud.getState().reset()
      useCaptions.getState().clear()
    }
  }, [setHud])

  // rehearsal/testing aid (?debug=1 only): the layout, so dev tooling can walk the route
  useEffect(() => {
    if (useGame.getState().debug) (window as unknown as { __mazeLayout?: MazeLayout }).__mazeLayout = MAZE
  }, [])

  const scene = useThree((s) => s.scene)
  useEffect(() => {
    scene.fog = new THREE.Fog('#1d0807', 8, 60)
    scene.background = new THREE.Color('#140404')
    return () => {
      scene.fog = null
    }
  }, [scene])

  return (
    <>
      <BloodSky uniforms={uniforms} />
      <ambientLight intensity={0.35} color="#ff8070" />
      <Physics gravity={[0, -22, 0]} timeStep="vary">
        <RigidBody type="fixed" colliders={false} key={wallsDown ? 'walls-down' : 'walls-up'}>
          <CuboidCollider args={[200, 0.5, 300]} position={[0, -0.5, -120]} />
          {!wallsDown &&
            MAZE.walls.map((w, i) => (
              <CuboidCollider
                key={i}
                args={w.alongX ? [(MAZE.cell + MAZE.wall) / 2, w.height / 2, MAZE.wall / 2] : [MAZE.wall / 2, w.height / 2, (MAZE.cell + MAZE.wall) / 2]}
                position={[w.x, w.height / 2, w.z]}
              />
            ))}
          {ROOM_WALLS.map((w, i) => (
            <CuboidCollider key={`room-${i}`} args={[w.sx / 2, ROOM.h / 2, w.sz / 2]} position={[w.x, ROOM.h / 2, w.z]} />
          ))}
        </RigidBody>
        <PlayerController
          spawn={SPAWN}
          yaw={0}
          look="challenging"
          heaviness={heaviness}
          calm={calm}
          frozen={frozen}
          avatarScale={avatarScale}
          shake={shake}
          cameraShot={shot}
          trail={intensity === 'full' ? '#ff2e2e' : null}
          introFrom={[SPAWN[0] + 2, 16, SPAWN[2] + 12]}
          introSeconds={2.6}
          bounds={[0, -30, 90]}
        />
      </Physics>
      <Labyrinth uniforms={uniforms} maze={MAZE} sink={sink} />
      <Room uniforms={uniforms} />
      <WallFaces uniforms={uniforms} faces={FACES} push={facePush} />
      <ShadowFigures figures={figures} />
      <LightBeam beam={beam} />
      <Skyline uniforms={uniforms} />
      <Sparkles count={320} scale={[50, 26, 70]} position={[0, 10, -22]} size={3} speed={0.35} opacity={0.55} color="#ff6a4a" />
      <MazeDirector
        uniforms={uniforms}
        bonus={bonus}
        reduced={intensity === 'reduced'}
        setWallsDown={setWallsDown}
        refs={{ heaviness, calm, frozen, avatarScale, shake, sink, beam, facePush, figures, shot }}
      />
    </>
  )
}

function BloodSky({ uniforms }: { uniforms: MazeUniforms }) {
  const material = useMemo(() => makeOvercastMaterial(uniforms), [uniforms])
  return (
    <mesh material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[650, 48, 24]} />
    </mesh>
  )
}

/** The labyrinth walls, red lamps on some of them, kaleidoscope panels at dead ends. */
function Labyrinth({ uniforms, maze, sink }: { uniforms: MazeUniforms; maze: MazeLayout; sink: RefObject<number> }) {
  const stone = useMemo(() => makeConcreteMaterial(uniforms, true), [uniforms])
  const floorMat = useMemo(() => makeConcreteMaterial(uniforms, false), [uniforms])
  const lamp = useMemo(() => makeStripMaterial(uniforms), [uniforms])
  const kaleido = useMemo(() => makeKaleidoMaterial(uniforms), [uniforms])
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1, 4, 14, 4), [])
  const walls = useRef<THREE.InstancedMesh>(null)
  const lamps = useRef<THREE.InstancedMesh>(null)
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3() }), [])
  const lastSink = useRef(-1)
  const lampWalls = useMemo(() => maze.walls.filter((_, i) => i % 3 === 0), [maze])

  const writeWalls = (k: number) => {
    const mesh = walls.current
    if (!mesh) return
    maze.walls.forEach((w, i) => {
      const len = maze.cell + maze.wall
      tmp.p.set(w.x, w.height / 2 - k * (w.height + 1), w.z)
      tmp.s.set(w.alongX ? len : maze.wall, w.height, w.alongX ? maze.wall : len)
      tmp.m.compose(tmp.p, tmp.q.identity(), tmp.s)
      mesh.setMatrixAt(i, tmp.m)
    })
    mesh.instanceMatrix.needsUpdate = true
  }

  useEffect(() => {
    writeWalls(0)
    const st = lamps.current
    if (st) {
      let i = 0
      for (const w of lampWalls) {
        for (const side of [-1, 1]) {
          const off = (maze.wall / 2 + 0.03) * side
          tmp.p.set(w.x + (w.alongX ? 0 : off), 2.5, w.z + (w.alongX ? off : 0))
          tmp.s.set(w.alongX ? 0.5 : 0.06, 0.18, w.alongX ? 0.06 : 0.5)
          tmp.m.compose(tmp.p, tmp.q.identity(), tmp.s)
          st.setMatrixAt(i++, tmp.m)
        }
      }
      st.instanceMatrix.needsUpdate = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maze])

  useFrame(() => {
    const k = sink.current ?? 0
    if (Math.abs(k - lastSink.current) > 1e-4) {
      writeWalls(k)
      if (lamps.current) lamps.current.visible = k < 0.05
      lastSink.current = k
    }
  })

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -120]} material={floorMat}>
        <planeGeometry args={[400, 600, 1, 1]} />
      </mesh>
      <instancedMesh ref={walls} args={[box, stone, maze.walls.length]} frustumCulled={false} />
      <instancedMesh ref={lamps} args={[box, lamp, lampWalls.length * 2]} frustumCulled={false} />
      {maze.deadEnds.map((d) => {
        const [cx, cz] = maze.center(d.c, d.r)
        const off = maze.cell / 2 - maze.wall / 2 - 0.04
        return (
          <mesh key={`${d.c}-${d.r}`} position={[cx - d.nx * off, 4.2, cz - d.nz * off]} rotation={[0, Math.atan2(d.nx, d.nz), 0]} material={kaleido}>
            <planeGeometry args={[maze.cell * 0.8, 6.5]} />
          </mesh>
        )
      })}
    </>
  )
}

/** The closed stone room beyond the exit. */
function Room({ uniforms }: { uniforms: MazeUniforms }) {
  const stone = useMemo(() => makeConcreteMaterial(uniforms, true), [uniforms])
  return (
    <>
      {ROOM_WALLS.map((w, i) => (
        <mesh key={i} position={[w.x, ROOM.h / 2, w.z]} material={stone}>
          <boxGeometry args={[w.sx, ROOM.h, w.sz, 6, 16, 6]} />
        </mesh>
      ))}
    </>
  )
}

/** Tall shadows that stand at the far end of a corridor, watching; they fade when approached. */
function ShadowFigures({ figures }: { figures: RefObject<{ x: number; z: number; yaw: number; alpha: number }[]> }) {
  const mats = useMemo(
    () =>
      [0, 1].map(
        () =>
          new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            uniforms: { uA: { value: 0 } },
            vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; vN = normalMatrix * normal; gl_Position = projectionMatrix * mv; }`,
            fragmentShader: /* glsl */ `
              uniform float uA; varying vec3 vN; varying vec3 vV;
              void main(){
                float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
                gl_FragColor = vec4(vec3(0.01, 0.0, 0.0) + vec3(0.25, 0.02, 0.02) * fres, uA * (0.88 - fres * 0.5));
              }`,
          }),
      ),
    [],
  )
  const eyes = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a1a').multiplyScalar(2.5), transparent: true, toneMapped: false }), [])
  const groups = useRef<(THREE.Group | null)[]>([])
  useFrame(() => {
    const list = figures.current
    if (!list) return
    list.forEach((f, i) => {
      const g = groups.current[i]
      if (!g) return
      g.visible = f.alpha > 0.01
      g.position.set(f.x, 0, f.z)
      g.rotation.y = f.yaw
      mats[i].uniforms.uA.value = f.alpha
    })
    eyes.opacity = Math.max(...list.map((f) => f.alpha)) * 0.9
  })
  return (
    <>
      {[0, 1].map((i) => (
        <group key={i} ref={(g) => { groups.current[i] = g }} visible={false}>
          <mesh material={mats[i]} position={[0, 1.15, 0]} scale={[0.42, 1.25, 0.3]}>
            <capsuleGeometry args={[0.5, 1.0, 6, 14]} />
          </mesh>
          <mesh material={mats[i]} position={[0, 2.35, 0]} scale={[0.26, 0.32, 0.26]}>
            <sphereGeometry args={[1, 16, 12]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} material={eyes} position={[s * 0.085, 2.38, 0.24]}>
              <sphereGeometry args={[0.028, 8, 6]} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  )
}

/** The single beam of light in the middle of the room; it widens with each breath, then floods. */
function LightBeam({ beam }: { beam: RefObject<{ size: number; flood: number }> }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
        uniforms: { uTime: { value: 0 }, uI: { value: 0.5 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uI; varying vec2 vUv;
          void main(){
            float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
            float motes = 0.85 + 0.15 * sin(vUv.y * 40.0 + uTime * 0.8 + vUv.x * 9.0);
            vec3 col = vec3(1.0, 0.9, 0.72) * (0.35 + 0.65 * edge) * motes * uI * (0.55 + 0.45 * vUv.y);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    [],
  )
  const disc = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff1d0').multiplyScalar(1.6), transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }), [])
  const floodMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4dc').multiplyScalar(2), transparent: true, opacity: 0, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, fog: false }), [])
  const column = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const flood = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  useFrame((s) => {
    const b = beam.current
    if (!b) return
    mat.uniforms.uTime.value = s.clock.elapsedTime
    mat.uniforms.uI.value = 0.55 + b.size * 0.6 + b.flood * 2
    const r = 0.9 + b.size * 2.4 + b.flood * 8
    column.current?.scale.set(r, 1, r)
    ring.current?.scale.setScalar(r)
    disc.opacity = 0.45 + 0.25 * Math.sin(s.clock.elapsedTime * 1.2)
    if (flood.current) flood.current.scale.setScalar(0.5 + b.flood * 40)
    floodMat.opacity = b.flood * 0.85
    if (light.current) light.current.intensity = 18 + b.size * 30 + b.flood * 120
  })
  return (
    <group position={[BEAM[0], 0, BEAM[1]]}>
      <mesh ref={column} position={[0, 40, 0]} material={mat}>
        <cylinderGeometry args={[1, 1, 80, 40, 1, true]} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} material={disc}>
        <circleGeometry args={[1, 48]} />
      </mesh>
      <mesh ref={flood} position={[0, 1.4, 0]} material={floodMat}>
        <sphereGeometry args={[1, 32, 16]} />
      </mesh>
      <pointLight ref={light} position={[0, 4, 0]} intensity={20} distance={30} color="#ffe2b8" />
      <Sparkles count={70} scale={[3, 16, 3]} position={[0, 8, 0]} size={4} speed={0.3} color="#fff1d6" opacity={0.85} />
    </group>
  )
}

/** Black spires and inverted stairs against the red sky. */
function Skyline({ uniforms }: { uniforms: MazeUniforms }) {
  const stone = useMemo(() => makeConcreteMaterial(uniforms, false), [uniforms])
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1, 2, 10, 2), [])
  const data = useMemo(() => {
    const rand = mulberry32(31)
    const out: THREE.Matrix4[] = []
    for (let i = 0; i < 90; i++) {
      const a = rand() * Math.PI * 2
      const r = 70 + rand() * 160
      const x = Math.cos(a) * r
      const z = -30 + Math.sin(a) * r
      const h = 30 + rand() * 110
      const w = 5 + rand() * 14
      const tilt = (rand() - 0.5) * 0.2
      out.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h / 2 - 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, rand() * 0.8, tilt * 0.6)), new THREE.Vector3(w, h, 3 + rand() * 10)))
    }
    for (let s = 0; s < 6; s++) {
      const x = (s % 2 ? 1 : -1) * (60 + s * 12)
      const z = -10 - s * 30
      for (let k = 0; k < 12; k++) out.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 70 - k * 2.2, z + k * 1.6), new THREE.Quaternion(), new THREE.Vector3(8, 1, 1.6)))
    }
    return out
  }, [])
  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    data.forEach((m, i) => ref.current?.setMatrixAt(i, m))
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true
  }, [data])
  return <instancedMesh ref={ref} args={[box, stone, data.length]} frustumCulled={false} />
}

interface DirectorRefs {
  heaviness: RefObject<number>
  calm: RefObject<number>
  frozen: RefObject<boolean>
  avatarScale: RefObject<number>
  shake: RefObject<number>
  sink: RefObject<number>
  beam: RefObject<{ size: number; flood: number }>
  facePush: RefObject<Float32Array>
  figures: RefObject<{ x: number; z: number; yaw: number; alpha: number }[]>
  shot: RefObject<CameraShot | null>
}

const RELEASE = 7.5

function MazeDirector({
  uniforms,
  bonus,
  reduced,
  setWallsDown,
  refs,
}: {
  uniforms: MazeUniforms
  bonus: boolean
  reduced: boolean
  setWallsDown: (v: boolean) => void
  refs: DirectorRefs
}) {
  const paused = useGame((s) => s.settings.timersPaused)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const st = useRef({
    t: 0,
    stage: 'maze' as Stage,
    stageT: 0,
    thought: 0,
    lastThought: -9,
    kick: 0,
    sinking: false,
    breaths: 0,
    phase: 'in' as 'in' | 'out',
    prog: 0,
    outT: 0,
    idle: 0,
    done: false,
    nextFigure: 9,
    figureT: 0,
  })
  const shot = useMemo<CameraShot>(() => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), weight: 0 }), [])
  // the route takes ~1.5-2 min at a first-timer's pace; the walls only give way well after that
  const mazeLimit = bonus ? 75 : 150
  const totalLimit = bonus ? 130 : 220
  const maxAg = reduced ? 0.5 : 1

  const cellOf = (x: number, z: number): [number, number] => [
    THREE.MathUtils.clamp(Math.round(x / MAZE.cell + (MAZE.cols - 1) / 2), 0, MAZE.cols - 1),
    THREE.MathUtils.clamp(Math.round(-z / MAZE.cell), 0, MAZE.rows - 1),
  ]

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const s = st.current
    if (!paused) {
      s.t += dt
      s.stageT += dt
    }
    const hud = useWorldHud.getState()
    const to = (stage: Stage) => {
      s.stage = stage
      s.stageT = 0
    }
    const startBreathing = () => {
      to('breathe')
      refs.frozen.current = true
      showCaption(CHALLENGING_SELF.breathe, { speaker: 'alex', hold: 4 })
      showSymbol('mazeBreath')
      hud.set({ goal: `Breathe · 0/${BREATHS}` })
      audio.chime([392, 523.25], 2)
      if (!bonus) useGame.getState().addScore(scoreInsight('monolithReached'))
    }
    const release = () => {
      to('release')
      refs.frozen.current = true
      shot.pos.copy(camera.position)
      refs.shot.current = shot
      hud.set({ breath: null, goal: '' })
      if (!bonus) useGame.getState().addScore(scoreInsight('breathCompleted'))
      showCaption(CHALLENGING_RESOLUTION.alex, { speaker: 'alex', hold: 5, sub: CHALLENGING_RESOLUTION.tag })
      audio.setHeartRate(0)
      audio.resolveChord()
    }

    // ---------------- stages
    if (s.stage === 'maze') {
      uniforms.uAgitation.value = THREE.MathUtils.lerp(uniforms.uAgitation.value, maxAg, dt)
      refs.heaviness.current = 1
      refs.calm.current = 0
      refs.avatarScale.current = 1 + Math.sin(s.t * 0.9) * (reduced ? 0.05 : 0.12)
      if (s.t > 3) audio.setHeartRate(reduced ? 92 : 116)
      if (s.t > mazeLimit && !s.sinking) {
        // safety net: the walls sink away so the class is never stuck
        s.sinking = true
        setWallsDown(true)
        showCaption('The walls give way.', { speaker: 'narrator', hold: 3 })
      }
      if (player.position.z < MAZE.exitZ - 1.6) {
        to('room')
        hud.set({ goal: 'Step into the light' })
        showCaption(CHALLENGING_SELF.toward, { speaker: 'alex', hold: 4.5 })
        showSymbol('beam')
        audio.chime([293.66, 440], 2.4)
      }
    } else if (s.stage === 'room') {
      uniforms.uAgitation.value = THREE.MathUtils.lerp(uniforms.uAgitation.value, maxAg * 0.85, dt)
      const inBeam = Math.hypot(player.position.x - BEAM[0], player.position.z - BEAM[1]) < 1.6
      if (inBeam || s.stageT > 25) startBreathing()
    } else if (s.stage === 'breathe') {
      const holding = keyDown('Space')
      if (s.phase === 'in') {
        s.idle = holding ? 0 : s.idle + dt
        const assist = s.idle > 9 // nobody pressed Space: breathe for them
        if (holding || assist) s.prog = Math.min(1, s.prog + dt / 3.5)
        else s.prog = Math.max(0, s.prog - dt * 0.35)
        const e = s.prog * s.prog * (3 - 2 * s.prog)
        hud.set({ breath: { scale: 0.55 + 0.45 * e, label: holding ? 'Breathe in…' : 'Hold SPACE to breathe in', hint: `Breath ${s.breaths + 1} of ${BREATHS}`, center: true, active: holding || assist } })
        if (s.prog >= 1) {
          s.phase = 'out'
          s.outT = 0
        }
      } else {
        s.outT += dt
        const k = Math.min(1, s.outT / 4.5)
        hud.set({ breath: { scale: 1 - 0.45 * Math.sin((k * Math.PI) / 2), label: 'Let go… breathe out', hint: `Breath ${s.breaths + 1} of ${BREATHS}`, center: true } })
        if (k >= 1) {
          s.breaths++
          s.phase = 'in'
          s.prog = 0
          s.idle = 0
          audio.chime([392 + s.breaths * 98, 587.33], 1.6)
          audio.setHeartRate(s.breaths >= BREATHS ? 0 : Math.round(THREE.MathUtils.lerp(116, 72, s.breaths / BREATHS)))
          hud.set({ goal: `Breathe · ${s.breaths}/${BREATHS}` })
          if (s.breaths >= BREATHS) release()
        }
      }
      // each breath calms the world and widens the light
      const calmK = (s.breaths + (s.phase === 'out' ? Math.min(1, s.outT / 4.5) : 0)) / BREATHS
      uniforms.uAgitation.value = THREE.MathUtils.lerp(uniforms.uAgitation.value, THREE.MathUtils.lerp(maxAg, 0.15, calmK), dt * 1.5)
      refs.heaviness.current = 1 - calmK
      refs.calm.current = calmK
      refs.avatarScale.current = THREE.MathUtils.lerp(refs.avatarScale.current ?? 1, 1, dt * 2)
      if (refs.beam.current) refs.beam.current.size = THREE.MathUtils.lerp(refs.beam.current.size, 0.35 + calmK * 0.65, dt * 2)
    } else if (s.stage === 'release') {
      const f = Math.min(1, s.stageT / RELEASE)
      const e = f * f * (3 - 2 * f)
      uniforms.uDawn.value = Math.min(1, uniforms.uDawn.value + dt / 3)
      uniforms.uAgitation.value = THREE.MathUtils.lerp(uniforms.uAgitation.value, 0.05, dt)
      if (refs.beam.current) refs.beam.current.flood = THREE.MathUtils.clamp((s.stageT - 2.5) / 4.5, 0, 1)
      // look up the beam as the light floods the room
      shot.weight = THREE.MathUtils.clamp(s.stageT / 1.6, 0, 1)
      shot.pos.set(BEAM[0] + THREE.MathUtils.lerp(3.5, 5.5, e), THREE.MathUtils.lerp(2.4, 4.5, e), BEAM[1] + THREE.MathUtils.lerp(6, 8, e))
      shot.look.set(BEAM[0], THREE.MathUtils.lerp(2.2, 16, e), BEAM[1])
      if (!s.done && s.stageT > RELEASE - 0.5 && s.stageT - dt <= RELEASE - 0.5) fireFlash()
      if (!s.done && f >= 1) {
        s.done = true
        useGame.getState().dispatch({ type: 'WORLD_COMPLETE' })
      }
    }

    // time safety net for the whole world
    if (s.t > totalLimit && (s.stage === 'maze' || s.stage === 'room')) startBreathing()

    // ---------------- faces surface near Alex while she is agitated (room faces sink as she calms)
    const ag = uniforms.uAgitation.value
    const push = refs.facePush.current
    if (push) {
      FACES.forEach((f, i) => {
        const d = Math.hypot(player.position.x - f.x, player.position.z - f.z)
        const inRoom = i >= ROOM_FACE_START
        const near = d < (f.size > 3 ? 11 : 7.5)
        const want = inRoom ? (s.stage === 'room' || s.stage === 'breathe' ? 1 - refs.calm.current! : 0) : s.stage === 'maze' && near ? 1 : s.stage === 'maze' ? 0.1 : 0
        const before = push[i]
        push[i] = THREE.MathUtils.lerp(before, want * (0.4 + 0.6 * ag), Math.min(1, dt * (want > before ? 1.4 : 0.7)))
        if (!inRoom && before < 0.25 && push[i] >= 0.25 && s.t - s.lastThought > 3) {
          s.lastThought = s.t
          s.kick = 1
          showCaption(CHALLENGING_THOUGHTS[s.thought % CHALLENGING_THOUGHTS.length], { speaker: 'intrusive', hold: 3.6 })
          if (s.thought === 0) showSymbol('voices')
          s.thought++
          audio.tone(55, { type: 'sawtooth', dur: 1.4, gain: reduced ? 0.03 : 0.06, attack: 0.4 })
          audio.tone(82.4, { type: 'triangle', dur: 1.6, gain: reduced ? 0.03 : 0.05, attack: 0.5 })
        }
      })
    }

    // ---------------- shadow figures: at the far end of a straight corridor, watching
    const figs = refs.figures.current
    if (figs) {
      if (s.stage === 'maze' && !s.sinking && s.t > s.nextFigure && player.active) {
        const [pc, pr] = cellOf(player.position.x, player.position.z)
        const dirs: [number, number][] = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]
        let best: [number, number] | null = null
        let bestLen = 2
        for (const [dc, dr] of dirs) {
          let c = pc
          let r = pr
          let len = 0
          while (len < 6) {
            const n: [number, number] = [c + dc, r + dr]
            if (n[0] < 0 || n[1] < 0 || n[0] >= MAZE.cols || n[1] >= MAZE.rows || !MAZE.open([c, r], n)) break
            c = n[0]
            r = n[1]
            len++
          }
          if (len > bestLen) {
            bestLen = len
            best = [c, r]
          }
        }
        if (best) {
          const slot = figs[0].alpha < 0.05 ? figs[0] : figs[1]
          const [fx, fz] = MAZE.center(...best)
          slot.x = fx
          slot.z = fz
          slot.yaw = Math.atan2(player.position.x - fx, player.position.z - fz)
          slot.alpha = 0.001
          s.figureT = 0
          audio.tone(46, { type: 'sine', dur: 2.6, gain: reduced ? 0.04 : 0.08, attack: 1.2 })
          s.kick = Math.max(s.kick, 0.5)
        }
        s.nextFigure = s.t + (reduced ? 12 : 7) + Math.random() * 4
      }
      s.figureT += dt
      for (const f of figs) {
        if (f.alpha <= 0) continue
        const d = Math.hypot(player.position.x - f.x, player.position.z - f.z)
        const fadeOut = d < 6.5 || s.figureT > 4.5 || s.stage !== 'maze'
        f.alpha = THREE.MathUtils.clamp(f.alpha + (fadeOut ? -dt * 1.6 : dt * 0.9), 0, 0.95)
      }
    }

    // ---------------- camera shake: constant tremor in the maze, a jolt when something appears
    s.kick = Math.max(0, s.kick - dt * 1.2)
    const base = s.stage === 'maze' ? 0.6 : s.stage === 'room' ? 0.45 : s.stage === 'breathe' ? 0.4 * (1 - refs.calm.current!) : 0
    refs.shake.current = (base + s.kick * 0.6) * (reduced ? 0.45 : 1)
    refs.sink.current = s.sinking ? Math.min(1, (refs.sink.current ?? 0) + dt / 3) : 0

    // fog closes in while agitated; lifts as she calms
    const fogNear = THREE.MathUtils.lerp(30, 4 + Math.sin(s.t * 0.5) * 2, ag)
    const fogFar = THREE.MathUtils.lerp(220, 36 + Math.sin(s.t * 0.42) * 8, ag)
    uniforms.uFogNear.value = fogNear
    uniforms.uFogFar.value = fogFar
    const fog = scene.fog as THREE.Fog | null
    if (fog) {
      fog.near = fogNear
      fog.far = fogFar
      fog.color.copy(uniforms.uFog.value).lerp(new THREE.Color('#ffe0b8'), uniforms.uDawn.value * 0.6)
    }
    mazeFxState.amount = ag * (reduced ? 0.3 : 0.7)
  })
  return null
}
