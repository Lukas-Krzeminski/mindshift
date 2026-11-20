import { useEffect, useMemo, useRef, type JSX, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { makeThinFilmMaterial } from './Flora'
import { player } from '../../player/playerState'

export type ShardId = 'crayonSun' | 'palette' | 'kite'

// ---------------------------------------------------------------------------
// The child's crayon drawing (drawn procedurally so it looks hand-made)
// ---------------------------------------------------------------------------

export function crayonTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 768
  c.height = 576
  const g = c.getContext('2d')!
  g.fillStyle = '#fbf3df'
  g.fillRect(0, 0, c.width, c.height)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const crayon = (color: string, width: number, draw: (jx: () => number) => void, passes = 3) => {
    g.strokeStyle = color
    g.lineCap = 'round'
    g.lineJoin = 'round'
    for (let p = 0; p < passes; p++) {
      g.globalAlpha = 0.55 + rnd() * 0.3
      g.lineWidth = width * (0.7 + rnd() * 0.5)
      g.beginPath()
      draw(() => (rnd() - 0.5) * width * 1.4)
      g.stroke()
    }
    g.globalAlpha = 1
  }
  // sun with rays
  crayon('#ffb300', 14, (j) => {
    for (let a = 0; a <= Math.PI * 2 + 0.2; a += 0.2) {
      const x = 580 + Math.cos(a) * 70 + j()
      const y = 130 + Math.sin(a) * 70 + j()
      if (a === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
  })
  g.fillStyle = 'rgba(255, 214, 64, 0.75)'
  g.beginPath()
  g.arc(580, 130, 62, 0, Math.PI * 2)
  g.fill()
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    crayon('#ff8f1f', 10, (j) => {
      g.moveTo(580 + Math.cos(a) * 92 + j(), 130 + Math.sin(a) * 92 + j())
      g.lineTo(580 + Math.cos(a) * 140 + j(), 130 + Math.sin(a) * 140 + j())
    }, 2)
  }
  // grass
  crayon('#43b649', 14, (j) => {
    g.moveTo(20, 520)
    for (let x = 20; x < 750; x += 26) g.lineTo(x + j(), (x / 26) % 2 ? 488 + j() : 528 + j())
  })
  // stick figures: mom (tall, long hair) and child holding hands
  const figure = (x: number, h: number, color: string, hair: boolean) => {
    const top = 500 - h
    crayon(color, 9, (j) => {
      g.moveTo(x + 32 + j(), top + 32)
      g.arc(x + j(), top + j(), 32, 0, Math.PI * 2)
    }, 2)
    if (hair) crayon('#8a4b22', 10, (j) => {
      g.moveTo(x - 34 + j(), top - 8)
      g.lineTo(x - 44 + j(), top + 70 + j())
      g.moveTo(x + 34 + j(), top - 8)
      g.lineTo(x + 44 + j(), top + 70 + j())
    }, 2)
    crayon(color, 9, (j) => {
      g.moveTo(x + j(), top + 32)
      g.lineTo(x + j(), top + h * 0.62)
      g.lineTo(x - 30 + j(), 500 + j())
      g.moveTo(x + j(), top + h * 0.62)
      g.lineTo(x + 30 + j(), 500 + j())
      g.moveTo(x - 46 + j(), top + h * 0.35)
      g.lineTo(x + 46 + j(), top + h * 0.35)
    }, 2)
    // smile
    g.strokeStyle = color
    g.lineWidth = 5
    g.beginPath()
    g.arc(x, top + 4, 14, 0.2, Math.PI - 0.2)
    g.stroke()
  }
  figure(190, 300, '#5b4bd6', true)
  figure(320, 200, '#e0457b', false)
  // heart
  g.fillStyle = 'rgba(232, 40, 80, 0.85)'
  g.beginPath()
  g.moveTo(255, 210)
  g.bezierCurveTo(255, 190, 225, 185, 225, 210)
  g.bezierCurveTo(225, 230, 255, 245, 255, 258)
  g.bezierCurveTo(255, 245, 285, 230, 285, 210)
  g.bezierCurveTo(285, 185, 255, 190, 255, 210)
  g.fill()
  // childlike lettering
  g.fillStyle = '#3d3dbf'
  g.font = 'bold 58px "Comic Sans MS", "Segoe Print", cursive'
  g.save()
  g.translate(40, 90)
  g.rotate(-0.06)
  g.fillText('ME + MOM', 0, 0)
  g.restore()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function CrayonSun() {
  const tex = useMemo(crayonTexture, [])
  useEffect(() => () => tex.dispose(), [tex])
  return (
    <group>
      <mesh>
        <planeGeometry args={[1.6, 1.2]} />
        <meshBasicMaterial map={tex} side={THREE.DoubleSide} color={new THREE.Color(0.92, 0.9, 0.86)} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[1.72, 1.32]} />
        <meshBasicMaterial color={new THREE.Color('#ffd27a').multiplyScalar(1.7)} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Palette() {
  const board = useMemo(() => {
    const s = new THREE.Shape()
    s.absellipse(0, 0, 0.75, 0.52, 0, Math.PI * 2, false, 0)
    const hole = new THREE.Path()
    hole.absarc(-0.42, -0.12, 0.1, 0, Math.PI * 2, true)
    s.holes.push(hole)
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 36 })
    g.center()
    return g
  }, [])
  const blobs: [number, number, string][] = [
    [0.38, 0.22, '#ff5c8a'],
    [0.08, 0.32, '#ffd23f'],
    [-0.22, 0.26, '#4fe3ff'],
    [0.5, -0.08, '#7cff6b'],
    [0.22, -0.3, '#b48cff'],
    [-0.05, -0.32, '#ffffff'],
  ]
  return (
    <group rotation={[0.2, 0, 0]}>
      <mesh geometry={board}>
        <meshStandardMaterial color="#d9a066" roughness={0.6} emissive="#5a3416" emissiveIntensity={0.6} />
      </mesh>
      {blobs.map(([x, y, c], i) => (
        <mesh key={i} position={[x, y, 0.045]} scale={[1, 1, 0.45]}>
          <sphereGeometry args={[0.085, 20, 14]} />
          <meshStandardMaterial color={c} emissive={c} emissiveIntensity={2.2} roughness={0.2} />
        </mesh>
      ))}
      <group position={[0.1, 0.05, 0.12]} rotation={[0, 0, -0.7]}>
        <mesh>
          <cylinderGeometry args={[0.018, 0.024, 0.9, 10]} />
          <meshStandardMaterial color="#2b1d3a" emissive="#40306a" emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <coneGeometry args={[0.03, 0.12, 10]} />
          <meshStandardMaterial color="#ff5c8a" emissive="#ff5c8a" emissiveIntensity={2.5} />
        </mesh>
      </group>
    </group>
  )
}

function Kite() {
  const sail = useMemo(() => {
    const top = [0, 0.75, 0]
    const left = [-0.5, 0.05, 0]
    const right = [0.5, 0.05, 0]
    const bottom = [0, -0.85, 0]
    const center = [0, 0.05, 0]
    const pos = new Float32Array([...center, ...top, ...left, ...center, ...right, ...top, ...center, ...left, ...bottom, ...center, ...bottom, ...right])
    const cols = ['#ff5c8a', '#ffd23f', '#4fe3ff', '#b48cff'].flatMap((h) => {
      const c = new THREE.Color(h).multiplyScalar(1.8)
      return [c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b]
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3))
    return g
  }, [])
  const tail = useRef<THREE.Group>(null)
  useFrame((s) => {
    tail.current?.children.forEach((bow, i) => {
      bow.position.set(Math.sin(s.clock.elapsedTime * 2.2 + i * 0.7) * 0.12 * (i + 1) * 0.4, -0.95 - i * 0.24, 0)
      bow.rotation.z = Math.sin(s.clock.elapsedTime * 2.5 + i) * 0.5
    })
  })
  const stringGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.85, 0), new THREE.Vector3(0.6, -4.2, 0.4)]), [])
  return (
    <group>
      <mesh geometry={sail}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <group ref={tail}>
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i}>
            <planeGeometry args={[0.16, 0.08]} />
            <meshBasicMaterial color={new THREE.Color(['#ff5c8a', '#ffd23f', '#4fe3ff'][i % 3]).multiplyScalar(2)} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <lineSegments geometry={stringGeo}>
        <lineBasicMaterial color={new THREE.Color('#ffffff').multiplyScalar(1.5)} transparent opacity={0.6} toneMapped={false} />
      </lineSegments>
    </group>
  )
}

const DIORAMA: Record<ShardId, () => JSX.Element> = { crayonSun: CrayonSun, palette: Palette, kite: Kite }

/** A floating glass shard; when found it dissolves and unfolds into a memory. */
export function MemoryShard({ id, position, found }: { id: ShardId; position: [number, number, number]; found: boolean }) {
  const crystal = useRef<THREE.Group>(null)
  const memory = useRef<THREE.Group>(null)
  const film = useMemo(() => makeThinFilmMaterial(1.6), [])
  const core = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2d8').multiplyScalar(3), toneMapped: false, transparent: true }), [])
  const k = useRef(0)
  const Diorama = DIORAMA[id]
  useFrame((s, dt) => {
    const t = s.clock.elapsedTime
    k.current = THREE.MathUtils.clamp(k.current + (found ? dt * 0.9 : -dt), 0, 1)
    const e = k.current * k.current * (3 - 2 * k.current)
    film.uniforms.uTime.value = t
    if (crystal.current) {
      crystal.current.rotation.y += dt * 0.6
      crystal.current.position.y = Math.sin(t * 1.1 + position[0]) * 0.15
      crystal.current.scale.setScalar(Math.max(0.0001, 1 - e) * (1 + Math.sin(t * 2) * 0.03))
    }
    core.opacity = 1 - e
    if (memory.current) {
      memory.current.scale.setScalar(Math.max(0.0001, e))
      memory.current.position.y = 0.2 + Math.sin(t * 0.9) * 0.1 + (id === 'kite' ? 1.6 * e : 0)
      // face the camera, gently
      const target = Math.atan2(s.camera.position.x - position[0], s.camera.position.z - position[2])
      memory.current.rotation.y = THREE.MathUtils.lerp(memory.current.rotation.y, target, Math.min(1, dt * 2))
    }
  })
  return (
    <group position={position}>
      <group ref={crystal}>
        <mesh material={film} scale={[0.55, 1.2, 0.55]}>
          <octahedronGeometry args={[1, 0]} />
        </mesh>
        <mesh material={core} scale={[0.16, 0.42, 0.16]}>
          <octahedronGeometry args={[1, 0]} />
        </mesh>
      </group>
      <group ref={memory} scale={0.0001}>
        <Diorama />
      </group>
    </group>
  )
}

/** Small lights that drift ahead of Alex toward the next point of interest. */
export function GuideWisps({ target, color = '#fff1d6' }: { target: RefObject<THREE.Vector3 | null>; color?: string }) {
  const N = 6
  const refs = useRef<(THREE.Mesh | null)[]>([])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(4), toneMapped: false, transparent: true }), [color])
  const tmp = useMemo(() => ({ dir: new THREE.Vector3(), p: new THREE.Vector3() }), [])
  useFrame((s) => {
    const goal = target.current
    const t = s.clock.elapsedTime
    if (!goal || !player.active) {
      refs.current.forEach((m) => m && (m.visible = false))
      return
    }
    tmp.dir.set(goal.x - player.position.x, 0, goal.z - player.position.z)
    const dist = tmp.dir.length()
    tmp.dir.normalize()
    refs.current.forEach((m, i) => {
      if (!m) return
      const phase = ((t * 0.45 + i / N) % 1)
      const along = 1.5 + phase * Math.min(14, Math.max(3, dist - 2))
      m.visible = dist > 3.5
      tmp.p.copy(player.position).addScaledVector(tmp.dir, along)
      tmp.p.y = Math.max(player.position.y, 0) + 1.3 + Math.sin(t * 2 + i) * 0.25 + phase * 0.6
      m.position.copy(tmp.p)
      const fade = Math.sin(phase * Math.PI)
      m.scale.setScalar(0.06 + fade * 0.08)
    })
  })
  return (
    <>
      {Array.from({ length: N }, (_, i) => (
        <mesh key={i} ref={(m) => { refs.current[i] = m }} material={mat}>
          <sphereGeometry args={[1, 12, 12]} />
        </mesh>
      ))}
    </>
  )
}
