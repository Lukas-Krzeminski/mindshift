import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import { Trail } from '@react-three/drei'
import * as THREE from 'three'
import type { PerspectiveCamera } from 'three'
import { input, attachInput, keyDown } from './input'
import { player, type Locomotion } from './playerState'
import { AlexAvatar, type AvatarLook } from './AlexAvatar'
import type { Vec3 } from '../scenes/useCameraPose'

/** Movement tuning (plan §6). */
export const MOVE = {
  walk: 4.0,
  sprint: 7.0,
  accel: 30,
  decel: 40,
  airControl: 0.35,
  jumpSpeed: 6.5,
  gravity: 22,
  coyote: 0.12,
  jumpBuffer: 0.12,
  turnRate: 12,
  featherFall: 2.0,
}

const CAM = {
  distance: 4.5,
  minDistance: 2.5,
  maxDistance: 7,
  shoulder: 0.5,
  pivotHeight: 1.6,
  pitchMin: THREE.MathUtils.degToRad(-35),
  pitchMax: THREE.MathUtils.degToRad(60),
  sensitivity: 0.0022,
  fov: 60,
  sprintFov: 65,
}

/** A rising column of light: stepping in lifts Alex to `top` + ~1 m, where she hovers until she walks out. */
export interface Updraft {
  x: number
  z: number
  r: number
  top: number
  /** Rise speed in m/s (default 5.5, a gentle float; higher feels like being shot up). */
  speed?: number
}

/** Cinematic takeover of the follow camera (final moments). `weight` 0..1 blends from the follow camera. */
export interface CameraShot {
  pos: THREE.Vector3
  look: THREE.Vector3
  weight: number
}

export interface PlayerProps {
  spawn: Vec3
  /** Initial facing / camera yaw in radians (0 = looking toward -Z). */
  yaw?: number
  look: AvatarLook
  /** Keep the player within this circle (x, z, radius). */
  bounds?: [number, number, number]
  /** Positive world: hold Space mid-air to drift down slowly. */
  feather?: boolean
  /** Challenging world: 0..1 heaviness (slower, swaying camera). */
  heaviness?: RefObject<number>
  /** Challenging world: 0..1 calm for the avatar's glow. */
  calm?: RefObject<number>
  /** Cinematic reveal length in seconds before control is handed over. */
  introSeconds?: number
  /** Where the reveal camera starts. */
  introFrom?: Vec3
  /** Freeze input (e.g. during the breathing beat). */
  frozen?: RefObject<boolean>
  /** Visual-only avatar scale (macropsia / micropsia effect). */
  avatarScale?: RefObject<number>
  /** Tracer streak behind Alex (challenging world). */
  trail?: string | null
  /** Positive world: light columns that lift Alex onto floating islands. */
  updrafts?: Updraft[]
  /** 0..1 camera shake (challenging world). */
  shake?: RefObject<number>
  /** Cinematic camera for final moments. */
  cameraShot?: RefObject<CameraShot | null>
  /** Per-world physics: lower gravity, faster running, higher jumps (parkour world). */
  physics?: { gravity?: number; jumpSpeed?: number; speedScale?: number; featherFall?: number }
  /** Falling below this height returns Alex to `checkpoint`. */
  fallY?: number
  checkpoint?: RefObject<Vec3>
  onRespawn?: () => void
}

export function PlayerController({
  spawn,
  yaw: yaw0 = 0,
  look,
  bounds,
  feather = false,
  heaviness,
  calm,
  introSeconds = 2.4,
  introFrom,
  frozen,
  avatarScale,
  trail = null,
  updrafts,
  shake,
  cameraShot,
  physics,
  fallY = -30,
  checkpoint,
  onRespawn,
}: PlayerProps) {
  const GRAVITY = physics?.gravity ?? MOVE.gravity
  const JUMP = physics?.jumpSpeed ?? MOVE.jumpSpeed
  const SPEED = physics?.speedScale ?? 1
  const FEATHER = physics?.featherFall ?? MOVE.featherFall
  const { world, rapier } = useRapier()
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const body = useRef<RapierRigidBody>(null)
  const collider = useRef<RapierCollider>(null)
  const facingGroup = useRef<THREE.Group>(null)

  // The physics world is a lazy proxy that @react-three/rapier frees and rebuilds (e.g. React
  // StrictMode's double mount), which frees its character controllers too. So the controller is
  // (re)created on demand whenever it is missing or has been freed.
  type KCC = ReturnType<typeof world.createCharacterController>
  const controllerRef = useRef<KCC | null>(null)
  const getController = (): KCC => {
    const existing = controllerRef.current
    if (existing && (existing as unknown as { raw?: unknown }).raw) return existing
    const c = world.createCharacterController(0.02)
    c.enableAutostep(0.35, 0.2, true)
    c.enableSnapToGround(0.4)
    c.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(40))
    c.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(50))
    c.setApplyImpulsesToDynamicBodies(true)
    controllerRef.current = c
    return c
  }
  useEffect(
    () => () => {
      const c = controllerRef.current
      controllerRef.current = null
      if (c && (c as unknown as { raw?: unknown }).raw) {
        try {
          world.removeCharacterController(c)
        } catch {
          /* world already freed */
        }
      }
    },
    [world],
  )
  useEffect(() => attachInput(gl.domElement), [gl])

  const s = useRef({
    vel: new THREE.Vector3(),
    yaw: yaw0,
    pitch: 0.18,
    distance: CAM.distance,
    facing: yaw0,
    coyote: 0,
    jumpBuffer: 0,
    jumpHeld: false,
    intro: 0,
    pivot: new THREE.Vector3(...spawn).add(new THREE.Vector3(0, CAM.pivotHeight, 0)),
    camPos: new THREE.Vector3(),
    introStart: new THREE.Vector3(...(introFrom ?? [spawn[0], spawn[1] + 14, spawn[2] + 22])),
    lastStepPhase: 0,
  })
  const loco = useRef<Locomotion>({ speed: 0, grounded: true, airTime: 0, sinceJump: 9, landing: 0 })
  const tmp = useMemo(() => ({ fwd: new THREE.Vector3(), right: new THREE.Vector3(), wish: new THREE.Vector3(), target: new THREE.Vector3(), q: new THREE.Quaternion(), dir: new THREE.Vector3(), desiredCam: new THREE.Vector3(), lookAt: new THREE.Vector3() }), [])

  useEffect(() => {
    player.position.set(...spawn)
    player.active = false
    camera.fov = CAM.fov
    camera.updateProjectionMatrix()
    s.current.camPos.copy(s.current.introStart)
    camera.position.copy(s.current.introStart)
    return () => {
      player.active = false
    }
    // spawn-time setup only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20)
    const st = s.current
    const rb = body.current
    const col = collider.current
    if (!rb || !col) return
    const controller = getController()

    st.intro = Math.min(1, st.intro + dt / introSeconds)
    const canMove = st.intro > 0.55 && !frozen?.current
    player.active = canMove

    // ---- camera input
    const heavy = heaviness?.current ?? 0
    if (st.intro > 0.4) {
      st.yaw -= input.lookDX * CAM.sensitivity
      st.pitch = THREE.MathUtils.clamp(st.pitch + input.lookDY * CAM.sensitivity, CAM.pitchMin, CAM.pitchMax)
    }
    input.lookDX = 0
    input.lookDY = 0
    if (input.wheel) {
      st.distance = THREE.MathUtils.clamp(st.distance + input.wheel * 0.004, CAM.minDistance, CAM.maxDistance)
      input.wheel = 0
    }

    // ---- movement input (camera-relative)
    const fwdIn = (keyDown('KeyW', 'ArrowUp') ? 1 : 0) - (keyDown('KeyS', 'ArrowDown') ? 1 : 0)
    const rightIn = (keyDown('KeyD', 'ArrowRight') ? 1 : 0) - (keyDown('KeyA', 'ArrowLeft') ? 1 : 0)
    tmp.fwd.set(-Math.sin(st.yaw), 0, -Math.cos(st.yaw))
    tmp.right.set(Math.cos(st.yaw), 0, -Math.sin(st.yaw))
    tmp.wish.set(0, 0, 0).addScaledVector(tmp.fwd, fwdIn).addScaledVector(tmp.right, rightIn)
    if (tmp.wish.lengthSq() > 1) tmp.wish.normalize()
    if (!canMove) tmp.wish.set(0, 0, 0)
    const sprinting = canMove && keyDown('ShiftLeft', 'ShiftRight') && tmp.wish.lengthSq() > 0.01
    const maxSpeed = (sprinting ? MOVE.sprint : MOVE.walk) * SPEED * (1 - 0.2 * heavy)

    const grounded = loco.current.grounded
    const horiz = tmp.target.set(st.vel.x, 0, st.vel.z)
    const desired = tmp.dir.copy(tmp.wish).multiplyScalar(maxSpeed)
    const rate = (desired.lengthSq() > horiz.lengthSq() ? MOVE.accel : MOVE.decel) * (grounded ? 1 : MOVE.airControl) * (1 - 0.5 * heavy)
    const delta = desired.sub(horiz)
    const maxStep = rate * dt
    if (delta.length() > maxStep) delta.setLength(maxStep)
    st.vel.x += delta.x
    st.vel.z += delta.z

    // ---- jumping (coyote time + input buffer)
    const jumpPressed = canMove && keyDown('Space')
    if (jumpPressed && !st.jumpHeld) st.jumpBuffer = MOVE.jumpBuffer
    st.jumpHeld = jumpPressed
    st.jumpBuffer = Math.max(0, st.jumpBuffer - dt)
    st.coyote = grounded ? MOVE.coyote : Math.max(0, st.coyote - dt)
    loco.current.sinceJump += dt
    if (st.jumpBuffer > 0 && st.coyote > 0) {
      st.vel.y = JUMP
      st.jumpBuffer = 0
      st.coyote = 0
      loco.current.sinceJump = 0
    }
    // ---- updrafts: rise inside a light column, hover at its top
    const p = rb.translation()
    let lifted = false
    if (updrafts && canMove) {
      for (const u of updrafts) {
        if (Math.hypot(p.x - u.x, p.z - u.z) < u.r && p.y < u.top + 1.6) {
          lifted = true
          st.vel.y = THREE.MathUtils.lerp(Math.max(st.vel.y, 0), p.y < u.top + 1.0 ? (u.speed ?? 5.5) : 0, Math.min(1, dt * 4))
          // while rising, the column holds her gently in its center; at the top she can step off
          if (p.y < u.top + 0.6) {
            const k = Math.min(1, dt * 6)
            st.vel.x = THREE.MathUtils.lerp(st.vel.x, (u.x - p.x) * 2, k)
            st.vel.z = THREE.MathUtils.lerp(st.vel.z, (u.z - p.z) * 2, k)
          }
        }
      }
    }
    if (!lifted) st.vel.y -= GRAVITY * dt
    if (feather && !grounded && st.vel.y < -FEATHER && jumpPressed) st.vel.y = THREE.MathUtils.lerp(st.vel.y, -FEATHER, Math.min(1, dt * 8))

    // ---- kinematic character controller
    controller.computeColliderMovement(col, { x: st.vel.x * dt, y: st.vel.y * dt, z: st.vel.z * dt })
    const m = controller.computedMovement()
    let nx = p.x + m.x
    let nz = p.z + m.z
    if (bounds) {
      const [cx, cz, r] = bounds
      const dx = nx - cx
      const dz = nz - cz
      const d = Math.hypot(dx, dz)
      if (d > r) {
        nx = cx + (dx / d) * r
        nz = cz + (dz / d) * r
      }
    }
    let ny = p.y + m.y
    const tp = player.teleportTo
    if (tp) {
      nx = tp.x
      ny = tp.y
      nz = tp.z
      st.vel.set(0, 0, 0)
      if (tp.yaw !== undefined) {
        st.yaw = tp.yaw
        st.facing = tp.yaw
      }
      st.pivot.set(nx, ny + CAM.pivotHeight, nz)
      player.teleportTo = null
    }
    if (ny < fallY) {
      // fell: back to the last checkpoint (or the spawn point)
      const cp = checkpoint?.current ?? spawn
      nx = cp[0]
      ny = cp[1] + 0.6
      nz = cp[2]
      st.vel.set(0, 0, 0)
      st.pivot.set(nx, ny + CAM.pivotHeight, nz)
      onRespawn?.()
    }
    rb.setNextKinematicTranslation({ x: nx, y: ny, z: nz })
    const nowGrounded = controller.computedGrounded()
    if (nowGrounded && st.vel.y < 0 && !lifted) {
      if (!grounded && loco.current.airTime > 0.35) loco.current.landing = 0.32
      st.vel.y = -1
    }
    loco.current.grounded = nowGrounded
    loco.current.airTime = nowGrounded ? 0 : loco.current.airTime + dt
    loco.current.landing = Math.max(0, loco.current.landing - dt)
    const speed = Math.hypot(m.x, m.z) / dt
    loco.current.speed = THREE.MathUtils.lerp(loco.current.speed, speed, Math.min(1, dt * 12))

    // ---- facing: turn toward travel direction
    if (Math.hypot(st.vel.x, st.vel.z) > 0.4) {
      const targetYaw = Math.atan2(-st.vel.x, -st.vel.z)
      let diff = targetYaw - st.facing
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      st.facing += diff * Math.min(1, dt * MOVE.turnRate)
    }
    facingGroup.current?.rotation.set(0, st.facing + Math.PI, 0)
    if (avatarScale && facingGroup.current) facingGroup.current.scale.setScalar(avatarScale.current ?? 1)

    // ---- shared state + footsteps
    player.position.set(nx, ny, nz)
    player.velocity.copy(st.vel)
    player.grounded = nowGrounded
    player.speed = loco.current.speed
    player.facing = st.facing
    const stepPhase = Math.floor(state.clock.elapsedTime * (loco.current.speed > 5.4 ? 3.3 : 2.6))
    if (nowGrounded && loco.current.speed > 1 && stepPhase !== st.lastStepPhase) {
      player.steps.push({ x: nx, z: nz, t: state.clock.elapsedTime })
      if (player.steps.length > 24) player.steps.shift()
    }
    st.lastStepPhase = stepPhase

    // ---- third-person camera
    tmp.target.set(nx, ny + CAM.pivotHeight, nz)
    st.pivot.lerp(tmp.target, 1 - Math.exp(-dt * 14))
    const cp = Math.cos(st.pitch)
    tmp.dir.set(Math.sin(st.yaw) * cp, Math.sin(st.pitch), Math.cos(st.yaw) * cp) // from pivot toward camera
    const shoulder = tmp.right.clone().multiplyScalar(CAM.shoulder)
    let dist = st.distance
    const origin = { x: st.pivot.x + shoulder.x, y: st.pivot.y, z: st.pivot.z + shoulder.z }
    const hit = world.castRay(new rapier.Ray(origin, { x: tmp.dir.x, y: tmp.dir.y, z: tmp.dir.z }), dist + 0.3, true, undefined, undefined, col, rb)
    if (hit) {
      const toi = (hit as unknown as { timeOfImpact?: number; toi?: number }).timeOfImpact ?? (hit as unknown as { toi: number }).toi
      dist = Math.max(0.8, Math.min(dist, toi - 0.3))
    }
    tmp.desiredCam.set(origin.x, origin.y, origin.z).addScaledVector(tmp.dir, dist)
    if (tmp.desiredCam.y < ny + 0.35) tmp.desiredCam.y = ny + 0.35
    const pullIn = tmp.desiredCam.distanceTo(st.pivot) < st.camPos.distanceTo(st.pivot)
    st.camPos.lerp(tmp.desiredCam, 1 - Math.exp(-dt * (pullIn ? 22 : 8)))

    // cinematic reveal: ease from the intro pose into the rig
    const e = 1 - Math.pow(1 - st.intro, 3)
    camera.position.lerpVectors(st.introStart, st.camPos, e)
    tmp.lookAt.set(st.pivot.x + shoulder.x * 0.6, st.pivot.y, st.pivot.z + shoulder.z * 0.6)
    // final-moment takeover: blend toward a scripted shot
    const shot = cameraShot?.current
    if (shot && shot.weight > 0) {
      const w = THREE.MathUtils.clamp(shot.weight, 0, 1)
      camera.position.lerp(shot.pos, w)
      tmp.lookAt.lerp(shot.look, w)
    }
    camera.lookAt(tmp.lookAt)
    if (heavy > 0) camera.rotateZ(Math.sin(state.clock.elapsedTime * 1.25) * THREE.MathUtils.degToRad(1.5) * heavy)
    // camera shake: layered sines (smooth, no luminance change)
    const sk = shake?.current ?? 0
    if (sk > 0.001) {
      const t = state.clock.elapsedTime
      const n1 = Math.sin(t * 7.3) * 0.6 + Math.sin(t * 13.1 + 1.3) * 0.4
      const n2 = Math.sin(t * 6.1 + 2.1) * 0.6 + Math.sin(t * 11.7 + 0.4) * 0.4
      const n3 = Math.sin(t * 5.3 + 4.2) * 0.6 + Math.sin(t * 9.9 + 2.2) * 0.4
      camera.position.addScaledVector(tmp.right, n1 * 0.07 * sk)
      camera.position.y += n2 * 0.05 * sk
      camera.rotateZ(n3 * THREE.MathUtils.degToRad(2.4) * sk)
      camera.rotateX(n2 * THREE.MathUtils.degToRad(1.1) * sk)
    }
    const fov = THREE.MathUtils.lerp(camera.fov, sprinting && loco.current.speed > 5 ? CAM.sprintFov : CAM.fov, Math.min(1, dt * 4))
    if (Math.abs(fov - camera.fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  })

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={spawn} enabledRotations={[false, false, false]}>
      <CapsuleCollider ref={collider} args={[0.5, 0.35]} position={[0, 0.85, 0]} />
      <group ref={facingGroup}>
        <AlexAvatar look={look} loco={loco} calm={calm} />
        {trail && (
          <Trail width={1.6} length={5} color={new THREE.Color(trail).multiplyScalar(2.2)} attenuation={(t) => t * t} decay={0.6}>
            <mesh position={[0, 1.15, 0]} visible={false}>
              <sphereGeometry args={[0.05, 4, 4]} />
            </mesh>
          </Trail>
        )}
      </group>
    </RigidBody>
  )
}
