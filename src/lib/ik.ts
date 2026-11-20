import * as THREE from 'three'

/**
 * Two-joint IK for any Object3D chain (bones or groups): rotates `upper` and `lower`
 * so `end` reaches `target`, bending toward `pole`. `weight` blends from the current pose.
 */
export function solveTwoJoint(upper: THREE.Object3D, lower: THREE.Object3D, end: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3, weight: number): void {
  const S = upper.getWorldPosition(new THREE.Vector3())
  const E = lower.getWorldPosition(new THREE.Vector3())
  const H = end.getWorldPosition(new THREE.Vector3())
  const a = S.distanceTo(E)
  const b = E.distanceTo(H)
  const toT = target.clone().sub(S)
  const d = THREE.MathUtils.clamp(toT.length(), Math.abs(a - b) + 1e-4, a + b - 1e-4)
  const dir = toT.normalize()
  const cosA = (a * a + d * d - b * b) / (2 * a * d)
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA))
  const poleDir = pole.clone().sub(S)
  poleDir.addScaledVector(dir, -poleDir.dot(dir)).normalize()
  const elbow = S.clone().addScaledVector(dir, a * cosA).addScaledVector(poleDir, a * sinA)
  const aim = (joint: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) => {
    const jw = joint.getWorldPosition(new THREE.Vector3())
    const q = new THREE.Quaternion().setFromUnitVectors(from.clone().sub(jw).normalize(), to.clone().sub(jw).normalize())
    const worldQ = joint.getWorldQuaternion(new THREE.Quaternion())
    const parentQ = joint.parent ? joint.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion()
    const local = parentQ.invert().multiply(q.multiply(worldQ))
    joint.quaternion.slerp(local, weight)
    joint.updateMatrixWorld(true)
  }
  aim(upper, E, elbow)
  aim(lower, end.getWorldPosition(new THREE.Vector3()), target)
}

/**
 * Hand frame in hand-bone-local space, measured from the finger roots:
 * `fwd` toward the middle knuckle, `side` from pinky to index, `palm` out of the palm.
 */
export interface HandFrame {
  fwd: THREE.Vector3
  side: THREE.Vector3
  palm: THREE.Vector3
  /** +1 / -1: the rotation sign about `side` that curls fingers toward the palm. */
  curl: number
}

export function measureHand(hand: THREE.Bone, suffix: string): HandFrame | null {
  const child = (n: string) => hand.children.find((c) => c.name === `${n}_${suffix}`)
  const mid = child('middle_01')
  const idx = child('index_01')
  const pky = child('pinky_01')
  if (!mid || !idx || !pky) return null
  const fwd = mid.position.clone().normalize()
  const side = idx.position.clone().sub(pky.position)
  side.addScaledVector(fwd, -side.dot(fwd)).normalize()
  const palm = new THREE.Vector3().crossVectors(fwd, side).normalize()
  // in the seated idle the hands rest palm-down on the knees: make `palm` point down there
  const q = hand.getWorldQuaternion(new THREE.Quaternion())
  if (palm.clone().applyQuaternion(q).y > 0) palm.negate()
  const curl = fwd.clone().applyAxisAngle(side, 0.3).dot(palm) > 0 ? 1 : -1
  return { fwd, side, palm, curl }
}

const _m1 = new THREE.Matrix4()
const _m2 = new THREE.Matrix4()
const _q1 = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()

/**
 * World orientation that points the hand's fingers along `fwdWorld` with the palm facing
 * `palmWorld` (written to `out`).
 */
export function handWorldQuat(frame: HandFrame, fwdWorld: THREE.Vector3, palmWorld: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  const f = fwdWorld.clone().normalize()
  const p = palmWorld.clone().addScaledVector(f, -palmWorld.dot(f)).normalize()
  const local = _m1.makeBasis(frame.fwd, frame.palm, frame.fwd.clone().cross(frame.palm))
  const world = _m2.makeBasis(f, p, f.clone().cross(p))
  return out.setFromRotationMatrix(world.multiply(local.transpose()))
}

/** Gives a bone the world orientation `worldQ` (blended by `weight`). */
export function setWorldQuat(bone: THREE.Object3D, worldQ: THREE.Quaternion, weight = 1): void {
  const parentQ = bone.parent ? bone.parent.getWorldQuaternion(_q1) : _q1.identity()
  bone.quaternion.slerp(parentQ.invert().multiply(worldQ), weight)
  bone.updateMatrixWorld(true)
}

/**
 * Turns the hand so its fingers point along `fwdWorld` with the palm facing `palmWorld`,
 * then curls each finger chain by the given angles (radians per joint). `weight` blends.
 */
export function poseHand(hand: THREE.Bone, frame: HandFrame, fwdWorld: THREE.Vector3, palmWorld: THREE.Vector3, curls: Record<string, [number, number, number]>, suffix: string, weight: number): void {
  setWorldQuat(hand, handWorldQuat(frame, fwdWorld, palmWorld, new THREE.Quaternion()), weight)
  curlFingers(hand, frame, curls, suffix, weight)
}

/** Curls each finger chain about the knuckle axis by the given angles (radians per joint). */
export function curlFingers(hand: THREE.Bone, frame: HandFrame, curls: Record<string, [number, number, number]>, suffix: string, weight: number): void {
  const axis = frame.side.clone().applyQuaternion(hand.getWorldQuaternion(_q2)).normalize()
  for (const [finger, angles] of Object.entries(curls)) {
    for (let k = 0; k < 3; k++) {
      const bone = hand.getObjectByName(`${finger}_0${k + 1}_${suffix}`)
      if (!bone || !bone.parent) continue
      const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion())
      const spin = new THREE.Quaternion().setFromAxisAngle(axis, angles[k] * frame.curl * weight)
      bone.quaternion.premultiply(pq.clone().invert().multiply(spin).multiply(pq))
      bone.updateMatrixWorld(true)
    }
  }
}
