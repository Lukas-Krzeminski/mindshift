import * as THREE from 'three'

export interface CamKey {
  t: number
  pos: [number, number, number]
  look: [number, number, number]
  fov?: number
}

const ease = (x: number) => x * x * (3 - 2 * x)

/** Smoothly interpolates a list of camera keyframes at time t (seconds). */
export function sampleCamera(keys: CamKey[], t: number, outPos: THREE.Vector3, outLook: THREE.Vector3): number {
  if (t <= keys[0].t) {
    outPos.set(...keys[0].pos)
    outLook.set(...keys[0].look)
    return keys[0].fov ?? 50
  }
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (t <= b.t) {
      const k = ease((t - a.t) / Math.max(0.0001, b.t - a.t))
      outPos.set(...a.pos).lerp(new THREE.Vector3(...b.pos), k)
      outLook.set(...a.look).lerp(new THREE.Vector3(...b.look), k)
      return THREE.MathUtils.lerp(a.fov ?? 50, b.fov ?? a.fov ?? 50, k)
    }
  }
  const last = keys[keys.length - 1]
  outPos.set(...last.pos)
  outLook.set(...last.look)
  return last.fov ?? 50
}
