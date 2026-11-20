import * as THREE from 'three'

/**
 * Measures a character's head from its actual mesh, in the Head bone's local space:
 * an orthonormal frame (x = right, y = up, z = forward/face) centered on the head,
 * plus its width/height/depth and eye level. Accessories built in this frame fit
 * the head exactly and follow it in every animation.
 */
export interface HeadFrame {
  bone: THREE.Bone
  /** Bone-local matrix of the head frame (basis + center). */
  matrix: THREE.Matrix4
  width: number
  height: number
  depth: number
  /** Eye level relative to the head center, along "up". */
  eyeY: number
}

function dominant(si: THREE.BufferAttribute, sw: THREE.BufferAttribute, i: number): number {
  let best = 0
  let w = -1
  for (let k = 0; k < 4; k++) {
    const wk = sw.getComponent(i, k)
    if (wk > w) {
      w = wk
      best = si.getComponent(i, k)
    }
  }
  return best
}

function centroidOf(mesh: THREE.SkinnedMesh, filter: (joint: number) => boolean): THREE.Vector3 {
  const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
  const si = mesh.geometry.getAttribute('skinIndex') as THREE.BufferAttribute
  const sw = mesh.geometry.getAttribute('skinWeight') as THREE.BufferAttribute
  const c = new THREE.Vector3()
  let n = 0
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    if (!filter(dominant(si, sw, i))) continue
    c.add(v.fromBufferAttribute(pos, i))
    n++
  }
  return c.divideScalar(Math.max(1, n))
}

export function measureHead(body: THREE.SkinnedMesh, eyes?: THREE.SkinnedMesh | null): HeadFrame | null {
  const bones = body.skeleton.bones
  const headIdx = bones.findIndex((b) => b.name === 'Head')
  if (headIdx < 0) return null
  const footIdx = new Set(bones.map((b, i) => (/^(foot|ball)_[lr]$/.test(b.name) ? i : -1)).filter((i) => i >= 0))

  // Work entirely in the Head bone's local space. Each mesh maps its own (quantized) geometry
  // space into that bone space through its own skeleton, so body and eyes always agree.
  const toLocal = new THREE.Matrix4().multiplyMatrices(body.skeleton.boneInverses[headIdx], body.bindMatrix)
  const headC = centroidOf(body, (j) => j === headIdx).applyMatrix4(toLocal)
  const feetC = centroidOf(body, (j) => footIdx.has(j)).applyMatrix4(toLocal)
  const up = headC.clone().sub(feetC).normalize()
  let eyesC = headC.clone().add(new THREE.Vector3(0, 0, 1))
  if (eyes) {
    const ei = eyes.skeleton.bones.findIndex((b) => b.name === 'Head')
    if (ei >= 0) {
      const eyesToLocal = new THREE.Matrix4().multiplyMatrices(eyes.skeleton.boneInverses[ei], eyes.bindMatrix)
      eyesC = centroidOf(eyes, () => true).applyMatrix4(eyesToLocal)
    }
  }
  const fwd = eyesC.clone().sub(headC)
  fwd.addScaledVector(up, -fwd.dot(up)).normalize()
  const right = new THREE.Vector3().crossVectors(up, fwd).normalize()

  const pos = body.geometry.getAttribute('position') as THREE.BufferAttribute
  const si = body.geometry.getAttribute('skinIndex') as THREE.BufferAttribute
  const sw = body.geometry.getAttribute('skinWeight') as THREE.BufferAttribute
  const min = new THREE.Vector3(Infinity, Infinity, Infinity)
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    if (dominant(si, sw, i) !== headIdx) continue
    v.fromBufferAttribute(pos, i).applyMatrix4(toLocal)
    const p = new THREE.Vector3(v.dot(right), v.dot(up), v.dot(fwd))
    min.min(p)
    max.max(p)
  }
  const centerFrame = min.clone().add(max).multiplyScalar(0.5)
  const center = right.clone().multiplyScalar(centerFrame.x).addScaledVector(up, centerFrame.y).addScaledVector(fwd, centerFrame.z)
  const eyeY = eyesC.dot(up) - centerFrame.y

  const matrix = new THREE.Matrix4().makeBasis(right, up, fwd).setPosition(center)
  return {
    bone: bones[headIdx],
    matrix,
    width: max.x - min.x,
    height: max.y - min.y,
    depth: max.z - min.z,
    eyeY,
  }
}

/** World position of a point given in head-frame coordinates (x right, y up, z forward). */
export function headPointWorld(frame: HeadFrame, local: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  return out.copy(local).applyMatrix4(frame.matrix).applyMatrix4(frame.bone.matrixWorld)
}
