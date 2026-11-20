import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useCharacter, useCharacterClips } from './characterModel'
import { makeLuminousMaterial, type LuminousUniforms } from './luminousMaterial'
import type { Locomotion } from './playerState'

export type AvatarLook = 'positive' | 'challenging'

/** Clip names from the Universal Animation Library and their natural ground speed (m/s at timeScale 1). */
const CLIP = {
  idle: 'Idle_Loop',
  walk: 'Walk_Loop',
  jog: 'Jog_Fwd_Loop',
  sprint: 'Sprint_Loop',
  jumpStart: 'Jump_Start',
  jumpLoop: 'Jump_Loop',
  land: 'Jump_Land',
} as const
const NATURAL_SPEED = { walk: 1.55, jog: 3.7, sprint: 6.4 }

/**
 * Luminous "inner Alex" with a locomotion animation state machine:
 * idle / walk / jog / sprint blended by speed, plus jump start, loop and land.
 */
export function AlexAvatar({ look, loco, calm }: { look: AvatarLook; loco: RefObject<Locomotion>; calm?: RefObject<number> }) {
  const character = useCharacter('alex', look === 'positive' ? 'long' : 'long')
  const clips = useCharacterClips()

  const { bodyMat, hairMat, uniforms } = useMemo(() => {
    const normal = (character.body.material as THREE.MeshStandardMaterial).normalMap ?? null
    const body = makeLuminousMaterial(normal, 1)
    const hair = makeLuminousMaterial(null, 1.5)
    return { bodyMat: body.material, hairMat: hair.material, uniforms: [body.uniforms, hair.uniforms] as LuminousUniforms[] }
  }, [character])

  useEffect(() => {
    character.body.material = bodyMat
    character.extras.forEach((m) => (m.material = bodyMat))
    if (character.hair) character.hair.material = hairMat
  }, [character, bodyMat, hairMat])

  const mixer = useMemo(() => new THREE.AnimationMixer(character.root), [character])
  const actions = useMemo(() => {
    const byName = new Map(clips.map((c) => [c.name, c]))
    const make = (name: string, once = false) => {
      const clip = byName.get(name)
      if (!clip) return null
      const a = mixer.clipAction(clip)
      if (once) {
        a.setLoop(THREE.LoopOnce, 1)
        a.clampWhenFinished = true
      }
      return a
    }
    return {
      idle: make(CLIP.idle),
      walk: make(CLIP.walk),
      jog: make(CLIP.jog),
      sprint: make(CLIP.sprint),
      jumpStart: make(CLIP.jumpStart, true),
      jumpLoop: make(CLIP.jumpLoop),
      land: make(CLIP.land, true),
    }
  }, [clips, mixer])

  const current = useRef<THREE.AnimationAction | null>(null)
  useEffect(() => {
    actions.idle?.play()
    current.current = actions.idle
    return () => {
      mixer.stopAllAction()
    }
  }, [actions, mixer])

  const play = (next: THREE.AnimationAction | null, fade: number, timeScale = 1) => {
    if (!next) return
    next.timeScale = timeScale
    if (current.current === next) return
    next.reset().setEffectiveWeight(1).fadeIn(fade).play()
    current.current?.fadeOut(fade)
    current.current = next
  }

  useFrame((state, dt) => {
    const l = loco.current
    if (l) {
      if (!l.grounded) {
        if (l.sinceJump < 0.25) play(actions.jumpStart, 0.08)
        else play(actions.jumpLoop, 0.3)
      } else if (l.landing > 0) {
        play(actions.land, 0.08, 1.4)
      } else if (l.speed < 0.15) {
        play(actions.idle, 0.3)
      } else if (l.speed < 2.3) {
        play(actions.walk, 0.25, Math.max(0.6, l.speed / NATURAL_SPEED.walk))
      } else if (l.speed < 5.4) {
        play(actions.jog, 0.25, l.speed / NATURAL_SPEED.jog)
      } else {
        play(actions.sprint, 0.25, l.speed / NATURAL_SPEED.sprint)
      }
    }
    mixer.update(Math.min(dt, 0.1))
    const t = state.clock.elapsedTime
    for (const u of uniforms) {
      u.uTime.value = t
      u.uMode.value = THREE.MathUtils.lerp(u.uMode.value, look === 'challenging' ? 1 : 0, Math.min(1, dt * 2))
      u.uCalm.value = calm?.current ?? 0
    }
  })

  return <primitive object={character.root} />
}
