import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { mulberry32 } from '../../lib/random'
import { useGame } from '../../game/store'
import { QUALITY_PRESETS } from '../../quality/presets'

const NODE_COUNT = 150
const PULSE_COUNT = 70
const CYAN = new THREE.Color('#4fe3ff')
const MAGENTA = new THREE.Color('#ff4fd8')

interface Network {
  nodes: THREE.Vector3[]
  edges: [number, number][]
}

/** A deterministic, loosely brain-shaped constellation of neurons. */
function buildNetwork(seed: number): Network {
  const rand = mulberry32(seed)
  const nodes: THREE.Vector3[] = []
  for (let i = 0; i < NODE_COUNT; i++) {
    const u = rand() * 2 - 1
    const theta = rand() * Math.PI * 2
    const r = 4.5 + rand() * 6.5
    const s = Math.sqrt(1 - u * u)
    nodes.push(new THREE.Vector3(r * s * Math.cos(theta) * 1.45, r * u * 0.72, r * s * Math.sin(theta)))
  }
  const edges: [number, number][] = []
  const seen = new Set<string>()
  nodes.forEach((a, i) => {
    const nearest = nodes
      .map((b, j) => ({ j, d: a.distanceTo(b) }))
      .filter((x) => x.j !== i && x.d < 4.6)
      .sort((x, y) => x.d - y.d)
      .slice(0, 3)
    for (const { j } of nearest) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`
      if (!seen.has(key)) {
        seen.add(key)
        edges.push([i, j])
      }
    }
  })
  return { nodes, edges }
}

function makeGlowTexture(): THREE.Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.65)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const nodeColor = (p: THREE.Vector3) => CYAN.clone().lerp(MAGENTA, THREE.MathUtils.clamp((p.x + 14) / 28, 0, 1))

export function TitleBackdrop({ dim = false }: { dim?: boolean }) {
  const particleScale = QUALITY_PRESETS[useGame((s) => s.settings.quality)].particleScale
  const group = useRef<THREE.Group>(null)
  const pulses = useRef<THREE.InstancedMesh>(null)

  const { nodes, edges } = useMemo(() => buildNetwork(1729), [])
  const glow = useMemo(makeGlowTexture, [])

  const pointGeo = useMemo(() => {
    const pos = new Float32Array(nodes.length * 3)
    const col = new Float32Array(nodes.length * 3)
    nodes.forEach((p, i) => {
      p.toArray(pos, i * 3)
      nodeColor(p).multiplyScalar(2.4).toArray(col, i * 3)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [nodes])

  const lineGeo = useMemo(() => {
    const pos = new Float32Array(edges.length * 6)
    const col = new Float32Array(edges.length * 6)
    edges.forEach(([a, b], i) => {
      nodes[a].toArray(pos, i * 6)
      nodes[b].toArray(pos, i * 6 + 3)
      nodeColor(nodes[a]).toArray(col, i * 6)
      nodeColor(nodes[b]).toArray(col, i * 6 + 3)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [nodes, edges])

  // Signals travelling along random edges.
  const pulseData = useMemo(() => {
    const rand = mulberry32(99)
    return Array.from({ length: PULSE_COUNT }, () => ({
      edge: Math.floor(rand() * edges.length),
      speed: 0.12 + rand() * 0.25,
      offset: rand(),
    }))
  }, [edges.length])

  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), v: new THREE.Vector3(), c: new THREE.Color() }), [])

  useFrame(({ clock, camera }, delta) => {
    const t = clock.elapsedTime
    if (group.current) group.current.rotation.y += delta * 0.03
    camera.position.set(Math.sin(t * 0.05) * 2.2, 0.6 + Math.sin(t * 0.07) * 0.5, 19)
    camera.lookAt(0, 0, 0)
    const inst = pulses.current
    if (!inst) return
    pulseData.forEach((p, i) => {
      const [a, b] = edges[p.edge]
      const k = (t * p.speed + p.offset) % 1
      tmp.v.lerpVectors(nodes[a], nodes[b], k)
      const s = Math.sin(k * Math.PI) * 0.09 + 0.02
      tmp.m.makeScale(s, s, s).setPosition(tmp.v)
      inst.setMatrixAt(i, tmp.m)
    })
    inst.instanceMatrix.needsUpdate = true
  })

  const pulseColors = useMemo(() => {
    const arr = new Float32Array(PULSE_COUNT * 3)
    pulseData.forEach((p, i) => nodeColor(nodes[edges[p.edge][0]]).lerp(new THREE.Color('#ffffff'), 0.5).multiplyScalar(4).toArray(arr, i * 3))
    return arr
  }, [pulseData, nodes, edges])

  return (
    <>
      <color attach="background" args={['#07071c']} />
      <fog attach="fog" args={['#07071c', 12, 42]} />
      <group ref={group}>
        <points geometry={pointGeo}>
          <pointsMaterial size={dim ? 0.28 : 0.4} map={glow} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
        </points>
        <lineSegments geometry={lineGeo}>
          <lineBasicMaterial vertexColors transparent opacity={dim ? 0.12 : 0.28} depthWrite={false} blending={THREE.AdditiveBlending} />
        </lineSegments>
        <instancedMesh ref={pulses} args={[undefined, undefined, PULSE_COUNT]}>
          <sphereGeometry args={[1, 10, 10]}>
            <instancedBufferAttribute attach="attributes-color" args={[pulseColors, 3]} />
          </sphereGeometry>
          <meshBasicMaterial vertexColors toneMapped={false} />
        </instancedMesh>
      </group>
      <Sparkles count={Math.round(240 * particleScale)} scale={[34, 18, 34]} size={2.4} speed={0.22} opacity={dim ? 0.35 : 0.65} color="#4fe3ff" />
      <Sparkles count={Math.round(140 * particleScale)} scale={[30, 16, 30]} size={3} speed={0.18} opacity={dim ? 0.3 : 0.55} color="#ff4fd8" />
    </>
  )
}
