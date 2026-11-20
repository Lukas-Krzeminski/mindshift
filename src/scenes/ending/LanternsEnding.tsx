import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { useGame } from '../../game/store'
import { sayLine } from '../../ui/captions'
import { showSymbol } from '../../ui/symbolStore'
import { fireFlash } from '../../ui/FlashOverlay'
import { CLOSING_LINE, INTEGRATION } from '../../content/captions'
import { usePostLook } from '../../fx/PostFX'
import { audio } from '../../audio/AudioManager'
import { mulberry32 } from '../../lib/random'
import { AlexAvatar } from '../../player/AlexAvatar'
import type { Locomotion } from '../../player/playerState'
import { CameraRig, useCleanup, useCues, useTimeline } from '../cinematics/Cinematics'
import type { CamKey } from '../cinematics/cameraPath'

/**
 * The good ending, for both worlds: Alex stands on a still lake before dawn. Hundreds of paper
 * lanterns lift off the water around her (everything she let go of) and gather in the sky into
 * her daughter's drawing, ME + MOM under a crayon sun, as the real sun rises behind it.
 */

const N = 420
const SKY = { x: 0, y: 46, z: -150, w: 128, h: 74 }
const END = 23

const ease = (x: number) => {
  const k = THREE.MathUtils.clamp(x, 0, 1)
  return k * k * (3 - 2 * k)
}

/** Draw the child's picture on a canvas, then sample evenly spaced points (and their crayon colours). */
function drawingTargets(count: number): { pos: THREE.Vector3; color: THREE.Color }[] {
  const W = 640
  const H = 370
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const stroke = (color: string, width: number, path: () => void) => {
    g.strokeStyle = color
    g.lineWidth = width
    g.beginPath()
    path()
    g.stroke()
  }
  // crayon sun, top right
  stroke('#ffb300', 11, () => g.arc(520, 92, 52, 0, Math.PI * 2))
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    stroke('#ff8f1f', 8, () => {
      g.moveTo(520 + Math.cos(a) * 72, 92 + Math.sin(a) * 72)
      g.lineTo(520 + Math.cos(a) * 104, 92 + Math.sin(a) * 104)
    })
  }
  // grass
  stroke('#5fcf6a', 9, () => {
    g.moveTo(40, 338)
    for (let x = 40; x <= 600; x += 28) g.lineTo(x, (x / 28) % 2 ? 318 : 340)
  })
  // mom (tall, long hair) and child holding hands
  const figure = (x: number, h: number, color: string, hair: boolean) => {
    const top = 330 - h
    stroke(color, 9, () => g.arc(x, top + 26, 24, 0, Math.PI * 2))
    if (hair)
      stroke('#c98a4a', 8, () => {
        g.moveTo(x - 24, top + 18)
        g.lineTo(x - 32, top + 80)
        g.moveTo(x + 24, top + 18)
        g.lineTo(x + 32, top + 80)
      })
    stroke(color, 9, () => {
      g.moveTo(x, top + 50)
      g.lineTo(x, top + h * 0.66)
      g.lineTo(x - 24, 330)
      g.moveTo(x, top + h * 0.66)
      g.lineTo(x + 24, 330)
      g.moveTo(x - 38, top + h * 0.38)
      g.lineTo(x + 38, top + h * 0.38)
    })
  }
  figure(230, 200, '#ff7aa8', true)
  figure(330, 130, '#5ac8ff', false)
  // heart between them
  stroke('#ff4f7a', 8, () => {
    const hx = 282
    const hy = 152
    g.moveTo(hx, hy + 16)
    g.bezierCurveTo(hx - 26, hy - 4, hx - 12, hy - 22, hx, hy - 8)
    g.bezierCurveTo(hx + 12, hy - 22, hx + 26, hy - 4, hx, hy + 16)
  })
  // ME + MOM, childlike lettering
  g.fillStyle = '#ffd27a'
  g.font = 'bold 54px "Comic Sans MS", "Segoe Print", cursive'
  g.save()
  g.translate(44, 82)
  g.rotate(-0.05)
  g.fillText('ME + MOM', 0, 0)
  g.restore()

  const data = g.getImageData(0, 0, W, H).data
  const pixels: number[] = []
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (data[(y * W + x) * 4 + 3] > 140) pixels.push(x, y)
  const rand = mulberry32(77)
  const order = Array.from({ length: pixels.length / 2 }, (_, i) => i).sort(() => rand() - 0.5)
  const picked: [number, number][] = []
  const minD2 = 7.5 * 7.5
  for (const i of order) {
    const x = pixels[i * 2]
    const y = pixels[i * 2 + 1]
    if (picked.every(([px, py]) => (px - x) ** 2 + (py - y) ** 2 > minD2)) picked.push([x, y])
    if (picked.length >= count) break
  }
  while (picked.length < count) picked.push(picked[Math.floor(rand() * picked.length)])
  return picked.map(([x, y]) => {
    const k = (y * W + x) * 4
    return {
      pos: new THREE.Vector3(SKY.x + (x / W - 0.5) * SKY.w, SKY.y + (0.5 - y / H) * SKY.h, SKY.z + (rand() - 0.5) * 4),
      color: new THREE.Color(data[k] / 255, data[k + 1] / 255, data[k + 2] / 255).lerp(new THREE.Color('#ffc98a'), 0.5),
    }
  })
}

function makeLanternMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vTint; varying float vSeed;
      void main() {
        vUv = uv;
        vTint = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
        #endif
        vSeed = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.11;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv; varying vec3 vTint; varying float vSeed;
      void main() {
        float ribs = 0.86 + 0.14 * abs(sin(vUv.x * 3.14159 * 8.0));
        float flame = 1.0 - vUv.y * 0.65;
        float flicker = 0.92 + 0.08 * sin(uTime * 2.1 + vSeed * 9.0);
        vec3 col = mix(vec3(1.0, 0.58, 0.24), vTint, 0.35) * (0.95 + flame * 0.75) * ribs * flicker;
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
}

function Lanterns({ time, mirrored = false, shared }: { time: RefObject<number>; mirrored?: boolean; shared: LanternData }) {
  const geometry = useMemo(() => new THREE.CylinderGeometry(0.32, 0.26, 0.62, 10, 1, false), [])
  const material = useMemo(makeLanternMaterial, [])
  const mesh = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const m = mesh.current
    if (!m) return
    shared.targets.forEach((t, i) => m.setColorAt(i, t.color))
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    material.needsUpdate = true
  }, [shared, material])
  useFrame((s) => {
    const m = mesh.current
    if (!m) return
    material.uniforms.uTime.value = s.clock.elapsedTime
    if (mirrored) {
      // reuse the primary lanterns' matrices
      ;(m.instanceMatrix.array as Float32Array).set(shared.matrices.array as Float32Array)
      m.instanceMatrix.needsUpdate = true
      return
    }
    const t = time.current ?? 0
    const tmp = shared.tmp
    for (let i = 0; i < N; i++) {
      const L = shared.launch[i]
      const k = ease((t - L.at) / L.dur)
      const s0 = L.start
      const s1 = L.ctrl
      const s2 = shared.targets[i].pos
      // quadratic path from the water, up and out, into place in the drawing
      tmp.p.copy(s0).multiplyScalar((1 - k) * (1 - k)).addScaledVector(s1, 2 * (1 - k) * k).addScaledVector(s2, k * k)
      const bob = Math.sin(s.clock.elapsedTime * 0.8 + i) * (k < 1 ? 0.25 : 0.4)
      tmp.p.y += bob
      tmp.p.x += Math.sin(s.clock.elapsedTime * 0.5 + i * 1.7) * 0.3 * (1 - k)
      const scale = THREE.MathUtils.lerp(0.55, 3.0, k)
      tmp.m.compose(tmp.p, tmp.q.setFromEuler(tmp.e.set(0, i, Math.sin(s.clock.elapsedTime + i) * 0.08 * (1 - k))), tmp.s.setScalar(scale))
      m.setMatrixAt(i, tmp.m)
    }
    m.instanceMatrix.needsUpdate = true
    ;(shared.matrices.array as Float32Array).set(m.instanceMatrix.array as Float32Array)
  })
  return <instancedMesh ref={mesh} args={[geometry, material, N]} frustumCulled={false} />
}

interface LanternData {
  targets: { pos: THREE.Vector3; color: THREE.Color }[]
  launch: { at: number; dur: number; start: THREE.Vector3; ctrl: THREE.Vector3 }[]
  matrices: THREE.InstancedBufferAttribute
  tmp: { p: THREE.Vector3; m: THREE.Matrix4; q: THREE.Quaternion; e: THREE.Euler; s: THREE.Vector3 }
}

function useLanternData(): LanternData {
  return useMemo(() => {
    const targets = drawingTargets(N)
    const rand = mulberry32(9)
    const launch = targets.map((tg) => {
      const a = rand() * Math.PI * 2
      const r = 3 + Math.pow(rand(), 0.7) * 40
      const start = new THREE.Vector3(Math.cos(a) * r, 0.35, -6 + Math.sin(a) * r * 0.8)
      const ctrl = start.clone().lerp(tg.pos, 0.35).add(new THREE.Vector3((rand() - 0.5) * 20, 18 + rand() * 14, 10))
      // first lanterns lift right beside Alex; the rest follow in a slow wave
      const at = 1.2 + Math.min(1, r / 43) * 5.5 + rand() * 1.6
      return { at, dur: 7.5 + rand() * 3, start, ctrl }
    })
    return {
      targets,
      launch,
      matrices: new THREE.InstancedBufferAttribute(new Float32Array(N * 16), 16),
      tmp: { p: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3() },
    }
  }, [])
}

/** Pre-dawn to sunrise: indigo zenith, rose band, gold horizon; the sun climbs as the drawing completes. */
function DawnDome({ sun }: { sun: RefObject<number> }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uSun: { value: 0 }, uTime: { value: 0 } },
        vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uSun, uTime; varying vec3 vDir;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          void main() {
            float h = vDir.y;
            vec3 zenith = mix(vec3(0.05, 0.05, 0.18), vec3(0.22, 0.28, 0.55), uSun);
            vec3 mid = mix(vec3(0.42, 0.22, 0.48), vec3(0.95, 0.55, 0.62), uSun);
            vec3 horizon = mix(vec3(0.95, 0.55, 0.35), vec3(1.0, 0.82, 0.52), uSun);
            vec3 col = mix(horizon, mid, smoothstep(0.0, 0.18, h));
            col = mix(col, zenith, smoothstep(0.15, 0.7, h));
            // the sun, rising straight ahead (-z)
            vec3 sunDir = normalize(vec3(0.62, mix(-0.12, 0.07, uSun), -1.0));
            float d = max(dot(vDir, sunDir), 0.0);
            col += vec3(1.0, 0.78, 0.5) * (pow(d, 900.0) * 5.0 + pow(d, 40.0) * 0.45 * uSun + pow(d, 5.0) * 0.12 * uSun);
            // stars fade as the sky brightens
            vec2 g = floor(vDir.xz / max(0.2, vDir.y + 0.3) * 220.0);
            float star = step(0.9975, hash(g)) * smoothstep(0.1, 0.5, h) * (1.0 - uSun);
            col += vec3(star) * (0.6 + 0.4 * sin(uTime * 0.9 + g.x));
            col = mix(col, vec3(0.0), (1.0 - smoothstep(-0.25, -0.02, h)) * 0.6);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    [],
  )
  useFrame((s) => {
    mat.uniforms.uSun.value = sun.current ?? 0
    mat.uniforms.uTime.value = s.clock.elapsedTime
  })
  return (
    <mesh material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[600, 48, 24]} />
    </mesh>
  )
}

/** Still, dark lake: mirrors the sky colour; translucent so the mirrored lanterns show through. */
function StillLake({ sun }: { sun: RefObject<number> }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        uniforms: { uSun: { value: 0 }, uTime: { value: 0 } },
        vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `
          uniform float uSun, uTime; varying vec3 vW;
          void main() {
            vec3 v = normalize(cameraPosition - vW);
            float fres = pow(1.0 - max(v.y, 0.0), 3.0);
            vec3 deep = mix(vec3(0.02, 0.02, 0.07), vec3(0.07, 0.05, 0.14), uSun);
            vec3 sky = mix(vec3(0.45, 0.24, 0.34), vec3(0.8, 0.5, 0.48), uSun);
            float ripple = sin(vW.x * 0.35 + uTime * 0.4) * sin(vW.z * 0.42 - uTime * 0.3) * 0.04;
            vec3 col = mix(deep, sky, clamp(fres * 0.75 + ripple, 0.0, 1.0));
            gl_FragColor = vec4(col, 0.82);
          }`,
      }),
    [],
  )
  useFrame((s) => {
    mat.uniforms.uSun.value = sun.current ?? 0
    mat.uniforms.uTime.value = s.clock.elapsedTime
  })
  return (
    <mesh rotation-x={-Math.PI / 2} material={mat}>
      <planeGeometry args={[1200, 1200, 1, 1]} />
    </mesh>
  )
}

/** Low mountain silhouettes on the horizon for depth. */
function Ridges() {
  const geo = useMemo(() => {
    const rand = mulberry32(5)
    const pts: THREE.Vector2[] = [new THREE.Vector2(-420, 0)]
    for (let x = -420; x <= 420; x += 14) pts.push(new THREE.Vector2(x, 10 + rand() * 18 + Math.sin(x * 0.02) * 10))
    pts.push(new THREE.Vector2(420, 0))
    return new THREE.ShapeGeometry(new THREE.Shape(pts))
  }, [])
  return (
    <mesh geometry={geo} position={[0, -0.5, -330]}>
      <meshBasicMaterial color="#1c1430" fog={false} />
    </mesh>
  )
}

const KEYS: CamKey[] = [
  { t: 0, pos: [1.3, 1.25, 5.2], look: [0, 1.4, -10], fov: 48 },
  { t: 6, pos: [2.6, 2.4, 9], look: [0, 10, -60], fov: 50 },
  { t: 14, pos: [0.5, 4.5, 15], look: [0, 34, -140], fov: 56 },
  { t: END, pos: [0, 6.5, 19], look: [0, 40, -140], fov: 58 },
]

export function LanternsEnding() {
  const time = useTimeline()
  useCleanup()
  const branch = useGame((s) => s.flow.branch) ?? 'positive'
  const sun = useRef(0)
  const shared = useLanternData()
  const loco = useRef<Locomotion>({ speed: 0, grounded: true, airTime: 0, sinceJump: 9, landing: 0 })
  usePostLook({ bloomThreshold: 0.85, bloomIntensity: 0.9, bloomRadius: 0.75, vignette: 0.6, toneMapping: 'aces', contrast: 0.12, saturation: 0.16 })
  useEffect(() => audio.ambience('results'), [])
  useCues(time, [
    [1.2, () => audio.chime([392, 523.25], 2.5)],
    [2.4, () => showSymbol('lanterns')],
    [3.6, () => sayLine(INTEGRATION[branch], 'alex'), 'hold'],
    [10.5, () => sayLine(INTEGRATION.caption.text, 'lab'), 'hold'],
    [14.5, () => audio.resolveChord()],
    [16.8, () => sayLine(CLOSING_LINE, 'narrator'), 'hold'],
    [END - 0.7, () => {}, 'hold'],
    [END - 0.6, () => fireFlash()],
    [END, () => useGame.getState().dispatch({ type: 'NEXT' })],
  ])
  useFrame(() => {
    sun.current = ease(((time.current ?? 0) - 9) / 9)
  })
  return (
    <>
      <color attach="background" args={['#0b0a1c']} />
      <fog attach="fog" args={['#2a1a33', 60, 420]} />
      <DawnDome sun={sun} />
      <Ridges />
      <hemisphereLight args={['#ffd2c2', '#20183a', 0.7]} />
      <StillLake sun={sun} />
      <Lanterns time={time} shared={shared} />
      <group scale={[1, -1, 1]}>
        <Lanterns time={time} shared={shared} mirrored />
      </group>
      <group rotation={[0, Math.PI, 0]}>
        <AlexAvatar look="positive" loco={loco} />
      </group>
      <Sparkles count={160} scale={[60, 6, 60]} position={[0, 1.5, -10]} size={3} speed={0.2} opacity={0.6} color="#ffe2b8" />
      <CameraRig keys={KEYS} time={time} />
    </>
  )
}
