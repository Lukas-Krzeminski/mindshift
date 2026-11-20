import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { TextSprite } from '../fx/TextSprite'
import * as THREE from 'three'
import { cellOf, colOf, evaluate, rowOf, solutionPaths, type Level } from './model'
import { getLevel, SIGNAL_COLORS, type PuzzleKey } from './levels'
import { usePuzzle } from './puzzleStore'
import { glyphGeometry } from './glyphs'
import { makeGlowMaterial, makePanelMaterial, makePathMaterial, makePlateMaterial } from './boardShaders'
import type { Vec3 } from '../scenes/useCameraPose'

export type BoardMode = 'active' | 'done' | 'dormant'

const S = 1 // cell size in world units
const MARGIN = 0.9

const cellPos = (level: Level, i: number, z = 0) =>
  new THREE.Vector3((colOf(level.size, i) - (level.size - 1) / 2) * S, ((level.size - 1) / 2 - rowOf(level.size, i)) * S, z)

const hdr = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k)

/** A holographic neural lattice floating in the brain: the playable puzzle. */
export function PuzzleBoard({ puzzleKey, position, mode }: { puzzleKey: PuzzleKey; position: Vec3; mode: BoardMode }) {
  const level = getLevel(puzzleKey)
  const run = usePuzzle((s) => (s.run?.key === puzzleKey ? s.run : null))
  const final = usePuzzle((s) => s.finals[puzzleKey])
  const paths = mode === 'active' ? run?.paths : mode === 'done' ? final : undefined
  const evaluation = useMemo(() => (paths ? evaluate(level, paths) : null), [level, paths])
  const status = mode === 'active' ? run?.status : undefined
  const group = useRef<THREE.Group>(null)
  const appear = useRef(0)
  const fire = useRef(0)
  const lastStatus = useRef(status)

  useEffect(() => {
    if (status === 'solved' && lastStatus.current !== 'solved') fire.current = 1
    lastStatus.current = status
  }, [status])

  const panel = useMemo(() => makePanelMaterial(level.size, MARGIN), [level.size])
  const plate = useMemo(() => makePlateMaterial(level.size, MARGIN), [level.size])
  const panelSize = (level.size + MARGIN * 2) * S

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    appear.current = Math.min(1, appear.current + dt * 1.2)
    fire.current = Math.max(0, fire.current - dt * 0.7)
    const g = group.current
    if (g) {
      const e = 1 - Math.pow(1 - appear.current, 3)
      g.scale.setScalar(0.86 + 0.14 * e + fire.current * 0.04)
    }
    const u = panel.uniforms
    u.uTime.value = t
    u.uFire.value = fire.current
    const limit = level.def.timeLimit
    const left = run?.timeLeft ?? limit
    u.uProgress.value = mode === 'active' && limit && left !== null ? left / limit : 1
    u.uWarn.value = THREE.MathUtils.lerp(u.uWarn.value, mode === 'active' && limit && left !== null && left <= 10 ? 1 : 0, Math.min(1, dt * 3))
    u.uOpacity.value = (mode === 'dormant' ? 0.4 : status === 'timeout' ? 0.55 : 1) * appear.current
    plate.uniforms.uOpacity.value = (mode === 'dormant' ? 0.5 : 1) * appear.current
  })

  const dim = mode === 'dormant' ? 0.35 : status === 'timeout' ? 0.45 : 1

  return (
    <group ref={group} position={position}>
      <mesh position={[0, 0, -0.32]} material={plate} renderOrder={-1}>
        <planeGeometry args={[panelSize, panelSize]} />
      </mesh>
      <mesh position={[0, 0, -0.25]} material={panel}>
        <planeGeometry args={[panelSize, panelSize]} />
      </mesh>
      <CellDots level={level} dim={dim} />
      <BlockedCells level={level} />
      {level.ends.map(([a, b], k) => (
        <group key={k}>
          <Endpoint level={level} cell={a} color={k} connected={!!evaluation?.complete[k]} dim={dim} fire={fire} />
          <Endpoint level={level} cell={b} color={k} connected={!!evaluation?.complete[k]} dim={dim} fire={fire} />
        </group>
      ))}
      {paths?.map((p, k) =>
        p.length > 1 ? <PathTube key={k} level={level} cells={p} color={k} complete={!!evaluation?.complete[k]} dim={dim} fire={fire} /> : null,
      )}
      <Gates level={level} paths={paths} showLabels={mode !== 'dormant'} />
      {mode === 'active' && puzzleKey === 'tutorial' && !run?.interacted && <GhostGuide level={level} />}
      {mode === 'active' && status === 'playing' && <BoardInput level={level} />}
    </group>
  )
}

// ---------------------------------------------------------------------------

function CellDots({ level, dim }: { level: Level; dim: number }) {
  const cells = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i < level.cellCount; i++) if (!level.blocked[i] && level.endpoint[i] < 0) out.push(i)
    return out
  }, [level])
  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const m = new THREE.Matrix4()
    cells.forEach((cell, j) => {
      m.makeScale(0.085, 0.085, 0.085).setPosition(cellPos(level, cell, -0.05))
      ref.current?.setMatrixAt(j, m)
    })
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true
  }, [cells, level])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cells.length]}>
      <sphereGeometry args={[1, 10, 10]} />
      <meshBasicMaterial color={hdr('#9fc0ff', 1.5 * dim)} toneMapped={false} />
    </instancedMesh>
  )
}

function BlockedCells({ level }: { level: Level }) {
  const cells = useMemo(() => Array.from({ length: level.cellCount }, (_, i) => i).filter((i) => level.blocked[i]), [level])
  const refs = useRef<(THREE.Mesh | null)[]>([])
  useFrame((state) => {
    refs.current.forEach((m, j) => {
      if (!m) return
      m.rotation.y = state.clock.elapsedTime * 0.35 + j
      m.rotation.x = 0.5 + Math.sin(state.clock.elapsedTime * 0.4 + j) * 0.2
    })
  })
  return (
    <>
      {cells.map((cell, j) => (
        <group key={cell} position={cellPos(level, cell)}>
          <mesh ref={(m) => { refs.current[j] = m }}>
            <octahedronGeometry args={[0.3, 0]} />
            <meshStandardMaterial color="#120a24" emissive="#3b2466" emissiveIntensity={0.9} roughness={0.25} metalness={0.6} flatShading />
          </mesh>
          <mesh position={[0, 0, -0.2]}>
            <circleGeometry args={[0.44, 6]} />
            <meshBasicMaterial color="#06030f" transparent opacity={0.7} />
          </mesh>
        </group>
      ))}
    </>
  )
}

function Endpoint({ level, cell, color, connected, dim, fire }: { level: Level; cell: number; color: number; connected: boolean; dim: number; fire: RefObject<number> }) {
  const sig = SIGNAL_COLORS[color]
  const ring = useRef<THREE.Mesh>(null)
  const core = useRef<THREE.Mesh>(null)
  const coreMat = useMemo(() => new THREE.MeshStandardMaterial({ color: sig.hex, emissive: sig.hex, emissiveIntensity: 2.2, roughness: 0.3 }), [sig.hex])
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: hdr(sig.hex, 2.4), toneMapped: false, side: THREE.DoubleSide }), [sig.hex])
  const glow = useMemo(() => makeGlowMaterial(sig.hex, 1.2), [sig.hex])
  const phase = useMemo(() => (cell * 0.37) % (Math.PI * 2), [cell])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const pulse = 1 + Math.sin(t * Math.PI * 1.6 + phase) * 0.06 // 0.8 Hz, gentle
    const f = fire.current ?? 0
    core.current?.scale.setScalar((connected ? 1.08 : 1) * pulse + f * 0.35)
    if (ring.current) ring.current.rotation.z += (connected ? 0.012 : 0.004)
    coreMat.emissiveIntensity = (connected ? 3.4 : 2.0) * dim + f * 4
    ringMat.color.copy(hdr(sig.hex, (connected ? 3.2 : 1.8) * dim + f * 3))
    glow.uniforms.uIntensity.value = (connected ? 1.6 : 0.9) * dim + f * 2
  })

  return (
    <group position={cellPos(level, cell, 0.02)}>
      <mesh material={glow} position={[0, 0, -0.1]}>
        <planeGeometry args={[1.7, 1.7]} />
      </mesh>
      <mesh ref={core} material={coreMat}>
        <sphereGeometry args={[0.24, 32, 32]} />
      </mesh>
      <mesh ref={ring} material={ringMat} geometry={glyphGeometry(sig.glyph)} position={[0, 0, 0.02]} />
    </group>
  )
}

function PathTube({ level, cells, color, complete, dim, fire }: { level: Level; cells: number[]; color: number; complete: boolean; dim: number; fire: RefObject<number> }) {
  const material = useMemo(() => makePathMaterial(SIGNAL_COLORS[color].hex), [color])
  const key = cells.join(',')
  const geometry = useMemo(() => {
    const pts = cells.map((c) => cellPos(level, c, 0.02))
    const curve =
      pts.length === 2 ? new THREE.LineCurve3(pts[0], pts[1]) : new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5)
    return new THREE.TubeGeometry(curve, Math.max(8, (pts.length - 1) * 14), 0.13, 10, false)
  }, [key, level])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useFrame((state, dt) => {
    const u = material.uniforms
    u.uTime.value = state.clock.elapsedTime
    u.uLen.value = cells.length - 1
    u.uComplete.value = THREE.MathUtils.lerp(u.uComplete.value, complete ? 1 : 0, Math.min(1, dt * 5))
    u.uFire.value = fire.current ?? 0
    u.uDim.value = dim
  })
  return <mesh geometry={geometry} material={material} />
}

function Gates({ level, paths, showLabels }: { level: Level; paths?: number[][]; showLabels: boolean }) {
  const gates = useMemo(() => Array.from({ length: level.cellCount }, (_, i) => i).filter((i) => level.gate[i]), [level])
  const lit = useMemo(() => {
    const covered = new Set(paths?.flat() ?? [])
    return gates.map((g) => covered.has(g))
  }, [gates, paths])
  const rings = useRef<(THREE.Group | null)[]>([])
  useFrame((state, dt) => {
    rings.current.forEach((g, j) => {
      if (!g) return
      g.rotation.z += dt * (lit[j] ? 1.2 : 0.35)
      const s = lit[j] ? 1.06 + Math.sin(state.clock.elapsedTime * 3) * 0.03 : 1
      g.scale.setScalar(s)
    })
  })
  if (!gates.length) return null
  return (
    <>
      {gates.map((cell, j) => (
        <group key={cell} position={cellPos(level, cell, 0.05)}>
          <group ref={(g) => { rings.current[j] = g }}>
            <mesh>
              <torusGeometry args={[0.43, 0.022, 8, 64]} />
              <meshBasicMaterial color={hdr('#fff1c4', lit[j] ? 4 : 0.9)} toneMapped={false} />
            </mesh>
            {[0, 1, 2, 3].map((q) => (
              <mesh key={q} position={[Math.cos((q * Math.PI) / 2) * 0.43, Math.sin((q * Math.PI) / 2) * 0.43, 0]}>
                <sphereGeometry args={[0.05, 10, 10]} />
                <meshBasicMaterial color={hdr('#ffd27a', lit[j] ? 5 : 1.2)} toneMapped={false} />
              </mesh>
            ))}
          </group>
          {showLabels && <TextSprite text="5-HT2A" position={[0, -0.64, 0.02]} height={0.13} color="#fff1c4" intensity={lit[j] ? 2.6 : 0.75} />}
        </group>
      ))}
    </>
  )
}

/** Tutorial: a ghost signal traces the first route until the player touches the board. */
function GhostGuide({ level }: { level: Level }) {
  const route = useMemo(() => solutionPaths(level)[0], [level])
  const curve = useMemo(() => {
    const pts = route.map((c) => cellPos(level, c, 0.08))
    return pts.length === 2 ? new THREE.LineCurve3(pts[0], pts[1]) : new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5)
  }, [route, level])
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 48, 0.06, 8, false), [curve])
  const orb = useRef<THREE.Group>(null)
  const tubeMat = useRef<THREE.MeshBasicMaterial>(null)
  useFrame((state) => {
    const cycle = (state.clock.elapsedTime % 3.2) / 3.2
    const k = THREE.MathUtils.smoothstep(cycle, 0.08, 0.8)
    orb.current?.position.copy(curve.getPointAt(k))
    if (orb.current) orb.current.scale.setScalar(cycle > 0.9 ? 0.0001 : 1)
    if (tubeMat.current) tubeMat.current.opacity = 0.18 + 0.12 * Math.sin(state.clock.elapsedTime * 2)
  })
  return (
    <>
      <mesh geometry={geometry}>
        <meshBasicMaterial ref={tubeMat} color={hdr(SIGNAL_COLORS[0].hex, 1.5)} transparent opacity={0.25} depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={orb}>
        <mesh>
          <sphereGeometry args={[0.16, 20, 20]} />
          <meshBasicMaterial color={hdr('#ffffff', 4)} toneMapped={false} />
        </mesh>
        <TextSprite text="DRAG" position={[0.62, 0.42, 0]} height={0.12} intensity={1.6} letterSpacing={0.3} />
      </group>
    </>
  )
}

/** Invisible input surface: maps pointer rays onto lattice cells; window listeners keep long drags alive. */
function BoardInput({ level }: { level: Level }) {
  const { camera, gl } = useThree()
  const surface = useRef<THREE.Mesh>(null)
  const [hover, setHover] = useState(-1)
  const dragging = useRef(false)
  const tmp = useMemo(() => ({ plane: new THREE.Plane(), n: new THREE.Vector3(), p: new THREE.Vector3(), q: new THREE.Quaternion(), hit: new THREE.Vector3(), ray: new THREE.Raycaster(), ndc: new THREE.Vector2() }), [])
  const { pointerDown, pointerMove, pointerUp } = usePuzzle.getState()
  const hoverMat = useMemo(() => makeGlowMaterial('#bfe9ff', 0.6), [])

  const rayToCell = (ray: THREE.Ray): number => {
    const g = surface.current?.parent
    if (!g) return -1
    tmp.n.set(0, 0, 1).applyQuaternion(g.getWorldQuaternion(tmp.q))
    tmp.plane.setFromNormalAndCoplanarPoint(tmp.n, g.getWorldPosition(tmp.p))
    if (!ray.intersectPlane(tmp.plane, tmp.hit)) return -1
    g.worldToLocal(tmp.hit)
    const n = level.size
    const c = Math.floor(tmp.hit.x / S + n / 2)
    const r = Math.floor(n / 2 - tmp.hit.y / S)
    if (r < 0 || r >= n || c < 0 || c >= n) return -1
    return cellOf(n, r, c)
  }

  const draggableAt = (cell: number) => {
    if (cell < 0) return false
    const run = usePuzzle.getState().run
    return level.endpoint[cell] >= 0 || !!run?.paths.some((p) => p.includes(cell))
  }

  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return
      const rect = gl.domElement.getBoundingClientRect()
      tmp.ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
      tmp.ray.setFromCamera(tmp.ndc, camera)
      const cell = rayToCell(tmp.ray.ray)
      setHover(cell)
      if (cell >= 0) pointerMove(cell)
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      gl.domElement.style.cursor = ''
      pointerUp()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      gl.domElement.style.cursor = ''
      if (dragging.current) pointerUp()
    }
  }, [camera, gl, level])

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const cell = rayToCell(e.ray)
    if (!draggableAt(cell)) return
    dragging.current = true
    gl.domElement.style.cursor = 'grabbing'
    pointerDown(cell)
  }
  const onHover = (e: ThreeEvent<PointerEvent>) => {
    if (dragging.current) return
    const cell = rayToCell(e.ray)
    setHover(cell)
    gl.domElement.style.cursor = draggableAt(cell) ? 'grab' : ''
  }

  const span = (level.size + MARGIN * 2 + 6) * S
  return (
    <>
      <mesh ref={surface} position={[0, 0, 0.1]} onPointerDown={onDown} onPointerMove={onHover} onPointerLeave={() => !dragging.current && setHover(-1)}>
        <planeGeometry args={[span, span]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {hover >= 0 && !level.blocked[hover] && (
        <mesh material={hoverMat} position={cellPos(level, hover, -0.2)}>
          <planeGeometry args={[1.5, 1.5]} />
        </mesh>
      )}
    </>
  )
}
