import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ridged } from '../../lib/noise'
import { mulberry32 } from '../../lib/random'

/**
 * An anatomically inspired glass brain built procedurally (no external mesh needed):
 * two hemispheres with a longitudinal fissure, temporal lobes, ridged gyri, a cerebellum
 * and brainstem, plus glowing white-matter tracts colored with the DTI convention
 * (red = left-right, green = front-back, blue = up-down).
 */

function buildCortex(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 220, 150)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const curv = new Float32Array(pos.count)
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const d = v.clone().normalize()
    // ellipsoid: x = left/right, y = up/down, z = front/back
    let x = d.x * 0.7
    let y = d.y * 0.6
    let z = d.z * 0.95
    if (d.y < -0.1) y *= 0.78 // flatter underside
    // longitudinal fissure along the top midline
    const fissure = Math.exp(-Math.pow(d.x / 0.07, 2)) * THREE.MathUtils.smoothstep(d.y, -0.15, 0.5) * 0.11
    // temporal lobes: bulge low on the sides, toward the front
    const temporal = 0.09 * Math.exp(-Math.pow((d.y + 0.32) / 0.2, 2)) * THREE.MathUtils.smoothstep(Math.abs(d.x), 0.25, 0.7) * THREE.MathUtils.smoothstep(d.z, -0.5, 0.3)
    // frontal pole slightly blunter, occipital slightly tapered
    const pole = d.z > 0 ? 0.03 * d.z : -0.02 * d.z * d.z
    // gyri / sulci
    const gy = ridged(d.x * 5.2 + 3, d.y * 5.2, d.z * 5.2 - 1, 4)
    const fold = (gy - 0.42) * 0.12
    const r = 1 + temporal + pole + fold - fissure
    x *= r
    y *= r
    z *= r
    pos.setXYZ(i, x, y, z)
    curv[i] = gy
  }
  g.setAttribute('aCurv', new THREE.BufferAttribute(curv, 1))
  g.computeVertexNormals()
  return g
}

function buildCerebellum(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 96, 64)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const curv = new Float32Array(pos.count)
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    // fine horizontal folia
    const folia = Math.sin(v.y * 34) * 0.5 + 0.5
    const r = 1 + folia * 0.035
    pos.setXYZ(i, v.x * 0.42 * r, v.y * 0.24 * r, v.z * 0.3 * r)
    curv[i] = folia
  }
  g.setAttribute('aCurv', new THREE.BufferAttribute(curv, 1))
  g.computeVertexNormals()
  return g
}

function makeGlassMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uTint: { value: new THREE.Color('#7fc8ff') } },
    vertexShader: /* glsl */ `
      attribute float aCurv;
      varying vec3 vN; varying vec3 vV; varying float vCurv; varying vec3 vP;
      void main(){ vCurv = aCurv; vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOpacity; uniform vec3 uTint;
      varying vec3 vN; varying vec3 vV; varying float vCurv; varying vec3 vP;
      void main(){
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float ridge = smoothstep(0.45, 0.75, vCurv);
        float sulcus = 1.0 - smoothstep(0.2, 0.45, vCurv);
        vec3 col = uTint * (fres * 0.9 + ridge * 0.75 + 0.05) * (1.0 - sulcus * 0.6);
        col += vec3(1.0, 0.55, 0.85) * pow(fres, 5.0) * 0.6;
        float sweep = pow(max(0.0, sin(vP.z * 6.0 - uTime * 0.9)), 30.0);
        col += uTint * sweep * ridge * 0.6;
        gl_FragColor = vec4(col * uOpacity, 1.0);
      }`,
  })
}

/** White-matter tracts: curves from deep structures fanning out to the cortex, with travelling pulses. */
function buildTracts(count: number): THREE.BufferGeometry {
  const rand = mulberry32(2024)
  const segs = 22
  const positions: number[] = []
  const colors: number[] = []
  const along: number[] = []
  const seeds: number[] = []
  const tmp = new THREE.Vector3()
  for (let c = 0; c < count; c++) {
    const hemi = rand() < 0.5 ? -1 : 1
    const start = new THREE.Vector3(hemi * (0.05 + rand() * 0.18), -0.05 + (rand() - 0.5) * 0.25, (rand() - 0.5) * 0.5)
    const dir = new THREE.Vector3(hemi * (0.3 + rand()), (rand() - 0.3) * 1.4, (rand() - 0.5) * 2).normalize()
    const end = new THREE.Vector3(dir.x * 0.62, dir.y * 0.5, dir.z * 0.86).multiplyScalar(0.92)
    if (rand() < 0.2) end.set(-hemi * 0.55 * rand(), 0.25 + rand() * 0.2, (rand() - 0.5) * 1.2) // callosal fibers crossing
    const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3((rand() - 0.5) * 0.2, 0.15 + rand() * 0.15, (rand() - 0.5) * 0.2))
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
    const pts = curve.getPoints(segs)
    const seed = rand()
    for (let i = 0; i < segs; i++) {
      for (const k of [i, i + 1]) {
        const p = pts[k]
        positions.push(p.x, p.y, p.z)
        tmp.copy(pts[Math.min(k + 1, segs)]).sub(pts[Math.max(k - 1, 0)]).normalize()
        colors.push(Math.abs(tmp.x) * 0.9 + 0.1, Math.abs(tmp.z) * 0.9 + 0.1, Math.abs(tmp.y) * 0.9 + 0.15)
        along.push(k / segs)
        seeds.push(seed)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1))
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1))
  return g
}

function makeTractMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aAlong; attribute float aSeed;
      varying vec3 vColor; varying float vAlong; varying float vSeed;
      void main(){ vColor = color; vAlong = aAlong; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOpacity; varying vec3 vColor; varying float vAlong; varying float vSeed;
      void main(){
        float pulse = pow(max(0.0, sin((vAlong * 3.0 - uTime * 0.7 - vSeed * 6.28) * 3.14159)), 20.0);
        vec3 col = vColor * (0.11 + pulse * 1.5);
        gl_FragColor = vec4(col * uOpacity, 1.0);
      }`,
  })
}

export function GlassBrain({ opacity = 1, beacon }: { opacity?: number; beacon?: string | null }) {
  const cortex = useMemo(buildCortex, [])
  const cerebellum = useMemo(buildCerebellum, [])
  const tracts = useMemo(() => buildTracts(380), [])
  const glass = useMemo(makeGlassMaterial, [])
  const glass2 = useMemo(makeGlassMaterial, [])
  const tractMat = useMemo(makeTractMaterial, [])
  useEffect(() => () => [cortex, cerebellum, tracts].forEach((g) => g.dispose()), [cortex, cerebellum, tracts])
  const beaconRef = useRef<THREE.Mesh>(null)
  useFrame((s) => {
    const t = s.clock.elapsedTime
    for (const m of [glass, glass2, tractMat]) {
      m.uniforms.uTime.value = t
      m.uniforms.uOpacity.value = opacity
    }
    beaconRef.current?.scale.setScalar(0.035 * (1 + Math.sin(t * 2.4) * 0.15))
  })
  return (
    <group>
      <mesh geometry={cortex} material={glass} />
      <mesh geometry={cerebellum} material={glass2} position={[0, -0.32, -0.55]} rotation={[0.35, 0, 0]} scale={0.85} />
      <mesh position={[0, -0.62, -0.25]} rotation={[0.3, 0, 0]} material={glass2}>
        <cylinderGeometry args={[0.1, 0.08, 0.55, 24, 1, true]} />
      </mesh>
      <lineSegments geometry={tracts} material={tractMat} />
      {beacon && (
        <mesh ref={beaconRef} position={[0.18, 0.12, 0.28]}>
          <sphereGeometry args={[1, 24, 24]} />
          <meshBasicMaterial color={new THREE.Color(beacon).multiplyScalar(6)} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

/** The trip world seen from outside: a glowing orb of the world's palette. */
export function WorldOrb({ variant }: { variant: 'positive' | 'challenging' }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uMode: { value: variant === 'positive' ? 0 : 1 } },
        vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uMode; varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){
            float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
            float swirl = sin(vP.y * 7.0 + sin(vP.x * 5.0 + uTime * 0.6) * 2.0 + uTime * 0.4) * 0.5 + 0.5;
            vec3 pos = mix(vec3(1.0, 0.6, 0.72), vec3(1.0, 0.85, 0.5), swirl);
            pos = mix(pos, vec3(0.45, 0.95, 0.9), smoothstep(0.3, 0.9, vP.y + 0.5) * 0.5);
            vec3 cha = mix(vec3(0.6, 1.0, 0.18), vec3(1.0, 0.2, 0.6), swirl) * 0.8 + vec3(1.0, 0.65, 0.2) * fres;
            vec3 col = mix(pos, cha, uMode) * (0.9 + fres * 2.5);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    [variant],
  )
  useFrame((s) => (material.uniforms.uTime.value = s.clock.elapsedTime))
  return (
    <mesh material={material}>
      <sphereGeometry args={[1, 64, 48]} />
    </mesh>
  )
}
