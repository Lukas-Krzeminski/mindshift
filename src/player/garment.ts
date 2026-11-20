import * as THREE from 'three'

/**
 * Builds loose, non-revealing clothing from a skinned base body:
 * the clothed part of the body surface is smoothed (Taubin smoothing removes anatomical
 * detail without shrinking), then inflated outward into a loose long sweater (down to
 * mid-thigh), trousers and shoes. It shares the body's skeleton, so it animates with it.
 * The body shader then hides everything except head, neck and hands.
 */

export const REGION = { skin: 0, top: 1, tunic: 2, pants: 3, shoes: 4 } as const

const SKIN_BONE = /^(neck_01|Head|hand_[lr]|(index|middle|pinky|ring|thumb)_0\d(_leaf)?_[lr])$/
const FOOT_BONE = /^(foot|ball|ball_leaf)_[lr]$/
const LEG_BONE = /^(thigh|calf)_[lr]$/

export interface GarmentColors {
  top: string
  pants: string
  shoes: string
}

function dominantJoint(si: THREE.BufferAttribute, sw: THREE.BufferAttribute, i: number): number {
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

export interface GarmentResult {
  mesh: THREE.SkinnedMesh
  /** Joint indices whose vertices stay visible on the body (head, neck, hands). */
  skinJoints: number[]
}

export interface GarmentOptions {
  /** 'light' = everyday fitted top + trousers (subtle smoothing, thin fabric); 'loose' = long baggy sweater. */
  fit?: 'light' | 'loose'
}

export function buildGarment(body: THREE.SkinnedMesh, colors: GarmentColors | null, material: THREE.Material, options: GarmentOptions = {}): GarmentResult {
  const light = (options.fit ?? 'light') === 'light'
  const src = body.geometry
  const pos = src.getAttribute('position') as THREE.BufferAttribute
  const si = src.getAttribute('skinIndex') as THREE.BufferAttribute
  const sw = src.getAttribute('skinWeight') as THREE.BufferAttribute
  const index = src.getIndex()
  const n = pos.count
  const bones = body.skeleton.bones

  const jointKind = bones.map((b) => (SKIN_BONE.test(b.name) ? 0 : FOOT_BONE.test(b.name) ? 3 : LEG_BONE.test(b.name) ? 2 : 1))
  const skinJoints = bones.map((_, j) => j).filter((j) => jointKind[j] === 0)

  // body "up" axis from feet to head, measured in geometry space (works for any export orientation)
  const head = new THREE.Vector3()
  const feet = new THREE.Vector3()
  let nh = 0
  let nf = 0
  const v = new THREE.Vector3()
  const kindOf = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const k = jointKind[dominantJoint(si, sw, i)]
    kindOf[i] = k
    v.fromBufferAttribute(pos, i)
    if (bones[dominantJoint(si, sw, i)]?.name === 'Head') {
      head.add(v)
      nh++
    }
    if (k === 3) {
      feet.add(v)
      nf++
    }
  }
  head.divideScalar(Math.max(1, nh))
  feet.divideScalar(Math.max(1, nf))
  const up = head.clone().sub(feet)
  const H = up.length()
  up.normalize()
  const heightOf = (p: THREE.Vector3) => p.clone().sub(feet).dot(up) / H

  // region per vertex: legs above mid-thigh belong to the long sweater ("tunic")
  const region = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const k = kindOf[i]
    v.fromBufferAttribute(pos, i)
    if (k === 0) region[i] = REGION.skin
    else if (k === 3) region[i] = REGION.shoes
    else if (k === 2) region[i] = !light && heightOf(v) > 0.4 ? REGION.tunic : REGION.pants
    else region[i] = REGION.top
  }

  // weld co-located vertices (UV seams) into nodes so smoothing never tears the surface
  const key = (i: number) => {
    const q = H * 1e-4
    return `${Math.round(pos.getX(i) / q)},${Math.round(pos.getY(i) / q)},${Math.round(pos.getZ(i) / q)}`
  }
  const nodeOf = new Int32Array(n)
  const nodeIndex = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    const k = key(i)
    let id = nodeIndex.get(k)
    if (id === undefined) {
      id = nodeIndex.size
      nodeIndex.set(k, id)
    }
    nodeOf[i] = id
  }
  const nodes = nodeIndex.size
  const nodePos = new Float32Array(nodes * 3)
  const nodeCount = new Float32Array(nodes)
  const nodeRegion = new Uint8Array(nodes)
  for (let i = 0; i < n; i++) {
    const id = nodeOf[i]
    nodePos[id * 3] += pos.getX(i)
    nodePos[id * 3 + 1] += pos.getY(i)
    nodePos[id * 3 + 2] += pos.getZ(i)
    nodeCount[id]++
    nodeRegion[id] = Math.max(nodeRegion[id], region[i] === REGION.skin ? 0 : region[i])
  }
  for (let id = 0; id < nodes; id++) for (let c = 0; c < 3; c++) nodePos[id * 3 + c] /= nodeCount[id]

  // triangles: keep every triangle that touches cloth, so the garment edge overlaps the visible
  // skin (no see-through gaps at neck and wrists); the skin-side edge nodes stay pinned to the body
  const tri = index ? (index.array as ArrayLike<number>) : Array.from({ length: n }, (_, i) => i)
  const kept: number[] = []
  const pinned = new Uint8Array(nodes)
  const garmentRegion = new Uint8Array(region)
  const adj: Set<number>[] = Array.from({ length: nodes }, () => new Set<number>())
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t]
    const b = tri[t + 1]
    const c = tri[t + 2]
    const clothedRegion = Math.max(region[a], region[b], region[c])
    if (clothedRegion === REGION.skin) continue
    kept.push(a, b, c)
    for (const x of [a, b, c]) {
      if (region[x] === REGION.skin) {
        pinned[nodeOf[x]] = 1
        garmentRegion[x] = Math.max(garmentRegion[x], clothedRegion)
        nodeRegion[nodeOf[x]] = Math.max(nodeRegion[nodeOf[x]], clothedRegion)
      }
    }
    const na = nodeOf[a]
    const nb = nodeOf[b]
    const nc = nodeOf[c]
    adj[na].add(nb).add(nc)
    adj[nb].add(na).add(nc)
    adj[nc].add(na).add(nb)
  }

  // Taubin smoothing (lambda/mu): removes anatomy detail, keeps volume
  const tmp = new Float32Array(nodes * 3)
  const pass = (factor: number) => {
    for (let id = 0; id < nodes; id++) {
      const nb = adj[id]
      if (pinned[id] || nb.size === 0) {
        tmp[id * 3] = nodePos[id * 3]
        tmp[id * 3 + 1] = nodePos[id * 3 + 1]
        tmp[id * 3 + 2] = nodePos[id * 3 + 2]
        continue
      }
      let ax = 0
      let ay = 0
      let az = 0
      for (const m of nb) {
        ax += nodePos[m * 3]
        ay += nodePos[m * 3 + 1]
        az += nodePos[m * 3 + 2]
      }
      const k = nb.size
      const strength = nodeRegion[id] === REGION.pants || nodeRegion[id] === REGION.shoes ? factor * 0.5 : factor
      tmp[id * 3] = nodePos[id * 3] + strength * (ax / k - nodePos[id * 3])
      tmp[id * 3 + 1] = nodePos[id * 3 + 1] + strength * (ay / k - nodePos[id * 3 + 1])
      tmp[id * 3 + 2] = nodePos[id * 3 + 2] + strength * (az / k - nodePos[id * 3 + 2])
    }
    nodePos.set(tmp)
  }
  for (let it = 0; it < (light ? 14 : 45); it++) {
    pass(0.62)
    pass(-0.64)
  }

  // ---- loose drape (light fit): the sweater front hangs like knit fabric, not skin ----
  // The front of the torso is rebuilt as a smooth curved panel from side seam to side seam:
  // no bust, no cleavage, no pecs; below the chest it falls straight instead of hugging the
  // waist. Arms get extra smoothing so muscles disappear. Nothing gets thicker overall.
  const nodeJoint = new Int32Array(nodes)
  for (let i = 0; i < n; i++) nodeJoint[nodeOf[i]] = dominantJoint(si, sw, i)
  const jointName = (id: number) => bones[nodeJoint[id]]?.name ?? ''
  const torso = new Uint8Array(nodes)
  const arm = new Uint8Array(nodes)
  for (let id = 0; id < nodes; id++) {
    if (nodeRegion[id] !== REGION.top) continue
    if (/^(spine_0[123]|pelvis|clavicle_[lr])$/.test(jointName(id))) torso[id] = 1
    else if (/^(upperarm|lowerarm)/.test(jointName(id))) arm[id] = 1
  }
  if (light) {
    // body frame in geometry space: up (feet to head), forward (ankle to toes), lateral
    const bindInv = body.bindMatrixInverse
    const bonePos = (name: string) => {
      const j = bones.findIndex((b) => b.name === name)
      if (j < 0) return null
      return new THREE.Vector3().applyMatrix4(new THREE.Matrix4().copy(body.skeleton.boneInverses[j]).invert()).applyMatrix4(bindInv)
    }
    const fwd = new THREE.Vector3()
    for (const side of ['l', 'r']) {
      const a = bonePos(`foot_${side}`)
      const b = bonePos(`ball_${side}`)
      if (a && b) fwd.add(b.sub(a))
    }
    fwd.addScaledVector(up, -fwd.dot(up))
    if (fwd.lengthSq() < 1e-10) fwd.set(0, 0, 1).addScaledVector(up, -up.z)
    fwd.normalize()
    const lat = new THREE.Vector3().crossVectors(up, fwd).normalize()

    // per-height slices of the torso
    const BIN = 0.015
    const hOf = new Float32Array(nodes)
    const sOf = new Float32Array(nodes)
    const fOf = new Float32Array(nodes)
    const pv = new THREE.Vector3()
    let hMin = Infinity
    let hMax = -Infinity
    for (let id = 0; id < nodes; id++) {
      if (!torso[id]) continue
      pv.fromArray(nodePos, id * 3).sub(feet)
      hOf[id] = pv.dot(up) / H
      sOf[id] = pv.dot(lat)
      fOf[id] = pv.dot(fwd)
      hMin = Math.min(hMin, hOf[id])
      hMax = Math.max(hMax, hOf[id])
    }
    const bins = Math.max(1, Math.ceil((hMax - hMin) / BIN) + 1)
    const binOf = (h: number) => Math.min(bins - 1, Math.max(0, Math.floor((h - hMin) / BIN)))
    const sLo = new Float32Array(bins).fill(Infinity)
    const sHi = new Float32Array(bins).fill(-Infinity)
    const fLo = new Float32Array(bins).fill(Infinity)
    for (let id = 0; id < nodes; id++) {
      if (!torso[id]) continue
      const b = binOf(hOf[id])
      sLo[b] = Math.min(sLo[b], sOf[id])
      sHi[b] = Math.max(sHi[b], sOf[id])
      fLo[b] = Math.min(fLo[b], fOf[id])
    }
    const cs = new Float32Array(bins)
    const wd = new Float32Array(bins)
    for (let b = 0; b < bins; b++) {
      if (!isFinite(sLo[b])) {
        sLo[b] = b > 0 ? sLo[b - 1] : 0
        sHi[b] = b > 0 ? sHi[b - 1] : 0
        fLo[b] = b > 0 ? fLo[b - 1] : 0
      }
      cs[b] = (sLo[b] + sHi[b]) / 2
      wd[b] = Math.max(1e-4, (sHi[b] - sLo[b]) / 2)
    }
    // side-seam depth (average of the outermost vertices) per slice
    const fSide = new Float32Array(bins)
    const nSide = new Float32Array(bins)
    for (let id = 0; id < nodes; id++) {
      if (!torso[id]) continue
      const b = binOf(hOf[id])
      if (Math.abs((sOf[id] - cs[b]) / wd[b]) > 0.8) {
        fSide[b] += fOf[id]
        nSide[b]++
      }
    }
    for (let b = 0; b < bins; b++) fSide[b] = nSide[b] ? fSide[b] / nSide[b] : b > 0 ? fSide[b - 1] : fLo[b]
    // centre-line (sternum / cleavage) depth: the front-most vertex near the middle of each slice
    const fCenter = new Float32Array(bins).fill(-Infinity)
    for (let id = 0; id < nodes; id++) {
      if (!torso[id]) continue
      const b = binOf(hOf[id])
      if (Math.abs((sOf[id] - cs[b]) / wd[b]) < 0.12 && fOf[id] > fSide[b]) fCenter[b] = Math.max(fCenter[b], fOf[id])
    }
    for (let b = 0; b < bins; b++) if (!isFinite(fCenter[b])) fCenter[b] = b > 0 ? fCenter[b - 1] : fSide[b]
    const smooth = (a: Float32Array, passes: number) => {
      const t = new Float32Array(a.length)
      for (let k = 0; k < passes; k++) {
        for (let b = 0; b < a.length; b++) t[b] = (a[Math.max(0, b - 1)] + 2 * a[b] + a[Math.min(a.length - 1, b + 1)]) / 4
        a.set(t)
      }
    }
    smooth(cs, 3)
    smooth(fSide, 3)
    // front depth measured from the side seam along the sternum line
    const depth = new Float32Array(bins)
    for (let b = 0; b < bins; b++) depth[b] = Math.max(0, fCenter[b] - fSide[b])
    smooth(depth, 2)
    const width = new Float32Array(wd)
    smooth(width, 2)
    // drape: walking down from the chest, depth and width may only shrink slowly
    let chestBin = 0
    for (let b = 0; b < bins; b++) if (depth[b] > depth[chestBin] && hMin + b * BIN < hMax - 0.06) chestBin = b
    for (let b = chestBin - 1; b >= 0; b--) {
      depth[b] = Math.max(depth[b], depth[b + 1] * 0.975)
      width[b] = Math.max(width[b], width[b + 1] * 0.985)
    }
    smooth(depth, 2)
    smooth(width, 2)

    for (let id = 0; id < nodes; id++) {
      if (!torso[id] || pinned[id]) continue
      const h = hOf[id]
      const b = binOf(h)
      // fade in below the shoulder line and out at the hips so the panel joins the rest smoothly
      const k = THREE.MathUtils.smoothstep(hMax - h, 0.015, 0.07) * THREE.MathUtils.smoothstep(h - hMin, 0.01, 0.06)
      if (k <= 0) continue
      const u = (sOf[id] - cs[b]) / wd[b]
      const sNew = cs[b] + u * width[b]
      let fNew = fOf[id]
      if (fOf[id] > fSide[b]) fNew = fSide[b] + depth[b] * Math.sqrt(Math.max(0, 1 - Math.min(1, u * u)))
      const ds = (sNew - sOf[id]) * k
      const df = (fNew - fOf[id]) * k
      nodePos[id * 3] += lat.x * ds + fwd.x * df
      nodePos[id * 3 + 1] += lat.y * ds + fwd.y * df
      nodePos[id * 3 + 2] += lat.z * ds + fwd.z * df
    }
  }
  // arms + torso: extra smoothing so muscles and panel edges melt into soft fabric
  const smoothNodes = (mask: Uint8Array, iterations: number) => {
    for (let it = 0; it < iterations; it++) {
      for (const factor of [0.6, -0.62]) {
        for (let id = 0; id < nodes; id++) {
          const nb = adj[id]
          if (!mask[id] || pinned[id] || nb.size === 0) {
            tmp.set(nodePos.subarray(id * 3, id * 3 + 3), id * 3)
            continue
          }
          let ax = 0
          let ay = 0
          let az = 0
          for (const m of nb) {
            ax += nodePos[m * 3]
            ay += nodePos[m * 3 + 1]
            az += nodePos[m * 3 + 2]
          }
          const kk = nb.size
          tmp[id * 3] = nodePos[id * 3] + factor * (ax / kk - nodePos[id * 3])
          tmp[id * 3 + 1] = nodePos[id * 3 + 1] + factor * (ay / kk - nodePos[id * 3 + 1])
          tmp[id * 3 + 2] = nodePos[id * 3 + 2] + factor * (az / kk - nodePos[id * 3 + 2])
        }
        nodePos.set(tmp)
      }
    }
  }
  if (light) {
    smoothNodes(arm, 26)
    smoothNodes(torso, 8)
  }

  // hems (neckline, cuffs): smooth each open edge loop so it reads as a clean line, not a zigzag
  const edgeUse = new Map<string, number>()
  const edgeKey = (p: number, q: number) => (p < q ? `${p}_${q}` : `${q}_${p}`)
  for (let t = 0; t < kept.length; t += 3) {
    const ids = [nodeOf[kept[t]], nodeOf[kept[t + 1]], nodeOf[kept[t + 2]]]
    for (let e = 0; e < 3; e++) {
      const k = edgeKey(ids[e], ids[(e + 1) % 3])
      edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1)
    }
  }
  const rim = new Map<number, number[]>()
  for (const [k, uses] of edgeUse) {
    if (uses !== 1) continue
    const [p, q] = k.split('_').map(Number)
    if (p === q) continue
    if (!rim.has(p)) rim.set(p, [])
    if (!rim.has(q)) rim.set(q, [])
    rim.get(p)!.push(q)
    rim.get(q)!.push(p)
  }
  const rimNodes = [...rim.entries()].filter(([, nb]) => nb.length === 2)
  for (let it = 0; it < 12; it++) {
    for (const [id, [p, q]] of rimNodes) {
      for (let c = 0; c < 3; c++) tmp[id * 3 + c] = nodePos[id * 3 + c] + 0.5 * ((nodePos[p * 3 + c] + nodePos[q * 3 + c]) / 2 - nodePos[id * 3 + c])
    }
    for (const [id] of rimNodes) for (let c = 0; c < 3; c++) nodePos[id * 3 + c] = tmp[id * 3 + c]
  }
  const isRim = new Uint8Array(nodes)
  for (const id of rim.keys()) isRim[id] = 1

  // node normals from the smoothed garment surface
  const nodeNormal = new Float32Array(nodes * 3)
  const pa = new THREE.Vector3()
  const pb = new THREE.Vector3()
  const pc = new THREE.Vector3()
  const fn = new THREE.Vector3()
  for (let t = 0; t < kept.length; t += 3) {
    const [a, b, c] = [nodeOf[kept[t]], nodeOf[kept[t + 1]], nodeOf[kept[t + 2]]]
    pa.fromArray(nodePos, a * 3)
    pb.fromArray(nodePos, b * 3)
    pc.fromArray(nodePos, c * 3)
    fn.subVectors(pc, pb).cross(pa.clone().sub(pb))
    for (const id of [a, b, c]) {
      nodeNormal[id * 3] += fn.x
      nodeNormal[id * 3 + 1] += fn.y
      nodeNormal[id * 3 + 2] += fn.z
    }
  }
  const INFLATE: Record<number, number> = light
    ? { [REGION.top]: 0.011, [REGION.tunic]: 0.009, [REGION.pants]: 0.008, [REGION.shoes]: 0.008 }
    : { [REGION.top]: 0.03, [REGION.tunic]: 0.042, [REGION.pants]: 0.017, [REGION.shoes]: 0.01 }
  const outPos = new Float32Array(n * 3)
  const outNormal = new Float32Array(n * 3)
  const outColor = new Float32Array(n * 3)
  const palette: Record<number, THREE.Color> = colors
    ? {
        [REGION.top]: new THREE.Color(colors.top),
        [REGION.tunic]: new THREE.Color(colors.top),
        [REGION.pants]: new THREE.Color(colors.pants),
        [REGION.shoes]: new THREE.Color(colors.shoes),
        [REGION.skin]: new THREE.Color(colors.top),
      }
    : {}
  const nrm = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    const id = nodeOf[i]
    nrm.fromArray(nodeNormal, id * 3).normalize()
    // keep the outward orientation consistent with the original surface normal
    const on = src.getAttribute('normal') as THREE.BufferAttribute
    if (on && nrm.dot(new THREE.Vector3().fromBufferAttribute(on, i)) < 0) nrm.negate()
    const base = INFLATE[nodeRegion[id]] ?? 0.02
    // hems hug the skin a little closer; the flattened chest gets back the volume it lost
    const inflate = base * H * (isRim[id] ? 0.55 : 1)
    outPos[i * 3] = nodePos[id * 3] + nrm.x * inflate
    outPos[i * 3 + 1] = nodePos[id * 3 + 1] + nrm.y * inflate
    outPos[i * 3 + 2] = nodePos[id * 3 + 2] + nrm.z * inflate
    outNormal[i * 3] = nrm.x
    outNormal[i * 3 + 1] = nrm.y
    outNormal[i * 3 + 2] = nrm.z
    const col = palette[garmentRegion[i]]
    if (col) col.toArray(outColor, i * 3)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(outPos, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(outNormal, 3))
  geo.setAttribute('skinIndex', si)
  geo.setAttribute('skinWeight', sw)
  if (colors) geo.setAttribute('color', new THREE.BufferAttribute(outColor, 3))
  const bindPos = new Float32Array(pos.array as ArrayLike<number>)
  geo.setAttribute('aBind', new THREE.BufferAttribute(bindPos, 3))
  geo.setIndex(kept)
  geo.computeBoundingSphere()

  const mesh = new THREE.SkinnedMesh(geo, material)
  mesh.bind(body.skeleton, body.bindMatrix)
  mesh.frustumCulled = false
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.name = `${body.name}_garment`
  return { mesh, skinJoints }
}

/**
 * GLSL to hide the body wherever the garment covers it. Inject into a skinned material:
 * vertex part after <skinning_vertex>, fragment part at the top of main.
 */
export function skinOnlyChunks(skinJoints: number[]): { vertexDecl: string; vertex: string; fragmentDecl: string; fragment: string } {
  const list = skinJoints.map((j) => `abs(bi - ${j.toFixed(1)}) < 0.5`).join(' || ')
  return {
    vertexDecl: 'varying float vCovered;',
    vertex: /* glsl */ `
      {
        float bw = skinWeight.x; float bi = skinIndex.x;
        if (skinWeight.y > bw) { bw = skinWeight.y; bi = skinIndex.y; }
        if (skinWeight.z > bw) { bw = skinWeight.z; bi = skinIndex.z; }
        if (skinWeight.w > bw) { bw = skinWeight.w; bi = skinIndex.w; }
        vCovered = (${list || 'false'}) ? 0.0 : 1.0;
      }`,
    fragmentDecl: 'varying float vCovered;',
    fragment: 'if (vCovered > 0.5) discard;',
  }
}
