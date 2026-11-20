import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { NOISE_GLSL } from '../../shaders/noise'
import { mulberry32 } from '../../lib/random'

/**
 * The positive world's sky (after the user's references): a violet-to-coral sunset with a
 * huge pale moon and the first stars, a sea of clouds far below the floating islands, and
 * birds circling between them. All motion is slow; nothing flashes.
 */

export const SKY_FOG = new THREE.Color('#c97a9a')
export const SUN_LOW = new THREE.Vector3(-0.25, 0.06, -1).normalize()
const MOON = new THREE.Vector3(0.42, 0.36, -0.83).normalize()

export function SunsetSky() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uTime: { value: 0 }, uSun: { value: SUN_LOW.clone() }, uMoon: { value: MOON.clone() } },
        vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uSun, uMoon; varying vec3 vDir;
          ${NOISE_GLSL}
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 horizon = vec3(1.0, 0.62, 0.4);
            vec3 low = vec3(0.98, 0.45, 0.55);
            vec3 mid = vec3(0.55, 0.3, 0.62);
            vec3 zenith = vec3(0.12, 0.1, 0.3);
            vec3 col = mix(horizon, low, smoothstep(-0.02, 0.1, h));
            col = mix(col, mid, smoothstep(0.08, 0.32, h));
            col = mix(col, zenith, smoothstep(0.3, 0.85, h));
            // setting sun glow
            float s = max(dot(d, uSun), 0.0);
            col += vec3(1.0, 0.7, 0.45) * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.5 + pow(s, 3.0) * 0.18);
            // streaky sunset clouds lit from below
            vec2 sp = d.xz / (abs(h) + 0.12);
            float cl = fbm(vec3(sp * vec2(0.35, 1.2), uTime * 0.01));
            float band = smoothstep(0.02, 0.12, h) * (1.0 - smoothstep(0.25, 0.5, h));
            col = mix(col, mix(vec3(1.0, 0.55, 0.5), vec3(0.6, 0.3, 0.55), smoothstep(0.1, 0.4, h)), smoothstep(0.52, 0.72, cl) * band * 0.75);
            // stars in the violet zenith
            vec2 g = floor(d.xz / max(0.15, h + 0.2) * 260.0);
            float star = step(0.9978, hash(g)) * smoothstep(0.35, 0.7, h);
            col += vec3(star) * (0.7 + 0.3 * sin(uTime * 0.8 + g.x));
            // the moon: big and pale, a little hazy
            float md = acos(clamp(dot(d, uMoon), -1.0, 1.0));
            float disc = 1.0 - smoothstep(0.105, 0.11, md);
            float maria = fbm(d * 30.0);
            vec3 moon = mix(vec3(1.0, 0.92, 0.86), vec3(0.85, 0.74, 0.76), smoothstep(0.45, 0.7, maria));
            col = mix(col, moon, disc * 0.95);
            col += vec3(1.0, 0.85, 0.8) * exp(-md * 9.0) * 0.25;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    [],
  )
  useFrame((s) => (mat.uniforms.uTime.value = s.clock.elapsedTime))
  return (
    <mesh material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[800, 64, 32]} />
    </mesh>
  )
}

/** Sea of clouds below the islands: two drifting layers, warm on top, violet in the hollows. */
export function CloudSea({ y = -30 }: { y?: number }) {
  const make = (offset: number, alpha: number) =>
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: { value: 0 }, uOff: { value: offset }, uA: { value: alpha }, uFog: { value: SKY_FOG.clone() } },
      vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uOff, uA; uniform vec3 uFog; varying vec3 vW;
        ${NOISE_GLSL}
        void main() {
          vec2 p = vW.xz * 0.012 + vec2(uTime * 0.004 + uOff, uTime * 0.002);
          float n = fbm(vec3(p, uOff)) * 0.65 + fbm(vec3(p * 3.0, uOff + 2.0)) * 0.35;
          float puff = smoothstep(0.32, 0.68, n);
          vec3 top = vec3(1.0, 0.86, 0.82);
          vec3 shade = vec3(0.6, 0.42, 0.66);
          vec3 col = mix(shade, top, puff);
          col = mix(col, vec3(1.0, 0.7, 0.55), smoothstep(0.6, 0.9, n) * 0.35);
          float dist = length(vW.xz - cameraPosition.xz);
          col = mix(col, uFog, smoothstep(120.0, 700.0, dist));
          gl_FragColor = vec4(col, uA * (0.55 + 0.45 * puff) * (1.0 - smoothstep(600.0, 900.0, dist)));
        }`,
    })
  const a = useMemo(() => make(0, 1), [])
  const b = useMemo(() => make(7.3, 0.55), [])
  useFrame((s) => {
    a.uniforms.uTime.value = s.clock.elapsedTime
    b.uniforms.uTime.value = s.clock.elapsedTime
  })
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, y, 0]} material={a}>
        <planeGeometry args={[2000, 2000, 1, 1]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, y + 5, 0]} material={b}>
        <planeGeometry args={[2000, 2000, 1, 1]} />
      </mesh>
    </>
  )
}

/** A loose flock of birds wheeling between the islands (wings flap in the vertex shader). */
export function Birds({ count = 18 }: { count?: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    // body + two wings, nose toward +z
    const v = [0, 0, 0.35, -0.9, 0, -0.1, 0, 0, -0.25, 0, 0, 0.35, 0, 0, -0.25, 0.9, 0, -0.1]
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    g.computeVertexNormals()
    return g
  }, [])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          uniform float uTime;
          void main() {
            vec3 p = position;
            float phase = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.3;
            p.y += sin(uTime * 5.0 + phase) * abs(p.x) * 0.7;
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `void main(){ gl_FragColor = vec4(0.16, 0.1, 0.18, 1.0); }`,
      }),
    [],
  )
  const flock = useMemo(() => {
    const rand = mulberry32(42)
    return Array.from({ length: count }, () => ({ r: 30 + rand() * 60, y: 14 + rand() * 30, speed: 0.08 + rand() * 0.06, phase: rand() * Math.PI * 2, cx: (rand() - 0.5) * 40, cz: -20 + (rand() - 0.5) * 40, scale: 0.8 + rand() * 0.8 }))
  }, [count])
  const ref = useRef<THREE.InstancedMesh>(null)
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() }), [])
  useFrame((s) => {
    const mesh = ref.current
    if (!mesh) return
    const t = s.clock.elapsedTime
    mat.uniforms.uTime.value = t
    flock.forEach((b, i) => {
      const a = b.phase + t * b.speed
      tmp.p.set(b.cx + Math.cos(a) * b.r, b.y + Math.sin(t * 0.3 + b.phase) * 2, b.cz + Math.sin(a) * b.r)
      // fly along the circle's tangent
      tmp.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a)
      tmp.m.compose(tmp.p, tmp.q, tmp.s.setScalar(b.scale))
      mesh.setMatrixAt(i, tmp.m)
    })
    mesh.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geometry, mat, count]} frustumCulled={false} />
}
