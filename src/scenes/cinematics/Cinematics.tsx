import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import type { PerspectiveCamera } from 'three'
import { useGame } from '../../game/store'
import { isDialogueWaiting, sayLine, useCaptions } from '../../ui/captions'
import { useWorldHud } from '../../ui/worldHudStore'
import { fireFlash } from '../../ui/FlashOverlay'
import { showSymbol } from '../../ui/symbolStore'
import { CAPSULE_LINE, CLINIC_CAPTIONS, LAB_LINES, THERAPIST } from '../../content/captions'
import { usePostLook } from '../../fx/PostFX'
import { audio } from '../../audio/AudioManager'
import { ClinicRoom, TRAY_POS } from '../clinic/ClinicRoom'
import type { PersonRig } from '../clinic/people'
import { headPointWorld } from '../../player/headFrame'
import { GlassBrain } from '../brain/ProceduralBrain'
import { NebulaSky } from '../brain/NebulaSky'
import { sampleCamera, type CamKey } from './cameraPath'

/** Debug: the active cinematic's clock, so tests can seek (window.__mindshift.seek). */
export const devTimeline: { ref: RefObject<number> | null } = { ref: null }

/**
 * Dialogue hold: while a line waits for the player (SPACE), the cutscene may not pass the next
 * held beat. useCues sets this every frame; the timeline eases to a stop in front of it.
 */
const dialogueHold = { at: Infinity }

/** Timeline clock that respects the presenter's pause and the dialogue hold. */
export function useTimeline(): RefObject<number> {
  const t = useRef(0)
  const rate = useRef(1)
  devTimeline.ref = t
  const paused = useGame((s) => s.settings.timersPaused)
  useFrame((_, dt) => {
    if (paused) return
    const d = Math.min(dt, 0.1)
    // ease into a hold over its last ~0.8 s (the camera drifts to a stop instead of freezing),
    // and ease back in once the player continues
    const room = dialogueHold.at - t.current
    const target = room === Infinity ? 1 : THREE.MathUtils.clamp(room / 0.8, 0, 1)
    rate.current += (target - rate.current) * Math.min(1, d * 5)
    const step = d * Math.min(rate.current, target)
    t.current = t.current <= dialogueHold.at ? Math.min(t.current + step, dialogueHold.at) : t.current + step
  })
  return t
}

export function CameraRig({ keys, time }: { keys: CamKey[]; time: RefObject<number> }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), l: new THREE.Vector3() }), [])
  useFrame(() => {
    const fov = sampleCamera(keys, time.current ?? 0, tmp.p, tmp.l)
    camera.position.copy(tmp.p)
    camera.lookAt(tmp.l)
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  })
  return null
}

/**
 * A timed beat. Beats marked 'hold' wait until the player has continued past any dialogue line on
 * screen (the cutscene eases to a stop in front of them), so every line can be read in full.
 */
export type Cue = [number, () => void] | [number, () => void, 'hold']

export function useCues(time: RefObject<number>, cues: Cue[]) {
  const done = useRef(new Set<number>())
  useEffect(
    () => () => {
      dialogueHold.at = Infinity
    },
    [],
  )
  useFrame(() => {
    const t = time.current ?? 0
    let hold = Infinity
    cues.forEach(([at, fn, kind], i) => {
      if (done.current.has(i)) return
      if (kind === 'hold' && isDialogueWaiting()) {
        hold = Math.min(hold, at)
        return
      }
      if (t >= at && at <= hold) {
        done.current.add(i)
        fn()
      }
    })
    dialogueHold.at = hold
  })
}

/** Does nothing: a cue that only marks a beat to hold at until the current line is dismissed. */
const beat = () => {}

const next = () => useGame.getState().dispatch({ type: 'NEXT' })
/** Session-room grade: warm, soft bloom. */
const ROOM_LOOK = { bloomThreshold: 0.85, bloomIntensity: 0.8, vignette: 0.68, toneMapping: 'aces' as const, contrast: 0.1, saturation: 0.14 }
const ease = (x: number) => {
  const k = THREE.MathUtils.clamp(x, 0, 1)
  return k * k * (3 - 2 * k)
}

export function useCleanup() {
  useEffect(
    () => () => {
      useCaptions.getState().clear()
      useWorldHud.getState().set({ breath: null })
    },
    [],
  )
}

/** Tracks Alex's head in world space (center, forward, up, size) from her rig. */
function useHeadTracker() {
  const rig = useRef<PersonRig | null>(null)
  const head = useRef({ center: new THREE.Vector3(-0.6, 1.25, -1.35), fwd: new THREE.Vector3(0.18, 0, 1).normalize(), up: new THREE.Vector3(0, 1, 0), size: 0.24, quat: new THREE.Quaternion(), ok: false })
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), m: new THREE.Matrix4() }), [])
  useFrame(() => {
    const frame = rig.current?.head
    if (!frame) return
    const h = head.current
    headPointWorld(frame, tmp.a.set(0, 0, 0), h.center)
    headPointWorld(frame, tmp.a.set(0, 0, frame.depth), tmp.b)
    h.fwd.copy(tmp.b).sub(h.center).normalize()
    headPointWorld(frame, tmp.a.set(0, frame.height, 0), tmp.b)
    h.up.copy(tmp.b).sub(h.center).normalize()
    headPointWorld(frame, tmp.a.set(0, frame.height / 2, 0), tmp.a)
    headPointWorld(frame, tmp.b.set(0, -frame.height / 2, 0), tmp.b)
    h.size = tmp.a.distanceTo(tmp.b)
    tmp.m.lookAt(new THREE.Vector3(), h.fwd.clone().negate(), h.up)
    h.quat.setFromRotationMatrix(tmp.m)
    h.ok = true
  })
  return { rig, head }
}

type HeadRef = ReturnType<typeof useHeadTracker>['head']

/** A small glowing brain that appears inside Alex's head as she turns to x-ray. */
function BrainInHead({ head, xray }: { head: HeadRef; xray: RefObject<number> }) {
  const group = useRef<THREE.Group>(null)
  const [visible, setVisible] = useState(false)
  useFrame(() => {
    const g = group.current
    const x = xray.current ?? 0
    if (x > 0.02 !== visible) setVisible(x > 0.02)
    if (!g) return
    const h = head.current
    g.position.copy(h.center).addScaledVector(h.up, h.size * 0.08)
    g.quaternion.copy(h.quat)
    g.scale.setScalar(h.size * 0.36 * (0.6 + 0.4 * x))
  })
  return <group ref={group}>{visible && <GlassBrain opacity={1} />}</group>
}

/** The mushroom on the tray turns into a capsule, floats to Alex's hand, and she takes it. */
function CapsuleMoment({ time, rig }: { time: RefObject<number>; rig: RefObject<PersonRig | null> }) {
  const mushroom = useRef<THREE.Group>(null)
  const capsule = useRef<THREE.Group>(null)
  const glow = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ffd9a8').multiplyScalar(0.9),
        toneMapped: false,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  )
  const tray = useMemo(() => TRAY_POS.clone().add(new THREE.Vector3(0, 0.0, 0.06)), [])
  const tmp = useMemo(() => ({ hand: new THREE.Vector3(), a: new THREE.Vector3(), mid: new THREE.Vector3() }), [])
  useFrame((s) => {
    const t = time.current ?? 0
    const m = mushroom.current
    const c = capsule.current
    if (!m || !c) return
    // mushroom appears (12.5-13.5), morphs away (14.3-15.8)
    const mIn = ease((t - 12.5) / 1)
    const morph = ease((t - 14.3) / 1.5)
    m.visible = t > 12.4 && morph < 0.999
    m.position.copy(tray)
    m.rotation.y = s.clock.elapsedTime * 0.6
    m.scale.setScalar(Math.max(0.0001, mIn * (1 - morph)) * 2.2)
    glow.opacity = 0.22 + 0.08 * Math.sin(s.clock.elapsedTime * 3)
    // capsule appears as the mushroom fades, then floats to the hand and on to the mouth
    const b = rig.current?.bones
    // the capsule sits between the thumb and index fingertips
    if (b?.index_03_l && b?.thumb_03_l) {
      b.index_03_l.getWorldPosition(tmp.hand)
      b.thumb_03_l.getWorldPosition(tmp.a)
      tmp.hand.lerp(tmp.a, 0.5)
    } else if (b?.hand_l) b.hand_l.getWorldPosition(tmp.hand)
    else tmp.hand.set(-0.4, 0.7, -1.1)
    c.visible = morph > 0.01 && t < 20.2
    const grow = morph
    const fly = ease((t - 16) / 1.8)
    tmp.mid.copy(tray).lerp(tmp.hand, 0.5).add(new THREE.Vector3(0, 0.25, 0))
    if (fly <= 0) c.position.copy(tray).add(new THREE.Vector3(0, 0.03, 0))
    else if (fly < 1) {
      // quadratic arc tray -> hand
      const k = fly
      tmp.a.copy(tray).multiplyScalar((1 - k) * (1 - k)).addScaledVector(tmp.mid, 2 * (1 - k) * k).addScaledVector(tmp.hand, k * k)
      c.position.copy(tmp.a)
    } else c.position.copy(tmp.hand)
    c.rotation.set(s.clock.elapsedTime * 1.5, 0.6, 0.3)
    c.scale.setScalar(Math.max(0.0001, grow) * (fly > 0 ? 1.7 : 2.4))
  })
  return (
    <>
      <group ref={mushroom} visible={false}>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.008, 0.011, 0.04, 14]} />
          <meshStandardMaterial color="#f4ead8" emissive="#ffd9a8" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[0, 0.042, 0]} scale={[1, 0.6, 1]}>
          <sphereGeometry args={[0.028, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#b98258" emissive="#ffb070" emissiveIntensity={0.45} side={THREE.DoubleSide} />
        </mesh>
        <mesh material={glow} position={[0, 0.03, 0]}>
          <sphereGeometry args={[0.042, 16, 16]} />
        </mesh>
        <Sparkles count={24} scale={0.18} size={2} speed={0.6} color="#ffe2b8" />
      </group>
      <group ref={capsule} visible={false}>
        <mesh position={[0, 0.006, 0]}>
          <capsuleGeometry args={[0.0075, 0.012, 6, 14]} />
          <meshStandardMaterial color="#fffaf2" emissive="#ffffff" emissiveIntensity={1.2} />
        </mesh>
        <mesh position={[0, -0.006, 0]}>
          <capsuleGeometry args={[0.0076, 0.012, 6, 14]} />
          <meshStandardMaterial color="#5fe0d0" emissive="#5fe0d0" emissiveIntensity={1.6} />
        </mesh>
        <mesh material={glow} scale={0.6}>
          <sphereGeometry args={[0.03, 12, 12]} />
        </mesh>
      </group>
    </>
  )
}

// ---------------------------------------------------------------------------
// CLINIC INTRO: who Alex is, taking the psilocybin, one shared breath, then into her brain
// ---------------------------------------------------------------------------

const ROOM_KEYS: CamKey[] = [
  { t: 0, pos: [2.7, 1.8, 2.7], look: [0.1, 0.85, -1.05], fov: 42 },
  { t: 11, pos: [1.55, 1.45, 1.35], look: [-0.2, 0.9, -1.2], fov: 40 },
  { t: 13.5, pos: [0.3, 1.0, -0.7], look: [0.55, 0.64, -1.45], fov: 38 },
  { t: 15.2, pos: [0.32, 1.0, -0.75], look: [0.52, 0.66, -1.45], fov: 38 },
  { t: 16.5, pos: [0.45, 1.22, 0.05], look: [-0.15, 0.9, -1.35], fov: 40 },
  { t: 21, pos: [-0.05, 1.3, 0.35], look: [-0.35, 1.0, -1.3], fov: 38 },
  { t: 26, pos: [0.25, 1.3, 0.2], look: [-0.55, 1.18, -1.3], fov: 36 },
]

export function ClinicIntro() {
  const time = useTimeline()
  const reach = useRef(0)
  const xray = useRef(0)
  const { rig, head } = useHeadTracker()
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), l: new THREE.Vector3(), from: new THREE.Vector3(), fromL: new THREE.Vector3(), near: new THREE.Vector3(), inside: new THREE.Vector3() }), [])
  useCleanup()
  usePostLook(ROOM_LOOK)
  useEffect(() => audio.ambience('clinic'), [])

  useFrame(() => {
    const t = time.current ?? 0
    // capsule: reach up 17.6-19.4, hold, lower 20.2-21.6
    reach.current = t < 17.6 ? 0 : t < 19.4 ? ease((t - 17.6) / 1.8) : t < 20.2 ? 1 : 1 - ease((t - 20.2) / 1.4)
    // x-ray from 32.4
    xray.current = ease((t - 32.4) / 1.6)
    // breathing ring 22-30 (3.5 s in, 4.5 s out)
    const b = t - 22
    const hud = useWorldHud.getState()
    if (b >= 0 && b < 3.5) hud.set({ breath: { scale: 0.55 + 0.45 * Math.sin((b / 3.5) * Math.PI / 2), label: 'Breathe in' } })
    else if (b >= 3.5 && b < 8) hud.set({ breath: { scale: 1 - 0.45 * Math.sin(((b - 3.5) / 4.5) * Math.PI / 2), label: '…and out' } })
    else if (hud.breath) hud.set({ breath: null })

    // camera: authored room path, then a push into her head and through to the brain
    if (t < 26) {
      const fov = sampleCamera(ROOM_KEYS, t, tmp.p, tmp.l)
      camera.position.copy(tmp.p)
      camera.lookAt(tmp.l)
      camera.fov = fov
    } else {
      sampleCamera(ROOM_KEYS, 26, tmp.from, tmp.fromL)
      const h = head.current
      tmp.near.copy(h.center).addScaledVector(h.fwd, h.size * 1.6).addScaledVector(h.up, h.size * 0.05)
      tmp.inside.copy(h.center).addScaledVector(h.fwd, h.size * 0.12)
      if (t < 33) {
        const k = ease((t - 26) / 7)
        camera.position.lerpVectors(tmp.from, tmp.near, k)
        tmp.l.lerpVectors(tmp.fromL, h.center, k)
      } else {
        camera.position.lerpVectors(tmp.near, tmp.inside, ease((t - 33) / 3.2))
        tmp.l.copy(h.center)
      }
      camera.lookAt(tmp.l)
      camera.fov = 34
    }
    camera.updateProjectionMatrix()
  })

  useCues(time, [
    [1.5, () => sayLine(CLINIC_CAPTIONS[0].text, 'narrator'), 'hold'],
    [5.4, () => sayLine(CLINIC_CAPTIONS[1].text, 'narrator'), 'hold'],
    [9.4, () => sayLine(CLINIC_CAPTIONS[2].text, 'narrator'), 'hold'],
    [12.6, () => sayLine(CAPSULE_LINE.text, 'lab'), 'hold'],
    [14.3, () => audio.chime([783.99, 1046.5], 1.8)],
    // she takes the capsule once its line has been read
    [17.5, beat, 'hold'],
    [19.4, () => audio.blip(1318.5)],
    [20.8, () => sayLine(THERAPIST.breatheIntro, 'therapist'), 'hold'],
    // the shared breath starts once the therapist's line has been read
    [21.9, beat, 'hold'],
    [32.4, () => audio.chime([392, 587.33, 880], 3)],
    [35.6, () => fireFlash()],
    [36.2, next],
  ])

  return (
    <ClinicRoom reach={reach} xray={xray} onAlexRig={(r) => (rig.current = r)}>
      <CapsuleMoment time={time} rig={rig} />
      <BrainInHead head={head} xray={xray} />
    </ClinicRoom>
  )
}

// ---------------------------------------------------------------------------
// BRAIN DIVE: picks up exactly where the clinic ended (the brain filling the view)
// ---------------------------------------------------------------------------

const DIVE_KEYS: CamKey[] = [
  { t: 0, pos: [0.05, 0.12, 1.75], look: [0, 0, 0], fov: 46 },
  { t: 2.5, pos: [1.6, 0.55, 2.4], look: [0, 0, 0], fov: 46 },
  { t: 8, pos: [2.5, 1.05, -1.3], look: [0, 0.05, 0], fov: 46 },
  { t: 11.5, pos: [1.35, 0.55, 0.65], look: [0.42, 0.18, 0.32], fov: 44 },
  { t: 15, pos: [0.66, 0.24, 0.46], look: [0.38, 0.14, 0.33], fov: 40 },
]

export function BrainDive() {
  const time = useTimeline()
  useCleanup()
  usePostLook({ bloomThreshold: 0.45, bloomIntensity: 1.1, vignette: 0.6 })
  useEffect(() => {
    audio.ambience('brain')
  }, [])
  useCues(time, [
    [1.4, () => sayLine(LAB_LINES[0].text, 'lab'), 'hold'],
    [2.6, () => showSymbol('fibers')],
    [7, () => sayLine(LAB_LINES[1].text, 'lab'), 'hold'],
    [14.5, beat, 'hold'],
    [14.6, () => fireFlash()],
    [15.2, next],
  ])
  return (
    <>
      <color attach="background" args={['#04030d']} />
      <NebulaSky />
      <GlassBrain />
      <Sparkles count={240} scale={[8, 6, 8]} size={2} speed={0.2} opacity={0.5} color="#9fdcff" />
      <CameraRig keys={DIVE_KEYS} time={time} />
    </>
  )
}
