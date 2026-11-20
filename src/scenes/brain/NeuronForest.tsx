import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../../lib/random'

/**
 * Procedurally grown neurons (soma + branching dendrites + axon), instanced around
 * the camera route. Pulses travel outward from the soma along every branch.
 */

const UP = new THREE.Vector3(0, 1, 0)

export function randomUnit(rand: () => number): THREE.Vector3 {
  const u = rand() * 2 - 1
  const t = rand() * Math.PI * 2
  const s = Math.sqrt(1 - u * u)
  return new THREE.Vector3(s * Math.cos(t), u, s * Math.sin(t))
}

export function perturb(dir: THREE.Vector3, rand: () => number, angle: number): THREE.Vector3 {
  const axis = new THREE.Vector3().crossVectors(dir, randomUnit(rand)).normalize()
  return dir.clone().applyAxisAngle(axis, angle).normalize()
}

export function segment(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, d0: number, d1: number): THREE.BufferGeometry {
  const len = a.distanceTo(b)
  const g = new THREE.CylinderGeometry(r1, r0, len, 6, 1, true).toNonIndexed()
  const pos = g.getAttribute('position')
  const depth = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) depth[i] = THREE.MathUtils.lerp(d0, d1, pos.getY(i) / len + 0.5)
  g.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1))
  const dir = b.clone().sub(a).normalize()
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir))
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  return g
}

export function buildNeuron(seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []

  const soma = new THREE.IcosahedronGeometry(0.55, 2)
  soma.deleteAttribute('uv')
  soma.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(soma.getAttribute('position').count), 1))
  parts.push(soma)

  const branch = (start: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, d0: number, level: number) => {
    const end = start.clone().addScaledVector(dir, len)
    const d1 = Math.min(1, d0 + 0.26)
    parts.push(segment(start, end, r, r * 0.68, d0, d1))
    if (level >= 3) return
    const kids = level === 0 ? 2 : rand() < 0.75 ? 2 : 1
    for (let k = 0; k < kids; k++) branch(end, perturb(dir, rand, 0.45 + rand() * 0.5), len * 0.74, r * 0.66, d1, level + 1)
  }

  const primaries = 5 + Math.floor(rand() * 3)
  for (let p = 0; p < primaries; p++) {
    const dir = randomUnit(rand)
    branch(dir.clone().multiplyScalar(0.42), dir, 1.4 + rand() * 0.9, 0.16, 0.06, 0)
  }

  // One long, gently wandering axon.
  let dir = randomUnit(rand)
  let p = dir.clone().multiplyScalar(0.45)
  let depth = 0.04
  for (let i = 0; i < 9; i++) {
    const next = p.clone().addScaledVector(dir, 1.1)
    parts.push(segment(p, next, 0.1 - i * 0.006, 0.1 - (i + 1) * 0.006, depth, depth + 0.1))
    depth += 0.1
    p = next
    dir = perturb(dir, rand, 0.25)
  }

  for (const g of parts) if (g.getAttribute('uv')) g.deleteAttribute('uv')
  const merged = mergeGeometries(parts, false)!
  parts.forEach((g) => g.dispose())
  return merged
}

const VERT = /* glsl */ `
  attribute float aDepth;
  uniform float uTime;
  varying float vDepth; varying vec3 vN; varying vec3 vV; varying float vSeed; varying float vDist; varying vec3 vTint;
  varying vec3 vWorld;
  void main() {
    vDepth = aDepth;
    vec3 p = position;
    float sway = aDepth * aDepth * 0.28;
    p.x += sin(uTime * 0.55 + position.y * 0.6) * sway;
    p.z += cos(uTime * 0.47 + position.x * 0.5) * sway;
    vec4 wp = vec4(p, 1.0);
    vec3 n = normal;
    vSeed = 0.0;
    vTint = vec3(1.0);
    #ifdef USE_INSTANCING
      wp = instanceMatrix * wp;
      n = mat3(instanceMatrix) * n;
      vSeed = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #endif
    vWorld = (modelMatrix * wp).xyz;
    vec4 mv = modelViewMatrix * wp;
    vV = -mv.xyz;
    vN = normalize(normalMatrix * n);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */ `
  uniform float uTime, uFogNear, uFogFar, uBoost, uClearOn;
  uniform vec3 uDeep, uFog, uClearCenter;
  uniform vec2 uClearHalf;
  varying float vDepth; varying vec3 vN; varying vec3 vV; varying float vSeed; varying float vDist; varying vec3 vTint;
  varying vec3 vWorld;
  void main() {
    // keep the active puzzle readable: drop any branch between the camera and the lattice
    if (uClearOn > 0.5) {
      vec3 d = vWorld - cameraPosition;
      float t = d.z / (uClearCenter.z - cameraPosition.z);
      if (t > 0.0 && t < 1.0) {
        vec2 q = abs(cameraPosition.xy + d.xy / t - uClearCenter.xy) - uClearHalf;
        if (max(q.x, q.y) < 0.0) discard;
      }
    }
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
    vec3 base = mix(vTint * 1.2, uDeep, vDepth * 0.55);
    float pulse = pow(max(0.0, sin(vDepth * 16.0 - uTime * 2.1 + vSeed * 6.0)), 24.0);
    float soma = 1.0 - smoothstep(0.0, 0.07, vDepth);
    vec3 col = base * (0.18 + 1.3 * fres) + vTint * pulse * 2.6 + vTint * soma * 2.2;
    col *= uBoost;
    col = mix(col, uFog, smoothstep(uFogNear, uFogFar, vDist));
    gl_FragColor = vec4(col, 1.0);
  }
`

export interface ForestOptions {
  count?: number
  seed?: number
  /** Area to scatter neurons in. */
  bounds?: { x: [number, number]; y: [number, number]; z: [number, number] }
  /** Points the camera travels through; neurons keep this clearance from them. */
  avoid?: THREE.Vector3[]
  clearance?: number
  palette?: string[]
  fog?: string
  boost?: number
  /** Rectangle (in a z-facing plane) that branches must never cover from the camera's view. */
  clear?: { center: THREE.Vector3; half: THREE.Vector2 } | null
}

const DEFAULT_BOUNDS: NonNullable<ForestOptions['bounds']> = { x: [-40, 40], y: [-12, 16], z: [-95, 25] }
const NO_AVOID: THREE.Vector3[] = []
const DEFAULT_PALETTE = ['#4fe3ff', '#ff4fd8', '#9b7bff', '#5fe0d0']

export function NeuronForest({
  count = 34,
  seed = 11,
  bounds = DEFAULT_BOUNDS,
  avoid = NO_AVOID,
  clearance = 9,
  palette = DEFAULT_PALETTE,
  fog = '#0a0820',
  boost = 1,
  clear = null,
}: ForestOptions) {
  const variants = useMemo(() => [101, 202, 303, 404].map((s) => buildNeuron(s + seed)), [seed])
  useEffect(() => () => variants.forEach((g) => g.dispose()), [variants])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uTime: { value: 0 },
          uFogNear: { value: 25 },
          uFogFar: { value: 110 },
          uFog: { value: new THREE.Color(fog) },
          uDeep: { value: new THREE.Color('#1a0f45') },
          uBoost: { value: boost },
          uClearOn: { value: 0 },
          uClearCenter: { value: new THREE.Vector3() },
          uClearHalf: { value: new THREE.Vector2() },
        },
      }),
    [fog, boost],
  )

  const placements = useMemo(() => {
    const rand = mulberry32(seed * 7 + 3)
    const out: { m: THREE.Matrix4; color: THREE.Color; v: number }[] = []
    let guard = 0
    while (out.length < count && guard++ < count * 40) {
      const pos = new THREE.Vector3(
        THREE.MathUtils.lerp(bounds.x[0], bounds.x[1], rand()),
        THREE.MathUtils.lerp(bounds.y[0], bounds.y[1], rand()),
        THREE.MathUtils.lerp(bounds.z[0], bounds.z[1], rand()),
      )
      if (avoid.some((a) => a.distanceTo(pos) < clearance)) continue
      const scale = 1.4 + rand() * 3.2
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6.28, rand() * 6.28, rand() * 6.28))
      out.push({
        m: new THREE.Matrix4().compose(pos, q, new THREE.Vector3(scale, scale, scale)),
        color: new THREE.Color(palette[Math.floor(rand() * palette.length)]),
        v: Math.floor(rand() * 4),
      })
    }
    return out
  }, [count, seed, bounds, avoid, clearance, palette])

  const meshes = useRef<(THREE.InstancedMesh | null)[]>([])
  useEffect(() => {
    variants.forEach((_, v) => {
      const mesh = meshes.current[v]
      if (!mesh) return
      const mine = placements.filter((p) => p.v === v)
      mine.forEach((p, i) => {
        mesh.setMatrixAt(i, p.m)
        mesh.setColorAt(i, p.color)
      })
      mesh.count = mine.length
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    })
    material.needsUpdate = true // recompile with per-instance colors
  }, [variants, placements, material])

  useEffect(() => {
    const u = material.uniforms
    u.uClearOn.value = clear ? 1 : 0
    if (clear) {
      u.uClearCenter.value.copy(clear.center)
      u.uClearHalf.value.copy(clear.half)
    }
  }, [material, clear])

  useFrame((s) => (material.uniforms.uTime.value = s.clock.elapsedTime))

  return (
    <>
      {variants.map((g, v) => (
        <instancedMesh
          key={v}
          ref={(m) => { meshes.current[v] = m }}
          args={[g, material, Math.max(1, placements.filter((p) => p.v === v).length)]}
          frustumCulled={false}
        />
      ))}
    </>
  )
}
