import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

const BASE = import.meta.env.BASE_URL
export const PROP_IDS = [
  'mid_century_lounge_chair',
  'modern_arm_chair_01',
  'side_table_01',
  'coffee_table_round_01',
  'potted_plant_01',
  'potted_plant_02',
  'vintage_oil_lamp',
] as const
export type PropId = (typeof PROP_IDS)[number]
export const propUrl = (id: PropId) => `${BASE}assets/props/${id}.glb`
export const ROOM_HDRI = `${BASE}assets/env/anniversary_lounge_1k.hdr`

/** A CC0 Poly Haven model (see docs/CREDITS.md), cloned so it can appear more than once. */
export function Prop({ id, position, rotationY = 0, scale = 1 }: { id: PropId; position: [number, number, number]; rotationY?: number; scale?: number }) {
  const gltf = useGLTF(propUrl(id), false, true)
  const scene = useMemo(() => {
    const s = gltf.scene.clone(true)
    s.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = true
        m.receiveShadow = true
      }
    })
    return s
  }, [gltf])
  return <primitive object={scene} position={position} rotation={[0, rotationY, 0]} scale={scale} />
}

/**
 * Measures a chair model by ray-casting it (chair-local space, front = +Z):
 * the cushion height under the sitter and where the backrest starts.
 */
export function useChairSeat(id: PropId): { seatY: number; backZ: number } {
  const gltf = useGLTF(propUrl(id), false, true)
  return useMemo(() => {
    const scene = gltf.scene
    scene.updateMatrixWorld(true)
    const rc = new THREE.Raycaster()
    rc.set(new THREE.Vector3(0, 3, 0.06), new THREE.Vector3(0, -1, 0))
    const down = rc.intersectObject(scene, true).filter((h) => h.point.y < 0.75)
    const seatY = down.length ? down[0].point.y : 0.42
    rc.set(new THREE.Vector3(0, seatY + 0.3, 3), new THREE.Vector3(0, 0, -1))
    const back = rc.intersectObject(scene, true)
    const backZ = back.length ? back[0].point.z : -0.25
    return { seatY, backZ }
  }, [gltf, id])
}

export function preloadProps(): void {
  PROP_IDS.forEach((id) => useGLTF.preload(propUrl(id), false, true))
}
