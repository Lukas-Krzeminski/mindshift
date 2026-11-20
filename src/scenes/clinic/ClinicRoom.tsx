import { Suspense, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { useGame } from '../../game/store'
import { QUALITY_PRESETS } from '../../quality/presets'
import { Person, type PersonRig } from './people'
import { crayonTexture } from '../shallows/MemoryShards'
import { Prop, ROOM_HDRI, useChairSeat } from './Props'
import { ContactShadows, Environment } from '@react-three/drei'
import type { GarmentColors } from '../../player/garment'

/**
 * The session room: living-room-like (as in published trial settings), dusk light through
 * linen curtains, a cool rim light, plants, Alex's own painting, the couch and the
 * therapist's chair. All geometry is procedural.
 */
const ALEX_CLOTHES: GarmentColors = { top: '#8fa58a', pants: '#3d4a6b', shoes: '#2b2622' }
const THERAPIST_CLOTHES: GarmentColors = { top: '#c7b49b', pants: '#2f3440', shoes: '#1f1b18' }

const ALEX_CHAIR = { pos: [-0.55, 0, -1.25] as [number, number, number], yaw: 0.6 }
const THERAPIST_CHAIR = { pos: [1.35, 0, -0.5] as [number, number, number], yaw: -1.2 }
export const TRAY_POS = new THREE.Vector3(0.55, 0.56, -1.5)
const UP = new THREE.Vector3(0, 1, 0)
/**
 * The Poly Haven armchair is oversized for these characters (55 cm seat, 67 cm deep): at full
 * size their calves pass through the cushion front and their feet dangle. At 80 % it is a normal
 * 44 cm seat that fits their thigh and shin lengths.
 */
const CHAIR_SCALE = 0.8
/**
 * Hip-joint target per sitter, in chair space (y up, z forward from the backrest). The fine offsets
 * come from a penetration search against the real chair geometry (every clothing point outside the
 * chair, with about 1 cm of clearance).
 */
const SEAT_FIT = { alex: { y: 0.006, z: 0.032 }, therapist: { y: 0.023, z: 0.09 } }
function seatTarget(chair: { pos: [number, number, number]; yaw: number }, seat: { seatY: number; backZ: number }, fit: { y: number; z: number }): [number, number, number] {
  const v = new THREE.Vector3(0, seat.seatY * CHAIR_SCALE + 0.09 + fit.y, seat.backZ * CHAIR_SCALE + 0.2 + fit.z)
    .applyAxisAngle(UP, chair.yaw)
    .add(new THREE.Vector3(...chair.pos))
  return [v.x, v.y, v.z]
}

function woodFloorMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vW;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        float plank = floor(vW.x / 0.19);
        float off = h(plank) * 3.0;
        float seg = floor((vW.z + off) / 1.4);
        float tone = 0.8 + 0.2 * h(plank * 7.0 + seg);
        float grain = 0.92 + 0.08 * sin(vW.z * 38.0 + sin(vW.x * 6.0 + plank) * 2.0);
        vec3 wood = vec3(0.42, 0.27, 0.18) * tone * grain;
        float gap = smoothstep(0.0, 0.006, fract(vW.x / 0.19)) * smoothstep(0.0, 0.006, fract((vW.z + off) / 1.4));
        wood *= 0.72 + 0.28 * gap;
        float pool = exp(-dot(vW.xz - vec2(-1.9, -0.5), vW.xz - vec2(-1.9, -0.5)) * 0.45);
        vec3 col = wood * (0.32 + pool * 1.25) + vec3(1.0, 0.62, 0.4) * pool * 0.22;
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
}

/** Alex's abstract painting: swirls in the same palette as the Luminous Shallows. */
function paintingTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 640
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, c.height)
  grad.addColorStop(0, '#2a2f5c')
  grad.addColorStop(0.5, '#d97a9a')
  grad.addColorStop(1, '#f2c67a')
  g.fillStyle = grad
  g.fillRect(0, 0, c.width, c.height)
  let s = 11
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 26; i++) {
    g.globalAlpha = 0.35 + r() * 0.4
    g.strokeStyle = ['#5fe0d0', '#ffd27a', '#ffb3c7', '#9b7bff', '#ffffff'][i % 5]
    g.lineWidth = 6 + r() * 22
    g.beginPath()
    g.arc(r() * c.width, r() * c.height, 30 + r() * 160, r() * 6, r() * 6 + 2 + r() * 3)
    g.stroke()
  }
  g.globalAlpha = 1
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function SunShafts() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `uniform float uTime; varying vec2 vUv;
          void main(){ float a = smoothstep(0.0, 0.2, vUv.x) * (1.0 - smoothstep(0.8, 1.0, vUv.x)) * (1.0 - vUv.y * 0.7);
            float bands = 0.75 + 0.25 * sin(vUv.x * 18.0 + uTime * 0.3);
            gl_FragColor = vec4(vec3(1.0, 0.72, 0.55) * a * bands * 0.2, 1.0); }`,
      }),
    [],
  )
  useFrame((s) => (material.uniforms.uTime.value = s.clock.elapsedTime))
  return (
    <group position={[-3.4, 1.6, -0.4]} rotation={[0, 0.25, 0]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} material={material} position={[1.3, -0.4 - i * 0.05, i * 0.5 - 0.5]} rotation={[0, 0, -0.75]}>
          <planeGeometry args={[3.4, 1.0]} />
        </mesh>
      ))}
    </group>
  )
}

function DuskWindow() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `varying vec2 vUv;
          void main(){
            vec3 top = vec3(0.32, 0.38, 0.72); vec3 mid = vec3(1.0, 0.55, 0.62); vec3 low = vec3(1.0, 0.8, 0.45);
            vec3 c = mix(low, mid, smoothstep(0.1, 0.5, vUv.y)); c = mix(c, top, smoothstep(0.5, 1.0, vUv.y));
            float sun = exp(-length((vUv - vec2(0.42, 0.28)) * vec2(1.0, 1.4)) * 7.0);
            c += vec3(1.0, 0.85, 0.6) * sun * 1.4;
            gl_FragColor = vec4(c * 1.6, 1.0);
          }`,
      }),
    [],
  )
  return (
    <mesh position={[-3.18, 1.7, -0.2]} rotation={[0, Math.PI / 2, 0]} material={material}>
      <planeGeometry args={[1.8, 1.7]} />
    </mesh>
  )
}

export interface ClinicRoomProps {
  /** 0..1: Alex's hand to her mouth (capsule). */
  reach?: RefObject<number>
  /** 0..1: x-ray look revealing her brain. */
  xray?: RefObject<number>
  onAlexRig?: (rig: PersonRig) => void
  children?: ReactNode
}

export function ClinicRoom({ reach, xray, onAlexRig, children }: ClinicRoomProps) {
  const preset = QUALITY_PRESETS[useGame((s) => s.settings.quality)]
  const floor = useMemo(woodFloorMaterial, [])
  const crayon = useMemo(crayonTexture, [])
  const painting = useMemo(paintingTexture, [])
  const shadow = preset.shadowMapSize || 512
  const chairSeat = useChairSeat('modern_arm_chair_01')
  const alexSeat = useMemo(() => seatTarget(ALEX_CHAIR, chairSeat, SEAT_FIT.alex), [chairSeat])
  const therapistSeat = useMemo(() => seatTarget(THERAPIST_CHAIR, chairSeat, SEAT_FIT.therapist), [chairSeat])
  const lamp = useRef<THREE.PointLight>(null)
  useFrame((s) => {
    if (lamp.current) lamp.current.intensity = 5 + Math.sin(s.clock.elapsedTime * 0.7) * 0.25
  })
  return (
    <>
      <color attach="background" args={['#1c1420']} />
      <fog attach="fog" args={['#2a1d26', 7, 18]} />
      <Environment files={ROOM_HDRI} environmentIntensity={0.55} />
      <hemisphereLight args={['#ffd9c2', '#3a2a3a', 0.25]} />
      <directionalLight
        position={[-5, 3.6, 0.6]}
        intensity={3.0}
        color="#ffbf8f"
        castShadow={preset.shadowMapSize > 0}
        shadow-mapSize={[shadow, shadow]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      <directionalLight position={[3, 2.4, -3]} intensity={1.6} color="#8fb8ff" />
      <pointLight ref={lamp} position={[1.95, 1.55, -1.75]} intensity={5} color="#ffb06e" distance={5} decay={2} />

      <mesh rotation-x={-Math.PI / 2} material={floor} receiveShadow>
        <planeGeometry args={[9, 8]} />
      </mesh>
      <mesh position={[0, 1.6, -2.4]} receiveShadow>
        <planeGeometry args={[9, 3.2]} />
        <meshStandardMaterial color="#c9ad98" roughness={0.95} />
      </mesh>
      <mesh position={[-3.2, 1.6, 0.6]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[7, 3.2]} />
        <meshStandardMaterial color="#bfa08c" roughness={0.95} />
      </mesh>
      <DuskWindow />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[-3.12, 1.65, -0.2 + s * 1.05]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.55, 2.4, 12, 1]} />
          <meshStandardMaterial color="#f4e6d2" transparent opacity={0.85} roughness={1} side={THREE.DoubleSide} emissive="#ffb58a" emissiveIntensity={0.4} />
        </mesh>
      ))}
      <SunShafts />
      <Sparkles count={Math.round(140 * preset.particleScale)} scale={[3, 2, 2.4]} position={[-1.7, 1.4, -0.4]} size={1.8} speed={0.12} opacity={0.65} color="#ffe2c8" />

      <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, -0.4]} receiveShadow>
        <circleGeometry args={[1.6, 64]} />
        <meshStandardMaterial color="#7a4f5c" roughness={1} />
      </mesh>
      {/* real furniture (CC0, Poly Haven): two upright armchairs angled toward each other */}
      <Prop id="modern_arm_chair_01" position={ALEX_CHAIR.pos} rotationY={ALEX_CHAIR.yaw} scale={CHAIR_SCALE} />
      <Prop id="modern_arm_chair_01" position={THERAPIST_CHAIR.pos} rotationY={THERAPIST_CHAIR.yaw} scale={CHAIR_SCALE} />
      <Prop id="side_table_01" position={[0.42, 0, -1.6]} rotationY={0.3} />
      <Prop id="vintage_oil_lamp" position={[0.3, 0.55, -1.66]} />
      <Prop id="coffee_table_round_01" position={[0.4, 0, -0.35]} scale={0.6} />
      <Prop id="potted_plant_01" position={[-2.3, 0, -1.95]} rotationY={0.6} />
      <Prop id="potted_plant_02" position={[2.35, 0, -1.85]} rotationY={-0.4} />
      <pointLight position={[0.3, 1.0, -1.7]} intensity={0.55} color="#ffb370" distance={3} decay={2} />
      {/* the dish for the capsule and the crayon drawing from home, on the side table */}
      <mesh position={[TRAY_POS.x, 0.553, TRAY_POS.z]} castShadow receiveShadow>
        <cylinderGeometry args={[0.07, 0.06, 0.012, 28]} />
        <meshStandardMaterial color="#4a3a30" roughness={0.35} />
      </mesh>
      <mesh position={[0.32, 0.552, -1.45]} rotation={[-Math.PI / 2, 0, 0.3]} receiveShadow>
        <planeGeometry args={[0.2, 0.15]} />
        <meshStandardMaterial map={crayon} roughness={0.9} />
      </mesh>
      <group position={[-1.55, 1.78, -2.37]}>
        <mesh>
          <planeGeometry args={[0.9, 1.12]} />
          <meshStandardMaterial color="#2b2119" />
        </mesh>
        <mesh position={[0, 0, 0.006]}>
          <planeGeometry args={[0.8, 1.0]} />
          <meshStandardMaterial map={painting} roughness={0.8} emissive="#ffffff" emissiveMap={painting} emissiveIntensity={0.25} />
        </mesh>
      </group>
      <group position={[0.75, 1.8, -2.37]}>
        <mesh>
          <planeGeometry args={[0.55, 0.7]} />
          <meshStandardMaterial color="#2b2119" />
        </mesh>
        <mesh position={[0, 0, 0.006]}>
          <planeGeometry args={[0.46, 0.6]} />
          <meshStandardMaterial color="#6f8fa6" roughness={0.8} />
        </mesh>
      </group>

      <Suspense fallback={null}>
        <Person
          kind="alex"
          hair="none"
          clip="Sitting_Idle_Loop"
          clothes={ALEX_CLOTHES}
          position={ALEX_CHAIR.pos}
          rotation={[-0.04, ALEX_CHAIR.yaw, 0]}
          seat={alexSeat}
          sessionGear
          browColor="#120d0b"
          reach={reach}
          xray={xray}
          onRig={onAlexRig}
        />
        <Person
          kind="therapist"
          hair="parted"
          clip="Sitting_Idle_Loop"
          clothes={THERAPIST_CLOTHES}
          position={THERAPIST_CHAIR.pos}
          rotation={[-0.04, THERAPIST_CHAIR.yaw, 0]}
          seat={therapistSeat}
          hairColor="#6a4529"
          browColor="#24170f"
        />
      </Suspense>
      <ContactShadows position={[0, 0.012, -0.8]} scale={7} blur={2.4} opacity={0.55} far={1.6} resolution={512} color="#1a0f12" />
      {children}
    </>
  )
}
