import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

const BASE = import.meta.env.BASE_URL
export const CHARACTER_URLS = {
  alex: `${BASE}assets/characters/alex-body.glb`,
  therapist: `${BASE}assets/characters/therapist-body.glb`,
  hairLong: `${BASE}assets/characters/hair-long.glb`,
  hairParted: `${BASE}assets/characters/hair-parted.glb`,
  anims: `${BASE}assets/characters/anims.glb`,
} as const

export type CharacterKind = 'alex' | 'therapist'
export type HairKind = 'long' | 'parted' | 'none'

export interface CharacterInstance {
  /** Wrapper group: feet at y = 0, height normalized. Use as the AnimationMixer root. */
  root: THREE.Group
  body: THREE.SkinnedMesh
  hair: THREE.SkinnedMesh | null
  /** Eyes / eyebrows etc. */
  extras: THREE.SkinnedMesh[]
  headBone: THREE.Bone | null
}

const TARGET_HEIGHT = 1.7

function skinnedIn(obj: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = []
  obj.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh)
  })
  return out
}

/** Loads a Quaternius base character, attaches a hairstyle to its skeleton, normalizes its height. */
export function useCharacter(kind: CharacterKind, hair: HairKind): CharacterInstance {
  const hairUrl = hair === 'long' ? CHARACTER_URLS.hairLong : hair === 'parted' ? CHARACTER_URLS.hairParted : null
  const urls = hairUrl ? [CHARACTER_URLS[kind], hairUrl] : [CHARACTER_URLS[kind]]
  const gltfs = useGLTF(urls, false, true)

  return useMemo(() => {
    const scene = cloneSkinned(gltfs[0].scene)
    const meshes = skinnedIn(scene)
    const body = meshes.reduce((a, b) => (b.geometry.attributes.position.count > a.geometry.attributes.position.count ? b : a))
    const extras = meshes.filter((m) => m !== body)
    const boneByName = new Map(body.skeleton.bones.map((b) => [b.name, b]))

    let hairMesh: THREE.SkinnedMesh | null = null
    if (gltfs[1]) {
      const hairScene = cloneSkinned(gltfs[1].scene)
      const h = skinnedIn(hairScene)[0]
      if (h) {
        // Same rig as the body: re-point the hair at the body's bones so animations move it.
        const bones = h.skeleton.bones.map((b) => boneByName.get(b.name) ?? b)
        h.bind(new THREE.Skeleton(bones, h.skeleton.boneInverses), h.bindMatrix)
        h.removeFromParent()
        ;(body.parent ?? scene).add(h)
        hairMesh = h
      }
    }

    for (const m of [body, ...extras, ...(hairMesh ? [hairMesh] : [])]) {
      m.frustumCulled = false // skinned bounds don't follow animation
      m.castShadow = true
    }

    const root = new THREE.Group()
    root.add(scene)
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const height = Math.max(0.001, box.max.y - box.min.y)
    const s = TARGET_HEIGHT / height
    scene.scale.multiplyScalar(s)
    scene.position.y -= box.min.y * s
    const headBone = boneByName.get('Head') ?? null
    return { root, body, hair: hairMesh, extras, headBone }
  }, [gltfs])
}

export function useCharacterClips(): THREE.AnimationClip[] {
  return useGLTF(CHARACTER_URLS.anims, false, true).animations
}

export function preloadCharacters(): void {
  useGLTF.preload([CHARACTER_URLS.alex, CHARACTER_URLS.hairLong], false, true)
  useGLTF.preload(CHARACTER_URLS.anims, false, true)
}
