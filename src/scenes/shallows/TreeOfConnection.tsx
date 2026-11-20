import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../../lib/random'
import { perturb, segment } from '../brain/NeuronForest'
import { FOG_COLOR } from './sky'

const UP = new THREE.Vector3(0, 1, 0)

/** A huge tree whose roots spread across the water like neurons reaching out: "connection". */
function buildTree(seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []

  // trunk
  let p = new THREE.Vector3(0, -0.3, 0)
  let dir = UP.clone()
  let r = 1.5
  let depth = 0
  for (let i = 0; i < 4; i++) {
    const next = p.clone().addScaledVector(dir, 3.1)
    parts.push(segment(p, next, r, r * 0.88, depth, depth + 0.07))
    p = next
    r *= 0.88
    depth += 0.07
    dir = perturb(dir, rand, 0.08).lerp(UP, 0.6).normalize()
  }

  const branch = (start: THREE.Vector3, d: THREE.Vector3, len: number, rad: number, d0: number, level: number) => {
    const end = start.clone().addScaledVector(d, len)
    const d1 = Math.min(1, d0 + 0.13)
    parts.push(segment(start, end, rad, rad * 0.7, d0, d1))
    if (level >= 5) return
    const kids = level < 2 ? 3 : rand() < 0.7 ? 2 : 1
    for (let k = 0; k < kids; k++) {
      const nd = perturb(d, rand, 0.35 + rand() * 0.45)
      nd.y = nd.y * 0.75 + 0.3
      branch(end, nd.normalize(), len * (0.72 + rand() * 0.1), rad * 0.66, d1, level + 1)
    }
  }
  branch(p, dir, 5.5, r, depth, 0)

  // roots across the water surface
  const roots = 14
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * Math.PI * 2 + rand() * 0.3
    let rp = new THREE.Vector3(Math.cos(a) * 1.1, 0.12, Math.sin(a) * 1.1)
    let rd = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
    let rr = 0.55
    let rdep = 0.05
    const length = 7 + Math.floor(rand() * 6)
    for (let s = 0; s < length; s++) {
      const next = rp.clone().addScaledVector(rd, 2.4)
      next.y = 0.12 + Math.sin(s * 0.9 + a) * 0.08
      parts.push(segment(rp, next, rr, rr * 0.85, rdep, rdep + 0.075))
      if (s > 2 && rand() < 0.35) {
        const side = rd.clone().applyAxisAngle(UP, (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.5))
        const tip = next.clone().addScaledVector(side, 3.5)
        tip.y = 0.12
        parts.push(segment(next, tip, rr * 0.6, rr * 0.2, rdep, Math.min(1, rdep + 0.25)))
      }
      rp = next
      rr *= 0.86
      rdep = Math.min(1, rdep + 0.075)
      rd.applyAxisAngle(UP, (rand() - 0.5) * 0.5)
    }
  }
  const merged = mergeGeometries(parts, false)!
  parts.forEach((g) => g.dispose())
  return merged
}

export function useTreeGeometry(): THREE.BufferGeometry {
  const g = useMemo(() => buildTree(77), [])
  useEffect(() => () => g.dispose(), [g])
  return g
}

export function makeTreeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBloom: { value: 0 }, uFog: { value: FOG_COLOR.clone() } },
    vertexShader: /* glsl */ `
      attribute float aDepth;
      varying float vDepth; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vDepth = aDepth; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vV = -mv.xyz; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uBloom; uniform vec3 uFog;
      varying float vDepth; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        vec3 a = vec3(1.0, 0.82, 0.5);   // gold
        vec3 b = vec3(1.0, 0.5, 0.7);    // rose
        vec3 c = vec3(0.4, 0.95, 0.88);  // teal
        vec3 base = mix(mix(a, b, smoothstep(0.1, 0.55, vDepth)), c, smoothstep(0.55, 1.0, vDepth));
        float flow = pow(max(0.0, sin(vDepth * 22.0 - uTime * 1.6)), 14.0);
        vec3 col = base * (0.35 + fres * 1.5) + base * flow * (1.6 + uBloom * 3.0) + base * uBloom * 1.4 * vDepth;
        col = mix(col, uFog, smoothstep(70.0, 300.0, length(vV)) * 0.8);
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
}

export function TreeOfConnection({ position, bloom, radiant = false }: { position: [number, number, number]; bloom: RefObject<number>; radiant?: boolean }) {
  const geometry = useTreeGeometry()
  const material = useMemo(makeTreeMaterial, [])
  const group = useRef<THREE.Group>(null)
  const crown = useRef<THREE.Mesh>(null)
  const glowMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uI: { value: 0.4 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `uniform float uI; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(vec3(1.0, 0.85, 0.7) * pow(max(0.0, 1.0 - d), 2.5) * uI, 1.0); }`,
      }),
    [],
  )
  useFrame((s, dt) => {
    const b = bloom.current ?? 0
    material.uniforms.uTime.value = s.clock.elapsedTime
    material.uniforms.uBloom.value = b
    if (group.current) group.current.rotation.y += dt * 0.02
    glowMat.uniforms.uI.value = 0.9 + b * (radiant ? 3.2 : 2.2)
    crown.current?.quaternion.copy(s.camera.quaternion)
    crown.current?.scale.setScalar(30 + b * 18)
  })
  return (
    <group position={position}>
      <group ref={group}>
        <mesh geometry={geometry} material={material} />
      </group>
      <mesh ref={crown} position={[0, 20, 0]} material={glowMat}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <Sparkles count={radiant ? 260 : 160} scale={[26, 18, 26]} position={[0, 20, 0]} size={6} speed={0.35} color="#ffe2b8" opacity={0.85} />
    </group>
  )
}

/** Mirrored copy for the water reflection (no sparkles, no collider). */
export function TreeReflection({ position }: { position: [number, number, number] }) {
  const geometry = useTreeGeometry()
  const material = useMemo(makeTreeMaterial, [])
  useFrame((s) => (material.uniforms.uTime.value = s.clock.elapsedTime))
  return <mesh geometry={geometry} material={material} position={position} />
}
