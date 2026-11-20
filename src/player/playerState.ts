import * as THREE from 'three'

/** Live player data shared with world logic (triggers, wisps, ripples) without React re-renders. */
export const player = {
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  facing: 0,
  grounded: true,
  speed: 0,
  /** False during cinematic reveals; true once the player can move. */
  active: false,
  /** Footstep events for ripple/sound systems: world position + time (seconds). */
  steps: [] as { x: number; z: number; t: number }[],
  /** Rehearsal/testing aid: set to move Alex instantly (consumed by the controller next frame). */
  teleportTo: null as { x: number; y: number; z: number; yaw?: number } | null,
}

export interface Locomotion {
  speed: number
  grounded: boolean
  airTime: number
  /** Seconds since the last jump started (large when not jumping). */
  sinceJump: number
  /** Seconds remaining of the landing animation. */
  landing: number
}
