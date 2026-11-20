import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { NOISE_GLSL } from '../../shaders/noise'
import { mulberry32 } from '../../lib/random'
import { SKY_FOG, SUN_LOW } from './FloatSky'
import { WATER_Y } from './LightWater'

/**
 * Floating islands for the positive world (after the user's references): tall rock pillars
 * with moss and lush meadows, trees, and waterfalls pouring into the clouds. Memory islands
 * are marked by a beacon; small stepping-stone rocks make the parkour route between them.
 */

export interface IslandDef {
  center: [number, number, number] // x, top surface y, z
  radius: number
  /** Rim angle (radians) where the waterfall spills over. */
  fallAngle: number
  /** How far the rock pillar hangs below the meadow, in radii. */
  depth?: number
  /** Number of trees on the meadow. */
  trees?: number
}

const ease = (x: number) => {
  const k = THREE.MathUtils.clamp(x, 0, 1)
  return k * k * (3 - 2 * k)
}

/** Small deterministic 3D value noise for shaping rock on the CPU. */
function noise3(x: number, y: number, z: number): number {
  const h = (a: number, b: number, c: number) => {
    const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
    return s - Math.floor(s)
  }
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  const fx = x - ix
  const fy = y - iy
  const fz = z - iz
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const w = fz * fz * (3 - 2 * fz)
  const lerp = THREE.MathUtils.lerp
  const c = (dx: number, dy: number, dz: number) => h(ix + dx, iy + dy, iz + dz)
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  )
}

/** Hanging rock pillar: wide under the meadow, cliff-like sides, tapering to a jagged point. */
function rockGeometry(radius: number, depth: number, seed: number): THREE.BufferGeometry {
  const profile = [
    [1.0, 0],
    [1.05, -0.03],
    [1.0, -0.1],
    [0.96, -0.22],
    [0.9, -0.36],
    [0.78, -0.5],
    [0.62, -0.64],
    [0.44, -0.78],
    [0.24, -0.9],
    [0.08, -0.97],
    [0.0, -1.0],
  ].map(([r, y]) => new THREE.Vector2(r * radius, y * depth))
  const g = new THREE.LatheGeometry(profile, 64)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const r = Math.hypot(v.x, v.z)
    if (r < 1e-4) continue
    // vertical cliff fluting + lumps; the rim stays round so the meadow fits
    const ang = Math.atan2(v.z, v.x)
    const flute = Math.sin(ang * 9 + seed) * 0.05 + Math.sin(ang * 23 + seed * 2) * 0.025
    const n = noise3(v.x * 0.3 + seed, v.y * 0.25, v.z * 0.3) * 0.8 + noise3(v.x, v.y * 1.2 + seed, v.z) * 0.3
    const k = 1 + ((n - 0.55) * 0.3 + flute) * Math.min(1, -v.y / (depth * 0.08) + 0.05)
    v.x *= k
    v.z *= k
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

const FOG_GLSL = /* glsl */ `
  uniform vec3 uFog;
  vec3 applyFog(vec3 col, float dist) { return mix(col, uFog, smoothstep(90.0, 520.0, dist)); }
`

function makeRockMaterial(depth: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uDepth: { value: depth }, uFog: { value: SKY_FOG.clone() }, uSun: { value: SUN_LOW.clone() }, uFound: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vW; varying vec3 vN; varying float vY; varying float vDist;
      void main() {
        vY = position.y;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * w;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uDepth, uFound; uniform vec3 uSun;
      ${NOISE_GLSL}
      ${FOG_GLSL}
      varying vec3 vW; varying vec3 vN; varying float vY; varying float vDist;
      void main() {
        vec3 n = normalize(vN);
        vec3 v = normalize(cameraPosition - vW);
        float h = clamp(-vY / uDepth, 0.0, 1.0);
        // layered cliff stone: warm grey strata, darker and violet toward the tip
        float strata = 0.5 + 0.5 * sin(vY * 2.2 + fbm(vW * 0.4) * 3.0);
        vec3 stone = mix(vec3(0.46, 0.4, 0.38), vec3(0.32, 0.28, 0.3), strata);
        stone = mix(stone, vec3(0.16, 0.12, 0.2), pow(h, 0.8));
        stone *= 0.75 + 0.35 * fbm(vW * 1.3);
        // moss and hanging greenery just under the meadow
        float moss = (1.0 - smoothstep(0.03, 0.2 + 0.1 * fbm(vW * 0.8), h)) * smoothstep(0.35, 0.6, fbm(vW * 0.9 + 3.0) + 0.3);
        stone = mix(stone, vec3(0.2, 0.36, 0.16), moss);
        // sunset light from the low sun, violet sky fill, pink rim
        float lambert = max(dot(n, normalize(uSun + vec3(0.0, 0.35, 0.0))), 0.0);
        vec3 col = stone * (vec3(0.46, 0.38, 0.55) + vec3(1.0, 0.68, 0.5) * lambert * 0.9);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        col += vec3(1.0, 0.62, 0.62) * fres * 0.22;
        // faint crystal veins that glow gold once the memory is found
        float vein = 1.0 - smoothstep(0.0, 0.04, abs(fract(fbm(vW * 0.35) * 4.0) - 0.5));
        col += mix(vec3(0.55, 0.85, 1.0), vec3(1.0, 0.82, 0.5), uFound) * vein * (0.12 + 0.5 * uFound) * h;
        gl_FragColor = vec4(applyFog(col, vDist), 1.0);
      }`,
  })
}

function makeMeadowMaterial(radius: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uR: { value: radius }, uFog: { value: SKY_FOG.clone() }, uFound: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vP; varying float vDist; varying vec3 vW;
      void main() {
        vP = position.xy;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uR, uFound;
      ${NOISE_GLSL}
      ${FOG_GLSL}
      varying vec2 vP; varying float vDist; varying vec3 vW;
      void main() {
        float r = length(vP) / uR;
        float n = fbm(vec3(vP * 0.45, 1.0));
        vec3 grass = mix(vec3(0.22, 0.45, 0.18), vec3(0.45, 0.62, 0.25), n);
        grass *= 0.85 + 0.25 * vnoise(vec3(vP * 4.0, 2.0));
        // wildflowers: pink, violet, white; gold once the memory is found
        float f = vnoise(vec3(vP * 9.0, 5.0));
        float speck = smoothstep(0.84, 0.9, f);
        vec3 flower = mix(mix(vec3(1.0, 0.55, 0.75), vec3(0.75, 0.55, 1.0), step(0.5, vnoise(vec3(vP * 3.0, 9.0)))), vec3(1.0, 0.82, 0.4), uFound);
        vec3 col = mix(grass, flower, speck * 0.9);
        // warm sunset light, rim of the cliff edge a touch darker
        col *= vec3(1.15, 0.95, 0.9);
        col *= 1.0 - smoothstep(0.88, 1.02, r) * 0.35;
        gl_FragColor = vec4(applyFog(col, vDist), 1.0);
      }`,
  })
}

function makeFallMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        float streak = vnoise(vec3(vUv.x * 16.0, vUv.y * 3.0 + uTime * 1.2, 0.0));
        float flow = smoothstep(0.25, 0.9, streak);
        float edge = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
        float fade = smoothstep(0.0, 0.4, vUv.y);
        vec3 col = mix(vec3(0.85, 0.88, 1.0), vec3(1.0, 0.86, 0.9), 1.0 - vUv.y) * (0.75 + 0.35 * flow);
        gl_FragColor = vec4(col, edge * fade * (0.45 + 0.45 * flow));
      }`,
  })
}

/** Stylised trees (trunk + clustered foliage) for all islands, instanced. */
export function Trees({ islands }: { islands: IslandDef[] }) {
  const data = useMemo(() => {
    const trunks: THREE.Matrix4[] = []
    const leaves: { m: THREE.Matrix4; c: THREE.Color }[] = []
    const greens = ['#6aa84f', '#8cc152', '#5a9a46', '#a3cf62'].map((c) => new THREE.Color(c))
    islands.forEach((isl, k) => {
      const rand = mulberry32(100 + k * 17)
      const [x, top, z] = isl.center
      const count = isl.trees ?? 0
      for (let i = 0; i < count; i++) {
        const a = rand() * Math.PI * 2
        const d = isl.radius * (0.45 + rand() * 0.42)
        const px = x + Math.cos(a) * d
        const pz = z + Math.sin(a) * d
        const h = 2.4 + rand() * 2.6
        trunks.push(new THREE.Matrix4().compose(new THREE.Vector3(px, top + h / 2, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.15, 0, (rand() - 0.5) * 0.15)), new THREE.Vector3(0.22 + h * 0.03, h, 0.22 + h * 0.03)))
        for (let b = 0; b < 4; b++) {
          const s = 1.2 + rand() * 1.2 + h * 0.15
          leaves.push({
            m: new THREE.Matrix4().compose(new THREE.Vector3(px + (rand() - 0.5) * 1.6, top + h + (rand() - 0.2) * 1.2, pz + (rand() - 0.5) * 1.6), new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3)), new THREE.Vector3(s, s * 0.8, s)),
            c: greens[Math.floor(rand() * greens.length)],
          })
        }
      }
    })
    return { trunks, leaves }
  }, [islands])
  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const leafRef = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    data.trunks.forEach((m, i) => trunkRef.current?.setMatrixAt(i, m))
    if (trunkRef.current) trunkRef.current.instanceMatrix.needsUpdate = true
    data.leaves.forEach((l, i) => {
      leafRef.current?.setMatrixAt(i, l.m)
      leafRef.current?.setColorAt(i, l.c)
    })
    if (leafRef.current) {
      leafRef.current.instanceMatrix.needsUpdate = true
      if (leafRef.current.instanceColor) leafRef.current.instanceColor.needsUpdate = true
    }
  }, [data])
  if (!data.trunks.length) return null
  return (
    <>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, data.trunks.length]} castShadow>
        <cylinderGeometry args={[0.7, 1, 1, 7]} />
        <meshStandardMaterial color="#7a5a48" roughness={0.9} emissive="#2a1a12" emissiveIntensity={0.5} />
      </instancedMesh>
      <instancedMesh ref={leafRef} args={[undefined, undefined, data.leaves.length]}>
        <icosahedronGeometry args={[0.8, 1]} />
        <meshStandardMaterial roughness={0.8} flatShading emissive="#3a5a22" emissiveIntensity={0.55} />
      </instancedMesh>
    </>
  )
}

/**
 * An island: rock pillar, meadow, grass, and a waterfall pouring off one edge (down to `fallTo`,
 * e.g. the sea's surface, or far below into the clouds). Its haze follows the scene's fog colour.
 */
export function FloatingIsland({ def, found = false, fall = true, fallTo }: { def: IslandDef; found?: boolean; fall?: boolean; fallTo?: number }) {
  const [x, top, z] = def.center
  const depth = def.radius * (def.depth ?? 2.2)
  const rock = useMemo(() => rockGeometry(def.radius, depth, x * 0.13 + z * 0.07), [def.radius, depth, x, z])
  const rockMat = useMemo(() => makeRockMaterial(depth), [depth])
  const meadow = useMemo(() => makeMeadowMaterial(def.radius), [def.radius])
  const fallMat = useMemo(makeFallMaterial, [])
  const k = useRef(0)
  const fog = useThree((s) => s.scene.fog)
  useEffect(() => () => rock.dispose(), [rock])
  useEffect(() => {
    if (!fog) return
    rockMat.uniforms.uFog.value.copy(fog.color)
    meadow.uniforms.uFog.value.copy(fog.color)
  }, [fog, rockMat, meadow])
  useFrame((s, dt) => {
    const t = s.clock.elapsedTime
    k.current = THREE.MathUtils.clamp(k.current + (found ? dt * 0.6 : -dt), 0, 1)
    rockMat.uniforms.uTime.value = t
    rockMat.uniforms.uFound.value = k.current
    meadow.uniforms.uTime.value = t
    meadow.uniforms.uFound.value = k.current
    fallMat.uniforms.uTime.value = t
  })
  const fx = Math.cos(def.fallAngle)
  const fz = Math.sin(def.fallAngle)
  const fallLen = fallTo !== undefined ? Math.max(1, top - fallTo) : depth * 1.6 + 30
  return (
    <group>
      <group position={[x, top, z]}>
        <mesh geometry={rock} material={rockMat} />
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} material={meadow}>
          <circleGeometry args={[def.radius * 1.04, 64]} />
        </mesh>
      </group>
      {fall && (
        <>
          <mesh position={[x + fx * def.radius * 1.03, top - fallLen / 2, z + fz * def.radius * 1.03]} rotation={[0, Math.atan2(fx, fz), 0]} material={fallMat}>
            <planeGeometry args={[Math.min(3.4, def.radius * 0.6), fallLen, 1, 1]} />
          </mesh>
          <Sparkles count={24} scale={[3, 3, 3]} position={[x + fx * (def.radius + 0.6), top - 1, z + fz * (def.radius + 0.6)]} size={5} speed={0.6} color="#ffffff" opacity={0.7} />
        </>
      )}
    </group>
  )
}

/** Rising spiral of light next to an island: stepping in shoots Alex up to the meadow. */
export function UpdraftColumn({ x, z, top, r, dim }: { x: number; z: number; top: number; r: number; dim: boolean }) {
  const height = top + 2.2
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uI: { value: 1 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uI; varying vec2 vUv;
          void main() {
            float s = fract(vUv.x * 5.0 + vUv.y * 2.2 - uTime * 0.45);
            float band = smoothstep(0.0, 0.12, s) * smoothstep(0.42, 0.18, s);
            float fade = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
            vec3 col = mix(vec3(0.55, 1.0, 0.92), vec3(1.0, 0.9, 0.7), vUv.y) * (band * 0.65 + 0.12) * fade * uI;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    [],
  )
  const ring = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#bffff2').multiplyScalar(1.6), transparent: true, toneMapped: false, depthWrite: false }), [])
  useFrame((s) => {
    mat.uniforms.uTime.value = s.clock.elapsedTime
    mat.uniforms.uI.value = THREE.MathUtils.lerp(mat.uniforms.uI.value, dim ? 0.35 : 1, 0.05)
    ring.opacity = (dim ? 0.3 : 0.75) + 0.2 * Math.sin(s.clock.elapsedTime * 2.2)
  })
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, height / 2, 0]} material={mat}>
        <cylinderGeometry args={[r, r * 0.85, height, 40, 1, true]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, WATER_Y + 0.04, 0]} material={ring}>
        <ringGeometry args={[r - 0.12, r + 0.12, 64]} />
      </mesh>
      <Sparkles count={36} scale={[r * 1.6, height, r * 1.6]} position={[0, height / 2, 0]} size={4} speed={1.4} color="#e8fff9" opacity={dim ? 0.4 : 0.9} />
    </group>
  )
}

/** Tall beam above an unfound memory so the goal is visible from anywhere. */
export function Beacon({ position, visible }: { position: [number, number, number]; visible: boolean }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uI: { value: 1 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uI; varying vec2 vUv;
          void main() {
            float up = pow(1.0 - vUv.y, 1.6);
            float pulse = 0.75 + 0.25 * sin(vUv.y * 14.0 - uTime * 2.4);
            float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
            gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * up * pulse * 0.7 * uI * (0.6 + 0.4 * edge), 1.0);
          }`,
      }),
    [],
  )
  const ref = useRef<THREE.Group>(null)
  useFrame((s, dt) => {
    mat.uniforms.uTime.value = s.clock.elapsedTime
    mat.uniforms.uI.value = THREE.MathUtils.clamp(mat.uniforms.uI.value + (visible ? dt : -dt * 0.8), 0, 1)
    if (ref.current) ref.current.visible = mat.uniforms.uI.value > 0.01
  })
  return (
    <group ref={ref} position={position}>
      <mesh position={[0, 36, 0]} material={mat}>
        <cylinderGeometry args={[0.45, 1.5, 72, 24, 1, true]} />
      </mesh>
    </group>
  )
}

/**
 * The moment a memory is found: a shockwave across the meadow and the sea, a pillar of light,
 * and a burst of petals in the memory's colors.
 */
export function MemoryBurst({ origin, top, palette }: { origin: [number, number, number]; top: number; palette: string[] }) {
  const t0 = useRef(-1)
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe2a8').multiplyScalar(2.2), transparent: true, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), [])
  const waterMat = useMemo(() => ringMat.clone(), [ringMat])
  const pillarMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uI: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `uniform float uI; varying vec2 vUv; void main(){ float up = pow(1.0 - vUv.y, 1.2); gl_FragColor = vec4(vec3(1.0, 0.9, 0.7) * up * uI, 1.0); }`,
      }),
    [],
  )
  const N = 280
  const petals = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const dir = new Float32Array(N * 3)
    const col = new Float32Array(N * 3)
    const spd = new Float32Array(N)
    const colors = palette.map((c) => new THREE.Color(c))
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2
      const up = 0.25 + Math.random() * 0.9
      const v = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize()
      dir.set([v.x, v.y, v.z], i * 3)
      colors[i % colors.length].toArray(col, i * 3)
      spd[i] = 4 + Math.random() * 9
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3))
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3))
    g.setAttribute('aSpd', new THREE.BufferAttribute(spd, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 80)
    return g
  }, [palette])
  const petalMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uT: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute vec3 aDir; attribute vec3 aCol; attribute float aSpd;
          uniform float uT; varying vec3 vCol; varying float vA;
          void main() {
            float t = uT;
            float travel = aSpd * (1.0 - exp(-t * 1.6)) / 1.6;
            vec3 p = aDir * travel + vec3(0.0, -0.6 * t * t, 0.0);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vCol = aCol;
            vA = smoothstep(3.2, 0.6, t) * step(0.001, t);
            gl_PointSize = (22.0 / -mv.z) * 30.0 * (0.6 + 0.4 * fract(aSpd * 7.3));
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vCol; varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            float a = pow(max(0.0, 1.0 - d), 2.0) * vA;
            gl_FragColor = vec4(vCol * 2.2 * a, 1.0);
          }`,
      }),
    [],
  )
  const top_ = useRef<THREE.Mesh>(null)
  const water = useRef<THREE.Mesh>(null)
  const pillar = useRef<THREE.Mesh>(null)
  useFrame((s) => {
    if (t0.current < 0) t0.current = s.clock.elapsedTime
    const t = s.clock.elapsedTime - t0.current
    const k1 = THREE.MathUtils.clamp(t / 2.4, 0, 1)
    const k2 = THREE.MathUtils.clamp((t - 0.25) / 3.2, 0, 1)
    top_.current?.scale.setScalar(0.5 + Math.sqrt(k1) * 30)
    water.current?.scale.setScalar(0.5 + Math.sqrt(k2) * 60)
    ringMat.opacity = (1 - k1) * (1 - k1)
    waterMat.opacity = (1 - k2) * (1 - k2) * 0.8
    const p = THREE.MathUtils.clamp(t / 1.8, 0, 1)
    pillarMat.uniforms.uI.value = Math.sin(Math.min(1, p * 3) * Math.PI * 0.5) * (1 - p) * 0.55
    pillar.current?.scale.set(0.4 + p * 1.6, 1, 0.4 + p * 1.6)
    petalMat.uniforms.uT.value = t
  })
  return (
    <>
      <mesh ref={top_} rotation-x={-Math.PI / 2} position={[origin[0], top + 0.15, origin[2]]} material={ringMat}>
        <ringGeometry args={[0.92, 1, 96]} />
      </mesh>
      <mesh ref={water} rotation-x={-Math.PI / 2} position={[origin[0], top + 0.08, origin[2]]} material={waterMat}>
        <ringGeometry args={[0.95, 1, 128]} />
      </mesh>
      <mesh ref={pillar} position={[origin[0], top + 45, origin[2]]} material={pillarMat}>
        <cylinderGeometry args={[1, 1, 90, 32, 1, true]} />
      </mesh>
      <points geometry={petals} material={petalMat} position={origin} frustumCulled={false} />
    </>
  )
}

/** A thread of light that draws itself from a found memory to the Tree of Connection. */
export function LightThread({ from, to, boost }: { from: THREE.Vector3; to: THREE.Vector3; boost: RefObject<number> }) {
  const geometry = useMemo(() => {
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 16, 0))
    return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, mid, to), 120, 0.2, 8, false)
  }, [from, to])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uP: { value: 0 }, uTime: { value: 0 }, uBoost: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uP, uTime, uBoost; varying vec2 vUv;
          void main() {
            float drawn = step(vUv.x, uP);
            float head = exp(-pow((vUv.x - uP) * 30.0, 2.0)) * step(uP, 0.999);
            float pulse = pow(max(0.0, sin((vUv.x * 6.0 - uTime * 0.8) * 3.14159)), 12.0);
            vec3 col = vec3(1.0, 0.84, 0.55) * (drawn * (0.8 + pulse * 1.1 + uBoost * 2.2) + head * 3.0);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    [],
  )
  const t0 = useRef(-1)
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame((s) => {
    if (t0.current < 0) t0.current = s.clock.elapsedTime
    const t = s.clock.elapsedTime - t0.current
    mat.uniforms.uP.value = ease((t - 0.6) / 2.4)
    mat.uniforms.uTime.value = s.clock.elapsedTime
    mat.uniforms.uBoost.value = boost.current ?? 0
  })
  return <mesh geometry={geometry} material={mat} frustumCulled={false} />
}
