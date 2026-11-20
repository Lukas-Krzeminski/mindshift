import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useCharacter, useCharacterClips, type CharacterKind, type HairKind } from '../../player/characterModel'
import { buildGarment, skinOnlyChunks, type GarmentColors } from '../../player/garment'
import { measureHead, headPointWorld, type HeadFrame } from '../../player/headFrame'
import { curlFingers, handWorldQuat, measureHand, setWorldQuat, solveTwoJoint, type HandFrame } from '../../lib/ik'

/** Body material that keeps the skin texture but hides everything the clothes cover. */
function makeSkinOnlyMaterial(src: THREE.MeshStandardMaterial, skinJoints: number[]): THREE.MeshStandardMaterial {
  const m = src.clone()
  m.roughness = 0.75
  m.metalness = 0
  const ch = skinOnlyChunks(skinJoints)
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${ch.vertexDecl}`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n${ch.vertex}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${ch.fragmentDecl}`)
      .replace('void main() {', `void main() {\n${ch.fragment}`)
  }
  m.customProgramCacheKey = () => `skin-only-${skinJoints.length}`
  return m
}

/** Soft knit fabric: vertex colors per garment part + a fine rib pattern. */
function makeClothMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, shadowSide: THREE.BackSide })
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aBind;\nvarying vec3 vBindPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBindPos = aBind;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBindPos;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float rib = 0.9 + 0.1 * sin(vBindPos.x * 420.0 + vBindPos.z * 300.0);
        diffuseColor.rgb *= rib;`,
      )
  }
  m.customProgramCacheKey = () => 'cloth-knit'
  return m
}

/** Skinned "x-ray" look: the body becomes a glowing glass outline (used to reveal the brain). */
function makeXrayMaterial(
  skinJoints?: number[],
  amount: { value: number } = { value: 0 },
): { material: THREE.MeshStandardMaterial; amount: { value: number } } {
  const m = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#000000' })
  // on the body, keep only head/neck/hands so the glass outline follows the clothes, not the anatomy
  const ch = skinJoints ? skinOnlyChunks(skinJoints) : null
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uX = amount
    if (ch) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${ch.vertexDecl}`)
        .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n${ch.vertex}`)
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uX;\n${ch ? ch.fragmentDecl : ''}`)
      .replace('void main() {', `void main() {\n${ch ? ch.fragment : ''}`)
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.4);
        gl_FragColor = vec4(vec3(0.45, 0.85, 1.0) * (fres * 1.6 + 0.04) * uX, 1.0);`,
      )
  }
  m.customProgramCacheKey = () => (ch ? `xray-skin-only-${skinJoints!.length}` : 'xray-skin')
  return { material: m, amount }
}

function ribTexture(color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 8
  const g = c.getContext('2d')!
  const base = new THREE.Color(color)
  for (let x = 0; x < 64; x++) {
    const k = 0.78 + 0.22 * Math.abs(Math.sin((x / 64) * Math.PI * 4))
    g.fillStyle = `#${base.clone().multiplyScalar(k).getHexString()}`
    g.fillRect(x, 0, 1, 8)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(10, 3)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Knit beanie built to the measured head. */
function SessionGear({ frame, xray }: { frame: HeadFrame; xray?: RefObject<number> }) {
  const { width: W, height: H, depth: D, eyeY } = frame
  const browY = eyeY + H * 0.12
  const topY = H / 2
  const mats = useMemo(
    () => ({
      knit: new THREE.MeshStandardMaterial({ map: ribTexture('#c98ea5'), roughness: 1 }),
      cuff: new THREE.MeshStandardMaterial({ map: ribTexture('#bd8098'), roughness: 1 }),
    }),
    [],
  )
  const group = useRef<THREE.Group>(null)
  useEffect(() => {
    const g = group.current
    if (!g) return
    g.matrixAutoUpdate = false
    g.matrix.copy(frame.matrix)
    frame.bone.add(g)
    return () => {
      frame.bone.remove(g)
    }
  }, [frame])
  useFrame(() => {
    if (group.current) group.current.visible = (xray?.current ?? 0) < 0.35
  })
  return (
    <group ref={group}>
      <group position={[0, browY, -D * 0.03]} rotation={[-0.14, 0, 0]}>
        <mesh material={mats.knit} scale={[(W / 2) * 1.1, (topY - browY) * 1.22, (D / 2) * 1.12]}>
          <sphereGeometry args={[1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh material={mats.cuff} position={[0, H * 0.03, 0]} scale={[(W / 2) * 1.12, 1, (D / 2) * 1.14]}>
          <cylinderGeometry args={[1, 1.01, H * 0.13, 48, 1, true]} />
        </mesh>
      </group>
    </group>
  )
}

/**
 * Pill moment, in head-size units (x toward HER LEFT, y from the eyes, z forward of the face).
 * Values come from measuring the whole motion in the browser: the elbow stays 18+ cm below the
 * shoulder, the wrist bends at most ~73 deg and twists at most ~45 deg (no joint turns more than
 * ~25 deg per 0.1 s), the pinch lands within 0.2 cm of the lips, and arm-vs-torso contact is a few
 * sleeve points at about 1.5 cm. (window.__reachTune can override them for re-tuning.)
 */
const REACH = {
  /** Wrist target: below and in front of the lips, so the fingers angle UP to the mouth. */
  t: [-0.1, -1, 0.6] as [number, number, number],
  /**
   * Elbow points down and out to her left: it stays well below the shoulder the whole time (an
   * elbow pointing up made the upper arm swing past straight-up and flip the forearm mid-reach).
   */
  pole: [3, -3, 0] as [number, number, number],
  /** The hand travels via this point (out to her left, in front of her chest), never across her lap. */
  via: [2.2, -2.2, 1.4] as [number, number, number],
  /** On the way up the elbow first flares out to her side by this much (metres). */
  flare: 0.2,
  /** Share of the hand's twist (about the forearm axis) carried by the forearm instead of the wrist. */
  twist: 0.65,
  /** Height the fingers point at, from the eyes (the lips are about -0.36; the pinch curls down onto them). */
  aim: -0.05,
}

export interface PersonRig {
  bones: Record<string, THREE.Bone>
  head: HeadFrame | null
  root: THREE.Object3D
}

export interface PersonProps {
  kind: CharacterKind
  hair: HairKind
  clip: string
  clothes: GarmentColors
  /** Root placement (feet level). */
  position: [number, number, number]
  rotation?: [number, number, number]
  /** World point where the pelvis should rest (seats the character on furniture). */
  seat?: [number, number, number]
  sessionGear?: boolean
  /** Hair colour (multiplies the strand texture). */
  hairColor?: string
  /** Eyebrow colour. */
  browColor?: string
  /** 0..1: hand reaches to the mouth (taking the capsule). */
  reach?: RefObject<number>
  /** 0..1: x-ray look revealing the brain. */
  xray?: RefObject<number>
  onRig?: (rig: PersonRig) => void
}

export function Person({ kind, hair, clip, clothes, position, rotation = [0, 0, 0], seat, sessionGear = false, hairColor, browColor, reach, xray, onRig }: PersonProps) {
  const character = useCharacter(kind, hair)
  const clips = useCharacterClips()
  const outer = useRef<THREE.Group>(null)

  const built = useMemo(() => {
    const bodySrc = character.body.material as THREE.MeshStandardMaterial
    const garment = buildGarment(character.body, clothes, makeClothMaterial())
    const bodyMat = makeSkinOnlyMaterial(bodySrc, garment.skinJoints)
    const head = measureHead(character.body, character.extras.find((m) => /eye/i.test(m.name) && !/brow/i.test(m.name)) ?? null)
    const xr = makeXrayMaterial()
    const xrBody = makeXrayMaterial(garment.skinJoints, xr.amount).material
    return { garment: garment.mesh, bodyMat, head, xr, xrBody, originals: new Map<THREE.Mesh, THREE.Material | THREE.Material[]>() }
  }, [character, clothes])

  // hair and eyebrows: tint the light strand textures (brown hair, near-black brows)
  useEffect(() => {
    const tint = (mesh: THREE.Mesh, color?: string) => {
      if (!color) return
      const m = (mesh.material as THREE.MeshStandardMaterial).clone()
      m.color.set(color)
      mesh.material = m
    }
    if (character.hair) tint(character.hair, hairColor)
    character.extras.filter((m) => /hair/i.test((m.material as THREE.Material).name)).forEach((m) => tint(m, browColor))
  }, [character, hairColor, browColor])

  useEffect(() => {
    character.body.material = built.bodyMat
    character.body.castShadow = true
    character.body.parent?.add(built.garment)
    const bones: Record<string, THREE.Bone> = {}
    character.body.skeleton.bones.forEach((b) => (bones[b.name] = b))
    onRig?.({ bones, head: built.head, root: character.root })
    return () => {
      built.garment.removeFromParent()
    }
    // onRig is a stable callback from the scene
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character, built])

  const mixer = useMemo(() => new THREE.AnimationMixer(character.root), [character])
  useEffect(() => {
    const c = clips.find((x) => x.name === clip)
    if (!c) return
    const a = mixer.clipAction(c)
    // full weight from the very first frame: the seat fit measures the real seated pose
    // (a fade-in would measure a half-standing pelvis and sink the body into the chair)
    a.reset().setEffectiveWeight(1).play()
    mixer.update(0)
    return () => {
      a.fadeOut(0.3)
    }
  }, [clips, clip, mixer])

  const fit = useRef({ frames: 0, done: !seat })
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), t: new THREE.Vector3(), pole: new THREE.Vector3() }), [])
  const xrayOn = useRef(false)
  const handFrame = useRef<HandFrame | null>(null)
  const armRest = useRef(new Map<THREE.Object3D, THREE.Quaternion>())
  const handTmp = useMemo(() => ({ mouth: new THREE.Vector3(), center: new THREE.Vector3(), poleEnd: new THREE.Vector3(), fwd: new THREE.Vector3(), palm: new THREE.Vector3(), goal: new THREE.Vector3(), via: new THREE.Vector3(), flare: new THREE.Vector3() }), [])
  const restWrist = useRef(new THREE.Vector3())
  const restElbow = useRef(new THREE.Vector3())
  const restOut = useRef(new THREE.Vector3(-1, 0, 0))
  // per-frame scratch quaternions for the hand
  const handQ = useMemo(() => ({ end: new THREE.Quaternion(), wristEnd: new THREE.Quaternion(), d: new THREE.Quaternion(), world: new THREE.Quaternion(), up: new THREE.Quaternion(), lo: new THREE.Quaternion() }), [])

  // The reach bends the arm and fingers on top of the seated clip. Each frame those bones first go
  // back to exactly where they were before last frame's bend: the clip does not rewrite every finger
  // joint, and a curl added on top of last frame's curl piles up (fingers flying in circles).
  const preIK = useRef(new Map<THREE.Object3D, THREE.Quaternion>())

  useFrame((_, dt) => {
    preIK.current.forEach((q, o) => o.quaternion.copy(q))
    mixer.update(Math.min(dt, 0.1))
    const bones = character.body.skeleton.bones
    // seat the character: move the root so the pelvis lands on the seat point
    if (!fit.current.done && outer.current) {
      fit.current.frames++
      if (fit.current.frames >= 3) {
        const pelvis = bones.find((b) => b.name === 'pelvis')
        if (pelvis && seat) {
          outer.current.updateMatrixWorld(true)
          pelvis.getWorldPosition(tmp.v)
          tmp.t.set(...seat).sub(tmp.v)
          outer.current.position.add(tmp.t)
          // never let the feet sink through the floor
          outer.current.updateMatrixWorld(true)
          let minY = Infinity
          for (const b of bones) {
            if (!/^(foot|ball)_[lr]$/.test(b.name)) continue
            b.getWorldPosition(tmp.v)
            minY = Math.min(minY, tmp.v.y)
          }
          if (minY < 0.035) outer.current.position.y += 0.035 - minY
        }
        fit.current.done = true
      }
    }
    // reach: left hand (nearest the side table) to the mouth, IK over the seated animation.
    // Every frame starts from the clip's own pose (see preIK above), so nothing accumulates and the
    // arm and fingers return cleanly afterwards.
    const r = reach?.current ?? 0
    if (built.head && (r > 0.001 || armRest.current.size)) {
      const by = (n: string) => bones.find((b) => b.name === n)
      const up = by('upperarm_l')
      const lo = by('lowerarm_l')
      const ha = by('hand_l')
      if (up && lo && ha) {
        if (!armRest.current.size) {
          handFrame.current = measureHand(ha, 'l')
          ha.getWorldPosition(restWrist.current)
          lo.getWorldPosition(restElbow.current)
          // outward = from her spine toward the resting elbow, level
          const spine = by('spine_02')
          if (spine) {
            spine.getWorldPosition(tmp.v)
            restOut.current.copy(restElbow.current).sub(tmp.v).setY(0).normalize()
          }
          const chain: THREE.Object3D[] = [up, lo, ha]
          ha.traverse((o) => o !== ha && chain.push(o))
          chain.forEach((o) => {
            armRest.current.set(o, o.quaternion.clone())
            preIK.current.set(o, new THREE.Quaternion())
          })
        }
        if (r <= 0.001) {
          armRest.current.clear()
          preIK.current.clear()
        } else {
          // remember the clip's pose of every bone we are about to bend (restored next frame)
          preIK.current.forEach((q, o) => q.copy(o.quaternion))
          const { height: H, depth: D, eyeY } = built.head
          up.updateMatrixWorld(true)
          const R = (window as unknown as { __reachTune?: typeof REACH }).__reachTune ?? REACH
          headPointWorld(built.head, tmp.v.set(H * R.t[0], eyeY + H * R.t[1], D * 0.5 + H * R.t[2]), handTmp.goal)
          headPointWorld(built.head, tmp.v.set(H * R.via[0], eyeY + H * R.via[1], D * 0.5 + H * R.via[2]), handTmp.via)
          headPointWorld(built.head, tmp.v.set(H * R.pole[0], H * R.pole[1], D * R.pole[2]), handTmp.poleEnd)
          const k = Math.min(1, r)
          const f = handFrame.current
          const restHand = armRest.current.get(ha)
          // Hand at the lips: fingers angled up to the mouth, palm toward her; index and thumb pinch
          // the capsule while the other fingers fold in (back of the hand faces the room). Work out
          // the wrist's bend for that: solve the arm at its end pose once, read the hand relative to
          // the forearm there, then put the arm back.
          if (f && restHand) {
            headPointWorld(built.head, tmp.v.set(0, eyeY + H * (R.aim ?? REACH.aim), D * 0.5), handTmp.mouth)
            headPointWorld(built.head, tmp.v.set(0, eyeY - H * 0.2, 0), handTmp.center)
            handTmp.fwd.copy(handTmp.mouth).sub(handTmp.goal)
            handTmp.palm.set(0, -1, 0).addScaledVector(handTmp.center.sub(handTmp.mouth).normalize(), 0.6)
            handWorldQuat(f, handTmp.fwd, handTmp.palm, handQ.end)
            handQ.up.copy(up.quaternion)
            handQ.lo.copy(lo.quaternion)
            solveTwoJoint(up, lo, ha, handTmp.goal, handTmp.poleEnd, 1)
            lo.getWorldQuaternion(handQ.wristEnd).invert().multiply(handQ.end)
            up.quaternion.copy(handQ.up)
            lo.quaternion.copy(handQ.lo)
            up.updateMatrixWorld(true)
          }
          // The wrist follows a curve: from her knee, out to her side and forward, then up to her
          // lips (a quadratic Bezier). IK runs at full strength along it with the elbow kept down and
          // out to her side, so neither the arm nor the hand passes through her body.
          handTmp.flare.copy(restElbow.current).addScaledVector(restOut.current, R.flare)
          tmp.pole.lerpVectors(handTmp.flare, handTmp.poleEnd, THREE.MathUtils.smoothstep(k, 0.15, 0.7))
          tmp.t
            .copy(restWrist.current)
            .multiplyScalar((1 - k) * (1 - k))
            .addScaledVector(handTmp.via, 2 * (1 - k) * k)
            .addScaledVector(handTmp.goal, k * k)
          solveTwoJoint(up, lo, ha, tmp.t, tmp.pole, Math.min(1, r * 10))
          if (f && restHand) {
            // The wrist blends straight from its resting bend to its bend at the lips, relative to the
            // forearm, so the hand just rides up with the arm: it can't spin or overshoot.
            ha.quaternion.slerp(handQ.wristEnd, THREE.MathUtils.smoothstep(k, 0.05, 0.95))
            ha.updateMatrixWorld(true)
            // A wrist can't twist about the forearm's own axis: in a real arm that turn (palm over)
            // happens along the forearm. So most of the hand's twist away from its resting angle is
            // moved into the forearm, and the wrist only bends.
            handQ.d.copy(restHand).invert().premultiply(ha.quaternion) // rest -> now, in the forearm's frame
            tmp.v.copy(ha.position).normalize() // forearm axis (the wrist sits on it)
            let twist = 2 * Math.atan2(handQ.d.x * tmp.v.x + handQ.d.y * tmp.v.y + handQ.d.z * tmp.v.z, handQ.d.w)
            if (twist > Math.PI) twist -= 2 * Math.PI
            if (twist < -Math.PI) twist += 2 * Math.PI
            ha.getWorldQuaternion(handQ.world)
            lo.quaternion.multiply(handQ.d.setFromAxisAngle(tmp.v, twist * (R.twist ?? REACH.twist)))
            lo.updateMatrixWorld(true)
            setWorldQuat(ha, handQ.world)
            const w = THREE.MathUtils.smoothstep(r, 0.45, 1)
            curlFingers(ha, f, { index: [0.35, 0.55, 0.4], middle: [0.95, 1.15, 0.75], ring: [1.05, 1.2, 0.8], pinky: [1.1, 1.2, 0.8] }, 'l', w)
          }
        }
      }
    }
    // x-ray swap
    const x = xray?.current ?? 0
    const meshes = [character.body, built.garment, ...character.extras, ...(character.hair ? [character.hair] : [])]
    if (x > 0.001 && !xrayOn.current) {
      xrayOn.current = true
      meshes.forEach((m) => {
        built.originals.set(m, m.material)
        m.material = m === character.body ? built.xrBody : built.xr.material
      })
    } else if (x <= 0.001 && xrayOn.current) {
      xrayOn.current = false
      meshes.forEach((m) => (m.material = built.originals.get(m) ?? m.material))
    }
    built.xr.amount.value = x
  })

  return (
    <group ref={outer} position={position} rotation={rotation}>
      <primitive object={character.root} />
      {sessionGear && built.head && <SessionGear frame={built.head} xray={xray} />}
    </group>
  )
}
